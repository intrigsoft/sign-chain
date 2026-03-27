import { base64urlDecode } from './base64url.js';

/**
 * Decrypt AES-128-GCM ciphertext.
 * Ciphertext format: nonce(12) || encrypted || tag(16)
 * Returns the decrypted plaintext as a string.
 */
export async function decryptPayload(
  keyBytes: Uint8Array,
  ciphertextB64: string,
): Promise<string> {
  const ciphertext = base64urlDecode(ciphertextB64);

  const nonce = ciphertext.slice(0, 12);
  const encrypted = ciphertext.slice(12);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encrypted,
  );

  return new TextDecoder().decode(plaintext);
}
