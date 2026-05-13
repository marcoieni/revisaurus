import { KiroReviewer } from "./kiro.js";
import type { Reviewer } from "./reviewer.js";
import type { ReviewerConfig } from "../types/revisaurus.js";

export function reviewerFor(config: ReviewerConfig): Reviewer {
    switch (config.kind) {
        case "kiro":
            return new KiroReviewer(config);
        case "codex":
            throw new Error("Codex reviewer support is planned but not implemented yet.");
    }
}
