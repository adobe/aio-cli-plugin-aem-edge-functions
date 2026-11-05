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
const sinon = require('sinon');
const BaseCommand = require('../../src/libs/base-command');

/**
 * Build a bare BaseCommand instance (bypassing the oclif constructor) with just the
 * fields the ADC auth helpers rely on, plus an overridable fetch and config lookup.
 * @param config
 */
function makeCmd(config = {}) {
  const cmd = Object.create(BaseCommand.prototype);
  cmd.CONFIG_ADC_CLIENT_ID = 'edgefunctions_adc_client_id';
  cmd.CONFIG_ADC_CLIENT_SECRET = 'edgefunctions_adc_client_secret';
  cmd.CONFIG_ADC_SCOPES = 'edgefunctions_adc_scopes';
  cmd.getConfig = (key) => config[key];
  return cmd;
}

/**
 * Fake fetch returning a JSON body.
 * @param root0
 * @param root0.ok
 * @param root0.status
 * @param root0.body
 */
function jsonFetch({ ok = true, status = 200, body = {} }) {
  return async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
}

/**
 * Fake fetch returning a raw (non-JSON) body.
 * @param root0
 * @param root0.ok
 * @param root0.status
 * @param root0.text
 */
function rawFetch({ ok = false, status = 500, text = '' }) {
  return async () => ({
    ok,
    status,
    text: async () => text,
    json: async () => {
      throw new Error('not json');
    }
  });
}

describe('BaseCommand ADC auth error reporting', function () {
  describe('exchangeOAuthForToken', function () {
    it('returns the access token and clears the cached error on success', async function () {
      const cmd = makeCmd();
      cmd.getFetch = () => jsonFetch({ ok: true, status: 200, body: { access_token: 'tok123' } });
      const token = await cmd.exchangeOAuthForToken('cid', 'secret', 'aem.experimental');
      assert.strictEqual(token, 'tok123');
      assert.strictEqual(cmd._lastAdcAuthError, null);
    });

    it('throws a structured AdcAuthError carrying IMS error/description on HTTP 400', async function () {
      const cmd = makeCmd();
      cmd.getFetch = () =>
        jsonFetch({
          ok: false,
          status: 400,
          body: { error: 'invalid_client', error_description: 'client secret invalid' }
        });
      await assert.rejects(
        () => cmd.exchangeOAuthForToken('cid', 'secret', 'aem.experimental'),
        (err) => {
          assert.strictEqual(err.name, 'AdcAuthError');
          assert.strictEqual(err.adcAuth.kind, 'ims');
          assert.strictEqual(err.adcAuth.status, 400);
          assert.strictEqual(err.adcAuth.error, 'invalid_client');
          assert.strictEqual(err.adcAuth.errorDescription, 'client secret invalid');
          assert.ok(/invalid_client/.test(err.message));
          return true;
        }
      );
      assert.strictEqual(cmd._lastAdcAuthError.error, 'invalid_client');
    });

    it('captures a non-JSON IMS error body as raw text', async function () {
      const cmd = makeCmd();
      cmd.getFetch = () => rawFetch({ ok: false, status: 502, text: 'Bad Gateway' });
      await assert.rejects(
        () => cmd.exchangeOAuthForToken('cid', 'secret', 's'),
        (err) => {
          assert.strictEqual(err.adcAuth.kind, 'ims');
          assert.strictEqual(err.adcAuth.status, 502);
          assert.strictEqual(err.adcAuth.raw, 'Bad Gateway');
          return true;
        }
      );
    });

    it('reports a network error when fetch throws before any response', async function () {
      const cmd = makeCmd();
      cmd.getFetch = () => async () => {
        throw new Error('ENOTFOUND ims-na1.adobelogin.com');
      };
      await assert.rejects(
        () => cmd.exchangeOAuthForToken('cid', 'secret', 's'),
        (err) => {
          assert.strictEqual(err.adcAuth.kind, 'network');
          assert.ok(/ENOTFOUND/.test(err.adcAuth.cause));
          return true;
        }
      );
    });

    it('throws when IMS responds 200 without an access_token', async function () {
      const cmd = makeCmd();
      cmd.getFetch = () => jsonFetch({ ok: true, status: 200, body: { foo: 'bar' } });
      await assert.rejects(
        () => cmd.exchangeOAuthForToken('cid', 'secret', 's'),
        (err) => {
          assert.strictEqual(err.adcAuth.kind, 'ims');
          assert.ok(/access_token/.test(err.message));
          return true;
        }
      );
    });
  });

  describe('getAdcToken', function () {
    it('throws a config error listing exactly which fields are missing', async function () {
      const cmd = makeCmd({ edgefunctions_adc_client_id: 'cid' });
      await assert.rejects(
        () => cmd.getAdcToken(),
        (err) => {
          assert.strictEqual(err.adcAuth.kind, 'config');
          assert.deepStrictEqual(err.adcAuth.missing, ['Client Secret', 'Scopes']);
          return true;
        }
      );
    });

    it('returns a token object on success', async function () {
      const cmd = makeCmd({
        edgefunctions_adc_client_id: 'cid',
        edgefunctions_adc_client_secret: 'sec',
        edgefunctions_adc_scopes: 'aem.experimental'
      });
      cmd.getFetch = () => jsonFetch({ ok: true, status: 200, body: { access_token: 'tokABC' } });
      const result = await cmd.getAdcToken();
      assert.strictEqual(result.accessToken, 'tokABC');
      assert.strictEqual(result.apiKey, 'cid');
      assert.strictEqual(result.data.client_id, 'cid');
    });
  });

  describe('helpers', function () {
    it('adcAuthHints returns invalid_client-specific guidance', function () {
      const cmd = makeCmd();
      const hints = cmd.adcAuthHints({ kind: 'ims', error: 'invalid_client' });
      assert.ok(hints.some((h) => /invalid_client/.test(h)));
      assert.ok(hints.some((h) => /new client secret/i.test(h)));
    });

    it('adcAuthHints returns invalid_scope-specific guidance', function () {
      const cmd = makeCmd();
      const hints = cmd.adcAuthHints({ kind: 'ims', error: 'invalid_scope' });
      assert.ok(hints.some((h) => /invalid_scope/.test(h)));
      assert.ok(hints.some((h) => /product profiles/i.test(h)));
    });

    it('buildAdcTokenCurl redacts the secret and includes client id and scopes', function () {
      const cmd = makeCmd();
      const curl = cmd.buildAdcTokenCurl('cid123', 'a,b');
      assert.ok(curl.includes('client_id=cid123'));
      assert.ok(curl.includes('<YOUR_CLIENT_SECRET>'));
      assert.ok(curl.includes('scope=a,b'));
      assert.ok(!curl.includes('secret=real'));
    });

    it('summarizeAdcAuthDetail produces a one-line summary with no secrets', function () {
      const cmd = makeCmd();
      const summary = cmd.summarizeAdcAuthDetail({
        kind: 'ims',
        status: 400,
        error: 'invalid_client',
        errorDescription: 'bad secret'
      });
      assert.ok(/HTTP 400/.test(summary));
      assert.ok(/invalid_client/.test(summary));
      assert.ok(/bad secret/.test(summary));
    });

    it('formatAdcAuthError produces a multi-line explanation with hint bullets', function () {
      const cmd = makeCmd();
      const err = cmd.makeAdcAuthError('IMS rejected', {
        kind: 'ims',
        imsEndpoint: 'https://ims',
        status: 400,
        error: 'invalid_scope',
        errorDescription: 'bad scope'
      });
      const text = cmd.formatAdcAuthError(err);
      assert.ok(/invalid_scope/.test(text));
      assert.ok(/bad scope/.test(text));
      assert.ok(/- /.test(text));
    });
  });
});

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

describe('BaseCommand.getImsTokenEndpoint', function () {
  it('uses the prod IMS host by default', function () {
    const cmd = makeCmd();
    cmd.isStageEnv = () => false;
    assert.strictEqual(cmd.getImsTokenEndpoint(), 'https://ims-na1.adobelogin.com/ims/token/v3');
  });

  it('uses the stage IMS host when the CLI env is stage', function () {
    const cmd = makeCmd();
    cmd.isStageEnv = () => true;
    assert.strictEqual(
      cmd.getImsTokenEndpoint(),
      'https://ims-na1-stg1.adobelogin.com/ims/token/v3'
    );
  });

  it('memoizes the resolved endpoint (isStageEnv consulted once)', function () {
    const cmd = makeCmd();
    let calls = 0;
    cmd.isStageEnv = () => {
      calls += 1;
      return false;
    };
    cmd.getImsTokenEndpoint();
    cmd.getImsTokenEndpoint();
    assert.strictEqual(calls, 1);
  });
});
