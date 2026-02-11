'use strict';

const path = require('path');
const { loadConfig } = require('./config.js');
const { getCurrentVersion, increaseVersion, suggestBumpFromCommits } = require('./version.js');
const { getNewCommits, getLatestTag, ensureCleanWorkingTree, ensureOriginRemote, ensureUpstream, ensureGitFlowInstalled, getCurrentBranch, ensureTagNotExists } = require('./git.js');
const { formatDate, getChangelogText, getReleaseNotesBody } = require('./changelog.js');
const { selectBumpType, selectPreId, confirmRelease } = require('./prompts.js');
const { performGitFlowRelease, syncBranches } = require('./gitFlow.js');
const { performLinearRelease } = require('./linearRelease.js');
const { runHooks } = require('./hooks.js');
const { npmPublish } = require('./npm.js');
const { createGitHubRelease } = require('./github.js');
const { createGitLabRelease } = require('./gitlab.js');
const { loadPlugins, runPluginLifecycle, runPluginLifecycleAsync } = require('./plugins.js');

function run() {
  const cwd = process.cwd();
  const { config, argv } = loadConfig(cwd, process.argv.slice(2));

  const dryRun = config.dryRun ?? argv.dryRun;
  const isCi = config.ci ?? argv.ci;
  const yes = argv.yes;
  const useGitFlow = (config.gitFlow !== false) && !argv.noGitFlow;
  const verbose = argv.verbose || false;

  if (dryRun) console.log('Running in dry-run mode. No changes will be made.');

  const plugins = loadPlugins(cwd, config.plugins);
  const initContext = { cwd, config, argv, dryRun, isCi, verbose };
  runPluginLifecycle(plugins, 'init', initContext);
  runHooks(config.hooks?.beforeInit, initContext, dryRun);

  const { version: currentVersion, name: projectName } = getCurrentVersion(cwd);

  if (argv.releaseVersion) {
    const bump = argv.bump || config.bump || 'patch';
    const preId = argv.preid || config.preRelease?.id || null;
    const next = increaseVersion(currentVersion, bump, preId);
    console.log(next);
    process.exit(0);
  }

  if (argv.changelog) {
    ensureOriginRemote();
    const commits = getNewCommits();
    const latestTag = getLatestTag();
    const context = {
      cwd,
      config,
      commits,
      version: currentVersion,
      latestVersion: currentVersion,
      latestTag
    };
    const text = getChangelogText(context);
    console.log(text);
    process.exit(0);
  }

  ensureOriginRemote();
  if (config.requireCleanWorkingDir) ensureCleanWorkingTree();
  if (useGitFlow) ensureGitFlowInstalled();

  const currentBranch = getCurrentBranch();
  const requireUpstream = config.git?.requireUpstream === true;
  if (requireUpstream) ensureUpstream(currentBranch, true);
  const allowReleaseFrom = config.allowReleaseFrom;
  if (Array.isArray(allowReleaseFrom) && allowReleaseFrom.length > 0 && !allowReleaseFrom.includes(currentBranch)) {
    console.error(`Cannot release from branch "${currentBranch}". Allowed: ${allowReleaseFrom.join(', ')}.`);
    process.exit(1);
  }

  let bump = argv.bump || null;

  if (!bump && (isCi || config.bump)) {
    bump = config.bump || 'patch';
  }

  const commits = getNewCommits();
  let suggested = null;
  if (config.conventionalCommits) {
    suggested = suggestBumpFromCommits(commits);
  }

  let preId = argv.preid || config.preRelease?.id || null;
  const noIncrement = argv.noIncrement || false;
  const onlyVersion = argv.onlyVersion || false;
  const effectiveYes = yes || onlyVersion;

  return Promise.resolve()
    .then(() => {
      if (noIncrement) return null;
      if (bump) return bump;
      return selectBumpType(currentVersion, suggested, 'patch', isCi);
    })
    .then((resolvedBump) => {
      if (noIncrement) return null;
      bump = resolvedBump;
      if (bump === 'prerelease') {
        if (!preId && !isCi) return selectPreId(isCi).then((id) => { preId = id; bump = 'patch'; return bump; });
        bump = 'patch';
      }
      return bump;
    })
    .then(() => {
      const newVersion = noIncrement ? currentVersion : increaseVersion(currentVersion, bump || 'patch', preId);
      const locale = config.changelog?.dateLocale || 'fa-IR';
      const dateStr = formatDate(new Date(), locale);

      if (dryRun) {
        console.log(`[dry-run] Would release ${newVersion} (bump: ${noIncrement ? 'none' : bump}) from ${currentBranch}.`);
        process.exit(0);
      }

      return confirmRelease(
        { version: newVersion, dateStr, commits, projectName },
        isCi,
        effectiveYes
      ).then((confirmed) => {
        if (!confirmed) {
          console.log('Release cancelled.');
          process.exit(0);
        }
        return { newVersion, dateStr };
      });
    })
    .then(({ newVersion, dateStr }) => {
      const tagConfig = config.tag || {};
      const tagPrefix = tagConfig.prefix ?? 'v';
      const tagName = tagPrefix ? `${tagPrefix}${newVersion}` : newVersion;
      const latestTag = getLatestTag();
      const context = {
        cwd,
        config,
        argv,
        dryRun: false,
        isCi,
        verbose,
        currentBranch,
        branchName: currentBranch,
        currentVersion,
        newVersion,
        version: newVersion,
        latestVersion: currentVersion,
        latestTag,
        bump,
        commits,
        projectName,
        name: projectName,
        dateStr,
        tagName,
        releaseUrl: null
      };
      context.changelogText = getChangelogText(context);
      context.changelog = context.changelogText;

      runPluginLifecycle(plugins, 'beforeRelease', context);
      runHooks(config.hooks?.beforeRelease, context, false);

      if (tagConfig.deleteIfExists) {
        ensureTagNotExists(newVersion, tagConfig, false);
      }

      if (useGitFlow) {
        if (config.syncBranches) syncBranches(context);
        performGitFlowRelease(context);
      } else {
        performLinearRelease(context);
      }

      runHooks(config.hooks?.afterGitRelease, context, false);
      runHooks(config.hooks?.afterBump, context, false);

      const releaseName = `Release ${newVersion}`;
      const releaseBody = getReleaseNotesBody(context);

      if (config.npm?.publish) {
        npmPublish(cwd, config.npm, false);
      }
      let releasePromise = Promise.resolve(null);
      if (config.github?.release) {
        releasePromise = createGitHubRelease(cwd, tagName, releaseName, releaseBody, config.github, false)
          .then((url) => { context.releaseUrl = url; return url; })
          .catch((err) => { console.warn('GitHub release failed:', err.message); return null; });
      }
      if (config.gitlab?.release) {
        releasePromise = releasePromise.then(() =>
          createGitLabRelease(cwd, tagName, releaseName, releaseBody, config.gitlab, false)
        ).then((url) => {
          if (url) context.releaseUrl = context.releaseUrl || url;
          return context.releaseUrl;
        }).catch((err) => { console.warn('GitLab release failed:', err.message); return context.releaseUrl; });
      }
      return releasePromise.then(() => runPluginLifecycleAsync(plugins, 'release', context)).then(() => {
        runHooks(config.hooks?.afterRelease, context, false);
        runPluginLifecycle(plugins, 'afterRelease', context);
      });
    })
    .then(() => {
      console.log('Release completed successfully.');
    })
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

if (require.main === module) {
  run();
}

module.exports = { run };
