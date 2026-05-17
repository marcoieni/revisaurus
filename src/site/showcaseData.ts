import type { PullRequestReview, RepositoryConfig } from "../types/revisaur.js";

const repositories: Array<Pick<RepositoryConfig, "id" | "name" | "provider" | "url" | "owner" | "repo">> = [
    {
        id: "revisaur",
        name: "Revisaur",
        provider: "github",
        url: "https://github.com/marcoieni/revisaur",
        owner: "marcoieni",
        repo: "revisaur",
    },
    {
        id: "astro-dashboard",
        name: "Astro dashboard",
        provider: "github",
        url: "https://github.com/withastro/astro",
        owner: "withastro",
        repo: "astro",
    },
];

const reviews: PullRequestReview[] = [
    {
        repoId: "revisaur",
        status: "reviewed",
        reviewedCommit: "8b7a21f0d9c442f79f1c099d14ef2d870c8a9634",
        reviewedAt: "2026-05-17T09:24:00.000Z",
        rawOutput: "",
        summary: `## AI review summary

This PR adds the static Astro dashboard that Revisaur publishes to GitHub Pages.

- **Reviewed only the changed PR head commit**, so repeated builds stay fast.
- Found one regression risk in the generated Pages base path.
- Left a markdown comment directly on the relevant diff line.

\`revisaur generate\` can rebuild this page from stored review state without asking the AI to re-review unchanged commits.`,
        diff: `diff --git a/astro.config.mjs b/astro.config.mjs
index 1d3a25c..f7c08ae 100644
--- a/astro.config.mjs
+++ b/astro.config.mjs
@@ -1,8 +1,19 @@
 import { defineConfig } from "astro/config";
 
+const base = resolveBasePath();
+
 export default defineConfig({
     output: "static",
+    ...(base === undefined ? {} : { base }),
     srcDir: "src/site",
     outDir: process.env.REVISAUR_OUTPUT_DIR ?? "site-dist",
 });
+
+function resolveBasePath() {
+    if (process.env.GITHUB_ACTIONS !== "true") {
+        return undefined;
+    }
+
+    return process.env.GITHUB_REPOSITORY?.split("/")[1];
+}
diff --git a/src/site/components/ReviewApp.astro b/src/site/components/ReviewApp.astro
index 034ae9d..8dc729a 100644
--- a/src/site/components/ReviewApp.astro
+++ b/src/site/components/ReviewApp.astro
@@ -44,7 +44,7 @@ function prReviewStateLabel(review: PullRequestReview): string {
       <a class="brand-logo-link" href={projectUrl} aria-label="Revisaur GitHub repository">
         <img src={logoUrl} alt="" width="56" height="57" />
       </a>
       <div>
         <h1>Revisaur</h1>
-        <p>AI reviews in a static website.</p>
+        <p>AI reviews for recently updated pull requests.</p>
       </div>
     </div>`,
        comments: [
            {
                path: "astro.config.mjs",
                line: 17,
                side: "right",
                severity: "warning",
                body: `GitHub Pages expects the base path to include the leading slash.

Consider returning \`/${'${repoName}'}\` here, and keep \`.github.io\` repositories at the domain root.`,
            },
            {
                path: "src/site/components/ReviewApp.astro",
                line: 51,
                side: "right",
                severity: "suggestion",
                body: `This reads well for the dashboard itself. For the project website, the surrounding page can explain:

- GitHub provider support
- AI reviewer abstraction
- static Astro output`,
            },
        ],
        pullRequest: {
            provider: "github",
            repoId: "revisaur",
            number: 42,
            reviewState: "ready",
            title: "Publish the review dashboard to GitHub Pages",
            url: "https://github.com/marcoieni/revisaur/pull/42",
            author: "maintainer",
            assignees: ["release-owner"],
            headSha: "8b7a21f0d9c442f79f1c099d14ef2d870c8a9634",
            baseSha: "31bd2e8075eb934f8f53f320b117c9cf1f43be92",
            updatedAt: "2026-05-17T09:14:00.000Z",
            mergedAt: null,
        },
    },
    {
        repoId: "revisaur",
        status: "reviewed",
        reviewedCommit: "326c21d9f52e89427bd92df28bd28764932037bd",
        reviewedAt: "2026-05-17T08:40:00.000Z",
        rawOutput: "",
        summary: `## No blocking issues

The configuration loader keeps project defaults, repository overrides, and reviewer settings separate. The stored state key includes repository, PR number, and head SHA, so new commits trigger a fresh review while unchanged PRs are reused.`,
        diff: `diff --git a/examples/revisaur.toml b/examples/revisaur.toml
index a1ca0a7..dd8b74d 100644
--- a/examples/revisaur.toml
+++ b/examples/revisaur.toml
@@ -1,7 +1,8 @@
 output_dir = "site-dist"
 data_dir = ".revisaur/data"
 max_pull_requests = 10
 skipped_authors = ["renovate", "renovate[bot]", "dependabot", "dependabot[bot]"]
+prompt_instructions = "Prioritize correctness, security, and regressions over style nits."
 
 [reviewer]
 kind = "kiro"
 command = "kiro-cli"`,
        comments: [],
        pullRequest: {
            provider: "github",
            repoId: "revisaur",
            number: 39,
            reviewState: "approved",
            title: "Add reviewer prompt instructions",
            url: "https://github.com/marcoieni/revisaur/pull/39",
            author: "marcoieni",
            assignees: [],
            headSha: "326c21d9f52e89427bd92df28bd28764932037bd",
            baseSha: "5e2532dfbd8980efc150df2b214703283521d0d0",
            updatedAt: "2026-05-17T08:30:00.000Z",
            mergedAt: null,
        },
    },
    {
        repoId: "astro-dashboard",
        status: "failed",
        reviewedCommit: "c2db86460bfe0e2d25a8fb441d40f6019ec63a20",
        reviewedAt: "2026-05-17T07:58:00.000Z",
        rawOutput: "",
        summary: `## Review could not complete

The reviewer command timed out before producing a complete response. Revisaur keeps the failure visible in the dashboard so CI and Pages output still show the PR that needs attention.`,
        error: "Reviewer timed out after 900 seconds.",
        diff: `diff --git a/src/pages/index.astro b/src/pages/index.astro
index 513f02b..93427ab 100644
--- a/src/pages/index.astro
+++ b/src/pages/index.astro
@@ -1,5 +1,5 @@
 ---
 const title = "Dashboard";
 ---
 
-<h1>{title}</h1>
+<h1>{title} preview</h1>`,
        comments: [],
        pullRequest: {
            provider: "github",
            repoId: "astro-dashboard",
            number: 8121,
            reviewState: "draft",
            title: "Prototype dashboard preview route",
            url: "https://github.com/withastro/astro/pull/8121",
            author: "feature-dev",
            assignees: ["reviewer"],
            headSha: "c2db86460bfe0e2d25a8fb441d40f6019ec63a20",
            baseSha: "185d1626f6f754dbb8083f610b702dcc86b4a102",
            updatedAt: "2026-05-17T07:51:00.000Z",
            mergedAt: null,
        },
    },
];

export const showcaseData = {
    repositories,
    reviews,
};
