use anyhow::Result;
use base64::Engine;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::{GenericImageView, Luma};
use lopdf::{
    content::{Content, Operation},
    dictionary, Document, Object, ObjectId, Stream,
};
use qrcode::{QrCode, Version, EcLevel};
use std::collections::BTreeMap;
use std::io::Write;

use crate::commands::pdf::{SignaturePlacement, TextFieldPlacement};

/// Extract the initial CTM (cm operator) from a page's first content stream and
/// return the inverse matrix [a, b, c, d, e, f]. If there is no initial cm or
/// the matrix is already the identity, returns None.
///
/// This is needed because some PDF generators (e.g. Microsoft Print to PDF) apply
/// a persistent transform like `[0.75, 0, 0, -0.75, 0, 1008] cm` at the very
/// start of the content stream. Appended content streams inherit this transform,
/// so we must undo it before placing our own objects.
pub fn compute_ctm_reset(
    doc: &Document,
    page_id: ObjectId,
) -> Result<Option<[f32; 6]>> {
    let page = doc
        .get_object(page_id)
        .and_then(|o| o.as_dict().map_err(Into::into))
        .ok()
        .ok_or_else(|| anyhow::anyhow!("Page not found"))?;

    // Get the first content stream reference
    let first_stream_id = match page.get(b"Contents") {
        Ok(Object::Array(arr)) => match arr.first() {
            Some(Object::Reference(id)) => *id,
            _ => return Ok(None),
        },
        Ok(Object::Reference(id)) => *id,
        _ => return Ok(None),
    };

    // Read and decode the stream
    let stream_content = doc.get_object(first_stream_id)
        .ok()
        .and_then(|obj| {
            if let Object::Stream(ref s) = *obj {
                // Try to decompress, fall back to raw bytes
                let mut s = s.clone();
                let _ = s.decompress();
                Some(s.content.clone())
            } else {
                None
            }
        });

    let Some(bytes) = stream_content else {
        return Ok(None);
    };

    // Parse content stream and find the very first operation
    let content = Content::decode(&bytes)?;
    let first_cm = content.operations.iter().find(|op| op.operator == "cm");

    let Some(cm) = first_cm else {
        return Ok(None);
    };

    if cm.operands.len() != 6 {
        return Ok(None);
    }

    let vals: Vec<f32> = cm
        .operands
        .iter()
        .map(|o| match o {
            Object::Real(r) => *r,
            Object::Integer(i) => *i as f32,
            _ => 0.0,
        })
        .collect();

    let [a, b, c, d, e, f] = [vals[0], vals[1], vals[2], vals[3], vals[4], vals[5]];

    // Check if already identity (no reset needed)
    if (a - 1.0).abs() < 1e-6
        && b.abs() < 1e-6
        && c.abs() < 1e-6
        && (d - 1.0).abs() < 1e-6
        && e.abs() < 1e-6
        && f.abs() < 1e-6
    {
        return Ok(None);
    }

    // Compute inverse: for [a,b,c,d,e,f], det = a*d - b*c
    let det = a * d - b * c;
    if det.abs() < 1e-9 {
        return Ok(None); // singular matrix, can't invert
    }

    let inv = [
        d / det,
        -b / det,
        -c / det,
        a / det,
        (c * f - d * e) / det,
        (b * e - a * f) / det,
    ];

    Ok(Some(inv))
}

/// Apply pre-computed CTM inverse matrices to reset the coordinate system on
/// target pages. Each entry in `ctm_inverses` is (page_number, inverse_matrix).
/// Must be called BEFORE embedding signatures/text/QR.
pub fn apply_ctm_resets(
    doc: &mut Document,
    page_ids: &BTreeMap<u32, ObjectId>,
    ctm_inverses: &[(u32, [f32; 6])],
) -> Result<()> {
    for &(page_num, inv) in ctm_inverses {
        let page_id = page_ids
            .get(&page_num)
            .copied()
            .ok_or_else(|| anyhow::anyhow!("Page {} not found", page_num))?;

        let ops = vec![Operation::new(
            "cm",
            vec![
                Object::Real(inv[0]),
                Object::Real(inv[1]),
                Object::Real(inv[2]),
                Object::Real(inv[3]),
                Object::Real(inv[4]),
                Object::Real(inv[5]),
            ],
        )];

        let content = Content { operations: ops };
        let content_bytes = content.encode()?;
        let content_id = doc.add_object(Stream::new(dictionary! {}, content_bytes));

        // Append the CTM reset stream to the page's Contents array
        if let Ok(Object::Dictionary(ref mut page)) = doc.get_object_mut(page_id) {
            let existing_contents = page.get(b"Contents").cloned();
            match existing_contents {
                Ok(Object::Array(mut arr)) => {
                    arr.push(Object::Reference(content_id));
                    page.set("Contents", Object::Array(arr));
                }
                Ok(existing) => {
                    page.set(
                        "Contents",
                        Object::Array(vec![existing, Object::Reference(content_id)]),
                    );
                }
                Err(_) => {
                    page.set("Contents", Object::Reference(content_id));
                }
            }
        }
    }

    Ok(())
}

/// Decode PNG base64 → raw RGB + alpha, compress with flate2, and add as PDF XObjects.
/// Returns (rgb_object_id) with SMask referencing the alpha channel.
fn add_png_image(doc: &mut Document, png_base64: &str) -> Result<lopdf::ObjectId> {
    let png_bytes = base64::engine::general_purpose::STANDARD.decode(png_base64)?;
    let img = image::load_from_memory(&png_bytes)?;
    let (w, h) = img.dimensions();
    let rgba = img.to_rgba8();

    // Separate RGB and Alpha channels
    let mut rgb_data = Vec::with_capacity((w * h * 3) as usize);
    let mut alpha_data = Vec::with_capacity((w * h) as usize);
    for pixel in rgba.pixels() {
        rgb_data.push(pixel[0]);
        rgb_data.push(pixel[1]);
        rgb_data.push(pixel[2]);
        alpha_data.push(pixel[3]);
    }

    // Compress both with zlib
    let rgb_compressed = zlib_compress(&rgb_data)?;
    let alpha_compressed = zlib_compress(&alpha_data)?;

    // Add alpha mask as SMask XObject
    let alpha_stream = Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Filter" => "FlateDecode",
            "Width" => Object::Integer(w as i64),
            "Height" => Object::Integer(h as i64),
            "ColorSpace" => "DeviceGray",
            "BitsPerComponent" => 8,
        },
        alpha_compressed,
    );
    let alpha_id = doc.add_object(alpha_stream);

    // Add main RGB image with SMask reference
    let sig_stream = Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Filter" => "FlateDecode",
            "Width" => Object::Integer(w as i64),
            "Height" => Object::Integer(h as i64),
            "ColorSpace" => "DeviceRGB",
            "BitsPerComponent" => 8,
            "SMask" => Object::Reference(alpha_id),
        },
        rgb_compressed,
    );
    let sig_id = doc.add_object(sig_stream);
    Ok(sig_id)
}

/// Compress bytes with zlib (FlateDecode).
fn zlib_compress(data: &[u8]) -> Result<Vec<u8>> {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(data)?;
    Ok(encoder.finish()?)
}

/// Embed signature blocks at the user-specified placements.
/// Operates on a Document in-place to avoid lossy round-trip serialization.
///
/// `page_ids` maps page numbers to object IDs. Callers should provide
/// `doc.get_pages()` for a normal Document, or
/// `inc_doc.get_prev_documents().get_pages()` for an IncrementalDocument.
pub fn embed_signature_block(
    doc: &mut Document,
    page_ids: &BTreeMap<u32, ObjectId>,
    signature_png_base64: &str,
    placements: &[SignaturePlacement],
) -> Result<()> {
    // Decode PNG once — reuse image data across all placements
    let sig_obj_id = add_png_image(doc, signature_png_base64)?;
    for (idx, placement) in placements.iter().enumerate() {
        let target_page_id = page_ids
            .get(&placement.page_number)
            .copied()
            .ok_or_else(|| anyhow::anyhow!("Page {} not found", placement.page_number))?;

        let sig_x = placement.x;
        let sig_y = placement.y;
        let sig_w = placement.width;
        let sig_h = placement.height;

        // Unique XObject name per placement (different pages may need their own resource entry)
        let xobj_name = format!("SigImg{}", idx);

        // Build content stream for this signature block
        let mut ops = Vec::new();
        ops.push(Operation::new("q", vec![]));

        // Place signature image
        ops.push(Operation::new("q", vec![]));
        ops.push(Operation::new(
            "cm",
            vec![
                Object::Real(sig_w),
                0.into(),
                0.into(),
                Object::Real(sig_h),
                Object::Real(sig_x),
                Object::Real(sig_y),
            ],
        ));
        ops.push(Operation::new("Do", vec![xobj_name.as_str().into()]));
        ops.push(Operation::new("Q", vec![]));

        ops.push(Operation::new("Q", vec![]));

        let content = Content { operations: ops };
        let content_bytes = content.encode()?;
        let content_id = doc.add_object(Stream::new(dictionary! {}, content_bytes));

        // Add XObject resources and content to the target page
        if let Ok(Object::Dictionary(ref mut page)) = doc.get_object_mut(target_page_id) {
            // Append content stream
            let existing_contents = page.get(b"Contents").cloned();
            match existing_contents {
                Ok(Object::Array(mut arr)) => {
                    arr.push(Object::Reference(content_id));
                    page.set("Contents", Object::Array(arr));
                }
                Ok(existing) => {
                    page.set(
                        "Contents",
                        Object::Array(vec![existing, Object::Reference(content_id)]),
                    );
                }
                Err(_) => {
                    page.set("Contents", Object::Reference(content_id));
                }
            }

            // Ensure Resources/XObject dict exists and add sig image with unique name
            let has_resources = page.get(b"Resources").is_ok();
            if has_resources {
                if let Ok(Object::Dictionary(ref mut resources)) = page.get_mut(b"Resources") {
                    let has_xobject = resources.get(b"XObject").is_ok();
                    if has_xobject {
                        if let Ok(Object::Dictionary(ref mut xobjects)) =
                            resources.get_mut(b"XObject")
                        {
                            xobjects.set(xobj_name, Object::Reference(sig_obj_id));
                        }
                    } else {
                        resources.set(
                            "XObject",
                            dictionary! {
                                xobj_name => Object::Reference(sig_obj_id),
                            },
                        );
                    }
                }
            } else {
                page.set(
                    "Resources",
                    dictionary! {
                        "XObject" => dictionary! {
                            xobj_name => Object::Reference(sig_obj_id),
                        },
                    },
                );
            }
        }
    }

    Ok(())
}

/// Check if a page dictionary already has a Helvetica font resource named "Helv".
fn page_has_helvetica_font(page: &lopdf::Dictionary) -> bool {
    page.get(b"Resources")
        .ok()
        .and_then(|r| match r {
            Object::Dictionary(d) => Some(d),
            _ => None,
        })
        .and_then(|res| res.get(b"Font").ok())
        .and_then(|f| match f {
            Object::Dictionary(d) => Some(d),
            _ => None,
        })
        .and_then(|fonts| fonts.get(b"Helv").ok())
        .is_some()
}

/// Add a Helvetica Type1 font reference to a page dictionary under the name "Helv".
fn add_helvetica_font_to_page(page: &mut lopdf::Dictionary, font_id: lopdf::ObjectId) {
    if page.get(b"Resources").is_err() {
        page.set("Resources", dictionary! {});
    }
    if let Ok(Object::Dictionary(ref mut resources)) = page.get_mut(b"Resources") {
        if resources.get(b"Font").is_err() {
            resources.set("Font", dictionary! {});
        }
        if let Ok(Object::Dictionary(ref mut fonts)) = resources.get_mut(b"Font") {
            fonts.set("Helv", Object::Reference(font_id));
        }
    }
}

/// Embed user-entered text fields at the specified placements.
/// Each text field is rendered as a content stream with BT/ET text operators.
pub fn embed_text_fields(
    doc: &mut Document,
    page_ids: &BTreeMap<u32, ObjectId>,
    text_fields: &[TextFieldPlacement],
) -> Result<()> {
    for field in text_fields.iter() {
        if field.text.is_empty() {
            continue;
        }

        let target_page_id = page_ids
            .get(&field.page_number)
            .copied()
            .ok_or_else(|| anyhow::anyhow!("Page {} not found", field.page_number))?;

        // Baseline offset: place text baseline slightly above the bottom of the bounding box
        let baseline_y = field.y + (field.font_size * 0.25);

        let mut ops = Vec::new();
        ops.push(Operation::new("q", vec![]));

        // Set text color to black
        ops.push(Operation::new(
            "rg",
            vec![
                Object::Real(0.0),
                Object::Real(0.0),
                Object::Real(0.0),
            ],
        ));

        ops.push(Operation::new("BT", vec![]));
        ops.push(Operation::new(
            "Tf",
            vec!["Helv".into(), Object::Real(field.font_size)],
        ));
        ops.push(Operation::new(
            "Td",
            vec![
                Object::Real(field.x),
                Object::Real(baseline_y),
            ],
        ));

        // Escape parentheses and backslashes for PDF literal string
        let escaped_text = field
            .text
            .replace('\\', "\\\\")
            .replace('(', "\\(")
            .replace(')', "\\)");

        ops.push(Operation::new(
            "Tj",
            vec![Object::String(
                escaped_text.into_bytes(),
                lopdf::StringFormat::Literal,
            )],
        ));

        ops.push(Operation::new("ET", vec![]));
        ops.push(Operation::new("Q", vec![]));

        let content = Content { operations: ops };
        let content_bytes = content.encode()?;
        let content_id = doc.add_object(Stream::new(dictionary! {}, content_bytes));

        // Check if page needs Helvetica font, and if so, create the font object first
        let needs_font = {
            if let Ok(Object::Dictionary(ref page)) = doc.get_object(target_page_id) {
                !page_has_helvetica_font(page)
            } else {
                false
            }
        };

        let font_id = if needs_font {
            let font_dict = dictionary! {
                "Type" => "Font",
                "Subtype" => "Type1",
                "BaseFont" => "Helvetica",
            };
            Some(doc.add_object(font_dict))
        } else {
            None
        };

        // Append content stream to page and add font resource
        if let Ok(Object::Dictionary(ref mut page)) = doc.get_object_mut(target_page_id) {
            let existing_contents = page.get(b"Contents").cloned();
            match existing_contents {
                Ok(Object::Array(mut arr)) => {
                    arr.push(Object::Reference(content_id));
                    page.set("Contents", Object::Array(arr));
                }
                Ok(existing) => {
                    page.set(
                        "Contents",
                        Object::Array(vec![existing, Object::Reference(content_id)]),
                    );
                }
                Err(_) => {
                    page.set("Contents", Object::Reference(content_id));
                }
            }

            if let Some(fid) = font_id {
                add_helvetica_font_to_page(page, fid);
            }
        }
    }

    Ok(())
}

/// Embed a QR code encoding the transaction hash at every placement.
/// Generates the QR image once, adds it as a single XObject, and places it
/// flush-right of each signature block.
///
/// `page_ids` maps page numbers to object IDs (see `embed_signature_block` for details).
pub fn embed_qr_with_tx(
    doc: &mut Document,
    page_ids: &BTreeMap<u32, ObjectId>,
    tx_hash: &str,
    placements: &[SignaturePlacement],
) -> Result<()> {

    // Generate QR code image once as raw grayscale pixels
    // Version 6 (41×41 modules), EC Level M (15% error recovery), 106 byte capacity
    let code = QrCode::with_version(tx_hash.as_bytes(), Version::Normal(6), EcLevel::M)?;
    let qr_image = code.render::<Luma<u8>>().min_dimensions(570, 570).build();
    // Flip horizontally — PDF image rendering can mirror due to inherited CTM
    let qr_image = image::imageops::flip_horizontal(&qr_image);
    let (qr_w, qr_h) = qr_image.dimensions();
    let raw_gray = qr_image.into_raw();
    let compressed = zlib_compress(&raw_gray)?;

    // Add QR image as a single XObject — referenced by all placements
    let qr_stream = Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Filter" => "FlateDecode",
            "BitsPerComponent" => 8,
            "Width" => Object::Integer(qr_w as i64),
            "Height" => Object::Integer(qr_h as i64),
            "ColorSpace" => "DeviceGray",
        },
        compressed,
    );
    let qr_obj_id = doc.add_object(qr_stream);

    // Pre-create a Helvetica font object for branding text
    let brand_font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica",
    });

    for (idx, placement) in placements.iter().enumerate() {
        let target_page_id = page_ids
            .get(&placement.page_number)
            .copied()
            .ok_or_else(|| anyhow::anyhow!("Page {} not found", placement.page_number))?;

        // Place QR as a square matching the signature height, minimum 34pt (~12mm)
        // Aligned to bottom of signature block
        let qr_size = placement.height.max(34.0);
        let qr_x = placement.x + placement.width + 4.0;
        let qr_y = placement.y; // bottom-aligned (PDF y=0 is bottom)

        let xobj_name = format!("QRImg{}", idx);

        // "Signed with SignChain" text below QR, right-aligned with QR pattern
        // QR quiet zone = 4 modules; V6 = 41+8 = 49 total modules in image
        let quiet_zone_frac = 4.0 / 49.0;
        let quiet_zone = qr_size * quiet_zone_frac;
        let inner_qr = qr_size - 2.0 * quiet_zone;
        let brand_font_size = (inner_qr / 10.0).max(3.0);
        let text_width = 20.0 * 0.5 * brand_font_size; // approx width of "Signed with SignChain"
        let brand_x = qr_x + quiet_zone + inner_qr - text_width; // right-align
        let brand_y = qr_y - brand_font_size - 2.0 + quiet_zone;

        let ops = vec![
            // Draw QR
            Operation::new("q", vec![]),
            Operation::new(
                "cm",
                vec![
                    Object::Real(qr_size),
                    0.into(),
                    0.into(),
                    Object::Real(qr_size),
                    Object::Real(qr_x),
                    Object::Real(qr_y),
                ],
            ),
            Operation::new("Do", vec![xobj_name.as_str().into()]),
            Operation::new("Q", vec![]),
            // Draw vertical branding text
            Operation::new("q", vec![]),
            Operation::new("BT", vec![]),
            Operation::new("Tf", vec!["Helv".into(), Object::Real(brand_font_size)]),
            Operation::new("rg", vec![0.6.into(), 0.6.into(), 0.6.into()]), // light gray
            // Horizontal text below QR (Tm sets text matrix: [sx 0 0 sy tx ty])
            // sx/sy = 1 since font size is already set by Tf
            Operation::new(
                "Tm",
                vec![
                    1.into(),
                    0.into(),
                    0.into(),
                    1.into(),
                    Object::Real(brand_x),
                    Object::Real(brand_y),
                ],
            ),
            Operation::new("Tj", vec![Object::string_literal("Signed with SignChain")]),
            Operation::new("ET", vec![]),
            Operation::new("Q", vec![]),
        ];

        let content = Content { operations: ops };
        let content_bytes = content.encode()?;
        let content_id = doc.add_object(Stream::new(dictionary! {}, content_bytes));

        if let Ok(Object::Dictionary(ref mut page)) = doc.get_object_mut(target_page_id) {
            // Append content stream
            let existing_contents = page.get(b"Contents").cloned();
            match existing_contents {
                Ok(Object::Array(mut arr)) => {
                    arr.push(Object::Reference(content_id));
                    page.set("Contents", Object::Array(arr));
                }
                Ok(existing) => {
                    page.set(
                        "Contents",
                        Object::Array(vec![existing, Object::Reference(content_id)]),
                    );
                }
                Err(_) => {
                    page.set("Contents", Object::Reference(content_id));
                }
            }

            // Add QR XObject and Helvetica font to resources
            let has_resources = page.get(b"Resources").is_ok();
            if has_resources {
                if let Ok(Object::Dictionary(ref mut resources)) = page.get_mut(b"Resources") {
                    let has_xobject = resources.get(b"XObject").is_ok();
                    if has_xobject {
                        if let Ok(Object::Dictionary(ref mut xobjects)) =
                            resources.get_mut(b"XObject")
                        {
                            xobjects.set(xobj_name, Object::Reference(qr_obj_id));
                        }
                    } else {
                        resources.set(
                            "XObject",
                            dictionary! {
                                xobj_name => Object::Reference(qr_obj_id),
                            },
                        );
                    }
                    // Ensure Helvetica font exists for branding text
                    if resources.get(b"Font").is_err() {
                        resources.set("Font", dictionary! {});
                    }
                    if let Ok(Object::Dictionary(ref mut fonts)) = resources.get_mut(b"Font") {
                        if fonts.get(b"Helv").is_err() {
                            fonts.set("Helv", Object::Reference(brand_font_id));
                        }
                    }
                }
            } else {
                page.set(
                    "Resources",
                    dictionary! {
                        "XObject" => dictionary! {
                            xobj_name => Object::Reference(qr_obj_id),
                        },
                    },
                );
            }
        }
    }

    Ok(())
}
