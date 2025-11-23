# Task 1.4: Ensure Directory Creation in Transfer Functions

**Task ID:** 1.4
**Phase:** Phase 1 - Backend Core Functionality
**Status:** Not Started
**Estimated Effort:** 1 hour
**Priority:** High

## Overview

Modify all four transfer functions to ensure destination directories are created before transferring files. This is essential for preserving directory structure when copying folders.

## Prerequisites

- Understanding of Node.js fs.mkdir with recursive option
- Familiarity with the four transfer functions
- Knowledge of path manipulation

## Dependencies

**Requires:**

- Task 1.3 (Directory Expansion Logic) - provides file list with paths

**Blocks:**

- Integration testing of folder transfers

## Files to Modify

- `backend/src/routes/api/transfer/index.ts`

## Implementation Steps

### Step 1: Import Path Module

Ensure path module is imported at the top of the file:

```typescript
import * as path from 'path';
import * as fs from 'fs/promises';
```

### Step 2: Update transferS3ToLocal Function

Find the `transferS3ToLocal` function and add directory creation logic:

```typescript
async function transferS3ToLocal(
  job: TransferFileJob,
  s3Client: S3Client,
  bucket: string,
  sourcePath: string,
  destPath: string,
) {
  // Extract key from sourcePath (format: "s3:locationId/path/to/file")
  const key = sourcePath.split('/').slice(2).join('/');

  // Skip .s3keep marker files during transfer
  if (path.basename(key) === '.s3keep') {
    logger.debug(`Skipping .s3keep marker file: ${key}`);
    return; // Skip this file
  }

  // Build absolute destination path
  const absolutePath = path.join(destPath, path.basename(key));

  // ⭐ NEW: Create parent directory structure before writing file
  const destDir = path.dirname(absolutePath);
  try {
    await fs.mkdir(destDir, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw new Error(`Failed to create directory ${destDir}: ${error.message}`);
    }
  }

  // Get object from S3
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const response = await s3Client.send(command);

  // Stream to local file
  const writeStream = createWriteStream(absolutePath);
  await pipeline(response.Body as Readable, writeStream);
}
```

### Step 3: Update transferLocalToS3 Function

S3 doesn't need directory creation (object keys preserve structure), but add comment for clarity:

```typescript
async function transferLocalToS3(
  job: TransferFileJob,
  s3Client: S3Client,
  bucket: string,
  sourcePath: string,
  destKey: string,
) {
  // Read local file
  const readStream = createReadStream(sourcePath);

  // ⭐ NOTE: S3 doesn't need directory creation - object keys preserve structure
  // The key itself can contain '/' characters which act as virtual directories

  // Upload to S3
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: destKey,
    Body: readStream,
  });

  await s3Client.send(command);
}
```

### Step 4: Update transferLocalToLocal Function

```typescript
async function transferLocalToLocal(job: TransferFileJob, sourcePath: string, destPath: string) {
  // ⭐ NEW: Create parent directory structure before copying file
  const destDir = path.dirname(destPath);
  try {
    await fs.mkdir(destDir, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw new Error(`Failed to create directory ${destDir}: ${error.message}`);
    }
  }

  // Copy file
  await fs.copyFile(sourcePath, destPath);
}
```

### Step 5: Update transferS3ToS3 Function

S3 to S3 doesn't need directory creation:

```typescript
async function transferS3ToS3(
  job: TransferFileJob,
  s3Client: S3Client,
  sourceBucket: string,
  sourceKey: string,
  destBucket: string,
  destKey: string,
) {
  // ⭐ NOTE: S3 doesn't need directory creation - object keys preserve structure
  // CopyObjectCommand handles the key path automatically

  const command = new CopyObjectCommand({
    Bucket: destBucket,
    CopySource: `${sourceBucket}/${sourceKey}`,
    Key: destKey,
  });

  await s3Client.send(command);
}
```

### Step 6: Add Helper Function for Directory Creation

Add a reusable helper function:

```typescript
/**
 * Ensures a directory exists, creating it and all parent directories if needed
 * Handles EEXIST gracefully (already exists)
 *
 * @param dirPath - Absolute path to directory
 */
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    // EEXIST is fine - directory already exists
    if (error.code !== 'EEXIST') {
      throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
    }
  }
}
```

Then use it in the transfer functions:

```typescript
// In transferS3ToLocal
const destDir = path.dirname(absolutePath);
await ensureDirectoryExists(destDir);

// In transferLocalToLocal
const destDir = path.dirname(destPath);
await ensureDirectoryExists(destDir);
```

## Testing Requirements

### Unit Tests

Add to `backend/src/routes/api/transfer/index.test.ts`:

```typescript
describe('Directory Creation During Transfer', () => {
  describe('transferS3ToLocal', () => {
    it('should create nested directories before writing file', async () => {
      const job = {
        sourcePath: 's3:bucket/source/dir1/dir2/file.txt',
        destinationPath: 'local:storage/dest/dir1/dir2/file.txt',
        size: 1024,
      };

      // Mock S3 GetObjectCommand
      mockS3Client.send.mockResolvedValue({
        Body: createReadableStream('test content'),
      });

      await transferS3ToLocal(
        job,
        mockS3Client,
        'bucket',
        'source/dir1/dir2/file.txt',
        '/tmp/dest',
      );

      // Verify directory was created
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/dest/dir1/dir2', { recursive: true });

      // Verify file was written
      expect(fs.existsSync('/tmp/dest/dir1/dir2/file.txt')).toBe(true);
    });

    it('should handle existing directory gracefully', async () => {
      // Directory already exists
      await fs.mkdir('/tmp/existing/dir', { recursive: true });

      const job = {
        sourcePath: 's3:bucket/file.txt',
        destinationPath: 'local:storage/existing/dir/file.txt',
        size: 512,
      };

      // Should not throw error
      await expect(
        transferS3ToLocal(job, mockS3Client, 'bucket', 'file.txt', '/tmp/existing/dir'),
      ).resolves.not.toThrow();
    });

    it('should skip .s3keep marker files', async () => {
      const job = {
        sourcePath: 's3:bucket/empty/.s3keep',
        destinationPath: 'local:storage/empty/.s3keep',
        size: 0,
      };

      await transferS3ToLocal(job, mockS3Client, 'bucket', 'empty/.s3keep', '/tmp/dest');

      // Verify S3 GetObject was NOT called
      expect(mockS3Client.send).not.toHaveBeenCalled();

      // Verify directory was created (even though file skipped)
      expect(fs.existsSync('/tmp/dest/empty')).toBe(true);
    });
  });

  describe('transferLocalToLocal', () => {
    it('should create nested directories before copying file', async () => {
      const sourceFile = await createTempFile('source.txt', 'content');
      const destPath = '/tmp/dest/nested/path/target.txt';

      const job = {
        sourcePath: sourceFile,
        destinationPath: destPath,
        size: 7,
      };

      await transferLocalToLocal(job, sourceFile, destPath);

      // Verify directory was created
      expect(fs.existsSync('/tmp/dest/nested/path')).toBe(true);

      // Verify file was copied
      expect(fs.existsSync(destPath)).toBe(true);
      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('content');
    });

    it('should throw error on permission denied', async () => {
      const sourceFile = await createTempFile('source.txt', 'content');
      const restrictedDir = '/root/restricted'; // Assume no permission

      // Mock mkdir to throw EACCES
      jest.spyOn(fs, 'mkdir').mockRejectedValue({
        code: 'EACCES',
        message: 'Permission denied',
      });

      await expect(
        transferLocalToLocal(
          { sourcePath: sourceFile, destinationPath: `${restrictedDir}/file.txt`, size: 7 },
          sourceFile,
          `${restrictedDir}/file.txt`,
        ),
      ).rejects.toThrow('Failed to create directory');
    });
  });

  describe('ensureDirectoryExists helper', () => {
    it('should create directory if it does not exist', async () => {
      const dirPath = '/tmp/test-dir-' + Date.now();

      await ensureDirectoryExists(dirPath);

      expect(fs.existsSync(dirPath)).toBe(true);
      await fs.rmdir(dirPath);
    });

    it('should not throw if directory already exists', async () => {
      const dirPath = '/tmp/existing-' + Date.now();
      await fs.mkdir(dirPath, { recursive: true });

      await expect(ensureDirectoryExists(dirPath)).resolves.not.toThrow();

      await fs.rmdir(dirPath);
    });

    it('should throw on non-EEXIST errors', async () => {
      jest.spyOn(fs, 'mkdir').mockRejectedValue({
        code: 'EACCES',
        message: 'Permission denied',
      });

      await expect(ensureDirectoryExists('/restricted/path')).rejects.toThrow(
        'Failed to create directory',
      );
    });
  });
});
```

### Integration Tests

```typescript
describe('Folder Transfer - Directory Structure', () => {
  it('should preserve nested directory structure (S3 → Local)', async () => {
    // Setup: Create S3 directory with nested structure
    await setupS3Files('test-bucket', {
      'models/config.json': 'config',
      'models/weights/layer1.bin': 'layer1',
      'models/weights/layer2.bin': 'layer2',
      'models/tokenizer/vocab.txt': 'vocab',
    });

    // Transfer entire models/ directory
    await app.inject({
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

    // Wait for transfer to complete
    await waitForTransferComplete();

    // Verify directory structure preserved
    expect(fs.existsSync('/tmp/dest/models/config.json')).toBe(true);
    expect(fs.existsSync('/tmp/dest/models/weights/layer1.bin')).toBe(true);
    expect(fs.existsSync('/tmp/dest/models/weights/layer2.bin')).toBe(true);
    expect(fs.existsSync('/tmp/dest/models/tokenizer/vocab.txt')).toBe(true);
  });

  it('should preserve structure (Local → Local)', async () => {
    // Create local source structure
    await createLocalStructure('/tmp/source', {
      'data/train/samples.csv': 'train data',
      'data/test/samples.csv': 'test data',
    });

    await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: {
        source: {
          type: 'local',
          locationId: 'local-storage',
          path: '/tmp/source/',
        },
        destination: {
          type: 'local',
          locationId: 'local-storage',
          path: '/tmp/dest/',
        },
        items: [{ path: 'data/', type: 'directory' }],
        conflictResolution: 'skip',
      },
    });

    await waitForTransferComplete();

    expect(fs.existsSync('/tmp/dest/data/train/samples.csv')).toBe(true);
    expect(fs.existsSync('/tmp/dest/data/test/samples.csv')).toBe(true);
  });
});
```

## Acceptance Criteria

- [ ] `transferS3ToLocal` creates directories before writing files
- [ ] `transferLocalToLocal` creates directories before copying files
- [ ] `transferS3ToS3` documented (no directory creation needed)
- [ ] `transferLocalToS3` documented (no directory creation needed)
- [ ] `.s3keep` marker files are skipped in `transferS3ToLocal`
- [ ] `ensureDirectoryExists` helper function implemented
- [ ] EEXIST errors handled gracefully (directory already exists)
- [ ] Other errors (EACCES, etc.) thrown with context
- [ ] All unit tests pass
- [ ] Integration tests verify structure preservation
- [ ] TypeScript compilation succeeds

## Error Handling

### Expected Errors

1. **Permission Denied**: Throw with directory path
2. **Disk Full**: Let native error propagate
3. **Invalid Path**: Let fs.mkdir throw native error

### Error Messages

```typescript
throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
```

## Related Documentation

- [Folder Copy Support Design](../folder-copy-support.md) - Section: Path Preservation
- [Node.js fs.mkdir](https://nodejs.org/api/fs.html#fsmkdirpath-options-callback)

## Next Steps

After completion:

1. Integration testing of end-to-end folder transfers
2. Task 1.5 (Empty Directory Handling) builds on this

## Notes

- `{ recursive: true }` option creates entire path including parent directories
- EEXIST error is expected and safe to ignore
- .s3keep files are skipped here; they're created in Task 1.5
- S3 transfers don't need directory creation - keys are flat strings
