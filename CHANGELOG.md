# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.1] - 2025-11-25

### Added

- **PVC Local Storage Support**: Complete unified storage interface supporting both S3 and local filesystem storage
  - Local storage API (`/api/local`) with full CRUD operations
  - Transfer queue system with streaming, rate limiting, and quota management
  - Unified storage service abstracting S3 and local storage operations
  - Transfer components with progress tracking and conflict resolution
- **Comprehensive Documentation**
  - Architecture documentation (system design, backend/frontend architecture, data flow)
  - PatternFly 6 migration guide with component examples and testing patterns
  - Feature specifications for PVC storage and folder copy support
  - Deployment and configuration guides
  - CLAUDE.md files for AI assistant context
- **Test Infrastructure**
  - Backend: 18 test files covering routes, utilities, and integration tests
  - Frontend: 11 test files covering components and services
  - Test helpers, fixtures, and comprehensive mocking utilities
- **S3 Pagination**: Support for listing more than 1000 objects with server-side filtering

### Changed

- **Performance Optimizations** (#25)
  - Health check request filtering to reduce log spam (~90% reduction in log volume)
  - Separate metadata limiter with higher concurrency (20) for faster HeadObject/ListObjects
  - Memory profiler now opt-in via `ENABLE_MEMORY_PROFILER` environment variable
  - Simplified log output format for transfer operations
- Renamed `ObjectBrowser` → `StorageBrowser` for unified storage interface
- Updated to React Router v7 patterns
- Enhanced CORS configuration for development workflow

### Fixed

- Server-side filtering with auto pagination for large object lists
- Various UI fixes and improvements

### Contributors

- Guillaume Moutier
- Veera Varala
