'use strict';

const { execSync } = require('child_process');

/**
 * Run a git command silently and return stdout (trimmed), or null on failure.
 * Stderr is suppressed — intended for probes where "command fails" simply
 * means "thing does not exist".
 *
 * @param {string} cmd
 * @param {string} [cwd]
 * @returns {string|null}
 */
function execSilent(cmd, cwd) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      cwd
    }).replace(/\n$/, '');
  } catch (_) {
    return null;
  }
}

/**
 * Read git-flow's configured version tag prefix.
 *
 * Returns:
 *   - a string (possibly empty) when `gitflow.prefix.versiontag` is set
 *   - `null` when git-flow has not been initialised in this repository
 *
 * @param {string} [cwd]
 * @returns {string|null}
 */
function getGitFlowVersionTagPrefix(cwd) {
  return execSilent('git config --get gitflow.prefix.versiontag', cwd);
}

/**
 * Align git-flow's `gitflow.prefix.versiontag` with the supplied prefix so that
 * the tag git-flow creates during `release finish` matches what reliz expects.
 * No-op in dry-run.
 *
 * @param {string} prefix
 * @param {string} [cwd]
 * @param {boolean} [dryRun]
 */
function syncGitFlowVersionTagPrefix(prefix, cwd, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] Would set gitflow.prefix.versiontag="${prefix}"`);
    return;
  }
  const safe = String(prefix).replace(/"/g, '\\"');
  execSync(`git config gitflow.prefix.versiontag "${safe}"`, {
    stdio: ['ignore', 'ignore', 'pipe'],
    cwd
  });
}

/**
 * Resolve the effective tag prefix for a release.
 *
 * Resolution order:
 *   1. `config.tag.prefix` when explicitly set to a string (including `""`).
 *      Source: `"config"`.
 *   2. When `config.gitFlow` is not disabled and the repository has
 *      `gitflow.prefix.versiontag` configured, inherit that value.
 *      Source: `"gitflow"`.
 *   3. Otherwise fall back to `"v"` for backwards compatibility.
 *      Source: `"default"`.
 *
 * @param {object} config
 * @param {string} [cwd]
 * @returns {{ prefix: string, source: 'config'|'gitflow'|'default' }}
 */
function resolveTagPrefix(config, cwd) {
  const explicit = config && config.tag ? config.tag.prefix : undefined;
  if (typeof explicit === 'string') {
    return { prefix: explicit, source: 'config' };
  }
  const useGitFlow = !config || config.gitFlow !== false;
  if (useGitFlow) {
    const fromGitFlow = getGitFlowVersionTagPrefix(cwd);
    if (fromGitFlow !== null) {
      return { prefix: fromGitFlow, source: 'gitflow' };
    }
  }
  return { prefix: 'v', source: 'default' };
}

/**
 * @param {string} prefix
 * @param {string} version
 * @returns {string}
 */
function buildTagName(prefix, version) {
  return prefix ? `${prefix}${version}` : version;
}

/**
 * List all local git tags.
 * @param {string} [cwd]
 * @returns {string[]}
 */
function listLocalTags(cwd) {
  const out = execSilent('git tag', cwd) || '';
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

/**
 * @param {string} remote
 * @param {string} branch
 * @param {string} [cwd]
 * @returns {boolean}
 */
function remoteBranchExists(remote, branch, cwd) {
  const out = execSilent(`git ls-remote --heads ${remote} ${branch}`, cwd);
  return !!out;
}

/**
 * @param {string} remote
 * @param {string} tag
 * @param {string} [cwd]
 * @returns {boolean}
 */
function remoteTagExists(remote, tag, cwd) {
  const out = execSilent(`git ls-remote --tags ${remote} refs/tags/${tag}`, cwd);
  return !!out;
}

/**
 * Verify that the expected tag was actually created locally. If it was not, try
 * to locate an alternative tag whose name matches the version (common when
 * git-flow used a different version tag prefix than reliz expected).
 *
 * @param {string} expectedTagName
 * @param {string} version
 * @param {string} [cwd]
 * @returns {{ tagName: string, matched: boolean, missing: boolean, alternative: boolean }}
 */
function verifyCreatedTag(expectedTagName, version, cwd) {
  const localTags = listLocalTags(cwd);
  if (localTags.includes(expectedTagName)) {
    return { tagName: expectedTagName, matched: true, missing: false, alternative: false };
  }
  const alt = localTags.find(t => t === version || t.endsWith(version));
  if (alt) {
    return { tagName: alt, matched: false, missing: false, alternative: true };
  }
  return { tagName: expectedTagName, matched: false, missing: true, alternative: false };
}

module.exports = {
  execSilent,
  getGitFlowVersionTagPrefix,
  syncGitFlowVersionTagPrefix,
  resolveTagPrefix,
  buildTagName,
  listLocalTags,
  remoteBranchExists,
  remoteTagExists,
  verifyCreatedTag
};
