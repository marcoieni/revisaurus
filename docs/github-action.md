# GitHub Action

Revisaurus ships as a composite action. It installs Node, pnpm, Kiro CLI, runs the generator, and can upload the generated static site as the official GitHub Pages artifact.

Kiro headless mode requires `KIRO_API_KEY`. Create a Kiro API key and store it as a repository secret named `KIRO_API_KEY`. Kiro documents headless mode as `kiro-cli chat --no-interactive`, with API-key auth through the `KIRO_API_KEY` environment variable.

```yaml
name: Revisaurus

on:
  workflow_dispatch:
  schedule:
    - cron: "17 * * * *"

permissions:
  contents: read
  pages: write
  id-token: write
  pull-requests: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: your-org/revisaurus/action@v1
        env:
          KIRO_API_KEY: ${{ secrets.KIRO_API_KEY }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

For now the provider implementation supports GitHub repository URLs. The config keeps an explicit `provider` field so GitLab and Forgejo providers can be added without changing the file shape.
