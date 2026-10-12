"""AI Assistance Disclosure:
Tool: Codex (model: GPT-6), date: 2026-10-12
Scope: Export reviewed native source changes as a reproducible patch.
Author review: Pending human review.
"""
# AI-generated; review pending. Maintainer utility; not part of the runtime.
import difflib
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
if subprocess.check_output(["git", "-c", "safe.directory=" + root.as_posix(),
                            "rev-parse", "HEAD"], cwd=root).decode().strip() != "58e082ee0eb9f9b06fb46586c4df03dbf269f3f8":
    sys.exit("Unexpected source revision")
names = ["source/extensions/filters/http/jwt_authn/authenticator.cc",
         "source/extensions/filters/http/jwt_authn/filter_config.h",
         "source/extensions/filters/http/jwt_authn/filter.cc",
         "source/common/jwt/jwks.h", "source/common/jwt/jwks.cc",
         "source/common/jwt/verify.h", "source/common/jwt/verify.cc",
         "source/extensions/filters/http/common/jwks_fetcher.h",
         "source/extensions/filters/http/common/jwks_fetcher.cc",
         "source/extensions/request_id/uuid/config.cc",
         "test/extensions/filters/http/jwt_authn/authenticator_test.cc"]
patch = ["# AI Assistance Disclosure:\n# Tool: Codex (model: GPT-6), date: 2026-10-12\n"
         "# Scope: Native FoC JWT and request-ID compatibility extension.\n"
         "# Author review: Pending human review.\n"]
for name in names:
    original = subprocess.check_output(["git", "-c", "safe.directory=" + root.as_posix(),
                                         "show", "HEAD:" + name], cwd=root).decode()
    changed = (root / name).read_text()
    patch.extend(difflib.unified_diff(original.splitlines(True), changed.splitlines(True),
                                     fromfile="a/" + name, tofile="b/" + name))
Path(__file__).with_name("foc-jwt.patch").write_text("".join(patch), newline="\n")
