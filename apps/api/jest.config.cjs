/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'src/.*\.spec\.ts$',
  // `testRegex` matches `*.integration.spec.ts` too, so the default run would
  // execute them twice — once here and again under `integration:test`. That was
  // harmless while every integration spec mocked Prisma, but MRN allocation is
  // proven against real Postgres, and the unit run happens before CI has a
  // database. `integration:test` clears this ignore.
  testPathIgnorePatterns: ['/node_modules/', 'integration\\.spec\\.ts$', 'database\\.spec\\.ts$'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: './tsconfig.spec.json' }],
  },
  setupFiles: ['<rootDir>/test/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@hms/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/main.ts'],
};
