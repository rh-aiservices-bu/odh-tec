# Folder Copy Support

## Document Status

**Status:** Planning - Decisions Made
**Created:** 2025-11-07
**Last Updated:** 2025-11-07
**Target Version:** TBD

## Executive Summary

This document outlines the design and implementation plan for extending the copy/transfer functionality in ODH-TEC to support recursive folder copying, including all subfolders and files. Currently, only individual files can be selected and copied. This enhancement will enable users to copy entire directory structures between storage locations (S3, Local, PVC).

**Complexity:** Moderate
**Estimated Effort:** 26-39 hours (core development + testing + streaming)
**Risk Level:** Low (builds on existing infrastructure)

### Design Decisions Summary

Key decisions have been made for this implementation:

1. **Empty Directory Handling:** Create `.s3keep` marker files to preserve exact directory structure in S3
2. **Conflict Resolution:** Smart merge - automatically copy non-conflicting files, only prompt for actual conflicts
3. **Large Folder Warning:** Warn users when selecting folders with 1,000+ files
4. **Progress Display:** Show detailed stats (file count + data size transferred)
5. **API Compatibility:** Breaking change - no backwards compatibility with old `files[]` format
6. **Size Calculation:** Calculate total folder size upfront for accurate progress tracking

---

## Table of Contents

1. [Goal and Motivation](#goal-and-motivation)
2. [Current State Analysis](#current-state-analysis)
3. [Technical Challenges](#technical-challenges)
4. [Proposed Solution](#proposed-solution)
5. [Design Decisions](#design-decisions)
6. [Implementation Plan](#implementation-plan)
7. [Testing Strategy](#testing-strategy)
8. [References](#references)

---

## Goal and Motivation

### Primary Goal

Enable users to select and copy entire folders (including all nested subfolders and files) from any storage location to any other storage location, preserving the complete directory structure.

### User Stories

**As a data scientist**, I want to:

- Copy an entire model directory from S3 to my local workspace in one operation
- Copy a complete dataset folder (with subdirectories) from one S3 bucket to another
- Copy my local project folder to S3 for backup/sharing
- Copy folder structures between PVCs

**Current Workaround:**
Users must manually select all files individually, which is:

- Time-consuming for large directory structures
- Error-prone (easy to miss files in subdirectories)
- Impossible for deeply nested structures (requires navigating into each subfolder)

### Success Criteria

- ✅ Users can select folders in the StorageBrowser UI
- ✅ Selected folders show visual indication (checkbox)
- ✅ Copying a folder preserves the complete directory structure
- ✅ Progress tracking shows folder-level and file-level progress
- ✅ Conflict resolution works for folders and their contents
- ✅ All four transfer combinations work (S3↔S3, S3↔Local, Local↔Local, Local↔S3)
- ✅ Empty folders are handled appropriately
- ✅ Performance is acceptable for large directory trees (1000+ files)

---

## Current State Analysis

### Current Implementation

#### Backend: Transfer API (`backend/src/routes/api/transfer/index.ts`)

**Request Interface:**

```typescript
interface TransferRequest {
  source: {
    type: 'local' | 's3'; // Note: PVC storage uses type='local'
    locationId: string;
    path: string;
  };
  destination: {
    type: 'local' | 's3'; // Note: PVC storage uses type='local'
    locationId: string;
    path: string;
  };
  files: string[]; // ⚠️ Array of file names only (not full paths)
  conflictResolution: 'overwrite' | 'skip' | 'rename';
}
```

**Transfer Functions:**

- `transferS3ToLocal()`
- `transferLocalToS3()`
- `transferLocalToLocal()`
- `transferS3ToS3()` - Uses `CopyObjectCommand`

**Job Creation:**

```typescript
const transferJobs = files.map((file) => ({
  sourcePath: `${source.type}:${source.locationId}/${path.join(source.path, file)}`,
  destinationPath: `${destination.type}:${destination.locationId}/${path.join(
    destination.path,
    file,
  )}`,
  size: 0,
}));
```

**Key Assumption:** The `files` array contains simple file names (not full paths with subdirectories).

#### Frontend: StorageBrowser (`frontend/src/app/components/StorageBrowser/StorageBrowser.tsx`)

**Directory Rows:**

```tsx
{
  filteredDirectories.map((dir, rowIndex) => (
    <Tr key={dir.path} className="bucket-row">
      <Td /> {/* ⚠️ NO CHECKBOX - Empty cell */}
      <Td className="bucket-column">
        <Button variant="link" onClick={handlePathClick(dir.path)}>
          <FontAwesomeIcon icon={faFolder} />
          {dir.name}
        </Button>
      </Td>
      {/* ... */}
    </Tr>
  ));
}
```

**File Rows:** DO have checkboxes

```tsx
<Td
  select={{
    rowIndex: rowIndex,
    onSelect: (_event, isSelecting) => handleSelectRow(file.path, isSelecting),
    isSelected: selectedItems.has(file.path),
  }}
/>
```

**Selection State:**

```typescript
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
```

### Current Limitations (Blockers)

1. **UI Restriction (Primary Blocker)**

   - Directory rows have no selection checkbox
   - Users cannot select folders in the UI
   - `selectedItems` only contains file paths

2. **Backend Transfer Logic (Secondary Blocker)**

   - Transfer request expects file names, not directory paths
   - No mechanism to recursively expand directories
   - No detection of whether an item is a file or folder

3. **No Recursive Listing**

   - No utility to list all files within a directory tree
   - No path preservation logic for nested structures
   - No handling of empty directories

4. **S3 Virtual Directories**
   - S3 doesn't have real directories (just key prefixes)
   - Need special handling to list "folder contents"
   - Empty folders may need marker objects

---

## Technical Challenges

### Challenge 1: Directory Detection and Recursive Expansion

**Problem:** When a folder is selected, we need to expand it to all contained files recursively.

**For S3:**

- Use `ListObjectsV2Command` with prefix matching
- Handle pagination for large directories
- Recursively list all objects under the prefix
- Preserve relative path structure

**For Local Storage:**

- Use `fs.readdir()` with `recursive: true` option (Node.js 18.20+, available in base container)
- Skip symbolic links with warning (collect skipped paths for user notification)
- Handle permissions errors gracefully
- Preserve relative paths

**For PVC:**

- Same as local storage (PVC is mounted as local directory)

### Challenge 2: Path Preservation

**Current Behavior:** Files are flattened (only file names, no subdirectory structure)

**Required Behavior:** Preserve complete directory structure:

```
Source:
  project/
    ├── src/
    │   ├── main.py
    │   └── utils/
    │       └── helper.py
    └── data/
        └── dataset.csv

Destination:
  project/
    ├── src/
    │   ├── main.py
    │   └── utils/
    │       └── helper.py
    └── data/
        └── dataset.csv
```

**Key Requirements:**

- Relative paths must be preserved
- Directory structure must be recreated at destination
- Nested subdirectories must be created before files

### Challenge 3: Transfer Job Structure

**Current:** One transfer job per file

**Options for Folders:**

**Option A: Flatten to Individual Files**

- Expand folder to file list
- Create one job per file (existing behavior)
- ✅ Minimal changes to job structure
- ❌ Progress tracking shows individual files, not folder progress

**Option B: Hierarchical Jobs**

- One parent job per folder
- Child jobs for each file
- ✅ Better progress visualization
- ❌ Requires changes to job management system

**Option C: Grouped Jobs**

- One job for entire folder
- Track individual file progress within job
- ✅ Clean progress tracking
- ❌ More complex job structure

**Recommendation:** Start with **Option A** (simplest), upgrade to **Option C** if needed.

### Challenge 4: S3 Virtual Directories

**Issue:** S3 has no concept of directories - they're virtual (common prefixes in object keys)

**Implications:**

**When copying S3 folder to S3:**

- List all objects with matching prefix
- Copy each object individually
- Object keys inherently preserve "directory" structure

**When copying S3 folder to Local:**

- List all objects with matching prefix
- Create actual directories on filesystem
- Handle empty "directories" (may have no objects)

**When copying Local folder to S3:**

- Walk local directory tree
- Upload each file with key preserving path structure
- Empty directories may need `.s3keep` marker objects (or skip)

**Empty Directory Handling:**

**Decision:** Create `.s3keep` marker files to preserve exact directory structure in S3.

**Complete Behavior Matrix:**

| Transfer Type     | Source Has Empty Dir | Behavior                                                                                            |
| ----------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| **Local → S3**    | Yes                  | Create `.s3keep` marker file in S3 for each empty directory                                         |
| **S3 → Local**    | Contains `.s3keep`   | Skip `.s3keep` file, create empty directory on local filesystem                                     |
| **S3 → S3**       | Contains `.s3keep`   | Copy `.s3keep` file as regular object (preserves empty dir structure)                               |
| **Local → Local** | Yes                  | Native OS support - empty directories are created automatically via `fs.mkdir({ recursive: true })` |

**Implementation Details:**

- **Local→S3**: Detect empty directories during listing, create `.s3keep` marker (0 bytes)
- **S3→Local**: Filter out `.s3keep` files during transfer, create parent directories naturally
- **S3→S3**: Treat `.s3keep` as regular files, copy them normally
- **Local→Local**: OS handles empty directories, no special handling needed

### Challenge 5: Conflict Resolution

**Current:** Per-file conflict detection and resolution

**For Folders:**

**Conflict Scenarios:**

1. **Destination folder exists with same name**

   - What if it contains different files?
   - What if files overlap partially?

2. **Individual files within folder conflict**
   - Apply folder-level resolution to all files?
   - Or ask per-file?

**Conflict Resolution Strategy:**

**Decision:** Smart merge approach with file-level granularity

**Implementation:**

- When checking conflicts, identify which specific files conflict
- Automatically copy non-conflicting files (e.g., new files not in destination)
- Only show conflict resolution dialog for files that actually exist in both locations
- Example: If source has [a.txt, b.txt, c.txt] and dest has [b.txt, d.txt], only ask about b.txt
- This provides the best user experience - handles 90% automatically, minimal user intervention

**Granularity:**

- Conflict resolution applies at the **file level**, not folder level
- If a folder contains 100 files and 10 conflict:
  - User selects "skip" → Skip only the 10 conflicting files, copy the other 90
  - User selects "overwrite" → Overwrite the 10 conflicting files, copy the other 90
  - User selects "rename" → Rename the 10 conflicting files, copy the other 90
- Result: Folder is merged, not all-or-nothing

### Challenge 6: Performance and Memory

**Concerns:**

- Large directory trees (1000+ files) could create massive transfer job lists
- Memory usage for recursive listing
- UI responsiveness during folder expansion

**Decisions:**

1. **Large folder warning:** Warn users when selecting folders with 1,000+ files
2. **Size calculation:** Calculate total size upfront for accurate progress tracking
3. **Progress display:** Show detailed stats - file count and data size (e.g., "127/283 files, 1.2GB/2.5GB")

**Implementation:**

- Use streaming/pagination for S3 listings to minimize memory
- Calculate folder size during initial recursive listing
- Show warning dialog if folder contains >1,000 files
- Display progress with both file count and data transferred

### Challenge 7: Partial Transfer Failures

**Issue:** What happens when a folder transfer fails after successfully copying some files?

**Decision:** Leave partial files in place (no automatic rollback)

**Rationale:**

- Simplifies implementation - no transaction/rollback logic needed
- Partial transfers may still be useful to users
- Automatic cleanup could delete intentionally placed files
- Users can manually clean up if needed

**Implementation:**

- If transfer fails, maintain all successfully transferred files
- Error message indicates partial completion: "Transfer failed - X of Y files completed"
- Progress UI shows final state with completed file count
- User can retry transfer (will trigger conflict resolution for already-copied files)
- Skipped symbolic links are logged as warnings, not errors

---

## Proposed Solution

### High-Level Architecture

```
User selects folder in UI
         ↓
Frontend detects item type (file vs folder)
         ↓
Frontend sends transfer request with items[]
         ↓
Backend receives request
         ↓
Backend expands folders → recursive file list
         ↓
Backend creates transfer jobs (preserving paths)
         ↓
Backend executes transfers (existing logic)
         ↓
Frontend shows progress (folder + file level)
```

### Component Changes Overview

| Component         | Change Type                          | Complexity | Files Modified |
| ----------------- | ------------------------------------ | ---------- | -------------- |
| Backend API       | Interface update + recursive listing | Moderate   | 2-3            |
| Backend Utils     | New recursive listing utilities      | Moderate   | 1 (new)        |
| Frontend UI       | Enable folder selection              | Simple     | 1              |
| Frontend Service  | Interface update + type detection    | Simple     | 1              |
| Frontend Transfer | Update request building              | Simple     | 1              |
| Tests             | New tests for folder operations      | Moderate   | 3-4            |

### Data Model Changes

#### Updated Transfer Request Interface

```typescript
interface TransferRequest {
  source: {
    type: 'local' | 's3'; // Note: PVC storage uses type='local' with mountPath
    locationId: string;
    path: string;
  };
  destination: {
    type: 'local' | 's3'; // Note: PVC storage uses type='local' with mountPath
    locationId: string;
    path: string;
  };
  items: TransferItem[]; // ⚠️ CHANGED from 'files: string[]'
  conflictResolution: 'overwrite' | 'skip' | 'rename';
}

interface TransferItem {
  path: string; // Relative path from source.path (see examples below)
  type: 'file' | 'directory';
}

// Path Format Examples:
// User navigates to: /bucket/datasets/
// User selects folder: "models/"  → TransferItem = { path: "models", type: "directory" }
// User selects file: "readme.txt" → TransferItem = { path: "readme.txt", type: "file" }
//
// When "models" folder is expanded, child files become:
//   { path: "models/config.json", ... }
//   { path: "models/weights/layer1.bin", ... }
//   { path: "models/weights/layer2.bin", ... }

interface ConflictCheckResponse {
  conflicts: string[]; // Files that exist in both source and destination
  nonConflicting: string[]; // Files that only exist in source (will be auto-copied)
  warning?: {
    type: 'large_folder';
    fileCount: number;
    totalSize: number;
    message: string;
  };
}

// NOTE: Transfer progress uses existing TransferProgress and TransferFileJob interfaces
// from backend/src/services/transferQueue.ts - no new interfaces needed
```

**API Compatibility Decision:**

**Breaking change** - The new `items: TransferItem[]` format will completely replace the old `files: string[]` format. No backwards compatibility will be maintained.

**Rationale:**

- Cleaner codebase without compatibility shims
- No known external API consumers
- Simpler implementation and maintenance
- Both backend and frontend will be updated simultaneously

---

## Design Decisions

This section documents all key design decisions made for the folder copy feature implementation.

### 1. Empty Directory Handling

**Decision:** Create `.s3keep` marker files in S3 to preserve empty directories

**Rationale:**

- Preserves exact directory structure when copying to/from S3
- Common pattern used by git (`.gitkeep`) and other tools
- Small overhead (tiny files) vs complete structure preservation

**Implementation Details:**

- When copying local→S3: Create `.s3keep` files for empty directories
- When copying S3→local: Skip `.s3keep` files or optionally preserve them
- Marker file size: 0 bytes or minimal content
- File naming: `.s3keep` (consistent with common conventions)

### 2. Conflict Resolution

**Decision:** Smart merge - automatically copy non-conflicting files, only prompt for actual conflicts

**Rationale:**

- Best user experience - handles most cases automatically
- Reduces user fatigue (no prompts for files that don't conflict)
- Maintains user control where it matters (actual conflicts)

**Implementation Details:**

- Backend: During conflict check, identify specific conflicting file paths
- Frontend: Only show conflict dialog if conflicts exist
- Auto-copy: Files that don't exist in destination are copied automatically
- User prompt: Only for files that exist in both source and destination

**Example:**

```
Source: [models/a.txt, models/b.txt, models/c.txt]
Destination: [models/b.txt, models/d.txt]

Behavior:
- Auto-copy: a.txt, c.txt (no conflicts)
- User prompt: b.txt (conflict detected)
- Destination remains: d.txt (not affected)
```

### 3. Large Folder Warning

**Decision:** Warn users when selecting folders exceeding EITHER threshold: 1,000+ files OR 10GB+ total size

**Rationale:**

- Prevents accidental large transfers that could take significant time or bandwidth
- Dual thresholds catch both many-small-files and few-large-files scenarios
- Provides opportunity to cancel before expensive operation begins

**Implementation Details:**

- Count files and calculate total size during initial folder expansion
- Show modal warning if EITHER threshold exceeded: "This operation will transfer X files (Y GB). Proceed with copy?"
- Allow user to proceed or cancel
- Warning thresholds: 1,000 files OR 10GB total size

### 4. Progress Display

**Decision:** Show detailed statistics - both file count and data size

**Rationale:**

- More informative than simple percentage
- Users care about both number of files and total data transferred
- Enables better ETA calculation

**Implementation Details:**

- Display format: "Copying folder 'models' (127/283 files, 1.2GB/2.5GB)"
- Calculate total size during initial folder scan
- Update both metrics in real-time during transfer
- Show percentage based on data transferred (more accurate than file count)

### 5. API Compatibility

**Decision:** Breaking change - remove old `files: string[]` format, use only `items: TransferItem[]`

**Rationale:**

- Cleaner codebase without backwards compatibility layer
- No known external API consumers
- Frontend and backend updated together in single release
- Simplifies testing and maintenance

**Implementation Details:**

- Remove `files` field from `TransferRequest` interface
- Update all API calls to use `items` field
- No migration path needed (internal API only)
- Update API documentation

### 6. Size Calculation Timing

**Decision:** Calculate all file sizes upfront before transfer begins (both individual files and directory contents)

**Rationale:**

- Accurate progress percentages from the start
- Better ETA calculation
- Can enforce size limits/warnings before transfer
- Enables accurate total size display in warning dialogs
- Worth the slight overhead for better UX

**Implementation Details:**

- For directories: During recursive file listing, accumulate total size
  - S3: Use `Size` field from `ListObjectsV2Command` response (already included)
  - Local: Use `fs.stat()` to get file sizes
- For individual files: Make upfront size query
  - S3: Use `HeadObjectCommand` to get `ContentLength`
  - Local: Use `fs.stat()` to get file size
- Display size calculation progress if it takes >2 seconds
- All sizes calculated before creating transfer jobs

---

## Implementation Plan

### Phase 1: Backend Core Functionality

**Goal:** Enable backend to handle folder transfer requests

#### Task 1.1: Create Recursive Directory Listing Utilities with Size Calculation

**File:** `backend/src/utils/directoryListing.ts` (NEW)

**Functions to implement:**

```typescript
interface FileInfo {
  path: string; // Relative path
  size: number; // File size in bytes
  isMarker?: boolean; // Optional flag for .s3keep marker files (Local→S3 only)
}

interface DirectoryListing {
  files: FileInfo[];
  totalSize: number;
  fileCount: number;
  emptyDirectories: string[]; // For .s3keep marker creation
  skippedSymlinks: string[]; // Symbolic links that were skipped (local only)
}

/**
 * Recursively lists all files in an S3 "directory" (prefix) with size info
 * @param s3Client - Configured S3 client
 * @param bucket - S3 bucket name
 * @param prefix - Directory prefix to list
 * @returns Directory listing with file paths, sizes, and empty directory info
 */
export async function listS3DirectoryRecursive(
  s3Client: S3Client,
  bucket: string,
  prefix: string,
): Promise<DirectoryListing> {
  // Implementation:
  // 1. Use ListObjectsV2Command with Prefix parameter
  // 2. Handle pagination (ContinuationToken)
  // 3. Collect file paths AND sizes from Size field
  // 4. Detect empty directories (prefixes with no files)
  // 5. Calculate total size and file count
  // 6. Return comprehensive listing
}

/**
 * Recursively lists all files in a local directory with size info
 * Uses efficient withFileTypes approach to avoid extra stat calls
 * @param basePath - Absolute base path of the location
 * @param relativePath - Relative path within the location
 * @returns Directory listing with file paths, sizes, and empty directory info
 */
export async function listLocalDirectoryRecursive(
  basePath: string,
  relativePath: string,
): Promise<DirectoryListing> {
  const files: FileInfo[] = [];
  const emptyDirectories: string[] = [];
  const skippedSymlinks: string[] = [];
  let totalSize = 0;

  const fullPath = path.join(basePath, relativePath);

  async function recurse(currentDir: string, relativeDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    // Track if directory has any non-symlink children
    let hasChildren = false;

    for (const entry of entries) {
      const entryFullPath = path.join(currentDir, entry.name);
      const entryRelativePath = path.join(relativeDir, entry.name);

      // Skip symbolic links
      if (entry.isSymbolicLink()) {
        skippedSymlinks.push(entryRelativePath);
        continue;
      }

      if (entry.isDirectory()) {
        hasChildren = true;
        await recurse(entryFullPath, entryRelativePath);
      } else if (entry.isFile()) {
        hasChildren = true;
        const stats = await fs.stat(entryFullPath);
        files.push({
          path: entryRelativePath,
          size: stats.size,
        });
        totalSize += stats.size;
      }
    }

    // Mark as empty if no non-symlink children found
    // This handles both truly empty dirs and dirs containing only symlinks
    if (!hasChildren) {
      emptyDirectories.push(relativeDir);
    }
  }

  await recurse(fullPath, relativePath);

  return {
    files,
    totalSize,
    fileCount: files.length,
    emptyDirectories,
    skippedSymlinks,
  };
}

/**
 * Helper: Normalizes path separators and removes trailing slashes
 */
function normalizePath(path: string): string {
  // Ensure consistent path format
}
```

**Key Changes from Original Design:**

- Returns `DirectoryListing` object instead of simple array
- Includes file sizes for upfront size calculation
- Tracks empty directories for `.s3keep` marker creation
- Provides total size and file count for progress display
- Validates path lengths (max 4096 characters on Linux)
- Handles paths with special characters (@, #, %, spaces, etc.)
- Skips symbolic links and tracks them separately

**Estimated Effort:** 3-4 hours (increased for size calculation)
**Testing:** Unit tests with mock filesystem and S3 responses, verify size calculations, test path edge cases (long paths, special characters, symlinks)

#### Task 1.2: Update Transfer Request Interface (Breaking Change)

**File:** `backend/src/routes/api/transfer/index.ts`

**Changes:**

1. **Replace interface:**

```typescript
interface TransferItem {
  path: string;
  type: 'file' | 'directory';
}

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
  items: TransferItem[]; // ⚠️ BREAKING: Replaced 'files: string[]'
  conflictResolution: 'overwrite' | 'skip' | 'rename';
}
```

2. **Remove `files` field entirely - no backwards compatibility**

**Key Changes from Original Design:**

- No backwards compatibility handler needed
- Clean break from old API
- Simpler implementation

**Estimated Effort:** 30 minutes (simpler without compat layer)
**Testing:** Verify new request format works, ensure old format is rejected

#### Task 1.3: Implement Directory Expansion Logic

**File:** `backend/src/routes/api/transfer/index.ts`

**Changes:**

Replace the simple `files.map()` with directory expansion:

```typescript
async function expandItemsToFiles(
  items: TransferItem[],
  source: TransferRequest['source'],
): Promise<FileInfo[]> {
  const allFiles: FileInfo[] = [];

  for (const item of items) {
    if (item.type === 'file') {
      // Individual file - get size upfront for accurate progress tracking
      let size = 0;

      if (source.type === 's3') {
        const location = locations.find((loc) => loc.id === source.locationId);
        if (!location || location.type !== 's3') {
          throw new Error(`S3 location ${source.locationId} not found`);
        }
        const s3Client = getS3Client(location);
        const response = await s3Client.send(
          new HeadObjectCommand({
            Bucket: location.bucket,
            Key: path.posix.join(source.path, item.path),
          }),
        );
        size = response.ContentLength || 0;
      } else {
        // Local or PVC
        const location = locations.find((loc) => loc.id === source.locationId);
        if (!location) {
          throw new Error(`Location ${source.locationId} not found`);
        }
        const basePath = location.type === 'local' ? location.path : location.mountPath;
        const fullPath = path.join(basePath, source.path, item.path);
        const stats = await fs.stat(fullPath);
        size = stats.size;
      }

      allFiles.push({ path: item.path, size });
    } else if (item.type === 'directory') {
      // Directory - expand to file list with sizes
      let dirListing: DirectoryListing;

      if (source.type === 's3') {
        const location = locations.find((loc) => loc.id === source.locationId);
        if (!location || location.type !== 's3') {
          throw new Error(`S3 location ${source.locationId} not found`);
        }

        const s3Client = getS3Client(location);
        const fullPrefix = path.posix.join(source.path, item.path);

        dirListing = await listS3DirectoryRecursive(s3Client, location.bucket, fullPrefix);

        // Make paths relative to source.path
        dirListing.files = dirListing.files.map((f) => ({
          ...f,
          path: f.path.startsWith(source.path) ? f.path.substring(source.path.length + 1) : f.path,
        }));
      } else {
        // Local or PVC (both use type='local')
        const location = locations.find((loc) => loc.id === source.locationId);
        if (!location) {
          throw new Error(`Location ${source.locationId} not found`);
        }

        const basePath = location.type === 'local' ? location.path : location.mountPath;

        const fullPath = path.join(source.path, item.path);

        dirListing = await listLocalDirectoryRecursive(basePath, fullPath);

        // Make paths relative to source.path
        dirListing.files = dirListing.files.map((f) => ({
          ...f,
          path: f.path.startsWith(source.path) ? f.path.substring(source.path.length + 1) : f.path,
        }));

        // Warn user about skipped symlinks if any
        if (dirListing.skippedSymlinks.length > 0) {
          logger.warn(
            `Skipped ${dirListing.skippedSymlinks.length} symbolic links in ${item.path}`,
          );
        }
      }

      allFiles.push(...dirListing.files);
    }
  }

  return allFiles;
}

// Then use it:
const allFilesWithSizes = await expandItemsToFiles(transferRequest.items, source);

// Create transfer jobs with actual file sizes
const transferJobs = allFilesWithSizes.map((fileInfo) => ({
  sourcePath: `${source.type}:${source.locationId}/${path.join(source.path, fileInfo.path)}`,
  destinationPath: `${destination.type}:${destination.locationId}/${path.join(
    destination.path,
    fileInfo.path,
  )}`,
  size: fileInfo.size, // Populated with actual file size from upfront calculation
}));
```

**Estimated Effort:** 2-3 hours
**Testing:** Test with nested directory structures

**Note on Concurrency:** Large folders (e.g., 1000 files) will create many transfer jobs. The existing `transferQueue` with p-limit concurrency control will handle this automatically - no special handling needed. The queue processes jobs with configured concurrency limit, preventing memory/connection issues.

#### Task 1.4: Ensure Directory Creation in Transfer Functions

**Files:** All four transfer functions in `backend/src/routes/api/transfer/index.ts`

**Changes:**

For each transfer function, ensure destination directories are created before file transfer:

**`transferS3ToLocal()`:**

```typescript
// Skip .s3keep marker files during transfer
// (filtered earlier during listS3DirectoryRecursive, but double-check here for safety)
if (path.basename(sourcePath) === '.s3keep') {
  logger.debug(`Skipping .s3keep marker file: ${sourcePath}`);
  return; // Skip this file
}

// Before writing file - create parent directory structure
const destDir = path.dirname(absolutePath);
await fs.mkdir(destDir, { recursive: true }); // Creates entire path including empty parent dirs
```

**`transferLocalToS3()`:**

```typescript
// S3 doesn't need directory creation - object keys preserve structure
// No change needed
```

**`transferLocalToLocal()`:**

```typescript
// Before writing file
const destDir = path.dirname(destPath);
await fs.mkdir(destDir, { recursive: true });
```

**`transferS3ToS3()`:**

```typescript
// S3 doesn't need directory creation - object keys preserve structure
// No change needed
```

**Estimated Effort:** 1 hour
**Testing:** Verify directories are created for nested structures

#### Task 1.5: Implement Empty Directory Handling (.s3keep markers)

**File:** `backend/src/utils/directoryListing.ts` and transfer functions

**Changes:**

1. **Add marker creation function:**

```typescript
/**
 * Creates .s3keep marker files for empty directories in S3
 */
async function createS3KeepMarkers(
  s3Client: S3Client,
  bucket: string,
  emptyDirectories: string[],
): Promise<void> {
  // For each empty directory, upload a .s3keep file
  for (const dir of emptyDirectories) {
    const key = `${dir}/.s3keep`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: '', // Empty file
        ContentLength: 0,
      }),
    );
  }
}
```

2. **Update directory expansion logic (Task 1.3):**

```typescript
// In expandItemsToFiles function
if (source.type === 'local' && destination.type === 's3') {
  // When copying Local→S3, create .s3keep markers for empty directories
  const emptyDirs = dirListing.emptyDirectories;

  // Add .s3keep files to the transfer file list
  for (const emptyDir of emptyDirs) {
    allFiles.push({
      path: `${emptyDir}/.s3keep`,
      size: 0,
      isMarker: true, // Flag to create empty file during transfer
    });
  }
}
```

3. **Update `transferLocalToS3()` to handle marker creation:**

```typescript
// Check if this is a marker file
if (fileJob.isMarker) {
  // Create empty .s3keep marker
  await s3Client.send(
    new PutObjectCommand({
      Bucket: destinationBucket,
      Key: destinationKey,
      Body: '',
      ContentLength: 0,
    }),
  );
  return;
}

// Otherwise, proceed with normal file upload
```

**Note:** Empty directory detection is already implemented in `listLocalDirectoryRecursive()` from Task 1.1

**Estimated Effort:** 2 hours
**Testing:** Verify empty directories are preserved with markers

#### Task 1.6: (REMOVED - Merged into Task 1.7)

**Note:** Large folder warning check has been merged into Task 1.7 (Update Conflict Check Endpoint) to avoid duplication.

#### Task 1.7: Update Conflict Check Endpoint (Breaking Change)

**File:** `backend/src/routes/api/transfer/index.ts`

**Changes:**

Update the existing conflict check endpoint to return the new ConflictCheckResponse format:

```typescript
interface ConflictCheckResponse {
  conflicts: string[]; // Files that exist in both source and destination
  nonConflicting: string[]; // Files that only exist in source (will be auto-copied)
  warning?: {
    type: 'large_folder';
    fileCount: number;
    totalSize: number;
    message: string;
  };
}

// Update the conflict check endpoint (around lines 680-718)
router.post('/check-conflicts', async (request, reply) => {
  const { destination, items } = request.body; // Now receives items instead of files

  // Expand items to full file list
  const sourceFiles = await expandItemsToFiles(items, request.body.source);

  // List destination files
  const destListing = await listFiles(destination);

  // Separate conflicting from non-conflicting
  const conflicts: string[] = [];
  const nonConflicting: string[] = [];

  for (const sourceFile of sourceFiles) {
    const existsInDest = destListing.files.some((f) => f.path === sourceFile.path);
    if (existsInDest) {
      conflicts.push(sourceFile.path);
    } else {
      nonConflicting.push(sourceFile.path);
    }
  }

  // Check for large folder warning
  const TEN_GB = 10 * 1024 * 1024 * 1024;
  const warning =
    sourceFiles.length >= 1000 || sourceFiles.reduce((sum, f) => sum + f.size, 0) >= TEN_GB
      ? {
          type: 'large_folder' as const,
          fileCount: sourceFiles.length,
          totalSize: sourceFiles.reduce((sum, f) => sum + f.size, 0),
          message: `This operation will transfer ${sourceFiles.length} files (${formatBytes(sourceFiles.reduce((sum, f) => sum + f.size, 0))}). This may take significant time.`,
        }
      : undefined;

  return {
    conflicts,
    nonConflicting,
    warning,
  };
});
```

**Key Changes:**

- Returns `conflicts` (conflicting files) and `nonConflicting` (auto-copy files)
- Includes `warning` for large folders (>= 1000 files OR >= 10GB)
- Breaking change from old `{conflicts: string[]}` format
- Integrates size calculation from Task 1.3

**Estimated Effort:** 2-3 hours
**Testing:** Verify new response format, test warning threshold, verify smart conflict detection

#### Task 1.8: Implement Streaming Directory Listings (Default Implementation)

**File:** `backend/src/utils/directoryListing.ts`

**Goal:** Make streaming the default implementation to handle directories of any size efficiently

**Changes:**

Replace the batch-loading approach with streaming as the standard implementation:

```typescript
/**
 * Lists files from S3 directory using streaming/pagination to handle large directories
 * This is the default implementation for all S3 directory listings
 */
export async function listS3DirectoryRecursive(
  s3Client: S3Client,
  bucket: string,
  prefix: string,
): Promise<DirectoryListing> {
  const files: FileInfo[] = [];
  const emptyDirectories: string[] = [];
  let totalSize = 0;
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000, // S3 pagination handles batching automatically
      }),
    );

    for (const obj of response.Contents || []) {
      // Skip .s3keep markers and directory markers
      if (obj.Key!.endsWith('.s3keep') || obj.Key!.endsWith('/')) {
        continue;
      }

      files.push({
        path: obj.Key!,
        size: obj.Size || 0,
      });
      totalSize += obj.Size || 0;
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return {
    files,
    totalSize,
    fileCount: files.length,
    emptyDirectories, // Detected from prefixes with no files
    skippedSymlinks: [], // Not applicable for S3
  };
}

// Local implementation remains the same but processes incrementally
```

**Key Changes:**

- Streaming is the **only** implementation (no threshold logic)
- S3 naturally streams via pagination (no memory concerns)
- Local filesystem processes files incrementally during traversal
- Simpler code, consistent behavior regardless of folder size

**Estimated Effort:** 1-2 hours (simplified from original)
**Testing:** Test with directories of varying sizes (10, 100, 1000, 10000+ files), verify memory stays <1GB for largest

---

### Phase 2: Frontend UI Support

**Goal:** Enable users to select folders in the UI

#### Task 2.1: Enable Directory Selection in StorageBrowser

**File:** `frontend/src/app/components/StorageBrowser/StorageBrowser.tsx`

**Changes:**

1. **Add checkboxes to directory rows:**

```tsx
{
  filteredDirectories.map((dir, rowIndex) => (
    <Tr
      key={dir.path}
      className="bucket-row"
      isRowSelected={selectedItems.has(dir.path)}
      onRowClick={(event) => {
        if (event?.shiftKey) {
          handleShiftClick(dir.path);
        }
      }}
    >
      <Td
        select={{
          rowIndex: rowIndex,
          onSelect: (_event, isSelecting) => handleSelectRow(dir.path, isSelecting),
          isSelected: selectedItems.has(dir.path),
        }}
      />
      <Td className="bucket-column">
        <Button variant="link" onClick={handlePathClick(dir.path)}>
          <FontAwesomeIcon icon={faFolder} />
          {dir.name}
        </Button>
      </Td>
      {/* ... rest unchanged ... */}
    </Tr>
  ));
}
```

2. **Update selection display to show folders + files:**

Find the "X items selected" display and update:

```tsx
{
  selectedItems.size > 0 && (
    <div>
      {selectedFileCount > 0 && `${selectedFileCount} file${selectedFileCount !== 1 ? 's' : ''}`}
      {selectedFileCount > 0 && selectedFolderCount > 0 && ', '}
      {selectedFolderCount > 0 &&
        `${selectedFolderCount} folder${selectedFolderCount !== 1 ? 's' : ''}`}
      {' selected'}
    </div>
  );
}
```

3. **Add helper to compute counts:**

```typescript
const selectedFileCount = Array.from(selectedItems).filter((itemPath) => {
  return files.some((f) => f.path === itemPath);
}).length;

const selectedFolderCount = Array.from(selectedItems).filter((itemPath) => {
  return directories.some((d) => d.path === itemPath);
}).length;
```

**Estimated Effort:** 1-2 hours
**Testing:** Verify folder selection works, visual indicators show correctly

**Note:** Verify that directory and file data structures in StorageBrowser have a `type` field that distinguishes between 'file' and 'directory'. If not present, update the FileEntry/DirectoryEntry interfaces to include this field.

#### Task 2.2: Update StorageService Interface

**File:** `frontend/src/app/services/storageService.ts`

**Changes:**

1. **Add interface:**

```typescript
export interface TransferItem {
  path: string;
  type: 'file' | 'directory';
}

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

2. **Update method signatures:**

```typescript
// checkConflicts
async checkConflicts(
  sourceLocationId: string,
  sourcePath: string,
  items: TransferItem[],  // ⚠️ CHANGED
  destLocationId: string,
  destPath: string,
): Promise<ConflictCheckResponse>

// initiateTransfer
async initiateTransfer(request: TransferRequest): Promise<TransferResponse>
```

**Estimated Effort:** 1 hour
**Testing:** Verify TypeScript compilation, API calls work

#### Task 2.3: Update TransferAction Component

**File:** `frontend/src/app/components/Transfer/TransferAction.tsx`

**Changes:**

1. **Update props to receive item types:**

```typescript
interface TransferActionProps {
  selectedFiles: string[];
  sourceType: StorageType;
  sourceLocationId: string;
  sourcePath: string;
  onClose: () => void;
  currentListing: FileEntry[]; // ⚠️ NEW: Need file listing to determine types
}
```

2. **Update conflict checking:**

```typescript
const conflicts = await storageService.checkConflicts(
  sourceLocationId,
  sourcePath,
  items, // ⚠️ CHANGED from selectedFiles
  destinationLocationId,
  destinationPath,
);
```

3. **Update transfer initiation:**

```typescript
const initiateTransfer = async (
  conflictResolution: 'overwrite' | 'skip' | 'rename',
  destLocationId: string,
  destPath: string,
  destType: StorageType,
) => {
  // Build items array with types
  const items: TransferItem[] = selectedFiles.map((filePath) => {
    // Find item in current listing
    const fileEntry = currentListing.find((entry) => entry.path === filePath);

    return {
      path: filePath,
      type: fileEntry?.type || 'file', // Default to 'file' if not found
    };
  });

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
    items, // ⚠️ CHANGED
    conflictResolution,
  };

  await storageService.initiateTransfer(transferRequest);
  // ... rest unchanged
};
```

**Estimated Effort:** 1-2 hours
**Testing:** Verify transfer requests include correct item types

#### Task 2.4: Pass File Listing to TransferAction

**File:** `frontend/src/app/components/StorageBrowser/StorageBrowser.tsx`

**Changes:**

Update the `TransferAction` component usage to pass current listing:

```tsx
<TransferAction
  selectedFiles={Array.from(selectedItems)}
  sourceType={storageType}
  sourceLocationId={locationId}
  sourcePath={currentPath}
  currentListing={[...directories, ...files]} // ⚠️ NEW
  onClose={() => setIsTransferModalOpen(false)}
/>
```

**Estimated Effort:** 15 minutes
**Testing:** Verify prop is passed correctly

#### Task 2.5: Implement Large Folder Warning Dialog

**File:** `frontend/src/app/components/Transfer/TransferAction.tsx`

**Changes:**

Add warning modal that displays before transfer when folder >1000 files:

```tsx
// After receiving conflict check response with warning
if (response.warning?.type === 'large_folder') {
  setShowLargeFolderWarning(true);
  setLargeFolderInfo({
    fileCount: response.warning.fileCount,
    totalSize: response.warning.totalSize,
  });
}

// Warning modal JSX
<Modal
  variant="small"
  title="Large Folder Transfer"
  isOpen={showLargeFolderWarning}
  onClose={() => setShowLargeFolderWarning(false)}
  actions={[
    <Button key="proceed" variant="primary" onClick={handleProceedWithTransfer}>
      Proceed
    </Button>,
    <Button key="cancel" variant="link" onClick={() => setShowLargeFolderWarning(false)}>
      Cancel
    </Button>,
  ]}
>
  <Text>
    This operation will transfer {largeFolderInfo.fileCount} files (
    {formatBytes(largeFolderInfo.totalSize)}). This may take significant time to complete.
  </Text>
</Modal>;
```

**Estimated Effort:** 1-2 hours
**Testing:** Verify warning appears for large folders, can proceed or cancel

#### Task 2.6: Enhance Progress Display with Detailed Statistics

**File:** `frontend/src/app/components/Transfer/TransferProgress.tsx`

**Changes:**

Update progress display to show file count and data size using existing TransferProgress interface:

```tsx
// Use existing TransferProgress interface from transferQueue.ts
// interface TransferProgress {
//   totalFiles: number;
//   completedFiles: number;
//   failedFiles: number;
//   totalBytes: number;
//   transferredBytes: number;
// }

// Calculate progress from existing job data
const filesCompleted = job.progress.completedFiles;
const totalFiles = job.progress.totalFiles;
const bytesTransferred = job.progress.transferredBytes;
const totalBytes = job.progress.totalBytes;

// Build selection summary from original request
// (Pass originalItems: TransferItem[] as prop to component)
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

// Display format
<ProgressBar value={(bytesTransferred / totalBytes) * 100} />
<Text>
  Copying {selectionSummary} ({filesCompleted}/{totalFiles} total files, {formatBytes(bytesTransferred)}/{formatBytes(totalBytes)})
</Text>
```

**Key Changes:**

- Uses existing `TransferProgress` interface (no new types needed)
- Progress data already tracked by transferQueue
- Only UI formatting changes needed
- Pass original `TransferItem[]` array to show folder/file counts

**Estimated Effort:** 1-2 hours (simplified - using existing interfaces)
**Testing:** Verify progress shows both file count and data size accurately

---

### Phase 3: Smart Conflict Resolution (Core Feature)

**Goal:** Implement smart merge conflict resolution

This is a core feature based on Design Decision #2, not optional.

#### Task 3.1: (COMPLETED in Task 1.7)

**Note:** Smart conflict detection has already been implemented in Task 1.7 (Update Conflict Check Endpoint). The endpoint now returns both `conflicts` and `nonConflicting` arrays, providing exactly the smart conflict resolution capability described here.

No additional backend work needed for this task.

#### Task 3.2: Frontend Smart Conflict UI

**File:** `frontend/src/app/components/Transfer/ConflictResolutionModal.tsx`

**Changes:**

Update conflict modal to show smart merge info:

```tsx
<Modal title="Resolve Conflicts">
  <Text>{nonConflictingFiles.length} files will be copied automatically (no conflicts).</Text>
  <Text>
    {conflictingFiles.length} files conflict with existing files. How should these be handled?
  </Text>
  {conflictingFiles.length > 25 && (
    <Text>Showing first 25 of {conflictingFiles.length} conflicts</Text>
  )}
  <List>
    {conflictingFiles.slice(0, 25).map((file) => (
      <ListItem key={file}>{file}</ListItem>
    ))}
  </List>
  {/* Resolution options for conflicting files only */}
</Modal>
```

**Estimated Effort:** 2-3 hours
**Testing:** Verify non-conflicting files auto-copied, only conflicts shown

---

### Phase 4: Optional Future Enhancements

#### Task 4.1: Expandable Progress Tree View

**Goal:** Show detailed file-by-file progress in tree structure

**Features:**

- Expandable folder view in progress dialog
- Show which files are currently transferring
- Individual file progress bars

**Estimated Effort:** 4-5 hours

---

## Testing Strategy

### Unit Tests

#### Backend Tests

**File:** `backend/src/utils/directoryListing.test.ts` (NEW)

**Test Cases:**

- `listS3DirectoryRecursive()`:

  - ✅ Lists all files in flat directory
  - ✅ Lists all files in nested directory
  - ✅ Handles pagination correctly
  - ✅ Filters out directory markers (keys ending with '/')
  - ✅ Returns empty array for empty directory
  - ✅ Handles S3 errors gracefully

- `listLocalDirectoryRecursive()`:
  - ✅ Lists all files in flat directory
  - ✅ Lists all files in nested directory
  - ✅ Returns relative paths correctly
  - ✅ Returns empty array for empty directory
  - ✅ Handles filesystem errors gracefully
  - ✅ Handles symlinks appropriately

**File:** `backend/src/routes/api/transfer/index.test.ts` (UPDATE)

**New Test Cases:**

- Transfer request handling:
  - ✅ Accepts new `items[]` format
  - ✅ Converts old `files[]` format to new format
  - ✅ Expands directory items to file lists
  - ✅ Preserves path structure for nested files
  - ✅ Creates destination directories before transfer
  - ✅ Handles empty directories appropriately

#### Frontend Tests

**File:** `frontend/src/app/components/StorageBrowser/StorageBrowser.test.tsx` (UPDATE)

**New Test Cases:**

- Directory selection:
  - ✅ Directory rows show checkboxes
  - ✅ Clicking directory checkbox selects it
  - ✅ Selected directories show visual indication
  - ✅ Selection count includes both files and folders
  - ✅ Copy button works with folder selection

**File:** `frontend/src/app/components/Transfer/TransferAction.test.tsx` (UPDATE)

**New Test Cases:**

- Transfer request building:
  - ✅ Builds request with file items correctly
  - ✅ Builds request with folder items correctly
  - ✅ Builds request with mixed file/folder items
  - ✅ Detects item types from listing
  - ✅ Handles missing items gracefully

### Integration Tests

**File:** `backend/src/routes/api/transfer/integration.test.ts` (NEW/UPDATE)

**Test Cases:**

1. **S3 → Local Folder Transfer**

   - ✅ Copies entire S3 "folder" to local directory
   - ✅ Preserves nested directory structure
   - ✅ All files transferred correctly
   - ✅ Directories created before files

2. **Local → S3 Folder Transfer**

   - ✅ Copies entire local folder to S3
   - ✅ Object keys preserve directory structure
   - ✅ All files uploaded correctly

3. **S3 → S3 Folder Transfer**

   - ✅ Copies entire S3 folder to another S3 location
   - ✅ Preserves directory structure
   - ✅ All objects copied correctly

4. **Local → Local Folder Transfer**

   - ✅ Copies entire local folder to another location
   - ✅ Preserves nested structure
   - ✅ All files copied correctly

5. **Mixed Selection Transfer**

   - ✅ Handles mix of files and folders
   - ✅ Preserves structure correctly

6. **Conflict Scenarios**
   - ✅ Folder with same name exists (overwrite)
   - ✅ Folder with same name exists (skip)
   - ✅ Folder with same name exists (rename)
   - ✅ Partial file overlap (some files conflict, some don't)

### Manual Testing Checklist

- [ ] Select single folder in S3 browser - checkbox appears and works
- [ ] Select single folder in Local browser - checkbox appears and works
- [ ] Select multiple folders - all selected correctly
- [ ] Select mix of files and folders - all selected correctly
- [ ] Copy S3 folder to Local - structure preserved, all files present
- [ ] Copy Local folder to S3 - structure preserved, all files uploaded
- [ ] Copy S3 folder to S3 (same/different bucket) - all files copied
- [ ] Copy Local folder to Local - structure preserved
- [ ] Copy nested folder (3+ levels) - all levels preserved
- [ ] Copy folder with 100+ files - performance acceptable
- [ ] Copy folder with existing destination folder (overwrite) - works
- [ ] Copy folder with existing destination folder (skip) - works
- [ ] Copy folder with existing destination folder (rename) - works
- [ ] Progress display shows folder progress correctly
- [ ] Error handling for permission issues
- [ ] Error handling for network issues (S3)
- [ ] Cancel transfer mid-folder works correctly
- [ ] Empty directories preserved with .s3keep markers
- [ ] Large folder warning appears for 1000+ files
- [ ] Smart conflict resolution only prompts for actual conflicts
- [ ] Detailed progress shows file count and data size
- [ ] Verify existing p-limit concurrency controls work with large folder transfers
- [ ] Memory usage stays below 1GB during large folder transfer (monitor with htop/ps)
- [ ] Skipped symbolic links generate warnings but don't fail transfer (check server logs for "Skipped N symbolic links" messages)

---

## References

### Related Documentation

- [System Architecture](../architecture/system-architecture.md)
- [Backend Architecture](../architecture/backend-architecture.md)
- [Data Flow](../architecture/data-flow.md)
- [Development Workflow](../development/development-workflow.md)

### Relevant Code Files

**Backend:**

- `backend/src/routes/api/transfer/index.ts` - Main transfer API
- `backend/src/services/s3Service.ts` - S3 operations
- `backend/src/utils/` - Utilities directory

**Frontend:**

- `frontend/src/app/components/StorageBrowser/StorageBrowser.tsx` - File browser UI
- `frontend/src/app/components/Transfer/TransferAction.tsx` - Transfer modal
- `frontend/src/app/services/storageService.ts` - Storage API client

### External References

- [AWS S3 ListObjectsV2](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/listobjectsv2command.html)
- [AWS S3 CopyObject](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/classes/copyobjectcommand.html)
- [Node.js fs.readdir (recursive)](https://nodejs.org/api/fs.html#fsreaddirpath-options-callback)
- [Node.js fs.mkdir (recursive)](https://nodejs.org/api/fs.html#fsmkdirpath-options-callback)

---

## Revision History

| Version | Date       | Author       | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------- | ---------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2025-11-07 | AI Assistant | Initial document creation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1.1     | 2025-11-07 | AI Assistant | All design decisions finalized, implementation plan refined                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 1.2     | 2025-11-07 | AI Assistant | Review updates: Added API interfaces, symlink handling, partial failure strategy, path validation, increased effort estimates                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 1.3     | 2025-11-07 | AI Assistant | Post-review refinements: Updated effort estimates (26-39h core), dual warning threshold (1000 files OR 10GB), skip individual file size calc, multi-selection progress display, show first 25 conflicts, moved streaming to core, removed line numbers, efficient withFileTypes implementation, <1GB memory target                                                                                                                                                                                                                                                            |
| 1.4     | 2025-11-07 | AI Assistant | Comprehensive review fixes: Upfront size calc for ALL items (not just dirs), added Task 1.7 for conflict endpoint update, clarified TransferItem path format with examples, documented file-level skip granularity, complete empty dir handling matrix for all 4 transfer types, simplified streaming (default impl), fixed threshold operators (>=), removed TransferProgressEvent (use existing interfaces), added p-limit integration note, fixed empty dir check logic, added FileEntry type field note, improved .s3keep flow documentation. Updated effort: 22-34h core |

---

## Implementation Summary

### Total Estimated Effort

| Phase                          | Tasks                              | Estimated Hours |
| ------------------------------ | ---------------------------------- | --------------- |
| Phase 1: Backend Core          | 7 tasks (Task 1.6 merged into 1.7) | 14-21 hours     |
| Phase 2: Frontend UI           | 6 tasks                            | 6-10 hours      |
| Phase 3: Smart Conflicts       | 1 task (Task 3.1 completed in 1.7) | 2-3 hours       |
| **Core Total**                 | **14 tasks**                       | **22-34 hours** |
| Phase 4: Optional Enhancements | 1 task                             | 4-5 hours       |
| **Grand Total**                | **15 tasks**                       | **26-39 hours** |

### Implementation Phases

**Core Implementation (Phases 1-3):**

1. Backend recursive listing with size calculation
2. Interface breaking change (items[] replacing files[])
3. Directory expansion logic
4. Empty directory handling with .s3keep markers
5. Large folder warning (1000+ files OR 10GB)
6. Streaming for large directories (core feature)
7. Frontend folder selection UI
8. Detailed progress display (file count + data size)
9. Smart conflict resolution

**Optional Enhancements (Phase 4):**

- Expandable progress tree view

---

## Next Steps

1. ✅ **Design decisions finalized** - All 6 key decisions made
2. ✅ **Implementation plan refined** - Tasks updated to reflect decisions
3. **Create tracking issues** - Convert tasks to GitHub issues/tickets (recommended)
4. **Begin Phase 1 implementation** - Start with Task 1.1 (recursive directory listing)
5. **Sequential implementation** - Complete phases in order for clean integration
