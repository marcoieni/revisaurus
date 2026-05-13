import { execa } from "execa";
import type { Reviewer, ReviewRequest, ReviewResult } from "./reviewer.js";
import type { ReviewerConfig } from "../types/revisaurus.js";

export class KiroReviewer implements Reviewer {
    constructor(private readonly config: ReviewerConfig) {}

    async review(request: ReviewRequest): Promise<ReviewResult> {
        const prompt = buildPrompt(request);
        const { stdout } = await execa(
            this.config.command,
            [
                "chat",
                "--no-interactive",
                `--trust-tools=${this.config.trustTools}`,
                prompt,
            ],
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
    const json = extractJson(stdout);
    const parsed = JSON.parse(json) as Omit<ReviewResult, "rawOutput">;

    return {
        summary: parsed.summary ?? "",
        comments: Array.isArray(parsed.comments) ? parsed.comments : [],
        rawOutput: stdout,
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
