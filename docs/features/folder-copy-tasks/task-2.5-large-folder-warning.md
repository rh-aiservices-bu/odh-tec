# Task 2.5: Implement Large Folder Warning Dialog

**Task ID:** 2.5
**Phase:** Phase 2 - Frontend UI Support
**Status:** Not Started
**Estimated Effort:** 1-2 hours
**Priority:** Medium

## Overview

Implement a modal dialog that warns users when they're about to transfer a large folder (>= 1000 files OR >= 10GB), displaying file count and total size information.

## Prerequisites

- Completion of Task 1.7 (Backend returns warning data)
- Completion of Task 2.3 (TransferAction receives warning data)
- Familiarity with PatternFly Modal component

## Dependencies

**Requires:**

- Task 1.7 (backend provides warning data)
- Task 2.3 (TransferAction stores warning data)

## Files to Modify

- `frontend/src/app/components/Transfer/TransferAction.tsx`

## Implementation Steps

### Step 1: Add Warning State (if not already present from Task 2.3)

```typescript
const [showLargeFolderWarning, setShowLargeFolderWarning] = useState(false);
const [largeFolderWarningData, setLargeFolderWarningData] = useState<{
  fileCount: number;
  totalSize: number;
  message: string;
} | null>(null);
```

### Step 2: Show Warning When Returned from Conflict Check

```typescript
const checkConflicts = async (destLocationId: string, destPath: string) => {
  try {
    const items = buildTransferItems();
    const response = await storageService.checkConflicts(
      sourceLocationId,
      sourcePath,
      items,
      destLocationId,
      destPath,
    );

    // ⭐ Show warning if present
    if (response.warning?.type === 'large_folder') {
      setLargeFolderWarningData(response.warning);
      setShowLargeFolderWarning(true);
      // Store destination info for later use
      setPendingTransfer({ destLocationId, destPath, destType });
      return; // Don't proceed until user confirms
    }

    // Handle conflicts...
  } catch (error) {
    setError(`Failed to check conflicts: ${error.message}`);
  }
};
```

### Step 3: Implement Warning Modal

```tsx
{
  showLargeFolderWarning && largeFolderWarningData && (
    <Modal
      variant="small"
      title="Large Folder Transfer"
      isOpen={showLargeFolderWarning}
      onClose={() => setShowLargeFolderWarning(false)}
      actions={[
        <Button key="proceed" variant="primary" onClick={handleProceedWithTransfer}>
          Proceed
        </Button>,
        <Button
          key="cancel"
          variant="link"
          onClick={() => {
            setShowLargeFolderWarning(false);
            setLargeFolderWarningData(null);
          }}
        >
          Cancel
        </Button>,
      ]}
    >
      <Alert variant="warning" isInline title="Large transfer operation">
        <p>{largeFolderWarningData.message}</p>
      </Alert>
      <br />
      <DescriptionList isHorizontal>
        <DescriptionListGroup>
          <DescriptionListTerm>Files to transfer</DescriptionListTerm>
          <DescriptionListDescription>
            {largeFolderWarningData.fileCount.toLocaleString()} files
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Total size</DescriptionListTerm>
          <DescriptionListDescription>
            {formatBytes(largeFolderWarningData.totalSize)}
          </DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>
      <br />
      <Text component="small">
        This operation may take significant time to complete. You can monitor progress in the
        transfer queue.
      </Text>
    </Modal>
  );
}
```

### Step 4: Handle Proceed Action

```typescript
const handleProceedWithTransfer = async () => {
  setShowLargeFolderWarning(false);

  // Check for conflicts (warning already shown, now check conflicts)
  if (pendingTransfer) {
    const items = buildTransferItems();
    const response = await storageService.checkConflicts(
      sourceLocationId,
      sourcePath,
      items,
      pendingTransfer.destLocationId,
      pendingTransfer.destPath,
    );

    if (response.conflicts.length > 0) {
      setConflictingFiles(response.conflicts);
      setNonConflictingFiles(response.nonConflicting);
      setShowConflictDialog(true);
    } else {
      // No conflicts - proceed
      await initiateTransfer(
        'skip',
        pendingTransfer.destLocationId,
        pendingTransfer.destPath,
        pendingTransfer.destType,
      );
    }
  }
};
```

### Step 5: Add Byte Formatting Helper

```typescript
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

```typescript
describe('Large Folder Warning', () => {
  it('should show warning modal when warning returned', async () => {
    const mockResponse = {
      conflicts: [],
      nonConflicting: ['file1.txt'],
      warning: {
        type: 'large_folder',
        fileCount: 1500,
        totalSize: 15 * 1024 * 1024 * 1024, // 15GB
        message: 'This operation will transfer 1500 files (15 GB).',
      },
    };

    jest.spyOn(storageService, 'checkConflicts').mockResolvedValue(mockResponse);

    const { getByText, getByRole } = render(
      <TransferAction {...defaultProps} />
    );

    fireEvent.click(getByRole('button', { name: /check/i }));

    await waitFor(() => {
      expect(getByText(/Large Folder Transfer/i)).toBeInTheDocument();
      expect(getByText(/1,500 files/i)).toBeInTheDocument();
      expect(getByText(/15 GB/i)).toBeInTheDocument();
    });
  });

  it('should close warning modal on cancel', async () => {
    // Show warning
    const { getByText, getByRole, queryByText } = render(
      <TransferAction showWarning={true} warningData={mockWarning} />
    );

    expect(getByText(/Large Folder Transfer/i)).toBeInTheDocument();

    // Click cancel
    fireEvent.click(getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(queryByText(/Large Folder Transfer/i)).not.toBeInTheDocument();
    });
  });

  it('should proceed to conflict check when user confirms', async () => {
    const mockCheckConflicts = jest.spyOn(storageService, 'checkConflicts');
    mockCheckConflicts
      .mockResolvedValueOnce({
        // First call: returns warning
        conflicts: [],
        nonConflicting: [],
        warning: { type: 'large_folder', fileCount: 1500, totalSize: 1024, message: 'Large' },
      })
      .mockResolvedValueOnce({
        // Second call: after proceed
        conflicts: [],
        nonConflicting: ['file1.txt'],
      });

    const { getByRole } = render(<TransferAction {...defaultProps} />);

    // Initial conflict check
    fireEvent.click(getByRole('button', { name: /check/i }));

    await waitFor(() => {
      expect(getByRole('dialog')).toHaveTextContent(/Large Folder Transfer/i);
    });

    // Proceed
    fireEvent.click(getByRole('button', { name: /proceed/i }));

    await waitFor(() => {
      // Should have called checkConflicts twice
      expect(mockCheckConflicts).toHaveBeenCalledTimes(2);
    });
  });

  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatBytes(1536 * 1024 * 1024)).toBe('1.5 GB');
    expect(formatBytes(10.5 * 1024 * 1024 * 1024)).toBe('10.5 GB');
  });
});
```

## Acceptance Criteria

- [ ] Warning modal appears when backend returns warning
- [ ] Modal displays file count and total size
- [ ] File count formatted with thousands separators (e.g., "1,500")
- [ ] Total size formatted in human-readable units (GB, MB)
- [ ] Cancel button closes modal without proceeding
- [ ] Proceed button continues to conflict check or transfer
- [ ] formatBytes helper correctly formats all size ranges
- [ ] All unit tests pass
- [ ] TypeScript compilation succeeds

## Related Documentation

- [Task 1.7](./task-1.7-conflict-check-endpoint.md) - Backend warning implementation
- [PatternFly Modal](https://www.patternfly.org/components/modal/)
- [PatternFly Alert](https://www.patternfly.org/components/alert/)

## Next Steps

- Task 2.6 (Enhanced Progress Display) - shows progress for large transfers

## Notes

- Warning shown BEFORE conflict check (user can cancel early)
- Dual thresholds: >= 1000 files OR >= 10GB
- formatBytes helper may be moved to utilities if reused
