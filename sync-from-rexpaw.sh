#!/bin/sh
# Holt alle neuen Commits von rexpaw-admin und mergt sie in xpaw-admin.
# shopify.app.toml und .env bleiben dabei automatisch unangetastet (siehe .gitattributes).
set -e
git fetch upstream
git merge upstream/main --allow-unrelated-histories -m "Sync from rexpaw-admin"
echo "Fertig. Falls alles ok aussieht: git push"
