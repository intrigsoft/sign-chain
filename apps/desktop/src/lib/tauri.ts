import { invoke } from '@tauri-apps/api/core';

export interface SignaturePlacement {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TauriTextFieldPlacement {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fieldType: string;
}

export async function openPdfPicker(): Promise<string | null> {
  return invoke<string | null>('open_pdf_picker');
}

export async function getPdfPageCount(path: string): Promise<number> {
  return invoke<number>('get_pdf_page_count', { path });
}

export async function signDocument(
  path: string,
  signaturePngBase64: string,
  signerName: string,
  signerEmail: string,
  signerType: string,
  signerCompany: string | undefined,
  signerPosition: string | undefined,
  geoLat: number | undefined,
  geoLon: number | undefined,
  placements: SignaturePlacement[],
  textFields: TauriTextFieldPlacement[]
): Promise<string> {
  return invoke<string>('sign_document', {
    path,
    signaturePngBase64,
    signerName,
    signerEmail,
    signerType,
    signerCompany: signerCompany ?? null,
    signerPosition: signerPosition ?? null,
    geoLat: geoLat ?? null,
    geoLon: geoLon ?? null,
    placements,
    textFields,
  });
}

export async function saveSignedPdf(
  tempPath: string,
): Promise<string | null> {
  return invoke<string | null>('save_signed_pdf', { tempPath });
}

export async function listDocuments(): Promise<
  { id: string; filename: string; status: string; createdAt: string }[]
> {
  return invoke('list_documents');
}

export interface SignerVerification {
  signer: string;
  email: string;
  timestamp: string;
  hash: string;
  status: 'valid' | 'tampered' | 'unverifiable';
  blockchainVerified: boolean | null;
}

export interface VerificationResult {
  isSignchainDocument: boolean;
  chainValid: boolean;
  signers: SignerVerification[];
}

export async function verifyDocument(path: string): Promise<VerificationResult> {
  return invoke<VerificationResult>('verify_document', { path });
}

export async function extractRevision(
  path: string,
  signerIndex: number | null,
): Promise<string> {
  return invoke<string>('extract_revision', { path, signerIndex });
}
