module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict',
  ],
  root: true,
  env: { node: true, jest: true },
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    // NestJS @Module decorators create empty classes by design.
    '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
  },
  overrides: [
    {
      files: ['src/**/*.ts'],
      rules: {
        // CRITICAL: stdout is the MCP protocol channel.
        // A single console.log breaks the handshake with no useful error.
        'no-console': 'error',
      },
    },
    {
      files: ['test/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
