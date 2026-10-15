import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import {Access,opaque,protocolNames} from './access.mjs';

export function within(root,target) { const rel=path.relative(root,target); return rel==='' || (!rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel)); }
export function kindOf(p) { const e=path.extname(p).toLowerCase(); return /\.(png|jpe?g|webp|gif|bmp)$/.test(e)?'image':/\.(js|ts|tsx|jsx|py|rs|go|java|css|html|json|yaml|yml|toml|sh|sql)$/.test(e)?'code':/\.(mp3|wav|m4a|ogg|flac)$/.test(e)?'audio':/\.(mp4|mov|mkv|webm)$/.test(e)?'video':'document'; }
const textExt=/\.(txt|md|csv|tsv|log|rtf|js|ts|tsx|jsx|py|rs|go|java|css|html|json|ya?ml|toml|sh|sql|xml|ini)$/i;
export async function extract(file) {
  const stat=await fs.stat(file); if(stat.size>32*1024*1024) return {text:'',extraction:'too-large'};
  if(textExt.test(file)) return {text:(await fs.readFile(file,'utf8')).slice(0,60000),extraction:'text'};
  if(/\.docx$/i.test(file)) { const mammoth=await import('mammoth'); return {text:(await mammoth.extractRawText({path:file})).value.slice(0,60000),extraction:'text'}; }
  if(/\.pdf$/i.test(file)) { const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs'); const doc=await pdf.getDocument({data:new Uint8Array(await fs.readFile(file)),useSystemFonts:true,isEvalSupported:false}).promise; let text=''; try { for(let p=1;p<=Math.min(doc.numPages,40);p++) { const page=await doc.getPage(p); text+=(await page.getTextContent()).items.map(x=>x.str||'').join(' ')+'\n'; if(text.length>60000)break; } } finally {await doc.destroy();} return {text:text.slice(0,60000),extraction:text.trim()?'text':'needs-ocr'}; }
  return {text:'',extraction:kindOf(file)==='image'?'image':'metadata-only'};
}
export async function collect(input,limit=5000) {
  const out=[]; const walk=async(p)=>{const stat=await fs.lstat(p); if(stat.isSymbolicLink()||protocolNames.has(path.basename(p)))return; if(stat.isDirectory()){ for(const d of await fs.readdir(p,{withFileTypes:true})) { if(d.name.startsWith('.')||['node_modules','dist','target','$RECYCLE.BIN','System Volume Information'].includes(d.name))continue; if(out.length>=limit)throw new Error(`Import limit: ${limit} files. Choose a smaller folder.`); await walk(path.join(p,d.name)); } }else if(stat.isFile())out.push(p);};
  for(const p of input) await walk(p); return out;
}
export async function ingest(store,paths) {
  const names=await collect(paths); const added=[];
  for(const p of names) {
    if(store.access)await store.access.check(p);
    const real=await fs.realpath(p); const stat=await fs.stat(real); let old=store.data.files.find(f=>f.path===real);
    if(old && old.mtime===stat.mtimeMs && old.size===stat.size)continue;
    let content; try {content=await extract(real);}catch(e){content={text:'',extraction:'error',extractionError:String(e.message)}}
    const f={id:old?.id||randomUUID(),path:real,name:path.basename(real),kind:kindOf(real),ext:path.extname(real).slice(1).toUpperCase(),size:stat.size,mtime:stat.mtimeMs,addedAt:old?.addedAt||new Date().toISOString(),status:'pending',summary:'',tags:[],topic:'',...content};
    if(old)Object.assign(old,f); else store.data.files.push(f); added.push(f.id);
  }
  if(added.length)store.log('import',{count:added.length}); await store.save(); return added;
}
export async function digest(p) {const hash=createHash('sha256');for await(const chunk of createReadStream(p))hash.update(chunk);return hash.digest('hex');}
async function noLinks(root,relative) {
  let cursor=root; for(const part of relative.split(path.sep).filter(Boolean)) {cursor=path.join(cursor,part); try {const st=await fs.lstat(cursor);if(st.isSymbolicLink()||!st.isDirectory())throw new Error('Destination contains a link or a non-directory.');}catch(e){if(e.code!=='ENOENT')throw e;await fs.mkdir(cursor);} }
  const real=await fs.realpath(cursor);if(!within(root,real))throw new Error('Destination escapes library.');return real;
}
const locks=new WeakMap();
export function exclusive(store,fn){const next=(locks.get(store)||Promise.resolve()).catch(()=>{}).then(fn);locks.set(store,next);return next;}
export function moveFile(store,id,relativeFolder,reason,name){return exclusive(store,()=>moveUnlocked(store,id,relativeFolder,reason,name));}
async function moveUnlocked(store,id,relativeFolder,reason,name) {
  const f=store.data.files.find(x=>x.id===id); if(!f)throw new Error('Unknown file.');
  const access=store.access||new Access(store);await access.check(f.path,{write:true});
  const configured=store.data.settings.workspaceRoot;if(!configured)throw new Error('Choose a workspace first.');
  if(typeof relativeFolder!=='string'||relativeFolder.length>1000||/[\x00-\x1f]/.test(relativeFolder))throw new Error('Invalid destination.');
  const root=await fs.realpath(configured); const folder=path.resolve(root,relativeFolder);
  if(path.isAbsolute(relativeFolder)||!within(root,folder)||relativeFolder.split(/[\\/]/).some(x=>x==='..'||x.includes(':')))throw new Error('Invalid destination.');
  const source=await fs.realpath(f.path); if(source!==f.path)throw new Error('Source path changed. Re-index first.');
  const st=await fs.lstat(source);if(!st.isFile()||st.isSymbolicLink()||st.size!==f.size||st.mtimeMs!==f.mtime)throw new Error('File changed. Re-index before moving.');
  let cursor=root;for(const part of path.relative(root,folder).split(path.sep).filter(Boolean)){if(await opaque(cursor))throw new Error('Opaque projects cannot be reorganized.');cursor=path.join(cursor,part);}
  const parent=await noLinks(root,path.relative(root,folder));await access.check(parent,{write:true,directory:true});
  const newName=name||f.name;if(newName!==path.basename(newName)||/[\\/:\x00-\x1f]/.test(newName)||newName==='.'||newName==='..'||protocolNames.has(newName))throw new Error('Invalid file name.');const dest=path.join(parent,newName);
  if(source===dest)return {unchanged:true};
  const hash=await digest(source);const entry=store.log('move',{fileId:id,name:f.name,from:source,to:dest,reason,hash,state:'planned'});await store.save();
  try {
    await fs.copyFile(source,dest,constants.COPYFILE_EXCL);
    if(await digest(dest)!==hash || await digest(source)!==hash)throw new Error('File changed while moving; both copies preserved.');
    await access.check(source,{write:true});await access.check(parent,{write:true,directory:true});
    await fs.unlink(source); f.path=dest;f.name=newName;f.kind=kindOf(dest);f.ext=path.extname(dest).slice(1).toUpperCase();f.mtime=(await fs.stat(dest)).mtimeMs; f.filingReason=reason;entry.state='completed'; await store.save();await store.protocol?.sync();return entry;
  } catch(e) {entry.state='failed';entry.error=e.message;await store.save();throw e;}
}
export function undoMove(store,activityId){return exclusive(store,()=>undoUnlocked(store,activityId));}
async function undoUnlocked(store,activityId) {
  const a=store.data.activity.find(x=>x.id===activityId&&x.type==='move'&&x.state==='completed');if(!a)throw new Error('Move cannot be undone.');
  const access=store.access||new Access(store);await access.check(a.to,{write:true});await access.check(path.dirname(a.from),{write:true,directory:true});
  const st=await fs.lstat(a.to);if(st.isSymbolicLink()||!st.isFile()||await digest(a.to)!==a.hash)throw new Error('Moved file was modified. Preserving both locations.');
  const sourceParent=await fs.realpath(path.dirname(a.from));if(sourceParent!==path.dirname(a.from))throw new Error('Original directory changed.');
  await fs.copyFile(a.to,a.from,constants.COPYFILE_EXCL);
  if(await digest(a.from)!==a.hash)throw new Error('Restore verification failed. Both copies preserved.');
  await access.check(a.to,{write:true});await fs.unlink(a.to);a.state='undone'; const f=store.data.files.find(x=>x.id===a.fileId);if(f){f.path=a.from;f.name=path.basename(a.from);f.kind=kindOf(a.from);f.ext=path.extname(a.from).slice(1).toUpperCase();f.mtime=(await fs.stat(a.from)).mtimeMs;} store.log('undo',{name:a.name});await store.save();await store.protocol?.sync();
}

// Reconcile a crash between the durable plan, copy and unlink. Recovery never deletes either copy.
export async function recoverMoves(store){
  let changed=false;
  for(const a of store.data.activity.filter(x=>x.type==='move'&&x.state==='planned')){
    const access=store.access||new Access(store);if(access.source(a.from)!=='workspace'||access.source(a.to)!=='workspace'){a.state='failed';a.error='Move is outside the current workspace.';changed=true;continue;}
    const exists=async p=>fs.lstat(p).then(s=>s.isFile()&&!s.isSymbolicLink()).catch(()=>false);
    const source=await exists(a.from),dest=await exists(a.to);const f=store.data.files.find(x=>x.id===a.fileId);
    if(!source&&dest&&await digest(a.to)===a.hash){a.state='completed';if(f){f.path=a.to;f.mtime=(await fs.stat(a.to)).mtimeMs;f.filingReason=a.reason;}}
    else {a.state='failed';a.error=source&&dest?'Interrupted move: both copies preserved. Review the two locations.':'Interrupted move: no further filesystem changes made.';if(f&&!source){f.status='error';f.error=a.error;}}
    changed=true;
  }
  if(changed)await store.save();
}
