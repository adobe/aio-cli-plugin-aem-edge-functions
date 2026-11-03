# Contributing

Thanks for choosing to contribute!

The following are a set of guidelines to follow when contributing to this project.

## Code Of Conduct

This project adheres to the Adobe [code of conduct](../CODE_OF_CONDUCT.md). By participating,
you are expected to uphold this code. Please report unacceptable behavior to
[Grp-opensourceoffice@adobe.com](mailto:Grp-opensourceoffice@adobe.com).

## Have A Question?

Start by filing an issue. The existing committers on this project work to reach
consensus around project direction and issue solutions within issue threads
(when appropriate).

## Contributor License Agreement

All third-party contributions to this project must be accompanied by a signed contributor
license agreement. This gives Adobe permission to redistribute your contributions
as part of the project. [Sign our CLA](https://opensource.adobe.com/cla.html). You
only need to submit an Adobe CLA one time, so if you have submitted one previously,
you are good to go!

## Code Reviews

All submissions should come in the form of pull requests and need to be reviewed
by project committers. Read [GitHub's pull request documentation](https://help.github.com/articles/about-pull-requests/)
for more information on sending pull requests.

Lastly, please follow the [pull request template](PULL_REQUEST_TEMPLATE.md) when
submitting a pull request!

## Releases

Every normal merge to `main`, including documentation and CI changes, creates or
refreshes one rolling PR from `automation/release`. Leave that PR open to collect
changes; merging it is the maintainer's decision to publish. Do not bump the
package version or add a new version heading in ordinary feature PRs.

GitHub Agentic Workflows, using its Copilot engine, proposes a patch or minor bump
and changelog entries from all commits, merged PR descriptions, and the aggregate
diff since the last successful release.
The package lockfile and generated `*.lock.yml` workflow diffs are excluded from
the prompt; dependency changes remain visible in `package.json` and workflow
behavior in its Markdown source. Evidence exceeding 180,000 UTF-8 bytes or invalid
AI output fails visibly rather than silently omitting changes. Docs/CI-only releases default to patch. Breaking
changes make the release PR a draft and fail its readiness check until explicitly
approved by a maintainer.

The automation recalculates from the published version on every refresh: multiple
fixes after `1.1.0` still propose `1.1.1`; a feature changes that proposal to
`1.2.0`. It only changes the package version, lockfile version metadata, and one
new changelog section. Historical changelog entries and dependency resolutions
are preserved.

### One-time repository configuration

1. Install a GitHub App on this repository with **Contents: write**,
   **Pull requests: write**, and **Issues: write** (for the release label).
   Set Actions variable `RELEASE_APP_ID` and secret `RELEASE_APP_PRIVATE_KEY`.
   Tokens are minted only in the deterministic proposal job, restricted to this
   repository, and revoked at job completion. The App key and token are never
   passed to the AI job. App-authored PR updates trigger ordinary CI automatically.
2. Set Actions secret `COPILOT_GITHUB_TOKEN` to a fine-grained PAT owned by a
   user account, with **Account permissions > Copilot Requests: Read** and an
   active Copilot subscription. The workflow currently uses this standard
   Agentic Workflows authentication path; requests use that user's allowance.
   The old `RELEASE_COPILOT_TOKEN` and `RELEASE_COPILOT_MODEL` settings are no
   longer used. Review Adobe's approval and data-handling requirements first.
   If Adobe enables centralized Copilot billing for Actions, change
   `permissions.copilot-requests` from `none` to `write` in the workflow source
   and recompile. That mode uses the short-lived Actions token instead of the
   PAT and bills the organization; it does not replace the PR-writing App.
3. Configure npm trusted publishing for this repository and the existing workflow
   filename **`on-push-publish-to-npm.yml`**. Publishing uses GitHub-hosted runners,
   Node 24, OIDC, and provenance; no long-lived npm token is required.
4. Require the **`release-readiness`** check and ordinary CI checks before merging
   to `main`. Require branches to be up to date and dismiss stale approvals.
   Once the first release PR exists, run **Release readiness** manually to
   register its check if necessary.
   The readiness workflow also issues a passing check for ordinary PRs, including
   forks. It uses `pull_request_target` solely to read Git objects with scripts
   checked out from trusted `main`; it never checks out or executes PR code.
5. Protect version tags from modification/deletion. Do not use auto-merge or a
   merge queue for the rolling release PR; review its final, current-main
   snapshot. Use a normal merge, squash merge, or single-commit rebase merge.
   Do not use GitHub's **Update branch** button: refresh through the preparation
   workflow instead, which keeps the release branch to one generated commit.

The initial baseline is npm `1.1.0` at commit
`3dd5055ce598bfbec8622abf0f4ebb55dadf9871`, verified against npm's `gitHead`.
No historical tag or GitHub Release is created automatically. After the first
automated release, the highest stable `vX.Y.Z` GitHub Release and its verified
tag become the baseline. A release is only complete after npm publication and
GitHub Release finalization.

### Maintainer overrides

Use **Actions > Prepare release PR > Run workflow**, selecting `main`:

- `bump`: `auto`, `patch`, `minor`, or an explicitly chosen `major`.
- `notes`: optional curated Markdown sections, such as `### Fixed` followed by
  bullet points. Omit the `## [version] - date` heading.
- `approve_breaking`: explicitly approve detected breaking changes for this
  snapshot; normally combine this with a deliberate version-bump choice.

Overrides and breaking-change approval apply only to the current main snapshot.
New merges clear bump/approval overrides. If curated notes would become stale,
the workflow stops and preserves them until a maintainer supplies refreshed
notes. Direct edits to the bot-owned branch are never silently overwritten:
preserve them separately and restore the branch to its recorded generated head
before rerunning. Edits to the PR's displayed prose do not alter the generated
changelog.

The agent runs in the Agentic Workflows firewall sandbox without a repository
checkout, shell, file-editing tools, GitHub tools, or custom repository
instructions. It reads the collected evidence and submits one JSON proposal
through a custom safe-output tool. Network egress is denied apart from
framework-managed inference. The deterministic proposal job runs separately,
requires successful agent execution and threat detection, validates the JSON,
then edits the three release files. AI output is never executed. Missing,
duplicate, invalid, or blocked proposals fail the workflow rather than silently
leaving the release PR unchanged. Diagnostic reports stay in the run logs and
summaries rather than opening issues.

### Editing the agentic workflow

The source is `.github/workflows/on-push-create-release-pr.md`; Actions executes
the generated `on-push-create-release-pr.lock.yml`. The compiler and runtime
actions are pinned to **gh-aw v0.92.0**, with action commit and container digest
pins recorded in the generated workflow. Use the same compiler when regenerating:

```bash
gh extension install github/gh-aw --pin v0.92.0
gh aw compile on-push-create-release-pr --validate --shellcheck
```

Install ShellCheck locally for the second command. Format the source before
compiling. Commit both workflow files, `.github/aw/actions-lock.json`, and the
generated `.gitattributes` rule. Do not hand-edit the lock file. Set an optional
`engine.model` in the source and recompile to select a model allowed by Adobe's
Copilot policy. Review compiler/runtime dependency updates before adopting them.

For preview-only execution, set `safe-outputs.staged: true` in the source and
recompile, or compile with `--staged`. The custom proposal job checks the
activation job's immutable `info` artifact, including its staging and dry-run
flags, before minting the App token or writing a PR. Missing or inconsistent run
metadata fails closed. Preview runs still perform inference and validation, but
do not update the release branch or PR. Restore the production configuration and
recompile before committing the production lock file.

### Publication and recovery

**Publication is currently dry-run only.** Release PR creation and refresh remain
enabled. The publish workflow calls `node .github/scripts/release.js publish --dry-run`
with read-only repository permissions and no OIDC permission. After a release PR
is merged, it validates the approved commit, packs the immutable source locally,
and checks existing tags, assets, and npm versions for conflicts. It does not
create or push tags, create/finalize GitHub Releases, upload release assets, or
publish npm packages. The logs explicitly identify the run as a dry run.

A dry run does not advance the published baseline. After merging a test release
PR, preparation of the next release will remain blocked by its unpublished
version. To publish that same approved release later, remove `--dry-run`, restore
`contents: write` and `id-token: write` in the publish workflow, then manually
dispatch it with the merged PR number. Do not merge test release PRs if you want
to continue collecting changes without advancing the version on `main`.

The following describes publication once dry-run mode is deliberately disabled:

Merging the labeled release PR triggers `on-push-publish-to-npm.yml`. It verifies
the exact approved snapshot and checks out the merge SHA, not the latest main.
After installation, lint, and tests, it packs an archive of that commit, creates
the immutable `vX.Y.Z` tag and a draft GitHub Release, attaches the npm tarball,
publishes that same tarball to npm, and finally makes the GitHub Release public.
New normal merges do not publish merely because `package.json` changed.

If publication fails, fix the external cause and rerun the failed job, or run
**on-push-publish-to-npm > Run workflow** on `main` with the merged release PR
number. Existing tags must point to the same commit, existing release assets
must match the tarball, and existing npm versions must have the same SHA-512
integrity. A retry after npm succeeds only finalizes the draft release; it does
not republish the version or overwrite conflicting artifacts.

Preparation and publication share a non-canceling concurrency group with queued
runs, so another preparation cannot replace a pending publication. If a newer
merge arrives during preparation, the outdated proposal fails instead of
overwriting newer state. A pending/failed publication blocks another version
proposal. Once recovered, rerun **Prepare release PR** if newer main changes
already arrived. Neither publication nor a release PR is identified by a commit
title alone.

## From Contributor To Committer

We love contributions from our community! If you'd like to go a step beyond contributor
and become a committer with full write access and a say in the project, you must
be invited to the project. The existing committers employ an internal nomination
process that must reach lazy consensus (silence is approval) before invitations
are issued. If you feel you are qualified and want to get more deeply involved,
feel free to reach out to existing committers to have a conversation about that.

## Security Issues

Security issues shouldn't be reported on this issue tracker. Instead, [file an issue to our security experts](https://helpx.adobe.com/security/alertus.html).
