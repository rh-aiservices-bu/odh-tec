import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConflictResolutionModal } from '@app/components/Transfer/ConflictResolutionModal';

describe('ConflictResolutionModal - Smart Conflict UI', () => {
  const mockOnResolve = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show non-conflicting files info', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file2.txt']}
        nonConflictingFiles={['file1.txt', 'file3.txt']}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText(/2 files will be copied automatically \(no conflicts\)/i)).toBeInTheDocument();
  });

  it('should show conflicting files count', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt', 'file2.txt', 'file3.txt']}
        nonConflictingFiles={['file4.txt']}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText(/3 files already exist/i)).toBeInTheDocument();
  });

  it('should list first 25 conflicting files', () => {
    const manyConflicts = Array.from({ length: 50 }, (_, i) => `file${i}.txt`);

    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={manyConflicts}
        nonConflictingFiles={[]}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText(/Showing first 25 of 50 conflicts/i)).toBeInTheDocument();
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(25);
  });

  it('should call onResolve with selected resolution', async () => {
    const user = userEvent.setup();

    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt']}
        nonConflictingFiles={[]}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Select overwrite
    const overwriteRadio = screen.getByRole('radio', { name: /overwrite/i });
    await user.click(overwriteRadio);

    // Apply
    const applyButton = screen.getByRole('button', { name: /apply/i });
    await user.click(applyButton);

    expect(mockOnResolve).toHaveBeenCalledWith('overwrite');
  });

  it('should update summary based on resolution choice - skip', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt', 'file2.txt']}
        nonConflictingFiles={['file3.txt']}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Default: skip
    expect(screen.getByText(/Total: 1 files will be copied/i)).toBeInTheDocument();
    expect(screen.getByText(/2 conflicts will be skipped/i)).toBeInTheDocument();
  });

  it('should update summary based on resolution choice - overwrite', async () => {
    const user = userEvent.setup();

    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt', 'file2.txt']}
        nonConflictingFiles={['file3.txt']}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Change to overwrite
    const overwriteRadio = screen.getByRole('radio', { name: /overwrite/i });
    await user.click(overwriteRadio);

    expect(screen.getByText(/Total: 3 files will be copied/i)).toBeInTheDocument();
    expect(screen.getByText(/2 conflicts will be overwritten/i)).toBeInTheDocument();
  });

  it('should update summary based on resolution choice - rename', async () => {
    const user = userEvent.setup();

    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt', 'file2.txt']}
        nonConflictingFiles={['file3.txt']}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Change to rename
    const renameRadio = screen.getByRole('radio', { name: /rename/i });
    await user.click(renameRadio);

    expect(screen.getByText(/Total: 3 files will be copied/i)).toBeInTheDocument();
    expect(screen.getByText(/2 conflicts will be renamed/i)).toBeInTheDocument();
  });

  it('should handle no non-conflicting files', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt']}
        nonConflictingFiles={[]}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.queryByText(/will be copied automatically \(no conflicts\)/i)).not.toBeInTheDocument();
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt']}
        nonConflictingFiles={[]}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('should show all three resolution options', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt']}
        nonConflictingFiles={[]}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByRole('radio', { name: /skip/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /overwrite/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /rename/i })).toBeInTheDocument();
  });

  it('should have skip as default resolution', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt']}
        nonConflictingFiles={[]}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    const skipRadio = screen.getByRole('radio', { name: /skip/i }) as HTMLInputElement;
    expect(skipRadio.checked).toBe(true);
  });

  it('should not show conflict list truncation message when less than 25 conflicts', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt', 'file2.txt', 'file3.txt']}
        nonConflictingFiles={[]}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.queryByText(/Showing first 25 of/i)).not.toBeInTheDocument();
  });

  it('should display modal title', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt']}
        nonConflictingFiles={[]}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Resolve File Conflicts')).toBeInTheDocument();
  });

  it('should handle single file conflict correctly', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt']}
        nonConflictingFiles={['file2.txt']}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Singular form for 1 file
    expect(screen.getByText(/1 file will be copied automatically \(no conflicts\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 file already exists/i)).toBeInTheDocument();
  });

  it('should handle multiple files conflict correctly', () => {
    render(
      <ConflictResolutionModal
        isOpen={true}
        conflictingFiles={['file1.txt', 'file2.txt']}
        nonConflictingFiles={['file3.txt', 'file4.txt']}
        onResolve={mockOnResolve}
        onCancel={mockOnCancel}
      />
    );

    // Plural form for multiple files
    expect(screen.getByText(/2 files will be copied automatically \(no conflicts\)/i)).toBeInTheDocument();
    expect(screen.getByText(/2 files already exist/i)).toBeInTheDocument();
  });
});
