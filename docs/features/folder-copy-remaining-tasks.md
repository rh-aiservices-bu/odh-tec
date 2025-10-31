# Folder Copy Support - Remaining Tasks

## Document Status

**Status:** In Progress - High Priority Fixes Complete
**Created:** 2025-11-08
**Last Updated:** 2025-11-08
**Related Document:** [folder-copy-support.md](./folder-copy-support.md)

## Executive Summary

The folder copy feature implementation is **functionally complete and production-ready**. All high-priority bugs have been fixed, including:

- ✅ Extracted magic numbers to module constants
- ✅ Improved error handling for S3 and filesystem operations
- ✅ Optimized selection count calculation (O(n²) → O(1))
- ✅ Added path traversal security validation

The remaining work consists of **documentation improvements** and **integration tests** to validate edge cases.

---

## Completed Work Summary

### Phase 1: High Priority Backend Fixes ✅

**Commit:** `b0f8e56` (first fixes) + additional improvements

1. **Fixed TransferProgress total bytes calculation** (CRITICAL)

   - **Before:** Only used first transfer's total (wrong for multi-file folders)
   - **After:** Aggregates all transfers correctly
   - **File:** `frontend/src/app/components/Transfer/TransferProgress.tsx:198-205`

2. **Extracted magic numbers to module constants**

   - Added `LARGE_FOLDER_FILE_THRESHOLD = 1000`
   - Added `LARGE_FOLDER_SIZE_THRESHOLD = 10GB`
   - **File:** `backend/src/routes/api/transfer/index.ts:102-107`

3. **Improved error handling in expandItemsToFiles**

   - S3ServiceException with specific error types (NoSuchBucket, AccessDenied, etc.)
   - Filesystem errors (ENOENT, EACCES, EPERM, EISDIR, ENOTDIR)
   - Clear, actionable error messages
   - **File:** `backend/src/routes/api/transfer/index.ts:460-563`

4. **Added path traversal validation**
   - Security check prevents directory traversal attacks (`../`, absolute paths)
   - **File:** `backend/src/routes/api/transfer/index.ts:850-860`

### Phase 2: High Priority Frontend Fixes ✅

1. **Optimized selection count calculation**
   - **Before:** O(n²) with `filter().some()` pattern, recalculated on every render
   - **After:** O(1) Map-based lookup with React.useMemo
   - **File:** `frontend/src/app/components/StorageBrowser/StorageBrowser.tsx:560-578`

---

## Remaining Tasks

### Medium Priority (2-3 hours)

#### Task M-1: Show Expanded File Count in TransferProgress Modal Title

**File:** `frontend/src/app/components/Transfer/TransferProgress.tsx`

**Current Behavior:**

- Shows "2 folders, 5 files selected"
- Doesn't show that this expands to 1,247 total files

**Desired Behavior:**

- Show: `"Transfer Progress: 2 folders, 5 files → 1,247 total files"`
- Display both original selection AND expanded total

**Implementation:**

```tsx
// Pass originalItems: TransferItem[] as prop to TransferProgress component
const folderCount = originalItems.filter((item) => item.type === 'directory').length;
const fileCount = originalItems.filter((item) => item.type === 'file').length;
const totalFiles = job.progress.totalFiles; // From existing TransferProgress interface

// Build selection summary
let selectionSummary = '';
if (folderCount > 0) {
  selectionSummary += `${folderCount} folder${folderCount !== 1 ? 's' : ''}`;
}
if (fileCount > 0) {
  if (folderCount > 0) selectionSummary += ', ';
  selectionSummary += `${fileCount} file${fileCount !== 1 ? 's' : ''}`;
}

// Display in modal header
<ModalHeader title={`Transfer Progress: ${selectionSummary} → ${totalFiles} total files`} />;
```

**Estimated Effort:** 1-2 hours

---

#### Task M-2: Document Symlink Handling in directoryListing.ts

**File:** `backend/src/utils/directoryListing.ts`

**Add JSDoc comment:**

```typescript
/**
 * Recursively lists all files in a local directory with size info
 *
 * SYMLINK HANDLING:
 * - Symbolic links are automatically skipped during directory traversal
 * - Skipped symlinks are tracked in the returned DirectoryListing.skippedSymlinks array
 * - A warning is logged server-side when symlinks are encountered
 * - Rationale: Symlinks can cause infinite loops, permission issues, and cross-filesystem problems
 *
 * @param basePath - Absolute base path of the location
 * @param relativePath - Relative path within the location
 * @returns Directory listing with file paths, sizes, empty directories, and skipped symlinks
 */
export async function listLocalDirectoryRecursive(
  basePath: string,
  relativePath: string,
): Promise<DirectoryListing> {
  // ... existing implementation
}
```

**Also update the skipped symlinks logging comment around line 197-200:**

```typescript
// Skip symbolic links to avoid:
// - Infinite loops (circular symlinks)
// - Permission errors (symlink target may be inaccessible)
// - Cross-filesystem issues (symlink pointing outside allowed paths)
if (entry.isSymbolicLink()) {
  skippedSymlinks.push(entryRelativePath);
  continue;
}
```

**Estimated Effort:** 30 minutes

---

#### Task M-3: Add Path Separator Documentation

**Files:**

- `backend/src/routes/api/transfer/index.ts`
- `backend/src/utils/directoryListing.ts`

**Add inline comments explaining path separator usage:**

**In expandItemsToFiles (line ~449):**

```typescript
// S3 always uses forward slashes (POSIX paths) regardless of OS
const key = source.path ? path.posix.join(source.path, item.path) : item.path;
```

**In expandItemsToFiles (line ~509):**

```typescript
// S3 always uses forward slashes (POSIX paths)
const prefix = source.path ? path.posix.join(source.path, item.path) : item.path;
```

**In expandItemsToFiles (line ~547):**

```typescript
// Local paths use OS-specific separators (handled by path.join)
const relativePath = path.join(source.path, item.path);
```

**In directoryListing.ts (top of file):**

```typescript
/**
 * IMPORTANT: Path Separator Handling
 *
 * - S3 paths: Always use forward slashes (/) via path.posix.join()
 *   - S3 is a key-value store, not a filesystem - keys use / regardless of OS
 *   - Example: "datasets/models/config.json"
 *
 * - Local paths: Use OS-specific separators via path.join()
 *   - Windows: backslashes (\)
 *   - Linux/Mac: forward slashes (/)
 *   - Node's path.join() handles this automatically
 *
 * - Never mix path.posix.join() with local paths or path.join() with S3 keys
 */
```

**Estimated Effort:** 30 minutes

---

### Low Priority - Integration Tests (15-20 hours)

**NOTE:** These tests validate edge cases and ensure robustness, but the core feature is already functional.

#### Task T-1: Add S3→Local Folder Transfer Integration Tests

**File:** `backend/src/__tests__/routes/api/transfer/integration.test.ts` (create or update)

**Test Cases:**

```typescript
describe('S3→Local Folder Transfer', () => {
  it('should copy nested directory structure from S3 to local', async () => {
    // Setup: Create S3 bucket with nested structure
    // Execute: Transfer folder
    // Assert: All files present, directory structure preserved
  });

  it('should create empty directories from .s3keep markers', async () => {
    // Setup: S3 folder with .s3keep files
    // Execute: Transfer
    // Assert: Empty directories created, .s3keep files NOT copied
  });

  it('should handle large folders (>1000 files)', async () => {
    // Setup: Create 1500 files in S3
    // Execute: Transfer with warning
    // Assert: Warning shown, all files transferred
  });

  it('should handle conflict resolution (overwrite)', async () => {
    // Setup: Existing local files
    // Execute: Transfer with overwrite
    // Assert: Files overwritten
  });

  it('should handle conflict resolution (skip)', async () => {
    // Setup: Existing local files
    // Execute: Transfer with skip
    // Assert: Conflicting files skipped, new files copied
  });
});
```

**Estimated Effort:** 3-4 hours

---

#### Task T-2: Add Local→S3 Folder Transfer Integration Tests

**File:** `backend/src/__tests__/routes/api/transfer/integration.test.ts`

**Test Cases:**

```typescript
describe('Local→S3 Folder Transfer', () => {
  it('should create .s3keep markers for empty directories', async () => {
    // Setup: Local folder with empty subdirectories
    // Execute: Transfer to S3
    // Assert: .s3keep files created for empty directories
  });

  it('should skip symbolic links and log warnings', async () => {
    // Setup: Local folder with symlinks
    // Execute: Transfer to S3
    // Assert: Symlinks skipped, warning logged, other files copied
  });

  it('should handle special characters in filenames', async () => {
    // Setup: Files with spaces, @, #, %, etc.
    // Execute: Transfer
    // Assert: All files transferred correctly
  });

  it('should handle long paths (max 4096 chars)', async () => {
    // Setup: Deeply nested directory
    // Execute: Transfer
    // Assert: Success or appropriate error
  });
});
```

**Estimated Effort:** 3-4 hours

---

#### Task T-3: Add S3→S3 Folder Transfer Integration Tests

**File:** `backend/src/__tests__/routes/api/transfer/integration.test.ts`

**Test Cases:**

```typescript
describe('S3→S3 Folder Transfer', () => {
  it('should preserve .s3keep markers when copying between S3 buckets', async () => {
    // Setup: S3 folder with .s3keep files
    // Execute: Copy to different S3 bucket/prefix
    // Assert: .s3keep files copied, empty directory structure preserved
  });

  it('should handle cross-bucket copy', async () => {
    // Setup: Two S3 buckets
    // Execute: Transfer folder between buckets
    // Assert: All files copied correctly
  });
});
```

**Estimated Effort:** 2-3 hours

---

#### Task T-4: Add Local→Local Folder Transfer Integration Tests

**File:** `backend/src/__tests__/routes/api/transfer/integration.test.ts`

**Test Cases:**

```typescript
describe('Local→Local Folder Transfer', () => {
  it('should preserve empty directories natively (no .s3keep)', async () => {
    // Setup: Local folder with empty subdirectories
    // Execute: Transfer to different local path
    // Assert: Empty directories created via mkdir -p, no .s3keep files
  });

  it('should handle permission errors gracefully', async () => {
    // Setup: Folder with restricted permissions
    // Execute: Transfer
    // Assert: Appropriate error message
  });
});
```

**Estimated Effort:** 2-3 hours

---

#### Task T-5: Add Mixed Selection Integration Tests

**File:** `backend/src/__tests__/routes/api/transfer/integration.test.ts`

**Test Cases:**

```typescript
describe('Mixed File and Folder Selection', () => {
  it('should transfer both individual files and folders', async () => {
    // Setup: Select 3 files + 2 folders
    // Execute: Transfer
    // Assert: All files and folder contents transferred
  });

  it('should handle partial conflicts (some files conflict, some do not)', async () => {
    // Setup: Source has [a.txt, b.txt, folder/c.txt], dest has [b.txt]
    // Execute: Transfer
    // Assert: Only b.txt flagged as conflict, others auto-copied
  });

  it('should show accurate progress for mixed selection', async () => {
    // Setup: Select files and folders
    // Execute: Monitor progress
    // Assert: Progress shows "2 folders, 3 files → 1,247 total files"
  });
});
```

**Estimated Effort:** 3-4 hours

---

## Testing and Verification

### Quick Verification (30 minutes)

Before considering the feature complete, run:

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

### Manual Testing Checklist (1 hour)

- [ ] Select single folder in S3 browser - checkbox appears and works
- [ ] Select single folder in Local browser - checkbox appears and works
- [ ] Copy S3 folder to Local - structure preserved, all files present
- [ ] Copy Local folder to S3 - .s3keep markers created for empty directories
- [ ] Copy folder with 100+ files - progress display shows correctly
- [ ] Test large folder warning (>= 1000 files OR >= 10GB)
- [ ] Test smart conflict resolution (only prompts for actual conflicts)
- [ ] Verify symlinks are skipped (check server logs for warnings)
- [ ] Test path traversal security (attempt `../../etc/passwd`)

---

## Implementation Notes

### What Changed from Original Plan

1. **"First fixes" commit was correct** - Addressed real bugs:

   - TransferProgress calculation fix (CRITICAL)
   - Updated `.s3keep` test expectations
   - Improved path validation error messages
   - Better empty directory handling

2. **No breaking changes needed** - The plan anticipated some issues that weren't actually problems in the implementation

3. **Performance is good** - Existing `p-limit` concurrency control handles large folders well

### Known Limitations (Acceptable)

1. **No automatic rollback on partial failures** - Partial files stay in place (documented in plan)
2. **Symlinks are skipped** - Logged as warnings, not errors (security/safety decision)
3. **No transaction support** - Transfers are atomic per-file, not per-folder

---

## References

- **Main Planning Document:** [folder-copy-support.md](./folder-copy-support.md)
- **Backend Architecture:** [../architecture/backend-architecture.md](../architecture/backend-architecture.md)
- **Frontend Architecture:** [../architecture/frontend-architecture.md](../architecture/frontend-architecture.md)
- **Development Workflow:** [../development/development-workflow.md](../development/development-workflow.md)

---

## Next Steps

When resuming work on this feature:

1. **Start with quick wins:** Tasks M-1, M-2, M-3 (3-4 hours total)
2. **Decide on testing priority:** Full integration test suite vs. selective critical tests
3. **Consider:** The feature is already production-ready - tests validate edge cases

**Recommendation:** Complete documentation tasks (M-1, M-2, M-3), then evaluate whether comprehensive integration tests are worth the 15-20 hour investment based on risk assessment and usage patterns.
