import {
  checkPipeline,
  loadConfig,
  setGlobalFlag,
  setPipelineFlag,
  setTriggerFlag,
} from '../scripts/ci-gate';
import * as fs from 'fs';
import * as path from 'path';

describe('CI/CD Pipeline Gatekeeper (ci-gate)', () => {
  const configPath = path.join(__dirname, '..', '.github', 'ci-config.json');
  let originalConfig: string;

  beforeAll(() => {
    originalConfig = fs.readFileSync(configPath, 'utf-8');
  });

  afterEach(() => {
    // Restore original config after each test
    fs.writeFileSync(configPath, originalConfig, 'utf-8');
  });

  it('loads valid configuration successfully', () => {
    const config = loadConfig();
    expect(config).toBeDefined();
    expect(typeof config.enabled).toBe('boolean');
    expect(config.triggers).toBeDefined();
    expect(typeof config.triggers?.push).toBe('boolean');
    expect(config.pipelines).toBeDefined();
  });

  it('reports pipeline enabled when configured as true', () => {
    const result = checkPipeline('ci');
    expect(result.enabled).toBe(true);
  });

  it('skips pipeline when push trigger is disabled and event is push', () => {
    setTriggerFlag('push', false);
    const pushResult = checkPipeline('ci', 'push');
    expect(pushResult.enabled).toBe(false);
    expect(pushResult.reason).toContain("Trigger event 'push' is disabled");

    // Pull request event still runs
    const prResult = checkPipeline('ci', 'pull_request');
    expect(prResult.enabled).toBe(true);
  });

  it('partially disables a specific pipeline when set to false in code config', () => {
    const modified = JSON.parse(originalConfig);
    modified.pipelines.postgres = false;
    fs.writeFileSync(configPath, JSON.stringify(modified, null, 2), 'utf-8');

    const pgResult = checkPipeline('postgres');
    expect(pgResult.enabled).toBe(false);
    expect(pgResult.reason).toContain('postgres');

    // Other pipelines remain enabled
    const mysqlResult = checkPipeline('mysql');
    expect(mysqlResult.enabled).toBe(true);
  });

  it('partially disables all database pipelines when databases group is set to false', () => {
    const modified = JSON.parse(originalConfig);
    modified.pipelines.databases = false;
    fs.writeFileSync(configPath, JSON.stringify(modified, null, 2), 'utf-8');

    expect(checkPipeline('postgres').enabled).toBe(false);
    expect(checkPipeline('mysql').enabled).toBe(false);
    expect(checkPipeline('mssql').enabled).toBe(false);
    expect(checkPipeline('sqlite').enabled).toBe(false);

    // Non-database pipelines remain enabled
    expect(checkPipeline('release').enabled).toBe(true);
    expect(checkPipeline('packageCheck').enabled).toBe(true);
  });

  it('disables all pipelines when global enabled switch is set to false', () => {
    const modified = JSON.parse(originalConfig);
    modified.enabled = false;
    fs.writeFileSync(configPath, JSON.stringify(modified, null, 2), 'utf-8');

    expect(checkPipeline('ci').enabled).toBe(false);
    expect(checkPipeline('release').enabled).toBe(false);
    expect(checkPipeline('postgres').enabled).toBe(false);
    expect(checkPipeline('docs').enabled).toBe(false);
  });

  it('updates global flag via setGlobalFlag() helper', () => {
    setGlobalFlag(false);
    expect(loadConfig().enabled).toBe(false);
    expect(checkPipeline('ci').enabled).toBe(false);

    setGlobalFlag(true);
    expect(loadConfig().enabled).toBe(true);
    expect(checkPipeline('ci').enabled).toBe(true);
  });

  it('updates trigger flag via setTriggerFlag() helper', () => {
    setTriggerFlag('push', false);
    expect(loadConfig().triggers?.push).toBe(false);
    expect(checkPipeline('ci', 'push').enabled).toBe(false);

    setTriggerFlag('push', true);
    expect(loadConfig().triggers?.push).toBe(true);
    expect(checkPipeline('ci', 'push').enabled).toBe(true);
  });

  it('updates individual pipeline flag via setPipelineFlag() helper', () => {
    setPipelineFlag('postgres', false);
    expect(checkPipeline('postgres').enabled).toBe(false);
    expect(checkPipeline('mysql').enabled).toBe(true);

    setPipelineFlag('postgres', true);
    expect(checkPipeline('postgres').enabled).toBe(true);
  });
});
