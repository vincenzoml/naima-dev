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
# Run from the workshop's root, on main, after the gate. It builds the
# committed HEAD, never the working tree: uncommitted edits are not published.
#
# The site is a locked resource: it publishes only for the branch holding the
# `site` resource claim (deno task naima claim --resource site), refusing
# otherwise and naming the holder; the gh-pages commit carries the claim as
# its trailer, `Resource-Claim: site <claim id> <branch>`, and every publish
# commit since the first one carrying it that lacks it is flagged
# (scripts/site-claims.ts audit). NAIMA_CLI names the naima command to ask,
# NAIMA_STARS the star count to write instead of asking GitHub.
set -eu

PRODUCT="${NAIMA_PRODUCT_URL:-https://github.com/vincenzoml/naima.git}"
dry=""
[ "${1:-}" = "--dry-run" ] && dry=1

root=$(git rev-parse --show-toplevel)
claim=$(deno run -A "$root/scripts/site-claims.ts" holder) || exit 1
sha=$(git -C "$root" rev-parse --short HEAD)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/naima-site.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

stars=${NAIMA_STARS-$(curl -fsS --max-time 10 "https://api.github.com/repos/vincenzoml/naima" 2>/dev/null | grep -m1 '"stargazers_count"' | tr -dc 0-9 || true)}
mkdir "$tmp/src" && git -C "$root" archive HEAD site scripts/site.ts | tar -x -C "$tmp/src"
(cd "$tmp/src" && deno run -A scripts/site.ts "$tmp/site" ${stars:+--stars "$stars"})
touch "$tmp/site/.nojekyll"

git init -q "$tmp/repo"
g() { git -C "$tmp/repo" --work-tree="$tmp/site" "$@"; }
g add -A
tree=$(g write-tree)
parent=""
if git -C "$tmp/repo" fetch -q "$PRODUCT" gh-pages 2>/dev/null; then parent=$(git -C "$tmp/repo" rev-parse FETCH_HEAD); fi
[ -n "$parent" ] && { deno run -A "$root/scripts/site-claims.ts" audit "$tmp/repo" "$parent" || echo "(flagged above: published without the site claim)"; }
if [ -n "$parent" ] && [ "$(git -C "$tmp/repo" rev-parse "$parent^{tree}")" = "$tree" ]; then
  echo "gh-pages already serves this build ($parent)"; exit 0
fi
commit=$(git -C "$tmp/repo" -c user.name="naima-dev pages" -c user.email="pages@users.noreply.github.com" \
  commit-tree "$tree" ${parent:+-p "$parent"} -m "Site from naima-dev $sha" -m "$claim")
echo "gh-pages commit $commit (parent ${parent:-none}), from naima-dev $sha, $claim"
[ -n "$dry" ] && exit 0
git -C "$tmp/repo" push -q "$PRODUCT" "$commit:refs/heads/gh-pages"
echo "pushed to $PRODUCT gh-pages"
