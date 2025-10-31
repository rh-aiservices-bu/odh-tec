/**
 * Unicode-safe base64 decoding utility
 *
 * This function replaces the native atob() which only supports Latin1 characters.
 * It handles full Unicode (UTF-8) character sets, allowing file paths with accents,
 * emoji, CJK characters, etc.
 */

/**
 * Decodes a base64 string to its original Unicode string
 *
 * @param base64Str - The base64-encoded string to decode
 * @returns Decoded Unicode string
 * @throws Error if the input is not valid base64
 *
 * @example
 * base64Decode("Q2FwdHVyZSBkJ8OpY3Jhbi5wbmc=") // Returns "Capture d'écran.png"
 */
export function base64Decode(base64Str: string): string {
  try {
    // Buffer handles UTF-8 decoding natively
    // eslint-disable-next-line no-restricted-syntax
    return Buffer.from(base64Str, 'base64').toString('utf-8');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to decode base64 string: ${errorMsg}`);
  }
}
