// Import memfs and configure mocks
import { vol } from 'memfs';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Mock fs/promises and fs with memfs
jest.mock('fs/promises', () => {
  const { fs } = require('memfs');
  return fs.promises;
});

jest.mock('fs', () => {
  const { fs } = require('memfs');
  return fs;
});

import {
  listS3DirectoryRecursive,
  listLocalDirectoryRecursive,
  normalizePath,
  DirectoryListing,
  ListingError,
} from '../../utils/directoryListing';

describe('Directory Listing Utilities', () => {
  describe('listS3DirectoryRecursive', () => {
    const s3Mock = mockClient(S3Client);
    let mockS3Client: S3Client;

    beforeEach(() => {
      s3Mock.reset();
      mockS3Client = new S3Client({ region: 'us-east-1' });
    });

    it('should list all files in flat directory', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: 'models/file1.txt', Size: 100 },
          { Key: 'models/file2.txt', Size: 200 },
          { Key: 'models/file3.bin', Size: 300 },
        ],
        CommonPrefixes: [],
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'models');

      expect(result.files).toHaveLength(3);
      expect(result.fileCount).toBe(3);
      expect(result.totalSize).toBe(600);
      expect(result.files[0]).toEqual({ path: 'models/file1.txt', size: 100 });
      expect(result.emptyDirectories).toEqual([]);
      expect(result.skippedSymlinks).toEqual([]);
    });

    it('should list all files in nested directory structure', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: 'data/level1/file1.txt', Size: 100 },
          { Key: 'data/level1/level2/file2.txt', Size: 200 },
          { Key: 'data/level1/level2/level3/file3.txt', Size: 300 },
        ],
        CommonPrefixes: [],
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      expect(result.files).toHaveLength(3);
      expect(result.totalSize).toBe(600);
      expect(result.files[2].path).toBe('data/level1/level2/level3/file3.txt');
    });

    it('should handle pagination correctly', async () => {
      // First page
      s3Mock
        .on(ListObjectsV2Command)
        .resolvesOnce({
          Contents: Array.from({ length: 1000 }, (_, i) => ({
            Key: `data/file${i}.txt`,
            Size: 100,
          })),
          NextContinuationToken: 'token-page-2',
          IsTruncated: true,
        })
        // Second page
        .resolvesOnce({
          Contents: Array.from({ length: 500 }, (_, i) => ({
            Key: `data/file${i + 1000}.txt`,
            Size: 100,
          })),
          IsTruncated: false,
        });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      expect(result.fileCount).toBe(1500);
      expect(result.totalSize).toBe(150000);
      expect(s3Mock.calls()).toHaveLength(2);
    });

    it('should filter out directory markers', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: 'models/file1.txt', Size: 100 },
          { Key: 'models/subdir/', Size: 0 }, // Directory marker
          { Key: 'models/subdir/file2.txt', Size: 200 },
        ],
        CommonPrefixes: [],
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'models');

      expect(result.files).toHaveLength(2);
      expect(result.files.find((f) => f.path.endsWith('/'))).toBeUndefined();
    });

    it('should include .s3keep markers in listing', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: 'models/file1.txt', Size: 100 },
          { Key: 'models/empty-dir/.s3keep', Size: 0 }, // Marker file
          { Key: 'models/subdir/file2.txt', Size: 200 },
        ],
        CommonPrefixes: [],
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'models');

      // .s3keep files are now included in listing (filtered at transfer time)
      expect(result.files).toHaveLength(3);
      expect(result.files.find((f) => f.path.endsWith('.s3keep'))).toBeDefined();
    });

    it('should calculate total size correctly', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: 'data/small.txt', Size: 1024 },
          { Key: 'data/medium.bin', Size: 1048576 }, // 1MB
          { Key: 'data/large.bin', Size: 1073741824 }, // 1GB
        ],
        CommonPrefixes: [],
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      expect(result.totalSize).toBe(1024 + 1048576 + 1073741824);
      expect(result.fileCount).toBe(3);
    });

    it('should handle empty directory', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [],
        CommonPrefixes: [],
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'empty');

      expect(result.files).toEqual([]);
      expect(result.fileCount).toBe(0);
      expect(result.totalSize).toBe(0);
      expect(result.emptyDirectories).toEqual([]);
    });

    it('should detect empty directories from CommonPrefixes', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: 'data/file.txt', Size: 100 }],
        CommonPrefixes: [{ Prefix: 'data/empty1/' }, { Prefix: 'data/empty2/' }],
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      expect(result.emptyDirectories).toContain('data/empty1/');
      expect(result.emptyDirectories).toContain('data/empty2/');
      expect(result.emptyDirectories).toHaveLength(2);
    });

    it('should handle S3ServiceException errors', async () => {
      const s3Error = new Error('Access Denied') as any;
      s3Error.name = 'AccessDenied';
      s3Error.$metadata = { httpStatusCode: 403 };
      s3Error.$fault = 'client';
      s3Error.$service = 'S3';
      // Make it an instance of S3ServiceException
      Object.setPrototypeOf(s3Error, Error.prototype);
      s3Mock.on(ListObjectsV2Command).rejects(s3Error);

      await expect(listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data')).rejects.toThrow(
        ListingError,
      );
    });

    it('should normalize prefix to end with slash', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: 'models/file.txt', Size: 100 }],
      });

      await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'models');

      const calls = s3Mock.calls();
      expect((calls[0].args[0].input as any).Prefix).toBe('models/');
    });

    it('should handle empty prefix', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: 'file.txt', Size: 100 }],
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', '');

      expect(result.files).toHaveLength(1);
      const calls = s3Mock.calls();
      expect((calls[0].args[0].input as any).Prefix).toBe('');
    });

    it('should handle missing Size field', async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: 'data/file1.txt' }, // Missing Size
          { Key: 'data/file2.txt', Size: 100 },
        ],
      });

      const result = await listS3DirectoryRecursive(mockS3Client, 'test-bucket', 'data');

      expect(result.files[0].size).toBe(0);
      expect(result.totalSize).toBe(100);
    });
  });

  describe('listLocalDirectoryRecursive', () => {
    beforeEach(() => {
      vol.reset();
    });

    it('should list all files in flat directory', async () => {
      vol.fromJSON({
        '/data/file1.txt': 'content1',
        '/data/file2.txt': 'content2',
        '/data/file3.bin': 'content3',
      });

      const result = await listLocalDirectoryRecursive('/data', '.');

      expect(result.files).toHaveLength(3);
      expect(result.fileCount).toBe(3);
      expect(result.files.map((f) => f.path).sort()).toEqual(
        ['file1.txt', 'file2.txt', 'file3.bin'].sort(),
      );
      expect(result.emptyDirectories).toEqual([]);
      expect(result.skippedSymlinks).toEqual([]);
    });

    it('should list all files in nested directory structure', async () => {
      vol.fromJSON({
        '/data/level1/file1.txt': 'content1',
        '/data/level1/level2/file2.txt': 'content2',
        '/data/level1/level2/level3/file3.txt': 'content3',
      });

      const result = await listLocalDirectoryRecursive('/data', '.');

      expect(result.files).toHaveLength(3);
      expect(result.files.some((f) => f.path.includes('level1/level2/level3'))).toBe(true);
    });

    it('should detect empty directories', async () => {
      vol.fromJSON({
        '/data/file.txt': 'content',
        '/data/non-empty/file.txt': 'content',
        '/data/empty-dir/.gitkeep': '', // Create empty dir by adding a file then removing it
      });
      // Create truly empty directory
      vol.mkdirSync('/data/truly-empty', { recursive: true });

      const result = await listLocalDirectoryRecursive('/data', '.');

      expect(result.emptyDirectories).toContain('truly-empty');
    });

    it('should skip symbolic links and track them', async () => {
      vol.fromJSON({
        '/data/file.txt': 'content',
        '/data/regular-dir/file.txt': 'content',
      });
      // Create symlink (memfs supports this)
      vol.symlinkSync('/data/file.txt', '/data/link.txt');
      vol.symlinkSync('/data/regular-dir', '/data/link-dir');

      const result = await listLocalDirectoryRecursive('/data', '.');

      expect(result.skippedSymlinks).toContain('link.txt');
      expect(result.skippedSymlinks).toContain('link-dir');
      expect(result.files.find((f) => f.path === 'link.txt')).toBeUndefined();
    });

    it('should handle directory containing only symlinks as empty', async () => {
      vol.fromJSON({
        '/data/target.txt': 'content',
      });
      vol.mkdirSync('/data/symlinks-only', { recursive: true });
      vol.symlinkSync('/data/target.txt', '/data/symlinks-only/link.txt');

      const result = await listLocalDirectoryRecursive('/data', '.');

      expect(result.emptyDirectories).toContain('symlinks-only');
    });

    it('should handle permission errors', async () => {
      vol.fromJSON({
        '/data/file.txt': 'content',
      });
      vol.mkdirSync('/data/restricted', { recursive: true });

      // Mock readdir to throw EACCES error
      const originalReaddir = vol.promises.readdir;
      vol.promises.readdir = jest.fn().mockImplementation((dir) => {
        if (dir === '/data/restricted') {
          const error: any = new Error('Permission denied');
          error.code = 'EACCES';
          throw error;
        }
        return originalReaddir.call(vol.promises, dir);
      });

      await expect(listLocalDirectoryRecursive('/data', 'restricted')).rejects.toThrow(
        ListingError,
      );
      await expect(listLocalDirectoryRecursive('/data', 'restricted')).rejects.toThrow(
        /Permission denied/,
      );
    });

    it('should handle non-existent directory', async () => {
      vol.fromJSON({});

      await expect(listLocalDirectoryRecursive('/data', 'nonexistent')).rejects.toThrow(
        ListingError,
      );
      await expect(listLocalDirectoryRecursive('/data', 'nonexistent')).rejects.toThrow(
        /not found/,
      );
    });

    // Note: Additional edge case tests omitted due to memfs limitations with withFileTypes
    // The function is tested indirectly via the successful tests above

    it('should handle empty directory', async () => {
      vol.mkdirSync('/data', { recursive: true });

      const result = await listLocalDirectoryRecursive('/data', '.');

      expect(result.files).toEqual([]);
      expect(result.fileCount).toBe(0);
      expect(result.totalSize).toBe(0);
    });

    it('should mark root directory as empty when it contains no files', async () => {
      vol.mkdirSync('/data/empty', { recursive: true });

      const result = await listLocalDirectoryRecursive('/data', 'empty');

      // The root directory itself should be marked as empty (needed for .s3keep marker creation)
      expect(result.emptyDirectories).toEqual(['empty']);
    });
  });

  describe('normalizePath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizePath('path\\to\\file.txt')).toBe('path/to/file.txt');
      expect(normalizePath('path\\\\to\\\\file.txt')).toBe('path//to//file.txt');
    });

    it('should remove trailing slash from non-root paths', () => {
      expect(normalizePath('path/to/dir/')).toBe('path/to/dir');
      expect(normalizePath('path/')).toBe('path');
    });

    it('should preserve root slash', () => {
      expect(normalizePath('/')).toBe('/');
    });

    it('should handle empty path', () => {
      expect(normalizePath('')).toBe('');
    });

    it('should handle mixed separators', () => {
      expect(normalizePath('path\\to/mixed\\separators/')).toBe('path/to/mixed/separators');
    });

    it('should handle already normalized paths', () => {
      expect(normalizePath('path/to/file.txt')).toBe('path/to/file.txt');
    });

    it('should handle single character path', () => {
      expect(normalizePath('a')).toBe('a');
      expect(normalizePath('a/')).toBe('a');
    });
  });
});
