# Changelog

## [1.0.0] - 2026-08-27

### Removed

- Public beta notice and interactive acknowledgement on every command — AEM Edge Functions is now generally available.

### Deprecated

- `--accept-beta` no longer has any effect (kept as a no-op for compatibility; will be removed later).

## [0.11.1] - 2026-06-26

### Changed

- `setup` command now prompts to re-configure ADC project/workspace when an existing ADC configuration is detected, instead of jumping straight to updating the client secret
- Fixed ADC credential URL to include the workspace ID in the path, so the link works correctly for non-production workspaces

## [0.11.0] - 2026-06-24

### Added

- Public beta notice with interactive acknowledgement on every command (`--accept-beta` flag for CI/CD)

## [0.10.1] - 2026-06-24

### Changed

- Upgraded `@fastly/cli` from 14.3.1 to 15.2.0
- Upgraded `@oclif/core` from 2.16.0 to 4.11.11

## [0.10.0] - 2026-06-16

### Added

- `deploy` command now uploads directly to the CDN API instead of using the Fastly CLI proxy
  - Skips upload when the local package hash matches the active package
  - `--force` / `-f` flag to force re-deploy even when the package has not changed
  - `--package` / `-p` flag to specify a package file directly instead of auto-detecting from `pkg/`
- `packages` command to list deployed packages for an Edge Function with pagination support (`--limit` / `-l`, `--cursor` / `-c`)
- `package` command to get full details of a specific deployed package (size, deployment date, content hash)

## [0.9.1] - 2026-06-12

### Changed

- Deploy command now shows the Edge Function URL with a debugging-only warning
- Extended filtering of unnecessary internal details from deployment output

## [0.9.0] - 2026-05-22

### Added

- `list` command to list all Edge Functions configured for the current environment
  - Displays a formatted table with name, active package ID, creation and update timestamps
  - `--debug` / `-d` flag to show API endpoint URL

## [0.8.1] - 2026-05-15

### Added

- `--debug` / `-d` flag for `tail-logs` and `purge-cache` commands to show API endpoint

### Changed

- API endpoint is now only shown when `--debug` flag is explicitly used

### Fixed

- Correct API endpoint resolution for non-production Cloud Manager environments

## [0.8.0] - 2026-05-15

### Added

- `purge-cache` command to purge cached content for an Edge Function
  - Purge by surrogate key (`--surrogateKey` / `-k`, supports multiple)
  - Purge all cached content (`--all` / `-a`)
  - Soft purge mode (`--soft` / `-s`)

### Fixed

- Resolved `uuid` audit vulnerability via npm overrides

## [0.7.0] - 2026-04-24

### Added

- `deploy --debug` / `-d` flag to show raw, unfiltered deployment output for troubleshooting

### Changed

- Deploy command now filters out unnecessary internal details from deployment output
- Upgraded `@fastly/cli` from 13.3.0 to 14.3.1

## [0.6.12] - 2026-04-16

### Changed

- Limit service name length to max 30 characters

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
