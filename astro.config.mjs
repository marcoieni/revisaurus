import { defineConfig } from "astro/config";

const base = resolveBasePath();

export default defineConfig({
    output: "static",
    ...(base ? { base } : {}),
    srcDir: "src/site",
    outDir: process.env.REVISAURUS_OUTPUT_DIR ?? "site-dist",
    vite: {
        define: {
            "import.meta.env.REVISAURUS_DATA_DIR": JSON.stringify(
                process.env.REVISAURUS_DATA_DIR ?? ".revisaurus/data",
            ),
            "import.meta.env.REVISAURUS_WORKSPACE": JSON.stringify(process.env.REVISAURUS_WORKSPACE ?? process.cwd()),
        },
    },
});

function resolveBasePath() {
    const configured = process.env.REVISAURUS_BASE_PATH?.trim();
    if (configured) {
        return configured === "/" ? undefined : normalizeBasePath(configured);
    }

    if (process.env.GITHUB_ACTIONS !== "true") {
        return undefined;
    }

    const repository = process.env.GITHUB_REPOSITORY;
    // Support pages delpoyed at URLs like https://marcoieni.github.io/reviews/
    const repoName = repository?.split("/")[1];
    if (!repoName || repoName.endsWith(".github.io")) {
        return undefined;
    }

    return `/${repoName}`;
}

function normalizeBasePath(value) {
    const trimmed = value.replace(/^\/+|\/+$/g, "");
    return trimmed ? `/${trimmed}` : undefined;
}
