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
const sinon = require('sinon');
const BaseCommand = require('../../src/libs/base-command');

describe('BaseCommand.isAdcConfigured', () => {
  let sandbox;
  let command;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    command = new BaseCommand([], { name: '@adobe/aio-cli', version: '11.2.0' });
  });

  afterEach(() => {
    sandbox.restore();
  });

  /**
   * Stub getConfig to resolve values from a map keyed by config key.
   * @param {object} map Config key -> value
   */
  function stubConfig(map) {
    sandbox.stub(command, 'getConfig').callsFake((key) => map[key]);
  }

  it('returns true when ADC is explicitly configured, even without credentials', () => {
    stubConfig({ [command.CONFIG_ADC_CONFIGURED]: true });
    assert.strictEqual(command.isAdcConfigured(), true);
  });

  it('returns true when all three S2S credentials are present without the explicit flag', () => {
    stubConfig({
      [command.CONFIG_ADC_CONFIGURED]: undefined,
      [command.CONFIG_ADC_CLIENT_ID]: 'client-id',
      [command.CONFIG_ADC_CLIENT_SECRET]: 'client-secret',
      [command.CONFIG_ADC_SCOPES]: 'scope-a,scope-b'
    });
    assert.strictEqual(command.isAdcConfigured(), true);
  });

  it('returns false when a credential is missing and not explicitly configured', () => {
    stubConfig({
      [command.CONFIG_ADC_CONFIGURED]: undefined,
      [command.CONFIG_ADC_CLIENT_ID]: 'client-id',
      [command.CONFIG_ADC_CLIENT_SECRET]: undefined,
      [command.CONFIG_ADC_SCOPES]: 'scope-a,scope-b'
    });
    assert.strictEqual(command.isAdcConfigured(), false);
  });

  it('returns false when nothing is configured', () => {
    stubConfig({});
    assert.strictEqual(command.isAdcConfigured(), false);
  });
});
