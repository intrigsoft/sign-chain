import { base64urlDecode, toHex, decryptPayload } from '@sign-chain/crypto';
import type { VerifyApiResult, SignerPayload } from '@sign-chain/types';

// Hardcoded into the binary — this is the trust root
const API_BASE = 'https://signchain.app/api';

export type VerifyStatus = 'loading' | 'verified' | 'no-key' | 'error';

export interface VerifyState {
  status: VerifyStatus;
  error?: string;
  apiResult?: VerifyApiResult;
  signerPayload?: SignerPayload;
}

export async function verifyDocument(
  txHashB64: string,
  keyB64: string,
): Promise<VerifyState> {
  try {
    const txBytes = base64urlDecode(txHashB64);
    const txHash = '0x' + toHex(txBytes);

    const res = await fetch(`${API_BASE}/verify/${txHash}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Verification failed: ${text}`);
    }
    const apiResult: VerifyApiResult = await res.json();

    if (keyB64 && apiResult.encryptedPayload) {
      const keyBytes = base64urlDecode(keyB64);
      const json = await decryptPayload(keyBytes, apiResult.encryptedPayload);
      const signerPayload: SignerPayload = JSON.parse(json);
      return { status: 'verified', apiResult, signerPayload };
    }

    return { status: 'no-key', apiResult };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
