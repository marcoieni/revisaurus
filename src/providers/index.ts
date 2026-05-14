import { GitHubProvider } from "./github.js";
import type { RepositoryProvider } from "./provider.js";
import type { RepositoryConfig } from "../types/revisaur.js";

export function providerFor(repo: RepositoryConfig): RepositoryProvider {
    switch (repo.provider) {
        case "github":
            return new GitHubProvider();
        case "gitlab":
        case "forgejo":
            throw new Error(`${repo.provider} provider is planned but not implemented yet.`);
    }
}
