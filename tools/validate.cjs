const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname,'..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const errors=[];
const check=(ok,msg)=>{if(!ok)errors.push(msg)};
check(manifest.manifest_version===3,'manifest_version must be 3');
check(manifest.side_panel?.default_path==='sidepanel.html','side_panel must point to sidepanel.html');
check((manifest.permissions||[]).includes('scripting'),'scripting permission is required for cross-frame deep scan');
const genericScript=(manifest.content_scripts||[]).find(cs=>(cs.matches||[]).includes('<all_urls>'));
check(genericScript?.all_frames===true,'generic content script must run in all frames for deep media coverage');
check(fs.existsSync(path.join(root,'zipper.html'))&&fs.existsSync(path.join(root,'zipper.js'))&&fs.existsSync(path.join(root,'src/zip-core.js')),'ZIP worker files must exist');
check(manifest.sidebar_action?.default_panel==='sidepanel.html','Opera sidebar_action must point to sidepanel.html');
const allowedPerms=new Set(['downloads','storage','tabs','sidePanel','scripting']);
for(const p of manifest.permissions||[])check(allowedPerms.has(p),`unexpected permission: ${p}`);
const refs=new Set(['sidepanel.html']);
if(manifest.background?.service_worker)refs.add(manifest.background.service_worker);
for(const cs of manifest.content_scripts||[]){for(const f of [...(cs.js||[]),...(cs.css||[])])refs.add(f);}
for(const f of Object.values(manifest.icons||{}))refs.add(f);
for(const f of Object.values(manifest.action?.default_icon||{}))refs.add(f);
for(const f of Object.values(manifest.sidebar_action?.default_icon||{}))refs.add(f);
for(const f of refs)check(fs.existsSync(path.join(root,f)),`manifest reference missing: ${f}`);
for(const html of ['sidepanel.html','converter.html','zipper.html']){
  const s=fs.readFileSync(path.join(root,html),'utf8');
  check(!/<script[^>]+src=["']https?:/i.test(s),`${html}: remote script is forbidden`);
}
const files=[];function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);const st=fs.statSync(p);if(st.isDirectory()){if(name!=='node_modules')walk(p);}else files.push(p);}}walk(root);
for(const p of files.filter(p=>p.endsWith('.js')||p.endsWith('.mjs')||p.endsWith('.cjs'))){
  const s=fs.readFileSync(p,'utf8');
  if(!p.endsWith('validate.cjs')){check(!/\beval\s*\(/.test(s),`${path.relative(root,p)}: eval forbidden`);check(!/new\s+Function\s*\(/.test(s),`${path.relative(root,p)}: new Function forbidden`);}
}
const modules=new Set(['converter.js','src/quantize.mjs','vendor/gifenc/gifenc.mjs']);
for(const p of files.filter(p=>p.endsWith('.js')||p.endsWith('.mjs')||p.endsWith('.cjs'))){
  const rel=path.relative(root,p).replaceAll('\\','/');
  const r=modules.has(rel)
    ? cp.spawnSync(process.execPath,['--input-type=module','--check'],{input:fs.readFileSync(p),encoding:'utf8'})
    : cp.spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  check(r.status===0,`${rel}: syntax check failed\n${r.stderr||r.stdout}`);
}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log(`Validation OK: ${files.length} files, ${refs.size} manifest references, permissions locked.`);
