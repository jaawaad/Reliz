'use strict';

const path = require('path');
const { execSync } = require('child_process');
const { getCurrentBranch, createTag, pushTag, pushBranch } = require('./git.js');
const { setPackageVersion } = require('./version.js');
const { appendChangelogEntry } = require('./changelog.js');
const { interpolate } = require('./hooks.js');

/**
 * Linear release: bump version and changelog on current branch, commit, tag, push.
 * No git-flow. Uses context.commits and context.dateStr from orchestration.
 * @param {{ cwd: string, config: object, version: string, dryRun: boolean, commits: string[], dateStr: string }} context
 */
function performLinearRelease(context) {
  const { cwd, config, version: newVersion, dryRun, changelogText, dateStr } = context;

  console.log('Starting linear release (no git-flow)...');

  const commitMessage = interpolate(config.commitMessage || 'release: update version to ${version} and changelog', { version: newVersion });
  const changelogPath = path.join(cwd, config.changelog?.path || 'CHANGELOG.md');

  if (!dryRun) {
    setPackageVersion(cwd, newVersion);
    appendChangelogEntry(changelogPath, newVersion, dateStr, changelogText, config.changelog?.template);

    console.log('Committing...');
    execSync('git add .', { stdio: 'inherit', cwd });
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { stdio: 'inherit', cwd });
  } else {
    console.log('[dry-run] Would update package.json and CHANGELOG, then commit.');
  }

  const tagName = createTag(newVersion, config.tag || {}, config.tagMessage, dryRun);
  const pushArgs = config.git?.pushArgs || [];
  if (!dryRun) {
    const branch = getCurrentBranch();
    pushBranch(branch, false, pushArgs);
    pushTag(tagName, false, pushArgs);
  } else {
    console.log('[dry-run] Would push branch and tag.');
  }

  console.log('Linear release completed successfully.');
}

module.exports = {
  performLinearRelease
};
