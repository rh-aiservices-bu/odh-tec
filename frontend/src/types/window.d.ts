/**
 * Global window object extensions for runtime configuration
 */

interface Window {
  /**
   * URL path prefix injected by backend at runtime.
   * Used for serving the app under a subpath (e.g., '/notebook/namespace').
   * Undefined or empty string for root deployment.
   */
  NB_PREFIX?: string;
}
