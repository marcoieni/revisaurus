import type { PullRequestSummary, RepositoryConfig } from "../types/revisaur.js";

export interface RepositoryProvider {
    listRecentlyUpdatedPullRequests(repo: RepositoryConfig): Promise<PullRequestSummary[]>;
    getPullRequestDiff(repo: RepositoryConfig, pullRequestNumber: number): Promise<string>;
}
