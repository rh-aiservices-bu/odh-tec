# Task 1.7: Update Conflict Check Endpoint (Breaking Change)

**Task ID:** 1.7
**Phase:** Phase 1 - Backend Core Functionality
**Status:** Not Started
**Estimated Effort:** 2-3 hours
**Priority:** High

## Overview

Update the conflict check endpoint to:

1. Accept `items[]` instead of `files[]` (breaking change)
2. Return smart conflict resolution data (conflicting vs non-conflicting files)
3. Include large folder warning when folder exceeds 1,000 files OR 10GB total size
4. Use the `expandItemsToFiles` function from Task 1.3

## Prerequisites

- Completion of Task 1.1 (Directory Listing)
- Completion of Task 1.2 (Updated Interface)
- Completion of Task 1.3 (Directory Expansion)
- Understanding of conflict detection logic

## Dependencies

**Requires:**

- Task 1.1 (provides directory listing utilities)
- Task 1.2 (provides TransferItem interface)
- Task 1.3 (provides expandItemsToFiles function)

**Blocks:**

- Task 2.5 (Frontend Large Folder Warning)
- Task 3.2 (Frontend Smart Conflict UI)

## Files to Modify

- `backend/src/routes/api/transfer/index.ts`

## Updated Response Interface

```typescript
/**
 * Response from conflict check endpoint
 */
interface ConflictCheckResponse {
  /** Files that exist in both source and destination */
  conflicts: string[];
  /** Files that only exist in source (will be auto-copied) */
  nonConflicting: string[];
  /** Optional warning for large folders */
  warning?: {
    type: 'large_folder';
    fileCount: number;
    totalSize: number;
    message: string;
  };
}
```

## Implementation Steps

### Step 1: Update Interface Definition

In `backend/src/routes/api/transfer/index.ts`:

```typescript
/**
 * Response from conflict check endpoint
 * Provides smart conflict resolution data and large folder warnings
 */
interface ConflictCheckResponse {
  /** Files that exist in both source and destination (user must decide) */
  conflicts: string[];
  /** Files that only exist in source (will be auto-copied without prompt) */
  nonConflicting: string[];
  /** Warning for large folders (>= 1000 files OR >= 10GB) */
  warning?: {
    type: 'large_folder';
    fileCount: number;
    totalSize: number;
    message: string;
  };
}

/**
 * Request body for conflict check
 */
interface ConflictCheckRequest {
  source: {
    type: 'local' | 's3';
    locationId: string;
    path: string;
  };
  destination: {
    type: 'local' | 's3';
    locationId: string;
    path: string;
  };
  items: TransferItem[]; // ⚠️ CHANGED from 'files: string[]'
}
```

### Step 2: Update Request Schema

```typescript
const conflictCheckRequestSchema = {
  body: {
    type: 'object',
    required: ['source', 'destination', 'items'],
    properties: {
      source: {
        type: 'object',
        required: ['type', 'locationId', 'path'],
        properties: {
          type: { type: 'string', enum: ['local', 's3'] },
          locationId: { type: 'string' },
          path: { type: 'string' },
        },
      },
      destination: {
        type: 'object',
        required: ['type', 'locationId', 'path'],
        properties: {
          type: { type: 'string', enum: ['local', 's3'] },
          locationId: { type: 'string' },
          path: { type: 'string' },
        },
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['path', 'type'],
          properties: {
            path: { type: 'string' },
            type: { type: 'string', enum: ['file', 'directory'] },
          },
        },
        minItems: 1,
      },
    },
  },
};
```

### Step 3: Implement Helper Function for Listing Destination Files

```typescript
/**
 * Lists all files at the destination path
 * Used for conflict detection
 *
 * @param destination - Destination location configuration
 * @returns Array of file paths (relative to destination.path)
 */
async function listDestinationFiles(
  destination: ConflictCheckRequest['destination'],
): Promise<string[]> {
  const location = locations.find((loc) => loc.id === destination.locationId);
  if (!location) {
    throw new Error(`Destination location ${destination.locationId} not found`);
  }

  let files: string[] = [];

  if (destination.type === 's3') {
    if (location.type !== 's3') {
      throw new Error(`Location ${destination.locationId} is not an S3 location`);
    }

    const s3Client = getS3Client(location);

    // List all objects at destination path
    let continuationToken: string | undefined;
    const prefix = destination.path ? destination.path + '/' : '';

    do {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: location.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of response.Contents || []) {
        // Remove prefix to get relative path
        const relativePath = obj.Key!.substring(prefix.length);
        if (relativePath) {
          files.push(relativePath);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  } else {
    // Local or PVC storage
    const basePath = location.type === 'local' ? location.path : location.mountPath;
    const fullPath = path.join(basePath, destination.path);

    // Check if destination directory exists
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) {
        // Destination is a file, not a directory - no conflicts
        return [];
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Destination doesn't exist - no conflicts
        return [];
      }
      throw error;
    }

    // List all files recursively
    const listing = await listLocalDirectoryRecursive(basePath, destination.path);
    files = listing.files.map((f) => f.path);
  }

  return files;
}
```

### Step 4: Update Conflict Check Endpoint

Replace the existing `/check-conflicts` endpoint:

```typescript
router.post('/check-conflicts', async (request, reply) => {
  const { source, destination, items } = request.body as ConflictCheckRequest;

  try {
    // Expand items to full file list with sizes
    const sourceFiles = await expandItemsToFiles(items, source, destination);

    // List destination files
    const destFiles = await listDestinationFiles(destination);

    // Create set for O(1) lookup
    const destFileSet = new Set(destFiles);

    // Separate conflicting from non-conflicting files
    const conflicts: string[] = [];
    const nonConflicting: string[] = [];

    for (const sourceFile of sourceFiles) {
      // Skip .s3keep markers from conflict detection
      if (sourceFile.path.endsWith('.s3keep')) {
        continue;
      }

      if (destFileSet.has(sourceFile.path)) {
        conflicts.push(sourceFile.path);
      } else {
        nonConflicting.push(sourceFile.path);
      }
    }

    // Calculate totals for warning check
    const totalFileCount = sourceFiles.length;
    const totalSize = sourceFiles.reduce((sum, f) => sum + f.size, 0);

    // Check for large folder warning (>= 1000 files OR >= 10GB)
    const TEN_GB = 10 * 1024 * 1024 * 1024;
    let warning: ConflictCheckResponse['warning'] = undefined;

    if (totalFileCount >= 1000 || totalSize >= TEN_GB) {
      warning = {
        type: 'large_folder',
        fileCount: totalFileCount,
        totalSize: totalSize,
        message: `This operation will transfer ${totalFileCount} files (${formatBytes(totalSize)}). This may take significant time.`,
      };
    }

    const response: ConflictCheckResponse = {
      conflicts,
      nonConflicting,
      warning,
    };

    return reply.send(response);
  } catch (error: any) {
    logger.error(`Conflict check failed: ${error.message}`);
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});
```

### Step 5: Add Byte Formatting Helper

```typescript
/**
 * Formats bytes into human-readable string
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 GB")
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
```

## Testing Requirements

### Unit Tests

Add to `backend/src/routes/api/transfer/index.test.ts`:

```typescript
describe('POST /check-conflicts - Updated Endpoint', () => {
  describe('Request Validation', () => {
    it('should accept request with items array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/transfer/check-conflicts',
        payload: {
          source: {
            type: 's3',
            locationId: 'test-bucket',
            path: 'source/',
          },
          destination: {
            type: 'local',
            locationId: 'local-storage',
            path: '/dest/',
          },
          items: [{ path: 'file1.txt', type: 'file' }],
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject request with old files array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/transfer/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test', path: '/' },
          destination: { type: 'local', locationId: 'local', path: '/' },
          files: ['file1.txt'], // Old format
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Smart Conflict Detection', () => {
    it('should separate conflicting and non-conflicting files', async () => {
      // Source has: file1.txt, file2.txt, file3.txt
      mockExpandItemsToFiles([
        { path: 'file1.txt', size: 100 },
        { path: 'file2.txt', size: 200 },
        { path: 'file3.txt', size: 300 },
      ]);

      // Destination has: file2.txt, file4.txt
      mockListDestinationFiles(['file2.txt', 'file4.txt']);

      const response = await app.inject({
        method: 'POST',
        url: '/api/transfer/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test', path: '/' },
          destination: { type: 'local', locationId: 'local', path: '/' },
          items: [{ path: 'dir/', type: 'directory' }],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      expect(body.conflicts).toEqual(['file2.txt']);
      expect(body.nonConflicting).toEqual(['file1.txt', 'file3.txt']);
      expect(body.warning).toBeUndefined();
    });

    it('should return all as non-conflicting when destination empty', async () => {
      mockExpandItemsToFiles([
        { path: 'file1.txt', size: 100 },
        { path: 'file2.txt', size: 200 },
      ]);

      mockListDestinationFiles([]); // Empty destination

      const response = await app.inject({
        method: 'POST',
        url: '/api/transfer/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test', path: '/' },
          destination: { type: 'local', locationId: 'local', path: '/' },
          items: [{ path: 'dir/', type: 'directory' }],
        },
      });

      const body = response.json();
      expect(body.conflicts).toEqual([]);
      expect(body.nonConflicting).toEqual(['file1.txt', 'file2.txt']);
    });
  });

  describe('Large Folder Warning', () => {
    it('should warn when folder has >= 1000 files', async () => {
      const manyFiles = Array.from({ length: 1200 }, (_, i) => ({
        path: `file${i}.txt`,
        size: 100,
      }));

      mockExpandItemsToFiles(manyFiles);
      mockListDestinationFiles([]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/transfer/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test', path: '/' },
          destination: { type: 'local', locationId: 'local', path: '/' },
          items: [{ path: 'bigdir/', type: 'directory' }],
        },
      });

      const body = response.json();
      expect(body.warning).toBeDefined();
      expect(body.warning.type).toBe('large_folder');
      expect(body.warning.fileCount).toBe(1200);
      expect(body.warning.message).toContain('1200 files');
    });

    it('should warn when folder total size >= 10GB', async () => {
      const largeFiles = [
        { path: 'large1.bin', size: 6 * 1024 * 1024 * 1024 }, // 6GB
        { path: 'large2.bin', size: 5 * 1024 * 1024 * 1024 }, // 5GB
      ];

      mockExpandItemsToFiles(largeFiles);
      mockListDestinationFiles([]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/transfer/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test', path: '/' },
          destination: { type: 'local', locationId: 'local', path: '/' },
          items: [{ path: 'bigfiles/', type: 'directory' }],
        },
      });

      const body = response.json();
      expect(body.warning).toBeDefined();
      expect(body.warning.totalSize).toBe(11 * 1024 * 1024 * 1024);
      expect(body.warning.message).toContain('11 GB');
    });

    it('should not warn for small folders', async () => {
      const smallFiles = [
        { path: 'file1.txt', size: 100 },
        { path: 'file2.txt', size: 200 },
      ];

      mockExpandItemsToFiles(smallFiles);
      mockListDestinationFiles([]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/transfer/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test', path: '/' },
          destination: { type: 'local', locationId: 'local', path: '/' },
          items: [{ path: 'smalldir/', type: 'directory' }],
        },
      });

      const body = response.json();
      expect(body.warning).toBeUndefined();
    });
  });

  describe('listDestinationFiles helper', () => {
    it('should list S3 destination files', async () => {
      mockS3ListObjects(['dest/file1.txt', 'dest/file2.txt', 'dest/subdir/file3.txt']);

      const files = await listDestinationFiles({
        type: 's3',
        locationId: 'test-bucket',
        path: 'dest/',
      });

      expect(files).toEqual(['file1.txt', 'file2.txt', 'subdir/file3.txt']);
    });

    it('should return empty array when S3 destination does not exist', async () => {
      mockS3ListObjects([]); // No objects

      const files = await listDestinationFiles({
        type: 's3',
        locationId: 'test-bucket',
        path: 'nonexistent/',
      });

      expect(files).toEqual([]);
    });

    it('should list local destination files', async () => {
      const tempDir = await createTempDir({
        'file1.txt': 'content1',
        'subdir/file2.txt': 'content2',
      });

      const files = await listDestinationFiles({
        type: 'local',
        locationId: 'local-storage',
        path: tempDir,
      });

      expect(files).toContain('file1.txt');
      expect(files).toContain('subdir/file2.txt');
    });

    it('should return empty array when local destination does not exist', async () => {
      const files = await listDestinationFiles({
        type: 'local',
        locationId: 'local-storage',
        path: '/nonexistent/path',
      });

      expect(files).toEqual([]);
    });
  });

  describe('formatBytes helper', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
    });
  });
});
```

## Acceptance Criteria

- [ ] Endpoint accepts `items: TransferItem[]` instead of `files: string[]`
- [ ] Endpoint rejects old `files` format with 400 error
- [ ] Response includes `conflicts` array (files in both source and dest)
- [ ] Response includes `nonConflicting` array (files only in source)
- [ ] Response includes `warning` when folder has >= 1000 files
- [ ] Response includes `warning` when folder total size >= 10GB
- [ ] `.s3keep` markers excluded from conflict detection
- [ ] `listDestinationFiles` correctly lists S3 files
- [ ] `listDestinationFiles` correctly lists local files
- [ ] `listDestinationFiles` handles non-existent destinations
- [ ] `formatBytes` helper formats sizes correctly
- [ ] All unit tests pass
- [ ] TypeScript compilation succeeds

## Error Handling

### Expected Errors

1. **Invalid location ID**: 500 with message
2. **S3 access denied**: Propagate S3 error
3. **Local permission denied**: Propagate fs error
4. **Expansion failed**: Propagate error from expandItemsToFiles

### Error Messages

```typescript
throw new Error(`Destination location ${destination.locationId} not found`);
throw new Error(`Location ${destination.locationId} is not an S3 location`);
```

## Related Documentation

- [Folder Copy Support Design](../folder-copy-support.md) - Section: Design Decisions
- [Task 1.3](./task-1.3-directory-expansion-logic.md) - expandItemsToFiles function
- [Task 2.5](./task-2.5-large-folder-warning.md) - Frontend warning dialog

## Next Steps

After completion:

1. Frontend Task 2.5 (Large Folder Warning) - uses warning data
2. Frontend Task 3.2 (Smart Conflict UI) - uses conflicts/nonConflicting arrays

## Notes

- This is a **breaking change** - coordinate with frontend updates
- Dual thresholds (files AND size) ensure both scenarios are caught
- Smart conflict detection minimizes user intervention
- The `formatBytes` helper may be moved to shared utilities later
