import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {canonical,within,protocolNames,opaque} from './access.mjs';
import {ingest,exclusive,digest,undoMove} from './files.mjs';

async function treeDigest(dir){
  const rows=[];const walk=async(p)=>{for(const e of (await fs.readdir(p,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(protocolNames.has(e.name))continue;const f=path.join(p,e.name);if(e.isSymbolicLink())throw new Error('Directory contains links; leave it intact.');rows.push([path.relative(dir,f),e.isDirectory()?'directory':await digest(f)]);if(e.isDirectory())await walk(f);}};
  await walk(dir);return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export class Workspace {
  constructor(store,access,protocol){Object.assign(this,{store,access,protocol});store.access=access;store.protocol=protocol;}
  async refresh(){
    for(const a of this.store.data.activity.filter(a=>a.type==='move_directory'&&a.state==='planned')){
      try{if(this.access.source(a.to)!=='workspace'||this.access.source(a.from)!=='workspace')throw new Error('Outside current workspace');await this.access.check(a.to,{directory:true});try{await fs.lstat(a.from);throw new Error('Both locations exist');}catch(e){if(e.code!=='ENOENT')throw e;}if(await treeDigest(a.to)!==a.hash)throw new Error('Directory changed');this.relocateRecords(a.from,a.to);a.state='completed';}catch(e){a.state='failed';a.error='Interrupted directory move: '+e.message;}
    }
    const roots=this.access.roots();const failures=[];
    this.store.data.files=this.store.data.files.filter(f=>this.access.source(f.path)&&!protocolNames.has(f.name));
    for(const root of roots)try{await this.access.check(root,{directory:true});await ingest(this.store,[root]);}catch(e){failures.push({path:root,error:e.message});}
    for(const f of this.store.data.files){try{await this.access.check(f.path);}catch{f.status='missing';}}
    this.store.data.scanFailures=failures;await this.protocol.sync();await this.store.save();return failures;
  }
  async setWorkspace(p){return exclusive(this.store,async()=>{await this.access.configureWorkspace(p);this.store.data.messages=[];await this.refresh();});}
  async observe(paths){return exclusive(this.store,async()=>{for(const p of paths)await this.access.observe(p);await this.refresh();});}
  async removeObservation(p){return exclusive(this.store,async()=>{this.store.data.observationRoots=this.store.data.observationRoots.filter(r=>r!==p);this.store.data.messages=[];await this.refresh();});}
  receive(paths){return exclusive(this.store,async()=>{
    const root=this.store.data.settings.workspaceRoot;if(!root)throw new Error('Choose a LazyFile workspace before sending files.');await this.access.check(root,{write:true,directory:true});
    const ids=[];for(const input of paths){
      const source=await canonical(input);const stat=await fs.stat(source);if(!stat.isFile()||protocolNames.has(path.basename(source)))throw new Error('Send an ordinary file. Directory descriptions are maintained automatically.');
      if(within(root,source)){await this.access.check(source);await ingest(this.store,[source]);ids.push(this.store.data.files.find(f=>f.path===source).id);continue;}
      const inbox=await this.mkdir('Inbox');let dest;const ext=path.extname(source),stem=path.basename(source,ext);
      // A partial upload is never exposed as a normal workspace document, even after a crash.
      const temp=path.join(inbox,'.lazyfile-receive-'+randomUUID()+'.tmp');await fs.copyFile(source,temp,constants.COPYFILE_EXCL);
      const after=await fs.stat(source);if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||await digest(source)!==await digest(temp)){this.store.log('receive',{name:path.basename(source),to:temp,state:'failed',error:'Source changed during copy. Original and staging copy retained.'});await this.store.save();throw new Error('Source changed during copy; original and staging copy preserved.');}
      await this.access.check(inbox,{write:true,directory:true});
      for(let n=0;n<10000;n++){dest=path.join(inbox,n?`${stem} (${n})${ext}`:path.basename(source));try{await fs.link(temp,dest);break;}catch(e){if(e.code!=='EEXIST'||n===9999)throw e;}}
      await fs.unlink(temp);
      await ingest(this.store,[dest]);const f=this.store.data.files.find(f=>f.path===dest);f.received=true;ids.push(f.id);this.store.log('receive',{fileId:f.id,name:f.name,to:dest,state:'completed'});
    }
    await this.protocol.sync();await this.store.save();return ids;
  });}
  async mkdir(relative){
    const root=this.store.data.settings.workspaceRoot;if(!root||typeof relative!=='string'||path.isAbsolute(relative)||relative.split(/[\\/]/).some(p=>p==='..'||p.includes(':'))||/[\x00-\x1f]/.test(relative))throw new Error('Invalid workspace directory.');
    let dir=root;await this.access.check(root,{write:true,directory:true});
    for(const part of relative.split(/[\\/]/).filter(Boolean)){
      await this.access.check(dir,{write:true,directory:true});const next=path.join(dir,part);try{await fs.mkdir(next);this.store.log('mkdir',{to:next,state:'completed'});}catch(e){if(e.code!=='EEXIST')throw e;}dir=(await this.access.check(next,{write:true,directory:true})).path;
    }
    return dir;
  }
  relocateRecords(from,to){for(const f of this.store.data.files)if(within(from,f.path))f.path=path.join(to,path.relative(from,f.path));}
  async directoryLocation(input){const c=await this.access.check(input,{directory:true});const root=this.store.data.settings.workspaceRoot;if(c.source!=='workspace'||c.path===root)throw new Error('Only workspace child directories can move.');await this.access.check(path.dirname(c.path),{write:true,directory:true});return c.path;}
  moveDirectory(input,folder,name,reason){return exclusive(this.store,async()=>{
    const source=await this.directoryLocation(input);const root=this.store.data.settings.workspaceRoot;
    const prospective=path.resolve(root,folder||'');if(within(source,prospective))throw new Error('Cannot move a directory inside itself.');
    const parent=await this.mkdir(folder||'');const label=name||path.basename(source);
    if(!label||label==='.'||label==='..'||/[\\/:\x00-\x1f]/.test(label)||protocolNames.has(label))throw new Error('Invalid directory name.');
    const dest=path.join(parent,label);try{await fs.lstat(dest);throw new Error('Destination already exists.');}catch(e){if(e.code!=='ENOENT')throw e;}
    const hash=await treeDigest(source);const a=this.store.log('move_directory',{from:source,to:dest,name:label,reason,hash,state:'planned'});await this.store.save();
    try{await this.directoryLocation(source);await this.access.check(parent,{write:true,directory:true});await fs.rename(source,dest);this.relocateRecords(source,dest);a.state='completed';await this.store.save();await this.protocol.sync();return a;}catch(e){a.state='failed';a.error=e.message;await this.store.save();throw e;}
  });}
  async undo(id){
    const a=this.store.data.activity.find(a=>a.id===id);if(a?.type==='move')return undoMove(this.store,id);
    return exclusive(this.store,async()=>{
      if(!a||a.state!=='completed')throw new Error('Operation cannot be undone.');
      if(a.type==='mkdir'){
        await this.access.check(a.to,{write:true,directory:true});const entries=await fs.readdir(a.to);if(entries.some(n=>!protocolNames.has(n)))throw new Error('Directory is not empty. Undo its file moves first.');
        for(const n of entries){await this.access.check(path.join(a.to,n));await fs.unlink(path.join(a.to,n));}await fs.rmdir(a.to);
      }else if(a.type==='move_directory'){
        await this.directoryLocation(a.to);await this.access.check(path.dirname(a.from),{write:true,directory:true});if(await treeDigest(a.to)!==a.hash)throw new Error('Directory was modified. Cannot safely undo.');
        try{await fs.lstat(a.from);throw new Error('Original location already exists.');}catch(e){if(e.code!=='ENOENT')throw e;}
        await fs.rename(a.to,a.from);this.relocateRecords(a.to,a.from);
      }else throw new Error('Operation has no undo action.');
      a.state='undone';this.store.log('undo',{name:a.name||path.basename(a.to)});await this.store.save();await this.protocol.sync();
    });
  }
  async browse(dir,offset=0){
    const checked=await this.access.check(dir,{directory:true});
    if(!Number.isInteger(offset)||offset<0)throw new Error('Invalid offset.');
    const all=(await fs.readdir(checked.path,{withFileTypes:true})).filter(e=>!e.isSymbolicLink()&&!protocolNames.has(e.name)&&!e.name.startsWith('.lazyfile-')).sort((a,b)=>a.name.localeCompare(b.name));
    const entries=[];for(const e of all.slice(offset,offset+60)){const p=path.join(checked.path,e.name);entries.push({name:e.name,path:p,kind:e.isDirectory()?'directory':'file',opaque:e.isDirectory()?await opaque(p):undefined,fileId:this.store.data.files.find(f=>f.path===p)?.id});}
    const descriptions={};for(const name of protocolNames)try{const p=path.join(checked.path,name);const c=await this.access.check(p);if(!c.stat.isFile())continue;const h=await fs.open(p,'r');try{const buffer=Buffer.alloc(64000);const {bytesRead}=await h.read(buffer,0,buffer.length,0);descriptions[name]=buffer.subarray(0,bytesRead).toString('utf8').slice(0,16000);}finally{await h.close();}}catch{}
    return {path:checked.path,source:checked.source,entries,nextOffset:offset+60<all.length?offset+60:null,descriptions};
  }
}
