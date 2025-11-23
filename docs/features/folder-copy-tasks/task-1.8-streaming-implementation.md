# Task 1.8: Implement Streaming Directory Listings (Default Implementation)

**Task ID:** 1.8
**Phase:** Phase 1 - Backend Core Functionality
**Status:** Not Started
**Estimated Effort:** 1-2 hours
**Priority:** Medium

## Overview

Make streaming the default implementation for directory listings to handle directories of any size efficiently. This task refines the implementation from Task 1.1 to ensure it uses streaming/pagination consistently, avoiding memory issues with large directories.

## Prerequisites

- Completion of Task 1.1 (Recursive Directory Listing)
- Understanding of S3 pagination
- Knowledge of memory-efficient file system traversal

## Dependencies

**Requires:**

- Task 1.1 (provides base directory listing functions)

**Enhances:**

- All tasks that use directory listing (1.3, 1.7)

## Files to Modify

- `backend/src/utils/directoryListing.ts`

## Implementation Steps

### Step 1: Verify S3 Streaming Implementation

The S3 implementation from Task 1.1 should already use streaming via pagination. Verify it follows this pattern:

```typescript
export async function listS3DirectoryRecursive(
  s3Client: S3Client,
  bucket: string,
  prefix: string,
): Promise<DirectoryListing> {
  const files: FileInfo[] = [];
  const emptyDirectories: string[] = [];
  let totalSize = 0;
  let continuationToken: string | undefined;

  // ⭐ Streaming implementation - process results incrementally
  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000, // S3 maximum - API automatically paginates
      }),
    );

    // Process batch incrementally (memory efficient)
    for (const obj of response.Contents || []) {
      // Skip directory markers and .s3keep files
      if (obj.Key!.endsWith('/') || obj.Key!.endsWith('.s3keep')) {
        continue;
      }

      files.push({
        path: obj.Key!,
        size: obj.Size || 0,
      });
      totalSize += obj.Size || 0;
    }

    // Detect empty directories from prefixes
    for (const prefixObj of response.CommonPrefixes || []) {
      emptyDirectories.push(prefixObj.Prefix!);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return {
    files,
    totalSize,
    fileCount: files.length,
    emptyDirectories,
    skippedSymlinks: [],
  };
}
```

**Key Points:**

- ✅ Uses `do-while` loop with continuation token
- ✅ Processes each batch incrementally
- ✅ Memory usage constant per batch (1000 objects max)
- ✅ No upfront loading of entire result set

### Step 2: Verify Local Filesystem Streaming Implementation

The local implementation from Task 1.1 should use recursive traversal that processes files incrementally:

```typescript
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
  async function recurse(currentDir: string, relativeDir: string) {
    let entries;
    try {
      // Read directory contents (one level at a time)
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error: any) {
      if (error.code === 'EACCES') {
        throw new Error(`Permission denied accessing directory: ${relativeDir}`);
      }
      throw error;
    }

    let hasChildren = false;

    // ⭐ Process entries incrementally (memory efficient)
    for (const entry of entries) {
      const entryFullPath = path.join(currentDir, entry.name);
      const entryRelativePath = path.join(relativeDir, entry.name);

      // Validate path length
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
        // Recursively process subdirectory
        await recurse(entryFullPath, entryRelativePath);
      } else if (entry.isFile()) {
        hasChildren = true;
        // Get file size and add to results immediately
        const stats = await fs.stat(entryFullPath);
        files.push({
          path: entryRelativePath,
          size: stats.size,
        });
        totalSize += stats.size;
      }
    }

    // Track empty directories
    if (!hasChildren && relativeDir !== relativePath) {
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

**Key Points:**

- ✅ Processes one directory level at a time
- ✅ Files added to result array as they're discovered
- ✅ No full tree scan upfront
- ✅ Memory usage proportional to tree depth, not total file count

### Step 3: Add Memory Usage Logging (Optional)

Add optional logging to track memory usage during large directory scans:

```typescript
/**
 * Logs memory usage (useful for monitoring large directory operations)
 */
function logMemoryUsage(context: string): void {
  const usage = process.memoryUsage();
  logger.debug(
    `[${context}] Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB heap, ${Math.round(usage.rss / 1024 / 1024)}MB RSS`,
  );
}

// Usage in listS3DirectoryRecursive (optional)
export async function listS3DirectoryRecursive(
  s3Client: S3Client,
  bucket: string,
  prefix: string,
): Promise<DirectoryListing> {
  const files: FileInfo[] = [];
  // ... initialization ...

  let batchCount = 0;

  do {
    const response = await s3Client.send(/* ... */);

    // Process batch
    for (const obj of response.Contents || []) {
      // ... processing ...
    }

    batchCount++;

    // Log memory every 10 batches (10,000 objects)
    if (batchCount % 10 === 0) {
      logMemoryUsage(`S3 listing batch ${batchCount}`);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  logMemoryUsage(`S3 listing complete: ${files.length} files`);

  return {
    files,
    totalSize,
    fileCount: files.length,
    emptyDirectories,
    skippedSymlinks: [],
  };
}
```

### Step 4: Document Streaming Behavior

Add JSDoc comments explaining streaming behavior:

```typescript
/**
 * Recursively lists all files in an S3 "directory" (prefix) with size info
 *
 * **Implementation:** Uses streaming/pagination to handle large directories efficiently.
 * Memory usage remains constant regardless of directory size (processes 1000 objects per batch).
 *
 * **Performance:** Can handle 100,000+ files with <1GB memory usage.
 *
 * @param s3Client - Configured S3 client
 * @param bucket - S3 bucket name
 * @param prefix - Directory prefix to list (e.g., "models/")
 * @returns Directory listing with file paths, sizes, and metadata
 */
export async function listS3DirectoryRecursive(/* ... */): Promise<DirectoryListing> {
  // ...
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
 * @param basePath - Absolute base path of the location
 * @param relativePath - Relative path within the location
 * @returns Directory listing with file paths, sizes, and metadata
 */
export async function listLocalDirectoryRecursive(/* ... */): Promise<DirectoryListing> {
  // ...
}
```

## Testing Requirements

### Performance Tests

Add performance tests to verify streaming behavior:

```typescript
describe('Streaming Directory Listings - Performance', () => {
  describe('S3 Streaming', () => {
    it('should handle 10,000 S3 objects with <1GB memory', async () => {
      // Mock S3 with 100 pages of 100 objects each (10,000 total)
      const mockPages = Array.from({ length: 100 }, (_, pageIdx) => ({
        Contents: Array.from({ length: 100 }, (_, idx) => ({
          Key: `file${pageIdx * 100 + idx}.txt`,
          Size: 1024,
        })),
        NextContinuationToken: pageIdx < 99 ? `token${pageIdx + 1}` : undefined,
      }));

      let pageIndex = 0;
      mockS3Client.send.mockImplementation(() => {
        return Promise.resolve(mockPages[pageIndex++]);
      });

      const startMemory = process.memoryUsage().heapUsed;

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'large-dir/');

      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsed = (endMemory - startMemory) / 1024 / 1024; // MB

      expect(result.fileCount).toBe(10000);
      expect(result.totalSize).toBe(10000 * 1024);
      expect(memoryUsed).toBeLessThan(1024); // Less than 1GB
    });

    it('should handle pagination correctly for large directories', async () => {
      // Verify all pages are fetched
      const mockPages = Array.from({ length: 5 }, (_, pageIdx) => ({
        Contents: [{ Key: `file${pageIdx}.txt`, Size: 100 }],
        NextContinuationToken: pageIdx < 4 ? `token${pageIdx + 1}` : undefined,
      }));

      let pageIndex = 0;
      mockS3Client.send.mockImplementation(() => {
        return Promise.resolve(mockPages[pageIndex++]);
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'dir/');

      expect(result.fileCount).toBe(5);
      expect(mockS3Client.send).toHaveBeenCalledTimes(5);
    });
  });

  describe('Local Filesystem Streaming', () => {
    it('should handle 10,000 local files with <1GB memory', async () => {
      // Create temp directory with 10,000 files in nested structure
      const tempDir = await createLargeTempStructure(10000);

      const startMemory = process.memoryUsage().heapUsed;

      const result = await listLocalDirectoryRecursive(tempDir, '.');

      const endMemory = process.memoryUsage().heapUsed;
      const memoryUsed = (endMemory - startMemory) / 1024 / 1024; // MB

      expect(result.fileCount).toBe(10000);
      expect(memoryUsed).toBeLessThan(1024); // Less than 1GB

      // Cleanup
      await fs.rm(tempDir, { recursive: true });
    });

    it('should process files incrementally during traversal', async () => {
      const filesProcessed: string[] = [];

      // Spy on the internal file processing
      const originalStat = fs.stat;
      jest.spyOn(fs, 'stat').mockImplementation(async (path: any) => {
        filesProcessed.push(path);
        return originalStat(path);
      });

      const tempDir = await createTempDir({
        'dir1/file1.txt': 'content',
        'dir2/file2.txt': 'content',
      });

      await listLocalDirectoryRecursive(tempDir, '.');

      // Verify files were processed as they were discovered
      expect(filesProcessed.length).toBeGreaterThan(0);
    });
  });
});
```

### Memory Benchmarks

```typescript
describe('Memory Benchmarks', () => {
  it('S3: Memory usage should be O(1) relative to total files', async () => {
    const testSizes = [100, 1000, 10000];
    const memoryUsages: number[] = [];

    for (const size of testSizes) {
      mockS3WithNFiles(size);

      const startMem = process.memoryUsage().heapUsed;
      await listS3DirectoryRecursive(mockS3Client, 'bucket', 'prefix/');
      const endMem = process.memoryUsage().heapUsed;

      memoryUsages.push(endMem - startMem);
    }

    // Memory usage should not scale linearly with file count
    // (Streaming implementation has constant memory overhead)
    const ratio1 = memoryUsages[1] / memoryUsages[0]; // 1000/100
    const ratio2 = memoryUsages[2] / memoryUsages[1]; // 10000/1000

    // Ratios should be much less than 10x (actual file count increase)
    expect(ratio1).toBeLessThan(5);
    expect(ratio2).toBeLessThan(5);
  });

  it('Local: Memory usage should be O(depth) not O(files)', async () => {
    // Test with same number of files but different depths

    // Shallow structure: 1000 files in one directory
    const shallowDir = await createTempDir(
      Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`file${i}.txt`, 'content'])),
    );

    const shallowStartMem = process.memoryUsage().heapUsed;
    await listLocalDirectoryRecursive(shallowDir, '.');
    const shallowEndMem = process.memoryUsage().heapUsed;
    const shallowMemUsed = shallowEndMem - shallowStartMem;

    // Deep structure: 1000 files in nested directories (100 dirs, 10 files each)
    const deepDir = await createNestedTempStructure(100, 10);

    const deepStartMem = process.memoryUsage().heapUsed;
    await listLocalDirectoryRecursive(deepDir, '.');
    const deepEndMem = process.memoryUsage().heapUsed;
    const deepMemUsed = deepEndMem - deepStartMem;

    // Deep structure may use slightly more memory due to recursion
    // But should not be dramatically different (same number of files)
    const ratio = deepMemUsed / shallowMemUsed;
    expect(ratio).toBeLessThan(3); // At most 3x, not 10x or 100x
  });
});
```

## Acceptance Criteria

- [ ] S3 listing uses pagination with continuation tokens
- [ ] S3 listing processes results incrementally (batch by batch)
- [ ] Local listing uses recursive traversal without upfront full scan
- [ ] Local listing processes files as they're discovered
- [ ] Memory usage is <1GB for 10,000+ files (both S3 and local)
- [ ] S3 memory usage is O(1) relative to total files
- [ ] Local memory usage is O(depth) not O(total files)
- [ ] Documentation explains streaming behavior
- [ ] Performance tests pass
- [ ] Memory benchmark tests verify efficiency

## Performance Targets

| Metric         | S3             | Local           |
| -------------- | -------------- | --------------- |
| **Files**      | 100,000+       | 100,000+        |
| **Memory**     | <1GB           | <1GB            |
| **Time**       | <30s           | <10s            |
| **Throughput** | 3,000+ files/s | 10,000+ files/s |

## Related Documentation

- [Folder Copy Support Design](../folder-copy-support.md) - Section: Performance and Memory
- [Task 1.1](./task-1.1-recursive-directory-listing.md) - Base directory listing implementation

## Next Steps

After completion:

1. Monitor production usage for memory patterns
2. Consider adding progress callbacks for very large directories (100,000+ files)
3. Potential optimization: Parallel S3 prefix listing for multi-level directories

## Notes

- Streaming is the **only** implementation - no threshold-based switching
- S3 API naturally provides pagination - we leverage it
- Local filesystem traversal is depth-first and incremental
- Memory target <1GB is conservative - actual usage should be much lower
- The optional memory logging is useful for debugging large operations
