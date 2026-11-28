// Pushes the signed release to the public repo's `site-release` branch so the server can pull it. DISABLED until
// data/distribution-control.json -> pullDeploy is true. Uses the git credentials already stored on this PC; no token is
// read or printed. The release contains only public website files (no homes images, no keys).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ctl = JSON.parse(fs.readFileSync(path.join(root, "data/distribution-control.json"), "utf8"));
if (ctl.pullDeploy !== true) { console.log("PULL_RELEASE_SKIPPED pullDeploy is off"); process.exit(0); }
execFileSync(process.execPath, [path.join(root, "deploy/pull/make-release.mjs")], { stdio: "inherit" });
const out = path.join(root, "deploy/pull/out");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "yk-release-"));
const url = execSync("git remote get-url origin", { cwd: root }).toString().trim();
const g = (args, cwd = work) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();
g(["init", "-q", "-b", "site-release"]); g(["remote", "add", "origin", url]);
for (const f of ["site.tar.gz", "release.json", "release.json.sig"]) fs.copyFileSync(path.join(out, f), path.join(work, f));
g(["add", "-A"]); g(["-c", "user.name=yuankun-release", "-c", "user.email=release@yuankunfangwu.com", "commit", "-q", "-m", `release ${JSON.parse(fs.readFileSync(path.join(out, "release.json"), "utf8")).version}`]);
g(["push", "-f", "-q", "origin", "site-release"]);
console.log("PULL_RELEASE_PUSHED branch=site-release");
fs.rmSync(work, { recursive: true, force: true });
