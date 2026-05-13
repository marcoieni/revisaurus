import { Octokit } from "octokit";
import type { RepositoryProvider } from "./provider.js";
import type {
    PullRequestSummary,
    RepositoryConfig,
} from "../types/revisaurus.js";

export class GitHubProvider implements RepositoryProvider {
    #client: Octokit;

    constructor(token = process.env.GITHUB_TOKEN) {
        this.#client = new Octokit(token ? { auth: token } : {});
    }

    async listRecentlyUpdatedPullRequests(
        repo: RepositoryConfig,
    ): Promise<PullRequestSummary[]> {
        const response = await this.#client.rest.pulls.list({
            owner: repo.owner,
            repo: repo.repo,
            state: "all",
            sort: "updated",
            direction: "desc",
            per_page: Math.min(repo.maxPullRequests * 3, 100),
        });

        const skipped = new Set(
            repo.skippedAuthors.map((author) => author.toLowerCase()),
        );

        return response.data
            .filter((pr) => !skipped.has((pr.user?.login ?? "").toLowerCase()))
            .slice(0, repo.maxPullRequests)
            .map((pr) => ({
                provider: "github",
                repoId: repo.id,
                number: pr.number,
                title: pr.title,
                url: pr.html_url,
                author: pr.user?.login ?? "unknown",
                headSha: pr.head.sha,
                baseSha: pr.base.sha,
                updatedAt: pr.updated_at,
                mergedAt: pr.merged_at,
            }));
    }

    async getPullRequestDiff(
        repo: RepositoryConfig,
        pullRequestNumber: number,
    ): Promise<string> {
        const response = await this.#client.rest.pulls.get({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: pullRequestNumber,
            mediaType: { format: "diff" },
        });

        return response.data as unknown as string;
    }
}
