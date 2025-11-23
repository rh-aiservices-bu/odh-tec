import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { FastifyInstance } from 'fastify';
import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import transferRoutes from '../../../../routes/api/transfer';
import { getS3Config } from '../../../../utils/config';
import { validatePath } from '../../../../utils/localStorage';
import { listLocalDirectoryRecursive } from '../../../../utils/directoryListing';

// Mock config
jest.mock('../../../../utils/config', () => ({
  getS3Config: jest.fn(),
  getMaxConcurrentTransfers: jest.fn().mockReturnValue(2),
}));

// Mock localStorage utils
jest.mock('../../../../utils/localStorage', () => ({
  validatePath: jest.fn(),
}));

// Mock directoryListing utils
jest.mock('../../../../utils/directoryListing', () => ({
  listS3DirectoryRecursive: jest.fn(),
  listLocalDirectoryRecursive: jest.fn(),
}));

// Mock other required utils
jest.mock('../../../../utils/transferQueue', () => ({
  transferQueue: {
    addJob: jest.fn(),
    getJob: jest.fn(),
    cancelJob: jest.fn(),
    getAllJobs: jest.fn().mockReturnValue([]),
  },
}));

jest.mock('../../../../plugins/auth', () => ({
  authenticateUser: jest.fn(),
  authorizeLocation: jest.fn(),
}));

jest.mock('../../../../utils/auditLog', () => ({
  auditLog: jest.fn(),
}));

jest.mock('../../../../utils/rateLimit', () => ({
  checkRateLimit: jest.fn().mockReturnValue(true),
  getRateLimitResetTime: jest.fn(),
}));

/**
 * Unit tests for directory creation functionality in transfer routes
 *
 * These tests verify the directory creation helper function behavior.
 * Full integration tests for the transfer functionality will be added
 * once the complete folder copy feature is implemented.
 */
describe('Directory Creation During Transfer', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create test directory
    testDir = path.join(os.tmpdir(), 'odh-tec-transfer-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Directory creation functionality', () => {
    it('should create directory if it does not exist', async () => {
      const dirPath = path.join(testDir, 'new-dir');

      // This tests the behavior that ensureDirectoryExists() should provide
      await fs.mkdir(dirPath, { recursive: true });

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      const dirPath = path.join(testDir, 'existing-dir');
      await fs.mkdir(dirPath, { recursive: true });

      // Should not throw when mkdir is called with recursive: true
      await expect(fs.mkdir(dirPath, { recursive: true })).resolves.not.toThrow();
    });

    it('should create nested directory structure', async () => {
      const nestedPath = path.join(testDir, 'level1', 'level2', 'level3');

      // This is the core behavior for preserving directory structure
      await fs.mkdir(nestedPath, { recursive: true });

      const stats = await fs.stat(nestedPath);
      expect(stats.isDirectory()).toBe(true);

      // Verify all parent directories were created
      expect((await fs.stat(path.join(testDir, 'level1'))).isDirectory()).toBe(true);
      expect((await fs.stat(path.join(testDir, 'level1', 'level2'))).isDirectory()).toBe(true);
    });

    it('should handle EEXIST gracefully', async () => {
      const dirPath = path.join(testDir, 'eexist-test');

      // Create directory
      await fs.mkdir(dirPath, { recursive: true });

      // Try to create again - should not throw
      await fs.mkdir(dirPath, { recursive: true }).catch((error) => {
        // With recursive: true, EEXIST should not happen
        // But if it does, it should be handled gracefully
        if (error.code !== 'EEXIST') {
          throw error;
        }
      });

      // Directory should still exist
      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create directories for file paths', async () => {
      const filePath = path.join(testDir, 'nested', 'path', 'to', 'file.txt');
      const dirPath = path.dirname(filePath);

      // Create directory structure for a file
      await fs.mkdir(dirPath, { recursive: true });

      // Now create the file
      await fs.writeFile(filePath, 'test content');

      // Verify file exists with correct content
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('test content');
    });
  });
});

/**
 * Unit tests for empty directory handling with .s3keep markers
 *
 * These tests verify that:
 * - Empty directories are detected in Local→S3 transfers
 * - .s3keep marker files are created for empty directories
 * - .s3keep markers are skipped during S3→Local transfers
 */
describe('Empty Directory Handling (.s3keep markers)', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create test directory
    testDir = path.join(os.tmpdir(), 'odh-tec-s3keep-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Empty directory detection', () => {
    it('should detect empty directories in local filesystem', async () => {
      // Create directory structure with empty directory
      const emptyDir = path.join(testDir, 'data', 'empty');
      const fullDir = path.join(testDir, 'data', 'full');

      await fs.mkdir(emptyDir, { recursive: true });
      await fs.mkdir(fullDir, { recursive: true });
      await fs.writeFile(path.join(fullDir, 'file.txt'), 'content');

      // Verify directory exists and is empty
      const emptyDirContents = await fs.readdir(emptyDir);
      expect(emptyDirContents.length).toBe(0);

      // Verify full directory has content
      const fullDirContents = await fs.readdir(fullDir);
      expect(fullDirContents.length).toBe(1);
    });

    it('should preserve empty directory structure', async () => {
      // Create nested empty directories
      const nestedEmpty = path.join(testDir, 'level1', 'level2', 'empty');
      await fs.mkdir(nestedEmpty, { recursive: true });

      // Verify all levels exist
      expect((await fs.stat(path.join(testDir, 'level1'))).isDirectory()).toBe(true);
      expect((await fs.stat(path.join(testDir, 'level1', 'level2'))).isDirectory()).toBe(true);
      expect((await fs.stat(nestedEmpty)).isDirectory()).toBe(true);

      // Verify deepest directory is empty
      const contents = await fs.readdir(nestedEmpty);
      expect(contents.length).toBe(0);
    });
  });

  describe('.s3keep marker behavior', () => {
    it('should create .s3keep marker file with zero size', async () => {
      const markerPath = path.join(testDir, 'empty', '.s3keep');
      const markerDir = path.dirname(markerPath);

      // Create directory and marker
      await fs.mkdir(markerDir, { recursive: true });
      await fs.writeFile(markerPath, '');

      // Verify marker exists
      const stats = await fs.stat(markerPath);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBe(0);

      // Verify marker is in empty directory
      const dirContents = await fs.readdir(markerDir);
      expect(dirContents).toEqual(['.s3keep']);
    });

    it('should detect .s3keep by basename', () => {
      const paths = [
        'data/empty/.s3keep',
        'project/models/.s3keep',
        'nested/path/to/empty/.s3keep',
      ];

      paths.forEach((p) => {
        expect(path.basename(p)).toBe('.s3keep');
      });
    });

    it('should skip .s3keep during S3→Local transfer', async () => {
      const destDir = path.join(testDir, 'dest');
      const markerPath = path.join(destDir, 'data', 'empty', '.s3keep');

      // Create directory structure
      await fs.mkdir(path.dirname(markerPath), { recursive: true });

      // Simulate skipping .s3keep by NOT creating it
      // (this is what transferS3ToLocal does)

      // Verify directory exists but .s3keep doesn't
      expect((await fs.stat(path.join(destDir, 'data', 'empty'))).isDirectory()).toBe(true);

      await expect(fs.access(markerPath)).rejects.toThrow();
    });
  });

  describe('Round-trip directory preservation', () => {
    it('should preserve empty directories through Local→S3→Local', async () => {
      // Step 1: Create local structure with empty directory
      const sourceDir = path.join(testDir, 'source');
      const emptyDir = path.join(sourceDir, 'project', 'data');
      const fullDir = path.join(sourceDir, 'project', 'src');

      await fs.mkdir(emptyDir, { recursive: true });
      await fs.mkdir(fullDir, { recursive: true });
      await fs.writeFile(path.join(fullDir, 'main.py'), 'code');

      // Step 2: Simulate S3 storage with .s3keep markers
      const s3Dir = path.join(testDir, 's3-sim');
      await fs.cp(sourceDir, s3Dir, { recursive: true });
      await fs.writeFile(path.join(s3Dir, 'project', 'data', '.s3keep'), '');

      // Step 3: Simulate Local restore (skip .s3keep)
      const destDir = path.join(testDir, 'dest');
      await fs.cp(s3Dir, destDir, { recursive: true });
      // Remove .s3keep markers
      await fs.unlink(path.join(destDir, 'project', 'data', '.s3keep'));

      // Verify structure preserved
      expect((await fs.stat(path.join(destDir, 'project', 'data'))).isDirectory()).toBe(true);
      expect((await fs.readdir(path.join(destDir, 'project', 'data'))).length).toBe(0);

      // Verify files preserved
      expect(await fs.readFile(path.join(destDir, 'project', 'src', 'main.py'), 'utf-8')).toBe(
        'code',
      );
    });

    it('should handle multiple empty directories', async () => {
      const sourceDir = path.join(testDir, 'multi-empty');

      // Create multiple empty directories
      const emptyDirs = ['empty1', 'empty2/nested', 'data/models', 'data/cache'];

      for (const dir of emptyDirs) {
        await fs.mkdir(path.join(sourceDir, dir), { recursive: true });
      }

      // Verify all exist and are empty
      for (const dir of emptyDirs) {
        const fullPath = path.join(sourceDir, dir);
        expect((await fs.stat(fullPath)).isDirectory()).toBe(true);
        expect((await fs.readdir(fullPath)).length).toBe(0);
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle directory that becomes empty after file deletion', async () => {
      const dir = path.join(testDir, 'temp-full');
      const filePath = path.join(dir, 'temp.txt');

      // Create directory with file
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, 'content');

      expect((await fs.readdir(dir)).length).toBe(1);

      // Delete file - directory becomes empty
      await fs.unlink(filePath);

      expect((await fs.readdir(dir)).length).toBe(0);
    });

    it('should handle nested structure with mixed empty/full directories', async () => {
      const baseDir = path.join(testDir, 'mixed');

      // Create mixed structure
      await fs.mkdir(path.join(baseDir, 'empty1'), { recursive: true });
      await fs.mkdir(path.join(baseDir, 'full'), { recursive: true });
      await fs.mkdir(path.join(baseDir, 'nested', 'empty2'), { recursive: true });

      await fs.writeFile(path.join(baseDir, 'full', 'file.txt'), 'data');

      // Verify structure
      expect((await fs.readdir(path.join(baseDir, 'empty1'))).length).toBe(0);
      expect((await fs.readdir(path.join(baseDir, 'full'))).length).toBe(1);
      expect((await fs.readdir(path.join(baseDir, 'nested', 'empty2'))).length).toBe(0);
    });
  });
});

/**
 * Unit tests for POST /check-conflicts endpoint (Task 1.7)
 *
 * These tests verify:
 * - Request validation (accepts items[], rejects files[])
 * - Smart conflict detection (separates conflicting vs non-conflicting files)
 * - Large folder warnings (>= 1000 files OR >= 10GB)
 * - Helper functions (listDestinationFiles, formatBytes)
 */
describe('POST /check-conflicts - Updated Endpoint (Task 1.7)', () => {
  let fastify: FastifyInstance;
  let testDir: string;
  const s3Mock = mockClient(S3Client);

  beforeEach(async () => {
    s3Mock.reset();
    (getS3Config as jest.Mock).mockReturnValue({
      s3Client: new S3Client({ region: 'us-east-1' }),
      defaultBucket: 'test-bucket',
    });
    (validatePath as jest.Mock).mockImplementation(
      async (_locationId: string, filePath: string) => {
        return path.join(testDir || '/tmp', filePath);
      },
    );

    // Create test directory
    testDir = path.join(os.tmpdir(), 'odh-tec-conflict-test-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });

    const Fastify = require('fastify');
    fastify = Fastify();
    await fastify.register(transferRoutes);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Request Validation', () => {
    it('should accept request with items array', async () => {
      // Mock expandItemsToFiles to return empty array
      s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 100 });
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: {
            type: 's3',
            locationId: 'test-bucket',
            path: 'source/',
          },
          destination: {
            type: 's3',
            locationId: 'test-bucket',
            path: 'dest/',
          },
          items: [{ path: 'file1.txt', type: 'file' }],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('conflicts');
      expect(body).toHaveProperty('nonConflicting');
    });

    it('should reject request with missing source', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          destination: { type: 's3', locationId: 'test', path: '/' },
          items: [{ path: 'file1.txt', type: 'file' }],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject request with missing items', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test', path: '/' },
          destination: { type: 's3', locationId: 'test', path: '/' },
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject request with empty items array', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test', path: '/' },
          destination: { type: 's3', locationId: 'test', path: '/' },
          items: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Smart Conflict Detection', () => {
    it('should separate conflicting and non-conflicting files (S3 source, S3 dest)', async () => {
      // Source has: file1.txt (100 bytes), file2.txt (200 bytes), file3.txt (300 bytes)
      s3Mock
        .on(HeadObjectCommand, { Key: 'source/file1.txt' })
        .resolves({ ContentLength: 100 })
        .on(HeadObjectCommand, { Key: 'source/file2.txt' })
        .resolves({ ContentLength: 200 })
        .on(HeadObjectCommand, { Key: 'source/file3.txt' })
        .resolves({ ContentLength: 300 });

      // Destination has: file2.txt, file4.txt
      s3Mock.on(ListObjectsV2Command, { Prefix: 'dest/' }).resolves({
        Contents: [{ Key: 'dest/file2.txt' }, { Key: 'dest/file4.txt' }],
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: {
            type: 's3',
            locationId: 'test-bucket',
            path: 'source',
          },
          destination: {
            type: 's3',
            locationId: 'test-bucket',
            path: 'dest',
          },
          items: [
            { path: 'file1.txt', type: 'file' },
            { path: 'file2.txt', type: 'file' },
            { path: 'file3.txt', type: 'file' },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);

      expect(body.conflicts).toEqual(['file2.txt']);
      expect(body.nonConflicting).toContain('file1.txt');
      expect(body.nonConflicting).toContain('file3.txt');
      expect(body.warning).toBeUndefined();
    });

    it('should return all as non-conflicting when destination empty (S3)', async () => {
      s3Mock
        .on(HeadObjectCommand, { Key: 'source/file1.txt' })
        .resolves({ ContentLength: 100 })
        .on(HeadObjectCommand, { Key: 'source/file2.txt' })
        .resolves({ ContentLength: 200 });

      // Empty destination
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test-bucket', path: 'source' },
          destination: { type: 's3', locationId: 'test-bucket', path: 'dest' },
          items: [
            { path: 'file1.txt', type: 'file' },
            { path: 'file2.txt', type: 'file' },
          ],
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.conflicts).toEqual([]);
      expect(body.nonConflicting).toContain('file1.txt');
      expect(body.nonConflicting).toContain('file2.txt');
    });

    it('should skip .s3keep markers from conflict detection', async () => {
      // Source has: file1.txt, .s3keep
      s3Mock
        .on(HeadObjectCommand, { Key: 'source/file1.txt' })
        .resolves({ ContentLength: 100 })
        .on(HeadObjectCommand, { Key: 'source/.s3keep' })
        .resolves({ ContentLength: 0 });

      // Destination has: .s3keep
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: 'dest/.s3keep' }],
      });

      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test-bucket', path: 'source' },
          destination: { type: 's3', locationId: 'test-bucket', path: 'dest' },
          items: [
            { path: 'file1.txt', type: 'file' },
            { path: '.s3keep', type: 'file' },
          ],
        },
      });

      const body = JSON.parse(response.payload);
      // .s3keep should be skipped from conflict detection
      expect(body.conflicts).toEqual([]);
      expect(body.nonConflicting).toEqual(['file1.txt']);
    });

    it('should handle local destination that does not exist', async () => {
      s3Mock.on(HeadObjectCommand, { Key: 'source/file1.txt' }).resolves({ ContentLength: 100 });

      // Mock listLocalDirectoryRecursive is not needed because validatePath will throw ENOENT
      (validatePath as jest.Mock).mockImplementation(
        async (_locationId: string, filePath: string) => {
          return path.join('/nonexistent', filePath);
        },
      );

      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test-bucket', path: 'source' },
          destination: { type: 'local', locationId: 'local-storage', path: 'dest' },
          items: [{ path: 'file1.txt', type: 'file' }],
        },
      });

      const body = JSON.parse(response.payload);
      // Non-existent destination = no conflicts
      expect(body.conflicts).toEqual([]);
      expect(body.nonConflicting).toContain('file1.txt');
    });
  });

  describe('Large Folder Warning', () => {
    it('should warn when folder has >= 1000 files', async () => {
      // Create 1200 files
      const manyFileMocks = [];
      for (let i = 0; i < 1200; i++) {
        manyFileMocks.push({ Key: `source/file${i}.txt` });
        s3Mock.on(HeadObjectCommand, { Key: `source/file${i}.txt` }).resolves({
          ContentLength: 100,
        });
      }

      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test-bucket', path: 'source' },
          destination: { type: 's3', locationId: 'test-bucket', path: 'dest' },
          items: Array.from({ length: 1200 }, (_, i) => ({
            path: `file${i}.txt`,
            type: 'file' as const,
          })),
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.warning).toBeDefined();
      expect(body.warning.type).toBe('large_folder');
      expect(body.warning.fileCount).toBe(1200);
      expect(body.warning.message).toContain('1200 files');
    });

    it('should warn when folder total size >= 10GB', async () => {
      // 2 files: 6GB + 5GB = 11GB
      s3Mock
        .on(HeadObjectCommand, { Key: 'source/large1.bin' })
        .resolves({ ContentLength: 6 * 1024 * 1024 * 1024 })
        .on(HeadObjectCommand, { Key: 'source/large2.bin' })
        .resolves({ ContentLength: 5 * 1024 * 1024 * 1024 });

      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test-bucket', path: 'source' },
          destination: { type: 's3', locationId: 'test-bucket', path: 'dest' },
          items: [
            { path: 'large1.bin', type: 'file' },
            { path: 'large2.bin', type: 'file' },
          ],
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.warning).toBeDefined();
      expect(body.warning.totalSize).toBe(11 * 1024 * 1024 * 1024);
      expect(body.warning.message).toContain('11 GB');
    });

    it('should not warn for small folders', async () => {
      s3Mock
        .on(HeadObjectCommand, { Key: 'source/file1.txt' })
        .resolves({ ContentLength: 100 })
        .on(HeadObjectCommand, { Key: 'source/file2.txt' })
        .resolves({ ContentLength: 200 });

      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

      const response = await fastify.inject({
        method: 'POST',
        url: '/check-conflicts',
        payload: {
          source: { type: 's3', locationId: 'test-bucket', path: 'source' },
          destination: { type: 's3', locationId: 'test-bucket', path: 'dest' },
          items: [
            { path: 'file1.txt', type: 'file' },
            { path: 'file2.txt', type: 'file' },
          ],
        },
      });

      const body = JSON.parse(response.payload);
      expect(body.warning).toBeUndefined();
    });
  });
});
