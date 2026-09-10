#!/usr/bin/env bash
# Publish saakshya/ui to the standalone deploy repo (github.com/shreyashsri79/saakshya).
# Keeps one working copy: commit as normal in this repo, then run this script.
# Vercel builds whatever lands on that repo's master.
set -euo pipefail
cd "$(dirname "$0")"

PREFIX=saakshya/ui
REMOTE=deploy
MSG=${1:-$(git log -1 --pretty=%s)}

TREE=$(git rev-parse "HEAD:$PREFIX")
if PARENT=$(git rev-parse -q --verify refs/heads/ui-deploy); then
  COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "$MSG")
else
  COMMIT=$(git commit-tree "$TREE" -m "$MSG")
fi
git update-ref refs/heads/ui-deploy "$COMMIT"
git push "$REMOTE" ui-deploy:master
echo "pushed $COMMIT -> $REMOTE/master"
