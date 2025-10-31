# Task 2.3: Update TransferAction Component

**Task ID:** 2.3
**Phase:** Phase 2 - Frontend UI Support
**Status:** Not Started
**Estimated Effort:** 1-2 hours
**Priority:** High

## Overview

Update the TransferAction component to build `TransferItem[]` array with type information when initiating transfers and checking conflicts.

## Prerequisites

- Completion of Task 2.1 (Directory Selection UI)
- Completion of Task 2.2 (Storage Service Interface)

## Dependencies

**Requires:**

- Task 2.1 (enables folder selection)
- Task 2.2 (provides TransferItem interface)

**Blocks:**

- End-to-end folder transfer functionality

## Files to Modify

- `frontend/src/app/components/Transfer/TransferAction.tsx`

## Implementation Steps

### Step 1: Update Props Interface

```typescript
interface TransferActionProps {
  selectedFiles: string[];
  sourceType: StorageType;
  sourceLocationId: string;
  sourcePath: string;
  onClose: () => void;
  currentListing: Array<FileEntry | DirectoryEntry>; // ⭐ NEW
}
```

### Step 2: Build TransferItems Array

```typescript
const buildTransferItems = (): TransferItem[] => {
  return selectedFiles.map((itemPath) => {
    // Find item in current listing to determine type
    const item = currentListing.find((entry) => entry.path === itemPath);

    return {
      path: itemPath,
      type: item?.type || 'file', // Default to 'file' if not found
    };
  });
};
```

### Step 3: Update Conflict Checking

```typescript
const checkConflicts = async (destLocationId: string, destPath: string) => {
  try {
    const items = buildTransferItems();

    const conflicts = await storageService.checkConflicts(
      sourceLocationId,
      sourcePath,
      items, // ⚠️ CHANGED from selectedFiles
      destLocationId,
      destPath,
    );

    // Handle conflicts and warning (if present)
    if (conflicts.warning) {
      setShowLargeFolderWarning(true);
      setLargeFolderWarningData(conflicts.warning);
    }

    if (conflicts.conflicts.length > 0) {
      setConflictingFiles(conflicts.conflicts);
      setNonConflictingFiles(conflicts.nonConflicting);
      setShowConflictDialog(true);
    } else {
      // No conflicts - proceed with transfer
      await initiateTransfer('skip', destLocationId, destPath, destType);
    }
  } catch (error) {
    setError(`Failed to check conflicts: ${error.message}`);
  }
};
```

### Step 4: Update Transfer Initiation

```typescript
const initiateTransfer = async (
  conflictResolution: 'overwrite' | 'skip' | 'rename',
  destLocationId: string,
  destPath: string,
  destType: StorageType,
) => {
  try {
    const items = buildTransferItems();

    const transferRequest: TransferRequest = {
      source: {
        type: sourceType,
        locationId: sourceLocationId,
        path: sourcePath,
      },
      destination: {
        type: destType,
        locationId: destLocationId,
        path: destPath,
      },
      items, // ⚠️ CHANGED from 'files: selectedFiles'
      conflictResolution,
    };

    await storageService.initiateTransfer(transferRequest);

    onClose();
    showSuccessToast(`Transfer initiated for ${items.length} items`);
  } catch (error) {
    setError(`Failed to initiate transfer: ${error.message}`);
  }
};
```

### Step 5: Store Warning and Conflict Data

```typescript
const [showLargeFolderWarning, setShowLargeFolderWarning] = useState(false);
const [largeFolderWarningData, setLargeFolderWarningData] = useState<{
  fileCount: number;
  totalSize: number;
  message: string;
} | null>(null);

const [conflictingFiles, setConflictingFiles] = useState<string[]>([]);
const [nonConflictingFiles, setNonConflictingFiles] = useState<string[]>([]);
```

## Testing Requirements

### Unit Tests

```typescript
describe('TransferAction - Item Type Detection', () => {
  it('should build TransferItems with correct types', () => {
    const selectedFiles = ['folder1', 'file1.txt', 'folder2'];
    const currentListing = [
      { path: 'folder1', type: 'directory', name: 'folder1' },
      { path: 'file1.txt', type: 'file', name: 'file1.txt', size: 100 },
      { path: 'folder2', type: 'directory', name: 'folder2' },
    ];

    const { result } = renderHook(() =>
      useTransferAction({ selectedFiles, currentListing, ...otherProps }),
    );

    const items = result.current.buildTransferItems();

    expect(items).toEqual([
      { path: 'folder1', type: 'directory' },
      { path: 'file1.txt', type: 'file' },
      { path: 'folder2', type: 'directory' },
    ]);
  });

  it('should default to file type if item not found in listing', () => {
    const selectedFiles = ['unknown.txt'];
    const currentListing = [];

    const { result } = renderHook(() =>
      useTransferAction({ selectedFiles, currentListing, ...otherProps }),
    );

    const items = result.current.buildTransferItems();

    expect(items).toEqual([{ path: 'unknown.txt', type: 'file' }]);
  });

  it('should call storageService.checkConflicts with items array', async () => {
    const mockCheckConflicts = jest.spyOn(storageService, 'checkConflicts');
    mockCheckConflicts.mockResolvedValue({
      conflicts: [],
      nonConflicting: ['file1.txt'],
    });

    const { result } = renderHook(() =>
      useTransferAction({
        selectedFiles: ['file1.txt'],
        currentListing: [{ path: 'file1.txt', type: 'file', name: 'file1.txt', size: 100 }],
        ...otherProps,
      }),
    );

    await result.current.checkConflicts('dest', '/');

    expect(mockCheckConflicts).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      [{ path: 'file1.txt', type: 'file' }],
      'dest',
      '/',
    );
  });

  it('should call storageService.initiateTransfer with items array', async () => {
    const mockInitiateTransfer = jest.spyOn(storageService, 'initiateTransfer');
    mockInitiateTransfer.mockResolvedValue({ transferId: '123' });

    const { result } = renderHook(() =>
      useTransferAction({
        selectedFiles: ['folder1'],
        currentListing: [{ path: 'folder1', type: 'directory', name: 'folder1' }],
        ...otherProps,
      }),
    );

    await result.current.initiateTransfer('skip', 'dest', '/', 'local');

    expect(mockInitiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ path: 'folder1', type: 'directory' }],
      }),
    );
  });
});
```

## Acceptance Criteria

- [ ] TransferAction receives currentListing prop
- [ ] buildTransferItems() correctly determines item types
- [ ] checkConflicts called with items array
- [ ] initiateTransfer called with items array
- [ ] Large folder warning data stored in state
- [ ] Conflict data (conflicts + nonConflicting) stored in state
- [ ] All unit tests pass
- [ ] TypeScript compilation succeeds

## Related Documentation

- [Task 2.2](./task-2.2-storage-service-interface.md) - Storage service interfaces
- [Task 2.4](./task-2.4-pass-file-listing.md) - Passing current listing

## Next Steps

- Task 2.4 (Pass File Listing) - provides currentListing prop
- Task 2.5 (Large Folder Warning) - uses warning data
- Task 3.2 (Smart Conflict UI) - uses conflict/nonConflicting data

## Notes

- Default to 'file' type if item not found (defensive programming)
- The currentListing should include both directories and files
