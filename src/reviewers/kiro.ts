import { execa } from "execa";
import type { Reviewer, ReviewRequest, ReviewResult } from "./reviewer.js";
import type { ReviewerConfig } from "../types/revisaurus.js";
import { stripControlCharacters } from "../utils/sanitizeText.js";

export class KiroReviewer implements Reviewer {
    constructor(private readonly config: ReviewerConfig) {}

    async review(request: ReviewRequest): Promise<ReviewResult> {
        const prompt = buildPrompt(request);
        const args = ["chat", "--no-interactive", `--trust-tools=${this.config.trustTools}`];
        if (this.config.model) {
            args.push("--model", this.config.model);
        }
        args.push(prompt);

        const { stdout } = await execa(
            this.config.command,
            args,
            {
                timeout: this.config.timeoutSeconds * 1000,
                env: process.env,
            },
        );

        return parseReviewOutput(stdout);
    }
}

function buildPrompt(request: ReviewRequest): string {
    return `Review this pull request diff.

Repository: ${request.repositoryUrl}
Pull request: #${request.pullRequest.number} ${request.pullRequest.title}
Author: ${request.pullRequest.author}
Head commit: ${request.pullRequest.headSha}

Return only JSON with this exact shape:
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

Use "right" for added/new lines and "left" for removed/old lines. Tie all comments to specific diff lines (even if the line isn't related to the comment sometimes).

Diff:
${request.diff}`;
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
