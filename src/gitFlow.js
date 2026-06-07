'use strict';

const { execSync } = require('child_process');
const path = require('path');
const { setPackageVersion } = require('./version.js');
const { appendChangelogEntry } = require('./changelog.js');
const {
  getGitFlowVersionTagPrefix,
  syncGitFlowVersionTagPrefix,
  buildTagName,
  remoteBranchExists,
  remoteTagExists,
  verifyCreatedTag
} = require('./tag.js');

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
    try {
      execSync(`git merge --ff-only origin/${develop}`, { stdio: 'inherit' });
    } catch (_) {
      throw new Error(
        `Local '${develop}' has diverged from 'origin/${develop}'. ` +
        `Please resolve manually (git pull --rebase or git merge) before running reliz.`
      );
    }
  }
  console.log('Branches are up to date.');
}

/**
 * Update package.json and CHANGELOG. Uses context.commits, context.dateStr, context.version.
 * @param {{ cwd: string, config: object, version: string, commits: string[], dateStr: string }} context
 */
function updateFiles(context) {
  const { cwd, config, version, commits, dateStr, notes } = context;
  setPackageVersion(cwd, version);
  const changelogPath = path.join(cwd, config.changelog?.path || 'CHANGELOG.md');
  appendChangelogEntry(changelogPath, version, dateStr, commits, config.changelog?.template, notes);
}

/**
 * @param {{ cwd: string, config: object, version: string, currentBranch: string, dryRun: boolean, commits: string[], dateStr: string, tagPrefix?: string, tagPrefixSource?: string }} context
 */
function performGitFlowRelease(context) {
  const { cwd, config, version: newVersion, currentBranch, dryRun, commits, dateStr } = context;
  const main = config.branches?.main || 'main';
  const develop = config.branches?.develop || 'develop';
  const prefix = config.releaseBranchPrefix || 'release/';
  const releaseBranch = `${prefix}${newVersion}`;
  const updateContext = { ...context, version: newVersion };

  console.log('Starting git flow release process...');

  // Align git-flow's versiontag prefix with the prefix reliz resolved so that
  // the tag git-flow creates during `release finish` matches the tag name
  // reliz will later push and report. When the prefix itself was inherited
  // from git-flow ("gitflow" source), the two are already in sync.
  const resolvedPrefix = context.tagPrefix != null
    ? context.tagPrefix
    : (config.tag?.prefix ?? '');
  const currentGitFlowPrefix = getGitFlowVersionTagPrefix(cwd);
  if (
    context.tagPrefixSource !== 'gitflow' &&
    currentGitFlowPrefix !== resolvedPrefix
  ) {
    const was = currentGitFlowPrefix === null
      ? 'unset'
      : `"${currentGitFlowPrefix}"`;
    console.log(
      `Syncing gitflow.prefix.versiontag to "${resolvedPrefix}" (was ${was}).`
    );
    syncGitFlowVersionTagPrefix(resolvedPrefix, cwd, dryRun);
  }
  const expectedTagName = buildTagName(resolvedPrefix, newVersion);

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
    console.log(`Finishing git flow release: ${newVersion} (expected tag: ${expectedTagName})`);
    execSync(
      `GIT_MERGE_AUTOEDIT=no GIT_EDITOR=true git flow release finish -m "${tagMsg}" ${newVersion}`,
      { stdio: 'inherit', cwd }
    );

    // Verify the tag git-flow actually created. If git-flow used a different
    // version tag prefix than we expected (e.g. the user changed it between
    // releases), prefer the real tag for all downstream operations (pushes,
    // release notes, GitHub/GitLab release, summary).
    const verified = verifyCreatedTag(expectedTagName, newVersion, cwd);
    if (verified.matched) {
      context.tagName = expectedTagName;
    } else if (verified.alternative) {
      console.warn(
        `Expected tag ${expectedTagName} not found; git-flow created ${verified.tagName} instead. ` +
        `Reliz will use the actual tag for the rest of the release.`
      );
      context.tagName = verified.tagName;
    } else {
      console.warn(
        `Tag ${expectedTagName} was not created locally. ` +
        `Check gitflow.prefix.versiontag and config.tag.prefix.`
      );
      context.tagName = expectedTagName;
    }

    console.log('Pushing all branches and tags...');

    try {
      execSync(`git push origin ${develop}${pushSuffix}`, { stdio: 'inherit', cwd });
    } catch (pushErr) {
      if (pushErr.message && pushErr.message.includes('non-fast-forward')) {
        console.log(`Push of '${develop}' rejected (non-fast-forward). Pulling with rebase and retrying...`);
        execSync(`git checkout ${develop}`, { stdio: 'inherit', cwd });
        execSync(`git pull --rebase origin ${develop}`, { stdio: 'inherit', cwd });
        execSync(`git push origin ${develop}${pushSuffix}`, { stdio: 'inherit', cwd });
      } else throw pushErr;
    }

    try {
      execSync(`git push origin ${main}${pushSuffix}`, { stdio: 'inherit', cwd });
    } catch (pushErr) {
      if (pushErr.message && pushErr.message.includes('non-fast-forward')) {
        console.log(`Push of '${main}' rejected (non-fast-forward). Pulling with rebase and retrying...`);
        execSync(`git checkout ${main}`, { stdio: 'inherit', cwd });
        execSync(`git pull --rebase origin ${main}`, { stdio: 'inherit', cwd });
        execSync(`git push origin ${main}${pushSuffix}`, { stdio: 'inherit', cwd });
      } else throw pushErr;
    }

    // Clean up the remote release branch only if it still exists. `git flow
    // release finish` typically removes it already; blindly deleting would
    // print a noisy (but harmless) "remote ref does not exist" error.
    if (remoteBranchExists('origin', releaseBranch, cwd)) {
      console.log(`Cleaning up remote release branch: ${releaseBranch}...`);
      try {
        execSync(`git push origin --delete ${releaseBranch}`, { stdio: 'inherit', cwd });
      } catch (_) {
        console.warn(`Failed to delete remote branch ${releaseBranch}; continuing.`);
      }
    } else {
      console.log(`Remote release branch ${releaseBranch} already removed; skipping cleanup.`);
    }

    // Push the tag only if it exists locally and is not already on the remote.
    // With `--follow-tags` (reliz default) the tag usually ships with the
    // branch pushes above, so this step is a no-op in the common case.
    const tagName = context.tagName;
    const localTagExists = !verified.missing;
    if (!localTagExists) {
      console.warn(`Skipping tag push: ${tagName} is not present locally.`);
    } else if (remoteTagExists('origin', tagName, cwd)) {
      console.log(`Tag ${tagName} already present on origin; skipping tag push.`);
    } else {
      execSync(`git push origin ${tagName}${pushSuffix}`, { stdio: 'inherit', cwd });
    }
  } else {
    console.log(`[dry-run] Would perform git flow release for ${newVersion} (expected tag: ${expectedTagName})`);
    context.tagName = expectedTagName;
  }

  console.log('Git flow release completed successfully.');
}

module.exports = {
  syncBranches,
  updateFiles,
  performGitFlowRelease
};
