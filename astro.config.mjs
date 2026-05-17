import { defineConfig } from "astro/config";

const base = resolveBasePath();
const dataDirEnvKey = "import.meta.env.REVISAUR_DATA_DIR";
const workspaceEnvKey = "import.meta.env.REVISAUR_WORKSPACE";

export default defineConfig({
    output: "static",
    ...(base === undefined ? {} : { base }),
    srcDir: "src/site",
    outDir: process.env.REVISAUR_OUTPUT_DIR ?? "site-dist",
    vite: {
        define: {
            [dataDirEnvKey]: JSON.stringify(process.env.REVISAUR_DATA_DIR ?? ".revisaur/data"),
            [workspaceEnvKey]: JSON.stringify(process.env.REVISAUR_WORKSPACE ?? process.cwd()),
        },
    },
});

/**
 * @returns {string | undefined}
 */
function resolveBasePath() {
    const configured = process.env.REVISAUR_BASE_PATH?.trim();
    if (configured !== undefined && configured !== "") {
        return configured === "/" ? undefined : normalizeBasePath(configured);
    }

    if (process.env.GITHUB_ACTIONS !== "true") {
        return undefined;
    }

    const repository = process.env.GITHUB_REPOSITORY;
    // Support pages delpoyed at URLs like https://marcoieni.github.io/reviews/
    const repoName = repository?.split("/")[1];
    if (repoName === undefined || repoName === "" || repoName.endsWith(".github.io")) {
        return undefined;
    }

    return `/${repoName}`;
}

/**
 * @param {string} value
 * @returns {string | undefined}
 */
function normalizeBasePath(value) {
    const trimmed = value.replace(/^\/+|\/+$/g, "");
    return trimmed === "" ? undefined : `/${trimmed}`;
}
