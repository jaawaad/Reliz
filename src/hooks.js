'use strict';

const { execSync } = require('child_process');

/**
 * Replace template variables in a command string.
 * @param {string} cmd
 * @param {object} context - version, latestVersion, changelog, name, etc.
 * @returns {string}
 */
function interpolate(cmd, context) {
  let out = cmd;
  for (const [key, value] of Object.entries(context)) {
    if (value != null && typeof value !== 'object') {
      out = out.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(value));
    }
  }
  return out;
}

/**
 * Run an array of shell commands (or a single command) for a hook.
 * @param {string[]|string} commands - from config, e.g. hooks.beforeRelease
 * @param {object} context - version, latestVersion, changelog, name, cwd
 * @param {boolean} dryRun - if true, only log, do not execute
 */
function runHooks(commands, context, dryRun = false) {
  const list = Array.isArray(commands) ? commands : (commands ? [commands] : []);
  const cwd = context.cwd || process.cwd();
  for (const cmd of list) {
    const line = interpolate(cmd, context);
    if (dryRun) {
      console.log(`[dry-run] Would run: ${line}`);
      continue;
    }
    try {
      execSync(line, { stdio: 'inherit', cwd, shell: true });
    } catch (e) {
      throw new Error(`Hook failed: ${line}. ${e.message}`);
    }
  }
}

module.exports = {
  runHooks,
  interpolate
};
