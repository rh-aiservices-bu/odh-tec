/**
 * Error logging utilities to prevent CA certificate Buffers from appearing in logs.
 *
 * AWS SDK errors contain internal properties ($response, $metadata) that reference
 * HTTP sockets, which reference HTTPS agents with CA certificates. When these errors
 * are serialized for logging, the certificate Buffers are dumped to console.
 *
 * This module provides safe error logging that extracts only useful information.
 */

/**
 * Sanitize an error object for safe logging.
 * Extracts only useful properties without internal references to sockets/agents.
 *
 * @param error - Any error object (AWS SDK, Axios, native Error, etc.)
 * @returns Plain object with safe properties for logging
 */
export function sanitizeErrorForLogging(error: unknown): Record<string, any> {
  if (!error) {
    return { error: 'Unknown error' };
  }

  // Type guard for error-like objects
  const err = error as any;

  const safeError: Record<string, any> = {
    message: err.message || String(error),
    name: err.name,
  };

  // Add code if present (filesystem errors, AWS SDK errors, etc.)
  if (err.code) {
    safeError.code = err.code;
  }

  // AWS SDK specific metadata (without internal references)
  if (err.$metadata) {
    safeError.statusCode = err.$metadata.httpStatusCode;
    safeError.requestId = err.$metadata.requestId;
  }

  // Axios errors (HTTP client used for HuggingFace, etc.)
  if (err.response) {
    safeError.statusCode = err.response.status;
    safeError.statusText = err.response.statusText;
  } else if (err.status) {
    safeError.statusCode = err.status;
  }

  // Include first 3 lines of stack trace for debugging
  if (err.stack) {
    safeError.stack = err.stack.split('\n').slice(0, 3).join('\n');
  }

  return safeError;
}

/**
 * Create a clean error object without AWS SDK internal properties.
 * Use this when throwing errors to prevent socket/agent reference leaks.
 *
 * @param error - Original error (usually from AWS SDK)
 * @returns Clean Error object without internal references
 */
export function sanitizeError(error: unknown): Error {
  // Type guard for error-like objects
  const err = error as any;

  const cleanError = new Error(err.message || String(error));
  cleanError.name = err.name || 'Error';
  cleanError.stack = err.stack;

  // Preserve useful metadata as custom properties
  if (err.code) {
    (cleanError as any).code = err.code;
  }
  if (err.$metadata?.httpStatusCode) {
    (cleanError as any).statusCode = err.$metadata.httpStatusCode;
  }
  if (err.$metadata?.requestId) {
    (cleanError as any).requestId = err.$metadata.requestId;
  }

  return cleanError;
}
