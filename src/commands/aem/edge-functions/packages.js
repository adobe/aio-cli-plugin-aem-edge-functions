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

class PackagesCommand extends BaseCommand {
  static description = 'List deployed packages for an AEM Edge Function.';

  static args = {
    serviceId: Args.string({
      description: 'AEM Edge Function name',
      required: true
    })
  };

  static flags = {
    debug: Flags.boolean({
      char: 'd',
      description: 'Show debug information',
      default: false
    }),
    limit: Flags.integer({
      char: 'l',
      description: 'Maximum number of packages to return'
    }),
    cursor: Flags.string({
      char: 'c',
      description: 'Pagination cursor from a previous response'
    })
  };

  static examples = [
    '$ aio aem edge-functions packages my-function',
    '$ aio aem edge-functions packages my-function --limit 5',
    '$ aio aem edge-functions packages my-function --cursor <cursor>'
  ];

  async run() {
    const { accessToken, isStage } = await this.getAccessTokenAndStage();
    if (!accessToken) {
      this.error('No access token available. Please authenticate first.');
    }

    const basePath = this.getApiBasePath(isStage);
    if (!basePath) {
      this.error('API endpoint not configured. Run "aio aem edge-functions setup" first.');
    }

    const edgeFunctionName = this.args.serviceId;
    const params = new URLSearchParams();
    if (this.flags.limit != null) params.set('limit', this.flags.limit);
    if (this.flags.cursor) params.set('cursor', this.flags.cursor);
    const query = params.size > 0 ? `?${params}` : '';
    const apiPath = `/edgeFunctions/${edgeFunctionName}/packages${query}`;

    if (this.flags.debug) {
      console.log(`Using API endpoint: ${basePath}${apiPath}`);
    }

    const request = new Request(basePath, { Authorization: `Bearer ${accessToken}` });
    this.spinnerStart('Fetching packages...');
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
        `Failed to list packages for '${edgeFunctionName}': ${errorMessage}${requestIdInfo}`
      );
    }

    const result = await response.json();
    const items = result.items || [];

    if (items.length === 0) {
      console.log(chalk.yellow(`\nNo packages found for '${edgeFunctionName}'.`));
      return;
    }

    const headers = { packageId: 'ID', active: 'ACTIVE', createdAt: 'CREATED' };
    const rows = items.map((item) => ({
      packageId: item.packageId || '-',
      active: item.active ? 'yes' : '-',
      createdAt: item.createdAt ? this.formatDate(item.createdAt) : '-'
    }));

    const cols = Object.keys(headers);
    const widths = {};
    for (const col of cols) {
      widths[col] = Math.max(headers[col].length, ...rows.map((row) => row[col].length));
    }

    console.log('');
    console.log(chalk.bold(cols.map((col) => headers[col].padEnd(widths[col])).join('    ')));
    for (const row of rows) {
      const line = cols.map((col) => row[col].padEnd(widths[col])).join('    ');
      console.log(row.active === 'yes' ? chalk.bold(line) : line);
    }

    console.log(chalk.dim(`\n${items.length} package(s).`));
    if (result.cursor) {
      console.log(chalk.dim(`Next page: --cursor ${result.cursor}`));
    }
  }

  formatDate(isoDate) {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return isoDate;
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
}

module.exports = PackagesCommand;
