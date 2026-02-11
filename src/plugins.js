'use strict';

const path = require('path');

/**
 * Plugin contract: a module may export any of:
 * - init(context)
 * - getLatestVersion(context)
 * - bump(context)
 * - beforeRelease(context)
 * - release(context)
 * - afterRelease(context)
 * All are optional. Context is the release context object.
 */

/**
 * Load plugin modules from config.plugins (array of module paths or names).
 * @param {string} cwd
 * @param {string[]|undefined} pluginPaths - e.g. ['./my-plugin.js'] or ['my-reliz-plugin']
 * @returns {{ name: string, init?: Function, getLatestVersion?: Function, bump?: Function, beforeRelease?: Function, release?: Function, afterRelease?: Function }[]}
 */
function loadPlugins(cwd, pluginPaths) {
  const list = Array.isArray(pluginPaths) ? pluginPaths : [];
  const plugins = [];
  for (const p of list) {
    if (!p || typeof p !== 'string') continue;
    try {
      const resolved = path.isAbsolute(p) ? p : path.resolve(cwd, p);
      const mod = require(resolved);
      plugins.push({
        name: typeof mod.name === 'string' ? mod.name : p,
        init: typeof mod.init === 'function' ? mod.init : undefined,
        getLatestVersion: typeof mod.getLatestVersion === 'function' ? mod.getLatestVersion : undefined,
        bump: typeof mod.bump === 'function' ? mod.bump : undefined,
        beforeRelease: typeof mod.beforeRelease === 'function' ? mod.beforeRelease : undefined,
        release: typeof mod.release === 'function' ? mod.release : undefined,
        afterRelease: typeof mod.afterRelease === 'function' ? mod.afterRelease : undefined
      });
    } catch (e) {
      console.warn(`Plugin "${p}" failed to load:`, e.message);
    }
  }
  return plugins;
}

/**
 * Run a lifecycle method on all plugins that implement it.
 * @param {object[]} plugins - from loadPlugins
 * @param {string} method - 'init' | 'getLatestVersion' | 'bump' | 'beforeRelease' | 'release' | 'afterRelease'
 * @param {object} context
 */
function runPluginLifecycle(plugins, method, context) {
  for (const plugin of plugins) {
    const fn = plugin[method];
    if (fn) {
      try {
        fn(context);
      } catch (e) {
        console.warn(`Plugin ${plugin.name} ${method} failed:`, e.message);
      }
    }
  }
}

/**
 * Run async lifecycle method (release) on all plugins. Runs in sequence.
 * @param {object[]} plugins
 * @param {string} method
 * @param {object} context
 * @returns {Promise<void>}
 */
async function runPluginLifecycleAsync(plugins, method, context) {
  for (const plugin of plugins) {
    const fn = plugin[method];
    if (fn) {
      try {
        const result = fn(context);
        if (result && typeof result.then === 'function') await result;
      } catch (e) {
        console.warn(`Plugin ${plugin.name} ${method} failed:`, e.message);
      }
    }
  }
}

module.exports = {
  loadPlugins,
  runPluginLifecycle,
  runPluginLifecycleAsync
};
