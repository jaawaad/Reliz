'use strict';

const readline = require('readline');

const BUMP_OPTIONS = [
  { value: 'patch', label: 'patch (1.2.3 → 1.2.4)', desc: 'Bugfixes, small changes' },
  { value: 'minor', label: 'minor (1.2.3 → 1.3.0)', desc: 'New feature, backward compatible' },
  { value: 'major', label: 'major (1.2.3 → 2.0.0)', desc: 'Breaking changes' },
  { value: 'hotfix', label: 'hotfix (1.2.3 → 1.2.3.1)', desc: 'Quick fix / build segment' },
  { value: 'prerelease', label: 'pre-release (alpha/beta/rc)', desc: 'Prerelease version' }
];

/**
 * Prompt user to select bump type (using readline).
 * In CI mode, returns defaultBump without prompting.
 * @param {string} currentVersion
 * @param {'patch'|'minor'|'major'|'hotfix'|null} suggested - from conventional commits
 * @param {'patch'|'minor'|'major'|'hotfix'} defaultBump - used in CI or as fallback
 * @param {boolean} isCi - if true, no prompt, return defaultBump
 * @returns {Promise<'patch'|'minor'|'major'|'hotfix'>}
 */
function selectBumpType(currentVersion, suggested, defaultBump = 'patch', isCi = false) {
  if (isCi) return Promise.resolve(defaultBump);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const options = BUMP_OPTIONS.map((o, i) => `${i + 1}. ${o.label} - ${o.desc}`).join('\n');
  const defaultIndex = suggested ? BUMP_OPTIONS.findIndex(o => o.value === suggested) + 1 : 1;
  const prompt = `Current version: ${currentVersion}\nSelect bump type:\n${options}\n[1-5] (default: ${defaultIndex}): `;

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = (answer || String(defaultIndex)).trim();
      const num = parseInt(trimmed, 10);
      if (num >= 1 && num <= 5) {
        resolve(BUMP_OPTIONS[num - 1].value);
      } else {
        resolve(suggested || defaultBump);
      }
    });
  });
}

/**
 * Prompt for pre-release id (alpha, beta, rc, etc.). In CI, returns null.
 * @param {boolean} isCi
 * @returns {Promise<string|null>}
 */
function selectPreId(isCi = false) {
  if (isCi) return Promise.resolve(null);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = 'Pre-release id (e.g. alpha, beta, rc) or leave empty: ';

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      const id = (answer || '').trim();
      resolve(id || null);
    });
  });
}

/**
 * Prompt user to confirm release.
 * In CI or yes mode, returns true without prompting.
 * @param {object} summary - { version, dateStr, commits, projectName }
 * @param {boolean} isCi
 * @param {boolean} yes
 * @returns {Promise<boolean>}
 */
function confirmRelease(summary, isCi = false, yes = false) {
  if (isCi || yes) return Promise.resolve(true);

  const { version, dateStr, commits, projectName } = summary;
  const lines = commits.slice(0, 10).map(c => `  - ${c}`).join('\n');
  const more = commits.length > 10 ? `  ... and ${commits.length - 10} more` : '';
  const msg = [
    `Project: ${projectName}`,
    `Version: ${version}`,
    `Date: ${dateStr}`,
    `Commits (${commits.length}):`,
    lines,
    more,
    '',
    'Proceed with release? (Y/n): '
  ].filter(Boolean).join('\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(msg, (answer) => {
      rl.close();
      const a = (answer || 'y').trim().toLowerCase();
      resolve(a === 'y' || a === 'yes' || a === '');
    });
  });
}

module.exports = {
  selectBumpType,
  selectPreId,
  confirmRelease,
  BUMP_OPTIONS
};
