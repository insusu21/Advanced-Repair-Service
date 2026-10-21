#!/bin/bash
# run.sh로 띄운 것 전부 끄기. DB 데이터는 남는다 (지우려면 cd backend && docker compose down -v)
cd "$(dirname "$0")"
for f in logs/worker.pid logs/auto_photo.pid; do
  [ -f $f ] && { pkill -P "$(cat $f)" 2>/dev/null; kill "$(cat $f)" 2>/dev/null; rm -f $f; }
done
for p in 8080 5173 9104 8011 8012 8013 8014 8015 8089; do
  pids=$(lsof -tiTCP:$p -sTCP:LISTEN 2>/dev/null)
  [ -n "$pids" ] && kill $pids 2>/dev/null
done
(cd backend && docker compose stop >/dev/null 2>&1)
echo "껐다"
