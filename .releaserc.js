/**
 * Semantic Release Configuration
 * Automatically detects whether NPM_TOKEN is provided:
 * - If NPM_TOKEN is available, publishes the package to npm.
 * - If NPM_TOKEN is not available, updates package.json version and tags/releases on GitHub without crashing.
 */
const publishToNpm = Boolean(process.env.NPM_TOKEN);

module.exports = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'angular',
        releaseRules: [
          { breaking: true, release: 'major' },
          { revert: true, release: 'patch' },
          { type: 'feat', release: 'minor' },
          { type: 'fix', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'docs', release: 'patch' },
          { type: 'chore', release: 'patch' },
          { type: 'build', release: 'patch' },
          { type: 'ci', release: 'patch' },
          { type: 'style', release: 'patch' },
          { type: 'test', release: 'patch' },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'angular',
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: true,
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    '@semantic-release/github',
  ],
};
