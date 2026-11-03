/*
 * Copyright 2026 Adobe Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');
const sinon = require('sinon');

const script = require.resolve('../.github/scripts/release');
const execFileSync = childProcess.execFileSync;
const PACKAGE = '@adobe/aio-cli-plugin-aem-edge-functions';
const REPO = 'adobe/aio-cli-plugin-aem-edge-functions';
const notes = '### Fixed\n\n- Fixed a deployment issue (#12).';
const history = '# Changelog\n\n## [1.1.0] - 2026-10-15\n\n### Changed\n\n- Previous release.\n';

describe('release automation', function () {
  this.timeout(15_000);
  let release;
  let sandbox;
  let temp;
  let cwd;
  let mainSha;
  let baseSha;
  let candidate;
  let pr;
  let published;
  let registry;
  let calls;
  let proposal;
  let npmFailure;

  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

  /**
   * Write a fixture as text or formatted JSON.
   * @param {string} file Fixture path.
   * @param {*} content Fixture content.
   */
  function write(file, content) {
    fs.writeFileSync(
      file,
      typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n'
    );
  }

  /**
   * Commit fixture changes and return the SHA.
   * @param {string} message Commit message.
   * @returns {string} Commit SHA.
   */
  function commit(message) {
    git('add', '.');
    git('commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  }

  /**
   * Build a minimal mocked fetch response.
   * @param {*} value JSON response body.
   * @param {number} status HTTP status.
   * @returns {object} Mock response.
   */
  function response(value, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => value };
  }

  /**
   * Submit a proposal through the safe-output fixture.
   * @param {object} value Release proposal.
   */
  function submitProposal(value = proposal) {
    write(process.env.GH_AW_AGENT_OUTPUT, {
      items: [{ type: 'publish_release_proposal', proposal: JSON.stringify(value) }]
    });
    release.propose();
  }

  /**
   * Build metadata for the candidate release.
   * @returns {object} Release metadata.
   */
  function data() {
    return {
      baseSha,
      headSha: candidate,
      baseline: { sha: baseSha, version: '1.1.0' },
      bump: 'patch',
      breaking: false,
      approveBreaking: false,
      date: '2026-10-20',
      notes,
      override: { bump: 'auto', notes: '', approveBreaking: false }
    };
  }

  /**
   * Create the mocked rolling release PR.
   * @param {object} metadata Embedded release metadata.
   */
  function setPr(metadata = data()) {
    pr = {
      number: 42,
      body: `<!-- release-automation ${JSON.stringify(metadata)} -->`,
      head: { sha: candidate, ref: 'automation/release', repo: { full_name: REPO } },
      base: { ref: 'releaseautomation' },
      labels: [{ name: 'release' }],
      draft: false
    };
  }

  /**
   * Simulate GitHub operations against the fixture state.
   * @param {string[]} args CLI arguments.
   * @param {object} options Subprocess options.
   * @returns {string} Mock CLI output.
   */
  function mockGh(args, options) {
    if (args[0] === 'api') {
      if (args.includes('--method')) {
        if (args.some((arg) => arg.endsWith('/check-runs'))) return '{}';
        if (args.some((arg) => arg.endsWith('/git/refs'))) {
          git(
            'tag',
            args[args.indexOf('-f') + 1].slice('ref=refs/tags/'.length),
            pr.merge_commit_sha
          );
          git('push', '-q', 'origin', '--tags');
          return '{}';
        }
      }
      const endpoint = args
        .find((arg) => arg.startsWith(`repos/${REPO}/`))
        .slice(`repos/${REPO}/`.length);
      if (endpoint === 'git/ref/heads/releaseautomation')
        return JSON.stringify({ object: { sha: mainSha } });
      if (endpoint.startsWith('releases?')) return JSON.stringify([published]);
      if (endpoint.startsWith('commits/')) {
        return JSON.stringify(
          pr?.merged && endpoint === `commits/${pr.merge_commit_sha}/pulls` ? [pr] : []
        );
      }
      if (endpoint.startsWith('pulls?')) return JSON.stringify(pr && !pr.merged ? [pr] : []);
      if (endpoint === 'pulls/42') return JSON.stringify(pr);
    }
    if (args[0] === 'pr') {
      if (args[1] === 'list') return '[]';
      if (args[1] === 'create' || args[1] === 'edit') {
        const body = fs.readFileSync(args[args.indexOf('--body-file') + 1], 'utf8');
        candidate = git('rev-parse', 'HEAD');
        setPr();
        pr.body = body;
        pr.draft = args.includes('--draft');
        return 'https://github.com/adobe/aio-cli-plugin-aem-edge-functions/pull/42';
      }
      if (args[1] === 'ready') {
        pr.draft = args.includes('--undo');
        return '';
      }
    }
    if (args[0] === 'label') return '';
    if (args[0] === 'release') {
      const tag = args[2];
      if (args[1] === 'create') {
        published.push({ tag_name: tag, draft: true, prerelease: false, body: notes, assets: [] });
        return '';
      }
      const existing = published.find((item) => item.tag_name === tag);
      if (args[1] === 'upload') {
        existing.assets.push({ name: path.basename(args[3]), bytes: fs.readFileSync(args[3]) });
        return '';
      }
      if (args[1] === 'download') {
        const dir = args[args.indexOf('--dir') + 1];
        const asset = existing.assets[0];
        fs.writeFileSync(path.join(dir, asset.name), asset.bytes);
        return '';
      }
      if (args[1] === 'edit') {
        existing.draft = false;
        return '';
      }
    }
    throw new Error(`Unexpected gh call: ${JSON.stringify(args)} ${options?.input || ''}`);
  }

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    cwd = process.cwd();
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-release-test-'));
    process.chdir(temp);
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'Release test');
    git('config', 'user.email', 'release-test@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'core.hooksPath', '/dev/null');
    git('init', '-q', '--bare', path.join(temp, 'remote.git'));
    git('remote', 'add', 'origin', path.join(temp, 'remote.git'));
    const pkg = {
      name: PACKAGE,
      version: '1.1.0',
      files: ['src'],
      dependencies: { example: '1.0.0' }
    };
    const lock = {
      name: PACKAGE,
      version: '1.1.0',
      lockfileVersion: 3,
      packages: {
        '': { ...pkg },
        'node_modules/example': { version: '1.0.0', integrity: 'unchanged' }
      }
    };
    write('.gitignore', 'remote.git/\nrunner/\nsource.tar\n');
    write('package.json', pkg);
    write('package-lock.json', lock);
    write('CHANGELOG.md', history);
    fs.mkdirSync('src');
    write('src/index.js', 'module.exports = 1;\n');
    baseSha = mainSha = commit('Previous release');
    git('tag', 'v1.1.0');
    git('push', '-q', 'origin', 'main', '--tags');
    published = [{ tag_name: 'v1.1.0', draft: false, prerelease: false }];
    registry = {
      '1.1.0': { name: PACKAGE, version: '1.1.0', gitHead: baseSha, dist: { integrity: 'old' } }
    };
    calls = [];
    npmFailure = false;
    pr = null;
    proposal = {
      bump: 'patch',
      breaking: false,
      rationale: 'Fixes only.',
      changes: [{ type: 'Fixed', description: 'Fixed a deployment issue (#12).' }]
    };
    sandbox.stub(process, 'env').value({
      ...process.env,
      RUNNER_TEMP: path.join(temp, 'runner'),
      GH_AW_AGENT_OUTPUT: path.join(temp, 'runner', 'agent-output.json'),
      RELEASE_WORKFLOW_INFO: path.join(temp, 'runner', 'aw_info.json'),
      GITHUB_RUN_ID: '12345',
      GITHUB_OUTPUT: path.join(temp, 'runner', 'output'),
      RELEASE_PR: '',
      RELEASE_BUMP: 'auto',
      RELEASE_NOTES: '',
      RELEASE_APPROVE_BREAKING: 'false'
    });
    fs.mkdirSync(process.env.RUNNER_TEMP);
    write(process.env.RELEASE_WORKFLOW_INFO, {
      repository: REPO,
      run_id: 12345,
      staged: false,
      dry_run: false
    });
    sandbox.stub(global, 'fetch').callsFake(async (url) => {
      const version = String(url).split('/').pop();
      const value = version === 'latest' ? registry['1.1.0'] : registry[version];
      return response(value, value ? 200 : 404);
    });
    sandbox.stub(childProcess, 'execFileSync').callsFake((command, args, options = {}) => {
      calls.push({ command, args, options });
      if (command === 'gh') return mockGh(args, options);
      if (command === 'npm' && args[0] === 'publish') {
        if (npmFailure) throw new Error('Simulated npm publishing failure');
        registry['1.1.1'] = {
          name: PACKAGE,
          version: '1.1.1',
          dist: { integrity: release.integrity(args[1]) }
        };
        return '';
      }
      return execFileSync(command, args, options);
    });
    delete require.cache[script];
    release = require(script);
    git('checkout', '-q', '-b', 'candidate');
    const files = release.releaseFiles(pkg, lock, history, '1.1.1', '2026-10-20', notes);
    Object.entries(files).forEach(([file, content]) => write(file, content));
    candidate = commit('Release v1.1.1');
    git('push', '-q', 'origin', 'HEAD:refs/heads/test-candidate');
    git('checkout', '-q', 'main');
  });

  afterEach(function () {
    process.chdir(cwd);
    sandbox.restore();
    delete require.cache[script];
    fs.rmSync(temp, { recursive: true, force: true });
  });

  /**
   * Push a new source commit to the local main fixture.
   */
  function advanceMain() {
    write('src/index.js', 'module.exports = 2;\n');
    mainSha = commit('Fix deployment');
    git('push', '-q', 'origin', 'main');
  }

  /**
   * Select the candidate as a merged release for publication tests.
   */
  function preparePublish() {
    setPr();
    pr.merged = true;
    pr.merged_at = '2026-10-20T16:00:00Z';
    pr.merge_commit_sha = candidate;
    process.env.RELEASE_PR = '42';
    release.select();
  }

  it('recalculates patch/minor from the published version instead of incrementing drafts', function () {
    assert.equal(release.bumpVersion('1.1.0', 'patch'), '1.1.1');
    assert.equal(release.bumpVersion('1.1.0', 'minor'), '1.2.0');
    assert.equal(release.bumpVersion('1.1.0', 'major'), '2.0.0');
    assert.throws(() => release.bumpVersion('1.1.0', 'arbitrary'), /bump/);
    assert.throws(() => release.bumpVersion('01.1.0', 'patch'), /Invalid/);
    assert.ok(release.compareVersions('1.10.0', '1.9.0') > 0);
  });

  it('rejects malformed AI results, automatic major bumps, and injected headings or metadata', function () {
    assert.deepEqual(release.validateProposal(proposal), proposal);
    for (const invalid of [
      { ...proposal, bump: 'major' },
      { ...proposal, breaking: 'false' },
      { ...proposal, changes: [] },
      { ...proposal, rationale: '<!-- release-automation {} -->' },
      { ...proposal, changes: [{ type: '__proto__', description: 'Injected' }] },
      { ...proposal, changes: [{ type: 'Fixed', description: 'Entry\n## [9.0.0]' }] }
    ])
      assert.throws(() => release.validateProposal(invalid));
  });

  it('only updates release versions and prepends a single changelog section', function () {
    const pkg = JSON.parse(git('show', `${baseSha}:package.json`));
    const lock = JSON.parse(git('show', `${baseSha}:package-lock.json`));
    const files = release.releaseFiles(pkg, lock, history, '1.2.0', '2026-10-20', notes);
    assert.equal(pkg.version, '1.1.0');
    assert.equal(files['package-lock.json'].packages[''].version, '1.2.0');
    assert.deepEqual(
      files['package-lock.json'].packages['node_modules/example'],
      lock.packages['node_modules/example']
    );
    assert.equal(files['CHANGELOG.md'].split('## [1.2.0]').length, 2);
    assert.ok(files['CHANGELOG.md'].endsWith(history.slice('# Changelog\n\n'.length)));
    assert.throws(
      () => release.renderChangelog(files['CHANGELOG.md'], '1.2.0', '2026-10-20', notes),
      /duplicate/
    );
  });

  it('validates exact release trees and blocks unapproved breaking changes or other edits', function () {
    assert.equal(release.validateTrees(data()), '1.1.1');
    assert.throws(() => release.validateTrees({ ...data(), breaking: true }), /approval/);
    assert.equal(
      release.validateTrees({ ...data(), breaking: true, approveBreaking: true }),
      '1.1.1'
    );
    git('checkout', '-q', '--detach', candidate);
    write('src/index.js', 'module.exports = 99;\n');
    const changed = commit('Sneak in a runtime change');
    assert.throws(
      () => release.validateTrees({ ...data(), headSha: changed, baseSha: candidate }),
      /unexpected files/
    );
  });

  it('creates and refreshes the same release PR from current main without cumulative version bumps', async function () {
    advanceMain();
    await release.prepare();
    submitProposal();
    release.update();
    assert.equal(JSON.parse(fs.readFileSync('package.json')).version, '1.1.1');
    for (const operation of ['list', 'create']) {
      const call = calls.find(
        (call) => call.command === 'gh' && call.args[0] === 'pr' && call.args[1] === operation
      );
      assert.equal(call.args[call.args.indexOf('--base') + 1], 'releaseautomation');
    }
    assert.ok(
      calls.some((call) =>
        call.args.some((arg) => arg.includes('pulls?state=open&base=releaseautomation&'))
      )
    );
    const firstHead = pr.head.sha;
    git('checkout', '-q', 'main');
    git('branch', '-D', 'automation/release');
    write('README.md', 'Documentation-only change\n');
    mainSha = commit('Update docs');
    git('push', '-q', 'origin', 'main');
    await release.prepare();
    proposal.bump = 'minor';
    submitProposal();
    release.update();
    assert.notEqual(pr.head.sha, firstHead);
    assert.equal(pr.number, 42);
    assert.equal(JSON.parse(fs.readFileSync('package.json')).version, '1.2.0');
    assert.equal(git('rev-parse', 'HEAD^'), mainSha);
    assert.equal(
      calls.filter(
        (call) => call.command === 'gh' && call.args[0] === 'pr' && call.args[1] === 'create'
      ).length,
      1
    );
    assert.ok(
      calls.some((call) =>
        call.args.includes(`--force-with-lease=refs/heads/automation/release:${firstHead}`)
      )
    );
  });

  it('exports only bounded evidence to the agent and validates its safe output before any writes', async function () {
    advanceMain();
    await release.prepare();
    const evidence = JSON.parse(
      fs.readFileSync(path.join(process.env.RUNNER_TEMP, 'edge-functions-release', 'evidence.json'))
    );
    assert.equal(evidence.baseline, '1.1.0');
    assert.match(evidence.changes, /module.exports = 2/);
    assert.deepEqual(Object.keys(evidence).sort(), [
      'baseline',
      'changes',
      'commits',
      'pullRequests'
    ]);
    assert.match(fs.readFileSync(process.env.GITHUB_OUTPUT, 'utf8'), new RegExp(`head=${mainSha}`));
    const before = calls.length;
    submitProposal();
    assert.equal(calls.length, before);
    assert.deepEqual(
      JSON.parse(
        fs.readFileSync(
          path.join(process.env.RUNNER_TEMP, 'edge-functions-release', 'proposal.json')
        )
      ),
      proposal
    );
    assert.throws(() => submitProposal({ ...proposal, bump: 'major' }), /invalid release proposal/);
  });

  it('omits generated workflow diffs but retains their source instructions', async function () {
    fs.mkdirSync('.github/workflows', { recursive: true });
    write('.github/workflows/example.lock.yml', 'generated: ' + 'x'.repeat(200_000));
    write('.github/workflows/example.md', '# Handwritten release behavior\n');
    mainSha = commit('Add an agentic workflow');
    git('push', '-q', 'origin', 'main');
    await release.prepare();
    const evidence = JSON.parse(
      fs.readFileSync(path.join(process.env.RUNNER_TEMP, 'edge-functions-release', 'evidence.json'))
    );
    assert.match(evidence.changes, /Handwritten release behavior/);
    assert.doesNotMatch(evidence.changes, /example\.lock\.yml|generated:/);
  });

  it('enforces the evidence limit in UTF-8 bytes without truncation', async function () {
    advanceMain();
    await release.prepare();
    const contextFile = path.join(
      process.env.RUNNER_TEMP,
      'edge-functions-release',
      'context.json'
    );
    const context = JSON.parse(fs.readFileSync(contextFile));
    const overhead = Buffer.byteLength(JSON.stringify({ ...context.evidence, changes: '' }));
    let changes = 'x'.repeat(180_000 - overhead);
    childProcess.execFileSync
      .withArgs(
        'git',
        sinon.match((args) => args[0] === 'diff')
      )
      .callsFake(() => changes);
    await release.prepare();
    assert.equal(
      Buffer.byteLength(JSON.stringify(JSON.parse(fs.readFileSync(contextFile)).evidence)),
      180_000
    );
    changes += 'é';
    await assert.rejects(release.prepare(), /evidence is too large/);
    assert.equal(JSON.parse(fs.readFileSync(contextFile)).evidence.changes, changes.slice(0, -1));
  });

  it('rejects missing, oversized, malformed, duplicate, or wrong safe outputs', function () {
    assert.throws(() => release.propose(), /ENOENT/);
    delete process.env.GH_AW_AGENT_OUTPUT;
    assert.throws(() => release.propose(), /safe-output file is required/);
    process.env.GH_AW_AGENT_OUTPUT = path.join(temp, 'runner', 'agent-output.json');
    write(process.env.GH_AW_AGENT_OUTPUT, 'x'.repeat(100_001));
    assert.throws(() => release.propose(), /bounded/);
    const item = { type: 'publish_release_proposal', proposal: JSON.stringify(proposal) };
    for (const items of [
      null,
      [],
      [item, item],
      [{ ...item, type: 'noop' }],
      [{ ...item, proposal }]
    ]) {
      write(process.env.GH_AW_AGENT_OUTPUT, { items });
      assert.throws(() => release.propose(), /Exactly one/);
    }
    write(process.env.GH_AW_AGENT_OUTPUT, { items: [{ ...item, proposal: 'not JSON' }] });
    assert.throws(() => release.propose(), SyntaxError);
    assert.equal(
      fs.existsSync(path.join(process.env.RUNNER_TEMP, 'edge-functions-release', 'proposal.json')),
      false
    );
  });

  it('honors compiler staging and dry-run metadata without making release writes', async function () {
    advanceMain();
    await release.prepare();
    for (const mode of [
      { staged: true, dry_run: false },
      { staged: false, dry_run: true }
    ]) {
      write(process.env.RELEASE_WORKFLOW_INFO, {
        repository: REPO,
        run_id: 12345,
        ...mode
      });
      submitProposal();
      assert.match(fs.readFileSync(process.env.GITHUB_OUTPUT, 'utf8'), /staged=true/);
      const before = calls.length;
      release.update();
      assert.equal(calls.length, before);
      assert.equal(pr, null);
      assert.equal(JSON.parse(fs.readFileSync('package.json')).version, '1.1.0');
    }
  });

  it('fails closed on missing, malformed, or foreign run metadata', async function () {
    advanceMain();
    await release.prepare();
    submitProposal();
    for (const info of [
      null,
      { repository: REPO, run_id: 12345, staged: 'false', dry_run: false },
      { repository: REPO, run_id: 12345, staged: false },
      { repository: 'other/repo', run_id: 12345, staged: false, dry_run: false },
      { repository: REPO, run_id: 999, staged: false, dry_run: false }
    ]) {
      write(process.env.RELEASE_WORKFLOW_INFO, info);
      assert.throws(() => submitProposal(), /Invalid Agentic Workflows run metadata/);
      assert.throws(() => release.update(), /Invalid Agentic Workflows run metadata/);
    }
    delete process.env.RELEASE_WORKFLOW_INFO;
    assert.throws(() => release.update(), /run metadata is required/);
    assert.equal(pr, null);
  });

  it('refuses a different local snapshot even when remote main still matches the evidence', async function () {
    advanceMain();
    await release.prepare();
    submitProposal();
    git('checkout', '-q', '--detach', baseSha);
    assert.throws(() => release.update(), /Base branch moved/);
    assert.equal(pr, null);
    assert.equal(JSON.parse(fs.readFileSync('package.json')).version, '1.1.0');
  });

  it('opens a patch release for documentation-only changes', async function () {
    write('README.md', 'Updated documentation\n');
    mainSha = commit('Update documentation only');
    git('push', '-q', 'origin', 'main');
    await release.prepare();
    submitProposal();
    release.update();
    assert.equal(release.metadata(pr).bump, 'patch');
    const context = JSON.parse(
      fs.readFileSync(path.join(process.env.RUNNER_TEMP, 'edge-functions-release', 'context.json'))
    );
    assert.match(context.evidence.changes, /Updated documentation/);
  });

  it('requires an explicit breaking-change decision and resets approval on new main changes', async function () {
    advanceMain();
    await release.prepare();
    proposal.breaking = true;
    submitProposal();
    release.update();
    assert.equal(pr.draft, true);
    assert.throws(() => release.validateTrees(release.metadata(pr)), /approval/);
    git('checkout', '-q', 'main');
    git('branch', '-D', 'automation/release');
    process.env.RELEASE_BUMP = 'major';
    process.env.RELEASE_APPROVE_BREAKING = 'true';
    await release.prepare();
    submitProposal();
    release.update();
    assert.equal(pr.draft, false);
    assert.equal(release.validateTrees(release.metadata(pr)), '2.0.0');
    git('checkout', '-q', 'main');
    write('README.md', 'Another change\n');
    mainSha = commit('More changes');
    git('push', '-q', 'origin', 'main');
    process.env.RELEASE_BUMP = 'auto';
    process.env.RELEASE_APPROVE_BREAKING = 'false';
    await release.prepare();
    const context = JSON.parse(
      fs.readFileSync(path.join(process.env.RUNNER_TEMP, 'edge-functions-release', 'context.json'))
    );
    assert.equal(context.override.approveBreaking, false);
    assert.equal(context.override.bump, 'auto');
  });

  it('posts failure on stale release heads, while ordinary PRs receive a passing check', async function () {
    setPr();
    process.env.RELEASE_PR = '42';
    mainSha = 'a'.repeat(40);
    await assert.rejects(release.check(), /stale/);
    let check = calls
      .filter((call) => call.command === 'gh' && call.args.includes('--input'))
      .pop();
    assert.equal(JSON.parse(check.options.input).conclusion, 'failure');
    pr.head.ref = 'normal-feature';
    await release.check();
    check = calls.filter((call) => call.command === 'gh' && call.args.includes('--input')).pop();
    assert.equal(JSON.parse(check.options.input).conclusion, 'success');
  });

  it('preserves manual release-branch edits instead of force-pushing over them', async function () {
    advanceMain();
    await release.prepare();
    submitProposal();
    release.update();
    write('CHANGELOG.md', fs.readFileSync('CHANGELOG.md', 'utf8') + '\nManual notes\n');
    pr.head.sha = commit('Manually edit notes');
    git('push', '-q', 'origin', 'automation/release');
    git('checkout', '-q', 'main');
    await assert.rejects(release.prepare(), /edited manually|automation metadata/);
  });

  it('recovers curated notes from an orphaned generated branch after PR creation failed', async function () {
    advanceMain();
    process.env.RELEASE_NOTES = '### Changed\n\n- Maintainer-curated release notes.';
    await release.prepare();
    submitProposal();
    release.update();
    const curated = release.metadata(pr).notes;
    pr = null;
    git('checkout', '-q', 'main');
    git('branch', '-D', 'automation/release');
    process.env.RELEASE_NOTES = '';
    await release.prepare();
    submitProposal();
    release.update();
    assert.equal(release.metadata(pr).notes, curated);
  });

  it('publishes one immutable artifact and resumes after npm succeeded without republishing', async function () {
    preparePublish();
    write('src/index.js', 'module.exports = "uncommitted contamination";\n');
    await release.publish();
    assert.equal(published.find((item) => item.tag_name === 'v1.1.1').draft, false);
    assert.equal(git('rev-parse', 'v1.1.1'), candidate);
    const npmPublish = calls.find((call) => call.command === 'npm' && call.args[0] === 'publish');
    const tarball = npmPublish.args[1];
    const source = execFileSync('tar', ['-xOf', tarball, 'package/src/index.js'], {
      encoding: 'utf8'
    });
    assert.equal(source, 'module.exports = 1;\n');
    assert.equal(npmPublish.options.env.GITHUB_SHA, candidate);
    published.find((item) => item.tag_name === 'v1.1.1').draft = true;
    await release.publish();
    assert.equal(
      calls.filter((call) => call.command === 'npm' && call.args[0] === 'publish').length,
      1
    );
    assert.equal(published.find((item) => item.tag_name === 'v1.1.1').draft, false);
  });

  it('dry-runs validation and immutable packing without any remote publication writes', async function () {
    preparePublish();
    write('src/index.js', 'module.exports = "uncommitted contamination";\n');
    const logs = sandbox.spy(console, 'log');
    const before = calls.length;
    await release.publish({ dryRun: true });
    const skipped = logs.args
      .map(([message]) => message)
      .filter((message) => message.includes('skipped'));
    assert.equal(skipped.length, 5);
    for (const operation of [
      'creating tag v1.1.1',
      'creating draft GitHub Release v1.1.1',
      'uploading release asset',
      `publishing ${PACKAGE}@1.1.1 to npm`,
      'finalizing GitHub Release v1.1.1'
    ]) {
      assert.ok(
        skipped.some((message) => message.includes(operation)),
        operation
      );
    }
    const operations = calls.slice(before);
    const pack = operations.find((call) => call.command === 'npm' && call.args[0] === 'pack');
    assert.ok(pack);
    const dir = pack.args[pack.args.indexOf('--pack-destination') + 1];
    const tarball = path.join(
      dir,
      fs.readdirSync(dir).find((file) => file.endsWith('.tgz'))
    );
    assert.equal(
      execFileSync('tar', ['-xOf', tarball, 'package/src/index.js'], { encoding: 'utf8' }),
      'module.exports = 1;\n'
    );
    assert.equal(
      operations.filter(
        (call) =>
          (call.command === 'gh' &&
            (call.args.includes('--method') ||
              (call.args[0] === 'release' && call.args[1] !== 'download'))) ||
          (call.command === 'npm' && call.args[0] === 'publish') ||
          (call.command === 'git' && call.args[0] === 'push')
      ).length,
      0
    );
    assert.equal(git('ls-remote', '--tags', 'origin', 'refs/tags/v1.1.1'), '');
    assert.equal(published.length, 1);
    assert.equal(registry['1.1.1'], undefined);
  });

  it('does not finalize an existing draft release or republish npm during a dry run', async function () {
    preparePublish();
    await release.publish();
    const existing = published.find((item) => item.tag_name === 'v1.1.1');
    existing.draft = true;
    const logs = sandbox.spy(console, 'log');
    const before = calls.length;
    await release.publish({ dryRun: true });
    const skipped = logs.args
      .map(([message]) => message)
      .filter((message) => message.includes('skipped'));
    assert.equal(skipped.length, 1);
    assert.match(skipped[0], /skipped finalizing GitHub Release v1.1.1/);
    assert.equal(existing.draft, true);
    assert.ok(calls.slice(before).some((call) => call.args[1] === 'download'));
    assert.equal(
      calls
        .slice(before)
        .filter(
          (call) =>
            (call.command === 'gh' &&
              (call.args.includes('--method') ||
                (call.args[0] === 'release' && call.args[1] !== 'download'))) ||
            (call.command === 'npm' && call.args[0] === 'publish')
        ).length,
      0
    );
  });

  it('still rejects conflicting release state and invalid options during a dry run', async function () {
    preparePublish();
    await assert.rejects(release.publish({ dryRun: 'false' }), /must be a boolean/);
    registry['1.1.1'] = { name: PACKAGE, version: '1.1.1', dist: { integrity: 'different' } };
    await assert.rejects(release.publish({ dryRun: true }), /different package contents/);
    assert.equal(published.length, 1);
    delete registry['1.1.1'];
    git('tag', 'v1.1.1', baseSha);
    git('push', '-q', 'origin', '--tags');
    await assert.rejects(release.publish({ dryRun: true }), /different commit/);
    assert.equal(published.length, 1);
  });

  it('does not finalize a release when an existing npm version has different contents', async function () {
    preparePublish();
    registry['1.1.1'] = { name: PACKAGE, version: '1.1.1', dist: { integrity: 'different' } };
    await assert.rejects(release.publish(), /different package contents/);
    assert.equal(published.find((item) => item.tag_name === 'v1.1.1').draft, true);
    assert.equal(
      calls.filter((call) => call.command === 'npm' && call.args[0] === 'publish').length,
      0
    );
  });

  it('only selects an actual release merge on main, not an ordinary push', function () {
    process.env.GITHUB_SHA = baseSha;
    release.select();
    assert.match(fs.readFileSync(process.env.GITHUB_OUTPUT, 'utf8'), /skip=true/);
    setPr();
    pr.merged = true;
    pr.merged_at = '2026-10-20T16:00:00Z';
    pr.merge_commit_sha = candidate;
    process.env.GITHUB_SHA = candidate;
    release.select();
    const selected = JSON.parse(
      fs.readFileSync(path.join(process.env.RUNNER_TEMP, 'edge-functions-release', 'selected.json'))
    );
    assert.equal(selected.pr, '42');
    assert.equal(selected.sha, candidate);
    assert.equal(git('rev-parse', 'HEAD'), candidate);
    assert.equal(
      calls.filter((call) => call.command === 'npm' && call.args[0] === 'publish').length,
      0
    );
  });

  it('keeps a failed npm publication in draft and resumes it safely', async function () {
    preparePublish();
    npmFailure = true;
    await assert.rejects(release.publish(), /Simulated npm publishing failure/);
    assert.equal(published.find((item) => item.tag_name === 'v1.1.1').draft, true);
    npmFailure = false;
    await release.publish();
    assert.equal(published.find((item) => item.tag_name === 'v1.1.1').draft, false);
    assert.equal(published.filter((item) => item.tag_name === 'v1.1.1').length, 1);
  });

  it('rejects conflicting version tags before uploading or publishing', async function () {
    preparePublish();
    git('tag', 'v1.1.1', baseSha);
    git('push', '-q', 'origin', '--tags');
    await assert.rejects(release.publish(), /different commit/);
    assert.equal(published.filter((item) => item.tag_name === 'v1.1.1').length, 0);
    assert.equal(
      calls.filter((call) => call.command === 'npm' && call.args[0] === 'publish').length,
      0
    );
  });

  it('reuses an undeleted release branch for the next release after publication', async function () {
    advanceMain();
    await release.prepare();
    submitProposal();
    release.update();
    const firstHead = pr.head.sha;
    git('checkout', '-q', 'main');
    git('merge', '--ff-only', 'automation/release');
    mainSha = git('rev-parse', 'HEAD');
    git('push', '-q', 'origin', 'main');
    pr.merged = true;
    pr.merge_commit_sha = mainSha;
    process.env.RELEASE_PR = '42';
    release.select();
    await release.publish();
    git('checkout', '-q', 'main');
    git('branch', '-D', 'automation/release');
    write('README.md', 'Next release documentation\n');
    mainSha = commit('Update documentation after release');
    git('push', '-q', 'origin', 'main');
    await release.prepare();
    submitProposal();
    release.update();
    assert.equal(JSON.parse(fs.readFileSync('package.json')).version, '1.1.2');
    assert.equal(release.metadata(pr).baseline.version, '1.1.1');
    assert.ok(
      calls.some((call) =>
        call.args.includes(`--force-with-lease=refs/heads/automation/release:${firstHead}`)
      )
    );
  });
});
