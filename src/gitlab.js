'use strict';

const https = require('https');
const { execSync } = require('child_process');

/**
 * Get GitLab project path (owner/repo) and host from origin url.
 * @param {string} cwd
 * @returns {{ host: string, projectPath: string }|null}
 */
function getRepoFromOrigin(cwd) {
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf8', cwd }).trim();
    let match = url.match(/(?:gitlab\.com[:/]|git@gitlab\.com:)([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (match) {
      return { host: 'gitlab.com', projectPath: `${match[1]}/${match[2].replace(/\.git$/, '')}` };
    }
    match = url.match(/^(https?):\/\/([^/]+)\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/i);
    if (match) {
      const host = match[2];
      const projectPath = `${match[3]}/${match[4].replace(/\.git$/, '')}`;
      return { host, projectPath };
    }
  } catch (_) {}
  return null;
}

/**
 * Create GitLab release via API.
 * @param {object} opts - { host, projectPath, tagName, name, description, token }
 * @returns {Promise<string|null>} Release URL (e.g. _links.self)
 */
function createRelease(opts) {
  const { host, projectPath, tagName, name, description, token } = opts;
  const projectId = encodeURIComponent(projectPath);
  const path = `/api/v4/projects/${projectId}/releases`;
  const body = JSON.stringify({
    tag_name: tagName,
    name: name || tagName,
    description: description || ''
  });

  return new Promise((resolve, reject) => {
    const isSecure = host === 'gitlab.com' || host.endsWith('.com') || host.endsWith('.org');
    const protocol = isSecure ? https : require('http');
    const req = protocol.request({
      hostname: host,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PRIVATE-TOKEN': token,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            const url = json._links?.self || (host === 'gitlab.com' ? `https://gitlab.com/${projectPath}/-/releases/${tagName}` : null);
            resolve(url);
          } catch (_) {
            resolve(null);
          }
        } else {
          reject(new Error(`GitLab API ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Create GitLab release for the given tag.
 * @param {string} cwd
 * @param {string} tagName
 * @param {string} releaseName
 * @param {string} body - markdown description
 * @param {object} gitlabConfig - { release, tokenRef: 'GITLAB_TOKEN' }
 * @param {boolean} dryRun
 * @returns {Promise<string|null>}
 */
async function createGitLabRelease(cwd, tagName, releaseName, body, gitlabConfig, dryRun = false) {
  const tokenRef = gitlabConfig?.tokenRef || 'GITLAB_TOKEN';
  const token = process.env[tokenRef];
  if (!token) {
    console.warn(`GitLab token not found (${tokenRef}). Skipping GitLab release.`);
    return null;
  }
  const repo = getRepoFromOrigin(cwd);
  if (!repo) {
    console.warn('Could not detect GitLab repo from origin. Skipping GitLab release.');
    return null;
  }
  if (dryRun) {
    console.log(`[dry-run] Would create GitLab release ${releaseName} for ${tagName}`);
    return null;
  }
  const url = await createRelease({
    host: repo.host,
    projectPath: repo.projectPath,
    tagName,
    name: releaseName,
    description: body,
    token
  });
  console.log('GitLab release created.');
  return url;
}

module.exports = {
  getRepoFromOrigin,
  createRelease,
  createGitLabRelease
};
