/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/test/**/*.test.ts'],
	collectCoverageFrom: ['nodes/**/*.ts', 'credentials/**/*.ts'],
};
