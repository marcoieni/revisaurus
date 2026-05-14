import { execa } from "execa";
import type { Reviewer, ReviewRequest, ReviewResult } from "./reviewer.js";
import type { ReviewerConfig } from "../types/revisaur.js";
import { stripControlCharacters } from "../utils/sanitizeText.js";

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
        const args = ["chat", "--no-interactive", `--trust-tools=${this.config.trustTools}`];
        if (this.config.model) {
            args.push("--model", this.config.model);
        }
        args.push(prompt);

        const result = await execa(this.config.command, args, {
            timeout: this.config.timeoutSeconds * 1000,
            env: process.env,
            reject: false,
        });

        const rawOutput = formatReviewerOutput(result.stdout, result.stderr);
        if (result.failed) {
            throw new Error(formatReviewerFailure(result, rawOutput));
        }

        return rawOutput;
    }
}

function buildPrompt(request: ReviewRequest): string {
    const configuredInstructions = request.promptInstructions?.trim();
    const additionalInstructions = configuredInstructions
        ? `\nAdditional instructions:\n${configuredInstructions}\n`
        : "";

    return `Review this pull request diff.

Repository: ${request.repositoryUrl}
Pull request: #${request.pullRequest.number} ${request.pullRequest.title}
Author: ${request.pullRequest.author}
Head commit: ${request.pullRequest.headSha}
${additionalInstructions}

Return only valid JSON with this exact shape and no surrounding text:
{
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
}

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
Pull request: #${request.pullRequest.number} ${request.pullRequest.title}
Head commit: ${request.pullRequest.headSha}

Return only JSON with this exact shape and no surrounding markdown, prose, or code fences:
{
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
}

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
    const reason = result.timedOut
        ? "Reviewer command timed out"
        : `Reviewer command exited with code ${result.exitCode ?? "unknown"}`;
    return `${reason}.${previewOutput(rawOutput)}`;
}

function previewOutput(output: string): string {
    const trimmed = output.trim();
    if (!trimmed) {
        return " No reviewer output was captured.";
    }

    return ` Output preview: ${trimmed.slice(0, 1000)}`;
}

function parseReviewOutput(stdout: string): ReviewResult {
    const sanitizedOutput = stripControlCharacters(stdout);
    const json = extractJson(sanitizedOutput);
    const parsed = JSON.parse(json) as Omit<ReviewResult, "rawOutput">;

    return {
        summary: stripControlCharacters(parsed.summary ?? ""),
        comments: Array.isArray(parsed.comments)
            ? parsed.comments.map((comment) => ({
                  ...comment,
                  body: stripControlCharacters(comment.body ?? ""),
              }))
            : [],
        rawOutput: sanitizedOutput,
    };
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
