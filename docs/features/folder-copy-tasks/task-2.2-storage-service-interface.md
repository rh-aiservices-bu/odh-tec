# Task 2.2: Update StorageService Interface

**Task ID:** 2.2
**Phase:** Phase 2 - Frontend UI Support
**Status:** Not Started
**Estimated Effort:** 1 hour
**Priority:** High

## Overview

Update the frontend StorageService to use `items: TransferItem[]` instead of `files: string[]`, matching the backend API changes from Task 1.2.

## Prerequisites

- Completion of Task 1.2 (Backend Interface Update)
- Understanding of TypeScript interfaces
- Familiarity with the StorageService

## Dependencies

**Requires:**

- Task 1.2 (backend API now uses items[])

**Blocks:**

- Task 2.3 (Transfer Action Component)

## Files to Modify

- `frontend/src/app/services/storageService.ts`

## Implementation Steps

### Step 1: Add TransferItem Interface

```typescript
/**
 * Represents an item (file or directory) to be transferred
 */
export interface TransferItem {
  path: string; // Relative path from source.path
  type: 'file' | 'directory';
}
```

### Step 2: Update TransferRequest Interface

```typescript
export interface TransferRequest {
  source: {
    type: StorageType;
    locationId: string;
    path: string;
  };
  destination: {
    type: StorageType;
    locationId: string;
    path: string;
  };
  items: TransferItem[]; // ⚠️ CHANGED from 'files: string[]'
  conflictResolution: 'overwrite' | 'skip' | 'rename';
}
```

### Step 3: Update ConflictCheckResponse Interface

```typescript
export interface ConflictCheckResponse {
  conflicts: string[];
  nonConflicting: string[]; // ⭐ NEW
  warning?: {
    // ⭐ NEW
    type: 'large_folder';
    fileCount: number;
    totalSize: number;
    message: string;
  };
}
```

### Step 4: Update checkConflicts Method Signature

```typescript
async checkConflicts(
  sourceLocationId: string,
  sourcePath: string,
  items: TransferItem[],  // ⚠️ CHANGED from files: string[]
  destLocationId: string,
  destPath: string,
): Promise<ConflictCheckResponse> {
  const response = await fetch('/api/transfer/check-conflicts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: {
        type: this.getStorageType(sourceLocationId),
        locationId: sourceLocationId,
        path: sourcePath,
      },
      destination: {
        type: this.getStorageType(destLocationId),
        locationId: destLocationId,
        path: destPath,
      },
      items,  // ⚠️ CHANGED
    }),
  });

  if (!response.ok) {
    throw new Error(`Conflict check failed: ${response.statusText}`);
  }

  return response.json();
}
```

### Step 5: Update initiateTransfer Method

```typescript
async initiateTransfer(request: TransferRequest): Promise<TransferResponse> {
  const response = await fetch('/api/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Transfer initiation failed: ${response.statusText}`);
  }

  return response.json();
}
```

## Testing Requirements

### Unit Tests

```typescript
describe('StorageService - Updated Interface', () => {
  it('should send items array in checkConflicts request', async () => {
    const items: TransferItem[] = [
      { path: 'file1.txt', type: 'file' },
      { path: 'folder1', type: 'directory' },
    ];

    fetchMock.mockResponseOnce(
      JSON.stringify({
        conflicts: [],
        nonConflicting: ['file1.txt'],
        warning: undefined,
      }),
    );

    await storageService.checkConflicts('src', '/', items, 'dest', '/');

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.items).toEqual(items);
  });

  it('should parse new ConflictCheckResponse format', async () => {
    const items: TransferItem[] = [{ path: 'file1.txt', type: 'file' }];

    const mockResponse: ConflictCheckResponse = {
      conflicts: ['file1.txt'],
      nonConflicting: [],
      warning: {
        type: 'large_folder',
        fileCount: 1500,
        totalSize: 1024 * 1024 * 1024 * 15,
        message: 'Large folder warning',
      },
    };

    fetchMock.mockResponseOnce(JSON.stringify(mockResponse));

    const result = await storageService.checkConflicts('src', '/', items, 'dest', '/');

    expect(result.conflicts).toEqual(['file1.txt']);
    expect(result.nonConflicting).toEqual([]);
    expect(result.warning).toBeDefined();
    expect(result.warning.fileCount).toBe(1500);
  });

  it('should send items array in initiateTransfer request', async () => {
    const request: TransferRequest = {
      source: {
        type: 's3',
        locationId: 'src',
        path: '/',
      },
      destination: {
        type: 'local',
        locationId: 'dest',
        path: '/tmp/',
      },
      items: [{ path: 'folder1', type: 'directory' }],
      conflictResolution: 'skip',
    };

    fetchMock.mockResponseOnce(JSON.stringify({ transferId: '123' }));

    await storageService.initiateTransfer(request);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.items).toEqual(request.items);
  });
});
```

## Acceptance Criteria

- [ ] TransferItem interface defined with path and type fields
- [ ] TransferRequest uses items: TransferItem[]
- [ ] ConflictCheckResponse includes nonConflicting and warning fields
- [ ] checkConflicts method accepts items parameter
- [ ] initiateTransfer method sends items in request body
- [ ] All unit tests pass
- [ ] TypeScript compilation succeeds

## Related Documentation

- [Task 1.2](./task-1.2-update-transfer-interface.md) - Backend interface changes
- [Folder Copy Support Design](../folder-copy-support.md) - Data Model Changes

## Next Steps

After completion:

- Task 2.3 (Update Transfer Action Component) - uses new interfaces

## Notes

- This is a breaking change coordinated with backend Task 1.2
- Both backend and frontend updated in same release
