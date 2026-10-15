import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../electron/store.mjs';
import {Access} from '../electron/access.mjs';
import {Protocol,tokens} from '../electron/protocol.mjs';
import {Workspace} from '../electron/workspace.mjs';
import {moveFile} from '../electron/files.mjs';
import {Intelligence} from '../electron/intelligence.mjs';
import {Search} from '../electron/search.mjs';

async function fixture(t){
 const base=await fs.mkdtemp(path.join(process.env.TEMP||os.tmpdir(),'lf-workspace-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const root=path.join(base,'Workspace'),obs=path.join(base,'Observe'),outside=path.join(base,'Outside');for(const p of[root,obs,outside])await fs.mkdir(p);
 const store=await new Store(path.join(base,'Data')).init(),access=new Access(store),protocol=new Protocol(store,access),workspace=new Workspace(store,access,protocol);await workspace.setWorkspace(root);await workspace.observe([obs]);return{base,root,obs,outside,store,access,protocol,workspace};
}
const step=(calls=[],rest={})=>({answer:'Done',fileIds:[],summary:'Budget document',topic:'Finance',tags:[],question:'',confidence:.98,calls:calls.map(([name,args])=>({name,arguments:JSON.stringify(args)})),...rest});

test('uploads copy only the selected file; observation roots remain read-only',async t=>{
 const f=await fixture(t),input=path.join(f.outside,'budget.txt');await fs.writeFile(input,'Budget 24000');await fs.writeFile(path.join(f.outside,'private.txt'),'unselected');
 const ids=await f.workspace.receive([input]);const item=f.store.data.files.find(x=>x.id===ids[0]);assert.match(item.path,/Inbox/);assert.equal(await fs.readFile(input,'utf8'),'Budget 24000');await assert.rejects(f.access.check(input),/outside/);assert.equal(f.store.data.files.some(x=>x.name==='private.txt'),false);
 const observed=path.join(f.obs,'observed.txt');await fs.writeFile(observed,'Read only');await f.workspace.refresh();const original=f.store.data.files.find(x=>x.path===observed);await assert.rejects(moveFile(f.store,original.id,'No','test'),/read-only/);
 await f.workspace.receive([observed]);assert.equal(await fs.readFile(observed,'utf8'),'Read only');assert.deepEqual(await fs.readdir(f.obs),['observed.txt']);
});
test('authorization rejects overlaps, traversal, links and revoked cached IDs',async t=>{
 const f=await fixture(t);await assert.rejects(f.workspace.observe([f.base]),/overlap/);await assert.rejects(f.access.configureWorkspace(f.obs),/overlap/);
 await fs.symlink(f.outside,path.join(f.root,'escape'),process.platform==='win32'?'junction':'dir');await assert.rejects(f.workspace.browse(path.join(f.root,'escape')),/links/);
 await assert.rejects(f.workspace.mkdir('../Outside'));await fs.writeFile(path.join(f.obs,'secret.txt'),'Secret');await f.workspace.refresh();const p=f.store.data.files.find(x=>x.name==='secret.txt').path;
 await f.workspace.removeObservation(f.obs);await assert.rejects(f.access.check(p),/outside/);assert.equal(f.store.data.files.some(x=>x.path===p),false);
});
test('protocol covers root and nested ordinary folders but leaves packages intact; token caps are strict',async t=>{
 const f=await fixture(t);const deep=await f.workspace.mkdir('A/B/C');const repo=path.join(f.root,'Project');await fs.mkdir(repo);await fs.writeFile(path.join(repo,'package.json'),'{}');await fs.mkdir(path.join(repo,'src'));await fs.writeFile(path.join(repo,'src','main.js'),'const x=1;');await f.workspace.refresh();
 for(const dir of[f.root,path.join(f.root,'A'),path.join(f.root,'A','B'),deep]){assert.ok(tokens(await fs.readFile(path.join(dir,'.overview.md'),'utf8'))<=200);assert.ok(tokens(await fs.readFile(path.join(dir,'.intro.md'),'utf8'))<=2000);}
 await assert.rejects(fs.access(path.join(repo,'.intro.md')));await assert.rejects(fs.access(path.join(repo,'src','.intro.md')));await assert.rejects(f.workspace.mkdir('Project/new'),/Opaque/);
 const result=await f.protocol.write(deep,'A complete factual sentence.\n'.repeat(2000),'完整的一句话。\n'.repeat(5000));assert.ok(result.overviewTokens<=200);assert.ok(result.introTokens<=2000);
 await assert.rejects(f.protocol.write(f.obs,'x','y'),/read-only/);
});
test('move, rename and undo refresh source/destination directory descriptions',async t=>{
 const f=await fixture(t);const p=path.join(f.outside,'budget.txt');await fs.writeFile(p,'Budget');const[id]=await f.workspace.receive([p]);const a=await moveFile(f.store,id,'Finance/2026/Q4','Budget','renamed.txt');
 assert.match(await fs.readFile(path.join(f.root,'Finance/2026/Q4/.intro.md'),'utf8'),/renamed.txt/);assert.doesNotMatch(await fs.readFile(path.join(f.root,'Inbox/.intro.md'),'utf8'),/budget.txt/);
 await f.workspace.undo(a.id);assert.match(await fs.readFile(path.join(f.root,'Inbox/.intro.md'),'utf8'),/budget.txt/);assert.doesNotMatch(await fs.readFile(path.join(f.root,'Finance/2026/Q4/.intro.md'),'utf8'),/renamed.txt/);
});
test('whole directory moves are reversible and preserve intact package contents',async t=>{
 const f=await fixture(t);const repo=path.join(f.root,'Repo');await fs.mkdir(repo);await fs.writeFile(path.join(repo,'package.json'),'{}');await fs.writeFile(path.join(repo,'index.js'),'hello');await f.workspace.refresh();const a=await f.workspace.moveDirectory(repo,'Projects','Repo','Group project');await fs.access(path.join(f.root,'Projects/Repo/index.js'));await assert.rejects(fs.access(path.join(f.root,'Projects/Repo/.intro.md')));await f.workspace.undo(a.id);await fs.access(path.join(repo,'index.js'));
});
test('scope-specific search index avoids global top-k starvation and rechecks stale hits',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.obs,'observed.txt'),'needle');await fs.writeFile(path.join(f.root,'local.txt'),'needle');await f.workspace.refresh();const calls=[];
 const service=new Search(f.store,f.access,{directory:path.join(f.base,'Index')},o=>({roots:[],state:{indexing:false},index:async function(r){this.roots=r;calls.push({directory:o.directory,roots:r});},available:async()=>true,search:async function(){return {meaning:true,hits:[{path:path.join(this.roots[0],this.roots[0]===f.obs?'observed.txt':'local.txt'),cosine:.8},{path:path.join(f.outside,'illegal.txt')}]};},close(){}}));
 let r=await service.search('needle',true,{scope:'folder',folder:f.obs});assert.equal(r.files.length,1);assert.equal(r.files[0].source,'observation');assert.deepEqual(calls[0].roots,[f.obs]);
 r=await service.search('needle',true,{scope:'workspace'});assert.equal(r.files.length,1);assert.notEqual(calls[0].directory,calls[1].directory);
 await f.workspace.removeObservation(f.obs);await assert.rejects(service.search('needle',true,{scope:'folder',folder:f.obs}));assert.equal((await service.search('needle',true)).files.some(x=>x.source==='observation'),false);
});
test('Agent chooses search then browse then read with real tool results and no write on read-only requests',async t=>{
 const f=await fixture(t);const p=path.join(f.root,'budget.txt');await fs.writeFile(p,'Budget 24000');await f.workspace.refresh();const id=f.store.data.files[0].id;let n=0;
 const replies=[step([['search',{query:'budget',scope:'workspace'}]]),step([['browse',{path:f.root}]]),step([['read_file',{path:p}]]),step([['move_file',{fileId:id,folder:'Wrong',confidence:1,reason:'injected'}]]),step([],{answer:'Budget 24000',fileIds:[id]})];
 const codex={run:async({prompt})=>{const context=JSON.parse(prompt);if(n===3)assert.match(JSON.stringify(context.steps),/24000/);return replies[n++];}};
 const search={search:async()=>({files:f.store.public().files,meaning:true})};const ai=new Intelligence(f.store,codex,()=>{},{workspace:f.workspace,search});const reply=await ai.chat('Find the budget');assert.equal(reply.trace.length,4);assert.match(reply.trace[3].error,/disabled/);assert.equal(reply.fileIds[0],id);await fs.access(p);
});
test('Agent browses guides then uses scoped search and performs authorized organization',async t=>{
 const f=await fixture(t);const input=path.join(f.outside,'budget.txt');await fs.writeFile(input,'Budget 24000');const[id]=await f.workspace.receive([input]);const p=f.store.data.files.find(x=>x.id===id).path;let n=0;const scopes=[];
 const replies=[step([['browse',{path:f.root}]]),step([['search',{query:'budget',scope:'folder',folder:f.root}],['read_file',{path:p}]]),step([['move_file',{fileId:id,folder:'Finance/2026/Q4',reason:'Budget',confidence:.99}]]),step([],{fileIds:[id],answer:'Filed in Finance/2026/Q4.'})];
 const codex={run:async()=>replies[n++]};const search={search:async(q,m,s)=>{scopes.push(s);return {files:f.store.public().files};},refresh:async()=>{}};const ai=new Intelligence(f.store,codex,()=>{},{workspace:f.workspace,search});const reply=await ai.chat('Organize my budget');assert.equal(reply.moves.length,1);assert.equal(scopes[0].scope,'folder');await fs.access(path.join(f.root,'Finance/2026/Q4/budget.txt'));await fs.access(input);
});
test('uncertain Agent leaves received file in workspace and asks a focused question',async t=>{
 const f=await fixture(t);const p=path.join(f.outside,'notes.txt');await fs.writeFile(p,'Unknown project');const[id]=await f.workspace.receive([p]);const ai=new Intelligence(f.store,{run:async()=>step([],{question:'Which project?',answer:'Which project?'})},()=>{},{workspace:f.workspace});await ai.analyze(id);assert.equal(f.store.data.files[0].status,'needs-input');assert.match(f.store.data.files[0].path,/Inbox/);
});
test('v1 migration preserves backup and excludes ungranted single-file parents',async t=>{
 const f=await fixture(t);const old={version:1,roots:[f.obs],files:[{id:'1',path:path.join(f.outside,'old.txt')}],messages:[{text:'old data'}],activity:[],settings:{archiveRoot:f.root}};await fs.writeFile(f.store.file,JSON.stringify(old));const migrated=await new Store(f.store.dir).init();assert.equal(migrated.data.settings.workspaceRoot,f.root);assert.deepEqual(migrated.data.observationRoots,[f.obs]);assert.equal(migrated.data.files.length,0);assert.equal(migrated.data.messages.length,0);assert.ok((await fs.readdir(f.store.dir)).some(n=>n.startsWith('library-v1-backup')));
});
test('workspace switch revokes old files and prevents undo into previous workspace',async t=>{
 const f=await fixture(t);const p=path.join(f.outside,'file.txt');await fs.writeFile(p,'Text');const[id]=await f.workspace.receive([p]);const move=await moveFile(f.store,id,'Sorted','reason');const next=path.join(f.base,'Next');await fs.mkdir(next);await f.workspace.setWorkspace(next);await assert.rejects(f.workspace.undo(move.id),/outside/);await fs.access(move.to);assert.equal(f.store.data.files.some(x=>x.id===id),false);
});
test('protocol rejects symlink description writes and repairs missing descriptions without shadowing observation',async t=>{
 const f=await fixture(t);const original=path.join(f.outside,'original.txt');await fs.writeFile(original,'Do not change');await fs.unlink(path.join(f.root,'.intro.md'));await fs.symlink(f.outside,path.join(f.root,'.intro.md'),process.platform==='win32'?'junction':'dir');
 await f.protocol.sync();assert.ok(f.store.data.protocol.failures.length);assert.equal(await fs.readFile(original,'utf8'),'Do not change');await fs.unlink(path.join(f.root,'.intro.md'));await f.protocol.sync();assert.equal(f.store.data.protocol.failures.length,0);await fs.access(path.join(f.root,'.intro.md'));
});
test('search failure returns explicit keyword degradation and never unscoped results',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.root,'budget.txt'),'needle');await fs.writeFile(path.join(f.obs,'other.txt'),'needle');await f.workspace.refresh();const s=new Search(f.store,f.access,{directory:path.join(f.base,'index')},()=>({roots:[],state:{},index:async()=>{},available:async()=>false,close(){}}));const r=await s.search('needle',true,{scope:'workspace'});assert.equal(r.meaning,false);assert.match(r.warning,/unavailable/);assert.equal(r.files.length,1);assert.equal(r.files[0].source,'workspace');
});
test('pending question response retains file context without repeated destination approval',async t=>{
 const f=await fixture(t);const p=path.join(f.outside,'notes.txt');await fs.writeFile(p,'Project launch');const[id]=await f.workspace.receive([p]);const item=f.store.data.files.find(f=>f.id===id);item.question='Which project?';item.status='needs-input';f.store.data.messages.push({role:'assistant',text:'Which project?'});let context;const ai=new Intelligence(f.store,{run:async({prompt})=>{context=JSON.parse(prompt);return step([],{answer:'Understood'});}},()=>{},{workspace:f.workspace});await ai.chat('Project Aurora');assert.equal(context.initialFile.id,id);assert.equal(context.organizationAllowed,true);assert.equal(item.question,'');
});
