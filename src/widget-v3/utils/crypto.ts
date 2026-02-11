/**
 * HCS-U7 Widget v3 — Crypto utilities
 * No secrets in widget. Only hashing for fingerprinting.
 */

/** DJB2 hash — fast, non-cryptographic. OK for fingerprint dedup only. */
export function djb2(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** FNV-1a 32-bit — better distribution than DJB2 for short strings */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) | 0;
  }
  return hash >>> 0;
}

/** Base64url decode (no dependencies) */
export function base64urlDecode(str: string): string | null {
  try {
    const padded = str + '===='.substring(0, (4 - (str.length % 4)) % 4);
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    return null;
  }
}

/** Mask an ID for safe logging: "abcd...xyz" */
export function maskId(id: string | null | undefined): string {
  if (!id || id.length < 8) return '***';
  return id.substring(0, 4) + '...' + id.substring(id.length - 3);
}

/**
 * Encode a payload object into an opaque base64 string.
 * Prevents casual inspection of request body in DevTools Network tab.
 * NOT encryption — just obfuscation to hide field names and signal strings.
 */
export function encodePayload(data: unknown): string {
  const json = JSON.stringify(data);
  // Simple XOR obfuscation + base64 to prevent casual reading
  const key = 0x5A; // Fixed XOR key (not secret, just obfuscation)
  const bytes = new Uint8Array(json.length);
  for (let i = 0; i < json.length; i++) {
    bytes[i] = json.charCodeAt(i) ^ key;
  }
  // Convert to base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Hash a signal name to a short opaque code.
 * Prevents attackers from reading detection strategy in payloads.
 */
export function hashSignal(signal: string): string {
  return 's' + fnv1a(signal).toString(36);
}
