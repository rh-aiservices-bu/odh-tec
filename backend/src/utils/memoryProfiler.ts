/**
 * Memory Profiling Utility
 *
 * Provides tools to track and log memory usage during transfers.
 * Helps identify memory leaks and performance bottlenecks.
 *
 * Memory profiling is disabled by default and can be enabled by setting
 * the ENABLE_MEMORY_PROFILER environment variable to 'true'.
 */

import { ENABLE_MEMORY_PROFILER } from './constants';

export interface MemorySnapshot {
  timestamp: number;
  rss: number; // Resident Set Size (total memory allocated for process)
  heapTotal: number; // Total V8 heap size
  heapUsed: number; // Used V8 heap
  external: number; // C++ objects bound to JS objects
  arrayBuffers: number; // Memory allocated for ArrayBuffers and SharedArrayBuffers
}

let lastSnapshot: MemorySnapshot | null = null;

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Capture current memory snapshot
 */
function captureSnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    timestamp: Date.now(),
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers,
  };
}

/**
 * Log memory usage with optional label and delta calculation
 *
 * @param label - Descriptive label for this checkpoint
 * @returns Current memory snapshot (or dummy snapshot if profiler disabled)
 */
export function logMemory(label: string): MemorySnapshot {
  // Early return if memory profiler is disabled
  if (!ENABLE_MEMORY_PROFILER) {
    return {
      timestamp: Date.now(),
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    };
  }

  const snapshot = captureSnapshot();

  // Calculate deltas if we have a previous snapshot
  let deltaStr = '';
  if (lastSnapshot) {
    const rssDelta = snapshot.rss - lastSnapshot.rss;
    const heapDelta = snapshot.heapUsed - lastSnapshot.heapUsed;
    const timeDelta = snapshot.timestamp - lastSnapshot.timestamp;

    deltaStr = ` | Δ RSS: ${rssDelta >= 0 ? '+' : ''}${formatBytes(rssDelta)} | Δ Heap: ${
      heapDelta >= 0 ? '+' : ''
    }${formatBytes(heapDelta)} | Δ Time: ${timeDelta}ms`;
  }

  console.log(
    `[Memory] ${label.padEnd(40)} | RSS: ${formatBytes(snapshot.rss).padStart(
      9,
    )} | Heap: ${formatBytes(snapshot.heapUsed).padStart(9)}/${formatBytes(
      snapshot.heapTotal,
    ).padStart(9)} | External: ${formatBytes(snapshot.external).padStart(9)}${deltaStr}`,
  );

  lastSnapshot = snapshot;
  return snapshot;
}

/**
 * Start periodic memory logging
 *
 * @param intervalMs - Logging interval in milliseconds (default: 5000ms)
 * @param label - Optional label prefix for logs
 * @returns Timer handle (use with stopPeriodicLogging), or null if profiler disabled
 */
export function startPeriodicLogging(intervalMs = 5000, label = 'Periodic'): NodeJS.Timeout | null {
  // Return null if memory profiler is disabled
  if (!ENABLE_MEMORY_PROFILER) {
    return null;
  }

  console.log(`[Memory] Starting periodic logging every ${intervalMs}ms`);
  return setInterval(() => {
    logMemory(label);
  }, intervalMs);
}

/**
 * Stop periodic memory logging
 *
 * @param timer - Timer handle from startPeriodicLogging (can be null if profiler was disabled)
 */
export function stopPeriodicLogging(timer: NodeJS.Timeout | null): void {
  if (!timer) {
    // Timer was null because profiler was disabled - nothing to stop
    return;
  }

  clearInterval(timer);
  console.log('[Memory] Stopped periodic logging');
}
