'use strict';

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

/**
 * Run npm publish from publishPath. Uses npm.tag and npm.otp (or NPM_OTP env).
 * If package-lock.json exists, runs npm install first to sync lockfile version.
 * @param {string} cwd - project root
 * @param {object} npmConfig - { publishPath, tag, otp }
 * @param {boolean} dryRun
 */
function npmPublish(cwd, npmConfig, dryRun = false) {
  const publishPath = npmConfig?.publishPath ?? '.';
  const dir = path.resolve(cwd, publishPath);
  const tag = npmConfig?.tag ?? 'latest';
  const otp = npmConfig?.otp ?? process.env.NPM_OTP ?? null;

  if (dryRun) {
    console.log(`[dry-run] Would run: npm publish in ${dir}${tag !== 'latest' ? ` --tag ${tag}` : ''}`);
    return;
  }

  const lockPath = path.join(dir, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    console.log('Syncing package-lock.json...');
    execSync('npm install', { stdio: 'inherit', cwd: dir, shell: true });
  }

  const args = ['publish'];
  if (tag) args.push('--tag', tag);
  if (otp) args.push('--otp', otp);
  execSync('npm ' + args.join(' '), { stdio: 'inherit', cwd: dir, shell: true });
}

module.exports = {
  npmPublish
};
