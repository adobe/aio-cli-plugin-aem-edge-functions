/*
 * Copyright 2026 Adobe Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const REPOSITORY = 'adobe/aio-cli-plugin-aem-edge-functions';
const PACKAGE = '@adobe/aio-cli-plugin-aem-edge-functions';
const BRANCH = 'automation/release';
const BASE_BRANCH = 'main';
const FILES = ['CHANGELOG.md', 'package-lock.json', 'package.json'];
const BOOTSTRAP = { version: '1.1.0', sha: '3dd5055ce598bfbec8622abf0f4ebb55dadf9871' };
const TYPES = ['Added', 'Changed', 'Fixed', 'Removed', 'Deprecated', 'Security'];
const MARKER = /<!-- release-automation (\{[^\n]+\}) -->/;

/**
 * Run a bounded subprocess without shell interpolation.
 * @param {string} command Executable.
 * @param {string[]} args Arguments.
 * @param {object} options Execution overrides.
 * @returns {string} Trimmed stdout.
 */
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    timeout: 120_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options
  }).trim();
}

const git = (...args) => run('git', args);
const gh = (...args) => run('gh', args);
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const at = (sha, file) => git('show', `${assertSha(sha)}:${file}`);
const api = (endpoint) => JSON.parse(gh('api', `repos/${REPOSITORY}/${endpoint}`));

/**
 * Require a full commit SHA.
 * @param {string} sha Commit identifier.
 * @returns {string} Validated SHA.
 */
function assertSha(sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected a full commit SHA.');
  return sha;
}

/**
 * Parse a bounded stable SemVer version.
 * @param {string} version Release version.
 * @returns {number[]} Major, minor, and patch.
 */
function versionParts(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Invalid stable version: ${version}`);
  }
  const parts = version.split('.').map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part) || part > 1_000_000)) {
    throw new Error('Version components exceed the supported range.');
  }
  return parts;
}

/**
 * Apply a SemVer bump to the published baseline.
 * @param {string} version Baseline version.
 * @param {string} bump Selected bump.
 * @returns {string} Bumped version.
 */
function bumpVersion(version, bump) {
  const [major, minor, patch] = versionParts(version);
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'major') return `${major + 1}.0.0`;
  throw new Error('The version bump must be patch, minor, or major.');
}

/**
 * Compare stable versions numerically.
 * @param {string} a Left version.
 * @param {string} b Right version.
 * @returns {number} Comparison sign.
 */
function compareVersions(a, b) {
  const left = versionParts(a);
  const right = versionParts(b);
  return left.reduce((result, value, i) => result || Math.sign(value - right[i]), 0);
}

/**
 * Validate bounded text without control characters or metadata markers.
 * @param {string} value Candidate text.
 * @param {number} limit Character limit.
 * @param {string} name Field label for errors.
 * @returns {string} Trimmed text.
 */
function text(value, limit, name) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    /<!--|-->/.test(value) ||
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13);
    })
  ) {
    throw new Error(`Invalid ${name}.`);
  }
  return value.trim();
}

/**
 * Validate and normalize the AI release proposal.
 * @param {object} proposal Untrusted proposal.
 * @returns {object} Normalized proposal.
 */
function validateProposal(proposal) {
  if (
    !proposal ||
    !['patch', 'minor'].includes(proposal.bump) ||
    typeof proposal.breaking !== 'boolean' ||
    !Array.isArray(proposal.changes) ||
    proposal.changes.length === 0 ||
    proposal.changes.length > 60
  ) {
    throw new Error('Copilot returned an invalid release proposal.');
  }
  return {
    bump: proposal.bump,
    breaking: proposal.breaking,
    rationale: text(proposal.rationale, 2000, 'release rationale'),
    changes: proposal.changes.map(({ type, description }) => {
      if (!TYPES.includes(type)) throw new Error('Invalid changelog category.');
      const entry = text(description, 500, 'changelog entry');
      if (/[\r\n]|<!--|-->/.test(entry)) throw new Error('Changelog entries must be single lines.');
      return { type, description: entry };
    })
  };
}

/**
 * Group validated changes into Markdown sections.
 * @param {object} proposal Release proposal.
 * @returns {string} Changelog sections.
 */
function changelogNotes(proposal) {
  return TYPES.map((type) => {
    const entries = proposal.changes.filter((entry) => entry.type === type);
    return entries.length
      ? `### ${type}\n\n${entries.map((entry) => `- ${entry.description}`).join('\n')}`
      : '';
  })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Validate changelog sections without version headings.
 * @param {string} notes Candidate Markdown.
 * @returns {string} Validated notes.
 */
function validateNotes(notes) {
  const result = text(notes, 20_000, 'release notes');
  if (
    !/^### (Added|Changed|Fixed|Removed|Deprecated|Security)\n/m.test(result) ||
    /^## /m.test(result) ||
    /<!--|-->/.test(result)
  ) {
    throw new Error('Release notes must contain changelog sections, without a version heading.');
  }
  return result;
}

/**
 * Prepend a release while preserving changelog history.
 * @param {string} changelog Existing changelog.
 * @param {string} version New version.
 * @param {string} date Release date.
 * @param {string} notes Validated sections.
 * @returns {string} Updated changelog.
 */
function renderChangelog(changelog, version, date, notes) {
  versionParts(version);
  if (!/^# Changelog\n\n/.test(changelog) || changelog.includes(`## [${version}]`)) {
    throw new Error('Unexpected changelog header or duplicate release version.');
  }
  return changelog.replace(
    '# Changelog\n\n',
    `# Changelog\n\n## [${version}] - ${date}\n\n${validateNotes(notes)}\n\n`
  );
}

/**
 * Build release files without changing dependency resolutions.
 * @param {object} pkg Package manifest.
 * @param {object} lock Package lockfile.
 * @param {string} changelog Existing history.
 * @param {string} version Target version.
 * @param {string} date Release date.
 * @param {string} notes Changelog sections.
 * @returns {object} Updated file contents by path.
 */
function releaseFiles(pkg, lock, changelog, version, date, notes) {
  if (
    pkg.name !== PACKAGE ||
    lock.name !== PACKAGE ||
    lock.version !== pkg.version ||
    lock.packages?.['']?.version !== pkg.version
  ) {
    throw new Error('Package and lockfile release metadata do not match.');
  }
  return {
    'package.json': { ...pkg, version },
    'package-lock.json': {
      ...lock,
      version,
      packages: { ...lock.packages, '': { ...lock.packages[''], version } }
    },
    'CHANGELOG.md': renderChangelog(changelog, version, date, notes)
  };
}

/**
 * Read and validate embedded release metadata.
 * @param {object} pr Pull request or generated commit wrapper.
 * @returns {object} Validated metadata.
 */
function metadata(pr) {
  const match = (pr.body || '').match(MARKER);
  if (!match) throw new Error('Release PR is missing its automation metadata.');
  const data = JSON.parse(match[1]);
  data.headSha ||= pr.head?.sha;
  assertSha(data.baseSha);
  assertSha(data.headSha);
  assertSha(data.baseline.sha);
  versionParts(data.baseline.version);
  if (
    !['patch', 'minor', 'major'].includes(data.bump) ||
    typeof data.breaking !== 'boolean' ||
    typeof data.approveBreaking !== 'boolean' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.date)
  ) {
    throw new Error('Invalid release PR metadata.');
  }
  validateNotes(data.notes);
  return data;
}

/**
 * Require the labeled, same-repository release PR.
 * @param {object} pr Pull request.
 */
function assertReleasePr(pr) {
  if (
    pr.head.ref !== BRANCH ||
    pr.base.ref !== BASE_BRANCH ||
    pr.head.repo?.full_name !== REPOSITORY ||
    !pr.labels.some((label) => label.name === 'release')
  ) {
    throw new Error(`Not an automation-owned release PR targeting ${BASE_BRANCH}.`);
  }
}

/**
 * Find the unique open rolling release PR.
 * @returns {object|null} Open PR, if present.
 */
function openPr() {
  const prs = api(`pulls?state=open&base=${BASE_BRANCH}&head=adobe:${BRANCH}&per_page=100`);
  if (prs.length > 1) throw new Error('Multiple rolling release PRs exist.');
  return prs[0] || null;
}

/**
 * Fetch all GitHub Releases.
 * @returns {object[]} Release records.
 */
function releases() {
  const pages = JSON.parse(
    gh('api', '--paginate', '--slurp', `repos/${REPOSITORY}/releases?per_page=100`)
  );
  return pages.flat();
}

/**
 * Fetch npm metadata; only a 404 means unpublished.
 * @param {string} version Stable version.
 * @returns {Promise<object|null>} Published metadata, if present.
 */
async function registryVersion(version) {
  versionParts(version);
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(PACKAGE)}/${version}`,
    { signal: AbortSignal.timeout(30_000) }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry lookup failed: HTTP ${response.status}.`);
  const result = await response.json();
  if (result.name !== PACKAGE || result.version !== version || !result.dist?.integrity) {
    throw new Error('npm returned inconsistent package metadata.');
  }
  return result;
}

/**
 * Resolve and verify the last published release baseline.
 * @returns {Promise<object>} Baseline version and commit.
 */
async function baseline() {
  const published = releases().filter((release) => !release.draft && !release.prerelease);
  let result;
  if (!published.length) {
    result = BOOTSTRAP;
    const registry = await registryVersion(result.version);
    if (registry?.gitHead !== result.sha) {
      throw new Error('The initial npm release does not match the configured bootstrap commit.');
    }
  } else {
    published.forEach((release) => {
      if (!/^v\d+\.\d+\.\d+$/.test(release.tag_name)) {
        throw new Error('Expected vX.Y.Z release tags.');
      }
      versionParts(release.tag_name.slice(1));
    });
    published.sort((a, b) => compareVersions(b.tag_name.slice(1), a.tag_name.slice(1)));
    const latest = published[0];
    git('fetch', '--no-tags', 'origin', `refs/tags/${latest.tag_name}`);
    result = { version: latest.tag_name.slice(1), sha: git('rev-parse', 'FETCH_HEAD^{commit}') };
    if (
      JSON.parse(at(result.sha, 'package.json')).version !== result.version ||
      !(await registryVersion(result.version))
    ) {
      throw new Error('The latest GitHub Release does not match a published npm version.');
    }
  }
  git('merge-base', '--is-ancestor', result.sha, 'HEAD');
  return result;
}

/**
 * Ensure the runner's release state directory exists.
 * @returns {string} State directory path.
 */
function workspace() {
  if (!process.env.RUNNER_TEMP) throw new Error('RUNNER_TEMP is required.');
  const dir = path.join(process.env.RUNNER_TEMP, 'edge-functions-release');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Persist release state as JSON.
 * @param {string} name State filename.
 * @param {*} value Serializable state.
 */
function save(name, value) {
  fs.writeFileSync(path.join(workspace(), name), JSON.stringify(value, null, 2) + '\n');
}

/**
 * Read persisted release state.
 * @param {string} name State filename.
 * @returns {*} Parsed state.
 */
function load(name) {
  return json(path.join(workspace(), name));
}

/**
 * Emit a GitHub Actions step output.
 * @param {string} key Output name.
 * @param {*} value Single-line value.
 */
function output(key, value) {
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

/**
 * Collect bounded evidence and snapshot-scoped overrides.
 */
async function prepare() {
  const head = git('rev-parse', 'HEAD');
  if (head !== api(`git/ref/heads/${BASE_BRANCH}`).object.sha) {
    throw new Error('Base branch moved during checkout. Rerun release preparation.');
  }
  const associated = api(`commits/${head}/pulls`);
  if (
    associated.some(
      (pr) => pr.merged_at && pr.head.ref === BRANCH && pr.head.repo?.full_name === REPOSITORY
    )
  ) {
    output('skip', 'true');
    console.log('Release merge: publication is handled by the publish workflow.');
    return;
  }
  const base = await baseline();
  if (head === base.sha) {
    output('skip', 'true');
    return;
  }
  if (json('package.json').version !== base.version) {
    throw new Error(
      'Main has an unpublished version change. Resume its release before preparing another.'
    );
  }
  const existing = openPr();
  let previous = existing ? metadata(existing) : null;
  const remoteBranch = git('ls-remote', '--heads', 'origin', `refs/heads/${BRANCH}`);
  const expectedBranchSha = remoteBranch ? assertSha(remoteBranch.split(/\s/)[0]) : '';
  if (expectedBranchSha) {
    git('fetch', '--no-tags', 'origin', expectedBranchSha);
    const recorded = metadata({
      body: git('log', '-1', '--format=%B', expectedBranchSha),
      head: { sha: expectedBranchSha }
    });
    validateTrees(recorded, true);
    if (recorded.baseline.sha === base.sha && recorded.baseline.version === base.version) {
      previous ||= recorded;
    }
    if (existing && existing.head.sha !== expectedBranchSha) {
      throw new Error('The release branch changed during preparation. Rerun preparation.');
    }
  }
  const override = {
    bump: process.env.RELEASE_BUMP || 'auto',
    notes: process.env.RELEASE_NOTES || '',
    approveBreaking: process.env.RELEASE_APPROVE_BREAKING === 'true'
  };
  if (!['auto', 'patch', 'minor', 'major'].includes(override.bump)) {
    throw new Error('Invalid bump override.');
  }
  if (override.notes) validateNotes(override.notes);
  if (previous) {
    if (existing) assertReleasePr(existing);
    if (existing && existing.head.sha !== previous.headSha) {
      throw new Error(
        'The release branch was edited manually. Preserve those edits before restoring the bot-owned branch.'
      );
    }
    if (existing && process.env.GITHUB_EVENT_NAME === 'push' && previous.baseSha === head) {
      output('skip', 'true');
      console.log('The rolling release PR already covers this base branch snapshot.');
      return;
    }
    if (
      previous.baseSha === head &&
      override.bump === 'auto' &&
      !override.notes &&
      !override.approveBreaking
    ) {
      Object.assign(override, previous.override);
    } else if (previous.baseSha !== head && previous.override?.notes && !override.notes) {
      throw new Error(
        'Curated notes cover an older base branch snapshot. Dispatch again with updated notes; existing notes are preserved.'
      );
    }
  }
  const commits = git('log', '--format=%H %s%n%b', `${base.sha}..${head}`);
  const commitIds = new Set(git('rev-list', `${base.sha}..${head}`).split('\n'));
  const prs = JSON.parse(
    gh(
      'pr',
      'list',
      '--repo',
      REPOSITORY,
      '--state',
      'merged',
      '--base',
      BASE_BRANCH,
      '--limit',
      '1000',
      '--json',
      'number,title,body,mergeCommit'
    )
  );
  if (prs.length === 1000) throw new Error('Release evidence exceeds the PR inventory limit.');
  const changes = git(
    'diff',
    '--no-ext-diff',
    '--no-renames',
    '--unified=3',
    base.sha,
    head,
    '--',
    '.',
    ':!package-lock.json',
    ':!.github/workflows/*.lock.yml'
  );
  const evidence = {
    commits,
    pullRequests: prs.filter((pr) => commitIds.has(pr.mergeCommit?.oid)),
    changes
  };
  if (Buffer.byteLength(JSON.stringify(evidence)) > 240_000) {
    throw new Error(
      'Release evidence is too large for one proposal. Prepare a maintainer-reviewed release instead.'
    );
  }
  save('context.json', { head, baseline: base, existing, expectedBranchSha, override, evidence });
  save('evidence.json', { baseline: base.version, ...evidence });
  output('head', head);
  output('skip', 'false');
}

/**
 * Validate one agent safe output and report preview status.
 */
function propose() {
  const file = process.env.GH_AW_AGENT_OUTPUT;
  if (!file || fs.statSync(file).size > 100_000) {
    throw new Error('A bounded Agentic Workflows safe-output file is required.');
  }
  const { items } = json(file);
  if (
    !Array.isArray(items) ||
    items.length !== 1 ||
    items[0]?.type !== 'publish_release_proposal' ||
    typeof items[0].proposal !== 'string'
  ) {
    throw new Error('Exactly one publish_release_proposal safe output is required.');
  }
  save('proposal.json', validateProposal(JSON.parse(items[0].proposal)));
  output('staged', String(isPreview()));
}

/**
 * Check trusted run metadata for staging or dry-run mode.
 * @returns {boolean} Whether remote writes are disabled.
 */
function isPreview() {
  // Custom safe jobs do not inherit the compiler's staging flag in gh-aw v0.92.0.
  const file = process.env.RELEASE_WORKFLOW_INFO;
  if (!file || fs.statSync(file).size > 100_000) {
    throw new Error('Trusted Agentic Workflows run metadata is required.');
  }
  const info = json(file);
  if (
    info?.repository !== REPOSITORY ||
    String(info.run_id) !== process.env.GITHUB_RUN_ID ||
    typeof info.staged !== 'boolean' ||
    typeof info.dry_run !== 'boolean'
  ) {
    throw new Error('Invalid Agentic Workflows run metadata.');
  }
  return info.staged || info.dry_run;
}

/**
 * Render the release PR with provenance and validation metadata.
 * @param {object} data Release metadata.
 * @param {object} proposal Validated proposal.
 * @param {object[]} prs Included pull requests.
 * @returns {string} Pull request body.
 */
function prBody(data, proposal, prs) {
  const warning =
    data.breaking && !data.approveBreaking
      ? '**Blocked: breaking changes require an explicit maintainer decision.**\n\n'
      : '';
  return (
    `${warning}## Proposed release\n\n${proposal.rationale}\n\n${data.notes}\n\n` +
    `Included PRs: ${prs.map((pr) => `#${pr.number}`).join(', ') || 'direct commits'}\n\n` +
    'Bot-managed branch. Use **Prepare release PR > Run workflow** to override the bump or notes.\n\n' +
    `Generated by [Prepare release PR](https://github.com/${REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}).\n\n` +
    `<!-- release-automation ${JSON.stringify(data)} -->`
  );
}

/**
 * Refresh the rolling PR without overwriting concurrent edits.
 */
function update() {
  const context = load('context.json');
  const proposal = validateProposal(load('proposal.json'));
  if (isPreview()) {
    console.log('Preview mode: validated the proposal; release PR writes are disabled.');
    return;
  }
  if (
    git('rev-parse', 'HEAD') !== context.head ||
    api(`git/ref/heads/${BASE_BRANCH}`).object.sha !== context.head
  ) {
    throw new Error(
      'Base branch moved while Copilot was preparing the release. Rerun preparation.'
    );
  }
  const current = openPr();
  if ((current?.head.sha || null) !== (context.existing?.head.sha || null)) {
    throw new Error('The release PR changed during preparation. Rerun without overwriting it.');
  }
  const bump = context.override.bump === 'auto' ? proposal.bump : context.override.bump;
  const version = bumpVersion(context.baseline.version, bump);
  const date = new Date().toISOString().slice(0, 10);
  const notes = context.override.notes || changelogNotes(proposal);
  const files = releaseFiles(
    json('package.json'),
    json('package-lock.json'),
    fs.readFileSync('CHANGELOG.md', 'utf8'),
    version,
    date,
    notes
  );
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(
      file,
      typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n'
    );
  }
  git('config', 'user.name', 'github-actions[bot]');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  git('checkout', '-b', BRANCH);
  git('add', '--', ...FILES);
  const data = {
    baseSha: context.head,
    baseline: context.baseline,
    bump,
    breaking: proposal.breaking,
    approveBreaking: context.override.approveBreaking,
    date,
    notes,
    override: context.override
  };
  git(
    'commit',
    '-m',
    `Release v${version}`,
    '-m',
    `<!-- release-automation ${JSON.stringify(data)} -->`,
    '-m',
    'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  );
  data.headSha = git('rev-parse', 'HEAD');
  git(
    'push',
    `--force-with-lease=refs/heads/${BRANCH}:${context.expectedBranchSha}`,
    'origin',
    `HEAD:refs/heads/${BRANCH}`
  );
  const bodyFile = path.join(workspace(), 'body.md');
  fs.writeFileSync(bodyFile, prBody(data, proposal, context.evidence.pullRequests));
  const blocked = data.breaking && !data.approveBreaking;
  if (!current) {
    gh('label', 'create', 'release', '--repo', REPOSITORY, '--color', '0E8A16', '--force');
    const args = [
      'pr',
      'create',
      '--repo',
      REPOSITORY,
      '--base',
      BASE_BRANCH,
      '--head',
      BRANCH,
      '--title',
      `Release v${version}`,
      '--body-file',
      bodyFile,
      '--label',
      'release'
    ];
    if (blocked) args.push('--draft');
    console.log(gh(...args));
  } else {
    gh(
      'pr',
      'edit',
      String(current.number),
      '--repo',
      REPOSITORY,
      '--title',
      `Release v${version}`,
      '--body-file',
      bodyFile
    );
    if (blocked && !current.draft) {
      gh('pr', 'ready', String(current.number), '--repo', REPOSITORY, '--undo');
    }
    if (!blocked && current.draft) gh('pr', 'ready', String(current.number), '--repo', REPOSITORY);
  }
}

/**
 * Verify the exact release tree and breaking-change approval.
 * @param {object} data Recorded release metadata.
 * @param {boolean} allowBlocked Allow unapproved draft validation.
 * @returns {string} Verified release version.
 */
function validateTrees(data, allowBlocked = false) {
  if (data.breaking && !data.approveBreaking && !allowBlocked) {
    throw new Error('Breaking changes need explicit maintainer approval.');
  }
  if (git('rev-parse', `${data.headSha}^`) !== data.baseSha) {
    throw new Error(
      'Release branch must contain exactly one commit on its recorded base branch snapshot.'
    );
  }
  const files = git('diff', '--name-only', data.baseSha, data.headSha).split('\n').sort();
  if (JSON.stringify(files) !== JSON.stringify(FILES)) {
    throw new Error('Release PR changes unexpected files.');
  }
  git('merge-base', '--is-ancestor', data.baseline.sha, data.baseSha);
  const basePackage = JSON.parse(at(data.baseSha, 'package.json'));
  if (basePackage.version !== data.baseline.version) {
    throw new Error('Release baseline version mismatch.');
  }
  const version = bumpVersion(data.baseline.version, data.bump);
  const expected = releaseFiles(
    basePackage,
    JSON.parse(at(data.baseSha, 'package-lock.json')),
    at(data.baseSha, 'CHANGELOG.md') + '\n',
    version,
    data.date,
    data.notes
  );
  for (const file of FILES) {
    const actual = at(data.headSha, file);
    if (file.endsWith('.json')) {
      if (JSON.stringify(JSON.parse(actual)) !== JSON.stringify(expected[file])) {
        throw new Error(`${file} contains changes beyond the release version.`);
      }
    } else if (actual !== expected[file].trim()) {
      throw new Error('Changelog does not match the approved release notes and existing history.');
    }
  }
  return version;
}

/**
 * Post readiness for the PR's actual head commit.
 */
async function check() {
  const pr = process.env.RELEASE_PR ? api(`pulls/${prNumber()}`) : openPr();
  if (!pr) return;
  let failure;
  try {
    if (pr.head.ref === BRANCH && pr.head.repo?.full_name === REPOSITORY) {
      assertReleasePr(pr);
      const data = metadata(pr);
      git('fetch', '--no-tags', 'origin', data.headSha, data.baseSha);
      if (
        pr.head.sha !== data.headSha ||
        api(`git/ref/heads/${BASE_BRANCH}`).object.sha !== data.baseSha
      ) {
        throw new Error(
          'Release PR is stale. Refresh it against the current base branch before merging.'
        );
      }
      const base = await baseline();
      if (base.sha !== data.baseline.sha || base.version !== data.baseline.version) {
        throw new Error('A newer release exists. Refresh this PR.');
      }
      validateTrees(data);
      if (api(`git/ref/heads/${BASE_BRANCH}`).object.sha !== data.baseSha) {
        throw new Error('Base branch moved during validation. Refresh the release PR.');
      }
    }
  } catch (error) {
    failure = error;
  }
  const payload = {
    name: 'release-readiness',
    head_sha: assertSha(pr.head.sha),
    status: 'completed',
    conclusion: failure ? 'failure' : 'success',
    output: {
      title: failure ? 'Release is not ready' : 'Release is ready',
      summary: failure
        ? failure.message
        : 'Version, changelog, baseline, and current base branch match.'
    }
  };
  run('gh', ['api', '--method', 'POST', `repos/${REPOSITORY}/check-runs`, '--input', '-'], {
    input: JSON.stringify(payload)
  });
  if (failure) throw failure;
}

/**
 * Validate a release PR number.
 * @param {string} number Pull request number.
 * @returns {string} Validated number.
 */
function prNumber(number = process.env.RELEASE_PR) {
  if (!/^[1-9]\d{0,9}$/.test(number || '')) {
    throw new Error('A valid release PR number is required.');
  }
  return number;
}

/**
 * Verify a merged release matches its approved snapshot.
 * @param {string} number Pull request number.
 * @returns {object} Verified publication details.
 */
function mergedRelease(number = process.env.RELEASE_PR) {
  const pr = api(`pulls/${prNumber(number)}`);
  assertReleasePr(pr);
  if (!pr.merged || !pr.merge_commit_sha) throw new Error('Release PR has not been merged.');
  const data = metadata(pr);
  const sha = assertSha(pr.merge_commit_sha);
  git('fetch', '--no-tags', 'origin', sha, data.headSha);
  const version = validateTrees(data);
  if (
    pr.head.sha !== data.headSha ||
    git('rev-parse', `${sha}^`) !== data.baseSha ||
    git('rev-parse', `${sha}^{tree}`) !== git('rev-parse', `${data.headSha}^{tree}`)
  ) {
    throw new Error(
      'Merged release differs from the approved snapshot or was merged on a stale base branch.'
    );
  }
  return { pr: String(pr.number), sha, version, tag: `v${version}`, notes: data.notes };
}

/**
 * Select a verified release merge, skipping ordinary pushes.
 */
function select() {
  let number = process.env.RELEASE_PR;
  if (!number) {
    const sha = assertSha(process.env.GITHUB_SHA);
    const matches = api(`commits/${sha}/pulls`).filter(
      (pr) =>
        pr.merged_at &&
        pr.merge_commit_sha === sha &&
        pr.head.ref === BRANCH &&
        pr.head.repo?.full_name === REPOSITORY
    );
    if (!matches.length) {
      output('skip', 'true');
      console.log('Normal merge: no release to publish.');
      return;
    }
    if (matches.length !== 1) throw new Error('Ambiguous release merge.');
    number = String(matches[0].number);
  }
  const release = mergedRelease(number);
  git('checkout', '--detach', release.sha);
  save('selected.json', release);
  output('skip', 'false');
}

/**
 * Compute the artifact's SHA-512 integrity string.
 * @param {string} file Artifact path.
 * @returns {string} npm-compatible integrity.
 */
function integrity(file) {
  return `sha512-${createHash('sha512').update(fs.readFileSync(file)).digest('base64')}`;
}

/**
 * Validate, pack, and publish resumably, or preview without remote writes.
 * @param {object} options Publication options.
 * @param {boolean} options.dryRun Skip all publication writes.
 */
async function publish({ dryRun = false } = {}) {
  if (typeof dryRun !== 'boolean') throw new Error('dryRun must be a boolean.');
  const selected = load('selected.json');
  const release = mergedRelease(selected.pr);
  if (
    JSON.stringify(selected) !== JSON.stringify(release) ||
    git('rev-parse', 'HEAD') !== release.sha
  ) {
    throw new Error('Publication must use the validated release commit.');
  }
  const dir = fs.mkdtempSync(path.join(workspace(), 'package-'));
  const source = path.join(dir, 'source');
  fs.mkdirSync(source);
  const archive = execFileSync('git', ['archive', '--format=tar', release.sha], {
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30_000
  });
  execFileSync('tar', ['-xf', '-', '-C', source], { input: archive, timeout: 30_000 });
  const packed = JSON.parse(
    run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', dir], { cwd: source })
  );
  if (
    packed.length !== 1 ||
    packed[0].name !== PACKAGE ||
    packed[0].version !== release.version ||
    path.basename(packed[0].filename) !== packed[0].filename
  ) {
    throw new Error('npm pack produced an unexpected artifact.');
  }
  const tarball = path.join(dir, packed[0].filename);
  const digest = integrity(tarball);
  const allReleases = releases();
  const existing = allReleases.find((item) => item.tag_name === release.tag);
  if (git('ls-remote', '--tags', 'origin', `refs/tags/${release.tag}`)) {
    git('fetch', '--no-tags', 'origin', `refs/tags/${release.tag}`);
    if (git('rev-parse', 'FETCH_HEAD^{commit}') !== release.sha) {
      throw new Error('Existing version tag points to a different commit.');
    }
  } else if (existing) {
    throw new Error('Existing release is missing its version tag.');
  } else if (!dryRun) {
    gh(
      'api',
      '--method',
      'POST',
      `repos/${REPOSITORY}/git/refs`,
      '-f',
      `ref=refs/tags/${release.tag}`,
      '-f',
      `sha=${release.sha}`
    );
  } else {
    console.log(`Dry run: skipped creating tag ${release.tag} at ${release.sha}.`);
  }
  if (existing && existing.body.trim() !== release.notes.trim()) {
    throw new Error('Existing GitHub Release has different notes.');
  }
  const notesFile = path.join(dir, 'notes.md');
  fs.writeFileSync(notesFile, release.notes + '\n');
  if (!existing && !dryRun) {
    gh(
      'release',
      'create',
      release.tag,
      '--repo',
      REPOSITORY,
      '--target',
      release.sha,
      '--draft',
      '--verify-tag',
      '--title',
      release.tag,
      '--notes-file',
      notesFile
    );
  } else if (!existing) {
    console.log(`Dry run: skipped creating draft GitHub Release ${release.tag}.`);
  }
  const asset = existing?.assets.find((item) => item.name === packed[0].filename);
  if (asset) {
    const downloaded = path.join(dir, 'existing');
    fs.mkdirSync(downloaded);
    gh(
      'release',
      'download',
      release.tag,
      '--repo',
      REPOSITORY,
      '--pattern',
      packed[0].filename,
      '--dir',
      downloaded
    );
    if (integrity(path.join(downloaded, packed[0].filename)) !== digest) {
      throw new Error(
        'Existing release artifact differs from this commit. Refusing to overwrite it.'
      );
    }
  } else if (!dryRun) {
    gh('release', 'upload', release.tag, tarball, '--repo', REPOSITORY);
  } else {
    console.log(
      `Dry run: skipped uploading release asset ${packed[0].filename} to ${release.tag}.`
    );
  }
  const registry = await registryVersion(release.version);
  if (registry) {
    if (registry.dist.integrity !== digest) {
      throw new Error('This npm version already exists with different package contents.');
    }
    console.log('Verified the existing npm publication.');
  } else {
    const latestResponse = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(PACKAGE)}/latest`,
      { signal: AbortSignal.timeout(30_000) }
    );
    if (!latestResponse.ok)
      throw new Error('Could not verify the latest npm version before publishing.');
    const latest = await latestResponse.json();
    if (
      compareVersions(latest.version, release.version) >= 0 ||
      allReleases.some(
        (item) =>
          !item.draft &&
          !item.prerelease &&
          compareVersions(item.tag_name.replace(/^v/, ''), release.version) > 0
      )
    ) {
      throw new Error('A newer release exists. Refusing to publish an older version as latest.');
    }
    if (!dryRun) {
      run('npm', ['publish', tarball, '--provenance', '--access', 'public', '--tag', 'latest'], {
        stdio: 'inherit',
        timeout: 300_000,
        // npm reads the source digest from CI metadata, including on manual retries.
        env: { ...process.env, GITHUB_SHA: release.sha }
      });
    } else {
      console.log(
        `Dry run: skipped publishing ${PACKAGE}@${release.version} to npm with tag latest.`
      );
    }
  }
  if ((!existing || existing.draft) && dryRun) {
    console.log(
      `Dry run: skipped finalizing GitHub Release ${release.tag} and updating its latest status.`
    );
  }
  if (dryRun) {
    console.log(
      `Dry run: validated ${release.tag} at ${release.sha} and packed ${packed[0].filename} (${digest}). ` +
        'No tags, GitHub Releases, release assets, or npm packages were created, uploaded, or modified.'
    );
    return;
  }
  if (!existing || existing.draft) {
    gh(
      'release',
      'edit',
      release.tag,
      '--repo',
      REPOSITORY,
      '--draft=false',
      allReleases.some(
        (item) =>
          !item.draft &&
          !item.prerelease &&
          compareVersions(item.tag_name.replace(/^v/, ''), release.version) > 0
      )
        ? '--latest=false'
        : '--latest'
    );
  }
}

/**
 * Dispatch a validated release command and its supported options.
 */
async function main() {
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY)
    throw new Error('Unexpected release repository.');
  const commands = { prepare, propose, update, check, select, publish };
  const command = commands[process.argv[2]];
  if (!Object.hasOwn(commands, process.argv[2])) throw new Error('Unknown release command.');
  const args = process.argv.slice(3);
  if (args.length && !(command === publish && args.length === 1 && args[0] === '--dry-run')) {
    throw new Error(
      'Only publish accepts the --dry-run option; other arguments are not supported.'
    );
  }
  await command({ dryRun: args.includes('--dry-run') });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Release automation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  bumpVersion,
  compareVersions,
  validateProposal,
  changelogNotes,
  validateNotes,
  renderChangelog,
  releaseFiles,
  metadata,
  validateTrees,
  integrity,
  prepare,
  propose,
  update,
  check,
  select,
  publish
};
