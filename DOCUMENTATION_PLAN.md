# ODH-TEC Application Documentation Plan

## Overview

This plan outlines the creation of comprehensive visual documentation for ODH-TEC using Playwright for automated screenshot capture. The documentation will consist of:
- A concise Screenshots section in README.md (maximum 6 selected screenshots)
- A comprehensive usage guide in docs/usage.md with detailed step-by-step workflows
- All screenshots stored in docs/img-usage/ directory

## Objectives

1. Create professional screenshots of all major application pages and features (18 total screenshots)
2. Demonstrate key workflows through visual examples
3. Update the README.md Screenshots section with 6 carefully selected images showcasing the most interesting features
4. Create a comprehensive docs/usage.md file with all detailed documentation and all 18 screenshots
5. Store all images in the `docs/img-usage/` directory with meaningful, descriptive names
6. Keep the original `img/` directory for generic/overview images

## Prerequisites

- Application is already running and accessible at: `http://localhost:9000/notebook/guillaume`
- S3 storage is configured and accessible
- Local PVC storage is configured and accessible
- HuggingFace token is configured in settings
- Playwright MCP is available (no installation needed)
- Test files are available:
  - Single file: `/tmp/uploads/README.md`
  - Multiple files: `/tmp/uploads/architecture/` directory

## Documentation Structure

### Part 1: Settings Page (View Only - No Modifications)

**Objective**: Showcase all configuration options available in the application.

#### Screenshots to Capture:

1. **settings-overview.png**
   - Settings page with first tab (S3 Settings) visible
   - Description: Overview of the Settings page showing the tab structure

2. **settings-s3.png**
   - S3 Settings tab fully visible with all fields
   - Description: S3 configuration including Access Key, Secret Key, Region, Endpoint, and Default Bucket

3. **settings-huggingface.png**
   - HuggingFace Settings tab
   - Description: HuggingFace token configuration for model imports

4. **settings-concurrent-transfers.png**
   - Max Concurrent Transfers tab with slider
   - Description: Configuration for controlling concurrent file transfer operations

5. **settings-max-files-per-page.png**
   - Max Files Per Page tab with slider
   - Description: Pagination control for file listing views

6. **settings-proxy.png**
   - Proxy Settings tab with HTTP/HTTPS proxy fields
   - Description: Proxy configuration for enterprise environments

**Content for docs/usage.md**:
```markdown
#### Settings Page

The Settings page provides configuration for all application features through a tabbed interface:

**S3 Storage Configuration**:
![S3 Settings](img-usage/settings-s3.png)
Configure S3-compatible object storage credentials, endpoint, region, and default bucket.

**HuggingFace Integration**:
![HuggingFace Settings](img-usage/settings-huggingface.png)
Set up your HuggingFace token for direct model imports from the HuggingFace Hub.

**Transfer Controls**:
![Concurrent Transfers](img-usage/settings-concurrent-transfers.png)
Control the maximum number of concurrent file transfers (affects memory usage).

**Pagination Settings**:
![Max Files Per Page](img-usage/settings-max-files-per-page.png)
Adjust the number of files displayed per page in storage browsers.

**Proxy Configuration**:
![Proxy Settings](img-usage/settings-proxy.png)
Configure HTTP/HTTPS proxies for enterprise network environments.
```

### Part 2: Storage Management Page (View Only)

**Objective**: Show the unified storage management interface with registered storage locations.

#### Screenshots to Capture:

1. **storage-management.png**
   - Storage Management page showing all registered storage locations
   - Should display both S3 buckets and PVC storage locations
   - Description: Unified view of all available storage locations (S3 and PVC)

**Content for docs/usage.md**:
```markdown
#### Storage Management

![Storage Management](img-usage/storage-management.png)

The Storage Management page provides a unified view of all available storage locations, both S3 buckets and local PVC storage. You can:
- View all registered storage locations in a single table
- See storage type (S3 or PVC), status, creation date, and owner
- Create new S3 buckets
- Delete S3 buckets
- Click on any storage location to browse its contents
```

### Part 3: Storage Browsing - Scenario 1 (S3 + File Uploads + HuggingFace Import)

**Objective**: Demonstrate folder creation, single/multiple file uploads, and HuggingFace model import to S3 storage.

#### Steps:

1. Navigate to Storage Browser page
2. Select S3 bucket from location dropdown
3. Create folder "models-on-s3"
4. Navigate into "models-on-s3" folder
5. Upload single file (/tmp/uploads/README.md)
6. Show single file upload progress/completion
7. Upload multiple files (from /tmp/uploads/architecture)
8. Show multiple files upload progress
9. Open HuggingFace import dialog
10. Enter model ID: "RedHatAI/granite-3.1-2b-instruct-quantized.w8a8"
11. Initiate import
12. Show import progress
13. Show completed import in folder

#### Screenshots to Capture:

1. **storage-browse-s3-root.png**
   - Storage browser showing S3 bucket root with location selector
   - Description: Storage Browser view with S3 location selected

2. **storage-browse-create-folder.png**
   - Create folder modal with "models-on-s3" entered
   - Description: Creating a new folder in S3 storage

3. **storage-browse-s3-models-folder.png**
   - Inside "models-on-s3" folder (empty or with breadcrumb)
   - Description: Navigated into the newly created folder

4. **storage-browse-upload-single-file.png**
   - Single file upload dialog/button showing README.md selected
   - Description: Uploading a single file to S3 storage

5. **storage-browse-upload-single-progress.png**
   - Upload progress for single file
   - Description: Real-time progress tracking for single file upload

6. **storage-browse-upload-multiple-files.png**
   - Multiple files upload dialog showing files from /tmp/uploads/architecture
   - Description: Uploading multiple files at once

7. **storage-browse-upload-multiple-progress.png**
   - Upload progress for multiple files with list of files being uploaded
   - Description: Real-time progress tracking for multiple file uploads

8. **storage-browse-hf-import-dialog.png**
   - HuggingFace import modal with model ID entered
   - Model ID: "RedHatAI/granite-3.1-2b-instruct-quantized.w8a8"
   - Description: HuggingFace model import dialog

9. **storage-browse-hf-import-progress.png**
   - Import progress dialog showing active transfer
   - Description: Real-time progress tracking for model import

10. **storage-browse-s3-all-content.png**
    - Folder view showing uploaded files and imported RedHatAI folder
    - Description: Storage browser showing all uploaded content (files and HuggingFace model)

**Content for docs/usage.md**:
```markdown
#### Storage Browsing - File Uploads and HuggingFace Import

**Select Storage Location**:
![Storage Browser S3](img-usage/storage-browse-s3-root.png)

**Create Folder**:
![Create Folder](img-usage/storage-browse-create-folder.png)

**Upload Single File**:
![Upload Single File](img-usage/storage-browse-upload-single-file.png)

Upload individual files to your storage. The application supports files up to 20GB (configurable).

**Single File Upload Progress**:
![Single File Progress](img-usage/storage-browse-upload-single-progress.png)

Track upload progress with real-time updates showing transfer speed and completion percentage.

**Upload Multiple Files**:
![Upload Multiple Files](img-usage/storage-browse-upload-multiple-files.png)

Upload multiple files simultaneously with drag-and-drop support or file selection.

**Multiple Files Upload Progress**:
![Multiple Files Progress](img-usage/storage-browse-upload-multiple-progress.png)

Monitor concurrent file uploads with per-file progress tracking and overall completion status.

**HuggingFace Import**:
![HuggingFace Import Dialog](img-usage/storage-browse-hf-import-dialog.png)

Import models directly from HuggingFace Hub to your S3 storage. Enter the model repository ID and the application will stream the model files directly to S3 with minimal memory usage.

**Import Progress**:
![Import Progress](img-usage/storage-browse-hf-import-progress.png)

Track real-time progress with detailed transfer statistics and per-file progress tracking.

**All Content**:
![All Content](img-usage/storage-browse-s3-all-content.png)

View all uploaded files and imported models in your storage location.
```

### Part 4: Storage Browsing - Scenario 2 (PVC + Preview)

**Objective**: Demonstrate folder creation, HuggingFace import to PVC, and file preview feature.

#### Steps:

1. Navigate to Storage Browser page
2. Select PVC location from dropdown
3. Create folder "models-on-pvc"
4. Navigate into "models-on-pvc" folder
5. Open HuggingFace import dialog
6. Enter model ID: "RedHatAI/Llama-3.2-3B-Instruct-FP8"
7. Initiate import
8. Wait for completion
9. Navigate into the imported model folder (RedHatAI/Llama-3.2-3B-Instruct-FP8)
10. Click "View" button on config.json file
11. Show file preview modal

#### Screenshots to Capture:

1. **storage-browse-pvc-root.png**
   - Storage browser showing PVC location selected
   - Description: Storage Browser with PVC storage location

2. **storage-browse-pvc-create-folder.png**
   - Create folder modal with "models-on-pvc" entered
   - Description: Creating a folder in PVC storage

3. **storage-browse-pvc-hf-import.png**
   - HuggingFace import dialog with Llama model ID
   - Model ID: "RedHatAI/Llama-3.2-3B-Instruct-FP8"
   - Description: Importing a larger model to PVC storage

4. **storage-browse-pvc-model-imported.png**
   - Folder showing imported model
   - Description: Model successfully imported to PVC storage

5. **storage-browse-pvc-model-contents.png**
   - Inside the model folder showing all files
   - config.json should be visible
   - Description: Browsing the model files

6. **storage-browse-file-preview.png**
   - File preview modal showing config.json content
   - Description: In-browser file preview for supported file types

**Content for docs/usage.md**:
```markdown
#### Storage Browsing - PVC Storage and File Preview

**PVC Storage Location**:
![PVC Storage](img-usage/storage-browse-pvc-root.png)

Local PVC storage provides the same interface as S3, supporting all the same operations.

**Import to PVC**:
![Import to PVC](img-usage/storage-browse-pvc-hf-import.png)

Models can be imported from HuggingFace directly to PVC storage.

**Model Files**:
![Model Contents](img-usage/storage-browse-pvc-model-contents.png)

Browse through all model files with detailed information about each file.

**File Preview**:
![File Preview](img-usage/storage-browse-file-preview.png)

Preview supported file types (JSON, text, markdown, etc.) directly in the browser without downloading.
```

### Part 5: Storage Browsing - Scenario 3 (Cross-Storage Transfer)

**Objective**: Demonstrate copying files/folders between storage locations.

#### Steps:

1. Navigate to Storage Browser page
2. Select S3 location
3. Navigate to "models-on-s3" folder
4. Select the "RedHatAI" folder (checkbox)
5. Click "Copy to..." button in toolbar
6. Open transfer modal
7. Select PVC destination
8. Navigate to "models-on-pvc" in destination selector
9. Initiate transfer
10. Show transfer progress
11. Show completed transfer in PVC

#### Screenshots to Capture:

1. **storage-browse-s3-select-folder.png**
   - S3 browser with RedHatAI folder selected (checkbox checked)
   - Toolbar showing "Copy to..." button active
   - Description: Selecting a folder for transfer

2. **storage-browse-transfer-dialog.png**
   - Transfer modal showing source and destination selectors
   - Source: S3 models-on-s3/RedHatAI
   - Destination: PVC models-on-pvc
   - Description: Cross-storage transfer dialog

3. **storage-browse-transfer-progress.png**
   - Transfer progress modal with file-by-file progress
   - Description: Real-time transfer progress tracking

4. **storage-browse-transfer-complete.png**
   - PVC browser showing the transferred folder
   - In models-on-pvc, showing both original Llama model and copied granite model
   - Description: Successfully transferred folder between storage locations

**Content for docs/usage.md**:
```markdown
#### Cross-Storage File Transfers

**Select Files or Folders**:
![Select for Transfer](img-usage/storage-browse-s3-select-folder.png)

Select one or more files or folders using checkboxes. Bulk operations toolbar appears when items are selected.

**Configure Transfer**:
![Transfer Dialog](img-usage/storage-browse-transfer-dialog.png)

Choose the destination storage location and path. The application supports:
- S3 to S3 (same or different buckets)
- S3 to PVC
- PVC to S3
- PVC to PVC

**Transfer Progress**:
![Transfer Progress](img-usage/storage-browse-transfer-progress.png)

Monitor transfer progress with detailed statistics, including per-file progress and overall completion percentage.

**Transfer Complete**:
![Transfer Complete](img-usage/storage-browse-transfer-complete.png)

Files and folders are transferred with structure preservation, including conflict resolution options.
```

### Part 6: VRAM Calculator (View Only)

**Objective**: Showcase the GPU VRAM estimation tool.

#### Screenshots to Capture:

1. **vram-estimator.png**
   - VRAM Estimator page showing the full interface
   - Left side: Input parameters (inference mode, some model selected)
   - Right side: Estimation results with chart
   - Description: VRAM estimation tool for planning GPU resources

**Content for docs/usage.md**:
```markdown
#### VRAM Estimator

![VRAM Estimator](img-usage/vram-estimator.png)

The VRAM Estimator helps you calculate GPU memory requirements for model inference and training:

- **Running Parameters**: Configure mode (inference/training), precision, batch size, sequence length, and multi-GPU settings
- **Model Parameters**: Select from preset models or enter custom model specifications
- **Estimation Results**: Visual breakdown of memory usage by component (parameters, activations, gradients, optimizer states)
- **Multi-GPU Support**: Calculates per-GPU memory requirements for distributed setups
```

## README.md Update Plan

### Current Screenshots Section (Lines 57-72)

The current section will be replaced with a concise section featuring **6 carefully selected screenshots** that showcase the most interesting features:

```markdown
## Screenshots

The application provides powerful storage management and GPU tools for Open Data Hub users:

**Storage Management - Unified View**:
![Storage Management](img/storage-management.png)
*Manage both S3 buckets and PVC storage from a unified interface*

**HuggingFace Model Import**:
![HuggingFace Import](img/storage-browse-hf-import-progress.png)
*Stream models directly from HuggingFace to S3 or PVC storage with real-time progress tracking*

**File Preview**:
![File Preview](img/storage-browse-file-preview.png)
*Preview files directly in the browser without downloading*

**Cross-Storage Transfers**:
![Transfer Dialog](img/storage-browse-transfer-dialog.png)
*Transfer files and folders between S3 and PVC storage seamlessly*

**VRAM Estimator**:
![VRAM Estimator](img/vram-estimator.png)
*Calculate GPU memory requirements for model inference and training*

**Settings**:
![S3 Settings](img/settings-s3.png)
*Configure S3, HuggingFace, and other application settings*

For detailed usage instructions and workflows, see [Usage Guide](docs/usage.md).
```

### docs/usage.md Creation Plan

A new comprehensive usage guide will be created at `docs/usage.md` containing:

1. **Introduction** - Overview of the application and this guide
2. **Getting Started** - Prerequisites and initial setup
3. **Settings and Configuration** - All 6 settings screenshots with detailed explanations
4. **Storage Management** - Storage management interface
5. **Storage Browser Operations** - All storage browsing scenarios:
   - S3 + File Uploads (single & multiple) + HuggingFace Import (10 screenshots)
   - PVC + File Preview (6 screenshots)
   - Cross-Storage Transfers (4 screenshots)
6. **GPU Tools** - VRAM Estimator usage
7. **Tips and Best Practices** - Advanced usage tips

Total: All 22 screenshots with detailed step-by-step instructions

## Implementation Plan

### Phase 1: Setup and Preparation
1. Navigate to application at `http://localhost:9000/notebook/guillaume` using Playwright MCP
2. Verify application is accessible and responsive
3. Create `docs/img-usage/` directory for screenshots
4. Verify test files exist at `/tmp/uploads/README.md` and `/tmp/uploads/architecture/`

### Phase 2: Screenshot Capture - Settings (Part 1)
1. Navigate to Settings page
2. Capture each tab sequentially
3. Save screenshots with appropriate names
4. Verify image quality and content

### Phase 3: Screenshot Capture - Storage Management (Part 2)
1. Navigate to Storage Management page
2. Capture the storage locations table
3. Verify both S3 and PVC are visible

### Phase 4: Screenshot Capture - S3 Scenario (Part 3)
1. Navigate to Storage Browser
2. Select S3 location
3. Create "models-on-s3" folder (capture)
4. Navigate into folder
5. Upload single file /tmp/uploads/README.md (capture dialog and progress)
6. Upload multiple files from /tmp/uploads/architecture (capture dialog and progress)
7. Open HF import dialog (capture)
8. Import granite model (capture progress)
9. Capture all content in folder (files + model)

### Phase 5: Screenshot Capture - PVC Scenario (Part 4)
1. Select PVC location
2. Create "models-on-pvc" folder (capture)
3. Navigate into folder
4. Import Llama model (capture)
5. Navigate into model folder (capture)
6. Preview config.json (capture)

### Phase 6: Screenshot Capture - Transfer Scenario (Part 5)
1. Navigate to S3 models-on-s3
2. Select RedHatAI folder (capture)
3. Open transfer dialog (capture)
4. Configure transfer to PVC (capture)
5. Monitor progress (capture)
6. Verify completion in PVC (capture)

### Phase 7: Screenshot Capture - VRAM Calculator (Part 6)
1. Navigate to VRAM Estimator
2. Ensure meaningful values displayed
3. Capture full page

### Phase 8: Documentation File Creation
1. Create `docs/img-usage/` directory
2. Move all 22 screenshots from temp location to `docs/img-usage/`
3. Create comprehensive `docs/usage.md` with all content
4. Copy 6 selected screenshots to `img/` for README (consider including file upload screenshot):
   - storage-management.png
   - storage-browse-upload-multiple-progress.png (or storage-browse-hf-import-progress.png)
   - storage-browse-file-preview.png
   - storage-browse-transfer-dialog.png
   - vram-estimator.png
   - settings-s3.png

### Phase 9: README Update
1. Backup current README.md
2. Replace Screenshots section (lines 57-72) with new concise content (6 screenshots)
3. Add link to docs/usage.md for detailed guide
4. Verify all image links work
5. Verify markdown formatting

### Phase 10: Cleanup and Verification
1. Remove old screenshots from img/ (bucket-management.png, import-hf.png, multiple-upload.png, upload-single.png)
2. Keep vram-estimator.png (will be updated)
3. Verify all new images are present in both img/ and docs/img-usage/
4. Verify docs/usage.md renders correctly
5. Delete DOCUMENTATION_PLAN.md (or keep for reference)

## Implementation Approach

We will use Playwright MCP browser tools to interact with the running application and capture screenshots. The approach:

1. **Navigate**: Use `mcp__playwright__browser_navigate` to open `http://localhost:9000/notebook/guillaume`
2. **Verify**: Use `mcp__playwright__browser_snapshot` to verify page state and locate elements
3. **Interact**: Use `mcp__playwright__browser_click`, `mcp__playwright__browser_type`, `mcp__playwright__browser_select_option`, etc. for user interactions
4. **Capture**: Use `mcp__playwright__browser_take_screenshot` to save screenshots to `docs/img-usage/` directory
5. **File Uploads**: Use `mcp__playwright__browser_file_upload` with paths:
   - `/tmp/uploads/README.md` for single file
   - Multiple files from `/tmp/uploads/architecture/` for batch upload

This interactive approach allows real-time control, verification, and adjustment of each step.

## Expected Outcomes

1. **22 new screenshots** in `docs/img-usage/` covering all major features (4 additional for file uploads)
2. **6 selected screenshots** in `img/` for README.md
3. **Concise README.md Screenshots section** with the most interesting features
4. **Comprehensive docs/usage.md** with detailed step-by-step workflows
5. **Professional visual guide** for new users
6. **Demonstrable workflows** for key features
7. **Up-to-date documentation** matching current application state

## Screenshot Naming Convention and Locations

All screenshots follow the pattern: `{section}-{feature}-{detail}.png`

**Primary Location** (`docs/img-usage/`): All 22 screenshots
- `settings-s3.png`, `settings-huggingface.png`, `settings-concurrent-transfers.png`, etc.
- `storage-browse-upload-single-file.png`, `storage-browse-upload-multiple-files.png`
- `storage-browse-hf-import-dialog.png`, `storage-browse-transfer-progress.png`, etc.

**README Location** (`img/`): 6 selected screenshots (copies from docs/img-usage/)
- `storage-management.png` - Unified storage view
- `storage-browse-hf-import-progress.png` - HuggingFace import in action
- `storage-browse-file-preview.png` - File preview capability
- `storage-browse-transfer-dialog.png` - Cross-storage transfer
- `vram-estimator.png` - GPU VRAM calculator
- `settings-s3.png` - Settings interface

## Technical Considerations

### Timing and Waits
- Use Playwright's auto-waiting features
- Add explicit waits for:
  - SSE progress updates
  - File transfers to complete
  - Modal animations
  - Table data loading

### Viewport and Resolution
- Set consistent viewport size (e.g., 1920x1080)
- Ensure full-page screenshots for long pages
- Capture modals with appropriate context

### Data Cleanup
- Consider whether to clean up created folders/files after documentation
- May want to keep test data for future screenshot updates

### Browser State
- Start with clean state for each major section
- Maintain state within scenarios (e.g., keep imported models for transfer scenario)

## Success Criteria

✅ All 22 screenshots captured with good quality and saved to `docs/img-usage/`
✅ 6 selected screenshots copied to `img/` for README
✅ Screenshots show meaningful data and clear UI state
✅ File upload feature demonstrated (single file: /tmp/uploads/README.md, multiple files: /tmp/uploads/architecture)
✅ `docs/usage.md` created with comprehensive step-by-step guide
✅ README.md Screenshots section updated with concise content (6 images + link to usage guide)
✅ All image links functional in both README.md and docs/usage.md
✅ Documentation flows logically through features
✅ No broken or missing images
✅ Old screenshots cleaned up from img/ directory (except vram-estimator.png which gets updated)

## Timeline Estimate

- **Setup**: 5 minutes (verify access and create directories)
- **Settings screenshots**: 10 minutes
- **Storage Management**: 5 minutes
- **S3 scenario**: 20-25 minutes (including file uploads + HF import wait time)
- **PVC scenario**: 15-20 minutes (including HF import wait time)
- **Transfer scenario**: 10-15 minutes
- **VRAM calculator**: 5 minutes
- **Documentation file creation**: 20 minutes
- **README update**: 10 minutes
- **Review and cleanup**: 10 minutes

**Total estimated time**: 1.5 - 2 hours (mostly waiting for HuggingFace model downloads)

## Notes and Considerations

1. **Application Access**:
   - Application is pre-configured and running at `http://localhost:9000/notebook/guillaume`
   - No need to start services or configure environment variables
   - S3, PVC, and HuggingFace are already configured

2. **HuggingFace Model Sizes**:
   - granite-3.1-2b-instruct-quantized.w8a8: ~2-3 GB
   - Llama-3.2-3B-Instruct-FP8: ~3-4 GB
   - Ensure sufficient S3 and PVC storage space

3. **File Upload Test Data**:
   - Single file: `/tmp/uploads/README.md`
   - Multiple files: All files in `/tmp/uploads/architecture/` directory
   - Verify files exist before starting screenshot capture

4. **Browser Considerations**:
   - Playwright MCP uses Chromium by default
   - Set consistent viewport size (1920x1080 recommended)
   - Allow time for animations to complete before screenshots

5. **Screenshot Quality**:
   - Ensure screenshots have good contrast
   - Capture at appropriate zoom level
   - Wait for all content to load before capturing

6. **Future Maintenance**:
   - Playwright MCP tools can be reused for future screenshot updates
   - Document the application URL and test data paths
   - Keep this plan document for reference
