import type { RepositoryConfig } from "../types/revisaur.js";

export function repositoryLabel(repo: Pick<RepositoryConfig, "name" | "owner">): string {
    return repo.name.includes("/") ? repo.name : `${repo.owner}/${repo.name}`;
}
