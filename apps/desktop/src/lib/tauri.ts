import { invoke } from '@tauri-apps/api/core';

export interface SignaturePlacement {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
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
  placements: SignaturePlacement[]
): Promise<string> {
  return invoke<string>('sign_document', {
    path,
    signaturePngBase64,
    signerName,
    signerEmail,
    placements,
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
}

export interface VerificationResult {
  isSignchainDocument: boolean;
  chainValid: boolean;
  signers: SignerVerification[];
}

export async function verifyDocument(path: string): Promise<VerificationResult> {
  return invoke<VerificationResult>('verify_document', { path });
}
