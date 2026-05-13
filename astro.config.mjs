import { defineConfig } from "astro/config";

export default defineConfig({
    output: "static",
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
