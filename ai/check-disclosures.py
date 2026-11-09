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
"""
# Lists files your branch changes that carry an AI disclosure header but gained no entry in it.
#
#   python ai/check-disclosures.py              # against origin/main
#   python ai/check-disclosures.py main         # against another base
#
# It is a prompt, not a gate: it cannot tell whether an entry *describes* the change, only whether
# the header grew, and a change a human wrote unaided needs no entry. Read the list and judge. It
# always exits 0, so it blocks nothing.
# AI-generated (reviewed by Cole Lin).
import subprocess
import sys

MARKER = "AI Assistance Disclosure"
# What ends a header, by the comment styles this repository uses.
ENDERS = ('-->', '"""', "*/")


def git(*args):
    return subprocess.run(["git", *args], capture_output=True).stdout.decode("utf-8", "replace")


def header_lines(text):
    """The disclosure header's own lines, stopping where the comment block ends.

    Needed because the usage-log files repeat `Tool:` inside every entry: counting those as
    disclosure lines would pass a file whose header had not been touched at all.
    """
    lines = text.split("\n")
    try:
        start = next(i for i, line in enumerate(lines) if MARKER in line)
    except StopIteration:
        return []
    out = []
    for line in lines[start:]:
        stripped = line.strip()
        if out and any(stripped.startswith(end) or stripped.endswith(end) for end in ENDERS):
            break
        # A `#`-comment header ends at the first line that is not a comment.
        if out and not stripped.startswith(("#", "*", "//")) and not lines[start].startswith(("#", "//")):
            pass
        elif out and lines[start].startswith("#") and not stripped.startswith("#"):
            break
        out.append(line)
        if '"_disclosure"' in line:  # JSON keeps the whole header on one line
            break
    return out


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "origin/main"
    # The merge base, and a two-dot diff from it, so the working tree counts: this is meant to be
    # run before committing, and `base...HEAD` would have reported a file already fixed on disk.
    merge_base = git("merge-base", base, "HEAD").strip() or base
    files = [f for f in git("diff", "--name-only", merge_base).split("\n") if f]
    missing = []
    for path in sorted(set(files)):
        # A file this branch adds is disclosed by its whole content, which its author just wrote.
        if subprocess.run(["git", "cat-file", "-e", f"{merge_base}:{path}"],
                          capture_output=True).returncode != 0:
            continue
        try:
            with open(path, encoding="utf-8-sig") as handle:
                text = handle.read()
        except (OSError, UnicodeDecodeError):
            continue
        head = header_lines(text)
        if not head:
            continue
        added = {line[1:] for line in git("diff", merge_base, "--", path).split("\n")
                 if line.startswith("+") and not line.startswith("+++")}
        if not any(line in added for line in head):
            missing.append(path)
    for path in missing:
        print(f"no disclosure entry added: {path}")
    if missing:
        print(f"{len(missing)} file(s) above: add an entry, or satisfy yourself none is needed.")
    else:
        print("every changed file with a disclosure header gained an entry.")


if __name__ == "__main__":
    main()
