#!/bin/bash
# Server-side pull deploy. Runs as the unprivileged `deploy` user from cron; needs no inbound ports.
# Fetches a signed release, verifies it, backs up the current site, swaps files, checks the site and rolls back on failure.
#   server-pull.sh                  normal run
#   BASE=<url> SITE=<dir> ...       overridable for local testing
set -u
BASE="${BASE:-https://github.com/songdezu1898-stack/zongdexuWebSite/raw/site-release}"
SITE="${SITE:-/var/www/yuankun}"
HOME_DIR="${HOME_DIR:-$HOME/site-pull}"
PUB="${PUB:-$HOME_DIR/release-public.pem}"
CHECK_URL="${CHECK_URL:-https://yuankunfangwu.com/}"
KEEP=5
LOG="$HOME_DIR/pull.log"
STATE="$HOME_DIR/current-version"
mkdir -p "$HOME_DIR/backups" "$HOME_DIR/tmp"
log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }
exec 9>"$HOME_DIR/pull.lock"; flock -n 9 || { log "skip: another pull is running"; exit 0; }

T="$(mktemp -d "$HOME_DIR/tmp/run.XXXXXX")"; trap 'rm -rf "$T"' EXIT
curl -fsSL --max-time 60 -o "$T/release.json"     "$BASE/release.json"     || { log "fetch manifest failed"; exit 0; }
curl -fsSL --max-time 60 -o "$T/release.json.sig" "$BASE/release.json.sig" || { log "fetch signature failed"; exit 0; }

# 1. signature (RSA-SHA256 over the exact manifest bytes)
openssl dgst -sha256 -verify "$PUB" -signature "$T/release.json.sig" "$T/release.json" >/dev/null 2>&1 \
  || { log "REJECTED: bad signature (manifest ignored)"; exit 0; }

VER=$(python3 -c "import json,sys;print(json.load(open('$T/release.json'))['version'])") || { log "bad manifest"; exit 0; }
SHA=$(python3 -c "import json;print(json.load(open('$T/release.json'))['sha256'])")
PROD=$(python3 -c "import json;print(json.load(open('$T/release.json')).get('product',''))")
[ "$PROD" = "yuankun-site" ] || { log "REJECTED: wrong product"; exit 0; }
CUR=$(cat "$STATE" 2>/dev/null || echo 0)
# 2. version must strictly increase (blocks replay of an old, validly signed release)
[ "$VER" -gt "$CUR" ] 2>/dev/null || { exit 0; }

curl -fsSL --max-time 300 -o "$T/site.tar.gz" "$BASE/site.tar.gz" || { log "fetch package failed (v$VER)"; exit 0; }
# 3. package hash must match the signed manifest
[ "$(sha256sum "$T/site.tar.gz" | cut -d' ' -f1)" = "$SHA" ] || { log "REJECTED: package hash mismatch (v$VER)"; exit 0; }

# 4. path safety: refuse absolute paths, .. and anything that is not a plain file or directory
if tar -tzvf "$T/site.tar.gz" | awk '{print substr($1,1,1)}' | grep -qv '[-d]'; then log "REJECTED: links/special files in package (v$VER)"; exit 0; fi
if tar -tzf "$T/site.tar.gz" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then log "REJECTED: unsafe path in package (v$VER)"; exit 0; fi
mkdir "$T/new" && tar -xzf "$T/site.tar.gz" -C "$T/new" || { log "extract failed (v$VER)"; exit 0; }
for f in index.html sitemap.xml robots.txt; do [ -s "$T/new/$f" ] || { log "REJECTED: missing $f (v$VER)"; exit 0; }; done
grep -q "yuankunfangwu.com" "$T/new/index.html" || { log "REJECTED: index.html sanity check (v$VER)"; exit 0; }

# 5. backup the files that will be replaced, then swap
BK="$HOME_DIR/backups/v$CUR-$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$BK"
( cd "$T/new" && find . -type f -print0 ) | while IFS= read -r -d '' f; do
  [ -f "$SITE/$f" ] && { mkdir -p "$BK/$(dirname "$f")"; cp -p "$SITE/$f" "$BK/$f"; }
done
( cd "$T/new" && tar -cf - . ) | ( cd "$SITE" && tar -xf - --no-same-owner ) || { log "swap failed (v$VER); restoring"; ( cd "$BK" && tar -cf - . ) | ( cd "$SITE" && tar -xf - ); exit 0; }

# 6. check, roll back on failure
sleep 2
CODE=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$CHECK_URL"); SM=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "${CHECK_URL}sitemap.xml")
if [ "$CODE" = "200" ] && [ "$SM" = "200" ]; then
  echo "$VER" > "$STATE"; log "DEPLOYED v$VER (was v$CUR) home=$CODE sitemap=$SM backup=$(basename "$BK")"
  python3 - <<PY
import json,time
json.dump({"version":$VER,"deployedAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"sha256":"$SHA"},open("$SITE/deploy-status.json","w"))
PY
else
  ( cd "$BK" && tar -cf - . ) | ( cd "$SITE" && tar -xf - ); log "ROLLED BACK v$VER: home=$CODE sitemap=$SM"
fi
ls -1dt "$HOME_DIR"/backups/*/ 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -rf
exit 0
