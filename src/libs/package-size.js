/*
 * Copyright 2026 Adobe Inc. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

'use strict';

// Fastly rejects a compressed Compute package over this size (decimal bytes = 100 MB).
// Mirrors @fastly/cli's MaxPackageSize (pkg/commands/compute/hashfiles.go), checked against the
// on-disk .tar.gz size. The aio deploy path and the CDN API service bypass the Fastly CLI, so this
// is the only client-side equivalent of that check.
const PACKAGE_SIZE_LIMIT_BYTES = 100_000_000;
// Warn when within ~10 MB of the limit.
const PACKAGE_SIZE_WARN_BYTES = 90_000_000;

// Format bytes as decimal MB (matching Fastly's decimal-MB size limit).
const bytesToMb = (bytes) => (bytes / 1_000_000).toFixed(1);

/**
 * Classify a compressed package size against the Compute limit.
 * Returns 'over' (above the limit — Fastly rejects), 'warn' (in the warn band, up to and
 * including the limit) or 'ok'. Matches @fastly/cli's `pkgSize > MaxPackageSize` (100,000,000
 * bytes exactly is allowed).
 */
function classifyPackageSize(
  bytes,
  { limit = PACKAGE_SIZE_LIMIT_BYTES, warn = PACKAGE_SIZE_WARN_BYTES } = {}
) {
  if (bytes > limit) return 'over';
  if (bytes >= warn) return 'warn';
  return 'ok';
}

module.exports = {
  PACKAGE_SIZE_LIMIT_BYTES,
  PACKAGE_SIZE_WARN_BYTES,
  bytesToMb,
  classifyPackageSize
};
