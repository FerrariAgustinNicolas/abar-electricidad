module.exports = {
  rootDir: '.',
  testRegex: '(test|src)/.*\\.spec\\.ts$',
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  collectCoverageFrom: ['src/**/*.ts'],
};
