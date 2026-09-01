// The MANUAL suite — `npm run test:ai-live` — and only that. It spends real
// API tokens against the user's configured providers, which is why it lives
// outside every root the default jest.config.js scans and outside CI.
module.exports = {
  displayName: 'ai-live',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests-live'],
  testMatch: ['**/*.test.ts'],
  // Sequential on purpose: a burst of parallel calls is how a rate limit
  // turns a configuration check into a wall of 429s.
  maxWorkers: 1,
  testTimeout: 120000,
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: { module: 'commonjs', target: 'ES2020', moduleResolution: 'node', esModuleInterop: true, strict: true },
    }],
  },
}
