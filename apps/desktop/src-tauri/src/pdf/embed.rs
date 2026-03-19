use anyhow::Result;
use base64::Engine;
use flate2::write::ZlibEncoder;
use flate2::Compression;
use image::{GenericImageView, Luma};
use lopdf::{
    content::{Content, Operation},
    dictionary, Document, Object, ObjectId, Stream,
};
use qrcode::QrCode;
use std::collections::BTreeMap;
use std::io::Write;

use crate::commands::pdf::SignaturePlacement;

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
    signer_name: &str,
    signer_email: &str,
    placements: &[SignaturePlacement],
) -> Result<()> {
    // Decode PNG once — reuse image data across all placements
    let sig_obj_id = add_png_image(doc, signature_png_base64)?;
    let signer_text = format!("Signed by: {} ({})", signer_name, signer_email);

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

        // Add signer text below the signature
        ops.push(Operation::new("BT", vec![]));
        ops.push(Operation::new(
            "Tf",
            vec!["Helv".into(), Object::Real(6.0)],
        ));
        ops.push(Operation::new(
            "Td",
            vec![
                Object::Real(sig_x),
                Object::Real(sig_y - 10.0),
            ],
        ));
        ops.push(Operation::new(
            "Tj",
            vec![Object::String(
                signer_text.clone().into_bytes(),
                lopdf::StringFormat::Literal,
            )],
        ));
        ops.push(Operation::new("ET", vec![]));

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
    let code = QrCode::new(tx_hash.as_bytes())?;
    let qr_image = code.render::<Luma<u8>>().min_dimensions(150, 150).build();
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

    for (idx, placement) in placements.iter().enumerate() {
        let target_page_id = page_ids
            .get(&placement.page_number)
            .copied()
            .ok_or_else(|| anyhow::anyhow!("Page {} not found", placement.page_number))?;

        // Place QR as a square matching the signature height, flush-right
        let qr_size = placement.height;
        let qr_x = placement.x + placement.width + 4.0;
        let qr_y = placement.y;

        let xobj_name = format!("QRImg{}", idx);

        let ops = vec![
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

            // Add QR XObject to resources with unique name
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
