/**
 * Unicode-safe base64 encoding utilities
 *
 * These functions replace the native btoa()/atob() which only support Latin1 characters.
 * They handle full Unicode (UTF-8) character sets, allowing file paths with accents,
 * emoji, CJK characters, etc.
 */

/**
 * Encodes a string to base64, supporting full Unicode (UTF-8) characters
 *
 * @param str - The string to encode (can contain any Unicode characters)
 * @returns Base64-encoded string
 *
 * @example
 * base64Encode("Capture d'écran.png") // Works with accented characters
 * base64Encode("文件.txt") // Works with CJK characters
 * base64Encode("file.txt") // Works with ASCII (backward compatible)
 */
export function base64Encode(str: string): string {
  // Convert string to UTF-8 bytes, then to base64
  // TextEncoder converts to UTF-8 byte array
  const bytes = new TextEncoder().encode(str);

  // Convert bytes to binary string for btoa
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }

  // Now we can safely use btoa on the binary string
  return btoa(binaryString);
}

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
    // Decode base64 to binary string
    const binaryString = atob(base64Str);

    // Convert binary string to byte array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode UTF-8 bytes back to string
    return new TextDecoder().decode(bytes);
  } catch (error) {
    throw new Error(`Failed to decode base64 string: ${error instanceof Error ? error.message : String(error)}`);
  }
}
