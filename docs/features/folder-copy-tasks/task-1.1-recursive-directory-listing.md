# Task 1.1: Create Recursive Directory Listing Utilities with Size Calculation

**Task ID:** 1.1
**Phase:** Phase 1 - Backend Core Functionality
**Status:** Not Started
**Estimated Effort:** 3-4 hours
**Priority:** High (Foundational)

## Overview

Create utility functions to recursively list all files within S3 "directories" (prefixes) and local filesystem directories, including file size information for accurate progress tracking.

## Prerequisites

- Node.js 18+ environment
- AWS SDK v3 installed
- Understanding of S3 virtual directory structure
- Familiarity with Node.js filesystem operations

## Dependencies

**Blocks:**

- Task 1.3 (Directory Expansion Logic)
- Task 1.7 (Conflict Check Endpoint)

**No dependencies on other tasks**

## Files to Create/Modify

### New File

- `backend/src/utils/directoryListing.ts` (NEW)

### Related Files (for context)

- `backend/src/routes/api/transfer/index.ts` (will use these utilities)

## Implementation Steps

### Step 1: Create the Utility File

Create `backend/src/utils/directoryListing.ts` with the following structure:

```typescript
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as fs from 'fs/promises';
import * as path from 'path';

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
```

### Step 2: Implement S3 Directory Listing

```typescript
/**
 * Recursively lists all files in an S3 "directory" (prefix) with size info
 * Uses pagination to handle large directories efficiently
 *
 * @param s3Client - Configured S3 client
 * @param bucket - S3 bucket name
 * @param prefix - Directory prefix to list (e.g., "models/")
 * @returns Directory listing with file paths, sizes, and metadata
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

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalizedPrefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000, // S3 maximum per request
      }),
    );

    // Process objects
    for (const obj of response.Contents || []) {
      // Skip directory markers (keys ending with '/')
      if (obj.Key!.endsWith('/')) {
        continue;
      }

      // Skip .s3keep marker files (they'll be handled during transfer)
      if (obj.Key!.endsWith('.s3keep')) {
        continue;
      }

      files.push({
        path: obj.Key!,
        size: obj.Size || 0,
      });
      totalSize += obj.Size || 0;
    }

    // Detect empty directories from CommonPrefixes
    // (S3 returns prefixes that have no direct objects)
    for (const prefix of response.CommonPrefixes || []) {
      // This is a potential empty directory
      // Will be confirmed during actual listing
      emptyDirectories.push(prefix.Prefix!);
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
}
```

### Step 3: Implement Local Directory Listing

```typescript
/**
 * Recursively lists all files in a local directory with size info
 * Uses efficient withFileTypes approach to avoid extra stat calls
 * Skips symbolic links with tracking for user notification
 *
 * @param basePath - Absolute base path of the location
 * @param relativePath - Relative path within the location
 * @returns Directory listing with file paths, sizes, and metadata
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
   * Recursive helper function
   */
  async function recurse(currentDir: string, relativeDir: string) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error: any) {
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied accessing directory: ${relativeDir}`);
      }
      throw error;
    }

    // Track if directory has any non-symlink children
    let hasChildren = false;

    for (const entry of entries) {
      const entryFullPath = path.join(currentDir, entry.name);
      const entryRelativePath = path.join(relativeDir, entry.name);

      // Validate path length (Linux max: 4096 characters)
      if (entryFullPath.length > 4096) {
        throw new Error(`Path too long (>4096 chars): ${entryRelativePath}`);
      }

      // Skip symbolic links
      if (entry.isSymbolicLink()) {
        skippedSymlinks.push(entryRelativePath);
        continue;
      }

      if (entry.isDirectory()) {
        hasChildren = true;
        await recurse(entryFullPath, entryRelativePath);
      } else if (entry.isFile()) {
        hasChildren = true;
        const stats = await fs.stat(entryFullPath);
        files.push({
          path: entryRelativePath,
          size: stats.size,
        });
        totalSize += stats.size;
      }
      // Ignore other types (sockets, pipes, etc.)
    }

    // Mark as empty if no non-symlink children found
    // This handles both truly empty dirs and dirs containing only symlinks
    if (!hasChildren && relativeDir !== relativePath) {
      // Don't mark the root directory itself as empty
      emptyDirectories.push(relativeDir);
    }
  }

  await recurse(fullPath, relativePath);

  return {
    files,
    totalSize,
    fileCount: files.length,
    emptyDirectories,
    skippedSymlinks,
  };
}
```

### Step 4: Add Path Normalization Helper

```typescript
/**
 * Normalizes path separators and removes trailing slashes
 * Ensures consistent path format across platforms
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
```

## Testing Requirements

### Unit Tests

Create `backend/src/utils/directoryListing.test.ts`:

#### S3 Tests

```typescript
describe('listS3DirectoryRecursive', () => {
  it('should list all files in flat directory', async () => {
    // Mock S3Client with flat structure
    // Verify all files returned with correct paths and sizes
  });

  it('should list all files in nested directory', async () => {
    // Mock S3Client with nested structure (prefix1/prefix2/file.txt)
    // Verify nested paths preserved
  });

  it('should handle pagination correctly', async () => {
    // Mock S3Client with >1000 objects
    // Verify all pages fetched
  });

  it('should filter out directory markers', async () => {
    // Mock response with keys ending in '/'
    // Verify they are excluded from results
  });

  it('should filter out .s3keep markers', async () => {
    // Mock response with .s3keep files
    // Verify they are excluded
  });

  it('should calculate total size correctly', async () => {
    // Mock multiple files with known sizes
    // Verify totalSize matches sum
  });

  it('should handle empty directory', async () => {
    // Mock empty response
    // Verify returns empty arrays
  });

  it('should handle S3 errors gracefully', async () => {
    // Mock S3 error
    // Verify error is thrown with context
  });
});
```

#### Local Filesystem Tests

```typescript
describe('listLocalDirectoryRecursive', () => {
  it('should list all files in flat directory', async () => {
    // Create temp directory with files
    // Verify all files listed with correct sizes
  });

  it('should list all files in nested directory', async () => {
    // Create nested temp structure
    // Verify paths relative to base
  });

  it('should detect empty directories', async () => {
    // Create directory with empty subdirectory
    // Verify empty dir in emptyDirectories array
  });

  it('should skip symbolic links', async () => {
    // Create directory with symlink
    // Verify symlink in skippedSymlinks, not in files
  });

  it('should handle directory containing only symlinks as empty', async () => {
    // Create dir with only symlinks
    // Verify marked as empty
  });

  it('should handle permission errors', async () => {
    // Create directory with restricted permissions
    // Verify meaningful error thrown
  });

  it('should handle paths with special characters', async () => {
    // Create files with @, #, %, spaces in names
    // Verify all listed correctly
  });

  it('should reject paths over 4096 characters', async () => {
    // Create very deep nested structure
    // Verify error thrown for too-long paths
  });

  it('should calculate total size correctly', async () => {
    // Create files with known sizes
    // Verify totalSize matches
  });
});
```

### Integration Test Scenarios

1. **S3 Large Directory**: List directory with 2000+ objects
2. **Local Deep Nesting**: List directory with 10+ levels of nesting
3. **Mixed Content**: Directory with files, empty dirs, and symlinks
4. **Special Characters**: Paths with Unicode, spaces, special chars

## Acceptance Criteria

- [ ] `listS3DirectoryRecursive()` correctly lists all files in S3 prefix
- [ ] S3 listing handles pagination for >1000 objects
- [ ] S3 listing filters out directory markers and .s3keep files
- [ ] `listLocalDirectoryRecursive()` lists all files in local directory
- [ ] Local listing skips symbolic links and tracks them
- [ ] Local listing detects empty directories correctly
- [ ] Both functions calculate accurate total size
- [ ] Path normalization handles edge cases (trailing slashes, backslashes)
- [ ] Error handling provides clear messages
- [ ] All unit tests pass with >90% coverage
- [ ] Performance: Can list 10,000 files in <5 seconds

## Error Handling

### Expected Errors

1. **S3 Access Denied**: Throw with bucket and prefix context
2. **Local Permission Denied**: Throw with directory path
3. **Path Too Long**: Throw with path and limit
4. **Invalid Path**: Throw with validation message

### Error Format

```typescript
throw new Error(`[directoryListing] ${context}: ${errorMessage}`);
```

## Performance Considerations

- **S3 Pagination**: Uses streaming approach, memory constant regardless of size
- **Local Traversal**: Processes incrementally, memory proportional to depth not total files
- **File Size Calculation**: Uses existing data (S3 Size field, fs.stat during traversal)
- **Target**: <5 seconds for 10,000 files, <1GB memory

## Related Documentation

- [Folder Copy Support Design](../folder-copy-support.md)
- [Backend Architecture](../../architecture/backend-architecture.md)
- [AWS S3 ListObjectsV2](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/listobjectsv2command.html)
- [Node.js fs.readdir](https://nodejs.org/api/fs.html#fsreaddirpath-options-callback)

## Next Steps

After completion:

1. Proceed to Task 1.3 (Directory Expansion Logic) - uses these utilities
2. Proceed to Task 1.7 (Conflict Check Endpoint) - uses these utilities

## Notes

- This is a foundational task - many other tasks depend on it
- Focus on correctness and error handling
- Performance optimizations already included in design
- The `isMarker` field in FileInfo is reserved for future use in Task 1.5
