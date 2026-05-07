module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  ignorePatterns: [
    "/lib/**/*", // Ignore built files
    "/node_modules/**/*",
  ],
  rules: {
    "no-unused-vars": "off", // tsc handles this
    "no-undef": "off",       // tsc handles this
  },
};
