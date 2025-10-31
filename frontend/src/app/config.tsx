/**
 * Normalizes a path prefix to ensure it has a leading slash and no trailing slash.
 * Returns empty string if input is empty or only slashes.
 */
const normalizePathPrefix = (prefix: string | undefined): string => {
  if (!prefix) return '';

  // Remove all leading and trailing slashes
  const trimmed = prefix.replace(/^\/+|\/+$/g, '');

  // If nothing left after trimming, return empty string
  if (!trimmed) return '';

  // Add leading slash, no trailing slash
  return `/${trimmed}`;
};

// Get normalized path prefix from data attribute (injected by backend at runtime, CSP-safe)
const pathPrefix = normalizePathPrefix(document.documentElement.dataset.nbPrefix);

// Detect development mode: frontend runs on port 9000, backend on 8888
// In production, both frontend and backend run on the same port
const isDevelopment = window.location.port === '9000';
const backendPort = isDevelopment ? '8888' : window.location.port;

const config = {
  backend_api_url:
    window.location.protocol +
    '//' +
    window.location.hostname +
    (backendPort ? ':' + backendPort : '') +
    pathPrefix +
    '/api',
};

export default config;
