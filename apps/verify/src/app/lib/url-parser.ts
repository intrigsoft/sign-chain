/**
 * Parse a SignChain verification URL.
 * Expected format: https://signchain.app/v/{txHashB64}#{keyB64}
 * Also accepts: signchain://verify/{txHashB64}#{keyB64}
 */
export interface ParsedVerifyUrl {
  txHashB64: string;
  keyB64: string;
}

export function parseVerifyUrl(url: string): ParsedVerifyUrl | null {
  try {
    // Handle custom scheme: signchain://verify/{txHashB64}
    if (url.startsWith('signchain://')) {
      const withoutScheme = url.replace('signchain://', '');
      const [pathAndFragment] = [withoutScheme];
      const hashIndex = pathAndFragment.indexOf('#');
      const path = hashIndex >= 0 ? pathAndFragment.slice(0, hashIndex) : pathAndFragment;
      const fragment = hashIndex >= 0 ? pathAndFragment.slice(hashIndex + 1) : '';

      // path should be "verify/{txHashB64}"
      const segments = path.split('/').filter(Boolean);
      if (segments.length >= 2 && segments[0] === 'verify') {
        return { txHashB64: segments[1], keyB64: fragment };
      }
      // Also accept just the hash directly: signchain://{txHashB64}
      if (segments.length === 1) {
        return { txHashB64: segments[0], keyB64: fragment };
      }
      return null;
    }

    // Handle https URLs
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split('/').filter(Boolean);

    // Expect /v/{txHashB64}
    if (pathSegments.length >= 2 && pathSegments[0] === 'v') {
      return {
        txHashB64: pathSegments[1],
        keyB64: parsed.hash.slice(1), // strip leading #
      };
    }

    return null;
  } catch {
    return null;
  }
}
