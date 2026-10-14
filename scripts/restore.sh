#!/bin/sh
# Replaces the database with a dump from scripts/backup.sh (or any `pg_dump --format=custom`).
# Run from the repo folder on the machine running the app:
#   scripts/restore.sh backups/daily/franks-2026-10-14_0400.dump
# The app is stopped while the dump is restored, so nothing is written halfway through.
set -eu

file=${1:?Usage: scripts/restore.sh <dump file>}
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }

printf 'This replaces EVERYTHING in the database with %s. Type yes to continue: ' "$file"
read -r answer
[ "$answer" = yes ] || { echo 'Nothing changed.'; exit 1; }

docker compose stop app
# --clean drops each object before recreating it, so the result is exactly the dump.
docker compose exec -T db sh -c \
  'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <"$file"
docker compose start app
echo 'Restored. The app is running again.'
