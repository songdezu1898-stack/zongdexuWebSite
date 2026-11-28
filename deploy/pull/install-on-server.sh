#!/bin/bash
# One-time install of the pull deploy on the server, as the unprivileged `deploy` user (no root needed).
# Run from this PC with:  ssh -i <key> deploy@<server> 'bash -s' < deploy/pull/install-on-server.sh
# Installs: ~/site-pull/server-pull.sh (from stdin copy), the PUBLIC key, and one cron line (every 5 minutes).
set -eu
mkdir -p "$HOME/site-pull"
echo "Upload server-pull.sh and release-public.pem to ~/site-pull first (scp), then run this file."
[ -s "$HOME/site-pull/server-pull.sh" ] && [ -s "$HOME/site-pull/release-public.pem" ] || { echo "files missing"; exit 1; }
chmod 700 "$HOME/site-pull/server-pull.sh"
export BASE="https://github.com/songdezu1898-stack/zongdexuWebSite/raw/site-release"
LINE="*/5 * * * * BASE=$BASE $HOME/site-pull/server-pull.sh >/dev/null 2>&1"
( crontab -l 2>/dev/null | grep -v "site-pull/server-pull.sh"; echo "$LINE" ) | crontab -
echo "installed; crontab now:"; crontab -l | grep site-pull
