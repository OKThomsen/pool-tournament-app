#!/bin/sh
# Runs in the backup container (docker-compose.prod.yml). Dumps the database once at start and
# then every night at BACKUP_HOUR into /backups:
#   daily/   one dump per night, kept BACKUP_KEEP_DAYS days
#   monthly/ the last dump of each month, kept BACKUP_KEEP_MONTHS months
# Dumps are pg_dump's custom format; restore one with scripts/restore.sh.
set -u

mkdir -p /backups/daily /backups/monthly

backup() {
  stamp=$(date +%Y-%m-%d_%H%M)
  file="franks-$stamp.dump"
  partial="/backups/.$file.partial"
  if ! pg_dump --format=custom --file="$partial"; then
    rm -f "$partial"
    echo "$(date) backup FAILED" >&2
    return 1
  fi
  mv "$partial" "/backups/daily/$file"
  # The latest dump of the month replaces the month's earlier one.
  rm -f /backups/monthly/franks-"$(date +%Y-%m)"-*.dump
  cp "/backups/daily/$file" "/backups/monthly/$file"
  find /backups/daily -name '*.dump' -mtime +"$BACKUP_KEEP_DAYS" -delete
  find /backups/monthly -name '*.dump' -mtime +"$((BACKUP_KEEP_MONTHS * 31))" -delete
  echo "$(date) backup written: daily/$file ($(du -h "/backups/daily/$file" | cut -f1))"
}

backup
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%Y-%m-%d) $BACKUP_HOUR:00" +%s)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  backup
done
