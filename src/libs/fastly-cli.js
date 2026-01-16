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

const { execFileSync } = require('child_process');

class FastlyCli {
  constructor(token, apiEndpoint) {
    this.fastlyCliPath = null;
    this.apiToken = token ?? process.env.AEM_COMPUTE_TOKEN;
    this.apiEndpoint =
      apiEndpoint ||
      process.env.AEM_COMPUTE_API_ENDPOINT ||
      'https://api-fastly.adobeaemcloud.com/';
  }

  async init() {
    const fastly = await import('@fastly/cli');
    this.fastlyCliPath = fastly.default;
  }

  ensureTokenIsSet() {
    if (!this.apiToken) {
      throw new Error('AEM_COMPUTE_TOKEN is not set');
    }
  }

  ensureServiceIdIsSafe(serviceId) {
    if (!serviceId || !/^[0-9a-zA-Z_-]+$/.test(serviceId)) {
      throw new Error(
        'Service ID must contain only alphanumeric characters, underscores, and hyphens'
      );
    }
  }

  async run(args) {
    if (!this.fastlyCliPath) {
      await this.init();
    }
    const options = {
      stdio: 'inherit',
      env: {
        ...process.env,
        FASTLY_API_TOKEN: this.apiToken,
        FASTLY_API_ENDPOINT: this.apiEndpoint
      }
    };
    execFileSync(this.fastlyCliPath, args, options);
  }

  async build() {
    await this.run(['compute', 'build', '--include-source']);
  }

  async deploy(serviceId) {
    this.ensureTokenIsSet();
    this.ensureServiceIdIsSafe(serviceId);
    await this.run(['compute', 'deploy', '--service-id', serviceId]);
  }

  async serve() {
    await this.run(['compute', 'serve']);
  }

  async logTail(serviceId) {
    this.ensureTokenIsSet();
    this.ensureServiceIdIsSafe(serviceId);
    await this.run(['log-tail', '--service-id', serviceId]);
  }
}

module.exports = FastlyCli;
