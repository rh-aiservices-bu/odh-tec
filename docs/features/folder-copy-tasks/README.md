# Folder Copy Support - Implementation Tasks

This directory contains detailed implementation tasks for the Folder Copy Support feature. Each task is a standalone document with complete implementation instructions, acceptance criteria, and testing requirements.

## Overview

**Feature:** Enable recursive folder copying with full directory structure preservation
**Design Document:** [folder-copy-support.md](../folder-copy-support.md)
**Total Effort:** 22-34 hours (core implementation)
**Status:** Planning Complete - Ready for Implementation

## Task Organization

Tasks are organized in **3 phases**:

1. **Phase 1: Backend Core** (7 tasks) - Backend API and utilities
2. **Phase 2: Frontend UI** (6 tasks) - UI changes and integration
3. **Phase 3: Smart Conflict Resolution** (1 task) - Enhanced UX

## Implementation Order

Tasks should be completed in the order listed. Each task specifies its dependencies.

---

## Phase 1: Backend Core Functionality

**Goal:** Enable backend to handle folder transfer requests

### Task 1.1: Create Recursive Directory Listing Utilities with Size Calculation

**File:** [task-1.1-recursive-directory-listing.md](./task-1.1-recursive-directory-listing.md)
**Effort:** 3-4 hours | **Priority:** High (Foundational)

Create utility functions to recursively list all files in S3 and local directories with size information.

**Key Deliverables:**

- `listS3DirectoryRecursive()` - S3 recursive listing with pagination
- `listLocalDirectoryRecursive()` - Local filesystem recursive listing
- `DirectoryListing` interface with file info, sizes, empty dirs

**Dependencies:** None (start here)

---

### Task 1.2: Update Transfer Request Interface (Breaking Change)

**File:** [task-1.2-update-transfer-interface.md](./task-1.2-update-transfer-interface.md)
**Effort:** 30 minutes | **Priority:** High (Foundational)

Update transfer API to use `items: TransferItem[]` instead of `files: string[]`.

**Key Deliverables:**

- `TransferItem` interface with `path` and `type` fields
- Updated `TransferRequest` interface
- Request validation schema

**Dependencies:** None

---

### Task 1.3: Implement Directory Expansion Logic

**File:** [task-1.3-directory-expansion-logic.md](./task-1.3-directory-expansion-logic.md)
**Effort:** 2-3 hours | **Priority:** High

Implement `expandItemsToFiles()` to convert items[] into flat file list with sizes.

**Key Deliverables:**

- `expandItemsToFiles()` function
- File size calculation for individual files
- Directory expansion with size accumulation

**Dependencies:** Task 1.1, Task 1.2

---

### Task 1.4: Ensure Directory Creation in Transfer Functions

**File:** [task-1.4-directory-creation.md](./task-1.4-directory-creation.md)
**Effort:** 1 hour | **Priority:** High

Modify transfer functions to create destination directories before transferring files.

**Key Deliverables:**

- Directory creation in `transferS3ToLocal()`
- Directory creation in `transferLocalToLocal()`
- `ensureDirectoryExists()` helper

**Dependencies:** Task 1.3

---

### Task 1.5: Implement Empty Directory Handling (.s3keep markers)

**File:** [task-1.5-empty-directory-handling.md](./task-1.5-empty-directory-handling.md)
**Effort:** 2 hours | **Priority:** Medium

Implement `.s3keep` marker system to preserve empty directories in S3.

**Key Deliverables:**

- Empty directory detection
- `.s3keep` marker creation for Local→S3
- `.s3keep` skipping for S3→Local

**Dependencies:** Task 1.1, Task 1.3

---

### Task 1.7: Update Conflict Check Endpoint (Breaking Change)

**File:** [task-1.7-conflict-check-endpoint.md](./task-1.7-conflict-check-endpoint.md)
**Effort:** 2-3 hours | **Priority:** High

Update conflict check endpoint with smart conflict resolution and large folder warning.

**Key Deliverables:**

- Updated `ConflictCheckResponse` interface
- Smart conflict detection (conflicts vs nonConflicting)
- Large folder warning (>= 1000 files OR >= 10GB)

**Dependencies:** Task 1.1, Task 1.2, Task 1.3

---

### Task 1.8: Implement Streaming Directory Listings (Default Implementation)

**File:** [task-1.8-streaming-implementation.md](./task-1.8-streaming-implementation.md)
**Effort:** 1-2 hours | **Priority:** Medium

Ensure streaming is the default implementation for handling large directories.

**Key Deliverables:**

- Verified S3 pagination implementation
- Verified local incremental traversal
- Memory usage <1GB for 10,000+ files

**Dependencies:** Task 1.1

---

## Phase 2: Frontend UI Support

**Goal:** Enable users to select folders in the UI

### Task 2.1: Enable Directory Selection in StorageBrowser

**File:** [task-2.1-directory-selection-ui.md](./task-2.1-directory-selection-ui.md)
**Effort:** 1-2 hours | **Priority:** High (Foundational)

Add checkboxes to directory rows to enable folder selection.

**Key Deliverables:**

- Directory row checkboxes
- Updated selection display (X files, Y folders)
- Shift-click selection across files and folders

**Dependencies:** None (frontend start)

---

### Task 2.2: Update StorageService Interface

**File:** [task-2.2-storage-service-interface.md](./task-2.2-storage-service-interface.md)
**Effort:** 1 hour | **Priority:** High

Update frontend service to use `items: TransferItem[]`.

**Key Deliverables:**

- `TransferItem` interface
- Updated `TransferRequest` interface
- Updated `ConflictCheckResponse` interface

**Dependencies:** Task 1.2 (backend API)

---

### Task 2.3: Update TransferAction Component

**File:** [task-2.3-transfer-action-component.md](./task-2.3-transfer-action-component.md)
**Effort:** 1-2 hours | **Priority:** High

Build TransferItem[] array with type information when initiating transfers.

**Key Deliverables:**

- `buildTransferItems()` function
- Updated conflict checking
- Updated transfer initiation

**Dependencies:** Task 2.1, Task 2.2

---

### Task 2.4: Pass File Listing to TransferAction

**File:** [task-2.4-pass-file-listing.md](./task-2.4-pass-file-listing.md)
**Effort:** 15 minutes | **Priority:** Medium

Pass current file/directory listing to TransferAction component.

**Key Deliverables:**

- `currentListing` prop passed to TransferAction

**Dependencies:** Task 2.3

---

### Task 2.5: Implement Large Folder Warning Dialog

**File:** [task-2.5-large-folder-warning.md](./task-2.5-large-folder-warning.md)
**Effort:** 1-2 hours | **Priority:** Medium

Display warning modal for large folder transfers (>= 1000 files OR >= 10GB).

**Key Deliverables:**

- Warning modal component
- File count and size display
- Proceed/cancel actions

**Dependencies:** Task 1.7 (backend warning), Task 2.3

---

### Task 2.6: Enhance Progress Display with Detailed Statistics

**File:** [task-2.6-progress-display.md](./task-2.6-progress-display.md)
**Effort:** 1-2 hours | **Priority:** Medium

Show detailed progress: file count and data size transferred.

**Key Deliverables:**

- Selection summary (X folders, Y files)
- File count progress (completed/total)
- Bytes transferred progress (formatted)

**Dependencies:** None (uses existing backend interface)

---

## Phase 3: Smart Conflict Resolution

**Goal:** Implement smart merge conflict resolution

### Task 3.2: Frontend Smart Conflict Resolution UI

**File:** [task-3.2-conflict-ui.md](./task-3.2-conflict-ui.md)
**Effort:** 2-3 hours | **Priority:** Medium

Display smart conflict resolution modal with non-conflicting/conflicting file separation.

**Key Deliverables:**

- Updated conflict modal
- Non-conflicting files info display
- Conflict list (first 25)
- Resolution summary

**Dependencies:** Task 1.7 (backend), Task 2.3

---

## Quick Reference

### Critical Path Tasks (Must Complete First)

1. **Task 1.1** - Directory listing utilities (blocks most backend)
2. **Task 1.2** - Interface update (breaking change)
3. **Task 1.3** - Directory expansion (core logic)
4. **Task 2.1** - UI selection (enables frontend)
5. **Task 2.2** - Service interface (frontend API)

### Breaking Changes

These tasks involve breaking API changes:

- **Task 1.2** - Backend API uses `items[]` instead of `files[]`
- **Task 1.7** - Backend conflict response format changed
- **Task 2.2** - Frontend service updated to match backend

**Coordination Required:** Frontend and backend must be updated together in same release.

### Testing Strategy

Each task includes:

- **Unit Tests** - Detailed test cases with expected behavior
- **Integration Tests** - End-to-end scenarios
- **Acceptance Criteria** - Clear success metrics

See [Testing Strategy](../folder-copy-support.md#testing-strategy) in main design document.

---

## Task Status Tracking

Use this checklist to track implementation progress:

### Phase 1: Backend (7 tasks)

- [ ] Task 1.1 - Recursive Directory Listing
- [ ] Task 1.2 - Transfer Interface Update
- [ ] Task 1.3 - Directory Expansion Logic
- [ ] Task 1.4 - Directory Creation
- [ ] Task 1.5 - Empty Directory Handling
- [ ] Task 1.7 - Conflict Check Endpoint
- [ ] Task 1.8 - Streaming Implementation

### Phase 2: Frontend (6 tasks)

- [ ] Task 2.1 - Directory Selection UI
- [ ] Task 2.2 - Storage Service Interface
- [ ] Task 2.3 - Transfer Action Component
- [ ] Task 2.4 - Pass File Listing
- [ ] Task 2.5 - Large Folder Warning
- [ ] Task 2.6 - Progress Display

### Phase 3: Smart Conflicts (1 task)

- [ ] Task 3.2 - Conflict Resolution UI

---

## Implementation Notes

### Starting Point

**Recommended Order:**

1. Start with **Phase 1 tasks in sequence** (1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.7 → 1.8)
2. Move to **Phase 2 tasks** (2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6)
3. Finish with **Phase 3** (3.2)

### Parallel Work

These tasks can be worked on in parallel:

- **Backend:** Task 1.1 + Task 1.2 (independent)
- **Frontend:** Task 2.1 (while backend Tasks 1.1-1.3 in progress)
- **Enhancement:** Task 1.8 + Task 2.6 (optimizations, can be done later)

### Testing Checkpoints

After each phase, run integration tests:

1. **After Phase 1:** Test folder transfer via API (curl/Postman)
2. **After Phase 2:** Test folder selection and transfer in UI
3. **After Phase 3:** Test complete user workflow with conflicts

---

## Additional Resources

- **Main Design Document:** [folder-copy-support.md](../folder-copy-support.md)
- **System Architecture:** [../../architecture/system-architecture.md](../../architecture/system-architecture.md)
- **Backend Architecture:** [../../architecture/backend-architecture.md](../../architecture/backend-architecture.md)
- **Frontend Architecture:** [../../architecture/frontend-architecture.md](../../architecture/frontend-architecture.md)
- **Development Workflow:** [../../development/development-workflow.md](../../development/development-workflow.md)

---

## Questions or Issues?

- **Design Decisions:** See [Design Decisions](../folder-copy-support.md#design-decisions) section
- **Technical Challenges:** See [Technical Challenges](../folder-copy-support.md#technical-challenges) section
- **Testing:** See [Testing Strategy](../folder-copy-support.md#testing-strategy) section

**Last Updated:** 2025-11-07
