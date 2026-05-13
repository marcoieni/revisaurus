# Revisaurus

Revisaurus reads a TOML configuration file, fetches the last N recently updated pull requests for each configured repository, runs an AI review for PR head commits that have not been reviewed yet, and generates a static Astro website.

The first provider is GitHub. The provider interface is intentionally isolated so GitLab and Forgejo can be added later. The first reviewer is Kiro CLI headless mode, with the reviewer interface ready for other tools such as Codex.

## Quick Start

```bash
pnpm install
cp examples/revisaurus.toml revisaurus.toml
GITHUB_TOKEN=... KIRO_API_KEY=... pnpm generate -- --config revisaurus.toml
pnpm dev
```

## Configuration

```toml
output_dir = "site-dist"
data_dir = ".revisaurus/data"
max_pull_requests = 10
skipped_authors = ["renovate", "renovate[bot]", "dependabot", "dependabot[bot]"]

[reviewer]
kind = "kiro"
command = "kiro-cli"
trust_tools = "read,grep"
timeout_seconds = 900

[[repositories]]
name = "Astro"
provider = "github"
url = "https://github.com/withastro/astro"
max_pull_requests = 5
```

Revisaurus stores review state in `.revisaurus/data/state.json`. A PR commit is reviewed once per repository, PR number, and head SHA. If a PR receives new commits, the changed head SHA causes a new review. Existing reviews are reused when rebuilding the website.

## GitHub Pages

See [docs/github-action.md](docs/github-action.md) for a workflow using the composite action and the official GitHub Pages upload/deploy actions.

## Diff Rendering

The generated Astro site uses [`@pierre/diffs`](https://diffs.com/) to render pull request patches and line-specific AI review comments.
