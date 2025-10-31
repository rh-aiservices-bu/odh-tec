import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import {
  listS3DirectoryRecursive,
  listLocalDirectoryRecursive,
  DirectoryListing,
} from '../../../../utils/directoryListing';

/**
 * Integration Tests for Folder Copy Support
 *
 * These tests validate the core directory listing and file expansion functionality
 * that powers folder copy operations. They test:
 * - T-1: S3 directory listing and expansion
 * - T-2: Local directory listing with empty dirs and symlinks
 * - T-3: Large folder detection
 * - T-4: Special character handling
 * - T-5: Path validation
 *
 * Note: Full end-to-end transfer tests would require mocking the entire transfer
 * pipeline including auth, rate limiting, and transfer queue. These tests focus on
 * the core directory expansion logic that enables folder copying.
 */
describe('Folder Copy Integration Tests', () => {
  let testDir: string;
  const s3Mock = mockClient(S3Client);
  let mockS3Client: S3Client;

  // Helper: Create a nested directory structure in filesystem
  const createLocalStructure = async (
    baseDir: string,
    structure: Record<string, string | null>,
  ): Promise<void> => {
    for (const [filepath, content] of Object.entries(structure)) {
      const fullPath = path.join(baseDir, filepath);

      if (content === null) {
        // Create empty directory
        await fs.mkdir(fullPath, { recursive: true });
      } else {
        // Create file with content
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }
    }
  };

  // Helper: Create symlink in filesystem
  const createSymlink = async (target: string, linkPath: string): Promise<void> => {
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    await fs.symlink(target, linkPath);
  };

  // Helper: Verify directory listing results
  const assertDirectoryListing = (
    listing: DirectoryListing,
    expected: {
      fileCount: number;
      totalSize: number;
      emptyDirCount?: number;
      skippedSymlinkCount?: number;
    },
  ): void => {
    expect(listing.fileCount).toBe(expected.fileCount);
    expect(listing.totalSize).toBe(expected.totalSize);
    if (expected.emptyDirCount !== undefined) {
      expect(listing.emptyDirectories.length).toBe(expected.emptyDirCount);
    }
    if (expected.skippedSymlinkCount !== undefined) {
      expect(listing.skippedSymlinks.length).toBe(expected.skippedSymlinkCount);
    }
  };

  beforeEach(async () => {
    // Reset S3 mock
    s3Mock.reset();
    mockS3Client = new S3Client({ region: 'us-east-1' });

    // Create temp directory for integration tests
    testDir = path.join(os.tmpdir(), 'odh-tec-integration-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('T-1: S3 Directory Listing and Expansion', () => {
    it('should list nested directory structure from S3', async () => {
      // Mock S3 directory listing for nested structure
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: 'data/level1/file1.txt', Size: 100 },
          { Key: 'data/level1/level2/file2.txt', Size: 200 },
          { Key: 'data/level1/level2/level3/file3.txt', Size: 300 },
        ],
      });

      const listing = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      assertDirectoryListing(listing, {
        fileCount: 3,
        totalSize: 600,
      });

      expect(listing.files).toHaveLength(3);
      expect(listing.files[0].path).toBe('data/level1/file1.txt');
      expect(listing.files[1].path).toBe('data/level1/level2/file2.txt');
      expect(listing.files[2].path).toBe('data/level1/level2/level3/file3.txt');
    });

    it('should handle S3 .s3keep markers correctly', async () => {
      // Mock S3 directory listing with .s3keep markers
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: 'data/file.txt', Size: 100 },
          { Key: 'data/empty-dir/.s3keep', Size: 0 },
          { Key: 'data/nested/empty/.s3keep', Size: 0 },
        ],
      });

      const listing = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      // .s3keep files are included in the listing (filtering happens at transfer time)
      // This is intentional: S3→S3 transfers need them, S3→Local filters them during transfer
      assertDirectoryListing(listing, {
        fileCount: 3, // All files including .s3keep markers
        totalSize: 100, // Only regular file contributes to size (.s3keep are 0 bytes)
      });

      // Verify .s3keep files are present in the listing
      expect(listing.files.some((f) => f.path.includes('.s3keep'))).toBe(true);
    });

    it('should handle large folders (>1000 files) with pagination', async () => {
      // Create mock listing with 1500 files split across pages
      const firstBatch = Array.from({ length: 1000 }, (_, i) => ({
        Key: `data/file${i}.txt`,
        Size: 100,
      }));

      const secondBatch = Array.from({ length: 500 }, (_, i) => ({
        Key: `data/file${i + 1000}.txt`,
        Size: 100,
      }));

      s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
          Contents: firstBatch,
          NextContinuationToken: 'page2',
        })
        .resolvesOnce({
          Contents: secondBatch,
        });

      const listing = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      assertDirectoryListing(listing, {
        fileCount: 1500,
        totalSize: 150000, // 1500 * 100
      });
    });

    it('should handle empty S3 directory', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [],
      });

      const listing = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      assertDirectoryListing(listing, {
        fileCount: 0,
        totalSize: 0,
      });
    });
  });

  describe('T-2: Local Directory Listing with Empty Dirs and Symlinks', () => {
    it('should list nested directory structure from local filesystem', async () => {
      // Create local structure with nested directories
      await createLocalStructure(testDir, {
        'data/level1/file1.txt': 'content1',
        'data/level1/level2/file2.txt': 'content2',
        'data/level1/level2/level3/file3.txt': 'content3',
      });

      const listing = await listLocalDirectoryRecursive(testDir, 'data');

      assertDirectoryListing(listing, {
        fileCount: 3,
        totalSize: 24, // 'content1' + 'content2' + 'content3' = 8 + 8 + 8 = 24
      });

      expect(listing.files).toHaveLength(3);
      expect(listing.files.some((f) => f.path.includes('file1.txt'))).toBe(true);
      expect(listing.files.some((f) => f.path.includes('file2.txt'))).toBe(true);
      expect(listing.files.some((f) => f.path.includes('file3.txt'))).toBe(true);
    });

    it('should detect and track empty directories', async () => {
      // Create local structure with empty directories
      await createLocalStructure(testDir, {
        'data/file.txt': 'content',
        'data/empty-dir': null, // Empty directory
        'data/nested/empty': null, // Nested empty directory
      });

      const listing = await listLocalDirectoryRecursive(testDir, 'data');

      assertDirectoryListing(listing, {
        fileCount: 1,
        totalSize: 7, // 'content'
        emptyDirCount: 2, // empty-dir and nested/empty
      });

      expect(listing.emptyDirectories).toContain('data/empty-dir');
      expect(listing.emptyDirectories).toContain('data/nested/empty');
    });

    it('should skip symbolic links and track them', async () => {
      // Create local structure with symlinks
      await createLocalStructure(testDir, {
        'data/file.txt': 'content',
        'data/target.txt': 'target content',
      });

      // Create symlink
      await createSymlink(
        path.join(testDir, 'data/target.txt'),
        path.join(testDir, 'data/link.txt'),
      );

      const listing = await listLocalDirectoryRecursive(testDir, 'data');

      assertDirectoryListing(listing, {
        fileCount: 2, // Only real files, not symlinks
        totalSize: 21, // 'content' + 'target content' = 7 + 14 = 21
        skippedSymlinkCount: 1,
      });

      // Verify symlink was tracked as skipped
      expect(listing.skippedSymlinks).toContain('data/link.txt');

      // Verify regular files were included
      expect(listing.files.some((f) => f.path.includes('file.txt'))).toBe(true);
      expect(listing.files.some((f) => f.path.includes('target.txt'))).toBe(true);

      // Verify symlink was NOT included in files
      expect(listing.files.some((f) => f.path.includes('link.txt'))).toBe(false);
    });

    it('should handle special characters in filenames', async () => {
      // Create local structure with special characters
      await createLocalStructure(testDir, {
        'data/file with spaces.txt': 'content1',
        'data/file@special#chars%.txt': 'content2',
        'data/unicode-文件.txt': 'content3',
      });

      const listing = await listLocalDirectoryRecursive(testDir, 'data');

      assertDirectoryListing(listing, {
        fileCount: 3,
        totalSize: 24, // content1 + content2 + content3
      });

      expect(listing.files.some((f) => f.path.includes('file with spaces.txt'))).toBe(true);
      expect(listing.files.some((f) => f.path.includes('file@special#chars%.txt'))).toBe(true);
      expect(listing.files.some((f) => f.path.includes('unicode-文件.txt'))).toBe(true);
    });

    it('should handle empty local directory', async () => {
      // Create empty directory
      await fs.mkdir(path.join(testDir, 'empty'), { recursive: true });

      const listing = await listLocalDirectoryRecursive(testDir, 'empty');

      assertDirectoryListing(listing, {
        fileCount: 0,
        totalSize: 0,
        emptyDirCount: 1, // The directory itself is empty
      });
    });
  });

  describe('T-3: Large Folder Detection', () => {
    it('should correctly count files in large folders (>1000 files)', async () => {
      // Create 1500 small files
      const structure: Record<string, string> = {};
      for (let i = 0; i < 1500; i++) {
        structure[`data/file${i}.txt`] = 'x'; // 1 byte each
      }

      await createLocalStructure(testDir, structure);

      const listing = await listLocalDirectoryRecursive(testDir, 'data');

      assertDirectoryListing(listing, {
        fileCount: 1500,
        totalSize: 1500,
      });
    });

    it('should correctly calculate size for large folders (>10GB equivalent)', async () => {
      // Mock S3 with files totaling >10GB
      const TEN_GB = 10 * 1024 * 1024 * 1024;
      const largeFiles = [
        { Key: 'data/file1.bin', Size: TEN_GB / 2 },
        { Key: 'data/file2.bin', Size: TEN_GB / 2 },
        { Key: 'data/file3.bin', Size: 1024 * 1024 }, // Extra 1MB
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: largeFiles,
      });

      const listing = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      assertDirectoryListing(listing, {
        fileCount: 3,
        totalSize: TEN_GB + 1024 * 1024,
      });

      expect(listing.totalSize).toBeGreaterThan(TEN_GB);
    });
  });

  describe('T-4: Path Handling', () => {
    it('should handle deeply nested paths', async () => {
      // Create deeply nested directory (10 levels)
      const deepPath = Array(10).fill('level').join('/');
      await createLocalStructure(testDir, {
        [`data/${deepPath}/file.txt`]: 'deep content',
      });

      const listing = await listLocalDirectoryRecursive(testDir, 'data');

      assertDirectoryListing(listing, {
        fileCount: 1,
        totalSize: 12, // 'deep content'
      });

      expect(listing.files[0].path).toContain('level/level/level');
    });

    it('should handle root-level files (no subdirectories)', async () => {
      await createLocalStructure(testDir, {
        'file1.txt': 'content1',
        'file2.txt': 'content2',
      });

      const listing = await listLocalDirectoryRecursive(testDir, '.');

      assertDirectoryListing(listing, {
        fileCount: 2,
        totalSize: 16, // content1 + content2
      });
    });
  });

  describe('T-5: Mixed Scenarios', () => {
    it('should handle mixed files, empty dirs, and symlinks', async () => {
      // Create complex structure
      await createLocalStructure(testDir, {
        'data/file1.txt': 'content1',
        'data/subdir/file2.txt': 'content2',
        'data/empty': null,
        'data/subdir/empty': null,
      });

      // Add symlink
      await createSymlink(
        path.join(testDir, 'data/file1.txt'),
        path.join(testDir, 'data/link.txt'),
      );

      const listing = await listLocalDirectoryRecursive(testDir, 'data');

      assertDirectoryListing(listing, {
        fileCount: 2, // Only real files
        totalSize: 16, // content1 + content2
        emptyDirCount: 2,
        skippedSymlinkCount: 1,
      });

      expect(listing.files).toHaveLength(2);
      expect(listing.emptyDirectories).toHaveLength(2);
      expect(listing.skippedSymlinks).toHaveLength(1);
    });

    it('should handle directories containing only symlinks (treated as empty)', async () => {
      // Create directory with only symlinks
      await fs.mkdir(path.join(testDir, 'data'), { recursive: true });
      await createLocalStructure(testDir, {
        'target.txt': 'target',
      });
      await createSymlink(path.join(testDir, 'target.txt'), path.join(testDir, 'data/link1.txt'));
      await createSymlink(path.join(testDir, 'target.txt'), path.join(testDir, 'data/link2.txt'));

      const listing = await listLocalDirectoryRecursive(testDir, 'data');

      // Directory with only symlinks should be treated as empty
      assertDirectoryListing(listing, {
        fileCount: 0,
        totalSize: 0,
        emptyDirCount: 1, // data/ has no real files
        skippedSymlinkCount: 2,
      });
    });
  });
});
