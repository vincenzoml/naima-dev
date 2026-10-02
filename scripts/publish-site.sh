#!/bin/sh
# Publish the project site (https://vincenzoml.github.io/naima/) by hand, with
# the owner's own git credentials: no CI, no deploy key, no secret.
#
# It builds site/ with scripts/site.ts (the product's star count written in
# when the GitHub API answers) and pushes it as one new commit on top of the
# product's branch gh-pages, which the product's Pages serves (legacy build,
# source gh-pages, path /). The push is a plain fast-forward: gh-pages keeps
# its history and is never force-pushed. The installer clones the product with
# --single-branch, so gh-pages never reaches a project.
#
#   sh scripts/publish-site.sh            # build and push
#   sh scripts/publish-site.sh --dry-run  # build and commit, do not push
#
# Run from the workshop's root, on main, after the gate.
set -eu

PRODUCT="${NAIMA_PRODUCT_URL:-https://github.com/vincenzoml/naima.git}"
dry=""
[ "${1:-}" = "--dry-run" ] && dry=1

root=$(git rev-parse --show-toplevel)
sha=$(git -C "$root" rev-parse --short HEAD)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/naima-site.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

stars=$(curl -fsS "https://api.github.com/repos/vincenzoml/naima" 2>/dev/null | grep -m1 '"stargazers_count"' | tr -dc 0-9 || true)
(cd "$root" && deno run -A scripts/site.ts "$tmp/site" ${stars:+--stars "$stars"})
touch "$tmp/site/.nojekyll"

git init -q "$tmp/repo"
g() { git -C "$tmp/repo" --work-tree="$tmp/site" "$@"; }
g add -A
tree=$(g write-tree)
parent=""
if git -C "$tmp/repo" fetch -q "$PRODUCT" gh-pages 2>/dev/null; then parent=$(git -C "$tmp/repo" rev-parse FETCH_HEAD); fi
if [ -n "$parent" ] && [ "$(git -C "$tmp/repo" rev-parse "$parent^{tree}")" = "$tree" ]; then
  echo "gh-pages already serves this build ($parent)"; exit 0
fi
commit=$(git -C "$tmp/repo" -c user.name="naima-dev pages" -c user.email="pages@users.noreply.github.com" \
  commit-tree "$tree" ${parent:+-p "$parent"} -m "Site from naima-dev $sha")
echo "gh-pages commit $commit (parent ${parent:-none}), from naima-dev $sha"
[ -n "$dry" ] && exit 0
git -C "$tmp/repo" push -q "$PRODUCT" "$commit:refs/heads/gh-pages"
echo "pushed to $PRODUCT gh-pages"
