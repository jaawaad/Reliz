# reliz

**Release automation for Node.js** — bump version (semver), update CHANGELOG, run Git Flow or a simple tag-and-push, then optionally publish to npm and create GitHub/GitLab releases. Zero dependencies, configurable, CI-ready. Supports Persian (fa-IR) and Gregorian dates in changelog.

## Features

- **Git Flow or linear**: Full git-flow (release branch, merge to main/develop) or simple commit+tag+push on current branch
- **Configurable**: `.reliz.json` or `reliz` in `package.json`; override via env and CLI
- **Interactive or CI**: Prompts for bump type and confirmation locally; `--ci` or auto-detect CI env for non-interactive
- **Changelog**: Auto-update CHANGELOG from commits or custom command; conventional filter/group; Persian (`fa-IR`) or Gregorian (`en-US`) date
- **Pre-release**: Alpha/beta/rc versions via `--preid` or config
- **Security audit**: Runs `npm audit` before releasing (on by default); reports each vulnerability with severity, a one-line description and the version it's fixed in, and lets you pick which packages to update. Disable via config/flag.
- **Hooks**: `beforeInit`, `beforeRelease`, `afterGitRelease`, `afterBump`, `afterRelease` with template variables
- **Optional**: Conventional-commit bump suggestion, npm publish (tag, OTP), GitHub Release (draft, prerelease), GitLab Release, plugins

## Installation

```bash
npm install --save-dev reliz
```

Add to `package.json`:

```json
{
  "scripts": {
    "release": "reliz",
    "release:patch": "reliz patch",
    "release:minor": "reliz minor",
    "release:major": "reliz major"
  }
}
```

## Usage

```bash
# Interactive: prompt for bump type and confirm
npm run release

# Specify bump type (still asks for confirmation unless -y)
npx reliz patch
npx reliz minor
npx reliz major
npx reliz hotfix

# Pre-release (alpha/beta/rc)
npx reliz patch --preid=beta
npx reliz --preid=alpha

# Non-interactive (CI, or auto-detected in CI env)
npx reliz patch --ci
npx reliz --ci   # uses patch if no bump given

# Skip confirmation
npx reliz patch --yes

# Linear release (no git-flow)
npx reliz patch --no-git-flow

# Dry run
npx reliz patch --dry-run

# Info-only flags (exit after printing)
npx reliz --release-version          # print next version and exit
npx reliz --changelog                # print changelog text and exit
npx reliz --no-increment             # release current version (no bump)
npx reliz --only-version             # prompt only for version, no confirm

# Security audit (on by default before release)
npx reliz patch --no-audit          # skip the security audit for this run
npx reliz patch --audit             # force-enable even if disabled in config

# Other
npx reliz --verbose
npx reliz --config .my-release.json
```

## Configuration

Create `.reliz.json` in the project root (or use `package.json` under `"reliz"`):

```json
{
  "$schema": "./node_modules/reliz/schema/config.schema.json",
  "gitFlow": true,
  "git": {
    "requireUpstream": false,
    "pushArgs": ["--follow-tags"]
  },
  "branches": { "main": "main", "develop": "develop" },
  "releaseBranchPrefix": "release/",
  "changelog": {
    "dateLocale": "en-US",
    "path": "CHANGELOG.md",
    "command": null,
    "releaseNotesCommand": null,
    "includeTypes": ["feat", "fix"],
    "groupByType": false
  },
  "tag": { "prefix": null, "deleteIfExists": true },
  "syncBranches": true,
  "requireCleanWorkingDir": true,
  "allowReleaseFrom": ["develop"],
  "hooks": {
    "beforeInit": [],
    "beforeRelease": ["npm run lint", "npm test"],
    "afterGitRelease": [],
    "afterBump": ["npm run build"],
    "afterRelease": ["echo Released ${version}"]
  },
  "npm": {
    "publish": false,
    "publishPath": ".",
    "tag": "latest",
    "otp": null
  },
  "github": {
    "release": false,
    "tokenRef": "GITHUB_TOKEN",
    "draft": false,
    "preRelease": false
  },
  "gitlab": {
    "release": false,
    "tokenRef": "GITLAB_TOKEN"
  },
  "security": {
    "enabled": true,
    "level": "low",
    "failOn": "high",
    "autoUpdate": false,
    "command": null
  },
  "conventionalCommits": false,
  "preRelease": { "id": null },
  "plugins": []
}
```

### Config options

| Option | Description | Default |
|--------|-------------|--------|
| `gitFlow` | Use git-flow release workflow | `true` |
| `git.requireUpstream` | Require branch to have upstream | `false` |
| `git.pushArgs` | Extra args for `git push` | `["--follow-tags"]` |
| `branches.main` / `branches.develop` | Branch names | `main`, `develop` |
| `releaseBranchPrefix` | Prefix for release branches | `release/` |
| `changelog.dateLocale` | `en-US` (Gregorian) or `fa-IR` (Persian) | `en-US` |
| `changelog.path` | Changelog file path | `CHANGELOG.md` |
| `changelog.command` | Shell command for changelog (vars: `${from}`, `${to}`, `${version}`, `${latestVersion}`) | `null` |
| `changelog.releaseNotesCommand` | Shell command for release notes body | `null` |
| `changelog.includeTypes` | Conventional types to include (e.g. `["feat","fix"]`) | `null` |
| `changelog.groupByType` | Group commits by type in changelog | `false` |
| `tag.prefix` | Tag prefix. `null` (default) auto-resolves: inherits `gitflow.prefix.versiontag` when git-flow is enabled, otherwise falls back to `v`. A string value (including `""`) forces a specific prefix and, under git-flow, keeps `gitflow.prefix.versiontag` in sync. | `null` |
| `tag.deleteIfExists` | Remove existing tag before release | `true` |
| `syncBranches` | Sync main/develop before release (git-flow) | `true` |
| `requireCleanWorkingDir` | Require no uncommitted changes | `true` |
| `allowReleaseFrom` | Branches allowed to run release from | `["develop"]` |
| `hooks.beforeInit` | Commands before any checks | `[]` |
| `hooks.beforeRelease` | Commands before release steps | `[]` |
| `hooks.afterGitRelease` | Commands after git push/tag, before npm/GitHub | `[]` |
| `hooks.afterBump` | Commands after version/changelog update | `[]` |
| `hooks.afterRelease` | Commands after full release | `[]` |
| `npm.publish` | Run `npm publish` after release | `false` |
| `npm.tag` | npm publish dist-tag | `latest` |
| `npm.otp` | 2FA OTP (or set `NPM_OTP` env) | `null` |
| `github.release` | Create GitHub Release | `false` |
| `github.draft` | Create as draft | `false` |
| `github.preRelease` | Mark as prerelease | `false` |
| `gitlab.release` | Create GitLab Release | `false` |
| `security.enabled` | Run `npm audit` before releasing | `true` |
| `security.level` | Minimum severity to report/prompt (`info`/`low`/`moderate`/`high`/`critical`) | `low` |
| `security.failOn` | In CI/non-interactive mode, block the release at this severity or higher | `high` |
| `security.autoUpdate` | Apply all non-major fixes automatically without prompting | `false` |
| `security.command` | Override audit command (must emit npm-style JSON; e.g. for yarn/pnpm) | `null` |
| `conventionalCommits` | Suggest bump from commit messages | `false` |
| `preRelease.id` | Pre-release id (alpha, beta, rc) | `null` |
| `plugins` | Plugin module paths | `[]` |

Hook commands support: `${version}`, `${latestVersion}`, `${changelog}`, `${name}`, `${cwd}`, `${tagName}`, `${branchName}`, `${latestTag}`, `${releaseUrl}` (after GitHub/GitLab release).

### Tag prefix resolution

Reliz resolves the tag prefix once per release and uses the same value for every step (tag creation, pushes, GitHub/GitLab release, summary report, hooks):

1. **Explicit config** — `tag.prefix` set to any string (including `""`) wins. Under git-flow, reliz also syncs `gitflow.prefix.versiontag` so the tag git-flow creates matches the configured prefix.
2. **git-flow inheritance** — when `gitFlow` is enabled and `tag.prefix` is not set, reliz reads `gitflow.prefix.versiontag` from the local git config and uses that (this is what `git flow init` writes).
3. **Fallback** — otherwise `"v"` is used.

After `git flow release finish`, reliz verifies that the expected tag was actually created. If git-flow used a different prefix than expected, reliz finds the real tag and uses it for the rest of the release — the summary report always reflects the tag that was actually created.

### Environment variables

- `RELIZ_CI=1` – enable CI mode (no prompts)
- `RELIZ_BUMP=patch|minor|major|hotfix` – default bump in CI
- `RELIZ_DRY_RUN=1` – dry run
- `RELIZ_YES=1` – skip confirmation
- `RELIZ_NO_GIT_FLOW=1` – linear release
- `RELIZ_PREID=beta` – pre-release id
- `RELIZ_NO_AUDIT=1` – skip the security audit
- `RELIZ_AUDIT=1` – force-enable the security audit
- `GITHUB_TOKEN` – used when `github.release: true` (or set `github.tokenRef`)
- `GITLAB_TOKEN` – used when `gitlab.release: true` (or set `gitlab.tokenRef`)
- `NPM_OTP` – one-time password for npm publish when 2FA enabled

CI is auto-detected when `CI=true`, `GITHUB_ACTIONS`, `GITLAB_CI`, `CIRCLECI`, `TRAVIS`, or `JENKINS_URL` is set.

## Security audit

Before performing the release/publish step, reliz runs `npm audit` (enabled by
default). For every vulnerability at or above `security.level` it prints the
package, severity, a one-line description and the version that fixes it:

```
⚠ 2 vulnerabilities found (1 critical, 1 moderate)

   1. [critical] lodash <4.17.21
        Prototype Pollution
        fixed in 4.17.21
   2. [moderate] axios <0.21.4
        SSRF via redirect
        fixed in 1.0.0 (major / possibly breaking)
```

- **Interactive**: you choose which packages to update (`1,3`, `a` for all
  fixable, or `n`/Enter for none). Selected packages are installed at their
  fixed version, so the change is included in the release commit. Fixes that
  require a major bump are flagged and never selected by `a`.
- **CI / non-interactive** (`--ci`/`--yes`): the release is blocked if any
  vulnerability is `security.failOn` or higher. Set `security.autoUpdate: true`
  to instead apply all non-major fixes automatically.
- **No lockfile / non-npm project**: skipped with a warning (set
  `security.command` to provide a yarn/pnpm equivalent that emits npm-style JSON).

Disable it with `security.enabled: false`, `--no-audit`, or `RELIZ_NO_AUDIT=1`.

## Plugins

Plugins are modules loaded from `config.plugins` (paths relative to cwd or module names). A plugin can export any of:

- `init(context)` – run once at start
- `getLatestVersion(context)` – optional version override
- `bump(context)` – optional bump step
- `beforeRelease(context)` – before release steps
- `release(context)` – after our release (can return Promise)
- `afterRelease(context)` – after hooks

Context contains: `cwd`, `config`, `version`, `latestVersion`, `changelog`, `name`, `tagName`, `branchName`, `latestTag`, `releaseUrl`, etc.

## Programmatic API

```js
const { loadConfig, run } = require('reliz');

const { config, argv } = loadConfig(process.cwd(), ['patch', '--ci']);
run(); // uses process.argv; or use individual modules (git, changelog, version, etc.)
```

## License

MIT
