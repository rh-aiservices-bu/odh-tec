# Task 1.3: Implement Directory Expansion Logic

**Task ID:** 1.3
**Phase:** Phase 1 - Backend Core Functionality
**Status:** Not Started
**Estimated Effort:** 2-3 hours
**Priority:** High

## Overview

Implement the `expandItemsToFiles()` function that converts the `items[]` array (which may contain directories) into a flat list of files with their sizes. This includes recursively expanding directories and calculating individual file sizes upfront for accurate progress tracking.

## Prerequisites

- Completion of Task 1.1 (Recursive Directory Listing)
- Completion of Task 1.2 (Updated Transfer Interface)
- Understanding of S3 and local filesystem operations
- Familiarity with the location management system

## Dependencies

**Requires:**

- Task 1.1 (provides `listS3DirectoryRecursive` and `listLocalDirectoryRecursive`)
- Task 1.2 (provides `TransferItem` and `TransferRequest` interfaces)

**Blocks:**

- Task 1.4 (Directory Creation)
- Task 1.7 (Conflict Check Endpoint)

## Files to Modify

- `backend/src/routes/api/transfer/index.ts`

## Implementation Steps

### Step 1: Import Required Utilities

At the top of `backend/src/routes/api/transfer/index.ts`:

```typescript
import {
  listS3DirectoryRecursive,
  listLocalDirectoryRecursive,
  FileInfo,
  DirectoryListing,
} from '../utils/directoryListing.js';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import * as path from 'path';
```

### Step 2: Implement expandItemsToFiles Function

Add this function before the route handlers:

```typescript
/**
 * Expands transfer items (files and directories) into a flat list of files with sizes
 * Calculates file sizes upfront for accurate progress tracking
 *
 * @param items - Array of items to transfer (files and/or directories)
 * @param source - Source location configuration
 * @returns Array of FileInfo objects with paths and sizes
 */
async function expandItemsToFiles(
  items: TransferItem[],
  source: TransferRequest['source'],
): Promise<FileInfo[]> {
  const allFiles: FileInfo[] = [];

  // Get location configuration
  const location = locations.find((loc) => loc.id === source.locationId);
  if (!location) {
    throw new Error(`Location ${source.locationId} not found`);
  }

  for (const item of items) {
    if (item.type === 'file') {
      // Individual file - get size upfront for accurate progress tracking
      let size = 0;

      if (source.type === 's3') {
        if (location.type !== 's3') {
          throw new Error(`Location ${source.locationId} is not an S3 location`);
        }

        const s3Client = getS3Client(location);
        const key = path.posix.join(source.path, item.path);

        try {
          const response = await s3Client.send(
            new HeadObjectCommand({
              Bucket: location.bucket,
              Key: key,
            }),
          );
          size = response.ContentLength || 0;
        } catch (error: any) {
          if (error.name === 'NotFound') {
            throw new Error(`File not found: ${key}`);
          }
          throw new Error(`Failed to get file size for ${key}: ${error.message}`);
        }
      } else {
        // Local or PVC storage
        const basePath = location.type === 'local' ? location.path : location.mountPath;
        const fullPath = path.join(basePath, source.path, item.path);

        try {
          const stats = await fs.stat(fullPath);
          if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${item.path}`);
          }
          size = stats.size;
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            throw new Error(`File not found: ${item.path}`);
          }
          throw new Error(`Failed to get file size for ${item.path}: ${error.message}`);
        }
      }

      allFiles.push({ path: item.path, size });
    } else if (item.type === 'directory') {
      // Directory - expand to file list with sizes
      let dirListing: DirectoryListing;

      if (source.type === 's3') {
        if (location.type !== 's3') {
          throw new Error(`Location ${source.locationId} is not an S3 location`);
        }

        const s3Client = getS3Client(location);
        const prefix = path.posix.join(source.path, item.path);

        try {
          dirListing = await listS3DirectoryRecursive(s3Client, location.bucket, prefix);
        } catch (error: any) {
          throw new Error(`Failed to list S3 directory ${prefix}: ${error.message}`);
        }

        // Make paths relative to source.path
        // S3 keys come back as full paths, need to strip source.path prefix
        const sourcePrefixLength = source.path ? source.path.length + 1 : 0;
        dirListing.files = dirListing.files.map((f) => ({
          ...f,
          path: f.path.substring(sourcePrefixLength),
        }));
      } else {
        // Local or PVC storage
        const basePath = location.type === 'local' ? location.path : location.mountPath;
        const relativePath = path.join(source.path, item.path);

        try {
          dirListing = await listLocalDirectoryRecursive(basePath, relativePath);
        } catch (error: any) {
          throw new Error(`Failed to list local directory ${item.path}: ${error.message}`);
        }

        // Make paths relative to source.path
        const sourcePrefixLength = source.path ? source.path.length + 1 : 0;
        dirListing.files = dirListing.files.map((f) => ({
          ...f,
          path: f.path.substring(sourcePrefixLength),
        }));

        // Log warning about skipped symlinks if any
        if (dirListing.skippedSymlinks.length > 0) {
          logger.warn(
            `Skipped ${dirListing.skippedSymlinks.length} symbolic links in ${item.path}: ${dirListing.skippedSymlinks.slice(0, 5).join(', ')}${dirListing.skippedSymlinks.length > 5 ? '...' : ''}`,
          );
        }
      }

      // Add all files from directory
      allFiles.push(...dirListing.files);
    }
  }

  return allFiles;
}
```

### Step 3: Update Transfer Route to Use Expansion

Modify the POST `/transfer` route handler:

```typescript
router.post('/transfer', async (request, reply) => {
  const transferRequest = request.body as TransferRequest;
  const { source, destination, items, conflictResolution } = transferRequest;

  try {
    // Expand items (files and directories) to flat file list with sizes
    const allFilesWithSizes = await expandItemsToFiles(items, source);

    // Check if expansion resulted in no files
    if (allFilesWithSizes.length === 0) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Selected items contain no files to transfer',
      });
    }

    // Create transfer jobs with actual file sizes
    const transferJobs = allFilesWithSizes.map((fileInfo) => ({
      sourcePath: `${source.type}:${source.locationId}/${path.join(source.path, fileInfo.path)}`,
      destinationPath: `${destination.type}:${destination.locationId}/${path.join(
        destination.path,
        fileInfo.path,
      )}`,
      size: fileInfo.size, // Now populated with actual file size
    }));

    // Queue the transfer jobs
    const transferId = await transferQueue.enqueueTransfer(transferJobs);

    return reply.send({
      transferId,
      fileCount: transferJobs.length,
      totalSize: allFilesWithSizes.reduce((sum, f) => sum + f.size, 0),
    });
  } catch (error: any) {
    logger.error(`Transfer failed: ${error.message}`);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});
```

## Testing Requirements

### Unit Tests

Add to `backend/src/routes/api/transfer/index.test.ts`:

```typescript
describe('expandItemsToFiles', () => {
  describe('Single File Items', () => {
    it('should get size for S3 file', async () => {
      const items: TransferItem[] = [{ path: 'file1.txt', type: 'file' }];

      // Mock HeadObjectCommand to return file size
      const mockS3 = mockS3Client({
        headObject: { ContentLength: 1024 },
      });

      const result = await expandItemsToFiles(items, {
        type: 's3',
        locationId: 'test-bucket',
        path: 'source/',
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        path: 'file1.txt',
        size: 1024,
      });
    });

    it('should get size for local file', async () => {
      // Create temp file with known size
      const tempFile = await createTempFile('test.txt', 2048);

      const items: TransferItem[] = [{ path: 'test.txt', type: 'file' }];

      const result = await expandItemsToFiles(items, {
        type: 'local',
        locationId: 'local-storage',
        path: path.dirname(tempFile),
      });

      expect(result).toHaveLength(1);
      expect(result[0].size).toBe(2048);
    });

    it('should throw error for non-existent file', async () => {
      const items: TransferItem[] = [{ path: 'nonexistent.txt', type: 'file' }];

      await expect(
        expandItemsToFiles(items, {
          type: 'local',
          locationId: 'local-storage',
          path: '/tmp/',
        }),
      ).rejects.toThrow('File not found');
    });
  });

  describe('Directory Items', () => {
    it('should expand S3 directory to file list', async () => {
      const items: TransferItem[] = [{ path: 'models/', type: 'directory' }];

      // Mock listS3DirectoryRecursive
      const mockFiles: FileInfo[] = [
        { path: 'source/models/config.json', size: 512 },
        { path: 'source/models/weights.bin', size: 10240 },
      ];

      jest.spyOn(directoryListing, 'listS3DirectoryRecursive').mockResolvedValue({
        files: mockFiles,
        totalSize: 10752,
        fileCount: 2,
        emptyDirectories: [],
        skippedSymlinks: [],
      });

      const result = await expandItemsToFiles(items, {
        type: 's3',
        locationId: 'test-bucket',
        path: 'source/',
      });

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('models/config.json');
      expect(result[1].path).toBe('models/weights.bin');
    });

    it('should expand local directory to file list', async () => {
      const items: TransferItem[] = [{ path: 'data/', type: 'directory' }];

      const mockFiles: FileInfo[] = [
        { path: 'source/data/file1.csv', size: 1024 },
        { path: 'source/data/file2.csv', size: 2048 },
      ];

      jest.spyOn(directoryListing, 'listLocalDirectoryRecursive').mockResolvedValue({
        files: mockFiles,
        totalSize: 3072,
        fileCount: 2,
        emptyDirectories: [],
        skippedSymlinks: [],
      });

      const result = await expandItemsToFiles(items, {
        type: 'local',
        locationId: 'local-storage',
        path: 'source/',
      });

      expect(result).toHaveLength(2);
    });

    it('should log warning for skipped symlinks', async () => {
      const items: TransferItem[] = [{ path: 'data/', type: 'directory' }];

      jest.spyOn(directoryListing, 'listLocalDirectoryRecursive').mockResolvedValue({
        files: [],
        totalSize: 0,
        fileCount: 0,
        emptyDirectories: [],
        skippedSymlinks: ['data/link1', 'data/link2'],
      });

      const loggerSpy = jest.spyOn(logger, 'warn');

      await expandItemsToFiles(items, {
        type: 'local',
        locationId: 'local-storage',
        path: 'source/',
      });

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Skipped 2 symbolic links'));
    });
  });

  describe('Mixed Items', () => {
    it('should handle mix of files and directories', async () => {
      const items: TransferItem[] = [
        { path: 'readme.txt', type: 'file' },
        { path: 'models/', type: 'directory' },
      ];

      // Mock file size
      mockS3HeadObject({ ContentLength: 512 });

      // Mock directory listing
      jest.spyOn(directoryListing, 'listS3DirectoryRecursive').mockResolvedValue({
        files: [{ path: 'source/models/config.json', size: 1024 }],
        totalSize: 1024,
        fileCount: 1,
        emptyDirectories: [],
        skippedSymlinks: [],
      });

      const result = await expandItemsToFiles(items, {
        type: 's3',
        locationId: 'test-bucket',
        path: 'source/',
      });

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('readme.txt');
      expect(result[1].path).toBe('models/config.json');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid location', async () => {
      const items: TransferItem[] = [{ path: 'file.txt', type: 'file' }];

      await expect(
        expandItemsToFiles(items, {
          type: 's3',
          locationId: 'nonexistent',
          path: '/',
        }),
      ).rejects.toThrow('Location nonexistent not found');
    });

    it('should handle directory listing errors', async () => {
      const items: TransferItem[] = [{ path: 'folder/', type: 'directory' }];

      jest
        .spyOn(directoryListing, 'listS3DirectoryRecursive')
        .mockRejectedValue(new Error('Access denied'));

      await expect(
        expandItemsToFiles(items, {
          type: 's3',
          locationId: 'test-bucket',
          path: 'source/',
        }),
      ).rejects.toThrow('Failed to list S3 directory');
    });
  });
});
```

### Integration Tests

```typescript
describe('POST /transfer - Directory Expansion', () => {
  it('should accept request with directory item', async () => {
    // Setup: Create S3 directory with files
    await setupS3Directory('test-bucket', 'models/', [
      'config.json',
      'weights/layer1.bin',
      'weights/layer2.bin',
    ]);

    const response = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: {
        source: {
          type: 's3',
          locationId: 'test-bucket',
          path: '/',
        },
        destination: {
          type: 'local',
          locationId: 'local-storage',
          path: '/tmp/dest/',
        },
        items: [{ path: 'models/', type: 'directory' }],
        conflictResolution: 'skip',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.fileCount).toBe(3);
    expect(body.totalSize).toBeGreaterThan(0);
  });

  it('should reject directory with no files', async () => {
    // Setup: Create empty S3 directory
    await setupS3Directory('test-bucket', 'empty/', []);

    const response = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: {
        source: {
          type: 's3',
          locationId: 'test-bucket',
          path: '/',
        },
        destination: {
          type: 'local',
          locationId: 'local-storage',
          path: '/tmp/dest/',
        },
        items: [{ path: 'empty/', type: 'directory' }],
        conflictResolution: 'skip',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('no files to transfer');
  });
});
```

## Acceptance Criteria

- [ ] `expandItemsToFiles()` function implemented
- [ ] Function correctly handles individual file items (gets size)
- [ ] Function correctly expands directory items to file lists
- [ ] Function handles mix of files and directories
- [ ] Paths are correctly made relative to source.path
- [ ] File sizes are calculated upfront for all files
- [ ] Skipped symlinks generate warning logs
- [ ] Empty directory selections return appropriate error
- [ ] Location not found errors are handled
- [ ] S3 and local filesystem errors are handled gracefully
- [ ] All unit tests pass
- [ ] Integration tests verify end-to-end flow
- [ ] TypeScript compilation succeeds

## Performance Considerations

- **Upfront Size Calculation**: Slight overhead, but enables accurate progress tracking
- **Concurrency**: No parallel processing yet - optimize if needed
- **Memory**: File list kept in memory - acceptable for <100,000 files
- **Error Recovery**: Fail fast on first error to avoid partial processing

## Error Handling

### Expected Errors

1. **Location Not Found**: Clear message with location ID
2. **File Not Found**: Path included in error message
3. **Directory Listing Failed**: Original error message preserved
4. **Permission Denied**: Access error with path context

### Error Messages

```typescript
// Location error
throw new Error(`Location ${source.locationId} not found`);

// File not found
throw new Error(`File not found: ${key}`);

// Directory listing error
throw new Error(`Failed to list S3 directory ${prefix}: ${error.message}`);

// Empty selection
return reply.status(400).send({
  error: 'Bad Request',
  message: 'Selected items contain no files to transfer',
});
```

## Related Documentation

- [Folder Copy Support Design](../folder-copy-support.md) - Section: Proposed Solution
- [Task 1.1](./task-1.1-recursive-directory-listing.md) - Directory listing utilities
- [Task 1.2](./task-1.2-update-transfer-interface.md) - TransferItem interface

## Next Steps

After completion:

1. Proceed to Task 1.4 (Directory Creation) - uses expanded file list
2. Proceed to Task 1.7 (Conflict Check) - uses same expansion logic
3. Monitor performance with large directories (1000+ files)

## Notes

- The `isMarker` field from FileInfo is not used yet - reserved for Task 1.5
- Symlink warning logging is defensive - user should be notified
- Path normalization relies on utilities from Task 1.1
- This function will be reused in Task 1.7 for conflict checking
