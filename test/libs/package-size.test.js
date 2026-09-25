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

const assert = require('assert');
const {
  PACKAGE_SIZE_LIMIT_BYTES,
  PACKAGE_SIZE_WARN_BYTES,
  bytesToMb,
  classifyPackageSize
} = require('../../src/libs/package-size');

describe('package-size', function () {
  describe('thresholds', function () {
    it('uses the Fastly 100 MB (decimal) compressed limit', function () {
      assert.strictEqual(PACKAGE_SIZE_LIMIT_BYTES, 100_000_000);
    });

    it('warns below the limit', function () {
      assert.ok(PACKAGE_SIZE_WARN_BYTES < PACKAGE_SIZE_LIMIT_BYTES);
    });
  });

  describe('#bytesToMb', function () {
    it('formats bytes as one-decimal MB (decimal)', function () {
      assert.strictEqual(bytesToMb(100_000_000), '100.0');
      assert.strictEqual(bytesToMb(90_500_000), '90.5');
    });
  });

  describe('#classifyPackageSize', function () {
    it('returns ok well under the warn band', function () {
      assert.strictEqual(classifyPackageSize(1_000_000), 'ok');
      assert.strictEqual(classifyPackageSize(PACKAGE_SIZE_WARN_BYTES - 1), 'ok');
    });

    it('returns warn from the warn threshold up to and including the limit', function () {
      assert.strictEqual(classifyPackageSize(PACKAGE_SIZE_WARN_BYTES), 'warn');
      assert.strictEqual(classifyPackageSize(PACKAGE_SIZE_LIMIT_BYTES - 1), 'warn');
      // Matches @fastly/cli: exactly the limit is allowed (pkgSize > MaxPackageSize).
      assert.strictEqual(classifyPackageSize(PACKAGE_SIZE_LIMIT_BYTES), 'warn');
    });

    it('returns over only above the limit', function () {
      assert.strictEqual(classifyPackageSize(PACKAGE_SIZE_LIMIT_BYTES + 1), 'over');
    });

    it('honors custom thresholds', function () {
      assert.strictEqual(classifyPackageSize(50, { warn: 40, limit: 60 }), 'warn');
      assert.strictEqual(classifyPackageSize(60, { warn: 40, limit: 60 }), 'warn');
      assert.strictEqual(classifyPackageSize(61, { warn: 40, limit: 60 }), 'over');
      assert.strictEqual(classifyPackageSize(10, { warn: 40, limit: 60 }), 'ok');
    });
  });
});
