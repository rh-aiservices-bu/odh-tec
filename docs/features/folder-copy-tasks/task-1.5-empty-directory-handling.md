# Task 1.5: Implement Empty Directory Handling (.s3keep markers)

**Task ID:** 1.5
**Phase:** Phase 1 - Backend Core Functionality
**Status:** Not Started
**Estimated Effort:** 2 hours
**Priority:** Medium

## Overview

Implement `.s3keep` marker file system to preserve empty directories when copying to/from S3. S3 has no concept of directories, so empty directories need special handling to maintain exact directory structure.

## Prerequisites

- Understanding of S3 virtual directory structure
- Completion of Task 1.1 (Directory Listing)
- Completion of Task 1.3 (Directory Expansion)
- Familiarity with S3 PutObjectCommand

## Dependencies

**Requires:**

- Task 1.1 (provides `emptyDirectories` in DirectoryListing)
- Task 1.3 (provides file expansion logic)

**Blocks:**

- Complete folder transfer functionality

## Files to Modify

- `backend/src/routes/api/transfer/index.ts`
- `backend/src/utils/directoryListing.ts` (potentially)

## Empty Directory Behavior Matrix

| Transfer Type     | Source Has Empty Dir | Behavior                                                                                        |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| **Local → S3**    | Yes                  | Create `.s3keep` marker file in S3 for each empty directory                                     |
| **S3 → Local**    | Contains `.s3keep`   | Skip `.s3keep` file, create empty directory on local filesystem                                 |
| **S3 → S3**       | Contains `.s3keep`   | Copy `.s3keep` file as regular object (preserves empty dir structure)                           |
| **Local → Local** | Yes                  | Native OS support - empty directories created automatically via `fs.mkdir({ recursive: true })` |

## Implementation Steps

### Step 1: Update expandItemsToFiles for Local→S3

In `backend/src/routes/api/transfer/index.ts`, modify the `expandItemsToFiles` function:

```typescript
async function expandItemsToFiles(
  items: TransferItem[],
  source: TransferRequest['source'],
  destination?: TransferRequest['destination'], // ⭐ NEW parameter
): Promise<FileInfo[]> {
  const allFiles: FileInfo[] = [];

  // ... existing location lookup code ...

  for (const item of items) {
    if (item.type === 'file') {
      // ... existing file handling code ...
    } else if (item.type === 'directory') {
      let dirListing: DirectoryListing;

      if (source.type === 's3') {
        // ... existing S3 directory listing code ...
      } else {
        // Local or PVC storage
        const basePath = location.type === 'local' ? location.path : location.mountPath;
        const relativePath = path.join(source.path, item.path);

        try {
          dirListing = await listLocalDirectoryRecursive(basePath, relativePath);
        } catch (error: any) {
          throw new Error(`Failed to list local directory ${item.path}: ${error.message}`);
        }

        // ... existing path adjustment code ...

        // ⭐ NEW: If destination is S3, add .s3keep markers for empty directories
        if (destination && destination.type === 's3') {
          for (const emptyDir of dirListing.emptyDirectories) {
            // Adjust path to be relative to source.path
            const sourcePrefixLength = source.path ? source.path.length + 1 : 0;
            const relativeEmptyDir = emptyDir.substring(sourcePrefixLength);

            allFiles.push({
              path: `${relativeEmptyDir}/.s3keep`,
              size: 0,
              isMarker: true, // Flag to create empty file during transfer
            });
          }
        }

        // Log warning about skipped symlinks if any
        // ... existing symlink warning code ...
      }

      // Add all files from directory
      allFiles.push(...dirListing.files);
    }
  }

  return allFiles;
}
```

### Step 2: Update Transfer Route to Pass Destination

In the POST `/transfer` route handler:

```typescript
router.post('/transfer', async (request, reply) => {
  const transferRequest = request.body as TransferRequest;
  const { source, destination, items, conflictResolution } = transferRequest;

  try {
    // ⭐ CHANGED: Pass destination to expandItemsToFiles
    const allFilesWithSizes = await expandItemsToFiles(items, source, destination);

    // ... rest of the handler ...
  } catch (error: any) {
    // ... error handling ...
  }
});
```

### Step 3: Update transferLocalToS3 to Handle Markers

Modify the `transferLocalToS3` function:

```typescript
async function transferLocalToS3(
  job: TransferFileJob,
  s3Client: S3Client,
  bucket: string,
  sourcePath: string,
  destKey: string,
) {
  // ⭐ NEW: Check if this is a .s3keep marker file
  if (job.isMarker || path.basename(destKey) === '.s3keep') {
    // Create empty .s3keep marker in S3
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: destKey,
      Body: '',
      ContentLength: 0,
    });

    await s3Client.send(command);
    logger.debug(`Created .s3keep marker: ${destKey}`);
    return;
  }

  // Otherwise, proceed with normal file upload
  const readStream = createReadStream(sourcePath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: destKey,
    Body: readStream,
  });

  await s3Client.send(command);
}
```

### Step 4: Verify transferS3ToLocal Skips Markers

Ensure the `.s3keep` skip logic from Task 1.4 is in place:

```typescript
async function transferS3ToLocal(
  job: TransferFileJob,
  s3Client: S3Client,
  bucket: string,
  sourcePath: string,
  destPath: string,
) {
  // ... extract key logic ...

  // Skip .s3keep marker files during transfer (from Task 1.4)
  if (path.basename(key) === '.s3keep') {
    logger.debug(`Skipping .s3keep marker file: ${key}`);
    // The parent directory will be created automatically when other files are written
    return;
  }

  // ... rest of the transfer logic ...
}
```

### Step 5: Update TransferFileJob Interface

Add the `isMarker` field to the job interface:

```typescript
interface TransferFileJob {
  sourcePath: string;
  destinationPath: string;
  size: number;
  isMarker?: boolean; // ⭐ NEW: Flag for .s3keep marker files
}
```

### Step 6: Update Job Creation in Transfer Route

In the POST `/transfer` route, propagate the `isMarker` flag:

```typescript
// Create transfer jobs with actual file sizes
const transferJobs = allFilesWithSizes.map((fileInfo) => ({
  sourcePath: `${source.type}:${source.locationId}/${path.join(source.path, fileInfo.path)}`,
  destinationPath: `${destination.type}:${destination.locationId}/${path.join(
    destination.path,
    fileInfo.path,
  )}`,
  size: fileInfo.size,
  isMarker: fileInfo.isMarker, // ⭐ NEW: Propagate marker flag
}));
```

## Testing Requirements

### Unit Tests

Add to `backend/src/routes/api/transfer/index.test.ts`:

```typescript
describe('Empty Directory Handling', () => {
  describe('Local → S3 Transfer', () => {
    it('should create .s3keep marker for empty directories', async () => {
      // Create local directory structure with empty directory
      const tempDir = await createTempDir({
        'data/full/file.txt': 'content',
        'data/empty/': null, // Empty directory
      });

      const items: TransferItem[] = [{ path: 'data/', type: 'directory' }];

      const source = {
        type: 'local' as const,
        locationId: 'local-storage',
        path: tempDir,
      };

      const destination = {
        type: 's3' as const,
        locationId: 'test-bucket',
        path: 'dest/',
      };

      const files = await expandItemsToFiles(items, source, destination);

      // Should contain both the regular file and the .s3keep marker
      expect(files).toContainEqual({
        path: 'data/full/file.txt',
        size: 7,
      });

      expect(files).toContainEqual({
        path: 'data/empty/.s3keep',
        size: 0,
        isMarker: true,
      });
    });

    it('should create .s3keep marker in S3 during transfer', async () => {
      const mockS3 = createMockS3Client();

      const job: TransferFileJob = {
        sourcePath: 'local:storage/empty/.s3keep',
        destinationPath: 's3:bucket/dest/empty/.s3keep',
        size: 0,
        isMarker: true,
      };

      await transferLocalToS3(
        job,
        mockS3,
        'test-bucket',
        '/tmp/source/empty/.s3keep',
        'dest/empty/.s3keep',
      );

      // Verify PutObjectCommand was called with empty body
      expect(mockS3.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            Key: 'dest/empty/.s3keep',
            Body: '',
            ContentLength: 0,
          }),
        }),
      );
    });

    it('should not create .s3keep for Local → Local transfer', async () => {
      const items: TransferItem[] = [{ path: 'data/', type: 'directory' }];

      const source = {
        type: 'local' as const,
        locationId: 'local-storage',
        path: '/tmp/source',
      };

      const destination = {
        type: 'local' as const,
        locationId: 'local-storage',
        path: '/tmp/dest',
      };

      // Mock directory listing with empty directory
      jest.spyOn(directoryListing, 'listLocalDirectoryRecursive').mockResolvedValue({
        files: [],
        totalSize: 0,
        fileCount: 0,
        emptyDirectories: ['data/empty'],
        skippedSymlinks: [],
      });

      const files = await expandItemsToFiles(items, source, destination);

      // Should NOT contain .s3keep markers for Local→Local
      expect(files.some((f) => f.path.endsWith('.s3keep'))).toBe(false);
    });
  });

  describe('S3 → Local Transfer', () => {
    it('should skip .s3keep markers during transfer', async () => {
      const mockS3 = createMockS3Client();

      const job: TransferFileJob = {
        sourcePath: 's3:bucket/source/empty/.s3keep',
        destinationPath: 'local:storage/dest/empty/.s3keep',
        size: 0,
      };

      await transferS3ToLocal(job, mockS3, 'test-bucket', 'source/empty/.s3keep', '/tmp/dest');

      // Verify S3 GetObject was NOT called (file skipped)
      expect(mockS3.send).not.toHaveBeenCalled();
    });

    it('should create empty directory naturally when processing files', async () => {
      // When transferring files, parent directories are created
      // Even if .s3keep is skipped, the directory structure is preserved
      const tempDest = await createTempDir({});

      const job: TransferFileJob = {
        sourcePath: 's3:bucket/source/dir/file.txt',
        destinationPath: `local:storage${tempDest}/dir/file.txt`,
        size: 100,
      };

      mockS3Client.send.mockResolvedValue({
        Body: createReadableStream('content'),
      });

      await transferS3ToLocal(job, mockS3Client, 'test-bucket', 'source/dir/file.txt', tempDest);

      // Verify directory was created (from Task 1.4)
      expect(fs.existsSync(path.join(tempDest, 'dir'))).toBe(true);
    });
  });

  describe('S3 → S3 Transfer', () => {
    it('should copy .s3keep as regular object', async () => {
      const mockS3 = createMockS3Client();

      const job: TransferFileJob = {
        sourcePath: 's3:bucket1/source/empty/.s3keep',
        destinationPath: 's3:bucket2/dest/empty/.s3keep',
        size: 0,
      };

      await transferS3ToS3(
        job,
        mockS3,
        'bucket1',
        'source/empty/.s3keep',
        'bucket2',
        'dest/empty/.s3keep',
      );

      // Verify CopyObjectCommand was called normally
      expect(mockS3.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'bucket2',
            CopySource: 'bucket1/source/empty/.s3keep',
            Key: 'dest/empty/.s3keep',
          }),
        }),
      );
    });
  });
});
```

### Integration Tests

```typescript
describe('Empty Directory Preservation - Integration', () => {
  it('should preserve empty directories in Local → S3 → Local round trip', async () => {
    // Step 1: Create local structure with empty directory
    const sourceDir = await createTempDir({
      'project/src/main.py': 'code',
      'project/data/': null, // Empty directory
      'project/models/': null, // Another empty directory
    });

    // Step 2: Copy Local → S3
    await transferDirectory('local', sourceDir, 's3', 'test-bucket', 'backup/');

    // Verify .s3keep markers exist in S3
    const s3Objects = await listS3Objects('test-bucket', 'backup/');
    expect(s3Objects).toContain('backup/project/data/.s3keep');
    expect(s3Objects).toContain('backup/project/models/.s3keep');

    // Step 3: Copy S3 → Local
    const destDir = await createTempDir({});
    await transferDirectory('s3', 'test-bucket', 'local', destDir, 'backup/');

    // Verify empty directories exist in destination
    expect(fs.existsSync(path.join(destDir, 'project/data'))).toBe(true);
    expect(fs.existsSync(path.join(destDir, 'project/models'))).toBe(true);

    // Verify .s3keep files were not copied to local
    expect(fs.existsSync(path.join(destDir, 'project/data/.s3keep'))).toBe(false);
  });

  it('should preserve structure with only empty directories', async () => {
    const sourceDir = await createTempDir({
      'empty1/': null,
      'empty2/nested/': null,
    });

    await transferDirectory('local', sourceDir, 's3', 'test-bucket', 'empties/');

    const s3Objects = await listS3Objects('test-bucket', 'empties/');
    expect(s3Objects).toContain('empties/empty1/.s3keep');
    expect(s3Objects).toContain('empties/empty2/nested/.s3keep');
  });
});
```

## Acceptance Criteria

- [ ] `expandItemsToFiles` detects empty directories from `listLocalDirectoryRecursive`
- [ ] `.s3keep` marker FileInfo objects created for Local→S3 transfers
- [ ] `isMarker` flag added to `TransferFileJob` interface
- [ ] `transferLocalToS3` creates empty .s3keep files in S3
- [ ] `transferS3ToLocal` skips .s3keep files (verified from Task 1.4)
- [ ] `transferS3ToS3` copies .s3keep as regular objects
- [ ] Empty directories preserved in Local→S3→Local round trip
- [ ] No .s3keep markers created for Local→Local transfers
- [ ] All unit tests pass
- [ ] Integration tests verify end-to-end behavior
- [ ] TypeScript compilation succeeds

## Error Handling

### Expected Scenarios

1. **Failed to create .s3keep in S3**: Throw error with key
2. **Permission denied**: Let S3 error propagate

### Error Messages

```typescript
logger.debug(`Created .s3keep marker: ${destKey}`);
logger.debug(`Skipping .s3keep marker file: ${key}`);
```

## Performance Considerations

- `.s3keep` files are 0 bytes - minimal overhead
- Number of markers proportional to empty directories (usually small)
- No impact on transfer speed

## Related Documentation

- [Folder Copy Support Design](../folder-copy-support.md) - Section: Challenge 4 (S3 Virtual Directories)
- [Task 1.1](./task-1.1-recursive-directory-listing.md) - Empty directory detection
- [Task 1.4](./task-1.4-directory-creation.md) - Directory creation logic

## Next Steps

After completion:

1. Test with complex directory structures
2. Verify round-trip preservation (Local→S3→Local)
3. Document behavior for users

## Notes

- `.s3keep` is a convention, similar to `.gitkeep`
- The marker filename is chosen for clarity (`.s3keep` is S3-specific)
- Local→Local transfers don't need markers (OS handles empty directories natively)
- The `isMarker` flag prevents reading non-existent local files
