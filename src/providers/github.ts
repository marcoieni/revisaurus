import { Octokit } from "octokit";
import type { RepositoryProvider } from "./provider.js";
import type { PullRequestSummary, RepositoryConfig } from "../types/revisaur.js";

export class GitHubProvider implements RepositoryProvider {
    #client: Octokit;

    constructor(token = process.env.GITHUB_TOKEN) {
        this.#client = new Octokit(token ? { auth: token } : {});
    }

    async listRecentlyUpdatedPullRequests(repo: RepositoryConfig): Promise<PullRequestSummary[]> {
        const response = await this.#client.rest.pulls.list({
            owner: repo.owner,
            repo: repo.repo,
            state: "open",
            sort: "updated",
            direction: "desc",
            per_page: Math.min(repo.maxPullRequests * 3, 100),
        });

        const skipped = new Set(repo.skippedAuthors.map((author) => author.toLowerCase()));

        const pullRequests = response.data
            .filter((pr) => !skipped.has((pr.user?.login ?? "").toLowerCase()))
            .slice(0, repo.maxPullRequests);

        return Promise.all(
            pullRequests.map(async (pr) => ({
                provider: "github",
                repoId: repo.id,
                number: pr.number,
                reviewState: pr.draft ? "draft" : await this.#reviewState(repo, pr.number),
                title: pr.title,
                url: pr.html_url,
                author: pr.user?.login ?? "unknown",
                headSha: pr.head.sha,
                baseSha: pr.base.sha,
                updatedAt: pr.updated_at,
                mergedAt: pr.merged_at,
            })),
        );
    }

    async getPullRequestDiff(repo: RepositoryConfig, pullRequestNumber: number): Promise<string> {
        const response = await this.#client.rest.pulls.get({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: pullRequestNumber,
            mediaType: { format: "diff" },
        });

        return response.data as unknown as string;
    }

    async #reviewState(repo: RepositoryConfig, pullRequestNumber: number): Promise<"ready" | "approved"> {
        const response = await this.#client.rest.pulls.listReviews({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: pullRequestNumber,
            per_page: 100,
        });

        const latestReviewByUser = new Map<string, { state: string; submittedAt: string }>();

        for (const review of response.data) {
            const user = review.user?.login;
            const submittedAt = review.submitted_at;

            if (!user || !submittedAt) {
                continue;
            }

            const latestReview = latestReviewByUser.get(user);
            if (!latestReview || submittedAt > latestReview.submittedAt) {
                latestReviewByUser.set(user, { state: review.state, submittedAt });
            }
        }

        const latestStates = [...latestReviewByUser.values()].map((review) => review.state);

        if (latestStates.includes("CHANGES_REQUESTED")) {
            return "ready";
        }

        return latestStates.includes("APPROVED") ? "approved" : "ready";
    }
}
