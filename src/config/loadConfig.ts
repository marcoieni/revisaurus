import { readFile } from "node:fs/promises";
import { parse } from "smol-toml";
import { z } from "zod";
import type { RepositoryConfig, RevisaurConfig } from "../types/revisaur.js";

const dataDirKey = "data_dir";
const maxPullRequestsKey = "max_pull_requests";
const outputDirKey = "output_dir";
const promptInstructionsKey = "prompt_instructions";
const sandboxImageKey = "sandbox_image";
const skippedAuthorsKey = "skipped_authors";
const timeoutSecondsKey = "timeout_seconds";
const trustToolsKey = "trust_tools";

const repositorySchema = z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    provider: z.enum(["github", "gitlab", "forgejo"]).default("github"),
    url: z.url(),
    [maxPullRequestsKey]: z.number().int().positive().optional(),
    [skippedAuthorsKey]: z.array(z.string()).optional(),
    [promptInstructionsKey]: z.string().trim().min(1).optional(),
    branch: z.string().optional(),
});

const configSchema = z.object({
    [outputDirKey]: z.string().default("site-dist"),
    [dataDirKey]: z.string().default(".revisaur/data"),
    [maxPullRequestsKey]: z.number().int().positive().default(10),
    [skippedAuthorsKey]: z.array(z.string()).default(["renovate", "renovate[bot]", "dependabot", "dependabot[bot]"]),
    [promptInstructionsKey]: z.string().trim().min(1).optional(),
    reviewer: z
        .object({
            kind: z.enum(["kiro", "codex"]).default("kiro"),
            command: z.string().default("kiro-cli"),
            model: z.string().trim().min(1).optional(),
            sandbox: z.enum(["docker", "none"]).default("none"),
            [sandboxImageKey]: z.string().trim().min(1).optional(),
            [trustToolsKey]: z.string().default("read,grep"),
            [timeoutSecondsKey]: z.number().int().positive().default(900),
        })
        .superRefine((reviewer, context) => {
            if (reviewer.sandbox === "docker" && reviewer.sandbox_image === undefined) {
                context.addIssue({
                    code: "custom",
                    message: 'reviewer.sandbox_image is required when reviewer.sandbox is "docker".',
                    path: [sandboxImageKey],
                });
            }
        })
        .prefault({}),
    repositories: z.array(repositorySchema).min(1),
});

export async function loadConfig(path: string): Promise<RevisaurConfig> {
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
            promptInstructions: repo.prompt_instructions ?? parsed.prompt_instructions,
        };
    });

    return {
        outputDir: parsed.output_dir,
        dataDir: parsed.data_dir,
        maxPullRequests: parsed.max_pull_requests,
        skippedAuthors: parsed.skipped_authors,
        promptInstructions: parsed.prompt_instructions,
        reviewer: {
            kind: parsed.reviewer.kind,
            command: parsed.reviewer.command,
            model: parsed.reviewer.model,
            sandbox: parsed.reviewer.sandbox,
            sandboxImage: parsed.reviewer.sandbox_image,
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
