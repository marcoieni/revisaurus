import type { PullRequestSummary, ReviewComment } from "../types/revisaurus.js";

export interface ReviewRequest {
  repositoryUrl: string;
  pullRequest: PullRequestSummary;
  diff: string;
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
  rawOutput: string;
}

export interface Reviewer {
  review(request: ReviewRequest): Promise<ReviewResult>;
}
