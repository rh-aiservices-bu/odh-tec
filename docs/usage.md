# ODH-TEC Usage Guide

Comprehensive guide for using the Open Data Hub Tools & Extensions Companion application.

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Settings and Configuration](#settings-and-configuration)
4. [Storage Management](#storage-management)
5. [Storage Browser Operations](#storage-browser-operations)
   - [File Uploads and HuggingFace Import (S3)](#file-uploads-and-huggingface-import-s3)
   - [PVC Storage and File Preview](#pvc-storage-and-file-preview)
   - [Cross-Storage Transfers](#cross-storage-transfers)
6. [GPU Tools](#gpu-tools)
7. [Tips and Best Practices](#tips-and-best-practices)

## Introduction

ODH-TEC (Open Data Hub Tools & Extensions Companion) is a web-based application that provides powerful storage management and GPU resource planning tools for Open Data Hub users. This guide covers all major features and workflows.

## Getting Started

### Prerequisites

- Access to an ODH or RHOAI environment
- (Optional) S3-compatible storage credentials
- (Optional) HuggingFace token for model imports
- Local PVC storage provisioned in your namespace

### Initial Setup

Before using storage features, configure your settings:

1. Navigate to the **Settings** page using the left sidebar
2. Configure S3 credentials (if using S3 storage)
3. Add your HuggingFace token (if importing models from HuggingFace Hub)
4. Adjust other settings as needed

## Settings and Configuration

The Settings page provides configuration for all application features through a tabbed interface.

### S3 Storage Configuration

![S3 Settings](img-usage/settings-s3.png)

Configure S3-compatible object storage credentials, endpoint, region, and default bucket. These settings enable the application to connect to your S3 storage for file operations.

**Configuration fields:**

- **Access Key**: Your S3 access key ID
- **Secret Key**: Your S3 secret access key
- **Region**: AWS region or custom region for S3-compatible storage
- **Endpoint**: S3 endpoint URL (for non-AWS S3-compatible storage)
- **Default Bucket**: Bucket name to use by default

### HuggingFace Integration

![HuggingFace Settings](img-usage/settings-huggingface.png)

Set up your HuggingFace token for direct model imports from the HuggingFace Hub. With a valid token, you can stream models directly from HuggingFace to your storage without manual downloading.

### Transfer Controls

![Concurrent Transfers](img-usage/settings-concurrent-transfers.png)

Control the maximum number of concurrent file transfers. This setting affects memory usage - lower values use less memory but may slow down bulk transfers.

**Recommended values:**

- **Low memory systems**: 2-3 concurrent transfers
- **Standard systems**: 5-10 concurrent transfers
- **High memory systems**: 10-20 concurrent transfers

### Pagination Settings

![Max Files Per Page](img-usage/settings-max-files-per-page.png)

Adjust the number of files displayed per page in storage browsers. Higher values show more files but may slow down page rendering for large directories.

### Proxy Configuration

![Proxy Settings](img-usage/settings-proxy.png)

Configure HTTP/HTTPS proxies for enterprise network environments. Required when the application needs to access external resources (like HuggingFace) through a corporate proxy.

## Storage Management

![Storage Management](img-usage/storage-management.png)

The Storage Management page provides a unified view of all available storage locations, both S3 buckets and local PVC storage.

### Features

- **View all storage locations** in a single table
- **See storage type** (S3 or PVC), status, creation date, and owner
- **Create new S3 buckets** using the interface
- **Delete S3 buckets** (with confirmation)
- **Click on any storage location** to browse its contents

### Storage Types

- **S3 Buckets**: Object storage in S3 or S3-compatible services
- **PVC (Persistent Volume Claims)**: Local Kubernetes persistent volumes

## Storage Browser Operations

The Storage Browser provides a unified interface for managing files across different storage backends (S3 and PVC).

### File Uploads and HuggingFace Import (S3)

This section demonstrates folder creation, file uploads, and importing models from HuggingFace to S3 storage.

#### Select Storage Location

![Storage Browser S3](img-usage/storage-browse-s3-root.png)

Use the location dropdown to select your S3 bucket. The breadcrumb navigation shows your current path.

#### Create Folder

![Create Folder](img-usage/storage-browse-create-folder.png)

Organize your storage by creating folders. Use descriptive names to keep your models and files organized.

#### Upload Single File

![Upload Single File](img-usage/storage-browse-upload-single-file.png)

Upload individual files to your storage. The application supports files up to 20GB (configurable) with streaming upload to minimize memory usage.

**Single File Upload Progress:**

![Single File Progress](img-usage/storage-browse-upload-single-progress.png)

Track upload progress with real-time updates showing transfer speed and completion percentage.

#### Upload Multiple Files

![Upload Multiple Files](img-usage/storage-browse-upload-multiple-files.png)

Upload multiple files simultaneously with drag-and-drop support or file selection. The application handles concurrent uploads efficiently.

**Multiple Files Upload Progress:**

![Multiple Files Progress](img-usage/storage-browse-upload-multiple-progress.png)

Monitor concurrent file uploads with per-file progress tracking and overall completion status.

#### HuggingFace Import

![HuggingFace Import Dialog](img-usage/storage-browse-hf-import-dialog.png)

Import models directly from HuggingFace Hub to your S3 storage. Enter the model repository ID (e.g., `RedHatAI/granite-3.1-2b-instruct-quantized.w8a8`) and the application will stream the model files directly to S3 with minimal memory usage.

**Import Progress:**

![Import Progress](img-usage/storage-browse-hf-import-progress.png)

Track real-time progress with detailed transfer statistics and per-file progress tracking. The application streams files directly from HuggingFace to S3 without downloading to local storage first.

**All Content:**

![All Content](img-usage/storage-browse-s3-all-content.png)

View all uploaded files and imported models in your storage location. Files and folders are displayed with timestamps and sizes for easy management.

### PVC Storage and File Preview

This section demonstrates importing models to PVC storage and previewing files directly in the browser.

#### PVC Storage Location

![PVC Storage](img-usage/storage-browse-pvc-root.png)

Local PVC storage provides the same interface as S3, supporting all the same operations.

#### Import to PVC

![Import to PVC](img-usage/storage-browse-pvc-hf-import.png)

Models can be imported from HuggingFace directly to PVC storage. The process is identical to S3 imports - just select a PVC location instead.

**Import Progress:**

![Import Progress](img-usage/storage-browse-pvc-hf-import-progress.png)

Track the import progress with detailed file-by-file status updates.

#### Model Files

![Model Contents](img-usage/storage-browse-pvc-model-contents.png)

Browse through all model files with detailed information about each file. Each row shows the file name, last modified date, size, and available actions (view, download, delete).

#### File Preview

![File Preview](img-usage/storage-browse-file-preview.png)

Preview supported file types (JSON, text, markdown, YAML, etc.) directly in the browser without downloading. The preview modal includes syntax highlighting for better readability.

### Cross-Storage Transfers

Transfer files and folders between different storage locations (S3 ↔ PVC, S3 ↔ S3, PVC ↔ PVC).

#### Select Files or Folders

![Select for Transfer](img-usage/storage-browse-s3-select-folder.png)

Select one or more files or folders using checkboxes. The bulk operations toolbar appears when items are selected, showing the number of selected items and available actions.

#### Configure Transfer

![Transfer Dialog](img-usage/storage-browse-transfer-dialog.png)

Choose the destination storage location and path. The application supports:

- **S3 to S3** (same or different buckets)
- **S3 to PVC**
- **PVC to S3**
- **PVC to PVC**

Navigate through the destination file tree to select the target folder for your transfer.

#### Transfer Progress

![Transfer Progress](img-usage/storage-browse-transfer-progress.png)

Monitor transfer progress with detailed statistics, including per-file progress and overall completion percentage. The interface shows:

- Total bytes transferred / total size
- Number of files completed / total files
- Individual file status (transferring, queued, completed, error)
- Real-time progress bars

#### Transfer Complete

![Transfer Complete](img-usage/storage-browse-transfer-complete.png)

Files and folders are transferred with structure preservation. Both the original Llama model (imported directly to PVC) and the transferred granite model (from S3) are now visible in the same PVC location.

## GPU Tools

### VRAM Estimator

![VRAM Estimator](img-usage/vram-estimator.png)

The VRAM Estimator helps you calculate GPU memory requirements for model inference and training. This tool is essential for planning GPU resources and avoiding out-of-memory errors.

#### Features

**Running Parameters:**

- **Mode**: Choose between Inference and Training modes
- **Precision**: Select fp16/bf16 or fp32 precision
- **Sequence Length**: Input sequence length for your use case
- **Batch Size**: Number of samples per batch
- **Number of GPUs**: For multi-GPU setups

**Model Parameters:**

- **Preset Models**: Quick selection from popular models (configs from HuggingFace)
- **Custom Parameters**: Manually adjust model architecture parameters
  - Number of parameters (billions)
  - Number of layers
  - Hidden size
  - Number of attention heads
  - Intermediate size
  - Vocabulary size
  - Number of key-value heads (for Grouped Query Attention)

**Estimation Results:**

- **Visual Chart**: Stacked bar chart showing VRAM breakdown by component
- **Total VRAM Usage**: Overall memory requirement
- **Component Breakdown**:
  - **CUDA Kernels**: PyTorch CUDA overhead (300 MiB - 2 GiB)
  - **Parameters**: Model weights (parameters × bytes per parameter)
  - **Activations**: Forward pass intermediate tensors
  - **Outputs**: Output tensor size
- **Multi-GPU Support**: Calculates per-GPU memory requirements for distributed setups

#### Use Cases

1. **Pre-deployment Planning**: Determine GPU requirements before deploying a model
2. **GPU Selection**: Choose appropriate GPU types based on VRAM needs
3. **Batch Size Optimization**: Find optimal batch size for your GPU memory
4. **Cost Optimization**: Select cost-effective GPU configurations

## Tips and Best Practices

### Storage Management

1. **Organize with Folders**: Create a logical folder structure for better organization
2. **Use Descriptive Names**: Name your folders and files clearly (e.g., `models/granite/granite-3.1-2b`)
3. **Check Storage Quotas**: Monitor your S3 and PVC storage usage
4. **Clean Up Regularly**: Delete unused models and files to free up space

### File Transfers

1. **Concurrent Transfers**: Adjust the concurrent transfer limit based on your available memory
2. **Large Files**: For very large files (>10GB), consider lower concurrency to avoid memory issues
3. **Network Stability**: Ensure stable network connection for large transfers
4. **Verify Transfers**: Always check that transferred files are complete and not corrupted

### HuggingFace Imports

1. **Token Security**: Never share your HuggingFace token
2. **Model Selection**: Verify model IDs on HuggingFace before importing
3. **Storage Space**: Ensure you have sufficient storage for the model
4. **Quantized Models**: Consider using quantized models (e.g., w8a8, FP8) to save space

### VRAM Estimation

1. **Safety Margin**: Add 10-20% buffer to estimated VRAM for safety
2. **Sequence Length**: Activations scale quadratically with sequence length
3. **Batch Size**: Adjust batch size to fit your available VRAM
4. **Multi-GPU**: Use tensor parallelism for models that don't fit on single GPUs

### Performance Optimization

1. **File Preview**: Only preview small files (<1MB) - download larger files instead
2. **Pagination**: Adjust files per page for better performance with large directories
3. **Proxy Settings**: Configure proxies for better network performance in enterprise environments
4. **Browser Performance**: Close unused tabs and clear browser cache periodically

---

**Full credits to [Alexander Smirnov](https://github.com/furiousteabag) for the VRAM estimation calculations!**

For more information, see the [project repository](https://github.com/rh-aiservices-bu/odh-tec) and the [detailed VRAM calculation post](https://asmirnov.xyz/vram).
