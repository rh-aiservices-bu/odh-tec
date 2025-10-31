# Task 3.2: Frontend Smart Conflict Resolution UI

**Task ID:** 3.2
**Phase:** Phase 3 - Smart Conflict Resolution
**Status:** Not Started
**Estimated Effort:** 2-3 hours
**Priority:** Medium

## Overview

Update the conflict resolution UI to implement smart merge behavior: show users that non-conflicting files will be automatically copied, and only prompt for resolution of actual conflicts.

## Prerequisites

- Completion of Task 1.7 (Backend Smart Conflict Detection)
- Completion of Task 2.3 (TransferAction stores conflict data)
- Familiarity with PatternFly Modal component

## Dependencies

**Requires:**

- Task 1.7 (backend returns conflicts + nonConflicting arrays)
- Task 2.3 (frontend stores conflict data in state)

## Files to Modify

- `frontend/src/app/components/Transfer/ConflictResolutionModal.tsx`

## Implementation Steps

### Step 1: Update Modal Props

```typescript
interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflictingFiles: string[]; // Files that conflict
  nonConflictingFiles: string[]; // Files that will be auto-copied
  onResolve: (resolution: 'overwrite' | 'skip' | 'rename') => void;
  onCancel: () => void;
}
```

### Step 2: Implement Smart Conflict Modal

```tsx
const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  conflictingFiles,
  nonConflictingFiles,
  onResolve,
  onCancel,
}) => {
  const [resolution, setResolution] = useState<'overwrite' | 'skip' | 'rename'>('skip');

  return (
    <Modal
      variant="medium"
      title="Resolve File Conflicts"
      isOpen={isOpen}
      onClose={onCancel}
      actions={[
        <Button key="apply" variant="primary" onClick={() => onResolve(resolution)}>
          Apply
        </Button>,
        <Button key="cancel" variant="link" onClick={onCancel}>
          Cancel
        </Button>,
      ]}
    >
      {/* Auto-copy info */}
      {nonConflictingFiles.length > 0 && (
        <Alert
          variant="info"
          isInline
          title="Non-conflicting files"
          style={{ marginBottom: '1rem' }}
        >
          <Text>
            {nonConflictingFiles.length} file{nonConflictingFiles.length !== 1 ? 's' : ''} will be
            copied automatically (no conflicts).
          </Text>
        </Alert>
      )}

      {/* Conflict info */}
      <Alert variant="warning" isInline title="Conflicting files" style={{ marginBottom: '1rem' }}>
        <Text>
          {conflictingFiles.length} file{conflictingFiles.length !== 1 ? 's' : ''} already exist
          {conflictingFiles.length === 1 ? 's' : ''} in the destination. How should these be
          handled?
        </Text>
      </Alert>

      {/* Resolution options */}
      <Form>
        <FormGroup label="Resolution strategy">
          <Radio
            id="skip"
            name="resolution"
            label="Skip"
            description="Skip conflicting files, keep existing destination files"
            isChecked={resolution === 'skip'}
            onChange={() => setResolution('skip')}
          />
          <Radio
            id="overwrite"
            name="resolution"
            label="Overwrite"
            description="Replace existing files with source files"
            isChecked={resolution === 'overwrite'}
            onChange={() => setResolution('overwrite')}
          />
          <Radio
            id="rename"
            name="resolution"
            label="Rename"
            description="Copy source files with new names (e.g., file.txt → file (1).txt)"
            isChecked={resolution === 'rename'}
            onChange={() => setResolution('rename')}
          />
        </FormGroup>
      </Form>

      {/* Conflict list (show first 25) */}
      {conflictingFiles.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <Text component="h4">Conflicting files:</Text>
          {conflictingFiles.length > 25 && (
            <Text component="small" style={{ color: 'var(--pf-v6-global--Color--200)' }}>
              Showing first 25 of {conflictingFiles.length} conflicts
            </Text>
          )}
          <List isPlain>
            {conflictingFiles.slice(0, 25).map((file) => (
              <ListItem key={file}>
                <FontAwesomeIcon
                  icon={faExclamationTriangle}
                  style={{
                    marginRight: '0.5rem',
                    color: 'var(--pf-v6-global--warning-color--100)',
                  }}
                />
                {file}
              </ListItem>
            ))}
          </List>
        </div>
      )}

      {/* Summary */}
      <div
        style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: 'var(--pf-v6-global--BackgroundColor--light-300)',
          borderRadius: '4px',
        }}
      >
        <Text component="h5">Summary</Text>
        <Text>
          • {nonConflictingFiles.length} file{nonConflictingFiles.length !== 1 ? 's' : ''} will be
          copied automatically
        </Text>
        <Text>
          • {conflictingFiles.length} conflict{conflictingFiles.length !== 1 ? 's' : ''} will be{' '}
          {resolution === 'skip'
            ? 'skipped'
            : resolution === 'overwrite'
              ? 'overwritten'
              : 'renamed'}
        </Text>
        <Text>
          • Total:{' '}
          {nonConflictingFiles.length + (resolution === 'skip' ? 0 : conflictingFiles.length)} files
          will be copied
        </Text>
      </div>
    </Modal>
  );
};
```

### Step 3: Update TransferAction to Use Modal

```typescript
const TransferAction: React.FC<TransferActionProps> = (props) => {
  const [conflictingFiles, setConflictingFiles] = useState<string[]>([]);
  const [nonConflictingFiles, setNonConflictingFiles] = useState<string[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);

  const checkConflicts = async (destLocationId: string, destPath: string) => {
    // ... existing code ...

    const response = await storageService.checkConflicts(/* ... */);

    if (response.conflicts.length > 0) {
      setConflictingFiles(response.conflicts);
      setNonConflictingFiles(response.nonConflicting);
      setShowConflictModal(true);
    } else {
      // No conflicts - proceed directly
      await initiateTransfer('skip', destLocationId, destPath, destType);
    }
  };

  const handleConflictResolution = async (resolution: 'overwrite' | 'skip' | 'rename') => {
    setShowConflictModal(false);
    await initiateTransfer(resolution, pendingTransfer.destLocationId, pendingTransfer.destPath, pendingTransfer.destType);
  };

  return (
    <>
      {/* Existing transfer UI */}

      <ConflictResolutionModal
        isOpen={showConflictModal}
        conflictingFiles={conflictingFiles}
        nonConflictingFiles={nonConflictingFiles}
        onResolve={handleConflictResolution}
        onCancel={() => setShowConflictModal(false)}
      />
    </>
  );
};
```

## Testing Requirements

### Unit Tests

```typescript
describe('ConflictResolutionModal - Smart Conflict UI', () => {
  it('should show non-conflicting files info', () => {
    const { getByText } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file2.txt']}
        nonConflictingFiles={['file1.txt', 'file3.txt']}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(getByText(/2 files will be copied automatically/i)).toBeInTheDocument();
  });

  it('should show conflicting files count', () => {
    const { getByText } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt', 'file2.txt', 'file3.txt']}
        nonConflictingFiles={['file4.txt']}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(getByText(/3 files already exist/i)).toBeInTheDocument();
  });

  it('should list first 25 conflicting files', () => {
    const manyConflicts = Array.from({ length: 50 }, (_, i) => `file${i}.txt`);

    const { getAllByRole, getByText } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={manyConflicts}
        nonConflictingFiles={[]}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(getByText(/Showing first 25 of 50 conflicts/i)).toBeInTheDocument();
    const listItems = getAllByRole('listitem');
    expect(listItems).toHaveLength(25);
  });

  it('should call onResolve with selected resolution', () => {
    const onResolve = jest.fn();

    const { getByLabelText, getByRole } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt']}
        nonConflictingFiles={[]}
        onResolve={onResolve}
        onCancel={jest.fn()}
      />
    );

    // Select overwrite
    fireEvent.click(getByLabelText(/overwrite/i));

    // Apply
    fireEvent.click(getByRole('button', { name: /apply/i }));

    expect(onResolve).toHaveBeenCalledWith('overwrite');
  });

  it('should update summary based on resolution choice', () => {
    const { getByLabelText, getByText } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt', 'file2.txt']}
        nonConflictingFiles={['file3.txt']}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    // Default: skip
    expect(getByText(/Total: 1 files will be copied/i)).toBeInTheDocument();

    // Change to overwrite
    fireEvent.click(getByLabelText(/overwrite/i));
    expect(getByText(/Total: 3 files will be copied/i)).toBeInTheDocument();
  });

  it('should handle no non-conflicting files', () => {
    const { queryByText } = render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt']}
        nonConflictingFiles={[]}
        onResolve={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(queryByText(/will be copied automatically/i)).not.toBeInTheDocument();
  });
});
```

## Acceptance Criteria

- [ ] Modal shows non-conflicting files count and info alert
- [ ] Modal shows conflicting files count and warning alert
- [ ] Modal displays resolution options (skip, overwrite, rename)
- [ ] Modal lists first 25 conflicting files
- [ ] Modal shows "Showing first 25 of X" when > 25 conflicts
- [ ] Summary section updates based on selected resolution
- [ ] Apply button calls onResolve with selected resolution
- [ ] Cancel button closes modal without applying
- [ ] All unit tests pass
- [ ] TypeScript compilation succeeds

## UI Mockup

```
┌─────────────────────────────────────────────────┐
│ Resolve File Conflicts                    [X]   │
├─────────────────────────────────────────────────┤
│ ℹ️ Non-conflicting files                        │
│   5 files will be copied automatically          │
│   (no conflicts).                               │
│                                                 │
│ ⚠️ Conflicting files                            │
│   3 files already exist in the destination.     │
│   How should these be handled?                  │
│                                                 │
│ Resolution strategy:                            │
│ ○ Skip                                          │
│   Skip conflicting files, keep existing...      │
│ ● Overwrite                                     │
│   Replace existing files with source files      │
│ ○ Rename                                        │
│   Copy source files with new names...           │
│                                                 │
│ Conflicting files:                              │
│ ⚠️ models/config.json                           │
│ ⚠️ models/weights.bin                           │
│ ⚠️ data/dataset.csv                             │
│                                                 │
│ ┌─────────────────────────────────────────┐    │
│ │ Summary                                  │    │
│ │ • 5 files will be copied automatically   │    │
│ │ • 3 conflicts will be overwritten        │    │
│ │ • Total: 8 files will be copied          │    │
│ └─────────────────────────────────────────┘    │
│                                                 │
│                        [Cancel]  [Apply]        │
└─────────────────────────────────────────────────┘
```

## Related Documentation

- [Task 1.7](./task-1.7-conflict-check-endpoint.md) - Backend smart conflict detection
- [Folder Copy Support Design](../folder-copy-support.md) - Design Decision #2
- [PatternFly Modal](https://www.patternfly.org/components/modal/)
- [PatternFly Radio](https://www.patternfly.org/components/forms/radio/)

## Next Steps

- Integration testing of end-to-end conflict resolution
- User acceptance testing

## Notes

- Smart merge approach: non-conflicting files copied automatically
- User only needs to decide on actual conflicts
- Summary helps users understand what will happen
- Limit display to first 25 conflicts for performance
