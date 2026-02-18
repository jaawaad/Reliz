'use strict';

const path = require('path');
const fs = require('fs');

/**
 * Increase version by type. If preId is set (e.g. 'alpha', 'beta', 'rc'), appends prerelease segment.
 * @param {string} currentVersion
 * @param {'patch'|'minor'|'major'|'hotfix'} type
 * @param {string|null} [preId] - e.g. 'alpha', 'beta', 'rc'
 * @returns {string}
 */
function increaseVersion(currentVersion, type = 'patch', preId = null) {
  const parts = currentVersion.split('.').map(Number);
  const [major = 0, minor = 0, patch = 0, build = 0] = parts;

  let base;
  switch (type) {
    case 'major':
      base = `${major + 1}.0.0`;
      break;
    case 'minor':
      base = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      base = `${major}.${minor}.${patch + 1}`;
      break;
    case 'hotfix':
    case 'build':
      base = parts.length === 3 ? `${major}.${minor}.${patch}.1` : `${major}.${minor}.${patch}.${build + 1}`;
      break;
    default:
      base = `${major}.${minor}.${patch + 1}`;
  }

  if (!preId || typeof preId !== 'string' || !preId.trim()) {
    return base;
  }

  const preIdNorm = preId.trim().toLowerCase();
  const preMatch = currentVersion.match(new RegExp(`^(.+)-${preIdNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`, 'i'));
  if (preMatch) {
    const num = parseInt(preMatch[2], 10);
    return `${preMatch[1]}-${preIdNorm}.${num + 1}`;
  }
  return `${base}-${preIdNorm}.0`;
}

/**
 * @param {string} cwd
 * @returns {{ version: string, name: string }}
 */
function getCurrentVersion(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return {
    version: pkg.version || '0.0.0',
    name: pkg.name || 'project'
  };
}

/**
 * Suggest bump type from conventional commit messages.
 * fix -> patch, feat -> minor, BREAKING -> major.
 * @param {string[]} commitMessages
 * @returns {'major'|'minor'|'patch'|null}
 */
function suggestBumpFromCommits(commitMessages) {
  let hasBreaking = false;
  let hasFeat = false;
  let hasFix = false;
  const reBreaking = /^(\w+)(\([^)]*\))?!:?\s|BREAKING CHANGE:/i;
  const reFeat = /^feat(\([^)]*\))?!?:\s/i;
  const reFix = /^fix(\([^)]*\))?!?:\s/i;

  for (const msg of commitMessages) {
    const firstLine = msg.split('\n')[0];
    if (reBreaking.test(firstLine)) hasBreaking = true;
    else if (reFeat.test(firstLine)) hasFeat = true;
    else if (reFix.test(firstLine)) hasFix = true;
  }

  if (hasBreaking) return 'major';
  if (hasFeat) return 'minor';
  if (hasFix) return 'patch';
  return null;
}

/**
 * @param {string} cwd
 * @param {string} newVersion
 */
function setPackageVersion(cwd, newVersion) {
  const pkgPath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

module.exports = {
  increaseVersion,
  getCurrentVersion,
  setPackageVersion,
  suggestBumpFromCommits
};
