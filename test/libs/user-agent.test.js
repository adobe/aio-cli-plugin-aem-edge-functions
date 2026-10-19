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
const { version, name } = require('../../package.json');
const { getUserAgent } = require('../../src/libs/user-agent');
const BaseCommand = require('../../src/libs/base-command');
const FastlyCli = require('../../src/libs/fastly-cli');
const BuildCommand = require('../../src/commands/aem/edge-functions/build');
const ServeCommand = require('../../src/commands/aem/edge-functions/serve');
const networking = require('@adobe/aio-lib-core-networking');
const { Request } = require('../../src/libs/request');

describe('User-agent', () => {
  const host = { name: '@adobe/aio-cli', version: '11.2.0' };
  const plugin = `aio-cli-plugin-aem-edge-functions/${version} node/${process.versions.node}`;
  const expected = `aio/11.2.0 ${plugin}`;

  it('includes the running AIO, installed plugin and Node.js runtime versions', () => {
    assert.strictEqual(getUserAgent(host), expected);
    assert.strictEqual(
      getUserAgent({ ...host, version: '11.3.0-beta.1' }),
      `aio/11.3.0-beta.1 ${plugin}`
    );
  });

  it('does not misreport the standalone plugin version as an AIO version', () => {
    assert.strictEqual(getUserAgent({ name, version }), plugin);
    assert.strictEqual(getUserAgent(), plugin);
    assert.strictEqual(getUserAgent({ name: '@adobe/aio-cli' }), plugin);
  });

  it('uses each command host without leaking identity between instances', () => {
    const first = new BaseCommand([], host);
    const second = new BaseCommand([], { ...host, version: '10.3.0' });
    assert.strictEqual(first.getUserAgent(), expected);
    assert.strictEqual(second.getUserAgent(), `aio/10.3.0 ${plugin}`);
    assert.strictEqual(first.getUserAgent(), expected);
  });

  it('passes the host identity to authenticated Fastly commands', async () => {
    const command = new BaseCommand([], host);
    command.getAccessTokenAndStage = async () => ({ accessToken: 'test-token', isStage: false });
    command.getApiEndpoint = () => 'https://example.com/cdn';
    const fastly = await command.getFastlyCli();
    assert.strictEqual(fastly.userAgent, expected);
    assert.strictEqual(fastly.apiToken, 'test-token');
    assert.strictEqual(fastly.apiEndpoint, 'https://example.com/cdn');
  });

  for (const [name, args] of [
    ['list', {}],
    ['package', { serviceId: 'test-function', packageId: '1' }],
    ['packages', { serviceId: 'test-function' }],
    ['purge-cache', { serviceId: 'test-function' }]
  ]) {
    it(`includes the host identity in ${name} requests`, async () => {
      const Command = require(`../../src/commands/aem/edge-functions/${name}`);
      const command = new Command([], host);
      command.flags = { all: true };
      command.args = args;
      command.getAccessTokenAndStage = async () => ({
        accessToken: 'test-token',
        isStage: false
      });
      command.getApiBasePath = () => 'https://example.com/cdn';
      const sandbox = sinon.createSandbox();
      const request = sandbox.stub(Request.prototype, 'request').resolves({
        ok: true,
        json: async () => ({ items: [] })
      });
      sandbox.stub(console, 'log');
      sandbox.stub(command, 'spinnerStart');
      sandbox.stub(command, 'spinnerStop');
      try {
        await command.run();
        assert.ok(request.calledOnce);
        assert.strictEqual(request.firstCall.thisValue._headers['User-Agent'], expected);
      } finally {
        sandbox.restore();
      }
    });
  }

  it('includes the host identity in info connectivity and detail requests', async () => {
    const InfoCommand = require('../../src/commands/aem/edge-functions/info');
    const command = new InfoCommand([], host);
    command.flags = { batch: true, debug: true };
    command.getConfig = () => undefined;
    command.getApiBasePath = () => 'https://example.com/cdn';
    const sandbox = sinon.createSandbox();
    sandbox.stub(process, 'env').value({ ...process.env, AEM_EDGE_FUNCTIONS_TOKEN: 'test-token' });
    const fetch = sandbox.stub();
    fetch.onFirstCall().resolves({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ name: 'test-function' }] })
    });
    fetch.onSecondCall().resolves({ ok: true, json: async () => ({}) });
    sandbox.stub(networking, 'createFetch').returns(fetch);
    sandbox.stub(console, 'log');
    sandbox.stub(command, 'spinnerStart');
    sandbox.stub(command, 'spinnerStop');
    try {
      await command.run();
      assert.strictEqual(fetch.callCount, 2);
      for (const call of fetch.getCalls()) {
        assert.strictEqual(call.args[1].headers['User-Agent'], expected);
        assert.strictEqual(call.args[1].headers.Authorization, 'Bearer test-token');
      }
    } finally {
      sandbox.restore();
    }
  });

  for (const [Command, method] of [
    [BuildCommand, 'build'],
    [ServeCommand, 'serve']
  ]) {
    it(`passes the host identity to Fastly ${method} without authenticating`, async () => {
      const stub = sinon.stub(FastlyCli.prototype, method).resolves();
      try {
        const command = new Command([], host);
        command.flags = {};
        await command.run();
        assert.strictEqual(stub.firstCall.thisValue.userAgent, expected);
      } finally {
        stub.restore();
      }
    });
  }

  for (const filterOutput of [false, true]) {
    for (const extension of [undefined, 'existing-client/2.0']) {
      it(`extends the Fastly child user-agent (filtered=${filterOutput}, existing=${Boolean(extension)})`, async () => {
        const previous = process.env.FASTLY_USER_AGENT_EXTENSION;
        try {
          if (extension === undefined) {
            delete process.env.FASTLY_USER_AGENT_EXTENSION;
          } else {
            process.env.FASTLY_USER_AGENT_EXTENSION = extension;
          }
          const fastly = new FastlyCli('test-token', 'https://example.com/cdn', expected);
          fastly.fastlyCliPath = process.execPath;
          const childExpected = extension ? `${extension}, ${expected}` : expected;
          const script =
            "require('node:assert/strict').equal(process.env.FASTLY_USER_AGENT_EXTENSION, " +
            `${JSON.stringify(childExpected)})`;

          await fastly.run(['-e', script], { filterOutput });

          assert.strictEqual(process.env.FASTLY_USER_AGENT_EXTENSION, extension);
        } finally {
          if (previous === undefined) {
            delete process.env.FASTLY_USER_AGENT_EXTENSION;
          } else {
            process.env.FASTLY_USER_AGENT_EXTENSION = previous;
          }
        }
      });
    }
  }
});
