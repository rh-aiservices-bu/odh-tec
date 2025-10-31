# Task 1.2: Update Transfer Request Interface (Breaking Change)

**Task ID:** 1.2
**Phase:** Phase 1 - Backend Core Functionality
**Status:** Not Started
**Estimated Effort:** 30 minutes
**Priority:** High (Foundational)

## Overview

Update the transfer API to use `items: TransferItem[]` instead of `files: string[]`, enabling the backend to distinguish between files and directories. This is a **breaking change** - no backwards compatibility will be maintained.

## Prerequisites

- Understanding of TypeScript interfaces
- Familiarity with Fastify request validation
- Knowledge of the existing transfer API

## Dependencies

**Blocks:**

- Task 1.3 (Directory Expansion Logic)
- Task 2.2 (Frontend Storage Service Interface)
- Task 2.3 (Frontend Transfer Action Component)

**No dependencies on other tasks**

## Files to Modify

- `backend/src/routes/api/transfer/index.ts`

## Implementation Steps

### Step 1: Define New Interfaces

In `backend/src/routes/api/transfer/index.ts`, add the new interface near the top of the file (after imports):

```typescript
/**
 * Represents an item (file or directory) to be transferred
 */
interface TransferItem {
  path: string; // Relative path from source.path
  type: 'file' | 'directory';
}

/**
 * Transfer request with support for both files and directories
 */
interface TransferRequest {
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
  items: TransferItem[]; // CHANGED from 'files: string[]'
  conflictResolution: 'overwrite' | 'skip' | 'rename';
}
```

### Step 2: Update Request Validation Schema

Find the existing transfer request schema (likely using Fastify schema validation) and update it:

```typescript
const transferRequestSchema = {
  body: {
    type: 'object',
    required: ['source', 'destination', 'items', 'conflictResolution'],
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
      conflictResolution: {
        type: 'string',
        enum: ['overwrite', 'skip', 'rename'],
      },
    },
  },
};
```

### Step 3: Update POST /transfer Route Handler

Find the main transfer route handler and update to use `items`:

```typescript
router.post('/transfer', async (request, reply) => {
  const transferRequest = request.body as TransferRequest;
  const { source, destination, items, conflictResolution } = transferRequest;

  // Validate that items array is not empty (should be caught by schema, but defensive)
  if (!items || items.length === 0) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'At least one item (file or directory) must be specified',
    });
  }

  // Rest of the handler will be updated in Task 1.3
  // For now, just ensure it compiles with the new interface
});
```

### Step 4: Remove Old Code References

Search for any remaining references to the old `files` field:

```bash
# Search for patterns like 'files:' in the transfer route
grep -n "files:" backend/src/routes/api/transfer/index.ts
```

Remove or update any code that references `request.body.files` or `transferRequest.files`.

### Step 5: Add JSDoc Documentation

Add comprehensive documentation to the new interfaces:

```typescript
/**
 * Represents an item (file or directory) to be transferred
 *
 * Path Format Examples:
 * - User navigates to: /bucket/datasets/
 * - User selects folder: "models/" → { path: "models", type: "directory" }
 * - User selects file: "readme.txt" → { path: "readme.txt", type: "file" }
 *
 * When "models" folder is expanded, child files become:
 * - { path: "models/config.json", type: "file" }
 * - { path: "models/weights/layer1.bin", type: "file" }
 */
interface TransferItem {
  /** Relative path from source.path (no leading slash) */
  path: string;
  /** Type of item - file or directory */
  type: 'file' | 'directory';
}
```

## Testing Requirements

### Unit Tests

Update `backend/src/routes/api/transfer/index.test.ts`:

```typescript
describe('POST /transfer - Request Validation', () => {
  it('should accept request with items array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transfer',
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
        items: [
          { path: 'file1.txt', type: 'file' },
          { path: 'folder1', type: 'directory' },
        ],
        conflictResolution: 'skip',
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should reject request with old files array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: {
        source: { type: 's3', locationId: 'test', path: '/' },
        destination: { type: 'local', locationId: 'local', path: '/' },
        files: ['file1.txt', 'file2.txt'], // Old format
        conflictResolution: 'skip',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('items');
  });

  it('should reject empty items array', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: {
        source: { type: 's3', locationId: 'test', path: '/' },
        destination: { type: 'local', locationId: 'local', path: '/' },
        items: [], // Empty array
        conflictResolution: 'skip',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject items without type field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: {
        source: { type: 's3', locationId: 'test', path: '/' },
        destination: { type: 'local', locationId: 'local', path: '/' },
        items: [{ path: 'file1.txt' }], // Missing 'type'
        conflictResolution: 'skip',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should reject invalid item type', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: {
        source: { type: 's3', locationId: 'test', path: '/' },
        destination: { type: 'local', locationId: 'local', path: '/' },
        items: [{ path: 'file1.txt', type: 'unknown' }], // Invalid type
        conflictResolution: 'skip',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('should accept mixed file and directory items', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/transfer',
      payload: {
        source: { type: 's3', locationId: 'test', path: '/' },
        destination: { type: 'local', locationId: 'local', path: '/' },
        items: [
          { path: 'file1.txt', type: 'file' },
          { path: 'folder1', type: 'directory' },
          { path: 'file2.txt', type: 'file' },
        ],
        conflictResolution: 'overwrite',
      },
    });

    expect(response.statusCode).toBe(200);
  });
});
```

## Acceptance Criteria

- [ ] `TransferItem` interface defined with `path` and `type` fields
- [ ] `TransferRequest` interface updated to use `items: TransferItem[]`
- [ ] Old `files: string[]` field completely removed
- [ ] Request validation schema enforces new structure
- [ ] Schema rejects old `files` format with clear error
- [ ] Schema validates `type` field is 'file' or 'directory'
- [ ] Schema requires at least one item in array
- [ ] JSDoc documentation added to interfaces
- [ ] All unit tests pass
- [ ] TypeScript compilation succeeds with no errors

## Breaking Change Communication

### API Change Summary

**Old Format (Removed):**

```json
{
  "source": {...},
  "destination": {...},
  "files": ["file1.txt", "file2.txt"],
  "conflictResolution": "skip"
}
```

**New Format (Required):**

```json
{
  "source": {...},
  "destination": {...},
  "items": [
    { "path": "file1.txt", "type": "file" },
    { "path": "folder1", "type": "directory" }
  ],
  "conflictResolution": "skip"
}
```

### Migration Notes

- No backwards compatibility layer
- Frontend must be updated simultaneously (Task 2.2, 2.3)
- Internal API only - no external consumers expected

## Error Handling

### Validation Errors

```typescript
{
  "error": "Bad Request",
  "message": "body must have required property 'items'",
  "statusCode": 400
}
```

```typescript
{
  "error": "Bad Request",
  "message": "items[0].type must be equal to one of the allowed values: file, directory",
  "statusCode": 400
}
```

## Related Documentation

- [Folder Copy Support Design](../folder-copy-support.md) - Section: Data Model Changes
- [Backend Architecture](../../architecture/backend-architecture.md)
- [Fastify Validation](https://www.fastify.io/docs/latest/Reference/Validation-and-Serialization/)

## Next Steps

After completion:

1. Proceed to Task 1.3 (Directory Expansion Logic) - uses new interface
2. Coordinate with Task 2.2 (Frontend Service Interface) - must use same structure
3. Update API documentation if it exists

## Notes

- This is a **breaking change** - ensure frontend is updated in same release
- The `type` field enables Task 1.3 to distinguish files from directories
- Path format examples added to JSDoc for clarity
- Keep schema validation strict to catch errors early
