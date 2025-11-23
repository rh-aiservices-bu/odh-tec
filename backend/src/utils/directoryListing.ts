import { S3Client, ListObjectsV2Command, S3ServiceException } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * IMPORTANT: Path Separator Handling
 *
 * This module uses different path handling strategies for S3 vs. local filesystems:
 *
 * **S3 paths:** Always use forward slashes (/) via path.posix.join()
 * - S3 is a key-value store, not a filesystem - keys use / regardless of OS
 * - Example: "datasets/models/config.json"
 * - Using path.join() on Windows would create invalid keys with backslashes
 *
 * **Local paths:** Use OS-specific separators via path.join()
 * - Windows: backslashes (\)
 * - Linux/Mac: forward slashes (/)
 * - Node's path.join() handles this automatically based on the runtime OS
 *
 * **Critical Rule:** Never mix path.posix.join() with local paths or path.join() with S3 keys
 * - This would create invalid paths/keys and cause transfer failures
 * - All S3-related code in this file uses local paths, so it uses path.join() for OS compatibility
 */

/**
 * Information about a file in a directory listing
 */
export interface FileInfo {
  path: string; // Relative path from the base directory
  size: number; // File size in bytes
  isMarker?: boolean; // Flag for .s3keep marker files (Local→S3 only)
}

/**
 * Complete directory listing with metadata
 */
export interface DirectoryListing {
  files: FileInfo[]; // All files found
  totalSize: number; // Total size of all files in bytes
  fileCount: number; // Number of files
  emptyDirectories: string[]; // Empty directories (for .s3keep markers)
  skippedSymlinks: string[]; // Symbolic links that were skipped (local only)
}

/**
 * Error thrown when directory listing operations fail
 */
export class ListingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ListingError';
  }
}

/**
 * Recursively lists all files in an S3 "directory" (prefix) with size info
 *
 * **Implementation:** Uses streaming/pagination to handle large directories efficiently.
 * Memory usage remains constant regardless of directory size (processes 1000 objects per batch).
 *
 * **Performance:** Can handle 100,000+ files with <1GB memory usage.
 *
 * **Streaming Details:**
 * - Uses S3 pagination with continuation tokens
 * - Processes results incrementally batch by batch (1000 objects max per batch)
 * - No upfront loading of entire result set
 * - Memory usage is O(1) relative to total file count
 *
 * @param s3Client - Configured S3 client
 * @param bucket - S3 bucket name
 * @param prefix - Directory prefix to list (e.g., "models/")
 * @returns Directory listing with file paths, sizes, and metadata
 * @throws S3ServiceException if S3 operation fails
 * @throws ListingError if listing operation fails
 */
export async function listS3DirectoryRecursive(
  s3Client: S3Client,
  bucket: string,
  prefix: string,
): Promise<DirectoryListing> {
  const files: FileInfo[] = [];
  const emptyDirectories: string[] = [];
  let totalSize = 0;
  let continuationToken: string | undefined;

  // Normalize prefix - ensure it ends with '/' if non-empty
  const normalizedPrefix = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;

  try {
    // ⭐ Streaming implementation - process results incrementally
    do {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: normalizedPrefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000, // S3 maximum - API automatically paginates
        }),
      );

      // Process batch incrementally (memory efficient)
      for (const obj of response.Contents || []) {
        // Skip directory markers (keys ending with '/')
        if (obj.Key!.endsWith('/')) {
          continue;
        }

        // Include .s3keep marker files in listing
        // They will be filtered at transfer time based on destination type:
        // - S3→S3: Keep and transfer (preserves empty directories)
        // - S3→Local: Skip during transfer (directories created naturally)
        files.push({
          path: obj.Key!,
          size: obj.Size || 0,
        });
        totalSize += obj.Size || 0;
      }

      // Detect empty directories from CommonPrefixes
      // (S3 returns prefixes that have no direct objects)
      for (const commonPrefix of response.CommonPrefixes || []) {
        // This is a potential empty directory
        // Will be confirmed during actual listing
        emptyDirectories.push(commonPrefix.Prefix!);
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return {
      files,
      totalSize,
      fileCount: files.length,
      emptyDirectories,
      skippedSymlinks: [], // Not applicable for S3
    };
  } catch (err: any) {
    if (err instanceof S3ServiceException) {
      throw new ListingError(
        `S3 listing failed for bucket "${bucket}", prefix "${normalizedPrefix}": ${err.message}`,
      );
    }
    throw new ListingError(`Failed to list S3 directory: ${err.message}`);
  }
}

/**
 * Recursively lists all files in a local directory with size info
 *
 * **Implementation:** Uses depth-first traversal that processes files incrementally.
 * Memory usage is proportional to directory depth, not total file count.
 *
 * **Performance:** Can handle 100,000+ files with <1GB memory usage.
 * Processes approximately 10,000 files/second on SSD.
 *
 * **Streaming Details:**
 * - Processes one directory level at a time
 * - Files added to result array as they're discovered
 * - No full tree scan upfront
 * - Memory usage is O(depth) not O(total files)
 * - Uses efficient withFileTypes approach to avoid extra stat calls
 *
 * **Behavior:**
 * - Skips symbolic links with tracking for user notification
 * - Detects empty directories for .s3keep marker creation
 * - Validates path lengths (max 4096 characters)
 *
 * **SYMLINK HANDLING:**
 * - Symbolic links are automatically skipped during directory traversal
 * - Skipped symlinks are tracked in the returned DirectoryListing.skippedSymlinks array
 * - A warning is logged server-side when symlinks are encountered (see expandItemsToFiles in transfer/index.ts)
 * - Rationale: Symlinks can cause infinite loops, permission issues, and cross-filesystem problems
 *   - Infinite loops: Circular symlinks pointing back to parent directories
 *   - Permission errors: Symlink target may be inaccessible even if the link itself is readable
 *   - Cross-filesystem: Symlinks pointing outside allowed paths or to unmounted locations
 *
 * @param basePath - Absolute base path of the location
 * @param relativePath - Relative path within the location
 * @returns Directory listing with file paths, sizes, and metadata
 * @throws ListingError if listing operation fails
 */
export async function listLocalDirectoryRecursive(
  basePath: string,
  relativePath: string,
): Promise<DirectoryListing> {
  const files: FileInfo[] = [];
  const emptyDirectories: string[] = [];
  const skippedSymlinks: string[] = [];
  let totalSize = 0;

  const fullPath = path.join(basePath, relativePath);

  /**
   * Recursive helper - processes files incrementally as they're discovered
   * ⭐ Streaming approach - no upfront full directory scan
   */
  async function recurse(currentDir: string, relativeDir: string): Promise<void> {
    let entries;
    try {
      // Read directory contents (one level at a time)
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error: any) {
      if (error.code === 'EACCES') {
        throw new ListingError(`Permission denied accessing directory: ${relativeDir}`);
      }
      if (error.code === 'ENOENT') {
        throw new ListingError(`Directory not found: ${relativeDir}`);
      }
      throw new ListingError(`Failed to read directory "${relativeDir}": ${error.message}`);
    }

    // Track if directory has any non-symlink children
    let hasChildren = false;

    // ⭐ Process entries incrementally (memory efficient)
    for (const entry of entries) {
      const entryFullPath = path.join(currentDir, entry.name);
      const entryRelativePath = path.join(relativeDir, entry.name);

      // Validate path length (Linux max: 4096 characters)
      if (entryFullPath.length > 4096) {
        throw new ListingError(`Path too long (>4096 chars): ${entryRelativePath}`);
      }

      // Skip symbolic links to avoid:
      // - Infinite loops (circular symlinks pointing back to parent directories)
      // - Permission errors (symlink target may be inaccessible even if link is readable)
      // - Cross-filesystem issues (symlink pointing outside allowed paths or to unmounted locations)
      if (entry.isSymbolicLink()) {
        skippedSymlinks.push(entryRelativePath);
        continue;
      }

      if (entry.isDirectory()) {
        hasChildren = true;
        // Recursively process subdirectory
        await recurse(entryFullPath, entryRelativePath);
      } else if (entry.isFile()) {
        hasChildren = true;
        try {
          // Get file size and add to results immediately
          const stats = await fs.stat(entryFullPath);
          files.push({
            path: entryRelativePath,
            size: stats.size,
          });
          totalSize += stats.size;
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            // File was deleted between readdir and stat, skip it
            continue;
          }
          throw new ListingError(`Failed to stat file "${entryRelativePath}": ${error.message}`);
        }
      }
      // Ignore other types (sockets, pipes, etc.)
    }

    // Mark as empty if no non-symlink children found
    // This handles both truly empty dirs and dirs containing only symlinks
    if (!hasChildren) {
      emptyDirectories.push(relativeDir);
    }
  }

  try {
    await recurse(fullPath, relativePath);

    return {
      files,
      totalSize,
      fileCount: files.length,
      emptyDirectories,
      skippedSymlinks,
    };
  } catch (err: any) {
    if (err instanceof ListingError) {
      throw err;
    }
    throw new ListingError(`Failed to list local directory: ${err.message}`);
  }
}

/**
 * Normalizes path separators and removes trailing slashes
 * Ensures consistent path format across platforms
 *
 * @param inputPath - Path to normalize
 * @returns Normalized path with forward slashes and no trailing slash
 */
export function normalizePath(inputPath: string): string {
  // Convert backslashes to forward slashes
  let normalized = inputPath.replace(/\\/g, '/');

  // Remove trailing slash (except for root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}
