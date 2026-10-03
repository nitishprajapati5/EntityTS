#!/usr/bin/env node

/**
 * CI/CD Pipeline Gatekeeper
 * Evaluates .github/ci-config.json to conditionally
 * enable or disable CI/CD pipelines through code flags.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '.github', 'ci-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn(`[ci-gate] Warning: Failed to parse ${CONFIG_PATH}:`, err.message);
  }
  return { enabled: true, pipelines: {} };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    return true;
  } catch (err) {
    console.error(`[ci-gate] Error: Failed to write to ${CONFIG_PATH}:`, err.message);
    return false;
  }
}

function setGlobalFlag(enabled) {
  const config = loadConfig();
  config.enabled = Boolean(enabled);
  saveConfig(config);
  return config;
}

function setPipelineFlag(pipelineName, enabled) {
  const config = loadConfig();
  if (!config.pipelines) {
    config.pipelines = {};
  }
  config.pipelines[pipelineName] = Boolean(enabled);
  saveConfig(config);
  return config;
}

function checkPipeline(pipelineName) {
  const config = loadConfig();

  // 1. Global killswitch in code config
  if (config.enabled === false) {
    return {
      enabled: false,
      reason: 'Globally disabled via .github/ci-config.json (enabled: false)',
    };
  }

  // 2. Specific pipeline toggle in code config
  if (config.pipelines && config.pipelines[pipelineName] === false) {
    return {
      enabled: false,
      reason: `Pipeline '${pipelineName}' is disabled in .github/ci-config.json`,
    };
  }

  // 3. Database group toggle
  if (['postgres', 'mysql', 'mssql', 'sqlite'].includes(pipelineName)) {
    if (config.pipelines && config.pipelines.databases === false) {
      return {
        enabled: false,
        reason: 'Database test pipelines are disabled in .github/ci-config.json',
      };
    }
  }

  return { enabled: true, reason: 'Active' };
}

function printStatus() {
  const config = loadConfig();
  console.log('\n========================================');
  console.log('       EntityTS CI/CD Pipeline Flags     ');
  console.log('========================================');
  console.log(`Global CI/CD Switch: ${config.enabled !== false ? '✅ ENABLED' : '⛔ DISABLED'}`);
  console.log('----------------------------------------');
  console.log('Pipeline Flags:');
  const pipelines = config.pipelines || {};
  const standardList = [
    'ci',
    'postgres',
    'mysql',
    'mssql',
    'sqlite',
    'databases',
    'release',
    'packageCheck',
    'docs',
    'benchmark',
  ];
  const allKeys = Array.from(new Set([...standardList, ...Object.keys(pipelines)]));
  for (const key of allKeys) {
    const isExplicitlyDisabled = pipelines[key] === false;
    const effectiveStatus = checkPipeline(key);
    const mark = effectiveStatus.enabled ? '✅ ENABLED' : '⛔ DISABLED';
    console.log(
      `  • ${key.padEnd(16)}: ${mark} ${!effectiveStatus.enabled ? `(${effectiveStatus.reason})` : ''}`,
    );
  }
  console.log('========================================\n');
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'ci';

  if (command === '--status' || command === '-s' || command === 'status') {
    printStatus();
    return;
  }

  if (command === '--on' || command === 'on') {
    setGlobalFlag(true);
    console.log('[ci-gate] ✅ Global CI/CD enabled in .github/ci-config.json (enabled: true)');
    return;
  }

  if (command === '--off' || command === 'off') {
    setGlobalFlag(false);
    console.log('[ci-gate] ⛔ Global CI/CD disabled in .github/ci-config.json (enabled: false)');
    return;
  }

  if (command === '--enable' || command === 'enable') {
    const target = args[1];
    if (!target) {
      console.error(
        '[ci-gate] Please specify pipeline name to enable (e.g. pnpm ci:enable postgres)',
      );
      process.exit(1);
    }
    setPipelineFlag(target, true);
    console.log(`[ci-gate] ✅ Pipeline '${target}' enabled in .github/ci-config.json`);
    return;
  }

  if (command === '--disable' || command === 'disable') {
    const target = args[1];
    if (!target) {
      console.error(
        '[ci-gate] Please specify pipeline name to disable (e.g. pnpm ci:disable postgres)',
      );
      process.exit(1);
    }
    setPipelineFlag(target, false);
    console.log(`[ci-gate] ⛔ Pipeline '${target}' disabled in .github/ci-config.json`);
    return;
  }

  const result = checkPipeline(command);

  if (process.env.GITHUB_OUTPUT) {
    try {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `enabled=${result.enabled}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `reason=${result.reason}\n`);
    } catch (err) {
      console.warn('[ci-gate] Could not write to GITHUB_OUTPUT:', err.message);
    }
  }

  if (!result.enabled) {
    console.log(`[ci-gate] ⛔ Pipeline '${command}' is SKIPPED: ${result.reason}`);
    process.exit(0);
  } else {
    console.log(`[ci-gate] ✅ Pipeline '${command}' is ENABLED.`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { loadConfig, saveConfig, setGlobalFlag, setPipelineFlag, checkPipeline };
