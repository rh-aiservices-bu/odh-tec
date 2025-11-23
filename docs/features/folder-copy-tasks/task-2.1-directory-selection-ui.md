# Task 2.1: Enable Directory Selection in StorageBrowser

**Task ID:** 2.1
**Phase:** Phase 2 - Frontend UI Support
**Status:** Not Started
**Estimated Effort:** 1-2 hours
**Priority:** High (Foundational)

## Overview

Add checkboxes to directory rows in the StorageBrowser component, enabling users to select folders for copying. Update the selection display to show both file and folder counts.

## Prerequisites

- Understanding of React and PatternFly 6 Table component
- Familiarity with the StorageBrowser component structure
- Knowledge of React state management

## Dependencies

**Blocks:**

- Task 2.3 (Transfer Action Component)
- Task 2.4 (Pass File Listing)

**No dependencies on other tasks**

## Files to Modify

- `frontend/src/app/components/StorageBrowser/StorageBrowser.tsx`

## Implementation Steps

### Step 1: Verify Data Structure for Type Information

First, check if directory and file objects have a `type` field:

```typescript
// Check the FileEntry and DirectoryEntry interfaces
// If they don't have a 'type' field, add it:

interface DirectoryEntry {
  name: string;
  path: string;
  type: 'directory'; // ⭐ ADD if not present
  // ... other fields
}

interface FileEntry {
  name: string;
  path: string;
  size: number;
  type: 'file'; // ⭐ ADD if not present
  // ... other fields
}
```

If the type field doesn't exist, update the code that creates these objects to include it.

### Step 2: Add Checkboxes to Directory Rows

Find the directory row rendering section and add selection capability:

```tsx
{
  filteredDirectories.map((dir, rowIndex) => (
    <Tr
      key={dir.path}
      className="bucket-row"
      isRowSelected={selectedItems.has(dir.path)} // ⭐ NEW
      onRowClick={(event) => {
        // ⭐ NEW: Support shift-click
        if (event?.shiftKey) {
          handleShiftClick(dir.path);
        }
      }}
    >
      {/* ⭐ NEW: Add selection checkbox */}
      <Td
        select={{
          rowIndex: rowIndex,
          onSelect: (_event, isSelecting) => handleSelectRow(dir.path, isSelecting),
          isSelected: selectedItems.has(dir.path),
        }}
      />

      {/* Existing folder icon and name */}
      <Td className="bucket-column">
        <Button variant="link" onClick={handlePathClick(dir.path)}>
          <FontAwesomeIcon icon={faFolder} />
          {dir.name}
        </Button>
      </Td>

      {/* ... other columns (size, modified date, etc.) ... */}
    </Tr>
  ));
}
```

### Step 3: Update Selection Handler

Ensure `handleSelectRow` works for both files and directories:

```typescript
const handleSelectRow = (itemPath: string, isSelecting: boolean) => {
  setSelectedItems((prev) => {
    const newSelection = new Set(prev);
    if (isSelecting) {
      newSelection.add(itemPath);
    } else {
      newSelection.delete(itemPath);
    }
    return newSelection;
  });
};
```

This function should already exist - verify it handles both files and directories correctly.

### Step 4: Update Shift-Click Selection

If shift-click selection is supported, ensure it works across files and directories:

```typescript
const handleShiftClick = (clickedPath: string) => {
  // Get all items (directories + files) in current view
  const allItems = [...filteredDirectories, ...filteredFiles];

  // Find indices of last selected and current clicked item
  // ... existing shift-click logic ...

  // Select range of items
  const itemsToSelect = allItems.slice(startIdx, endIdx + 1);
  setSelectedItems((prev) => {
    const newSelection = new Set(prev);
    itemsToSelect.forEach((item) => newSelection.add(item.path));
    return newSelection;
  });
};
```

### Step 5: Update Selection Display

Update the "X items selected" display to differentiate between files and folders:

```tsx
// Calculate counts
const selectedFileCount = Array.from(selectedItems).filter((itemPath) => {
  return files.some((f) => f.path === itemPath);
}).length;

const selectedFolderCount = Array.from(selectedItems).filter((itemPath) => {
  return directories.some((d) => d.path === itemPath);
}).length;

// Display component
{
  selectedItems.size > 0 && (
    <Toolbar>
      <ToolbarContent>
        <ToolbarItem>
          <Text>
            {selectedFileCount > 0 && (
              <>
                {selectedFileCount} file{selectedFileCount !== 1 ? 's' : ''}
              </>
            )}
            {selectedFileCount > 0 && selectedFolderCount > 0 && ', '}
            {selectedFolderCount > 0 && (
              <>
                {selectedFolderCount} folder{selectedFolderCount !== 1 ? 's' : ''}
              </>
            )}
            {' selected'}
          </Text>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="secondary" onClick={() => setSelectedItems(new Set())}>
            Clear selection
          </Button>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  );
}
```

### Step 6: Update Select All Functionality

If a "select all" feature exists, ensure it selects both files and directories:

```typescript
const handleSelectAll = (isSelecting: boolean) => {
  if (isSelecting) {
    // Select all visible items (directories + files)
    const allVisibleItems = new Set([
      ...filteredDirectories.map((d) => d.path),
      ...filteredFiles.map((f) => f.path),
    ]);
    setSelectedItems(allVisibleItems);
  } else {
    // Deselect all
    setSelectedItems(new Set());
  }
};
```

### Step 7: Add Visual Distinction (Optional)

Optionally add visual styling to differentiate selected folders from selected files:

```tsx
<Tr
  key={dir.path}
  className={`bucket-row ${selectedItems.has(dir.path) ? 'selected-folder' : ''}`}
  // ... rest of props
>
```

```css
/* In corresponding CSS file */
.selected-folder {
  background-color: var(--pf-v6-global--BackgroundColor--light-300);
}
```

## Testing Requirements

### Unit Tests

Add to `frontend/src/app/components/StorageBrowser/StorageBrowser.test.tsx`:

```typescript
describe('StorageBrowser - Directory Selection', () => {
  it('should render checkboxes for directory rows', () => {
    const mockDirectories = [
      { name: 'folder1', path: '/folder1', type: 'directory' },
      { name: 'folder2', path: '/folder2', type: 'directory' },
    ];

    render(<StorageBrowser directories={mockDirectories} files={[]} />);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
  });

  it('should select directory when checkbox clicked', () => {
    const mockDirectories = [
      { name: 'folder1', path: '/folder1', type: 'directory' },
    ];

    render(<StorageBrowser directories={mockDirectories} files={[]} />);

    const checkbox = screen.getByRole('checkbox', { name: /folder1/i });
    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  it('should show correct selection count for mixed selection', () => {
    const mockDirectories = [
      { name: 'folder1', path: '/folder1', type: 'directory' },
    ];
    const mockFiles = [
      { name: 'file1.txt', path: '/file1.txt', size: 100, type: 'file' },
      { name: 'file2.txt', path: '/file2.txt', size: 200, type: 'file' },
    ];

    render(<StorageBrowser directories={mockDirectories} files={mockFiles} />);

    // Select 1 folder and 2 files
    const folderCheckbox = screen.getByRole('checkbox', { name: /folder1/i });
    const file1Checkbox = screen.getByRole('checkbox', { name: /file1/i });
    const file2Checkbox = screen.getByRole('checkbox', { name: /file2/i });

    fireEvent.click(folderCheckbox);
    fireEvent.click(file1Checkbox);
    fireEvent.click(file2Checkbox);

    expect(screen.getByText(/2 files, 1 folder selected/i)).toBeInTheDocument();
  });

  it('should update selection count when folder selected', () => {
    const mockDirectories = [
      { name: 'folder1', path: '/folder1', type: 'directory' },
      { name: 'folder2', path: '/folder2', type: 'directory' },
    ];

    render(<StorageBrowser directories={mockDirectories} files={[]} />);

    const folder1Checkbox = screen.getByRole('checkbox', { name: /folder1/i });
    fireEvent.click(folder1Checkbox);

    expect(screen.getByText(/1 folder selected/i)).toBeInTheDocument();

    const folder2Checkbox = screen.getByRole('checkbox', { name: /folder2/i });
    fireEvent.click(folder2Checkbox);

    expect(screen.getByText(/2 folders selected/i)).toBeInTheDocument();
  });

  it('should deselect directory when checkbox clicked again', () => {
    const mockDirectories = [
      { name: 'folder1', path: '/folder1', type: 'directory' },
    ];

    render(<StorageBrowser directories={mockDirectories} files={[]} />);

    const checkbox = screen.getByRole('checkbox', { name: /folder1/i });

    // Select
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Deselect
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('should handle shift-click selection across files and folders', () => {
    const mockDirectories = [
      { name: 'folder1', path: '/folder1', type: 'directory' },
      { name: 'folder2', path: '/folder2', type: 'directory' },
    ];
    const mockFiles = [
      { name: 'file1.txt', path: '/file1.txt', size: 100, type: 'file' },
    ];

    render(<StorageBrowser directories={mockDirectories} files={mockFiles} />);

    // Click first folder
    const folder1Row = screen.getByText('folder1').closest('tr');
    fireEvent.click(folder1Row!);

    // Shift-click on file (should select range)
    const fileRow = screen.getByText('file1.txt').closest('tr');
    fireEvent.click(fileRow!, { shiftKey: true });

    // Verify range selected
    expect(screen.getByText(/2 folders, 1 file selected/i)).toBeInTheDocument();
  });

  it('should clear selection for both files and folders', () => {
    const mockDirectories = [{ name: 'folder1', path: '/folder1', type: 'directory' }];
    const mockFiles = [{ name: 'file1.txt', path: '/file1.txt', size: 100, type: 'file' }];

    render(<StorageBrowser directories={mockDirectories} files={mockFiles} />);

    // Select both
    const folderCheckbox = screen.getByRole('checkbox', { name: /folder1/i });
    const fileCheckbox = screen.getByRole('checkbox', { name: /file1/i });
    fireEvent.click(folderCheckbox);
    fireEvent.click(fileCheckbox);

    // Clear selection
    const clearButton = screen.getByRole('button', { name: /clear selection/i });
    fireEvent.click(clearButton);

    expect(folderCheckbox).not.toBeChecked();
    expect(fileCheckbox).not.toBeChecked();
  });
});
```

### Manual Testing Checklist

- [ ] Directory rows show checkboxes
- [ ] Clicking directory checkbox selects the folder
- [ ] Selected folders show visual indication (checkmark)
- [ ] Selection count shows "1 folder selected"
- [ ] Selecting multiple folders shows "X folders selected"
- [ ] Selecting mix shows "X files, Y folders selected"
- [ ] Shift-click works across files and folders
- [ ] Clear selection button clears both files and folders
- [ ] Double-clicking folder name still navigates into folder
- [ ] Single-clicking checkbox doesn't navigate

## Acceptance Criteria

- [ ] Directory rows have selection checkboxes (Td with select prop)
- [ ] Selecting directory checkbox updates selectedItems state
- [ ] Selection count distinguishes between files and folders
- [ ] Display shows "X file(s), Y folder(s) selected" for mixed selection
- [ ] Display shows only "X file(s) selected" when only files selected
- [ ] Display shows only "X folder(s) selected" when only folders selected
- [ ] Shift-click selection works across files and directories
- [ ] Clear selection button works for both files and folders
- [ ] All unit tests pass
- [ ] TypeScript compilation succeeds

## Accessibility Considerations

- [ ] Checkboxes have proper ARIA labels
- [ ] Selected state announced to screen readers
- [ ] Keyboard navigation works for folder selection
- [ ] Focus management maintained when selecting

## Related Documentation

- [Folder Copy Support Design](../folder-copy-support.md) - Section: Frontend UI Changes
- [PatternFly Table](https://www.patternfly.org/components/table/)
- [PatternFly Table - Selectable rows](https://www.patternfly.org/components/table/react-demos#selectable)

## Next Steps

After completion:

1. Task 2.2 (Update Storage Service Interface) - uses selected items
2. Task 2.3 (Update Transfer Action) - receives selected items with types
3. Task 2.4 (Pass File Listing) - provides full listing to determine types

## Notes

- Ensure double-clicking folder name still navigates (don't break existing behavior)
- Consider adding a "select all visible" checkbox in table header
- The `type` field in FileEntry/DirectoryEntry may need to be added if not present
- Keep UI consistent with existing file selection behavior
