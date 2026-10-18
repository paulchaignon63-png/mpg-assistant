import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Extension navigateur (globales chrome.*) et fichiers locaux de travail.
    "extension/**",
    ".cache/**",
    ".data/**",
    ".dev-scratch/**",
    // Script Node en CommonJS.
    "scripts/generate-icons.js",
  ]),
]);

export default eslintConfig;
