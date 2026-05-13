import { pathExists, readJson, writeJson } from "fs-extra/esm";
import type { PullRequestSummary, ReviewState } from "../types/revisaurus.js";

export function emptyState(): ReviewState {
    return { version: 1, reviews: {} };
}

export async function loadState(path: string): Promise<ReviewState> {
    if (!(await pathExists(path))) {
        return emptyState();
    }

    return (await readJson(path)) as ReviewState;
}

export async function saveState(path: string, state: ReviewState): Promise<void> {
    await writeJson(path, state, { spaces: 2 });
}

export function reviewKey(pr: PullRequestSummary): string {
    return `${pr.provider}:${pr.repoId}:${pr.number}:${pr.headSha}`;
}
