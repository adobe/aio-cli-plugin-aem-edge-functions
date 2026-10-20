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
const { Flags } = require('@oclif/core');
const { Request } = require('../../../libs/request');

class ListCommand extends BaseCommand {
  static description = 'List Edge Functions configured for the current environment.';

  static flags = {
    debug: Flags.boolean({
      char: 'd',
      description: 'Show debug information including API endpoint',
      default: false
    })
  };

  static examples = ['$ aio aem edge-functions list', '$ aio aem edge-functions list --debug'];

  async run() {
    // Get access token and detect stage
    const { accessToken, isStage } = await this.getAccessTokenAndStage();

    if (!accessToken) {
      this.error('No access token available. Please authenticate first.');
    }

    const basePath = this.getApiBasePath(isStage);
    if (!basePath) {
      this.error('API endpoint not configured. Run "aio aem edge-functions setup" first.');
    }

    if (this.flags.debug) {
      console.log(`Using API endpoint: ${basePath}/edgeFunctions`);
    }

    const request = new Request(basePath, {
      'User-Agent': this.getUserAgent(),
      Authorization: `Bearer ${accessToken}`
    });

    console.log(chalk.bold('\nEdge Functions for current environment:\n'));

    this.spinnerStart('Fetching Edge Functions...');

    try {
      const response = await request.get('/edgeFunctions');

      this.spinnerStop();

      if (response.ok) {
        let result;
        try {
          result = await response.json();
        } catch {
          result = null;
        }

        const items = (result?.items || []).sort((a, b) =>
          (a.edgeFunctionName || '').localeCompare(b.edgeFunctionName || '')
        );

        if (items.length === 0) {
          console.log(chalk.yellow('No Edge Functions found for this environment.'));
          console.log(
            chalk.dim('Deploy an Edge Function first — see "aio aem edge-functions deploy --help".')
          );
          return;
        }

        // Column order: NAME, CREATED, UPDATED, ACTIVE_PACKAGE (optional last)
        const headers = {
          edgeFunctionName: 'NAME',
          createdAt: 'CREATED',
          updatedAt: 'UPDATED',
          activePackageId: 'ACTIVE_PACKAGE'
        };

        const rows = items.map((item) => ({
          edgeFunctionName: item.edgeFunctionName || '-',
          createdAt: item.createdAt ? this.formatDate(item.createdAt) : '-',
          updatedAt: item.updatedAt ? this.formatDate(item.updatedAt) : '-',
          activePackageId: item.activePackageId || '-'
        }));

        const cols = Object.keys(headers);
        const widths = {};
        for (const col of cols) {
          widths[col] = Math.max(headers[col].length, ...rows.map((row) => row[col].length));
        }

        // Print header
        const headerLine = cols.map((col) => headers[col].padEnd(widths[col])).join('    ');
        console.log(chalk.bold(headerLine));

        // Print rows
        for (const row of rows) {
          const line = cols.map((col) => row[col].padEnd(widths[col])).join('    ');
          console.log(line);
        }

        console.log(chalk.dim(`\n${items.length} Edge Function(s) found.`));
      } else {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = null;
        }
        const errorMessage =
          errorBody?.detail || errorBody?.error || `HTTP ${response.status} ${response.statusText}`;
        const requestId = response.headers?.get('x-request-id');
        const requestIdInfo = requestId ? ` (request-id: ${requestId})` : '';
        this.error(`Failed to list Edge Functions: ${errorMessage}${requestIdInfo}`);
      }
    } catch (error) {
      this.spinnerStop();
      this.error(`Failed to list Edge Functions: ${error.message}`);
    }
  }

  /**
   * Format an ISO date string to a human-readable local format.
   * @param {string} isoDate ISO 8601 date string
   * @returns {string} Formatted date string (YYYY-MM-DD HH:MM:SS)
   */
  formatDate(isoDate) {
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return isoDate;
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
}

module.exports = ListCommand;
