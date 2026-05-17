import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["dist/**", "site-dist/**", ".astro/**", "node_modules/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...astro.configs["flat/recommended"],
    {
        files: ["**/*.{js,mjs,ts,astro}"],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
);
