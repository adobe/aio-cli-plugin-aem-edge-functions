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

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Patterns for lines that should be hidden from customers because they
 * expose internal Fastly details irrelevant in the AEM Edge Functions context.
 * Matching is done against the plain text (ANSI codes stripped).
 */
const OUTPUT_FILTERS = [
  // "Manage this service at:" block with the manage.fastly.com URL
  /^Manage this service at:$/,
  /^\thttps:\/\/manage\.fastly\.com\//,
  // "A new version of the Fastly CLI is available" upgrade notice
  /^A new version of the Fastly CLI is available/,
  /^Current version:/,
  /^Latest version:/,
  /^Run `fastly update`/,
  // Release notes / upgrade review notice
  /^Note: Please review the release notes/,
  /^Version \d+\.\d+\.\d+:/,
  // Fastly CLI bug report prompt
  /^If you believe this error is the result of a bug, please file an issue:/
];

const VIEW_SERVICE_URL_RE = /^\thttps:\/\/.*\.adobeaemcloud\.com/;
const VIEW_SERVICE_WARNING =
  '\nWarning: this url is only for debugging, do not use it in production as it can change at any time.\n';
const VIEW_SERVICE_WARNING_DEBUG =
  '\nWarning: the direct edge function url is only for debugging, do not use it in production as it can change at any time.\n';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Spinner intermediate frame pattern.  When stdout is not a TTY the
 * Fastly CLI prints each spinner frame as a separate line, e.g.
 * "| Uploading package..." or "/ Activating service (version 31)...".
 */
const SPINNER_FRAME_RE = /^[|/\\\-] .+\.\.\.$/;

function stripAnsi(str) {
  return str.replace(ANSI_RE, '');
}

function shouldFilterLine(line) {
  const plain = stripAnsi(line);
  return OUTPUT_FILTERS.some((pattern) => pattern.test(plain)) || SPINNER_FRAME_RE.test(plain);
}

/**
 * Return fastly.toml contents with [scripts.build] set to `buildCmd` (replacing any existing
 * build line, else adding one, else creating a [scripts] table). Used on a throwaway COPY of the
 * manifest for an AOT build — the customer's fastly.toml is never modified.
 */
function withBuildScript(toml, buildCmd) {
  const buildLine = `  build = "${buildCmd}"`;
  const lines = toml.split('\n');
  let inScripts = false;
  let scriptsHeaderIdx = -1;
  let buildLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const section = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      inScripts = section[1].trim() === 'scripts';
      if (inScripts) scriptsHeaderIdx = i;
      continue;
    }
    if (inScripts && /^\s*build\s*=/.test(lines[i])) buildLineIdx = i;
  }
  if (buildLineIdx >= 0) {
    lines[buildLineIdx] = buildLine;
    return lines.join('\n');
  }
  if (scriptsHeaderIdx >= 0) {
    lines.splice(scriptsHeaderIdx + 1, 0, buildLine);
    return lines.join('\n');
  }
  const sep = toml.endsWith('\n') ? '' : '\n';
  return `${toml}${sep}\n[scripts]\n${buildLine}\n`;
}

/**
 * True if fastly.toml's [scripts.build] already enables AOT (`--enable-aot`). Used to respect a
 * committed AOT decision: when present, build the project as-is without modifying anything.
 */
function buildScriptHasAot(toml) {
  const lines = toml.split('\n');
  let inScripts = false;
  for (const line of lines) {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) {
      inScripts = section[1].trim() === 'scripts';
      continue;
    }
    if (inScripts && /^\s*build\s*=/.test(line) && line.includes('--enable-aot')) {
      return true;
    }
  }
  return false;
}

/**
 * Colorize the output to restore the green checkmarks that the Fastly
 * CLI would normally emit when writing to a TTY.  The ✓ character
 * becomes green (\x1b[32m✓\x1b[0m) and SUCCESS: becomes bold green.
 */
function colorize(line) {
  const plain = stripAnsi(line);
  // Don't double-colorize if ANSI codes are already present
  if (line !== plain) {
    return line;
  }
  line = line.replace(/✓/g, '\x1b[32m✓\x1b[0m');
  line = line.replace(/^(SUCCESS:)/, '\x1b[32m$1\x1b[0m');
  line = line.replace(/^(ERROR:)/, '\x1b[31m$1\x1b[0m');
  return line;
}

/**
 * Filter a complete output string by removing lines that match
 * OUTPUT_FILTERS / SPINNER_FRAME_RE and collapsing excessive blank lines.
 * Also re-applies terminal colors lost due to piping.
 */
function filterOutput(data) {
  const lines = data.split('\n');
  const filtered = lines.filter((line) => !shouldFilterLine(line));
  const result = [];
  for (const line of filtered) {
    if (line.trim() === '' && result.length > 0 && result[result.length - 1].trim() === '') {
      continue;
    }
    result.push(colorize(line));
    if (VIEW_SERVICE_URL_RE.test(stripAnsi(line))) {
      result.push(colorize(VIEW_SERVICE_WARNING));
    }
  }
  return result.join('\n');
}

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

  /**
   * Validate the service name against the Edge Functions configuration constraints.
   * Must be 1-30 lowercase alphanumeric/hyphen chars, starting with a letter, not ending with a hyphen.
   * This limit ensures the resulting backend hostname stays within the 63-octet DNS label limit
   * per RFC 1035, Section 3.1.
   */
  ensureServiceIdIsSafe(serviceId) {
    const SERVICE_NAME_PATTERN = /^[a-z]([a-z0-9-]{0,28}[a-z0-9])?$/;
    if (!serviceId || !SERVICE_NAME_PATTERN.test(serviceId)) {
      throw new Error(
        `Invalid service name: '${serviceId}'. ` +
          'Service name must be 1-30 characters long, start with a lowercase letter, ' +
          'end with a lowercase letter or digit, and contain only lowercase letters, digits, and hyphens.'
      );
    }
  }

  async run(args, { filterOutput: shouldFilter = false, debug = false } = {}) {
    if (!this.fastlyCliPath) {
      await this.init();
    }

    // print API endpoint only in explicit debug mode
    if (debug) {
      console.log(`Using API endpoint: ${this.apiEndpoint}`);
    }

    const env = {
      ...process.env,
      FASTLY_API_TOKEN: this.apiToken,
      FASTLY_API_ENDPOINT: this.apiEndpoint
    };

    if (!shouldFilter) {
      execFileSync(this.fastlyCliPath, args, { stdio: 'inherit', env });
      return '';
    }

    // Pipe stdout/stderr to filter or capture the output. This means the
    // child process loses TTY detection (no colors, no live spinners).
    // When filtering, we compensate with our own spinner + re-colorization.
    let spinner;
    if (shouldFilter) {
      const ora = require('ora-classic');
      spinner = ora({ text: 'Deploying...', color: 'cyan' }).start();
    }

    return new Promise((resolve, reject) => {
      const child = spawn(this.fastlyCliPath, args, {
        env,
        stdio: ['inherit', 'pipe', 'pipe']
      });

      const stdoutChunks = [];
      const stderrChunks = [];

      child.stdout.on('data', (chunk) => stdoutChunks.push(chunk.toString()));
      child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));

      child.on('close', (code) => {
        if (spinner) spinner.stop();

        const stdout = stdoutChunks.join('');
        const stderr = stderrChunks.join('');

        if (stdout) {
          process.stdout.write(shouldFilter ? filterOutput(stdout) : stdout);
        }
        if (stderr) {
          const out = shouldFilter ? filterOutput(stderr) : stderr;
          if (out.trim()) {
            process.stderr.write(out);
          }
        }

        if (code !== 0) {
          reject(new Error(`Fastly CLI exited with code ${code}`));
        } else {
          resolve(stdout);
        }
      });

      child.on('error', (err) => {
        if (spinner) spinner.stop();
        reject(err);
      });
    });
  }

  async build({ aot = false, saveAot = false } = {}) {
    if (!aot) {
      // If fastly.toml already configures AOT (e.g. a prior --save-aot that was committed, or added
      // by hand), the build uses it even without --aot. Surface that so it is not a surprise.
      const manifestPath = path.join(process.cwd(), 'fastly.toml');
      if (fs.existsSync(manifestPath) && buildScriptHasAot(fs.readFileSync(manifestPath, 'utf8'))) {
        console.warn(
          'Note: fastly.toml configures AOT compilation (--enable-aot in [scripts.build]), so this ' +
            'build uses AOT even though --aot was not passed. Remove it from fastly.toml if you did ' +
            'not intend this.'
        );
      }
      await this.run(['compute', 'build', '--include-source']);
      return;
    }

    // AOT is opt-in and must keep every normal build feature (notably --include-source).
    // `--enable-aot` is a js-compute-runtime flag with no `fastly compute build` passthrough, so it
    // can only reach the compiler via the project's [scripts.build].
    const projectDir = process.cwd();
    const srcDir = path.join(projectDir, 'src');
    const nodeModules = path.join(projectDir, 'node_modules');
    const manifestPath = path.join(projectDir, 'fastly.toml');
    if (!fs.existsSync(path.join(nodeModules, '.bin', 'js-compute-runtime'))) {
      throw new Error(
        "--aot: js-compute-runtime not found in node_modules. Run 'npm install' in the project first."
      );
    }
    if (!fs.existsSync(srcDir) || !fs.existsSync(manifestPath)) {
      throw new Error(
        `--aot: expected a standard project layout (src/ and fastly.toml) in ${projectDir}. ` +
          'For a custom layout, add --enable-aot to your build script and build without --aot.'
      );
    }

    const manifest = fs.readFileSync(manifestPath, 'utf8');
    // Reference js-compute-runtime by relative path: `fastly compute build` runs an explicit
    // [scripts.build] via `sh` without node_modules/.bin on PATH, so a bare `js-compute-runtime`
    // would not resolve. The path resolves against the build's working directory (the temp dir in
    // default mode — where node_modules is symlinked — or the project dir in --save-aot mode).
    const aotBuild =
      './node_modules/.bin/js-compute-runtime --enable-aot ./src/index.js ./bin/main.wasm';

    // Respect a committed decision: if fastly.toml already carries an AOT build script, build it
    // as-is without modifying anything or using a temporary directory.
    if (buildScriptHasAot(manifest)) {
      console.log('fastly.toml already configures AOT (--enable-aot); building as-is.');
      await this.run(['compute', 'build', '--include-source']);
      return;
    }

    // AOT here is driven by the plugin (not a committed fastly.toml script); flag it as an
    // experimental plugin feature so symlink/Windows quirks are easier to attribute.
    console.warn(
      'Note: AOT is an experimental feature of this plugin. If the build fails (for example a ' +
        'symlink or Windows issue), that is the likely cause — rebuild without --aot to fall back.'
    );

    if (saveAot) {
      // --save-aot: persist the AOT build script into fastly.toml and build in place. No backup
      // file — it is a normal edit the customer commits (and reverts with git). The manifest is
      // left modified so subsequent builds and CI/CD use AOT.
      fs.writeFileSync(manifestPath, withBuildScript(manifest, aotBuild), 'utf8');
      console.log(
        'Building with AOT compilation (--enable-aot); added the AOT build script to fastly.toml.'
      );
      await this.run(['compute', 'build', '--include-source']);
      console.log(
        'fastly.toml now contains the AOT build script — commit it to keep AOT (git to revert).'
      );
      return;
    }

    // Default mode: build in a throwaway directory whose fastly.toml is a COPY carrying the AOT
    // [scripts.build]; src/ and package.json are copied and node_modules is symlinked so the build
    // resolves normally. The customer's project (including fastly.toml) is never modified; the
    // resulting package is copied back to pkg/.
    const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aem-ef-aot-'));
    try {
      fs.writeFileSync(
        path.join(buildDir, 'fastly.toml'),
        withBuildScript(manifest, aotBuild),
        'utf8'
      );
      fs.cpSync(srcDir, path.join(buildDir, 'src'), { recursive: true });
      const pkgJson = path.join(projectDir, 'package.json');
      if (fs.existsSync(pkgJson)) {
        fs.copyFileSync(pkgJson, path.join(buildDir, 'package.json'));
      }
      fs.symlinkSync(nodeModules, path.join(buildDir, 'node_modules'), 'dir');
      fs.mkdirSync(path.join(buildDir, 'bin'), { recursive: true });

      console.log('Building with AOT compilation (--enable-aot) in a temporary directory...');
      await this.run(['compute', 'build', '--include-source', '-C', buildDir]);

      const builtPkgDir = path.join(buildDir, 'pkg');
      const built = fs.existsSync(builtPkgDir)
        ? fs.readdirSync(builtPkgDir).filter((f) => f.endsWith('.tar.gz'))
        : [];
      if (built.length === 0) {
        throw new Error('--aot: build did not produce a package under pkg/.');
      }
      const destPkgDir = path.join(projectDir, 'pkg');
      fs.mkdirSync(destPkgDir, { recursive: true });
      for (const f of built) {
        fs.copyFileSync(path.join(builtPkgDir, f), path.join(destPkgDir, f));
      }
    } finally {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  }

  async deploy(serviceId, { debug = false } = {}) {
    this.ensureTokenIsSet();
    this.ensureServiceIdIsSafe(serviceId);
    await this.run(['compute', 'deploy', '--service-id', serviceId], {
      filterOutput: !debug,
      debug
    });
    if (debug) {
      console.log(VIEW_SERVICE_WARNING_DEBUG);
    }
  }

  async serve({ watch = false } = {}) {
    // Match build's --include-source so serving before a deploy doesn't leave
    // a source-less package in pkg/ (the deployed package stays debuggable).
    const args = ['compute', 'serve', '--include-source'];
    if (watch) {
      args.push('--watch');
    }
    await this.run(args);
  }

  async logTail(serviceId, { debug = false, timestamps = false } = {}) {
    this.ensureTokenIsSet();
    this.ensureServiceIdIsSafe(serviceId);
    const args = ['log-tail', '--service-id', serviceId];
    if (timestamps) {
      // Prefix each record with its request_start_us timestamp (RFC3339 UTC).
      // The timestamp comes from the record metadata, not the message, so it
      // applies to every line — both function-emitted and platform-emitted.
      args.push('--timestamps');
    }
    await this.run(args, { debug });
  }
}

module.exports = FastlyCli;
module.exports.filterOutput = filterOutput;
module.exports.shouldFilterLine = shouldFilterLine;
module.exports.withBuildScript = withBuildScript;
module.exports.buildScriptHasAot = buildScriptHasAot;
