#!/usr/bin/env bash
#
# Consistent online backup of the archive, for a nightly host job to call just
# before it snapshots the data directory.
#
#   ./backup.sh                 # writes <data>/backups/archive-latest.db
#   ./backup.sh nightly.db      # any other name under <data>/backups/
#
# On pc2 <data> is /srv/data/halls, so the file to keep is
# /srv/data/halls/backups/archive-latest.db. It is replaced atomically and only
# after passing an integrity check (scripts/backup.mjs), so a snapshot taken at
# any moment holds a complete, consistent copy — unlike archive.db itself,
# whose committed data can still be sitting in archive.db-wal. Restore from
# this file, not from a snapshot of archive.db.
#
# Works whether or not the site is running: a running container is asked to
# take the backup, and a stopped one gets a throwaway container on the same
# image and mount. Waits (up to 15 minutes) for a deploy in progress, so the
# backup never lands while update.sh is swapping containers. Exits non-zero on
# any failure, so the calling job can alert rather than snapshot a stale copy.

set -Eeuo pipefail

cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"

SERVICE=halls
NAME=${1:-archive-latest.db}
[[ $NAME =~ ^[A-Za-z0-9._-]+\.db$ ]] || { echo "Backup name must be a plain file name ending in .db" >&2; exit 2; }
TARGET=/data/backups/$NAME

LOCK=.update.lock
[[ -e $LOCK ]] || : >"$LOCK"
exec 9<"$LOCK"
flock -w 900 9 || { echo "An update has held the lock for 15 minutes; not backing up." >&2; exit 1; }

if [[ -n $(docker compose ps -q --status running "$SERVICE" 2>/dev/null) ]]; then
  docker compose exec -T "$SERVICE" node scripts/backup.mjs "$TARGET"
else
  docker compose run --rm --no-deps -T "$SERVICE" node scripts/backup.mjs "$TARGET"
fi
