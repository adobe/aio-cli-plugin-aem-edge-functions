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

const { version } = require('../../package.json');

/**
 * Build a request identity from the running host, not a separately installed AIO package.
 * @param {object} [config] oclif host configuration.
 * @returns {string} User-agent containing Node.js, plugin and, when hosted by AIO, CLI versions.
 */
function getUserAgent(config) {
  const plugin = `aio-cli-plugin-aem-edge-functions/${version} node/${process.versions.node}`;
  return config?.name === '@adobe/aio-cli' && config.version
    ? `aio/${config.version} ${plugin}`
    : plugin;
}

module.exports = { getUserAgent };
