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

const BaseCommand = require('../../../libs/base-command');
const chalk = require('chalk').default;
const { Args, Flags } = require('@oclif/core');
const { Request } = require('../../../libs/request');

class PackageCommand extends BaseCommand {
  static description = 'Get details of a specific deployed Edge Function package.';

  static args = {
    serviceId: Args.string({
      description: 'AEM Edge Function name',
      required: true
    }),
    packageId: Args.string({
      description: 'Package ID',
      required: true
    })
  };

  static flags = {
    debug: Flags.boolean({
      char: 'd',
      description: 'Show debug information',
      default: false
    })
  };

  static examples = ['$ aio aem edge-functions package my-function 42'];

  async run() {
    const { accessToken, isStage } = await this.getAccessTokenAndStage();
    if (!accessToken) {
      this.error('No access token available. Please authenticate first.');
    }

    const basePath = this.getApiBasePath(isStage);
    if (!basePath) {
      this.error('API endpoint not configured. Run "aio aem edge-functions setup" first.');
    }

    const { serviceId: edgeFunctionName, packageId } = this.args;
    const apiPath = `/edgeFunctions/${edgeFunctionName}/packages/${packageId}`;

    if (this.flags.debug) {
      console.log(`Using API endpoint: ${basePath}${apiPath}`);
    }

    const request = new Request(basePath, { Authorization: `Bearer ${accessToken}` });
    this.spinnerStart('Fetching package...');
    let response;
    try {
      response = await request.get(apiPath);
    } finally {
      this.spinnerStop();
    }

    if (!response.ok) {
      let errorBody;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = null;
      }
      const errorMessage = errorBody?.detail || errorBody?.title || `HTTP ${response.status}`;
      const requestId = response.headers?.get('x-request-id');
      const requestIdInfo = requestId ? ` (request-id: ${requestId})` : '';
      this.error(
        `Failed to get package '${packageId}' for '${edgeFunctionName}': ${errorMessage}${requestIdInfo}`
      );
    }

    const pkg = await response.json();

    const status = pkg.active ? chalk.green('active') : chalk.dim('inactive');
    const nameDisplay = pkg.name || edgeFunctionName;
    const descDisplay = pkg.description ? chalk.dim(` — ${pkg.description}`) : '';
    console.log(`\n${chalk.bold(nameDisplay)}${descDisplay}  ${status}`);
    console.log('');
    console.log(`  ID        ${pkg.id}`);
    if (pkg.size != null) console.log(`  Size      ${(pkg.size / 1024).toFixed(1)} KB`);
    if (pkg.createdAt) console.log(`  Deployed  ${this.formatDate(pkg.createdAt)}`);
    if (pkg.filesHash) console.log(`  Hash      ${pkg.filesHash}`);
    console.log('');
  }

  formatDate(isoDate) {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return isoDate;
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
}

module.exports = PackageCommand;
