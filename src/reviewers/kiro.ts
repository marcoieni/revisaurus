import { execa } from "execa";
import type { Reviewer, ReviewRequest, ReviewResult } from "./reviewer.js";
import type { ReviewComment, ReviewerConfig } from "../types/revisaur.js";
import { stripControlCharacters } from "../utils/sanitizeText.js";

const reviewSeverities = new Set<ReviewComment["severity"]>(["critical", "note", "suggestion", "warning"]);
const reviewerEnvironmentKeys = ["HOME", "KIRO_API_KEY", "PATH"] as const;
const dockerReviewerHome = "/home/revisaur";
const reviewJsonShape = `{
  "summary": "short markdown summary",
  "comments": [
    {
      "path": "file path from the diff",
      "line": 123,
      "side": "right",
      "severity": "critical|warning|suggestion|note",
      "body": "comment body"
    }
  ]
}`;

export class KiroReviewer implements Reviewer {
    constructor(private readonly config: ReviewerConfig) {}

    async review(request: ReviewRequest): Promise<ReviewResult> {
        const prompt = buildPrompt(request);
        const rawOutput = await this.runKiro(prompt);
        try {
            return parseReviewOutput(rawOutput);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            const repairedOutput = await this.runKiro(buildRepairPrompt(request, rawOutput));
            try {
                return parseReviewOutput(repairedOutput);
            } catch {
                throw new Error(`Reviewer did not produce valid JSON: ${reason}${previewOutput(rawOutput)}`);
            }
        }
    }

    private async runKiro(prompt: string): Promise<string> {
        const command = reviewerCommand(this.config, prompt);

        const result = await execa(command.file, command.args, {
            timeout: this.config.timeoutSeconds * 1000,
            // The reviewer consumes attacker-influenced PR diffs, so do not inherit
            // workflow credentials such as GITHUB_TOKEN.
            env: command.env,
            extendEnv: false,
            reject: false,
        });

        const rawOutput = formatReviewerOutput(result.stdout, result.stderr);
        if (result.failed) {
            throw new Error(formatReviewerFailure(result, rawOutput));
        }

        return rawOutput;
    }
}

function reviewerCommand(
    config: ReviewerConfig,
    prompt: string,
): { args: string[]; env: NodeJS.ProcessEnv; file: string } {
    const kiroArgs = kiroArgsFor(config, prompt);
    if (config.sandbox === "docker") {
        return dockerReviewerCommand(config, kiroArgs);
    }

    return {
        file: config.command,
        args: kiroArgs,
        env: reviewerEnvironment(),
    };
}

function kiroArgsFor(config: ReviewerConfig, prompt: string): string[] {
    const args = ["chat", "--no-interactive", `--trust-tools=${config.trustTools}`];
    if (config.model !== undefined && config.model !== "") {
        args.push("--model", config.model);
    }
    args.push(prompt);
    return args;
}

function dockerReviewerCommand(
    config: ReviewerConfig,
    kiroArgs: string[],
): { args: string[]; env: NodeJS.ProcessEnv; file: string } {
    if (config.sandboxImage === undefined || config.sandboxImage === "") {
        throw new Error('reviewer.sandbox_image is required when reviewer.sandbox is "docker".');
    }

    return {
        file: "docker",
        args: [
            "run",
            "--rm",
            "--network",
            "bridge",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--read-only",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000",
            "--tmpfs",
            `${dockerReviewerHome}:rw,nosuid,nodev,size=128m,uid=1000,gid=1000`,
            "--user",
            "1000:1000",
            "--workdir",
            "/tmp",
            "--pids-limit",
            "128",
            "--memory",
            "1g",
            "--cpus",
            "1",
            "--env",
            "KIRO_API_KEY",
            "--env",
            `HOME=${dockerReviewerHome}`,
            config.sandboxImage,
            config.command,
            ...kiroArgs,
        ],
        env: dockerClientEnvironment(),
    };
}

function reviewerEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};

    for (const key of reviewerEnvironmentKeys) {
        if (source[key] !== undefined) {
            env[key] = source[key];
        }
    }

    return env;
}

function dockerClientEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};

    for (const key of ["KIRO_API_KEY", "PATH"] as const) {
        if (source[key] !== undefined) {
            env[key] = source[key];
        }
    }

    return env;
}

function buildPrompt(request: ReviewRequest): string {
    const configuredInstructions = request.promptInstructions?.trim();
    const additionalInstructions =
        configuredInstructions !== undefined && configuredInstructions !== ""
            ? `\nAdditional instructions:\n${configuredInstructions}\n`
            : "";

    return `Review this pull request diff.

Repository: ${request.repositoryUrl}
Pull request: #${request.pullRequest.number.toString()} ${request.pullRequest.title}
Author: ${request.pullRequest.author}
Head commit: ${request.pullRequest.headSha}
${additionalInstructions}

Return only valid JSON with this exact shape and no surrounding text:
${reviewJsonShape}

Use "right" for added/new lines and "left" for removed/old lines. Tie all comments to specific diff lines.
Summaries and comment bodies may contain markdown. Use escaped JSON newlines ("\\n") when they improve readability.
If there are no findings, return an empty comments array.
If you cannot complete the review, still return valid JSON with a summary explaining the limitation and an empty comments array.

Diff:
${request.diff}`;
}

function buildRepairPrompt(request: ReviewRequest, previousOutput: string): string {
    return `Convert the previous pull request review output into valid JSON only.

Repository: ${request.repositoryUrl}
Pull request: #${request.pullRequest.number.toString()} ${request.pullRequest.title}
Head commit: ${request.pullRequest.headSha}

Return only JSON with this exact shape and no surrounding markdown, prose, or code fences:
${reviewJsonShape}

Rules:
- Preserve any specific findings from the previous output.
- Preserve useful paragraph breaks or bullet-style lines with escaped JSON newlines ("\\n").
- Tie comments only to specific file paths and line numbers mentioned in the previous output.
- If no specific comments can be recovered, return an empty comments array.
- If the previous output says the review could not be completed, put that limitation in summary and return an empty comments array.

Previous output:
${previousOutput.slice(0, 12000)}`;
}

function formatReviewerOutput(stdout: string, stderr: string): string {
    const parts = [stdout, stderr].filter((part) => part.trim().length > 0);
    return stripControlCharacters(parts.join("\n"));
}

function formatReviewerFailure(
    result: { exitCode?: number; timedOut?: boolean; stdout: string; stderr: string },
    rawOutput: string,
): string {
    const reason =
        result.timedOut === true
            ? "Reviewer command timed out"
            : `Reviewer command exited with code ${(result.exitCode ?? "unknown").toString()}`;
    return `${reason}.${previewOutput(rawOutput)}`;
}

function previewOutput(output: string): string {
    const trimmed = output.trim();
    if (trimmed === "") {
        return " No reviewer output was captured.";
    }

    return ` Output preview: ${trimmed.slice(0, 1000)}`;
}

function parseReviewOutput(stdout: string): ReviewResult {
    const sanitizedOutput = stripControlCharacters(stdout);
    const json = extractJson(sanitizedOutput);
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed)) {
        throw new Error("Reviewer JSON must be an object.");
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary : "";
    const comments = Array.isArray(parsed.comments) ? parsed.comments.flatMap(parseReviewComment) : [];

    return {
        summary: stripControlCharacters(summary),
        comments,
        rawOutput: sanitizedOutput,
    };
}

function parseReviewComment(value: unknown): ReviewComment[] {
    if (
        !isRecord(value) ||
        typeof value.path !== "string" ||
        typeof value.line !== "number" ||
        !isReviewSide(value.side) ||
        !isReviewSeverity(value.severity)
    ) {
        return [];
    }

    const body = typeof value.body === "string" ? value.body : "";

    return [
        {
            path: value.path,
            line: value.line,
            side: value.side,
            severity: value.severity,
            body: stripControlCharacters(body),
        },
    ];
}

function isReviewSide(value: unknown): value is ReviewComment["side"] {
    return value === "left" || value === "right";
}

function isReviewSeverity(value: unknown): value is ReviewComment["severity"] {
    return typeof value === "string" && reviewSeverities.has(value as ReviewComment["severity"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function extractJson(output: string): string {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(output);
    if (fenced) {
        return fenced[1].trim();
    }

    const start = output.indexOf("{");
    const end = output.lastIndexOf("}");
    if (start >= 0 && end > start) {
        return output.slice(start, end + 1);
    }

    throw new Error("Reviewer did not return JSON.");
}
