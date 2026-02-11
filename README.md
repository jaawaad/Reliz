# reliz

**Release automation for Node.js** — bump version (semver), update CHANGELOG, run Git Flow or a simple tag-and-push, then optionally publish to npm and create GitHub/GitLab releases. Zero dependencies, configurable, CI-ready. Supports Persian (fa-IR) and Gregorian dates in changelog.

## Features

- **Git Flow or linear**: Full git-flow (release branch, merge to main/develop) or simple commit+tag+push on current branch
- **Configurable**: `.reliz.json` or `reliz` in `package.json`; override via env and CLI
- **Interactive or CI**: Prompts for bump type and confirmation locally; `--ci` or auto-detect CI env for non-interactive
- **Changelog**: Auto-update CHANGELOG from commits or custom command; conventional filter/group; Persian (`fa-IR`) or Gregorian (`en-US`) date
- **Pre-release**: Alpha/beta/rc versions via `--preid` or config
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
    "dateLocale": "fa-IR",
    "path": "CHANGELOG.md",
    "command": null,
    "releaseNotesCommand": null,
    "includeTypes": ["feat", "fix"],
    "groupByType": false
  },
  "tag": { "prefix": "v", "deleteIfExists": true },
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
| `changelog.dateLocale` | `fa-IR` (Persian) or `en-US` | `fa-IR` |
| `changelog.path` | Changelog file path | `CHANGELOG.md` |
| `changelog.command` | Shell command for changelog (vars: `${from}`, `${to}`, `${version}`, `${latestVersion}`) | `null` |
| `changelog.releaseNotesCommand` | Shell command for release notes body | `null` |
| `changelog.includeTypes` | Conventional types to include (e.g. `["feat","fix"]`) | `null` |
| `changelog.groupByType` | Group commits by type in changelog | `false` |
| `tag.prefix` | Tag prefix (e.g. `v`) | `v` |
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
| `conventionalCommits` | Suggest bump from commit messages | `false` |
| `preRelease.id` | Pre-release id (alpha, beta, rc) | `null` |
| `plugins` | Plugin module paths | `[]` |

Hook commands support: `${version}`, `${latestVersion}`, `${changelog}`, `${name}`, `${cwd}`, `${tagName}`, `${branchName}`, `${latestTag}`, `${releaseUrl}` (after GitHub/GitLab release).

### Environment variables

- `RELIZ_CI=1` – enable CI mode (no prompts)
- `RELIZ_BUMP=patch|minor|major|hotfix` – default bump in CI
- `RELIZ_DRY_RUN=1` – dry run
- `RELIZ_YES=1` – skip confirmation
- `RELIZ_NO_GIT_FLOW=1` – linear release
- `RELIZ_PREID=beta` – pre-release id
- `GITHUB_TOKEN` – used when `github.release: true` (or set `github.tokenRef`)
- `GITLAB_TOKEN` – used when `gitlab.release: true` (or set `gitlab.tokenRef`)
- `NPM_OTP` – one-time password for npm publish when 2FA enabled

CI is auto-detected when `CI=true`, `GITHUB_ACTIONS`, `GITLAB_CI`, `CIRCLECI`, `TRAVIS`, or `JENKINS_URL` is set.

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
