// Capture the real desktop UI with synthetic files; no personal library or cloud inference.
import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../electron/store.mjs';
import {Access} from '../electron/access.mjs';
import {Protocol} from '../electron/protocol.mjs';
import {Workspace} from '../electron/workspace.mjs';

const base=await fs.mkdtemp(path.join(process.env.TEMP||os.tmpdir(),'lazyfile-showcase-'));
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
const store=await new Store(path.join(base,'Data')).init();store.data.settings.language='en';const access=new Access(store),protocol=new Protocol(store,access),workspace=new Workspace(store,access,protocol);await workspace.setWorkspace(root);
const observation=path.join(base,'Reference');await fs.mkdir(observation);
await fs.writeFile(path.join(observation,'Conference checklist.md'),'# Conference checklist\nConfirm travel dates, bring presentation notes and keep receipts.');
await workspace.observe([observation]);
await workspace.receive([path.join(observation,'Conference checklist.md')]);
const env={...process.env,LAZYFILE_DATA_DIR:store.dir};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.'],env,timeout:60000});
try{
 const page=await app.firstWindow();await page.waitForSelector('.file-row');
 await fs.mkdir('docs/assets',{recursive:true});
 const capture=async name=>{await page.mouse.move(20,20);await page.screenshot({path:`docs/assets/lazyfile-${name}.png`,animations:'disabled'});};
 await page.locator('.file-row').filter({hasText:'Q4 marketing budget.md'}).click();
 await page.locator('.inspector h3').filter({hasText:'Q4 marketing budget.md'}).waitFor();
 await capture('files');
 for(const [label,name,selector]of [['Agent Chat','assistant','.chat-welcome'],['Recent Activity','activity','.timeline'],['Collections','collections','.large-empty'],['Settings','settings','.settings-page']]){
  await page.locator('.sidebar nav').getByRole('button',{name:label,exact:true}).click();
  await page.locator(selector).waitFor();await capture(name);
 }
 await page.getByText('Advanced storage',{exact:true}).click();
 await page.locator('.privacy-note').scrollIntoViewIfNeeded();
 await capture('settings-folders');
 await page.locator('.sidebar nav').getByRole('button',{name:/^Files/}).click();
 await page.getByRole('button',{name:'Quick Search',exact:false}).first().click();await page.getByRole('dialog').waitFor();
 await page.getByText('Indexing your library…',{exact:true}).first().waitFor({state:'hidden',timeout:120000});await page.locator('.search-input-row input').fill('budget');await page.getByRole('option',{name:/Q4 marketing budget/}).waitFor({timeout:60000});
 await page.locator('.search-input-row .spin').waitFor({state:'hidden',timeout:120000});await page.getByRole('option',{name:/Q4 marketing budget/}).click();await page.getByText('Approved budget: $24,000.',{exact:false}).first().waitFor({timeout:30000});
 await fs.mkdir('docs/assets',{recursive:true});await page.mouse.move(20,20);await page.screenshot({path:'docs/assets/lazyfile-search.png',animations:'disabled'});
 console.log('Saved docs/assets/lazyfile-search.png (real UI, synthetic demo library).');
}finally{await app.close();}
