import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../electron/store.mjs';
import {Access} from '../electron/access.mjs';
import {Protocol,tokens} from '../electron/protocol.mjs';
import {Workspace} from '../electron/workspace.mjs';
import {Search} from '../electron/search.mjs';
import {Intelligence} from '../electron/intelligence.mjs';
import {Codex} from '../electron/codex.mjs';

const base='D:/Caches/LazyFile/workspace-live-'+Date.now();const root=path.join(base,'Workspace'),observation=path.join(base,'Observed'),external=path.join(base,'Upload');
for(const d of[root,observation,external])await fs.mkdir(d,{recursive:true});
await fs.cp('D:/Caches/LazyFile/search-verification/files',observation,{recursive:true});
await fs.mkdir(path.join(root,'Finance'),{recursive:true});const original=path.join(external,'Q4-budget.txt');await fs.writeFile(original,'Approved Q4 Finance budget for October to December 2026. Advertising 14000 USD, newsletters 4000 USD, launch event 6000 USD. Total 24000 USD. Store with financial budgets.');
const store=await new Store(path.join(base,'Data')).init();store.data.settings.language='en';const access=new Access(store),protocol=new Protocol(store,access),workspace=new Workspace(store,access,protocol);await workspace.setWorkspace(root);await workspace.observe([observation]);const[id]=await workspace.receive([original]);
const search=new Search(store,access,{directory:path.join(base,'Index'),executable:'D:/Apps/LazyFileRuntime/DigUp/helper/digup.exe',models:'D:/Caches/LazyFile/Models'});
async function ready(roots){const e=await search.engineFor(roots);const until=Date.now()+180000;while(e.state.indexing){if(Date.now()>until)throw new Error('Index timeout');await new Promise(r=>setTimeout(r,500));}await e.ask('reload');return e;}
const codex=new Codex({cwd:path.join(base,'Agent')});const ai=new Intelligence(store,codex,(name,data)=>{if(name==='agent-step')console.log('TOOL',JSON.stringify(data));},{workspace,search});
try{
 await ready([root,observation]);await ready([observation]);await ready([root]);
 const semantic=await search.search('湖边木屋的夏日度假',true,{scope:'folder',folder:observation});assert.equal(semantic.meaning,true);assert.ok(semantic.files.some(f=>f.name==='journey.txt'));assert.ok(semantic.files.every(f=>f.source==='observation'));console.log('SCOPED_SEMANTIC_PASS');
 await ai.analyze(id);const f=store.data.files.find(f=>f.id===id);assert.notEqual(f.status,'error',f.error);assert.match(f.summary,/24[,.]?000/);const move=store.data.activity.find(a=>a.type==='move'&&a.fileId===id&&a.state==='completed');assert.ok(move,'Agent did not organize the clear finance document');await fs.access(original);console.log('COPY_AND_ORGANIZE_PASS',f.path);
 const found=await ai.chat('Find the approved budget. First browse the workspace guide, then use the search tool restricted to the workspace, then read the matching file to confirm its total.');assert.match(found.text,/24[,.]?000/);assert.ok(found.trace.some(t=>t.name==='browse'));assert.ok(found.trace.some(t=>t.name==='search'));assert.ok(found.trace.some(t=>t.name==='read_file'));console.log('BROWSE_SEARCH_READ_PASS');
 const reverse=await ai.chat('Find my lake holiday document. Start with global semantic search, then browse the matching folder and read the file to confirm. Do not organize anything.');assert.ok(reverse.fileIds.some(id=>store.data.files.find(f=>f.id===id)?.name==='journey.txt'));assert.equal(reverse.trace[0].name,'search');assert.ok(reverse.trace.some(t=>t.name==='browse'));console.log('SEARCH_BROWSE_READ_PASS');
 await workspace.undo(move.id);assert.match(store.data.files.find(f=>f.id===id).path,/Inbox/);assert.ok(tokens(await fs.readFile(path.join(root,'Inbox','.overview.md'),'utf8'))<=200);assert.ok(tokens(await fs.readFile(path.join(root,'Inbox','.intro.md'),'utf8'))<=2000);assert.ok(!(await fs.readdir(observation)).includes('.intro.md'));
 await fs.writeFile(path.join(base,'evidence.json'),JSON.stringify({base,semantic:semantic.files.map(f=>f.name),analysis:store.data.messages.find(m=>m.moves?.length)?.trace,forward:found.trace,reverse:reverse.trace,undo:move.state},null,2));console.log('PASS',base);
}finally{codex.close();search.close();}
