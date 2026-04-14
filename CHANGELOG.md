# Changelog

## [0.6.11] - 2026-04-14

### Added

- Timestamp displayed in `info --debug` command

## [0.6.1] - 2026-04-07

### Added

- Included node 24.x support

## [0.6.0] - 2026-04-07

### Added

- `version` command — prints the plugin version
- `help` command — displays all available commands with a numbered full-flow example section
- Default command — running `aio aem edge-functions` with no subcommand now shows the help output

## [0.5.1] - 2026-03-17

### Added

- Support for ADC project and credential JSON via `AEM_EDGE_FUNCTIONS_ADC_CONFIG` environment variable
- All configuration values can now be set via environment variables (`AEM_EDGE_FUNCTIONS_*`)

### Changed

- Improved `info` command output

## [0.4.1] - 2026-03-12

### Added

- `--watch` flag for the `serve` command

### Changed

- Renamed from "compute" to "edge functions" throughout commands and configuration
- Updated documentation

### Dependencies

- Updated `@inquirer/prompts` to v8.3.0
- Updated `@adobe/aio-lib-core-networking` to v5.1.0
- Updated `sinon` to v21.0.2
- Added `renovate.json` for automated dependency updates

## [0.3.1] - 2026-03-05

### Added

- Adobe Developer Console (ADC) integration
- Unit tests for ADC integration

### Changed

- Enhanced Edge Functions CLI commands

## [0.2.1] - 2026-02-27

### Added

- `info` command with config display and token verification
- Manual configuration option for setup

### Fixed

- CLI UX fixes

### Changed

- Updated dependencies

## [0.1.0] - 2026-02-10

### Changed

- Renamed environment variables
- Use the AEM author tier as API endpoint (requires AEM Administrator product profile)
- Updated CDN API base path
- Updated dependencies

## [0.0.1] - 2026-01-16

### Added

- Initial implementation
