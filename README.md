# Revisaur

> [!NOTE]
> This is still in early development. Come back after I announce this project publicly.

Revisaur reads a TOML configuration file, fetches the last N recently updated pull requests for each configured repository, runs an AI review for PR head commits that have not been reviewed yet, and generates a static Astro website.

The first provider is GitHub. The provider interface is intentionally isolated so GitLab and Forgejo can be added later. The first reviewer is Kiro CLI headless mode, with the reviewer interface ready for other tools such as Codex.

## Quick Start

```bash
pnpm install
cp examples/revisaur.toml revisaur.toml
GITHUB_TOKEN=... KIRO_API_KEY=... pnpm generate -- --config revisaur.toml
pnpm dev
```

To try the website without GitHub or reviewer credentials, generate demo data:

```bash
pnpm demo
pnpm dev
```

## Configuration

```toml
output_dir = "site-dist"
data_dir = ".revisaur/data"
max_pull_requests = 10
skipped_authors = ["renovate", "renovate[bot]", "dependabot", "dependabot[bot]"]
prompt_instructions = "Prioritize correctness, security, and regressions over style nits."

[reviewer]
kind = "kiro"
command = "kiro-cli"
model = "claude-opus-4.7"
trust_tools = "read,grep"
timeout_seconds = 900

[[repositories]]
name = "Astro"
provider = "github"
url = "https://github.com/withastro/astro"
max_pull_requests = 5
# prompt_instructions = "Repository-specific instructions override the global prompt_instructions value."
```

Use `prompt_instructions` to add reviewer guidance to the generated prompt. A repository-level value overrides the global value for that repository.

Revisaur stores review state in `.revisaur/data/state.json`. A PR commit is reviewed once per repository, PR number, and head SHA. If a PR receives new commits, the changed head SHA causes a new review. Existing reviews are reused when rebuilding the website.

## GitHub Pages

See [docs/github-action.md](docs/github-action.md) for a workflow using the composite action and the official GitHub Pages upload/deploy actions.

## Diff Rendering

The generated Astro site uses [`@pierre/diffs`](https://diffs.com/) to render pull request patches and line-specific AI review comments.

## Icons

The site uses the following icons from [lucide.dev](https://lucide.dev):

- `public/icons/file.svg`
- `public/icons/moon.svg`
- `public/icons/square-split-horizontal.svg`
- `public/icons/square-split-vertical.svg`
- `public/icons/sun.svg`
- `public/icons/text-align-justify.svg`
- `public/icons/text-wrap.svg`
