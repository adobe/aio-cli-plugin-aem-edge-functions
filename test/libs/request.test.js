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
const http = require('node:http');
const { once } = require('node:events');
const FormData = require('form-data');
const { Request } = require('../../src/libs/request');
const { Cloudmanager } = require('../../src/libs/cloudmanager');
const { getUserAgent } = require('../../src/libs/user-agent');

describe('Request user-agent', () => {
  let server;
  let baseUrl;
  const userAgent = getUserAgent({ name: '@adobe/aio-cli', version: '11.2.0' });

  before(async () => {
    server = http.createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString()
        })
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  it('defaults to the plugin identity outside an AIO host', async () => {
    const response = await new Request(baseUrl).get('/edgeFunctions');
    const received = await response.json();
    assert.strictEqual(received.headers['user-agent'], getUserAgent());
  });

  for (const method of ['get', 'post', 'put', 'options', 'patch', 'delete']) {
    it(`sends both versions on ${method.toUpperCase()} without changing other headers`, async () => {
      const headers = { 'User-Agent': userAgent, Authorization: 'Bearer test-token' };
      const request = new Request(baseUrl, headers);
      const response = await request[method]('/edgeFunctions');
      const received = await response.json();
      assert.strictEqual(received.headers['user-agent'], userAgent);
      assert.strictEqual(received.headers.authorization, headers.Authorization);
      assert.strictEqual(received.method, method.toUpperCase());
      assert.deepStrictEqual(headers, {
        'User-Agent': userAgent,
        Authorization: 'Bearer test-token'
      });
    });
  }

  it('preserves JSON request bodies and content type', async () => {
    const response = await new Request(baseUrl, { 'User-Agent': userAgent }).post(
      '/edgeFunctions',
      { name: 'test-function' }
    );
    const received = await response.json();
    assert.strictEqual(received.headers['user-agent'], userAgent);
    assert.strictEqual(received.headers['content-type'], 'application/json');
    assert.deepStrictEqual(JSON.parse(received.body), { name: 'test-function' });
  });

  it('preserves multipart request bodies and boundaries', async () => {
    const form = new FormData();
    form.append('package', Buffer.from('test-package'), 'test.tar.gz');
    const response = await new Request(baseUrl, { 'User-Agent': userAgent }).post(
      '/edgeFunctions/test/packages',
      form
    );
    const received = await response.json();
    assert.strictEqual(received.headers['user-agent'], userAgent);
    assert.ok(received.headers['content-type'].includes(form.getBoundary()));
    assert.ok(received.body.includes('test-package'));
  });

  it('passes the host identity through the Cloud Manager client', async () => {
    const client = new Cloudmanager(baseUrl, 'test-key', 'test-org', 'test-token', userAgent);
    const response = await client._cloudManagerClient.get('/programs');
    const received = await response.json();
    assert.strictEqual(received.headers['user-agent'], userAgent);
    assert.strictEqual(received.headers['x-api-key'], 'test-key');
    assert.strictEqual(received.headers['x-gw-ims-org-id'], 'test-org');
    assert.strictEqual(received.headers.authorization, 'Bearer test-token');
  });
});
