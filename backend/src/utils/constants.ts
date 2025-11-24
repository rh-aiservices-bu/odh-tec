import * as path from 'path';
import './dotenv';

/**
 * Normalizes a path prefix to ensure it has a leading slash and no trailing slash.
 * Returns empty string if input is empty or only slashes.
 * @param prefix - The path prefix to normalize
 * @returns Normalized path prefix or empty string
 */
function normalizePathPrefix(prefix: string | undefined): string {
  if (!prefix) return '';

  // Remove all leading and trailing slashes
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');

  // If nothing left after trimming, return empty string
  if (!trimmed) return '';

  // Add leading slash, no trailing slash
  return `/${trimmed}`;
}

export const PORT = Number(process.env.PORT) || Number(process.env.BACKEND_PORT) || 8080;
export const IP = process.env.IP || '0.0.0.0';
export const LOG_LEVEL = process.env.FASTIFY_LOG_LEVEL || process.env.LOG_LEVEL || 'info';
export const LOG_DIR = path.join(__dirname, '../../../logs');
export const APP_ENV = process.env.APP_ENV;

/**
 * Whether to log health check requests (liveness/readiness probes).
 * Set to 'true' to enable health check logging (useful for debugging).
 * Defaults to false to reduce log noise in production.
 */
export const LOG_HEALTH_CHECKS = process.env.LOG_HEALTH_CHECKS === 'true';

/**
 * Whether to enable memory profiling logs for transfer operations.
 * Set to 'true' to enable detailed memory usage logging (useful for debugging).
 * Defaults to false to reduce log noise in production.
 */
export const ENABLE_MEMORY_PROFILER = process.env.ENABLE_MEMORY_PROFILER === 'true';

/**
 * URL path prefix for the application (e.g., '/notebook/namespace').
 * Used for serving the app behind path-based routing (Gateway API, Ingress, etc.).
 * Normalized to ensure leading slash and no trailing slash.
 * Defaults to empty string for root deployment.
 */
export const NB_PREFIX = normalizePathPrefix(process.env.NB_PREFIX);
