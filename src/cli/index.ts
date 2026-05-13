#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { ensureDir, writeJson } from "fs-extra/esm";
import { execa } from "execa";
import { loadConfig } from "../config/loadConfig.js";
import { providerFor } from "../providers/index.js";
import { reviewerFor } from "../reviewers/index.js";
import { loadState, reviewKey, saveState } from "../state/reviewState.js";
import type { PullRequestReview, RevisaurusConfig } from "../types/revisaurus.js";

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
    const packageRoot = resolvePackageRoot();
    await execa("pnpm", ["astro", "build"], {
      stdio: "inherit",
      cwd: packageRoot,
      env: {
        ...process.env,
        REVISAURUS_DATA_DIR: config.dataDir,
        REVISAURUS_OUTPUT_DIR: outputDir,
        REVISAURUS_WORKSPACE: workspace,
      },
    });
  }
}

function resolvePackageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return here.endsWith(`${path.sep}dist${path.sep}cli`)
    ? path.resolve(here, "../..")
    : path.resolve(here, "../..");
}
