import { Transform } from 'stream';
import { Upload } from '@aws-sdk/lib-storage';

/**
 * Creates a throttled progress transform stream to prevent memory leaks.
 *
 * This prevents memory issues by:
 * 1. Throttling progress updates (only fires every `thresholdBytes`, not every chunk)
 * 2. Guaranteeing 100% completion via flush() handler
 * 3. Avoiding excessive event emissions that can cause EventEmitter bloat
 *
 * @param onProgress - Callback to invoke with current loaded bytes
 * @param thresholdBytes - Minimum bytes between progress updates (default: 1MB)
 * @returns Transform stream that reports throttled progress
 */
export function createProgressTransform(
  onProgress: (loaded: number) => void,
  thresholdBytes = 1024 * 1024, // 1MB default
): Transform {
  let loaded = 0;
  let lastReported = 0;

  return new Transform({
    transform(chunk, encoding, callback) {
      loaded += chunk.length;

      // Only report progress when threshold is reached
      if (loaded - lastReported >= thresholdBytes) {
        onProgress(loaded);
        lastReported = loaded;
      }

      callback(null, chunk);
    },
    flush(callback) {
      // Ensure final 100% progress is always reported
      if (loaded > lastReported) {
        onProgress(loaded);
      }
      callback();
    },
  });
}

/**
 * Wraps AWS SDK Upload with automatic event listener cleanup to prevent memory leaks.
 *
 * The AWS SDK Upload class is an EventEmitter. Without proper cleanup, event listeners
 * remain attached after upload completion, causing memory leaks that accumulate with
 * each file transfer.
 *
 * This wrapper ensures:
 * 1. Event listeners are properly registered before upload
 * 2. Event listeners are removed in finally block (even if upload fails)
 * 3. No dangling references prevent garbage collection
 *
 * @param upload - AWS SDK Upload instance
 * @param onProgress - Optional callback for upload progress (receives bytes loaded)
 * @returns Promise that resolves when upload completes
 */
export async function uploadWithCleanup(
  upload: Upload,
  onProgress?: (loaded: number) => void,
): Promise<void> {
  const listener = onProgress
    ? (progress: { loaded?: number }) => {
        onProgress(progress.loaded || 0);
      }
    : undefined;

  try {
    if (listener) {
      upload.on('httpUploadProgress', listener);
    }
    await upload.done();
  } finally {
    // Critical: Remove event listener to prevent memory leak
    if (listener) {
      upload.removeAllListeners('httpUploadProgress');
    }
  }
}
