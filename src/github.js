'use strict';

const https = require('https');
const { execSync } = require('child_process');

/**
 * Get repo owner/name from origin url.
 * @param {string} cwd
 * @returns {{ owner: string, repo: string }|null}
 */
function getRepoFromOrigin(cwd) {
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf8', cwd }).trim();
    const match = url.match(/(?:github\.com[:/]|git@github\.com:)([^/]+)\/([^/.]+)(?:\.git)?$/);
    if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  } catch (_) {}
  return null;
}

/**
 * Create GitHub Release via API (no extra deps).
 * @param {object} opts - { owner, repo, tagName, name, body, token, draft?, prerelease? }
 * @returns {Promise<string|null>} Release html_url
 */
function createRelease(opts) {
  const { owner, repo, tagName, name, body, token } = opts;
  const path = `/repos/${owner}/${repo}/releases`;
  const payload = {
    tag_name: tagName,
    name: name || tagName,
    body: body || '',
    draft: opts.draft ?? false,
    prerelease: opts.prerelease ?? false
  };
  const bodyStr = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'reliz',
        'Authorization': `token ${token}`,
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            resolve(json.html_url || null);
          } catch (_) {
            resolve(null);
          }
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/**
 * Create GitHub release for the given tag with changelog body.
 * @param {string} cwd
 * @param {string} tagName - e.g. v1.2.3
 * @param {string} releaseName - e.g. Release 1.2.3
 * @param {string} body - markdown for release notes
 * @param {object} githubConfig - { tokenRef, draft?, prerelease? }
 * @param {boolean} dryRun
 * @returns {Promise<string|null>} Release html_url or null
 */
async function createGitHubRelease(cwd, tagName, releaseName, body, githubConfig, dryRun = false) {
  const tokenRef = githubConfig?.tokenRef || 'GITHUB_TOKEN';
  const token = process.env[tokenRef];
  if (!token) {
    console.warn(`GitHub token not found (${tokenRef}). Skipping GitHub release.`);
    return null;
  }
  const repo = getRepoFromOrigin(cwd);
  if (!repo) {
    console.warn('Could not detect GitHub repo from origin. Skipping GitHub release.');
    return null;
  }
  if (dryRun) {
    console.log(`[dry-run] Would create GitHub release ${releaseName} for ${tagName}`);
    return null;
  }
  const url = await createRelease({
    owner: repo.owner,
    repo: repo.repo,
    tagName,
    name: releaseName,
    body,
    token,
    draft: githubConfig?.draft ?? false,
    prerelease: githubConfig?.preRelease ?? false
  });
  console.log('GitHub release created.');
  return url;
}

module.exports = {
  getRepoFromOrigin,
  createRelease,
  createGitHubRelease
};
