'use strict';

const fs = require('fs');
const path = require('path');

const BUMP_TYPES = ['patch', 'minor', 'major', 'hotfix'];

function getDefaults() {
  return {
    gitFlow: true,
    git: {
      requireUpstream: false,
      pushArgs: ['--follow-tags']
    },
    branches: {
      main: 'main',
      develop: 'develop'
    },
    releaseBranchPrefix: 'release/',
    changelog: {
      dateLocale: 'fa-IR',
      path: 'CHANGELOG.md',
      template: null,
      command: null,
      releaseNotesCommand: null,
      includeTypes: null,
      groupByType: false
    },
    tag: {
      prefix: 'v',
      deleteIfExists: true
    },
    syncBranches: true,
    requireCleanWorkingDir: true,
    allowReleaseFrom: ['develop'],
    hooks: {
      beforeInit: [],
      beforeRelease: [],
      afterBump: [],
      afterGitRelease: [],
      afterRelease: []
    },
    npm: {
      publish: false,
      publishPath: '.',
      tag: 'latest',
      otp: null
    },
    github: {
      release: false,
      tokenRef: 'GITHUB_TOKEN',
      draft: false,
      preRelease: false
    },
    gitlab: {
      release: false,
      tokenRef: 'GITLAB_TOKEN'
    },
    conventionalCommits: false,
    commitMessage: 'release: update version to ${version} and changelog',
    tagMessage: 'Release-${version}',
    preRelease: { id: null },
    plugins: []
  };
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] != null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      out[key] = deepMerge(out[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

function findConfigFile(cwd, explicitPath) {
  if (explicitPath) {
    const p = path.isAbsolute(explicitPath) ? explicitPath : path.join(cwd, explicitPath);
    return fs.existsSync(p) ? p : null;
  }
  const names = ['.reliz.json', '.relizrc.json'];
  for (const name of names) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) return p;
  }
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.reliz != null) return { fromPackage: true, pkg, pkgPath };
    } catch (_) {}
  }
  return null;
}

function loadFromFile(cwd, explicitPath) {
  const found = findConfigFile(cwd, explicitPath);
  if (!found) return {};
  if (typeof found === 'object' && found.fromPackage) {
    return found.pkg.reliz || {};
  }
  try {
    return JSON.parse(fs.readFileSync(found, 'utf8'));
  } catch (e) {
    return {};
  }
}

function loadFromEnv() {
  const env = process.env;
  const out = {};
  if (env.RELIZ_CI === '1' || env.RELIZ_CI === 'true') out.ci = true;
  if (env.RELIZ_BUMP && BUMP_TYPES.includes(env.RELIZ_BUMP)) out.bump = env.RELIZ_BUMP;
  if (env.RELIZ_DRY_RUN === '1' || env.RELIZ_DRY_RUN === 'true') out.dryRun = true;
  if (env.RELIZ_NO_GIT_FLOW === '1' || env.RELIZ_NO_GIT_FLOW === 'true') out.noGitFlow = true;
  if (env.RELIZ_YES === '1' || env.RELIZ_YES === 'true') out.yes = true;
  if (env.RELIZ_PREID) out.preid = env.RELIZ_PREID;
  return out;
}

function parseArgv(argv) {
  const args = argv || process.argv.slice(2);
  const out = {
    bump: null,
    ci: false,
    dryRun: false,
    noGitFlow: false,
    yes: false,
    config: null,
    preid: null,
    noIncrement: false,
    releaseVersion: false,
    onlyVersion: false,
    changelog: false,
    verbose: false
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--ci') out.ci = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--no-git-flow') out.noGitFlow = true;
    else if (a === '--yes' || a === '-y') out.yes = true;
    else if (a === '--no-increment') out.noIncrement = true;
    else if (a === '--release-version') out.releaseVersion = true;
    else if (a === '--only-version') out.onlyVersion = true;
    else if (a === '--changelog') out.changelog = true;
    else if (a === '--verbose' || a === '-V') out.verbose = true;
    else if (a === '--config' && args[i + 1]) { out.config = args[++i]; }
    else if (a.startsWith('--bump=')) out.bump = a.slice(7);
    else if (a.startsWith('--preid=')) out.preid = a.slice(8);
    else if (!a.startsWith('--') && BUMP_TYPES.includes(a)) out.bump = a;
  }
  return out;
}

/**
 * Detect if running in a CI environment.
 * @returns {boolean}
 */
function isCiEnv() {
  const env = process.env;
  return (
    env.CI === 'true' ||
    env.CI === '1' ||
    !!env.GITHUB_ACTIONS ||
    !!env.GITLAB_CI ||
    !!env.CIRCLECI ||
    !!env.TRAVIS ||
    !!env.JENKINS_URL
  );
}

/**
 * Load and merge config: defaults + file + env + argv.
 * @param {string} cwd - Working directory
 * @param {string[]} [argv] - CLI argv (default: process.argv.slice(2))
 * @returns {{ config: object, argv: { bump, ci, dryRun, noGitFlow, yes, config } }}
 */
function loadConfig(cwd, argv) {
  const defaults = getDefaults();
  const parsed = parseArgv(argv);
  const fileConfig = parsed.config ? loadFromFile(cwd, parsed.config) : loadFromFile(cwd, null);
  const envOverrides = loadFromEnv();

  let config = deepMerge(defaults, fileConfig);

  if (envOverrides.ci) config = { ...config, ci: true };
  if (envOverrides.dryRun) config = { ...config, dryRun: true };
  if (envOverrides.bump) config = { ...config, bump: envOverrides.bump };

  const preid = parsed.preid || envOverrides.preid || config.preRelease?.id || null;
  if (preid) config = { ...config, preRelease: { ...config.preRelease, id: preid } };

  const isCi = parsed.ci || config.ci === true || (config.ci !== false && isCiEnv());
  if (isCi) config = { ...config, ci: true };

  return {
    config,
    argv: {
      bump: parsed.bump || envOverrides.bump || null,
      ci: isCi,
      dryRun: parsed.dryRun || config.dryRun === true,
      noGitFlow: parsed.noGitFlow || false,
      yes: parsed.yes || false,
      config: parsed.config,
      preid: preid || null,
      noIncrement: parsed.noIncrement || false,
      releaseVersion: parsed.releaseVersion || false,
      onlyVersion: parsed.onlyVersion || false,
      changelog: parsed.changelog || false,
      verbose: parsed.verbose || false
    }
  };
}

module.exports = {
  loadConfig,
  getDefaults,
  parseArgv,
  isCiEnv,
  BUMP_TYPES
};
