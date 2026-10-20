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

class PurgeCacheCommand extends BaseCommand {
  static description = `Purge cached content for an AEM Edge Function.

Supports purging by surrogate key(s) or purging all cached content.
By default performs a hard purge (immediate removal). Use --soft for soft purge
(stale entries retained, reducing origin load while enabling stale revalidation).`;

  static args = {
    serviceId: Args.string({
      description: 'AEM Edge Function name (e.g. my-service)',
      required: true
    })
  };

  static flags = {
    surrogateKey: Flags.string({
      char: 'k',
      description: 'Surrogate key to purge (can be specified multiple times)',
      multiple: true
    }),
    all: Flags.boolean({
      char: 'a',
      description: 'Purge all cached content (use with caution)',
      default: false
    }),
    soft: Flags.boolean({
      char: 's',
      description: 'Perform a soft purge (retain stale entries for revalidation)',
      default: false
    }),
    debug: Flags.boolean({
      char: 'd',
      description: 'Show debug information including API endpoint',
      default: false
    })
  };

  static examples = [
    '$ aio aem edge-functions purge-cache my-function --surrogateKey my-page-key',
    '$ aio aem edge-functions purge-cache my-function -k key1 -k key2 --soft',
    '$ aio aem edge-functions purge-cache my-function --all',
    '$ aio aem edge-functions purge-cache my-function --all --soft'
  ];

  async run() {
    const { serviceId } = this.args;
    const { surrogateKey, all, soft } = this.flags;

    // Validate that exactly one purge mode is specified
    const modes = [surrogateKey && surrogateKey.length > 0, all].filter(Boolean);
    if (modes.length === 0) {
      this.error('You must specify one of: --surrogateKey (-k) or --all (-a)');
    }
    if (modes.length > 1) {
      this.error('Only one purge mode can be used at a time: --surrogateKey or --all');
    }

    // Build the request body
    const body = {};
    if (soft) {
      body.soft = true;
    }

    if (all) {
      body.all = true;
    } else if (surrogateKey.length === 1) {
      body.surrogateKey = surrogateKey[0];
    } else {
      body.surrogateKeys = surrogateKey;
    }

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
      console.log(`Using API endpoint: ${basePath}`);
    }

    const request = new Request(basePath, {
      'User-Agent': this.getUserAgent(),
      Authorization: `Bearer ${accessToken}`
    });

    // Describe what we're doing
    let description;
    if (all) {
      description = 'all cached content';
    } else if (surrogateKey.length === 1) {
      description = `surrogate key: ${surrogateKey[0]}`;
    } else {
      description = `surrogate keys: ${surrogateKey.join(', ')}`;
    }

    this.spinnerStart(`Purging ${description} for edge function "${serviceId}"...`);

    try {
      const response = await request.post(
        `/edgeFunctions/${encodeURIComponent(serviceId)}/purge`,
        body
      );

      this.spinnerStop();

      if (response.ok) {
        let result;
        try {
          result = await response.json();
        } catch {
          result = null;
        }
        console.log(chalk.green(`\n✓ Cache purge successful for "${serviceId}"`));
        console.log(`  Mode: ${soft ? 'soft' : 'hard'} purge`);
        console.log(`  Target: ${description}`);
        if (result?.id) {
          console.log(`  Purge ID: ${result.id}`);
        }
        if (result?.items) {
          for (const [key, id] of Object.entries(result.items)) {
            console.log(`  ${key}: ${id}`);
          }
        }
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
        this.error(`Cache purge failed: ${errorMessage}${requestIdInfo}`);
      }
    } catch (error) {
      this.spinnerStop();
      this.error(`Cache purge request failed: ${error.message}`);
    }
  }
}

module.exports = PurgeCacheCommand;
