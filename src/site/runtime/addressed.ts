import type { PullRequestReview } from "../../types/revisaur.js";

export const addressedStorageKey = "revisaur:addressed:v1";

export type AddressedState = Record<string, boolean>;

export interface AddressedComment {
    path: string;
    line: number;
    side: "left" | "right";
    body: string;
}

export function browserReviewKey(review: PullRequestReview): string {
    return [review.pullRequest.provider, review.repoId, review.pullRequest.number, review.reviewedCommit].join(":");
}

export function reviewAddressedKey(reviewKey: string): string {
    return `${reviewKey}:pr`;
}

export function commentAddressedKey(reviewKey: string, comment: AddressedComment, index: number): string {
    return [
        reviewKey,
        "comment",
        index.toString(),
        comment.path,
        comment.side,
        comment.line.toString(),
        hashString(comment.body),
    ].join(":");
}

export function loadAddressedState(): AddressedState {
    try {
        const storedState = localStorage.getItem(addressedStorageKey);
        const parsed: unknown = storedState === null ? {} : JSON.parse(storedState);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "boolean"))
            : {};
    } catch {
        return {};
    }
}

export function setAddressedValue(state: AddressedState, key: string, value: boolean): AddressedState {
    const nextState = { ...state, ...loadAddressedState(), [key]: value };

    try {
        localStorage.setItem(addressedStorageKey, JSON.stringify(nextState));
    } catch {
        // Keep the merged in-memory state for the current page when storage is unavailable.
    }

    return nextState;
}

function hashString(value: string): string {
    let hash = 0;

    for (const character of value) {
        const codePoint = character.codePointAt(0) ?? 0;
        hash = (Math.imul(31, hash) + codePoint) | 0;
    }

    return (hash >>> 0).toString(36);
}
