import astro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const sharedRules = {
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-vars": ["warn", {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_",
  }],
  "no-console": ["warn", { allow: ["warn", "error"] }],
  "prefer-const": "error",
};

export default [
  { ignores: ["dist/**", "node_modules/**", ".astro/**"] },
  ...astro.configs["flat/recommended"],
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: sharedRules,
  },
  {
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: [".astro"],
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...sharedRules,
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["scripts/**"],
    rules: { "no-console": "off" },
  },
];
