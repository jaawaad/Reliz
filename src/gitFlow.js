'use strict';

const { execSync } = require('child_process');
const path = require('path');
const { setPackageVersion } = require('./version.js');
const { appendChangelogEntry } = require('./changelog.js');

/**
 * @param {{ currentBranch: string, config: object }} context
 */
function syncBranches(context) {
  const { currentBranch, config } = context;
  const main = config.branches?.main || 'main';
  const develop = config.branches?.develop || 'develop';
  console.log('Fetching all branches...');
  execSync('git fetch --all --prune', { stdio: 'inherit' });
  console.log('Pulling main...');
  execSync(`git fetch origin ${main}`, { stdio: 'inherit' });
  execSync(`git branch --force ${main} origin/${main}`, { stdio: 'inherit' });
  console.log('Pulling develop...');
  execSync(`git fetch origin ${develop}`, { stdio: 'inherit' });
  if (currentBranch !== develop) {
    execSync(`git branch --force ${develop} origin/${develop}`, { stdio: 'inherit' });
  } else {
    console.log('Skipping force update for develop (currently checked out).');
  }
  console.log('Branches are up to date.');
}

/**
 * Update package.json and CHANGELOG. Uses context.commits, context.dateStr, context.version.
 * @param {{ cwd: string, config: object, version: string, commits: string[], dateStr: string }} context
 */
function updateFiles(context) {
  const { cwd, config, version, commits, dateStr } = context;
  setPackageVersion(cwd, version);
  const changelogPath = path.join(cwd, config.changelog?.path || 'CHANGELOG.md');
  appendChangelogEntry(changelogPath, version, dateStr, commits, config.changelog?.template);
}

/**
 * @param {{ cwd: string, config: object, version: string, currentBranch: string, dryRun: boolean, commits: string[], dateStr: string }} context
 */
function performGitFlowRelease(context) {
  const { cwd, config, version: newVersion, currentBranch, dryRun, commits, dateStr } = context;
  const main = config.branches?.main || 'main';
  const develop = config.branches?.develop || 'develop';
  const prefix = config.releaseBranchPrefix || 'release/';
  const releaseBranch = `${prefix}${newVersion}`;
  const updateContext = { ...context, version: newVersion };

  console.log('Starting git flow release process...');

  let releaseBranchExists = false;
  try {
    const branches = execSync('git branch', { encoding: 'utf8', cwd });
    if (branches.includes(releaseBranch)) releaseBranchExists = true;
  } catch (_) {}

  if (!releaseBranchExists) {
    console.log(`Creating release branch: ${releaseBranch}`);
    if (!dryRun) execSync(`git flow release start ${newVersion}`, { stdio: 'inherit', cwd });
  } else {
    console.log(`Release branch ${releaseBranch} already exists.`);
    if (!dryRun) execSync(`git checkout ${releaseBranch}`, { stdio: 'inherit', cwd });
  }

  if (!dryRun) {
    updateFiles(updateContext);
    const commitMsg = (config.commitMessage || 'release: update version to ${version} and changelog').replace(/\$\{version\}/g, newVersion);
    console.log('Committing updated files...');
    execSync('git add .', { stdio: 'inherit', cwd });
    execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { stdio: 'inherit', cwd });

    const pushArgs = (config.git?.pushArgs || []).filter(Boolean);
    const pushSuffix = pushArgs.length ? ' ' + pushArgs.join(' ') : '';

    console.log('Pushing release branch...');
    try {
      execSync('git push origin HEAD' + pushSuffix, { stdio: 'inherit', cwd });
    } catch (pushErr) {
      if (pushErr.message && pushErr.message.includes('non-fast-forward')) {
        try {
          execSync(`git pull --rebase origin ${releaseBranch}`, { stdio: 'inherit', cwd });
          execSync('git push origin HEAD' + pushSuffix, { stdio: 'inherit', cwd });
        } catch (rebaseErr) {
          throw new Error('Push after rebase failed. Please resolve conflicts and push manually.');
        }
      } else throw pushErr;
    }

    const tagMsg = (config.tagMessage || `Release-${newVersion}`).replace(/\$\{version\}/g, newVersion);
    console.log(`Finishing git flow release: ${newVersion}`);
    execSync(`GIT_MERGE_AUTOEDIT=no GIT_EDITOR=true git flow release finish -m "${tagMsg}" ${newVersion}`, { stdio: 'inherit', cwd });

    console.log('Pushing all branches and tags...');
    execSync(`git push origin ${develop}${pushSuffix}`, { stdio: 'inherit', cwd });
    execSync(`git push origin ${main}${pushSuffix}`, { stdio: 'inherit', cwd });

    const tagPrefix = config.tag?.prefix ?? 'v';
    const tagName = tagPrefix ? `${tagPrefix}${newVersion}` : newVersion;
    const localTags = execSync('git tag', { encoding: 'utf8', cwd }).split('\n').filter(Boolean);
    if (localTags.includes(tagName)) {
      execSync(`git push origin ${tagName}${pushSuffix}`, { stdio: 'inherit', cwd });
    } else {
      console.warn(`Tag ${tagName} does not exist locally. Skipping tag push.`);
    }
  } else {
    console.log(`[dry-run] Would perform git flow release for ${newVersion}`);
  }

  console.log('Git flow release completed successfully.');
}

module.exports = {
  syncBranches,
  updateFiles,
  performGitFlowRelease
};
