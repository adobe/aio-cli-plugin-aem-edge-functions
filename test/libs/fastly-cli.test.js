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

const assert = require('assert');
const FastlyCli = require('../../src/libs/fastly-cli');
const {
  filterOutput,
  shouldFilterLine,
  withBuildScript,
  buildScriptHasAot
} = require('../../src/libs/fastly-cli');

describe('FastlyCli', function () {
  describe('#filterOutput', function () {
    it('should remove "Manage this service at" but keep "View this service at" with warning', function () {
      const input = [
        '✓ Activating service (version 29)',
        '',
        'Manage this service at:',
        '\thttps://manage.fastly.com/configure/services/abc-edgefunc',
        '',
        'View this service at:',
        '\thttps://edgefunction-p42913-e1920257-abc-edgefunc.adobeaemcloud.com',
        '',
        'SUCCESS: Deployed package (service abc-edgefunc, version 29)'
      ].join('\n');
      const result = filterOutput(input);
      assert.ok(!result.includes('manage.fastly.com'));
      assert.ok(!result.includes('Manage this service at'));
      assert.ok(result.includes('View this service at'));
      assert.ok(result.includes('adobeaemcloud.com'));
      assert.ok(result.includes('only for debugging'));
      assert.ok(result.includes('SUCCESS'));
    });

    it('should inject warning after "View this service at" URL', function () {
      const input = [
        'View this service at:',
        '\thttps://edgefunction-p42913-e1920257-my-func.adobeaemcloud.com',
        '',
        'SUCCESS: Deployed package (service my-func, version 5)'
      ].join('\n');
      const result = filterOutput(input);
      const urlIndex = result.indexOf('adobeaemcloud.com');
      const warningIndex = result.indexOf('only for debugging');
      const successIndex = result.indexOf('SUCCESS');
      assert.ok(urlIndex > -1, 'URL should be present');
      assert.ok(warningIndex > urlIndex, 'warning should appear after URL');
      assert.ok(successIndex > warningIndex, 'SUCCESS should appear after warning');
    });

    it('should remove Fastly CLI upgrade notice and release notes', function () {
      const input = [
        'SUCCESS: Deployed package (service abc-edgefunc, version 29)',
        '',
        'A new version of the Fastly CLI is available.',
        'Current version: 13.3.0',
        'Latest version: 14.3.1',
        '',
        'Note: Please review the release notes for the major version(s) listed below before upgrading.',
        'Version 15.0.0: https://github.com/fastly/cli/releases/tag/v15.0.0',
        'Run `fastly update` to get the latest version.'
      ].join('\n');
      const result = filterOutput(input);
      assert.ok(!result.includes('new version of the Fastly CLI'));
      assert.ok(!result.includes('Current version'));
      assert.ok(!result.includes('fastly update'));
      assert.ok(!result.includes('Please review the release notes'));
      assert.ok(!result.includes('Version 15.0.0'));
      assert.ok(result.includes('SUCCESS'));
    });

    it('should remove spinner intermediate frame lines', function () {
      const input = [
        '| Uploading package...',
        '/ Uploading package...',
        '✓ Uploading package',
        '| Activating service (version 31)...',
        '/ Activating service (version 31)...',
        '✓ Activating service (version 31)'
      ].join('\n');
      const result = filterOutput(input);
      assert.ok(!result.includes('| Uploading'));
      assert.ok(!result.includes('/ Uploading'));
      assert.ok(!result.includes('| Activating'));
      assert.ok(!result.includes('/ Activating'));
      assert.ok(result.includes('Uploading package'));
      assert.ok(result.includes('Activating service'));
    });

    it('should collapse excessive blank lines after filtering', function () {
      const input = [
        'line1',
        '',
        'Manage this service at:',
        '\thttps://manage.fastly.com/configure/services/x',
        '',
        'line2'
      ].join('\n');
      const result = filterOutput(input);
      assert.ok(!result.includes('\n\n\n'));
    });

    it('should pass through unrelated output unchanged except for colorization', function () {
      const input = '✓ Uploading package\n✓ Activating service\n';
      const result = filterOutput(input);
      // ✓ should be colorized green
      assert.ok(result.includes('\x1b[32m✓\x1b[0m Uploading package'));
      assert.ok(result.includes('\x1b[32m✓\x1b[0m Activating service'));
    });

    it('should colorize SUCCESS lines', function () {
      const input = 'SUCCESS: Deployed package (service abc, version 1)';
      const result = filterOutput(input);
      assert.ok(result.includes('\x1b[32mSUCCESS:\x1b[0m'));
    });

    it('should colorize ERROR lines in red', function () {
      const input = 'ERROR: the Fastly API returned 404 Not Found: .';
      const result = filterOutput(input);
      assert.ok(result.includes('\x1b[31mERROR:\x1b[0m'));
    });
  });

  describe('#shouldFilterLine', function () {
    it('should filter lines with ANSI color codes', function () {
      // Simulated colored "Manage this service at:" line
      assert.ok(shouldFilterLine('\x1b[32mManage this service at:\x1b[0m'));
    });

    it('should filter spinner frames with backslash', function () {
      assert.ok(shouldFilterLine('\\ Verifying fastly.toml...'));
    });

    it('should filter spinner frames with dash', function () {
      assert.ok(shouldFilterLine('- Uploading package...'));
    });

    it('should not filter completed step lines', function () {
      assert.ok(!shouldFilterLine('✓ Uploading package'));
    });

    it('should not filter SUCCESS lines', function () {
      assert.ok(!shouldFilterLine('SUCCESS: Deployed package (service abc, version 1)'));
    });
  });

  describe('#ensureServiceIdIsSafe', function () {
    it('should accept a valid service name', function () {
      const fastlyCli = new FastlyCli();
      fastlyCli.ensureServiceIdIsSafe('first-function');
      assert.ok(true);
    });

    it('should accept a single lowercase letter', function () {
      const fastlyCli = new FastlyCli();
      fastlyCli.ensureServiceIdIsSafe('a');
      assert.ok(true);
    });

    it('should accept a name at exactly 30 characters', function () {
      const fastlyCli = new FastlyCli();
      fastlyCli.ensureServiceIdIsSafe('abcdefghijklmnopqrstuvwxyz1234');
      assert.ok(true);
    });

    it('should reject a name exceeding 30 characters', function () {
      const fastlyCli = new FastlyCli();
      assert.throws(function () {
        fastlyCli.ensureServiceIdIsSafe('abcdefghijklmnopqrstuvwxyz12345');
      }, /Service name must be 1-30 characters long/);
    });

    it('should reject names with special characters', function () {
      const fastlyCli = new FastlyCli();
      assert.throws(function () {
        fastlyCli.ensureServiceIdIsSafe('!xyz!');
      }, /Invalid service name/);
    });

    it('should reject names with uppercase letters', function () {
      const fastlyCli = new FastlyCli();
      assert.throws(function () {
        fastlyCli.ensureServiceIdIsSafe('My-Function');
      }, /Invalid service name/);
    });

    it('should reject names starting with a digit', function () {
      const fastlyCli = new FastlyCli();
      assert.throws(function () {
        fastlyCli.ensureServiceIdIsSafe('1-function');
      }, /Invalid service name/);
    });

    it('should reject names ending with a hyphen', function () {
      const fastlyCli = new FastlyCli();
      assert.throws(function () {
        fastlyCli.ensureServiceIdIsSafe('my-function-');
      }, /Invalid service name/);
    });

    it('should reject empty string', function () {
      const fastlyCli = new FastlyCli();
      assert.throws(function () {
        fastlyCli.ensureServiceIdIsSafe('');
      }, /Invalid service name/);
    });

    it('should reject null', function () {
      const fastlyCli = new FastlyCli();
      assert.throws(function () {
        fastlyCli.ensureServiceIdIsSafe(null);
      }, /Invalid service name/);
    });

    it('should reject names with underscores', function () {
      const fastlyCli = new FastlyCli();
      assert.throws(function () {
        fastlyCli.ensureServiceIdIsSafe('my_function');
      }, /Invalid service name/);
    });
  });

  describe('#buildScriptHasAot (AOT)', function () {
    it('is false when there is no [scripts] section', function () {
      assert.strictEqual(buildScriptHasAot('name = "svc"\n'), false);
    });

    it('is false when [scripts] has no build key', function () {
      assert.strictEqual(buildScriptHasAot('[scripts]\n  post_init = "npm install"\n'), false);
    });

    it('is false for a build script without --enable-aot', function () {
      assert.strictEqual(
        buildScriptHasAot(
          '[scripts]\n  build = "js-compute-runtime ./src/index.js ./bin/main.wasm"\n'
        ),
        false
      );
    });

    it('is true for a build script with --enable-aot', function () {
      assert.strictEqual(
        buildScriptHasAot(
          '[scripts]\n  build = "js-compute-runtime --enable-aot ./src/index.js ./bin/main.wasm"\n'
        ),
        true
      );
    });

    it('ignores --enable-aot outside the [scripts] build key', function () {
      assert.strictEqual(
        buildScriptHasAot('[scripts]\n  post_init = "echo --enable-aot"\n'),
        false
      );
      assert.strictEqual(
        buildScriptHasAot('[other]\n  build = "js-compute-runtime --enable-aot x y"\n'),
        false
      );
    });
  });

  describe('#withBuildScript (AOT)', function () {
    const CMD = 'js-compute-runtime --enable-aot ./src/index.js ./bin/main.wasm';

    it('replaces an existing [scripts.build] line, preserving other keys', function () {
      const toml =
        '[scripts]\n  build = "js-compute-runtime ./src/index.js ./bin/main.wasm"\n  post_init = "npm install"\n';
      const out = withBuildScript(toml, CMD);
      assert.ok(out.includes(`build = "${CMD}"`));
      assert.ok(!out.includes('build = "js-compute-runtime ./src/index.js ./bin/main.wasm"'));
      assert.ok(out.includes('post_init = "npm install"'));
      assert.strictEqual(buildScriptHasAot(out), true);
    });

    it('adds a build line under an existing [scripts] section', function () {
      const toml = '[scripts]\n  post_init = "npm install"\n\n[local_server]\n';
      const out = withBuildScript(toml, CMD);
      assert.ok(out.includes(`build = "${CMD}"`));
      assert.ok(out.includes('post_init = "npm install"'));
      assert.ok(out.includes('[local_server]'));
      assert.strictEqual(buildScriptHasAot(out), true);
    });

    it('creates a [scripts] section when none exists', function () {
      const out = withBuildScript('name = "svc"\n', CMD);
      assert.ok(out.includes('[scripts]'));
      assert.ok(out.includes(`build = "${CMD}"`));
      assert.ok(out.includes('name = "svc"'));
      assert.strictEqual(buildScriptHasAot(out), true);
    });
  });
});
