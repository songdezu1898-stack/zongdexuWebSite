// /homes/ is hidden (noindex placeholder, no images, no sitemap entry) until image and data usage rights are confirmed
// (decision 2026-11-28). This script now REMOVES the old entry points instead of adding them. The original script is
// kept in C:/Users/ykfw/backups/20261128-1/ and the original homes data stays in the local homes/ folder.
import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';
const root=process.argv[2]||path.dirname(fileURLToPath(import.meta.url));
const skip=new Set(['homes','assets','data','deploy','final-site-ready','zongdexuWebSite','node_modules','recovery','reports','distribution','wechat-drafts']);
let changed=0;
function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){if(d.name.startsWith('.')||skip.has(d.name))continue;const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else if(d.name.endsWith('.html')){let s=fs.readFileSync(p,'utf8');const o=s;
  s=s.replace(/<a href="\/homes\/">在售房源<\/a>/g,'');
  s=s.replace(/<section id="available-homes"[\s\S]*?<\/section>/,'').replace(/<section class="homes-entry-\d+"[\s\S]*?<\/section>/,'');
  s=s.replace(/<link rel="stylesheet" href="\/homes\/entry\.css[^"]*">/,'');
  if(s!==o){fs.writeFileSync(p,s);changed++}}}}
walk(root);
const sm=path.join(root,'sitemap.xml');if(fs.existsSync(sm)){let s=fs.readFileSync(sm,'utf8');const o=s;s=s.replace(/\s*<url>\s*<loc>https:\/\/yuankunfangwu\.com\/homes\/<\/loc>[\s\S]*?<\/url>/,'').replace(/<url><loc>https:\/\/yuankunfangwu\.com\/homes\/<\/loc>[\s\S]*?<\/url>/,'');if(s!==o){fs.writeFileSync(sm,s);changed++}}
console.log(`房源入口已隐藏，更新文件数 ${changed}`);
