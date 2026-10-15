# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an Adobe I/O CLI plugin (`aio-cli-plugin-aem-edge-functions`) that enables developers to build, deploy, and manage AEM Edge Functions — JavaScript that runs at the CDN layer via Fastly Compute.

Commands are invoked as: `aio aem edge-functions <command>`

## Common Commands

```bash
npm test                                              # Full test suite with coverage
npx mocha test/libs/fastly-cli.test.js               # Run a single test file
npx mocha test/libs/fastly-cli.test.js --grep "pattern"  # Run specific test(s)
npm run lint                                          # Lint + auto-fix current directory
npm run lint-all                                      # Lint + auto-fix entire project
npm run format                                        # Prettier format all files
```

Requirements: Node.js 20.x (≥20.19.0), 22.x (≥22.15.0), or 24.x (≥24.10.0).

## Architecture

### CLI Framework

Uses **oclif** (`@oclif/core` v2) for command auto-discovery from `src/commands/`. The directory path maps directly to the CLI invocation — files in `src/commands/aem/edge-functions/` become `aio aem edge-functions <name>`.

### Command Hierarchy

- `src/commands/aem/edge-functions/` — 6 commands: `setup`, `build`, `deploy`, `serve`, `tail-logs`, `info`
- `src/libs/base-command.js` — `BaseCommand` extends oclif's `Command`; all commands extend this
- `src/libs/fastly-cli.js` — wraps `@fastly/cli` via `execFileSync`; handles `FASTLY_API_TOKEN`/`FASTLY_API_ENDPOINT` env vars
- `src/libs/cloudmanager.js` — Cloud Manager API client
- `src/libs/developer-console.js` — Adobe Developer Console API client
- `src/libs/request.js` — Generic HTTP request wrapper

### BaseCommand

`BaseCommand` is the core of the plugin. It handles:

- **Configuration layering**: env vars (`AEM_EDGE_FUNCTIONS_*`) > ADC config > aio config file (`.aio`)
- **Auth**: IMS token (primary) and ADC OAuth Server-to-Server credentials (fallback path via `@adobe/aio-lib-ims`)
- **Shared helpers**: spinner management (`ora-classic`), Fastly CLI initialization, API base path computation

### Configuration Keys

Core config keys used throughout (stored in aio config under `aem.edge-functions.*`):

- `cloudmanager_orgid`, `cloudmanager_programid`, `cloudmanager_environmentid`
- `edgefunctions_edge_delivery`, `edgefunctions_site_domain`
- `edgefunctions_adc_client_id`, `edgefunctions_adc_client_secret`, `edgefunctions_adc_scopes`

All have corresponding `AEM_EDGE_FUNCTIONS_*` environment variable overrides.

### Fastly CLI Integration

`FastlyCli` in `src/libs/fastly-cli.js` wraps the `@fastly/cli` npm package. It calls the Fastly binary via `execFileSync` and exposes `build()`, `deploy()`, `serve()`, and `logTail()`. Most commands (`build`, `deploy`, `serve`, `tail-logs`) are thin wrappers that delegate directly to this class.

### Tests

- Framework: Mocha + NYC (coverage) + Sinon (mocking)
- Test files live in `test/libs/` (only `fastly-cli.test.js` and `developer-console.test.js` exist currently — no command-level tests yet)
- Coverage excludes `src/index.js` and test files themselves
- HTML coverage report generated to `coverage/`

### Adding a New Command

1. Create `src/commands/aem/edge-functions/<name>.js` extending `BaseCommand`
2. Define static `description`, `flags`, and `args` following oclif patterns
3. Implement `async run()` using `this.flags`, `this.args`, `this.getConfig()`
4. Export the class; oclif auto-discovers it
