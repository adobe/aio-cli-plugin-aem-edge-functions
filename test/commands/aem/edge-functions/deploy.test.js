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
const fs = require('fs');
const { Readable } = require('stream');
const networking = require('@adobe/aio-lib-core-networking');
const DeployCommand = require('../../../../src/commands/aem/edge-functions/deploy');

function mockReadStream() {
  const s = new Readable({ read() {} });
  s.push(null);
  return s;
}

describe('DeployCommand', () => {
  let sandbox;
  let command;
  let mockFetch;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    command = new DeployCommand([], {});
    command.flags = { debug: false, legacy: false };
    command.args = { serviceId: 'my-function' };
    command.error = sandbox.stub().throws(new Error('command error'));

    command.getAccessTokenAndStage = sandbox
      .stub()
      .resolves({ accessToken: 'test-token', isStage: false });
    command.getApiBasePath = sandbox.stub().returns('https://example.com/cdn');

    mockFetch = sandbox.stub();
    sandbox.stub(networking, 'createFetch').returns(mockFetch);

    sandbox.stub(fs, 'existsSync').returns(true);
    sandbox.stub(fs, 'readdirSync').returns(['my-function.tar.gz']);
    sandbox.stub(fs, 'statSync').returns({ size: 2 * 1024 * 1024 });
    sandbox.stub(fs, 'createReadStream').callsFake(() => mockReadStream());

    // Default: hash check says "changed" so upload always proceeds
    command.computePackageHash = sandbox.stub().returns('local-hash-abc');
    command.fetchEdgeFunction = sandbox.stub().resolves(null);
    command.isUpToDate = sandbox.stub().returns(false);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('static properties', () => {
    it('should have correct description', () => {
      assert.ok(DeployCommand.description.includes('Deploy'));
    });

    it('should define debug flag with -d shorthand', () => {
      assert.strictEqual(DeployCommand.flags.debug.char, 'd');
    });

    it('should define package flag with -p shorthand', () => {
      assert.strictEqual(DeployCommand.flags.package.char, 'p');
    });

    it('should define legacy flag', () => {
      assert.ok(DeployCommand.flags.legacy);
    });

    it('should define allow-oversize flag', () => {
      assert.ok(DeployCommand.flags['allow-oversize']);
    });
  });

  describe('package size guard', () => {
    it('blocks a non-interactive oversize deploy without --allow-oversize', async () => {
      fs.statSync.returns({ size: 100_000_001 });
      const origTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;
      try {
        await assert.rejects(() => command.run());
      } finally {
        process.stdin.isTTY = origTTY;
      }

      assert.ok(command.error.calledOnce);
      assert.ok(/over Fastly's 100.0 MB/.test(command.error.firstCall.args[0]));
      assert.ok(mockFetch.notCalled, 'should not POST an oversize package');
    });

    it('warns but proceeds in the warn band', async () => {
      fs.statSync.returns({ size: 95_000_000 });
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '8', name: 'my-function', size: 1024 })
      });

      const logged = [];
      const origLog = console.log;
      console.log = (...args) => logged.push(args.join(' '));
      try {
        await command.run();
      } finally {
        console.log = origLog;
      }

      assert.ok(command.error.notCalled);
      assert.ok(mockFetch.calledOnce, 'warn band should still upload');
      assert.ok(/approaching Fastly's 100.0 MB/.test(logged.join('\n')));
    });

    it('proceeds over the limit with --allow-oversize (no prompt)', async () => {
      fs.statSync.returns({ size: 120_000_000 });
      command.flags['allow-oversize'] = true;
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '9', name: 'my-function', size: 1024 })
      });

      await command.run();

      assert.ok(command.error.notCalled);
      assert.ok(mockFetch.calledOnce, 'should POST when --allow-oversize is set');
    });

    it('prompts and cancels the deploy when "send anyway" is declined', async () => {
      fs.statSync.returns({ size: 120_000_000 });
      command.promptConfirm = sandbox.stub().resolves(false);
      const origTTY = process.stdin.isTTY;
      process.stdin.isTTY = true;
      try {
        await command.run();
      } finally {
        process.stdin.isTTY = origTTY;
      }

      assert.ok(command.promptConfirm.calledOnce);
      assert.ok(command.error.notCalled, 'declining is not an error');
      assert.ok(mockFetch.notCalled, 'declining should not POST');
    });

    it('prompts and proceeds when "send anyway" is confirmed', async () => {
      fs.statSync.returns({ size: 120_000_000 });
      command.promptConfirm = sandbox.stub().resolves(true);
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '11', name: 'my-function', size: 1024 })
      });
      const origTTY = process.stdin.isTTY;
      process.stdin.isTTY = true;
      try {
        await command.run();
      } finally {
        process.stdin.isTTY = origTTY;
      }

      assert.ok(command.promptConfirm.calledOnce);
      assert.ok(command.error.notCalled);
      assert.ok(mockFetch.calledOnce, 'confirming should POST');
    });

    it('does not guard a normally sized package', async () => {
      fs.statSync.returns({ size: 2 * 1024 * 1024 });
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '10', name: 'my-function', size: 1024 })
      });

      await command.run();

      assert.ok(command.error.notCalled);
      assert.ok(mockFetch.calledOnce);
    });
  });

  describe('--force flag', () => {
    it('skips hash check when --force is set', async () => {
      command.flags.force = true;
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '1', name: 'my-function', size: 1024 })
      });

      await command.run();

      assert.ok(command.computePackageHash.notCalled);
      assert.ok(command.isUpToDate.notCalled);
      assert.ok(mockFetch.calledOnce, 'should POST without prior GET calls');
    });
  });

  describe('hash check', () => {
    it('skips upload and prints up-to-date when hashes match', async () => {
      command.isUpToDate.returns(true);

      const logged = [];
      const origLog = console.log;
      console.log = (...args) => logged.push(args.join(' '));
      try {
        await command.run();
      } finally {
        console.log = origLog;
      }

      assert.ok(mockFetch.notCalled, 'should not POST');
      assert.ok(logged.join('\n').includes('Already up to date'));
    });

    it('proceeds with upload when hashes differ', async () => {
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '5', name: 'my-function', size: 1024 })
      });

      await command.run();

      assert.ok(mockFetch.calledOnce, 'should POST');
    });

    it('proceeds with upload when fetchEdgeFunction returns null', async () => {
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '6', name: 'my-function', size: 1024 })
      });

      await command.run();

      assert.ok(mockFetch.calledOnce);
    });

    it('passes fetched data and local hash to isUpToDate', async () => {
      const efData = { activePackage: { filesHash: 'remote-hash' } };
      command.computePackageHash.returns('deadbeef');
      command.fetchEdgeFunction.resolves(efData);
      command.isUpToDate.returns(true);

      const origLog = console.log;
      console.log = () => {};
      try {
        await command.run();
      } finally {
        console.log = origLog;
      }

      assert.ok(command.isUpToDate.calledWith(efData, 'deadbeef'));
    });
  });

  describe('--legacy path', () => {
    it('delegates to getFastlyCli().deploy when --legacy is set', async () => {
      command.flags.legacy = true;
      const mockFastly = { deploy: sandbox.stub().resolves() };
      command.getFastlyCli = sandbox.stub().resolves(mockFastly);

      await command.run();

      assert.ok(mockFastly.deploy.calledOnce);
      assert.ok(mockFastly.deploy.calledWith('my-function', { debug: false }));
    });

    it('passes --debug to the legacy deploy', async () => {
      command.flags.legacy = true;
      command.flags.debug = true;
      const mockFastly = { deploy: sandbox.stub().resolves() };
      command.getFastlyCli = sandbox.stub().resolves(mockFastly);

      await command.run();

      assert.ok(mockFastly.deploy.calledWith('my-function', { debug: true }));
    });
  });

  describe('CDN API path', () => {
    it('deploys successfully and prints metadata from the response', async () => {
      mockFetch.resolves({
        ok: true,
        json: async () => ({
          id: '4',
          active: true,
          name: 'my-fn',
          description: 'My function',
          size: 12345,
          createdAt: '2026-06-01T00:00:00Z'
        })
      });

      const logged = [];
      const origLog = console.log;
      console.log = (...args) => logged.push(args.join(' '));
      try {
        await command.run();
      } finally {
        console.log = origLog;
      }

      const output = logged.join('\n');
      assert.ok(output.includes('my-fn'), 'should show name from response');
      assert.ok(output.includes('My function'), 'should show description');
      assert.ok(output.includes('package 4'), 'should show package id');
      assert.ok(output.includes('12.1 KB'), 'should show formatted size');
    });

    it('POSTs to the correct URL', async () => {
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '1', name: 'my-function', size: 1024 })
      });

      await command.run();

      const [url, opts] = mockFetch.firstCall.args;
      assert.strictEqual(url, 'https://example.com/cdn/edgeFunctions/my-function/packages');
      assert.strictEqual(opts.method, 'POST');
      assert.ok(opts.headers.Authorization, 'Bearer test-token');
    });

    it('uses the detail field from a problem details response', async () => {
      mockFetch.resolves({
        ok: false,
        status: 422,
        json: async () => ({
          type: 'http://api.adobeaemcloud.com/adobe/meta/errors/bad_request',
          title: 'Bad Request',
          status: 422,
          detail: 'Failed to extract metadata from package'
        }),
        headers: { get: () => null }
      });

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/Failed to extract metadata from package/)));
    });

    it('falls back to title when detail is absent', async () => {
      mockFetch.resolves({
        ok: false,
        status: 403,
        json: async () => ({ title: 'Forbidden', status: 403 }),
        headers: { get: () => null }
      });

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/Forbidden/)));
    });

    it('falls back to HTTP status when JSON parse fails', async () => {
      mockFetch.resolves({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
        headers: { get: () => null }
      });

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/HTTP 500/)));
    });

    it('includes request-id in the error when present', async () => {
      mockFetch.resolves({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'invalid name' }),
        headers: { get: (h) => (h === 'x-request-id' ? 'req-abc-123' : null) }
      });

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/req-abc-123/)));
    });

    it('errors when no package found in pkg/', async () => {
      fs.readdirSync.returns([]);

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/No package found/)));
    });

    it('errors when pkg/ directory does not exist', async () => {
      fs.existsSync.returns(false);

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/No package found/)));
    });

    it('errors when multiple packages found in pkg/', async () => {
      fs.readdirSync.returns(['a.tar.gz', 'b.tar.gz']);

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/Multiple packages/)));
    });

    it('uses --package flag and skips pkg/ glob', async () => {
      command.flags.package = '/custom/path/my.tar.gz';
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '99', name: 'my-function', size: 1024 })
      });

      await command.run();

      assert.ok(fs.readdirSync.notCalled);
      assert.ok(fs.createReadStream.calledWith('/custom/path/my.tar.gz'));
    });

    it('errors when access token is not available', async () => {
      command.getAccessTokenAndStage.resolves({ accessToken: null, isStage: false });

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/No access token/)));
    });

    it('errors when API endpoint is not configured', async () => {
      command.getApiBasePath.returns(null);

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/not configured/)));
    });

    it('errors on invalid service name', async () => {
      command.args.serviceId = 'INVALID_NAME';

      await assert.rejects(() => command.run(), /command error/);
      assert.ok(command.error.calledWith(sinon.match(/Invalid service name/)));
    });

    it('logs the API URL when --debug is set', async () => {
      command.flags.debug = true;
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '5', name: 'my-function', size: 1024 })
      });

      const logged = [];
      const origLog = console.log;
      console.log = (...args) => logged.push(args.join(' '));
      try {
        await command.run();
      } finally {
        console.log = origLog;
      }

      assert.ok(logged.some((msg) => msg.includes('edgeFunctions/my-function/packages')));
    });

    it('logs local hash when --debug is set and hash check runs', async () => {
      command.flags.debug = true;
      command.computePackageHash = sandbox.stub().returns('deadbeef-local-hash');
      command.isUpToDate = sandbox.stub().resolves(false);
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '7', name: 'my-function', size: 1024 })
      });

      const logged = [];
      const origLog = console.log;
      console.log = (...args) => logged.push(args.join(' '));
      try {
        await command.run();
      } finally {
        console.log = origLog;
      }

      assert.ok(
        logged.some((msg) => msg.includes('deadbeef-local-hash')),
        'should log local hash'
      );
    });
  });

  describe('fetchEdgeFunction', () => {
    beforeEach(() => {
      command.fetchEdgeFunction = DeployCommand.prototype.fetchEdgeFunction.bind(command);
    });

    it('returns the full EdgeFunction object', async () => {
      const efData = {
        name: 'my-fn',
        debugDomain: 'edgefunction-p1234-e567890-my-fn.adobeaemcloud.com'
      };
      mockFetch.resolves({ ok: true, json: async () => efData });

      const result = await command.fetchEdgeFunction('my-fn', 'https://example.com/cdn', 'tok');
      assert.deepStrictEqual(result, efData);
    });

    it('calls GET /edgeFunctions/{name}', async () => {
      mockFetch.resolves({ ok: true, json: async () => ({}) });

      await command.fetchEdgeFunction('my-fn', 'https://example.com/cdn', 'test-token');

      const [url] = mockFetch.firstCall.args;
      assert.strictEqual(url, 'https://example.com/cdn/edgeFunctions/my-fn');
    });

    it('returns null when the response is not ok', async () => {
      mockFetch.resolves({ ok: false, status: 404 });
      const result = await command.fetchEdgeFunction('my-fn', 'https://example.com/cdn', 'tok');
      assert.strictEqual(result, null);
    });

    it('returns null on fetch error', async () => {
      mockFetch.rejects(new Error('network error'));
      const result = await command.fetchEdgeFunction('my-fn', 'https://example.com/cdn', 'tok');
      assert.strictEqual(result, null);
    });
  });

  describe('isUpToDate', () => {
    it('returns true when filesHash matches localHash', () => {
      const efData = { activePackage: { id: '1', filesHash: 'abc123' } };
      assert.strictEqual(DeployCommand.prototype.isUpToDate(efData, 'abc123'), true);
    });

    it('returns false when filesHash differs', () => {
      const efData = { activePackage: { id: '1', filesHash: 'abc123' } };
      assert.strictEqual(DeployCommand.prototype.isUpToDate(efData, 'different'), false);
    });

    it('returns false when activePackage is absent', () => {
      assert.strictEqual(DeployCommand.prototype.isUpToDate({ name: 'fn' }, 'abc123'), false);
    });

    it('returns false when efData is null', () => {
      assert.strictEqual(DeployCommand.prototype.isUpToDate(null, 'abc123'), false);
    });
  });

  describe('service URL output', () => {
    const DEBUG_DOMAIN = 'edgefunction-p1234-e567890-my-function.adobeaemcloud.com';

    it('shows debug domain from fetchEdgeFunction on normal deploy', async () => {
      command.fetchEdgeFunction.resolves({ debugDomain: DEBUG_DOMAIN });
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '1', name: 'my-function', size: 1024 })
      });

      const logged = [];
      const origLog = console.log;
      console.log = (...args) => logged.push(args.join(' '));
      try {
        await command.run();
      } finally {
        console.log = origLog;
      }

      const output = logged.join('\n');
      assert.ok(output.includes(`https://${DEBUG_DOMAIN}`));
      assert.ok(output.includes('only for debugging'));
      assert.ok(command.fetchEdgeFunction.calledOnce, 'should call fetchEdgeFunction once');
    });

    it('fetches debug domain via fetchEdgeFunction on --force deploy', async () => {
      command.flags.force = true;
      command.fetchEdgeFunction.resolves({ debugDomain: DEBUG_DOMAIN });
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '1', name: 'my-function', size: 1024 })
      });

      const logged = [];
      const origLog = console.log;
      console.log = (...args) => logged.push(args.join(' '));
      try {
        await command.run();
      } finally {
        console.log = origLog;
      }

      assert.ok(command.fetchEdgeFunction.calledOnce, 'should call fetchEdgeFunction on --force');
      assert.ok(logged.join('\n').includes(`https://${DEBUG_DOMAIN}`));
    });

    it('skips the URL block when no debug domain is available', async () => {
      mockFetch.resolves({
        ok: true,
        json: async () => ({ id: '1', name: 'my-function', size: 1024 })
      });

      const logged = [];
      const origLog = console.log;
      console.log = (...args) => logged.push(args.join(' '));
      try {
        await command.run();
      } finally {
        console.log = origLog;
      }

      assert.ok(!logged.some((msg) => msg.includes('View this service at')));
    });
  });
});
