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

const QUOTE_CHARS = ['"', "'"];

/**
 * Normalize an environment variable value as typed by a user in a shell.
 *
 * Windows cmd keeps quotes literally (`set VAR="value"` stores `"value"` including the
 * quotes), and copy-pasting often adds surrounding whitespace or a trailing newline. None of
 * the plugin's values (IDs, client secrets, scopes, tokens, URLs, JSON) can legitimately
 * start and end with the same quote character or carry surrounding whitespace, so both are
 * removed: surrounding whitespace is trimmed and one matching pair of surrounding `"` or `'`
 * is stripped (then trimmed again).
 * @param {string|undefined} raw Raw value from process.env
 * @returns {{value: (string|undefined), quotesStripped: boolean, whitespaceTrimmed: boolean}}
 *   The normalized value and what was changed
 */
function normalizeEnvValue(raw) {
  if (typeof raw !== 'string') {
    return { value: raw, quotesStripped: false, whitespaceTrimmed: false };
  }
  let value = raw.trim();
  let whitespaceTrimmed = value !== raw;
  let quotesStripped = false;
  if (value.length >= 2 && QUOTE_CHARS.includes(value[0]) && value[value.length - 1] === value[0]) {
    const inner = value.slice(1, -1);
    const innerTrimmed = inner.trim();
    whitespaceTrimmed = whitespaceTrimmed || innerTrimmed !== inner;
    value = innerTrimmed;
    quotesStripped = true;
  }
  return { value, quotesStripped, whitespaceTrimmed };
}

/**
 * Read an environment variable with {@link normalizeEnvValue} applied.
 * @param {string} name Environment variable name
 * @returns {string|undefined} Normalized value, or undefined when the variable is not set
 */
function readEnv(name) {
  return normalizeEnvValue(process.env[name]).value;
}

/**
 * Describe how a value would be normalized, for diagnostics (never includes the value).
 * @param {string} name Environment variable name
 * @returns {string|null} Human-readable note, or null when the value is used as-is
 */
function describeEnvAdjustment(name) {
  const { value, quotesStripped, whitespaceTrimmed } = normalizeEnvValue(process.env[name]);
  const notes = [];
  if (quotesStripped) notes.push('surrounding quotes removed');
  if (whitespaceTrimmed) notes.push('surrounding whitespace removed');
  if (typeof value === 'string' && value.length > 0) {
    const first = value[0];
    const last = value[value.length - 1];
    if (QUOTE_CHARS.includes(first) || QUOTE_CHARS.includes(last)) {
      notes.push('WARNING: unbalanced quote at start or end of value');
    }
  }
  return notes.length > 0 ? notes.join(', ') : null;
}

/**
 * Commands a user can run to set an environment variable on the current platform.
 * On Windows both cmd and PowerShell syntax are shown; cmd must NOT use quotes, because
 * `set VAR="value"` would store the quotes as part of the value.
 * @param {string} name Environment variable name
 * @param {string} value Value (or a placeholder such as `<secret>`)
 * @param {string} [platform] Platform to generate commands for (defaults to process.platform)
 * @returns {string[]} One command (or explanatory line) per entry
 */
function setEnvCommandLines(name, value, platform = process.platform) {
  if (platform === 'win32') {
    return [
      `cmd:        set ${name}=${value}`,
      `PowerShell: $env:${name}='${value}'`,
      `(cmd: do not put quotes around the value; to persist it use: setx ${name} ${value} and open a new window)`
    ];
  }
  return [`export ${name}="${value}"`];
}

module.exports = { normalizeEnvValue, readEnv, describeEnvAdjustment, setEnvCommandLines };
