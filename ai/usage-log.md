<!--
AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-09-28
Scope: Recorded the CodeQL workflow configuration and expanded pull request coverage.
Author review: Initial setup approved in PR #23; expanded PR coverage pending human review.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Moved the CodeQL entries under the Jian Bing section when merging main into PR #27; entry text unchanged.
Author review: Pending human review on PR #27.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Wrote the PR #30 review-fix entry under the Jian Bing section.
Author review: Jian Bing supplied the prompts quoted in that entry; pending his review on PR #30.
Tool: Claude Code (model: Claude Opus 5), date: 2026-09-29
Scope: Wrote the Cole Lin entries for PRs #7, #28, #30 and #33 from his prompts in the session.
Author review: Cole Lin confirmed the prompts, decisions and verification described.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Wrote the SoCLaaS TLS stopgap entry under the Jian Bing section (PR #36).
Author review: Jian Bing supplied the prompts quoted in that entry; pending his review on PR #36.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Moved lihloway's four Supplier Service entries under the Cole Lin section when merging main into PR #33; entry text unchanged.
Author review: Pending review by Jian Bing and lihloway on PR #33.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-09-29
Scope: Wrote the Supplier Service Docker Compose entry under the Jian Bing section (PR #33).
Author review: Jian Bing supplied the prompts quoted in that entry; pending his review on PR #33.
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Combined PR #33 entries with the frontend and gateway log while merging PR #33.
Author review: Pending team review of the merged log.
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Combined the main-branch log with the User frontend integration entries.
Author review: Pending team review.
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Combined User and Supplier integration disclosures and entries while resolving PR #37 merge conflicts.
Author review: Pending team review of the merged log.
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Preserved main's Jian Bing entries and branch-specific frontend and gateway entries while resolving PR #43 merge conflicts.
Author review: Pending Jie Yang's review of the merge resolution.
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Recorded the approved gateway and frontend Compose implementation and its verification.
Author review: Pending Jie Yang's review of the Compose change.
Tool: Codex (model: GPT-6), date: 2026-09-29
Scope: Recorded the frontend origin-check fix and Docker regression verification.
Author review: Pending Jie Yang's review of the security fix.
Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-12
Scope: Split the per-member sections into ai/usage-log/<member>.md and turned this file into the index (issue #65); entry text moved unchanged.
Author review: Jian Bing checked the logs locally against the AI usage-log guidelines in the project document (Appendix 2), confirmed they render with clean formatting in his IDE, and confirmed every entry, comment and other component is present.
-->

# AI Usage Log — FoC (CS3219 AY26/27 S1, Group 3)

Required by Appendix 2 of the project document: *"Maintain a log, `/ai/usage-log.md`, in the
repository with timestamps, prompts, and usage scenarios."* Every AI-assisted change needs an
entry in this log (your member file below) **as well as** the header comment in each affected file.

## How to add an entry

- Add entries to **your own file** in `ai/usage-log/` (table below). One shared file conflicted
  on almost every pull request; separate files do not. Don't edit this index for a new entry.
- Newest entry first within your file.
- One entry per pull request. Record the **exact prompts** — paraphrases do not meet the
  policy — but summarise the responses.
- Say what you **rejected or changed**. That is the evidence you reviewed the output rather
  than pasting it.

Template:

```
### YYYY-MM-DD — <what you were doing> (PR #N)
**Tool:** <tool (model)> · **Mode:** generate | refactor | debug | explain
**Files:** <paths>

**Scenario:** why you used it and what for.

**Prompts:**
> exact prompt text

**What it produced:** …
**What I changed or rejected:** …
**Verification:** how you checked it.
```

## Member logs

| Member | Log |
|---|---|
| Cole Lin | [`ai/usage-log/cole-lin.md`](usage-log/cole-lin.md) |
| Deanson | [`ai/usage-log/deanson.md`](usage-log/deanson.md) |
| Jian Bing | [`ai/usage-log/jian-bing.md`](usage-log/jian-bing.md) |
| Jie Yang | [`ai/usage-log/jie-yang.md`](usage-log/jie-yang.md) |
| Zi Yi | [`ai/usage-log/zi-yi.md`](usage-log/zi-yi.md) |
