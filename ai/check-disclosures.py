"""AI Assistance Disclosure:
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Generated this check. Written after the same mistake - a file changed with an AI assistant
  and no disclosure entry for that change - came back from the reviewer ten times on one branch.
  Grepping for today's date is what I had been doing and it is not enough: a file that already
  carries an entry from earlier the same day passes while the new change goes undisclosed. This
  asks a different question - did the header itself gain a line in this branch's diff?
Author review: Cole Lin, read and approved.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Compare against the merge base rather than HEAD, so it sees uncommitted work. Run on the
  change it was written for, it reported two files I had already fixed but not yet committed -
  which is exactly when you want to run it.
Author review: Cole Lin, read and approved.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Review: stop on a git failure instead of reporting a clean result from an empty diff, and
  recognise Lua's `--` comments, which made a Lua file's whole body count as its header.
Author review: Cole Lin, read and approved.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-09
Scope: Review: follow renames, so a moved file is not mistaken for a newly written one; and in JSON
  the header is the single line holding it, because the key is `_disclosure` in the route files and
  `description` in the Postman collection - keying on one name let the rest of the document count
  as header.
Author review: Cole Lin, read and approved.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-10
Scope: Review: say so when a change removes a header outright. That left no lines to compare, so
  the file was skipped in silence and a branch whose only change deleted a disclosure read clean -
  the most complete version of what this is for.
Author review: Cole Lin, read and approved.
Tool: Claude Code (model: Claude Opus 5), date: 2026-11-10
Scope: Review: find the marker only where a header can be. Several documents quote the disclosure
  template in their body as an example - the root AGENTS.md does, in a fenced code block - so with
  the real top-of-file header deleted the search landed on that one, the "header" ran to the end of
  the document, and any added body line read as an added disclosure line. A JSON file is judged by
  its disclosure field instead, since its first line is `{`.
Author review: Cole Lin, read and approved.
"""
# Lists files your branch changes that carry an AI disclosure header but gained no entry in it.
#
#   python ai/check-disclosures.py              # against origin/main
#   python ai/check-disclosures.py main         # against another base
#
# It is a prompt, not a gate: it cannot tell whether an entry *describes* the change, only whether
# the header grew, and a change a human wrote unaided needs no entry. Read the list and judge.
# Findings exit 0, so it blocks nothing; only a git failure exits non-zero, because a check that
# silently examined nothing must not read as a pass.
# AI-generated (reviewed by Cole Lin).
import json
import subprocess
import sys

MARKER = "AI Assistance Disclosure"
# A header written as line comments ends at the first line that is not one. Lua uses `--`, which an
# earlier version did not know, so a Lua file's whole body counted as its header and any added line
# of code looked like an added disclosure entry - a false pass (review).
LINE_COMMENT = ("#", "//", "--")
# A header inside a block comment ends at the block's own terminator.
BLOCK_ENDERS = ("-->", '"""', "*/")


def git(*args):
    """Run git, or stop. A failure used to come back as empty output, which read as success.

    `check-disclosures.py nonexistent-ref` printed "every changed file ... gained an entry": the
    merge-base lookup failed silently, the diff was empty, and nothing was examined (review). A
    check that cannot tell "nothing to report" from "nothing ran" is worse than no check.
    """
    done = subprocess.run(["git", *args], capture_output=True)
    if done.returncode != 0:
        detail = done.stderr.decode("utf-8", "replace").strip() or f"git {args[0]} failed"
        sys.exit(f"check-disclosures: {detail}")
    return done.stdout.decode("utf-8", "replace")


# A JSON file keeps its disclosure in a field rather than a comment, so the "leading comment block"
# bound does not apply to it: its first line is `{`. The field is what makes it a header - named
# `_disclosure` in the route files, `description` in package.json, and `info.description` in the
# Postman collection - so look for it there rather than anywhere a string happens to mention the
# template (review).
JSON_FIELDS = ("_disclosure", "description")

def json_disclosure(text):
    """Whether this JSON file carries its disclosure in a disclosure field."""
    try:
        data = json.loads(text)
    except ValueError:
        return False          # a JSON file with comments; the comment rule applies to it
    if not isinstance(data, dict):
        return False
    objects = [data] + [value for value in data.values() if isinstance(value, dict)]
    return any(isinstance(obj.get(field), str) and MARKER in obj[field]
               for obj in objects for field in JSON_FIELDS)


def leading_region(lines):
    """How many lines of the top of the file could hold a header.

    The marker has to be found inside this, not anywhere in the file. Several documents quote the
    disclosure template in their body as an example - the root AGENTS.md does, inside a fenced code
    block - and a search over the whole file picks that up once the real top-of-file header is
    deleted. For AGENTS.md the "header" then ran to the end of the document, so any added body line
    looked like an added disclosure line and the removal was reported as clean (review).
    """
    inside = False
    for index, line in enumerate(lines):
        stripped = line.strip()
        if inside:
            if any(stripped.startswith(end) or stripped.endswith(end) for end in BLOCK_ENDERS):
                return index + 1
            continue
        if not stripped or stripped.startswith("#!"):
            continue
        if stripped.startswith(("<!--", "/*")) or stripped.startswith('"""'):
            inside = True
            continue
        if stripped.startswith(LINE_COMMENT):
            continue
        return index          # the first line of real content ends it
    return len(lines)


def header_lines(text, json_file=False):
    """The disclosure header's own lines, stopping where its comment block ends.

    Needed because the usage-log files repeat `Tool:` inside every entry: counting those as
    disclosure lines would pass a file whose header had not been touched at all.
    """
    lines = text.splitlines()
    # Only the top of the file: a body mention of the template is not a header (review). JSON keeps
    # its disclosure in a field rather than a comment, and in every one here that field is written
    # first, so the same bound holds.
    if json_file and json_disclosure(text):
        return [line for line in lines if MARKER in line][:1]
    limit = leading_region(lines)
    try:
        start = next(i for i, line in enumerate(lines[:limit]) if MARKER in line)
    except StopIteration:
        return []
    # How the header is written decides how it ends. A marker line that itself begins with a line
    # comment is a line-comment header; anything else sits inside a block (<!-- -->, """ """, /* */)
    # or, for JSON, inside a single "_disclosure" string.
    # JSON has no comments, so a disclosure there lives inside one string value - `_disclosure` in
    # the route files, `description` in the Postman collection - and that value's line is the whole
    # header. Keying on `_disclosure` alone left every later line of a Postman collection counting
    # as header, which passed any edit to it (review).
    line_style = lines[start].lstrip().startswith(LINE_COMMENT)
    # Nothing special for .json here any more: a JSON file with a disclosure field returned above,
    # and one with `//` comments - five tsconfig.json files - is a line-comment header like any
    # other. Keying on the suffix instead had cut those down to the marker line, so a tsconfig that
    # correctly gained `// Tool` / `// Scope` lines was reported as missing one (earlier review).
    out = []
    for line in lines[start:]:
        stripped = line.strip()
        if out and any(stripped.startswith(end) or stripped.endswith(end) for end in BLOCK_ENDERS):
            break
        if out and line_style and not stripped.startswith(LINE_COMMENT):
            break
        out.append(line)
    return out


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    # The merge base, and a two-dot diff from it, so the working tree counts: this is meant to be
    # run before committing, and `base...HEAD` would have reported a file already fixed on disk.
    merge_base = git("merge-base", base, "HEAD").strip() or base
    # --find-renames, because a moved file does not exist at the merge base and would otherwise
    # look newly written and be skipped - a rename with no disclosure entry passed clean (review).
    # Maps each current path to the path its old content is under.
    base_of = {}
    for row in git("diff", "--name-status", "--find-renames", merge_base).split("\n"):
        parts = row.split("	")
        if len(parts) == 2:
            base_of[parts[1]] = parts[1]
        elif len(parts) == 3 and parts[0].startswith("R"):
            base_of[parts[2]] = parts[1]
    files = list(base_of)
    missing = []
    removed = []
    for path in sorted(set(files)):
        # A file this branch adds is disclosed by its whole content, which its author just wrote.
        if subprocess.run(["git", "cat-file", "-e", f"{merge_base}:{base_of[path]}"],
                          capture_output=True).returncode != 0:
            continue
        try:
            with open(path, encoding="utf-8-sig") as handle:
                text = handle.read()
        except (OSError, UnicodeDecodeError):
            continue
        head = header_lines(text, json_file=path.endswith(".json"))
        if not head:
            # No header now. If the base had one, this change removed it, which is the most
            # complete version of the thing this check exists to catch - and it used to be
            # skipped in silence, so a branch whose only change deleted a header read as clean
            # (review).
            base_text = git("show", f"{merge_base}:{base_of[path]}")
            if MARKER in base_text:
                removed.append(path)
            continue
        # Both paths when the file moved, and --find-renames, so a rename renders as a
        # similarity entry rather than as a brand-new file: scoped to the destination alone, every
        # line including the header reads as added and a rename with no entry passed clean (review).
        paths = [base_of[path]] + ([path] if path != base_of[path] else [])
        added = {line[1:] for line in git("diff", "--find-renames", merge_base, "--", *paths).splitlines()
                 if line.startswith("+") and not line.startswith("+++")}
        if not any(line in added for line in head):
            missing.append(path)
    for path in removed:
        print(f"disclosure header REMOVED: {path}")
    for path in missing:
        print(f"no disclosure entry added: {path}")
    if removed or missing:
        print(f"{len(removed) + len(missing)} file(s) above: add an entry, or satisfy yourself "
              "none is needed.")
    else:
        print("every changed file with a disclosure header gained an entry.")


if __name__ == "__main__":
    main()
