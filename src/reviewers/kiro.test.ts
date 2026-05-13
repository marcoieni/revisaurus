import { beforeEach, describe, expect, it, vi } from "vitest";
import { execa } from "execa";
import { KiroReviewer } from "./kiro.js";
import type { ReviewerConfig } from "../types/revisaurus.js";

vi.mock("execa", () => ({
    execa: vi.fn(async () => ({
        stdout: JSON.stringify({
            summary: "Looks good.",
            comments: [],
        }),
    })),
}));

const request = {
    repositoryUrl: "https://github.com/example/project",
    pullRequest: {
        provider: "github" as const,
        repoId: "github-example-project",
        number: 123,
        title: "Improve widget",
        url: "https://github.com/example/project/pull/123",
        author: "dev",
        headSha: "abc123",
        baseSha: "def456",
        updatedAt: "2026-05-13T00:00:00.000Z",
    },
    diff: "diff --git a/widget.ts b/widget.ts",
};

function config(overrides: Partial<ReviewerConfig> = {}): ReviewerConfig {
    return {
        kind: "kiro",
        command: "kiro-cli",
        trustTools: "read,grep",
        timeoutSeconds: 900,
        ...overrides,
    };
}

describe("KiroReviewer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("runs Kiro without a model flag by default", async () => {
        await new KiroReviewer(config()).review(request);

        expect(execa).toHaveBeenCalledWith(
            "kiro-cli",
            expect.arrayContaining(["chat", "--no-interactive", "--trust-tools=read,grep"]),
            expect.objectContaining({ timeout: 900_000 }),
        );
        expect(execa).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.arrayContaining(["--model"]),
            expect.anything(),
        );
    });

    it("passes the configured model to Kiro", async () => {
        await new KiroReviewer(config({ model: "claude-sonnet-4.5" })).review(request);

        expect(execa).toHaveBeenCalledWith(
            "kiro-cli",
            expect.arrayContaining(["--model", "claude-sonnet-4.5"]),
            expect.objectContaining({ timeout: 900_000 }),
        );
    });
});
