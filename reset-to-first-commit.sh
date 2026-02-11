#!/usr/bin/env bash
# Reset repo to a single initial commit and force-push to GitHub.
# Run from project root:  bash reset-to-first-commit.sh

set -e
cd "$(dirname "$0")"

ORIGIN_URL="https://github.com/jaawaad/easy-release.git"

echo "Removing existing .git..."
rm -rf .git

echo "Initializing fresh repo..."
git init

echo "Adding all files..."
git add .

echo "Creating initial commit..."
git commit -m "Initial commit: reliz — release automation CLI"

echo "Adding remote and pushing (--force)..."
git remote add origin "$ORIGIN_URL"
git branch -M main
git push -u origin main --force

echo "Done. GitHub now has only this one commit."
