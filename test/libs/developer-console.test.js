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
const { DeveloperConsole } = require('../../src/libs/developer-console');

describe('DeveloperConsole', function () {
  describe('#constructor', function () {
    it('should create a DeveloperConsole instance', function () {
      const devConsole = new DeveloperConsole('org123', 'apiKey123', 'token123');
      assert.ok(devConsole);
      assert.strictEqual(devConsole.orgId, 'org123');
      assert.strictEqual(devConsole.apiKey, 'apiKey123');
      assert.strictEqual(devConsole.accessToken, 'token123');
    });
  });

  describe('#listProjects', function () {
    it('should return an empty array on error', async function () {
      const devConsole = new DeveloperConsole('org123', 'invalidKey', 'invalidToken');
      const projects = await devConsole.listProjects();
      assert.ok(Array.isArray(projects));
    });
  });

  describe('#listWorkspaces', function () {
    it('should return an empty array on error', async function () {
      const devConsole = new DeveloperConsole('org123', 'invalidKey', 'invalidToken');
      const workspaces = await devConsole.listWorkspaces('project123');
      assert.ok(Array.isArray(workspaces));
    });
  });
});
