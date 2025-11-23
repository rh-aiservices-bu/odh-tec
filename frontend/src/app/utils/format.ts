/**
 * Formatting utilities for the ODH-TEC application.
 */

/**
 * Formats a byte value into a human-readable string with appropriate unit.
 * Uses binary units (1024-based) for calculation.
 *
 * @param bytes - The number of bytes to format (optional, defaults to 0)
 * @returns Formatted string with size and unit (e.g., "1.5 MB", "0 Bytes")
 *
 * @example
 * formatBytes(1024) // "1 KB"
 * formatBytes(1536) // "1.5 KB"
 * formatBytes(0) // "0 Bytes"
 * formatBytes() // "0 Bytes"
 */
export const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
};
