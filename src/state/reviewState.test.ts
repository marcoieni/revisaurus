import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { emptyState, isReusableReview, loadState, reviewKey, saveState } from "./reviewState.js";
import type { PullRequestReview, PullRequestSummary, ReviewState } from "../types/revisaur.js";

describe("reviewState", () => {
    it("creates an empty versioned state", () => {
        expect(emptyState()).toEqual({ version: 1, reviews: {} });
    });

    it("returns an empty state when no state file exists", async () => {
        const dir = await mkdtemp(join(tmpdir(), "revisaur-state-"));

        await expect(loadState(join(dir, "missing.json"))).resolves.toEqual(emptyState());
    });

    it("saves and loads review state JSON", async () => {
        const dir = await mkdtemp(join(tmpdir(), "revisaur-state-"));
        const path = join(dir, "state.json");
        const state: ReviewState = {
            version: 1,
            reviews: {
                "github:repo:7:abc": {
                    repoId: "repo",
                    pullRequest: pullRequest(),
                    status: "reviewed",
                    reviewedCommit: "abc",
                    reviewedAt: "2026-01-01T00:00:00.000Z",
                    summary: "Looks good.",
                    rawOutput: "",
                    diff: "",
                    comments: [],
                },
            },
        };

        await saveState(path, state);

        await expect(loadState(path)).resolves.toEqual(state);
    });

    it("keys reviews by provider, repository, pull request number, and head SHA", () => {
        expect(reviewKey(pullRequest())).toBe("github:repo:7:abc");
    });

    it("does not reuse failed reviews from cache", () => {
        expect(isReusableReview(review({ status: "reviewed" }))).toBe(true);
        expect(isReusableReview(review({ status: "skipped" }))).toBe(true);
        expect(isReusableReview(review({ status: "failed" }))).toBe(false);
        expect(isReusableReview(undefined)).toBe(false);
    });
});

function pullRequest(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
    return {
        provider: "github",
        repoId: "repo",
        number: 7,
        title: "Update dependency",
        url: "https://github.com/example/repo/pull/7",
        author: "alice",
        headSha: "abc",
        baseSha: "def",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function review(overrides: Partial<PullRequestReview> = {}): PullRequestReview {
    return {
        repoId: "repo",
        pullRequest: pullRequest(),
        status: "reviewed",
        reviewedCommit: "abc",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        summary: "Looks good.",
        rawOutput: "",
        diff: "",
        comments: [],
        ...overrides,
    };
}
