<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Recorded the CodeQL workflow configuration and expanded pull request coverage.
Author review: Initial setup approved in PR #23; expanded PR coverage pending human review.
AI-generated log entry; expanded PR coverage pending human review.
-->

# AI usage log

## 2026-09-28 13:08 UTC — CodeQL advanced setup

- Tool and mode: Codex (GPT-6), generate and debug.
- Usage scenario: Configure CodeQL analysis for public fork pull requests while continuing to scan JavaScript/TypeScript and GitHub Actions.
- Prompts (exact): “assist me in configuring a more advanced version of codeQL workflow for me to customize”
- Key response: “I’ll configure the CodeQL workflow for pull requests, then switch GitHub from default to advanced setup and check whether PR #7 receives a scan. I’ll inspect the repository settings and existing workflow first.”
- Output: `.github/workflows/codeql.yml` in PR #23.
- Human review: Initial setup approved by Jyang1206 and merged in PR #23. The CodeQL jobs ran successfully after the repository switched to advanced setup.

### 2026-09-28 — Follow-up: scan PRs targeting any branch

- Tool and mode: Codex (GPT-6), generate.
- Usage scenario: Extend the CodeQL setup above to cover feature-to-feature pull requests, including stacked changes.
- Prompts (exact):“lets alter the current codeQL configuration from the current only main prs to now also include pr-to-pr”
- Key response: “I’ll expand CodeQL to scan PRs targeting any branch, keep the existing merge protection on `main`, and open a PR for the change.”
- Output: Removed the `pull_request.branches` filter from `.github/workflows/codeql.yml`; main push scans and the weekly schedule are unchanged.
- Human review: Pending for this follow-up change.
