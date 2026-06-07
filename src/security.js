'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { selectPackagesToUpdate } = require('./prompts.js');

const SEVERITY_ORDER = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

/**
 * Detect which package manager / lockfile the project uses.
 * @param {string} dir
 * @returns {{ manager: 'npm'|'yarn'|'pnpm'|null, lockfile: string|null }}
 */
function detectPackageManager(dir) {
  if (fs.existsSync(path.join(dir, 'package-lock.json'))) return { manager: 'npm', lockfile: 'package-lock.json' };
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return { manager: 'pnpm', lockfile: 'pnpm-lock.yaml' };
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return { manager: 'yarn', lockfile: 'yarn.lock' };
  return { manager: null, lockfile: null };
}

/**
 * Compare two severities. Returns true if `sev` is >= `threshold`.
 */
function severityAtLeast(sev, threshold) {
  return (SEVERITY_ORDER[sev] ?? 0) >= (SEVERITY_ORDER[threshold] ?? 0);
}

/**
 * Compare two dotted numeric versions. Returns -1, 0 or 1.
 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * Derive the first fixed version from advisory range strings such as
 * ">=1.0.0 <1.2.6" or "<4.17.21". The fixed version is the highest "<X"
 * upper bound across all advisories. Returns null if none can be parsed.
 * @param {Array} via
 * @returns {string|null}
 */
function deriveFixVersionFromVia(via) {
  let best = null;
  for (const adv of via) {
    if (!adv || typeof adv !== 'object' || !adv.range) continue;
    const m = adv.range.match(/<\s*([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)/);
    if (!m) continue;
    const candidate = m[1];
    if (!best || compareVersions(candidate, best) > 0) best = candidate;
  }
  return best;
}

/**
 * Run the audit command and return parsed JSON, or null on failure.
 * @param {string} dir
 * @param {string} command - audit command producing npm-style JSON
 * @returns {object|null}
 */
function runAuditJson(dir, command) {
  try {
    const out = execSync(command, {
      cwd: dir,
      encoding: 'utf8',
      // npm audit exits non-zero when vulnerabilities are found; capture anyway.
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
      shell: true
    });
    return JSON.parse(out);
  } catch (err) {
    // Non-zero exit still carries JSON on stdout when vulns exist.
    const stdout = err && err.stdout ? err.stdout.toString() : '';
    if (stdout) {
      try { return JSON.parse(stdout); } catch (_) {}
    }
    return null;
  }
}

/**
 * Normalize npm audit v2 (`vulnerabilities`) output into a flat list.
 * Each entry: { name, severity, title, url, range, fixVersion, isMajorFix }.
 * @param {object} report
 * @returns {Array<object>}
 */
function normalizeVulnerabilities(report) {
  const result = [];
  if (!report || typeof report !== 'object') return result;

  const vulns = report.vulnerabilities;
  if (vulns && typeof vulns === 'object') {
    for (const name of Object.keys(vulns)) {
      const v = vulns[name];
      if (!v) continue;
      const via = Array.isArray(v.via) ? v.via : [];
      const advisory = via.find((x) => x && typeof x === 'object') || null;
      const fix = v.fixAvailable;
      const fixAvailable = fix === true || (fix && typeof fix === 'object');
      // npm gives an explicit version only as an object; otherwise derive it
      // from the advisory range upper bound.
      const pinnedVersion = fix && typeof fix === 'object' ? fix.version : null;
      const fixVersion = pinnedVersion || deriveFixVersionFromVia(via);
      const isMajorFix = fix && typeof fix === 'object' ? !!fix.isSemVerMajor : false;
      result.push({
        name,
        severity: v.severity || (advisory && advisory.severity) || 'low',
        title: advisory ? advisory.title : `Vulnerability in ${name}`,
        url: advisory ? advisory.url : null,
        range: v.range || (advisory && advisory.range) || '*',
        isDirect: !!v.isDirect,
        fixAvailable,
        fixVersion,
        isMajorFix
      });
    }
    return result;
  }

  // Fallback: npm audit v1 (`advisories`).
  const advisories = report.advisories;
  if (advisories && typeof advisories === 'object') {
    for (const id of Object.keys(advisories)) {
      const a = advisories[id];
      if (!a) continue;
      const patched = a.patched_versions && a.patched_versions !== '<0.0.0'
        ? a.patched_versions.replace(/^[>=~^ ]*/, '')
        : null;
      result.push({
        name: a.module_name,
        severity: a.severity || 'low',
        title: a.title || `Vulnerability in ${a.module_name}`,
        url: a.url || null,
        range: a.vulnerable_versions || '*',
        fixAvailable: !!patched,
        fixVersion: patched,
        isMajorFix: false
      });
    }
  }
  return result;
}

const C = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`
};

function severityColor(sev) {
  if (sev === 'critical') return C.red;
  if (sev === 'high') return C.red;
  if (sev === 'moderate') return C.yellow;
  return C.dim;
}

/**
 * Build a one-line-per-vuln human readable summary.
 * @param {Array<object>} vulns
 * @returns {string}
 */
function formatReport(vulns) {
  const counts = vulns.reduce((acc, v) => { acc[v.severity] = (acc[v.severity] || 0) + 1; return acc; }, {});
  const order = ['critical', 'high', 'moderate', 'low'];
  const countStr = order
    .filter((s) => counts[s])
    .map((s) => severityColor(s)(`${counts[s]} ${s}`))
    .join(', ');

  const lines = [
    '',
    `  ${C.yellow('⚠')} ${C.bold(`${vulns.length} ${vulns.length === 1 ? 'vulnerability' : 'vulnerabilities'} found`)}${countStr ? ` (${countStr})` : ''}`,
    ''
  ];

  vulns.forEach((v, i) => {
    const sevTag = severityColor(v.severity)(`[${v.severity}]`);
    const num = C.dim(`${String(i + 1).padStart(2, ' ')}.`);
    let fixNote;
    if (v.fixVersion) {
      fixNote = C.green(`fixed in ${v.fixVersion}`) + (v.isMajorFix ? ' ' + C.yellow('(major / possibly breaking)') : '');
    } else if (v.fixAvailable) {
      fixNote = C.green('fix available') + (v.isMajorFix ? ' ' + C.yellow('(major / possibly breaking)') : '');
    } else {
      fixNote = C.dim('no fix available');
    }
    lines.push(`  ${num} ${sevTag} ${C.bold(v.name)} ${C.dim(v.range)}`);
    lines.push(`        ${v.title}`);
    lines.push(`        ${fixNote}`);
  });
  lines.push('');
  return lines.join('\n');
}

/**
 * Apply package updates by installing each at its fixed version.
 * @param {string} dir
 * @param {Array<object>} selected
 * @param {boolean} dryRun
 */
function applyUpdates(dir, selected, dryRun) {
  // Direct deps with a known fix version can be pinned precisely; everything
  // else (transitive, or fix-available-without-a-version) goes through audit fix.
  const installable = selected.filter((v) => v.isDirect && v.fixVersion);
  const needFix = selected.filter((v) => !(v.isDirect && v.fixVersion));

  for (const v of installable) {
    const spec = `${v.name}@${v.fixVersion}`;
    if (dryRun) {
      console.log(`[dry-run] Would run: npm install ${spec}`);
      continue;
    }
    console.log(`Installing ${spec}...`);
    execSync(`npm install ${spec}`, { stdio: 'inherit', cwd: dir, shell: true });
  }

  if (needFix.length) {
    if (dryRun) {
      console.log('[dry-run] Would run: npm audit fix');
    } else {
      console.log('Running npm audit fix for remaining issues...');
      try {
        execSync('npm audit fix', { stdio: 'inherit', cwd: dir, shell: true });
      } catch (_) {
        console.warn('npm audit fix could not resolve all issues automatically.');
      }
    }
  }
}

/**
 * Run the security audit gate.
 *
 * Behaviour:
 *  - disabled (config.security.enabled === false): no-op.
 *  - no lockfile: warns and skips (not a hard error).
 *  - interactive: prints report, lets user pick packages to update.
 *  - CI / non-interactive: prints report and blocks the release if any
 *    vulnerability meets/exceeds `failOn` severity.
 *
 * @param {object} options
 * @param {string} options.cwd
 * @param {object} options.security - resolved config.security
 * @param {boolean} options.isCi
 * @param {boolean} options.dryRun
 * @param {boolean} options.yes - skip interactive prompts (apply none)
 * @returns {Promise<{ updated: boolean }>}
 */
function runSecurityAudit(options) {
  const { cwd, security, isCi, dryRun, yes } = options;

  if (!security || security.enabled === false) return Promise.resolve({ updated: false });

  const level = security.level || 'low';
  const failOn = security.failOn || 'high';

  const { manager, lockfile } = detectPackageManager(cwd);
  if (!lockfile) {
    console.warn('Security audit: no lockfile found, skipping audit.');
    return Promise.resolve({ updated: false });
  }
  if (manager !== 'npm' && !security.command) {
    console.warn(`Security audit: "${manager}" projects need a custom security.command; skipping.`);
    return Promise.resolve({ updated: false });
  }

  const command = security.command || 'npm audit --json';
  console.log('Running security audit...');
  const report = runAuditJson(cwd, command);
  if (!report) {
    console.warn('Security audit: could not run/parse audit output, skipping.');
    return Promise.resolve({ updated: false });
  }

  let vulns = normalizeVulnerabilities(report).filter((v) => severityAtLeast(v.severity, level));

  if (!vulns.length) {
    console.log(C.green('✔ No vulnerabilities found.'));
    return Promise.resolve({ updated: false });
  }

  // Sort: highest severity first, then has-fix first.
  vulns.sort((a, b) => {
    const s = (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0);
    if (s !== 0) return s;
    return (b.fixVersion ? 1 : 0) - (a.fixVersion ? 1 : 0);
  });

  console.log(formatReport(vulns));

  // Non-interactive: block release if something meets failOn threshold.
  if (isCi || yes) {
    const blocking = vulns.filter((v) => severityAtLeast(v.severity, failOn));
    if (security.autoUpdate) {
      const fixable = vulns.filter((v) => v.fixAvailable && !v.isMajorFix);
      applyUpdates(cwd, fixable, dryRun);
      return Promise.resolve({ updated: fixable.length > 0 });
    }
    if (blocking.length) {
      const err = new Error(
        `Security audit failed: ${blocking.length} vulnerability(ies) at "${failOn}" or higher. ` +
        `Fix them or lower security.failOn / disable security.enabled.`
      );
      return Promise.reject(err);
    }
    console.log(C.dim(`No vulnerabilities at "${failOn}" or higher; continuing.`));
    return Promise.resolve({ updated: false });
  }

  // Interactive: let the user choose what to update.
  return selectPackagesToUpdate(vulns).then((selected) => {
    if (!selected || !selected.length) {
      console.log(C.dim('No packages selected for update; continuing.'));
      return { updated: false };
    }
    applyUpdates(cwd, selected, dryRun);
    return { updated: selected.length > 0 };
  });
}

module.exports = {
  runSecurityAudit,
  detectPackageManager,
  normalizeVulnerabilities,
  severityAtLeast,
  formatReport,
  SEVERITY_ORDER
};
