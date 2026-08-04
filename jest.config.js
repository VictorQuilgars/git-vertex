module.exports = {
  testTimeout: 15000,

  projects: [
    {
      displayName: 'main',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src/main'],
      testMatch: ['**/__tests__/**/*.test.ts']
    },
    {
      displayName: 'renderer',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/src/renderer'],
      testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
      setupFilesAfterEnv: ['<rootDir>/src/renderer/src/__tests__/setupTests.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.web.json' }],
        // An .svg is its source text, matching Vite and esbuild — components/Icon
        // keeps its drawings as real files in a folder rather than as literals.
        '\\.svg$': '<rootDir>/src/renderer/src/__tests__/svgTransform.js'
      },
      // svg is deliberately absent here: moduleNameMapper wins over transform,
      // so mocking it would hide the icons from the component that reads them.
      moduleNameMapper: {
        '\\.css$': 'identity-obj-proxy',
        '\\.(png|jpe?g|gif)$': '<rootDir>/src/renderer/src/__mocks__/fileMock.js'
      },
      transformIgnorePatterns: []
    }
  ],

  // Coverage
  collectCoverage: false, // à true pour --coverage
  collectCoverageFrom: [
    'src/main/**/*.ts',
    '!src/main/**/*.d.ts',
    '!src/main/**/__tests__/**',
    'src/renderer/src/**/*.{ts,tsx}',
    '!src/renderer/src/**/*.d.ts',
    '!src/renderer/src/**/__tests__/**',
    '!src/renderer/src/**/__mocks__/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',           // rapport console
    'text-summary',   // résumé court
    'html',           // rapport HTML interactif
    'json',           // données brutes JSON
    'lcov'            // pour CI/CD
  ],

  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathAsClassName: false
      }
    ]
  ]
}
