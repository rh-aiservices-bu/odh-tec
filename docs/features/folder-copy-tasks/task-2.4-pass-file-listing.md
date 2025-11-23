# Task 2.4: Pass File Listing to TransferAction

**Task ID:** 2.4
**Phase:** Phase 2 - Frontend UI Support
**Status:** Not Started
**Estimated Effort:** 15 minutes
**Priority:** Medium

## Overview

Update the StorageBrowser component to pass the current file/directory listing to the TransferAction component, enabling it to determine item types.

## Prerequisites

- Completion of Task 2.3 (Transfer Action Component)

## Dependencies

**Requires:**

- Task 2.3 (TransferAction expects currentListing prop)

## Files to Modify

- `frontend/src/app/components/StorageBrowser/StorageBrowser.tsx`

## Implementation Steps

### Update TransferAction Usage

Find where TransferAction is rendered and add the currentListing prop:

```tsx
<TransferAction
  selectedFiles={Array.from(selectedItems)}
  sourceType={storageType}
  sourceLocationId={locationId}
  sourcePath={currentPath}
  currentListing={[...directories, ...files]} // ⭐ NEW
  onClose={() => setIsTransferModalOpen(false)}
/>
```

## Testing Requirements

### Unit Test

```typescript
describe('StorageBrowser - TransferAction Integration', () => {
  it('should pass combined listing to TransferAction', () => {
    const mockDirectories = [
      { path: 'folder1', type: 'directory', name: 'folder1' },
    ];
    const mockFiles = [
      { path: 'file1.txt', type: 'file', name: 'file1.txt', size: 100 },
    ];

    const { getByTestId } = render(
      <StorageBrowser
        directories={mockDirectories}
        files={mockFiles}
        isTransferModalOpen={true}
      />
    );

    const transferAction = getByTestId('transfer-action');
    expect(transferAction.props.currentListing).toHaveLength(2);
    expect(transferAction.props.currentListing).toContainEqual(mockDirectories[0]);
    expect(transferAction.props.currentListing).toContainEqual(mockFiles[0]);
  });
});
```

## Acceptance Criteria

- [ ] currentListing prop passed to TransferAction
- [ ] currentListing includes both directories and files
- [ ] Unit test verifies prop is passed correctly
- [ ] TypeScript compilation succeeds

## Related Documentation

- [Task 2.3](./task-2.3-transfer-action-component.md) - TransferAction component

## Notes

- Simple change - just adding one prop
- Listing should include all items in current view
