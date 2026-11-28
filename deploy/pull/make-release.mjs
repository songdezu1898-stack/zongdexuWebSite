// Builds a signed release for the server-pull deployment. Runs on this computer only.
//   node deploy/pull/make-release.mjs            writes deploy/pull/out/{site.tar.gz,release.json,release.json.sig}
// The release contains exactly the files deploy/publish.ps1 would upload (same whitelist, so /homes/ images are never in it).
// Signing key: ~/.yuankun-seo/release-signing.pem (RSA-3072, created by this script on first run, never leaves this PC).
// Only the PUBLIC key (deploy/pull/release-public.pem) is committed and installed on the server.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = path.join(root, "deploy", "pull", "out");
const secrets = path.join(os.homedir(), ".yuankun-seo");
const keyFile = path.join(secrets, "release-signing.pem");
const pubFile = path.join(root, "deploy", "pull", "release-public.pem");
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(secrets, { recursive: true });

if (!fs.existsSync(keyFile)) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 3072 });
  fs.writeFileSync(keyFile, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(pubFile, publicKey.export({ type: "spki", format: "pem" }));
  console.log("RELEASE_KEY created (public key written to deploy/pull/release-public.pem)");
}

// Same whitelist as the push deploy: read it from publish.ps1 so the two can never drift apart.
const ps = fs.readFileSync(path.join(root, "deploy", "publish.ps1"), "utf8");
const list = (ps.match(/\$publicFiles\s*=\s*@\(([\s\S]*?)\n\)/) || [])[1] || "";
const files = [...list.matchAll(/^\s*'([^']+)'/gm)].map((m) => m[1]);
if (!files.length) throw new Error("cannot read $publicFiles from publish.ps1");
for (const f of files) if (!fs.existsSync(path.join(root, f))) throw new Error(`missing release file: ${f}`);
// Hard stops: nothing sensitive or unauthorised may ship.
const banned = /homes\/(images|listings\.json|styles\.css)|\.pem$|\.env|service-account|token|\.git\//i;
for (const f of files) if (banned.test(f)) throw new Error(`refusing to package: ${f}`);

const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
const archive = path.join(out, "site.tar.gz");
execFileSync(fs.existsSync(tar) ? tar : "tar", ["-czf", archive, "-C", root, ...files], { stdio: "pipe" });

const sha = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
const prev = fs.existsSync(path.join(out, "release.json")) ? JSON.parse(fs.readFileSync(path.join(out, "release.json"), "utf8")) : { version: 0 };
if (prev.sha256 === sha) { console.log(`RELEASE_UNCHANGED version=${prev.version}`); process.exit(0); }
const manifest = { version: prev.version + 1, previous: prev.version, sha256: sha, bytes: fs.statSync(archive).size, createdAt: new Date().toISOString(), files: files.length, product: "yuankun-site" };
const manifestText = JSON.stringify(manifest);
fs.writeFileSync(path.join(out, "release.json"), manifestText);
const sig = crypto.sign("sha256", Buffer.from(manifestText), { key: fs.readFileSync(keyFile), padding: crypto.constants.RSA_PKCS1_PADDING });
fs.writeFileSync(path.join(out, "release.json.sig"), sig);
console.log(`RELEASE_OK version=${manifest.version} files=${files.length} bytes=${manifest.bytes} sha256=${sha.slice(0, 12)}…`);
