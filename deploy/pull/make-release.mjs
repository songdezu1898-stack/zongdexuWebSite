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
// This package goes to a PUBLIC repository. Only these top-level items may ever be in it. Anything else (reports,
// distribution, keyword bank, drafts, intake logs, recovery, internal data) makes the build fail rather than ship.
const PUBLIC_OK = /^(index\.html|about\.html|contact\.html|knowledge\.html|sitemap\.html|404\.html|live-qa\.js|styles\.css|ar-redesign\.css|geo-services\.css|knowledge-notes\.css|robots\.txt|llms\.txt|sitemap\.xml|feed\.xml|199864da2cfe47ad866ac58c5257bf4a\.txt|nanxiang-fangchan-zhongjie-yuankunfangwu|services|communities|guides|questions|answers|assets|homes\/index\.html|data\/live-qa\.json|data\/live-qa\.schema\.json)(\/|$)/;
for (const f of files) if (!PUBLIC_OK.test(f)) throw new Error(`not on the public allow-list: ${f}`);

const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
// Build into a temp file. The three published files (package, manifest, signature) must always belong together, so the
// existing ones are replaced only when the content really changed, and always as a set.
const archive = path.join(out, "site.tar.gz.building");
execFileSync(fs.existsSync(tar) ? tar : "tar", ["-czf", archive, "-C", root, ...files], { stdio: "pipe" });

const sha = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
// Content fingerprint independent of tar timestamps: bump the version only when real file bytes change.
const walkFiles = (p) => (fs.statSync(path.join(root, p)).isDirectory() ? fs.readdirSync(path.join(root, p)).flatMap((n) => walkFiles(path.posix.join(p, n))) : [p]);
const fp = crypto.createHash("sha256"); for (const f of files.flatMap(walkFiles).sort()) fp.update(f).update(fs.readFileSync(path.join(root, f)));
const content = fp.digest("hex");
const prev = fs.existsSync(path.join(out, "release.json")) ? JSON.parse(fs.readFileSync(path.join(out, "release.json"), "utf8")) : { version: 0 };
if (prev.content === content) { fs.rmSync(archive, { force: true }); console.log(`RELEASE_UNCHANGED version=${prev.version}`); process.exit(0); }
const manifest = { version: prev.version + 1, content, previous: prev.version, sha256: sha, bytes: fs.statSync(archive).size, createdAt: new Date().toISOString(), files: files.length, product: "yuankun-site" };
const manifestText = JSON.stringify(manifest);
const sig = crypto.sign("sha256", Buffer.from(manifestText), { key: fs.readFileSync(keyFile), padding: crypto.constants.RSA_PKCS1_PADDING });
fs.renameSync(archive, path.join(out, "site.tar.gz"));
fs.writeFileSync(path.join(out, "release.json"), manifestText);
fs.writeFileSync(path.join(out, "release.json.sig"), sig);
// Self-check before anything is published: package hash must equal the signed manifest, and the signature must verify.
const chk = JSON.parse(fs.readFileSync(path.join(out, "release.json"), "utf8"));
const okHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(out, "site.tar.gz"))).digest("hex") === chk.sha256;
const okSig = crypto.verify("sha256", fs.readFileSync(path.join(out, "release.json")), { key: crypto.createPublicKey(fs.readFileSync(pubFile)), padding: crypto.constants.RSA_PKCS1_PADDING }, fs.readFileSync(path.join(out, "release.json.sig")));
if (!okHash || !okSig) throw new Error(`release self-check failed (hash ${okHash}, signature ${okSig})`);
console.log(`RELEASE_OK version=${manifest.version} files=${files.length} bytes=${manifest.bytes} sha256=${sha.slice(0, 12)}…`);
