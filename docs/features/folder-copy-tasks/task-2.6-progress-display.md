# Task 2.6: Enhance Progress Display with Detailed Statistics

**Task ID:** 2.6
**Phase:** Phase 2 - Frontend UI Support
**Status:** Not Started
**Estimated Effort:** 1-2 hours
**Priority:** Medium

## Overview

Update the transfer progress display to show detailed statistics including file count and data size transferred, providing users with better insight into large folder transfers.

## Prerequisites

- Understanding of the existing TransferProgress component
- Familiarity with the backend TransferProgress interface

## Dependencies

**No strict dependencies** - can be implemented independently

## Files to Modify

- `frontend/src/app/components/Transfer/TransferProgress.tsx`

## Backend Interface (Already Exists)

The backend `transferQueue.ts` already provides this interface:

```typescript
interface TransferProgress {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalBytes: number;
  transferredBytes: number;
}
```

## Implementation Steps

### Step 1: Add Props for Original Items

Update component props to receive original transfer items:

```typescript
interface TransferProgressProps {
  transferId: string;
  progress: TransferProgress; // From transferQueue
  originalItems?: TransferItem[]; // ⭐ NEW: Original request items
}
```

### Step 2: Calculate Selection Summary

```typescript
const TransferProgress: React.FC<TransferProgressProps> = ({
  transferId,
  progress,
  originalItems = [],
}) => {
  // Build selection summary from original request
  const folderCount = originalItems.filter(item => item.type === 'directory').length;
  const fileCount = originalItems.filter(item => item.type === 'file').length;

  let selectionSummary = '';
  if (folderCount > 0) {
    selectionSummary += `${folderCount} folder${folderCount !== 1 ? 's' : ''}`;
  }
  if (fileCount > 0) {
    if (folderCount > 0) selectionSummary += ', ';
    selectionSummary += `${fileCount} file${fileCount !== 1 ? 's' : ''}`;
  }

  return (
    // ... JSX below
  );
};
```

### Step 3: Update Progress Display

```tsx
<Card>
  <CardHeader>
    <CardTitle>
      Transfer Progress
      {selectionSummary && (
        <Text
          component="small"
          style={{ marginLeft: '0.5rem', color: 'var(--pf-v6-global--Color--200)' }}
        >
          ({selectionSummary})
        </Text>
      )}
    </CardTitle>
  </CardHeader>
  <CardBody>
    {/* Progress bar based on bytes transferred */}
    <ProgressBar
      value={progress.totalBytes > 0 ? (progress.transferredBytes / progress.totalBytes) * 100 : 0}
      title="Transfer progress"
    />

    {/* Detailed statistics */}
    <div style={{ marginTop: '1rem' }}>
      <Text>
        {progress.completedFiles} / {progress.totalFiles} files
        {progress.failedFiles > 0 && (
          <span style={{ color: 'var(--pf-v6-global--danger-color--100)' }}>
            {' '}
            ({progress.failedFiles} failed)
          </span>
        )}
      </Text>
      <Text>
        {formatBytes(progress.transferredBytes)} / {formatBytes(progress.totalBytes)}
      </Text>
    </div>

    {/* Percentage */}
    <Text component="small" style={{ color: 'var(--pf-v6-global--Color--200)' }}>
      {progress.totalBytes > 0
        ? `${Math.round((progress.transferredBytes / progress.totalBytes) * 100)}%`
        : '0%'}
    </Text>
  </CardBody>
</Card>
```

### Step 4: Add Byte Formatting Helper (if not already present)

```typescript
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
```

### Step 5: Pass Original Items from TransferAction

In TransferAction component, when initiating transfer:

```typescript
const initiateTransfer = async (
  conflictResolution: 'overwrite' | 'skip' | 'rename',
  destLocationId: string,
  destPath: string,
  destType: StorageType,
) => {
  const items = buildTransferItems();

  const transferRequest: TransferRequest = {
    source: {
      /* ... */
    },
    destination: {
      /* ... */
    },
    items,
    conflictResolution,
  };

  const response = await storageService.initiateTransfer(transferRequest);

  // ⭐ Store original items for progress display
  setActiveTransfer({
    transferId: response.transferId,
    originalItems: items,
  });
};
```

## Testing Requirements

### Unit Tests

```typescript
describe('TransferProgress - Enhanced Display', () => {
  it('should display folder and file count summary', () => {
    const originalItems: TransferItem[] = [
      { path: 'folder1', type: 'directory' },
      { path: 'folder2', type: 'directory' },
      { path: 'file1.txt', type: 'file' },
    ];

    const progress: TransferProgress = {
      totalFiles: 10,
      completedFiles: 5,
      failedFiles: 0,
      totalBytes: 1024 * 1024,
      transferredBytes: 512 * 1024,
    };

    const { getByText } = render(
      <TransferProgress
        transferId="123"
        progress={progress}
        originalItems={originalItems}
      />
    );

    expect(getByText(/2 folders, 1 file/i)).toBeInTheDocument();
  });

  it('should display file count and bytes transferred', () => {
    const progress: TransferProgress = {
      totalFiles: 100,
      completedFiles: 47,
      failedFiles: 3,
      totalBytes: 5 * 1024 * 1024 * 1024, // 5GB
      transferredBytes: 2.3 * 1024 * 1024 * 1024, // 2.3GB
    };

    const { getByText } = render(
      <TransferProgress transferId="123" progress={progress} />
    );

    expect(getByText(/47 \/ 100 files/i)).toBeInTheDocument();
    expect(getByText(/\(3 failed\)/i)).toBeInTheDocument();
    expect(getByText(/2\.3 GB \/ 5 GB/i)).toBeInTheDocument();
  });

  it('should show percentage based on bytes transferred', () => {
    const progress: TransferProgress = {
      totalFiles: 10,
      completedFiles: 5,
      failedFiles: 0,
      totalBytes: 1000,
      transferredBytes: 750, // 75%
    };

    const { getByText } = render(
      <TransferProgress transferId="123" progress={progress} />
    );

    expect(getByText(/75%/i)).toBeInTheDocument();
  });

  it('should handle only folders selected', () => {
    const originalItems: TransferItem[] = [
      { path: 'folder1', type: 'directory' },
      { path: 'folder2', type: 'directory' },
    ];

    const { getByText, queryByText } = render(
      <TransferProgress
        transferId="123"
        progress={mockProgress}
        originalItems={originalItems}
      />
    );

    expect(getByText(/2 folders/i)).toBeInTheDocument();
    expect(queryByText(/file/i)).not.toBeInTheDocument();
  });

  it('should handle only files selected', () => {
    const originalItems: TransferItem[] = [
      { path: 'file1.txt', type: 'file' },
      { path: 'file2.txt', type: 'file' },
    ];

    const { getByText, queryByText } = render(
      <TransferProgress
        transferId="123"
        progress={mockProgress}
        originalItems={originalItems}
      />
    );

    expect(getByText(/2 files/i)).toBeInTheDocument();
    expect(queryByText(/folder/i)).not.toBeInTheDocument();
  });

  it('should show singular form for 1 folder', () => {
    const originalItems: TransferItem[] = [
      { path: 'folder1', type: 'directory' },
    ];

    const { getByText } = render(
      <TransferProgress
        transferId="123"
        progress={mockProgress}
        originalItems={originalItems}
      />
    );

    expect(getByText(/1 folder/i)).toBeInTheDocument();
    expect(queryByText(/folders/i)).not.toBeInTheDocument();
  });
});
```

## Acceptance Criteria

- [ ] Progress display shows original selection summary (X folders, Y files)
- [ ] Progress shows file count (completed/total)
- [ ] Progress shows bytes transferred (formatted)
- [ ] Progress bar based on bytes, not file count
- [ ] Percentage displayed and accurate
- [ ] Failed file count shown if > 0
- [ ] Singular/plural forms handled correctly
- [ ] formatBytes helper works for all sizes
- [ ] All unit tests pass
- [ ] TypeScript compilation succeeds

## Display Format Examples

**Example 1: Mixed Selection**

```
Transfer Progress (2 folders, 3 files)
[==============>           ]
127 / 283 files
1.2 GB / 2.5 GB
46%
```

**Example 2: Single Folder**

```
Transfer Progress (1 folder)
[==================>       ]
450 / 512 files (2 failed)
3.7 GB / 4.1 GB
87%
```

## Related Documentation

- [Folder Copy Support Design](../folder-copy-support.md) - Design Decision #4
- [Backend transferQueue.ts](../../../backend/src/services/transferQueue.ts) - TransferProgress interface
- [PatternFly ProgressBar](https://www.patternfly.org/components/progress/)

## Notes

- Uses existing backend TransferProgress interface (no new backend work needed)
- Progress percentage based on bytes is more accurate than file count
- originalItems array stored in frontend state during transfer initiation
- formatBytes helper may be extracted to shared utilities
