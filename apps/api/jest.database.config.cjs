const base = require('./jest.config.cjs');

module.exports = {
  ...base,
  testRegex: 'src/.*\\.database\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/'],
  setupFiles: ['dotenv/config', '<rootDir>/test/jest.setup.ts'],
};
