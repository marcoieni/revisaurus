import { readFile } from "node:fs/promises";
import { parse } from "smol-toml";
import { z } from "zod";
import type { RepositoryConfig, RevisaurusConfig } from "../types/revisaurus.js";

const repositorySchema = z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    provider: z.enum(["github", "gitlab", "forgejo"]).default("github"),
    url: z.url(),
    max_pull_requests: z.number().int().positive().optional(),
    skipped_authors: z.array(z.string()).optional(),
    branch: z.string().optional(),
});

const configSchema = z.object({
    output_dir: z.string().default("site-dist"),
    data_dir: z.string().default(".revisaurus/data"),
    max_pull_requests: z.number().int().positive().default(10),
    skipped_authors: z.array(z.string()).default(["renovate", "renovate[bot]", "dependabot", "dependabot[bot]"]),
    reviewer: z
        .object({
            kind: z.enum(["kiro", "codex"]).default("kiro"),
            command: z.string().default("kiro-cli"),
            model: z.string().trim().min(1).optional(),
            trust_tools: z.string().default("read,grep"),
            timeout_seconds: z.number().int().positive().default(900),
        })
        .prefault({}),
    repositories: z.array(repositorySchema).min(1),
});

export async function loadConfig(path: string): Promise<RevisaurusConfig> {
    const source = await readFile(path, "utf8");
    const parsed = configSchema.parse(parse(source));
    const repositories = parsed.repositories.map((repo): RepositoryConfig => {
        const github = parseGitHubUrl(repo.url);
        const id = repo.id ?? `${repo.provider}-${github.owner}-${github.repo}`.toLowerCase();

        return {
            id,
            name: repo.name ?? `${github.owner}/${github.repo}`,
            provider: repo.provider,
            url: repo.url,
            owner: github.owner,
            repo: github.repo,
            branch: repo.branch,
            maxPullRequests: repo.max_pull_requests ?? parsed.max_pull_requests,
            skippedAuthors: repo.skipped_authors ?? parsed.skipped_authors,
        };
    });

    return {
        outputDir: parsed.output_dir,
        dataDir: parsed.data_dir,
        maxPullRequests: parsed.max_pull_requests,
        skippedAuthors: parsed.skipped_authors,
        reviewer: {
            kind: parsed.reviewer.kind,
            command: parsed.reviewer.command,
            model: parsed.reviewer.model,
            trustTools: parsed.reviewer.trust_tools,
            timeoutSeconds: parsed.reviewer.timeout_seconds,
        },
        repositories,
    };
}

function parseGitHubUrl(url: string): { owner: string; repo: string } {
    const match = /^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?\/?$/.exec(url);
    if (!match) {
        throw new Error(`Only GitHub repository URLs are supported today: ${url}`);
    }

    return { owner: match[1], repo: match[2] };
}
