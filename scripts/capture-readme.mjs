// Capture the real desktop UI with synthetic files, never a personal library.
// Pass --analyze to use the connected Codex account for real demo topics and summaries.
// --chat-only sends a real lookup question and replaces only the assistant screenshot.
import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../electron/store.mjs';
import {Access} from '../electron/access.mjs';
import {Protocol} from '../electron/protocol.mjs';
import {Workspace} from '../electron/workspace.mjs';
import {Codex} from '../electron/codex.mjs';
import {Intelligence} from '../electron/intelligence.mjs';

// --reuse <demo directory> recaptures an existing generated library without more AI calls.
const reuseIndex=process.argv.indexOf('--reuse');
const reuse=reuseIndex>=0?process.argv[reuseIndex+1]:undefined;
if(reuseIndex>=0&&(!reuse||!path.basename(reuse).startsWith('lazyfile-showcase-')))throw new Error('Choose a generated lazyfile-showcase directory.');
const base=reuse||await fs.mkdtemp(path.join(process.env.TEMP||os.tmpdir(),'lazyfile-showcase-'));
let store;
if(reuse){await fs.access(path.join(base,'Workspace'));await fs.access(path.join(base,'Data','library.json'));store=await new Store(path.join(base,'Data')).init();}
else{
const root=path.join(base,'Workspace');await fs.mkdir(path.join(root,'Finance'),{recursive:true});await fs.mkdir(path.join(root,'Travel'));await fs.mkdir(path.join(root,'Projects'));
const docs={
 'Finance/Q4 marketing budget.md':'# Q4 marketing budget\nApproved budget: $24,000. Advertising: $14,000. Newsletters: $4,000. Launch event: $6,000. October–December 2026.',
 'Finance/Launch budget notes.txt':'Budget planning notes for the autumn product launch. Compare advertising costs and newsletter spending against the quarterly budget.',
 'Finance/invoice-2026-1042.txt':'Invoice 2026-1042. Office furniture and chairs. Total $1,500.',
 'Travel/Alpine summer.txt':'A quiet cabin beside an alpine lake. Summer hiking in pine forests and mountain reflections at sunset.',
 'Projects/Website launch.md':'# Website launch\nReview accessibility, polish the home page and prepare release notes.',
 'Projects/Reading list.md':'# Reading list\nBooks about typography, architecture and photography.'
};
for(const [name,content]of Object.entries(docs))await fs.writeFile(path.join(root,name),content);
store=await new Store(path.join(base,'Data')).init();store.data.settings.language='en';const access=new Access(store),protocol=new Protocol(store,access),workspace=new Workspace(store,access,protocol);await workspace.setWorkspace(root);
const observation=path.join(base,'Reference');await fs.mkdir(observation);
await fs.writeFile(path.join(observation,'Conference checklist.md'),'# Conference checklist\nConfirm travel dates, bring presentation notes and keep receipts.');
await workspace.observe([observation]);
await workspace.receive([path.join(observation,'Conference checklist.md')]);
if(process.argv.includes('--analyze')){
 store.data.settings.autoFile=false;await store.save();
 const codex=new Codex({cwd:path.join(base,'AgentWorkspace')});
 try{
  if(!(await codex.account()).account)throw new Error('Connect a Codex account before capturing analyzed demo files.');
  const ai=new Intelligence(store,codex,()=>{},{workspace});
  for(const name of ['Q4 marketing budget.md','Alpine summer.txt','Website launch.md']){
   const f=store.data.files.find(f=>f.name===name);await ai.analyze(f.id);
   if(f.status==='error'||!f.topic)throw new Error(`Demo analysis failed for ${name}: ${f.error||'No topic returned'}`);
   console.log(`Analyzed ${name}: ${f.topic}`);
  }
 }finally{codex.close();}
}
}
const env={...process.env,LAZYFILE_DATA_DIR:store.dir};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.'],env,timeout:60000});
try{
 const page=await app.firstWindow();await page.waitForSelector('.file-row');
 await fs.mkdir('docs/assets',{recursive:true});
 const capture=async name=>{await page.mouse.move(20,20);await page.screenshot({path:`docs/assets/lazyfile-${name}.png`,animations:'disabled'});};
 if(process.argv.includes('--chat-only')){
  await page.locator('.sidebar nav').getByRole('button',{name:'Agent Chat',exact:true}).click();
  const before=await page.locator('.message.assistant').count();
  const question='Find the approved Q4 marketing budget and confirm the total. Keep the answer brief and include the file.';
  await page.locator('.composer textarea').fill(question);
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await page.locator('.message.user').last().waitFor();
  await page.waitForFunction(count=>document.querySelectorAll('.message.assistant').length>count,before,{timeout:240000});
  await page.locator('.thinking').waitFor({state:'hidden',timeout:30000});
  const reply=page.locator('.message.assistant').last();
  await reply.locator('.result-card').filter({hasText:'Q4 marketing budget.md'}).waitFor();
  const user=page.locator('.message.user').last();
  await user.evaluate(el=>{const scroller=el.closest('.chat-scroll');scroller.scrollTo({top:el.offsetTop-scroller.offsetTop-20,behavior:'instant'});});
  // Ensure the complete exchange and file result fit in the visible conversation pane.
  for(const item of [user,reply]){
   if(!await item.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.chat-scroll').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom;}))throw new Error('Conversation does not fit; adjust the screenshot framing.');
  }
  await capture('assistant');console.log('Saved real question, answer and file result.');
 }else{
 await page.locator('.file-row').filter({hasText:'Q4 marketing budget.md'}).click();
 await page.locator('.inspector h3').filter({hasText:'Q4 marketing budget.md'}).waitFor();
 await capture('files');
 for(const [label,name,selector]of [['Agent Chat','assistant','.chat-scroll'],['Recent Activity','activity','.timeline'],['Collections','collections',store.data.files.some(f=>f.topic)?'.collections-grid button':'.large-empty'],['Settings','settings','.settings-page']]){
  await page.locator('.sidebar nav').getByRole('button',{name:label,exact:true}).click();
  await page.locator(selector).first().waitFor();await capture(name);
 }
 await page.getByText('Advanced storage',{exact:true}).click();
 await page.locator('.privacy-note').scrollIntoViewIfNeeded();
 await capture('settings-folders');
 await page.locator('.sidebar nav').getByRole('button',{name:/^Files/}).click();
 await page.getByRole('button',{name:'Quick Search',exact:false}).first().click();await page.getByRole('dialog').waitFor();
 await page.getByText('Indexing your library…',{exact:true}).first().waitFor({state:'hidden',timeout:120000});await page.locator('.search-input-row input').fill('budget');await page.getByRole('option',{name:/Q4 marketing budget/}).waitFor({timeout:60000});
 await page.locator('.search-input-row .spin').waitFor({state:'hidden',timeout:120000});await page.getByRole('option',{name:/Q4 marketing budget/}).click();await page.locator('.search-preview .excerpt').waitFor({timeout:30000});
 await fs.mkdir('docs/assets',{recursive:true});await page.mouse.move(20,20);await page.screenshot({path:'docs/assets/lazyfile-search.png',animations:'disabled'});
 console.log('Saved docs/assets/lazyfile-search.png (real UI, synthetic demo library).');
 }
}finally{await app.close();}
