/**
 * Base64url decode (no padding) → Uint8Array
 */
export function base64urlDecode(input: string): Uint8Array {
  // Convert base64url to standard base64
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding
  while (base64.length % 4 !== 0) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Hex-encode a Uint8Array
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
