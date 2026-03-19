use anyhow::Result;
use lopdf::{Document, Object};

/// Strip volatile metadata to produce a deterministic PDF for hashing.
/// Removes: Producer, Creator, ModDate, CreationDate, XMP metadata, /ID array.
/// Operates on a Document in-place.
pub fn normalise_pdf(doc: &mut Document) -> Result<()> {
    // Remove Info dict metadata fields
    if let Ok(info_ref) = doc.trailer.get(b"Info") {
        if let Ok(id) = info_ref.as_reference() {
            if let Ok(Object::Dictionary(ref mut info)) = doc.get_object_mut(id) {
                info.remove(b"Producer");
                info.remove(b"Creator");
                info.remove(b"ModDate");
                info.remove(b"CreationDate");
            }
        }
    }

    // Remove /ID array from trailer
    doc.trailer.remove(b"ID");

    // Remove XMP metadata stream from catalog
    if let Ok(catalog_ref) = doc.trailer.get(b"Root") {
        if let Ok(id) = catalog_ref.as_reference() {
            if let Ok(Object::Dictionary(ref mut catalog)) = doc.get_object_mut(id) {
                catalog.remove(b"Metadata");
            }
        }
    }

    Ok(())
}
