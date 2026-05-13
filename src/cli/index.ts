#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { ensureDir, writeJson } from "fs-extra/esm";
import { execa } from "execa";
import { loadConfig } from "../config/loadConfig.js";
import { providerFor } from "../providers/index.js";
import { reviewerFor } from "../reviewers/index.js";
import { emptyState, loadState, reviewKey, saveState } from "../state/reviewState.js";
import type { PullRequestReview, RepositoryConfig, RevisaurusConfig } from "../types/revisaurus.js";

const program = new Command();

program
    .name("revisaurus")
    .description("Generate an Astro website containing AI reviews for recent pull requests.")
    .version("0.1.0");

program
    .command("generate")
    .description("Fetch pull requests, run missing reviews, and build the static site.")
    .option("-c, --config <path>", "Path to revisaurus TOML config", "revisaurus.toml")
    .option("--skip-build", "Only write review data, do not run astro build")
    .action(async (options: { config: string; skipBuild?: boolean }) => {
        const workspace = process.cwd();
        const config = await loadConfig(path.resolve(workspace, options.config));
        await generate(config, Boolean(options.skipBuild), workspace);
    });

program
    .command("demo")
    .description("Generate fake review data and build the static demo site.")
    .option("--data-dir <path>", "Directory for generated review data", ".revisaurus/data")
    .option("-o, --output-dir <path>", "Directory for the built static site", "site-dist")
    .option("--skip-build", "Only write demo review data, do not run astro build")
    .action(async (options: { dataDir: string; outputDir: string; skipBuild?: boolean }) => {
        const workspace = process.cwd();
        await demo(options.dataDir, options.outputDir, Boolean(options.skipBuild), workspace);
    });

await program.parseAsync();

async function generate(config: RevisaurusConfig, skipBuild: boolean, workspace: string): Promise<void> {
    const dataDir = path.resolve(workspace, config.dataDir);
    const outputDir = path.resolve(workspace, config.outputDir);
    await ensureDir(dataDir);
    const statePath = path.join(dataDir, "state.json");
    const state = await loadState(statePath);
    const reviewer = reviewerFor(config.reviewer);
    // Tracks the current run's site payload while state.reviews remains the full cache.
    const reviewKeys: string[] = [];

    for (const repo of config.repositories) {
        const provider = providerFor(repo);
        const pullRequests = await provider.listRecentlyUpdatedPullRequests(repo);

        for (const pullRequest of pullRequests) {
            const key = reviewKey(pullRequest);
            reviewKeys.push(key);

            const isCached = Boolean(state.reviews[key]);
            if (isCached) {
                continue;
            }

            const diff = await provider.getPullRequestDiff(repo, pullRequest.number);
            const reviewedAt = new Date().toISOString();

            try {
                const result = await reviewer.review({
                    repositoryUrl: repo.url,
                    pullRequest,
                    diff,
                });
                const review: PullRequestReview = {
                    repoId: repo.id,
                    pullRequest,
                    status: "reviewed",
                    reviewedCommit: pullRequest.headSha,
                    reviewedAt,
                    summary: result.summary,
                    rawOutput: result.rawOutput,
                    diff,
                    comments: result.comments,
                };
                state.reviews[key] = review;
            } catch (error) {
                const review: PullRequestReview = {
                    repoId: repo.id,
                    pullRequest,
                    status: "failed",
                    reviewedCommit: pullRequest.headSha,
                    reviewedAt,
                    summary: "Review failed.",
                    rawOutput: "",
                    diff,
                    comments: [],
                    error: error instanceof Error ? error.message : String(error),
                };
                state.reviews[key] = review;
            }

            await saveState(statePath, state);
        }
    }

    await writeJson(
        path.join(dataDir, "site.json"),
        {
            generatedAt: new Date().toISOString(),
            repositories: config.repositories.map(({ id, name, provider, url }) => ({ id, name, provider, url })),
            reviews: reviewKeys
                .map((key) => state.reviews[key])
                .filter((review): review is PullRequestReview => Boolean(review)),
        },
        { spaces: 2 },
    );

    await saveState(statePath, state);

    if (!skipBuild) {
        await buildSite(config.dataDir, outputDir, workspace);
    }
}

async function demo(
    dataDirOption: string,
    outputDirOption: string,
    skipBuild: boolean,
    workspace: string,
): Promise<void> {
    const dataDir = path.resolve(workspace, dataDirOption);
    const outputDir = path.resolve(workspace, outputDirOption);
    await ensureDir(dataDir);

    const repositories = demoRepositories();
    const reviews = demoReviews();
    const state = emptyState();

    for (const review of reviews) {
        state.reviews[reviewKey(review.pullRequest)] = review;
    }

    await writeJson(
        path.join(dataDir, "site.json"),
        {
            generatedAt: new Date().toISOString(),
            repositories: repositories.map(({ id, name, provider, url }) => ({ id, name, provider, url })),
            reviews,
        },
        { spaces: 2 },
    );
    await saveState(path.join(dataDir, "state.json"), state);

    if (!skipBuild) {
        await buildSite(dataDirOption, outputDir, workspace);
    }
}

async function buildSite(dataDir: string, outputDir: string, workspace: string): Promise<void> {
    const packageRoot = resolvePackageRoot();
    await execa("pnpm", ["astro", "build"], {
        stdio: "inherit",
        cwd: packageRoot,
        env: {
            ...process.env,
            REVISAURUS_DATA_DIR: dataDir,
            REVISAURUS_OUTPUT_DIR: outputDir,
            REVISAURUS_WORKSPACE: workspace,
        },
    });
}

function resolvePackageRoot(): string {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return here.endsWith(`${path.sep}dist${path.sep}cli`) ? path.resolve(here, "../..") : path.resolve(here, "../..");
}

function demoRepositories(): RepositoryConfig[] {
    return [
        {
            id: "github-octoflow-api",
            name: "Octoflow API",
            provider: "github",
            url: "https://github.com/example/octoflow-api",
            owner: "example",
            repo: "octoflow-api",
            maxPullRequests: 5,
            skippedAuthors: [],
        },
        {
            id: "github-launchpad-web",
            name: "Launchpad Web",
            provider: "github",
            url: "https://github.com/example/launchpad-web",
            owner: "example",
            repo: "launchpad-web",
            maxPullRequests: 5,
            skippedAuthors: [],
        },
    ];
}

function demoReviews(): PullRequestReview[] {
    const now = Date.now();
    return [
        {
            repoId: "github-octoflow-api",
            pullRequest: {
                provider: "github",
                repoId: "github-octoflow-api",
                number: 184,
                title: "Cache project activity summaries",
                url: "https://github.com/example/octoflow-api/pull/184",
                author: "riley",
                headSha: "9f3b7c2d8a1e4f52b6c901df774aa018e8db7210",
                baseSha: "3a44a6b65d734515ab54c97f5ec10af42de4b095",
                updatedAt: new Date(now - 18 * 60 * 60 * 1000).toISOString(),
            },
            status: "reviewed",
            reviewedCommit: "9f3b7c2d8a1e4f52b6c901df774aa018e8db7210",
            reviewedAt: new Date(now - 16 * 60 * 60 * 1000).toISOString(),
            summary:
                "The cache layer is a useful performance win, but the current key omits the viewer role and can leak activity totals across permission scopes.",
            rawOutput:
                "Found one high-impact cache key issue and one lower-risk invalidation gap around archived projects.",
            diff: `diff --git a/src/activity/cache.ts b/src/activity/cache.ts
index 7c2a915..c91b0f6 100644
--- a/src/activity/cache.ts
+++ b/src/activity/cache.ts
@@ -1,9 +1,20 @@
+import { redis } from "../redis/client";
 import { loadActivity } from "./loadActivity";
 
-export async function getActivitySummary(projectId: string) {
-  return loadActivity(projectId);
+export async function getActivitySummary(projectId: string, viewerRole: string) {
+  const cacheKey = \`activity:\${projectId}\`;
+  const cached = await redis.get(cacheKey);
+
+  if (cached) {
+    return JSON.parse(cached);
+  }
+
+  const summary = await loadActivity(projectId, viewerRole);
+  await redis.set(cacheKey, JSON.stringify(summary), { ex: 300 });
+  return summary;
 }
diff --git a/src/activity/routes.ts b/src/activity/routes.ts
index c112243..2d7e401 100644
--- a/src/activity/routes.ts
+++ b/src/activity/routes.ts
@@ -12,7 +12,7 @@ router.get("/projects/:projectId/activity", async (req, res) => {
   const project = await requireProject(req.params.projectId, req.user.id);
   const role = await membershipRole(project.id, req.user.id);
 
-  const summary = await getActivitySummary(project.id);
+  const summary = await getActivitySummary(project.id, role);
   res.json({ projectId: project.id, summary });
 });`,
            comments: [
                {
                    path: "src/activity/cache.ts",
                    line: 5,
                    side: "right",
                    severity: "critical",
                    body: "This key only includes the project id, so a restricted viewer can receive a summary cached for an owner. Include viewerRole or permission scope in the key.",
                },
                {
                    path: "src/activity/cache.ts",
                    line: 14,
                    side: "right",
                    severity: "warning",
                    body: "Consider invalidating this when projects are archived or restored, otherwise the dashboard can show stale activity for up to five minutes.",
                },
            ],
        },
        {
            repoId: "github-octoflow-api",
            pullRequest: {
                provider: "github",
                repoId: "github-octoflow-api",
                number: 176,
                title: "Add bulk invitation endpoint",
                url: "https://github.com/example/octoflow-api/pull/176",
                author: "sam",
                headSha: "0d7a6c20b863a2b2e22ab986a51271940ac97d54",
                baseSha: "f92ec884de08f221932e982f3abca3e8ccca94fb",
                updatedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
            },
            status: "reviewed",
            reviewedCommit: "0d7a6c20b863a2b2e22ab986a51271940ac97d54",
            reviewedAt: new Date(now - 3 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString(),
            summary:
                "The endpoint covers the main workflow and reports partial failures clearly. The validation should reject duplicate emails before sending invitations.",
            rawOutput: "Suggested adding duplicate detection and a test for repeated addresses in one request.",
            diff: `diff --git a/src/invitations/bulk.ts b/src/invitations/bulk.ts
index a11d501..df98215 100644
--- a/src/invitations/bulk.ts
+++ b/src/invitations/bulk.ts
@@ -4,8 +4,18 @@ import { sendInvite } from "./sendInvite";
 export async function createBulkInvites(projectId: string, emails: string[]) {
   const results = [];
 
-  for (const email of emails) {
-    results.push(await sendInvite(projectId, email));
+  for (const email of emails.map((value) => value.trim().toLowerCase())) {
+    if (!email.includes("@")) {
+      results.push({ email, status: "invalid" });
+      continue;
+    }
+
+    try {
+      results.push(await sendInvite(projectId, email));
+    } catch (error) {
+      results.push({ email, status: "failed" });
+    }
   }
 
   return results;
 }`,
            comments: [
                {
                    path: "src/invitations/bulk.ts",
                    line: 6,
                    side: "right",
                    severity: "suggestion",
                    body: "Normalize first, then deduplicate the list before the loop. A repeated address currently receives multiple invites.",
                },
            ],
        },
        {
            repoId: "github-launchpad-web",
            pullRequest: {
                provider: "github",
                repoId: "github-launchpad-web",
                number: 92,
                title: "Refresh billing settings page",
                url: "https://github.com/example/launchpad-web/pull/92",
                author: "taylor",
                headSha: "bd441671ac82ac301bb7fbfcd77c9a4d76c255e2",
                baseSha: "76b4d911f77394b8ff64536b37ec9cd76f80036f",
                updatedAt: new Date(now - 7 * 60 * 60 * 1000).toISOString(),
            },
            status: "reviewed",
            reviewedCommit: "bd441671ac82ac301bb7fbfcd77c9a4d76c255e2",
            reviewedAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
            summary:
                "The layout is clearer and keyboard navigation remains intact. One empty-state branch still renders an enabled submit button with no selected plan.",
            rawOutput: "Checked billing settings flow. One submit-state bug found in the empty plan branch.",
            diff: `diff --git a/src/pages/billing/Settings.tsx b/src/pages/billing/Settings.tsx
index 9a070a1..ac13094 100644
--- a/src/pages/billing/Settings.tsx
+++ b/src/pages/billing/Settings.tsx
@@ -30,10 +30,15 @@ export function BillingSettings({ account, plans }: BillingSettingsProps) {
       <PlanPicker
         plans={plans}
         selectedPlan={selectedPlan}
         onChange={setSelectedPlan}
       />
-      <button type="submit" disabled={isSaving}>
-        Save billing settings
+      <button
+        type="submit"
+        disabled={isSaving || account.status === "past_due"}
+      >
+        {isSaving ? "Saving..." : "Save billing settings"}
       </button>
     </form>
   );
 }`,
            comments: [
                {
                    path: "src/pages/billing/Settings.tsx",
                    line: 37,
                    side: "right",
                    severity: "warning",
                    body: "This still allows submit when plans is empty and selectedPlan is undefined. Disable until a concrete plan is selected.",
                },
            ],
        },
        {
            repoId: "github-launchpad-web",
            pullRequest: {
                provider: "github",
                repoId: "github-launchpad-web",
                number: 88,
                title: "Migrate analytics cards to server data",
                url: "https://github.com/example/launchpad-web/pull/88",
                author: "avery",
                headSha: "a4acb7846f86b3b783f7311ea1cc06d1f50b7e81",
                baseSha: "f47dbe2a18d083ada55ff1fcf78fc6e949038935",
                updatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
            },
            status: "failed",
            reviewedCommit: "a4acb7846f86b3b783f7311ea1cc06d1f50b7e81",
            reviewedAt: new Date(now - 5 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000).toISOString(),
            summary: "Review failed.",
            rawOutput: "",
            diff: `diff --git a/src/components/AnalyticsCards.tsx b/src/components/AnalyticsCards.tsx
index 51ed23b..5a299ce 100644
--- a/src/components/AnalyticsCards.tsx
+++ b/src/components/AnalyticsCards.tsx
@@ -9,7 +9,7 @@ export function AnalyticsCards({ metrics }: AnalyticsCardsProps) {
   return (
     <section className="analytics-grid">
       {metrics.map((metric) => (
-        <MetricCard key={metric.label} metric={metric} />
+        <MetricCard key={metric.id} metric={metric} />
       ))}
     </section>
   );
 }`,
            comments: [],
            error: "Reviewer command exited before producing JSON output.",
        },
    ];
}
