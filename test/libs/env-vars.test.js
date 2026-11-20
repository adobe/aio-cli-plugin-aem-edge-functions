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
const {
  normalizeEnvValue,
  readEnv,
  describeEnvAdjustment,
  setEnvCommandLines
} = require('../../src/libs/env-vars');

const VAR = 'AEM_EDGE_FUNCTIONS_TEST_ENV_VARS_VALUE';

describe('env-vars', () => {
  afterEach(() => {
    delete process.env[VAR];
  });

  describe('normalizeEnvValue', () => {
    it('returns plain values unchanged', () => {
      assert.deepStrictEqual(normalizeEnvValue('p8e-abc123'), {
        value: 'p8e-abc123',
        quotesStripped: false,
        whitespaceTrimmed: false
      });
    });

    it('strips the literal double quotes Windows cmd stores for set VAR="value"', () => {
      assert.deepStrictEqual(normalizeEnvValue('"p8e-abc123"'), {
        value: 'p8e-abc123',
        quotesStripped: true,
        whitespaceTrimmed: false
      });
    });

    it("strips a pair of single quotes (e.g. a copied export VAR='{...}')", () => {
      assert.strictEqual(normalizeEnvValue('\'{"a":1}\'').value, '{"a":1}');
    });

    it('trims surrounding whitespace, including a trailing CRLF and whitespace inside quotes', () => {
      assert.deepStrictEqual(normalizeEnvValue(' "p8e-abc123 "\r\n'), {
        value: 'p8e-abc123',
        quotesStripped: true,
        whitespaceTrimmed: true
      });
    });

    it('strips only one pair of matching quotes and keeps unbalanced quotes', () => {
      assert.strictEqual(normalizeEnvValue('""x""').value, '"x"');
      assert.strictEqual(normalizeEnvValue('"x').value, '"x');
      assert.strictEqual(normalizeEnvValue('"x\'').value, '"x\'');
      assert.strictEqual(normalizeEnvValue('"').value, '"');
    });

    it('keeps empty and undefined values as they are', () => {
      assert.strictEqual(normalizeEnvValue('').value, '');
      assert.strictEqual(normalizeEnvValue(undefined).value, undefined);
    });
  });

  describe('readEnv', () => {
    it('returns undefined for an unset variable', () => {
      assert.strictEqual(readEnv(VAR), undefined);
    });

    it('returns the normalized value', () => {
      process.env[VAR] = '"p8e-abc123"';
      assert.strictEqual(readEnv(VAR), 'p8e-abc123');
    });
  });

  describe('describeEnvAdjustment', () => {
    it('returns null when the value is used as-is or unset', () => {
      assert.strictEqual(describeEnvAdjustment(VAR), null);
      process.env[VAR] = 'p8e-abc123';
      assert.strictEqual(describeEnvAdjustment(VAR), null);
    });

    it('describes removed quotes and whitespace without revealing the value', () => {
      process.env[VAR] = '"p8e-abc123" ';
      const note = describeEnvAdjustment(VAR);
      assert.strictEqual(note, 'surrounding quotes removed, surrounding whitespace removed');
      assert.ok(!note.includes('p8e-abc123'));
    });

    it('warns about an unbalanced quote', () => {
      process.env[VAR] = '"p8e-abc123';
      assert.match(describeEnvAdjustment(VAR), /unbalanced quote/);
    });
  });

  describe('setEnvCommandLines', () => {
    it('prints export syntax on macOS/Linux', () => {
      assert.deepStrictEqual(setEnvCommandLines('X', '<secret>', 'darwin'), [
        'export X="<secret>"'
      ]);
    });

    it('prints cmd syntax without quotes and PowerShell syntax on Windows', () => {
      const lines = setEnvCommandLines('X', '<secret>', 'win32');
      assert.strictEqual(lines[0], 'cmd:        set X=<secret>');
      assert.strictEqual(lines[1], "PowerShell: $env:X='<secret>'");
      assert.match(lines[2], /do not put quotes around the value/);
      assert.match(lines[2], /setx X <secret>/);
    });
  });
});
