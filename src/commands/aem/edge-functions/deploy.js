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

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const BaseCommand = require('../../../libs/base-command');
const { Args, Flags } = require('@oclif/core');
const FormData = require('form-data');
const networking = require('@adobe/aio-lib-core-networking');
const ora = require('ora-classic');
const chalk = require('chalk');

const SERVICE_NAME_PATTERN = /^[a-z]([a-z0-9-]{0,28}[a-z0-9])?$/;

class DeployCommand extends BaseCommand {
  static description = 'Deploy your code to your AEM edge function.';
  static args = {
    serviceId: Args.string({
      description: 'AEM Edge Function name (e.g. my-service)',
      required: true
    })
  };
  static flags = {
    debug: Flags.boolean({
      char: 'd',
      description: 'Show debug information',
      default: false
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Deploy even if the package hash has not changed',
      default: false
    }),
    package: Flags.string({
      char: 'p',
      description: 'Path to a pre-built .tar.gz package to deploy (skips the pkg/ auto-detect)'
    }),
    legacy: Flags.boolean({
      description: 'Use the legacy deploy path',
      default: false
    })
  };

  async run() {
    if (this.flags.legacy) {
      const fastly = await this.getFastlyCli();
      await fastly.deploy(this.args.serviceId, { debug: this.flags.debug });
      return;
    }

    const edgeFunctionName = this.args.serviceId;

    if (!SERVICE_NAME_PATTERN.test(edgeFunctionName)) {
      this.error(
        `Invalid service name: '${edgeFunctionName}'. ` +
          'Service name must be 1-30 characters long, start with a lowercase letter, ' +
          'end with a lowercase letter or digit, and contain only lowercase letters, digits, and hyphens.'
      );
    }

    let packageFile = this.flags.package;
    if (!packageFile) {
      const pkgDir = path.join(process.cwd(), 'pkg');
      const packages = fs.existsSync(pkgDir)
        ? fs.readdirSync(pkgDir).filter((f) => f.endsWith('.tar.gz'))
        : [];
      if (packages.length === 0) {
        this.error(
          'No package found in pkg/. Run `aio aem edge-functions build` first, or use --package to specify a package file.'
        );
      }
      if (packages.length > 1) {
        this.error(
          `Multiple packages found in pkg/: ${packages.join(', ')}. Use --package to specify the package to deploy.`
        );
      }
      packageFile = path.join(pkgDir, packages[0]);
    }

    const { accessToken, isStage } = await this.getAccessTokenAndStage();
    if (!accessToken) {
      this.error('No access token available. Please authenticate first.');
    }

    const basePath = this.getApiBasePath(isStage);
    if (!basePath) {
      this.error('API endpoint not configured. Run "aio aem edge-functions setup" first.');
    }

    const packageSize = fs.statSync(packageFile).size;
    const packageSizeMb = (packageSize / (1024 * 1024)).toFixed(2);
    console.log(
      `\nDeploying ${chalk.bold(edgeFunctionName)} — ${path.basename(packageFile)} (${packageSizeMb} MB)\n`
    );

    // Advisory: a package built without --include-source ships only the compiled
    // wasm + manifest, so the deployed function can't be debugged from its
    // sources. `aio aem edge-functions build` always includes source; warn when
    // deploying a package (e.g. via --package) that doesn't. Never blocks.
    try {
      if (!this.packageHasSource(packageFile)) {
        console.log(
          chalk.yellow(
            'Warning: this package has no src/ (built without --include-source). ' +
              'The deployed function cannot be debugged from its sources — build with ' +
              '`aio aem edge-functions build` (which includes source) before deploying.\n'
          )
        );
      }
    } catch {
      // advisory only — never block the deploy on the source check
    }

    const url = `${basePath}/edgeFunctions/${edgeFunctionName}/packages`;
    if (this.flags.debug) {
      console.log(`  Endpoint: ${url}\n`);
    }

    let debugDomain = null;

    if (!this.flags.force) {
      const localHash = this.computePackageHash(packageFile, this.flags.debug);
      if (this.flags.debug) {
        console.log(`  Local hash:  ${localHash}\n`);
      }
      const efData = await this.fetchEdgeFunction(edgeFunctionName, basePath, accessToken);
      debugDomain = efData?.debugDomain ?? null;
      if (this.isUpToDate(efData, localHash, this.flags.debug)) {
        console.log(
          `${chalk.green('✓')} Already up to date — use ${chalk.bold('--force')} to redeploy.`
        );
        return;
      }
    }

    const form = new FormData();
    form.append('package', fs.createReadStream(packageFile), { knownLength: packageSize });

    const spinner = ora({ text: 'Uploading and activating...', color: 'cyan' }).start();
    let response;
    try {
      const fetch = networking.createFetch();
      response = await fetch(url, {
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          'Content-Length': form.getLengthSync(),
          Authorization: `Bearer ${accessToken}`
        },
        body: form
      });
    } finally {
      spinner.stop();
    }

    if (!response.ok) {
      let errorMessage;
      try {
        const problem = await response.json();
        errorMessage = problem.detail || problem.title || `HTTP ${response.status}`;
      } catch {
        errorMessage = `HTTP ${response.status}`;
      }
      const requestId = response.headers?.get('x-request-id');
      const requestIdInfo = requestId ? ` (request-id: ${requestId})` : '';
      this.error(`Failed to deploy '${edgeFunctionName}': ${errorMessage}${requestIdInfo}`);
    }

    const result = await response.json();

    const displayName = result.name || edgeFunctionName;
    const descriptionSuffix = result.description ? chalk.dim(` — ${result.description}`) : '';
    console.log(`${chalk.green('✓')} Deployed ${chalk.bold(displayName)}${descriptionSuffix}`);

    const meta = [`package ${result.id}`];
    if (result.size != null) meta.push(`${(result.size / 1024).toFixed(1)} KB`);
    if (result.createdAt) meta.push(`activated ${new Date(result.createdAt).toLocaleString()}`);
    console.log(chalk.dim(`  ${meta.join(' · ')}`));

    if (this.flags.force) {
      const efData = await this.fetchEdgeFunction(edgeFunctionName, basePath, accessToken);
      debugDomain = efData?.debugDomain ?? null;
    }

    if (debugDomain) {
      console.log(`\nView this edge function at:\n    ${chalk.cyan(`https://${debugDomain}`)}`);
      console.log(
        chalk.yellow(
          '\nWarning: This URL is only for debugging, do not use it in production as it can change at any time.'
        )
      );
    }
  }

  async fetchEdgeFunction(edgeFunctionName, basePath, accessToken) {
    try {
      const fetch = networking.createFetch();
      const res = await fetch(`${basePath}/edgeFunctions/${edgeFunctionName}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Best-effort check whether a tar.gz package includes source (a src/ directory).
   * Built without `--include-source`, a package ships only bin/main.wasm + the
   * manifest, which cannot be debugged from its sources. Walks the tar headers the
   * same way computePackageHash does; returns true on the first src/ path seen.
   */
  packageHasSource(tarGzPath) {
    const tar = zlib.gunzipSync(fs.readFileSync(tarGzPath));
    let offset = 0;
    while (offset + 512 <= tar.length) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every((b) => b === 0)) break;

      const nameEnd = header.indexOf(0, 0);
      const name = header.subarray(0, nameEnd < 0 ? 100 : Math.min(nameEnd, 100)).toString('utf8');
      const size =
        parseInt(header.subarray(124, 136).toString('utf8').trim().replace(/\0/g, ''), 8) || 0;

      if (/(^|\/)src\//.test(name)) return true;
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    return false;
  }

  /**
   * Compute the SHA-512 hash of a tar.gz package by hashing the concatenated contents
   * of all regular files inside the archive, sorted lexicographically by filename.
   * This matches the algorithm used by the CDN API to produce the `filesHash` field.
   */
  computePackageHash(tarGzPath, debug = false) {
    const tar = zlib.gunzipSync(fs.readFileSync(tarGzPath));
    const files = [];
    let offset = 0;

    while (offset + 512 <= tar.length) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every((b) => b === 0)) break;

      const nameEnd = header.indexOf(0, 0);
      const name = header.subarray(0, nameEnd < 0 ? 100 : Math.min(nameEnd, 100)).toString('utf8');
      const size =
        parseInt(header.subarray(124, 136).toString('utf8').trim().replace(/\0/g, ''), 8) || 0;
      const typeFlag = header[156];
      offset += 512;

      // Type '0' (0x30) or NUL = regular file
      if ((typeFlag === 0x30 || typeFlag === 0) && size > 0 && name) {
        files.push({ name, content: tar.subarray(offset, offset + size) });
      }
      offset += Math.ceil(size / 512) * 512;
    }

    if (debug) {
      console.log(`  Archive contains ${files.length} file(s):`);
      for (const { name, content } of files) {
        console.log(`    ${name} (${content.length} bytes)`);
      }
    }

    files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const hash = crypto.createHash('sha512');
    for (const { content } of files) hash.update(content);
    return hash.digest('hex');
  }

  isUpToDate(efData, localHash, debug = false) {
    if (!efData) {
      if (debug) console.log('  Hash check: no edge function data — proceeding with upload');
      return false;
    }
    const { activePackage } = efData;
    const filesHash = activePackage?.filesHash;
    if (debug) {
      console.log(`  Hash check: activePackage.id = ${activePackage?.id ?? '(none)'}`);
      console.log(`  Remote hash: ${filesHash ?? '(none)'}`);
      console.log(`  Match: ${filesHash === localHash}`);
    }
    return filesHash != null && filesHash === localHash;
  }
}

module.exports = DeployCommand;
