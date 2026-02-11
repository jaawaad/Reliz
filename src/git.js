'use strict';

const { execSync } = require('child_process');
const path = require('path');

/**
 * @returns {string|null} Latest tag name or null if none
 */
function getLatestTag() {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} [fromTag] - optional, defaults to latest tag
 * @returns {string[]}
 */
function getNewCommits(fromTag = null) {
  const lastTag = fromTag !== undefined && fromTag !== null ? fromTag : getLatestTag();
  try {
    if (!lastTag) throw new Error('No tag');
    const commits = execSync(`git log ${lastTag}..HEAD --oneline --no-merges`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^[a-f0-9]{7,}\s+/, ''));
    return commits;
  } catch (_) {
    const commits = execSync('git log --oneline --no-merges', { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.replace(/^[a-f0-9]{7,}\s+/, ''));
    return commits;
  }
}

function ensureCleanWorkingTree() {
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  if (status) {
    throw new Error('You have uncommitted changes. Please commit or stash them before running the release script.');
  }
}

function ensureOriginRemote() {
  try {
    execSync('git remote get-url origin', { stdio: 'ignore' });
    execSync('git ls-remote --exit-code origin', { stdio: 'ignore' });
  } catch (e) {
    throw new Error('Remote "origin" does not exist or is not reachable.');
  }
}

function getCurrentBranch() {
  return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
}

/**
 * Ensure current branch has an upstream. Throws if not and requireUpstream is true.
 * @param {string} branch
 * @param {boolean} requireUpstream
 */
function ensureUpstream(branch, requireUpstream) {
  if (!requireUpstream) return;
  try {
    execSync(`git rev-parse --abbrev-ref "${branch}@{upstream}"`, { encoding: 'utf8', shell: true });
  } catch (_) {
    throw new Error(`Branch "${branch}" has no upstream. Push the branch first or set git.requireUpstream: false.`);
  }
}

function ensureGitFlowInstalled() {
  try {
    execSync('git flow version', { stdio: 'ignore' });
  } catch (e) {
    throw new Error('git flow is not installed. Please install it before running the release script.');
  }
}

/**
 * @param {string} version
 * @param {object} tagConfig - { prefix, deleteIfExists }
 * @param {boolean} dryRun
 */
function ensureTagNotExists(version, tagConfig, dryRun) {
  const prefix = tagConfig.prefix || 'v';
  const tagName = prefix ? `${prefix}${version}` : version;
  try {
    const localTags = execSync('git tag', { encoding: 'utf8' }).split('\n').filter(Boolean);
    if (localTags.includes(tagName)) {
      if (dryRun) {
        console.log(`[dry-run] Would delete local tag ${tagName}`);
      } else {
        execSync(`git tag -d ${tagName}`);
        console.log(`Deleted local tag ${tagName}`);
      }
    }
    const remoteTags = execSync('git ls-remote --tags origin', { encoding: 'utf8' });
    if (remoteTags.includes(`refs/tags/${tagName}`)) {
      if (dryRun) {
        console.log(`[dry-run] Would delete remote tag ${tagName}`);
      } else {
        execSync(`git push origin :refs/tags/${tagName}`);
        console.log(`Deleted remote tag ${tagName}`);
      }
    }
  } catch (_) {}
}

/**
 * @param {string} version
 * @param {object} tagConfig - { prefix }
 * @param {string} tagMessage
 * @param {boolean} dryRun
 */
function createTag(version, tagConfig, tagMessage, dryRun) {
  const prefix = tagConfig.prefix || 'v';
  const tagName = prefix ? `${prefix}${version}` : version;
  const msg = (tagMessage || `Release ${version}`).replace(/\$\{version\}/g, version);
  if (dryRun) {
    console.log(`[dry-run] Would create tag ${tagName}`);
    return tagName;
  }
  execSync(`git tag -a ${tagName} -m "${msg.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
  return tagName;
}

/**
 * @param {string} tagName
 * @param {boolean} dryRun
 * @param {string[]} [pushArgs]
 */
function pushTag(tagName, dryRun, pushArgs = []) {
  if (dryRun) {
    console.log(`[dry-run] Would push tag ${tagName}`);
    return;
  }
  const args = [].concat(pushArgs || []).filter(Boolean);
  const extra = args.length ? ' ' + args.join(' ') : '';
  execSync(`git push origin ${tagName}${extra}`, { stdio: 'inherit' });
}

/**
 * @param {string} branch
 * @param {boolean} dryRun
 * @param {string[]} [pushArgs]
 */
function pushBranch(branch, dryRun, pushArgs = []) {
  if (dryRun) {
    console.log(`[dry-run] Would push branch ${branch}`);
    return;
  }
  const args = [].concat(pushArgs || []).filter(Boolean);
  const extra = args.length ? ' ' + args.join(' ') : '';
  execSync(`git push origin ${branch}${extra}`, { stdio: 'inherit' });
}

module.exports = {
  getLatestTag,
  getNewCommits,
  ensureCleanWorkingTree,
  ensureOriginRemote,
  getCurrentBranch,
  ensureUpstream,
  ensureGitFlowInstalled,
  ensureTagNotExists,
  createTag,
  pushTag,
  pushBranch
};
