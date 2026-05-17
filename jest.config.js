/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const customJestConfig = {
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/src/$1',
    // GLSL shader files
    '\\.glsl$': '<rootDir>/src/test/__mocks__/glslMock.js',
  },
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
    // React Three Fiber メッシュ層は jsdom + jest では実行時の振る舞いを
    // 検証できない（WebGL 非対応）。実装詳細扱いとし、ユーザー振る舞いは
    // E2E（Playwright）でカバーする。
    '!src/features/theaterExperience/component/seatMeshes/**',
    '!src/features/theaterExperience/component/theaterScene/**',
    '!src/features/theaterExperience/component/screenMesh/**',
    '!src/features/theaterExperience/component/speakerMeshes/**',
    '!src/features/theaterExperience/component/audioHeatmapPlane/**',
    '!src/features/theaterExperience/component/firstPersonPreview/**',
    '!src/features/theaterExperience/component/theaterCanvas/**',
    // GLSL シェーダー文字列の export（カバレッジ計測対象外）
    '!src/features/theaterExperience/shaders/**',
  ],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
    '<rootDir>/eslint-local-rules/**/*.test.{js,jsx,ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
