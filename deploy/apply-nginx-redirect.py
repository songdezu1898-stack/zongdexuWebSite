#!/usr/bin/env python3
"""Canonical-host redirects for yuankunfangwu.com (run as root on the server).

1. https://www.yuankunfangwu.com/...      -> 301 https://yuankunfangwu.com/...
2. https://yuankunfangwu.com/index.html   -> 301 https://yuankunfangwu.com/
   https://yuankunfangwu.com/x/index.html -> 301 https://yuankunfangwu.com/x/

It edits nginx.conf in place after making a backup, runs `nginx -t`, and puts
the backup back if the test fails. It never reloads nginx: do that yourself.

Usage:  python3 apply-nginx-redirect.py [path-to-nginx.conf]
Set NGINX_TEST=0 to skip `nginx -t` (only for testing outside the server).
"""
import os
import shutil
import subprocess
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "/etc/nginx/nginx.conf"
backup = path + ".before-redirect-20261113"
MARK = "# canonical-host redirects (added 2026-11-13)"

text = open(path, encoding="utf-8").read()
if MARK in text:
    print("Already applied, nothing to do.")
    sys.exit(0)

head = (
    "    server {\n"
    "        listen 443 ssl http2;\n"
    "        listen [::]:443 ssl http2;\n"
    "        server_name yuankunfangwu.com www.yuankunfangwu.com;\n"
)
if text.count(head) != 1:
    sys.exit("Unexpected nginx.conf layout (HTTPS server block not found exactly once). Nothing changed.")

www_block = (
    f"    {MARK}\n"
    "    server {\n"
    "        listen 443 ssl http2;\n"
    "        listen [::]:443 ssl http2;\n"
    "        server_name www.yuankunfangwu.com;\n"
    "\n"
    "        ssl_certificate /etc/pki/nginx/yuankun/fullchain.pem;\n"
    "        ssl_certificate_key /etc/pki/nginx/yuankun/privkey.pem;\n"
    "        ssl_protocols TLSv1.2 TLSv1.3;\n"
    "\n"
    "        return 301 https://yuankunfangwu.com$request_uri;\n"
    "    }\n"
    "\n"
)
apex_head = head.replace("yuankunfangwu.com www.yuankunfangwu.com", "yuankunfangwu.com")

include_line = "        include /etc/nginx/default.d/*.conf;\n"
if text.count(include_line) != 1:
    sys.exit("Unexpected nginx.conf layout (default.d include not found exactly once). Nothing changed.")

# $request_uri is the ORIGINAL request, so nginx's own internal redirect from
# "/" to "/index.html" (the `index` directive) does not match and cannot loop.
index_rule = (
    "        # index.html duplicates of a directory URL go to the directory URL\n"
    '        if ($request_uri ~ "^([^?]*/)index\\.html(?:\\?|$)") {\n'
    "            return 301 https://yuankunfangwu.com$1;\n"
    "        }\n"
    "\n"
)

new = text.replace(head, www_block + apex_head)
new = new.replace(include_line, index_rule + include_line)

if not os.path.exists(backup):
    shutil.copy2(path, backup)
    print(f"Backup: {backup}")
open(path, "w", encoding="utf-8").write(new)

if os.environ.get("NGINX_TEST", "1") != "0":
    # Python 3.6 on the server: no capture_output/text keywords.
    result = subprocess.run(["nginx", "-t"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
    print(result.stdout + result.stderr)
    if result.returncode != 0:
        shutil.copy2(backup, path)
        sys.exit("nginx -t failed. The original file has been restored. Nothing changed.")
print("Config written and (if tested) valid. Now run:  systemctl reload nginx")
