'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { interpolate } = require('./hooks.js');

/**
 * Format date for changelog (Persian or Gregorian).
 * @param {Date} date
 * @param {string} locale - e.g. 'fa-IR' or 'en-US'
 * @returns {string}
 */
function formatDate(date, locale = 'fa-IR') {
  if (locale === 'fa-IR' || locale.startsWith('fa')) {
    return date.toLocaleDateString('fa-IR-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

const DEFAULT_ENTRY_TEMPLATE = '## **[${version}] - ${date}**\n${commits}\n\n';

/**
 * Append a new changelog entry.
 * @param {string} changelogPath - Full path to CHANGELOG.md
 * @param {string} version
 * @param {string} dateStr
 * @param {string} changelogText - pre-filtered and pre-formatted commit lines
 * @param {string|null} template - optional, placeholders: ${version}, ${date}, ${commits}
 */
function appendChangelogEntry(changelogPath, version, dateStr, changelogText, template = null) {
  const tpl = template || DEFAULT_ENTRY_TEMPLATE;
  const entry = interpolate(tpl, { version, date: dateStr, commits: changelogText });

  let content = '';
  if (fs.existsSync(changelogPath)) {
    content = fs.readFileSync(changelogPath, 'utf8');
  }
  fs.writeFileSync(changelogPath, entry + content);
}

const CONVENTIONAL_GROUP_HEADERS = {
  feat: 'Features',
  fix: 'Bug Fixes',
  docs: 'Documentation',
  style: 'Styles',
  refactor: 'Code Refactoring',
  perf: 'Performance',
  test: 'Tests',
  chore: 'Chores',
  ci: 'CI'
};

/**
 * Parse conventional commit line: type(scope): message or type: message
 * @param {string} line
 * @returns {{ type: string, scope?: string, message: string }|null}
 */
function parseConventional(line) {
  const match = line.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);
  if (!match) return null;
  return { type: match[1].toLowerCase(), scope: match[2], message: match[3].trim() };
}

/**
 * Filter commits by conventional types and optionally group by type.
 * @param {string[]} commits
 * @param {{ includeTypes?: string[]|null, groupByType?: boolean }} options
 * @returns {string} Formatted changelog fragment (list or grouped sections)
 */
function filterAndFormatCommits(commits, options = {}) {
  const { includeTypes = null, groupByType = false } = options;
  let list = commits;
  if (Array.isArray(includeTypes) && includeTypes.length > 0) {
    list = commits.filter((line) => {
      const parsed = parseConventional(line);
      if (!parsed) return true;
      return includeTypes.includes(parsed.type);
    });
  }
  if (!groupByType) {
    return list.map(c => `- ${c}`).join('\n');
  }
  const byType = new Map();
  for (const line of list) {
    const parsed = parseConventional(line);
    const type = parsed ? parsed.type : 'other';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(line);
  }
  const parts = [];
  for (const [type, lines] of byType) {
    const header = CONVENTIONAL_GROUP_HEADERS[type] || type.charAt(0).toUpperCase() + type.slice(1);
    parts.push(`### ${header}\n\n${lines.map(c => `- ${c}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * Run a changelog/release-notes command with variable substitution.
 * Vars: from, to, version, latestVersion
 * @param {string} cwd
 * @param {string} command
 * @param {{ from?: string, to?: string, version?: string, latestVersion?: string }} vars
 * @returns {string}
 */
function runChangelogCommand(cwd, command, vars = {}) {
  const cmd = interpolate(command, {
    from: vars.from ?? '',
    to: vars.to ?? 'HEAD',
    version: vars.version ?? '',
    latestVersion: vars.latestVersion ?? ''
  });
  const out = execSync(cmd, { encoding: 'utf8', cwd });
  return (out && out.trim()) || '';
}

/**
 * Get changelog text: from custom command or from commits (with optional filter/group).
 * @param {object} context - cwd, config, commits, version, latestVersion, latestTag
 * @returns {string}
 */
function getChangelogText(context) {
  const { cwd, config, commits = [], version, latestVersion, latestTag } = context;
  const ch = config.changelog || {};
  if (ch.command && typeof ch.command === 'string') {
    return runChangelogCommand(cwd, ch.command, {
      from: latestTag ?? '',
      to: 'HEAD',
      version: version ?? '',
      latestVersion: latestVersion ?? ''
    });
  }
  const formatted = filterAndFormatCommits(commits, {
    includeTypes: ch.includeTypes ?? null,
    groupByType: ch.groupByType === true
  });
  return formatted;
}

/**
 * Build release notes body (e.g. for GitHub/GitLab). Uses releaseNotesCommand or commits.
 * @param {object} context - cwd, config, version, dateStr, commits, latestVersion, latestTag
 * @returns {string}
 */
function getReleaseNotesBody(context) {
  const { cwd, config, version, dateStr, commits = [], latestVersion, latestTag } = context;
  const ch = config.changelog || {};
  if (ch.releaseNotesCommand && typeof ch.releaseNotesCommand === 'string') {
    const body = runChangelogCommand(cwd, ch.releaseNotesCommand, {
      from: latestTag ?? '',
      to: 'HEAD',
      version: version ?? '',
      latestVersion: latestVersion ?? ''
    });
    return body || `## ${version} - ${dateStr}\n\n${(commits || []).map(c => `- ${c}`).join('\n')}`;
  }
  const lines = filterAndFormatCommits(commits, {
    includeTypes: ch.includeTypes ?? null,
    groupByType: ch.groupByType === true
  });
  return `## ${version} - ${dateStr}\n\n${lines}`;
}

module.exports = {
  formatDate,
  appendChangelogEntry,
  filterAndFormatCommits,
  getChangelogText,
  getReleaseNotesBody
};
