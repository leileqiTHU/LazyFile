import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Store } from '../electron/store.mjs';
import { ingest } from '../electron/files.mjs';
import assert from 'node:assert/strict';

const base='D:/Caches/LazyFile/smoke-'+Date.now();const files=path.join(base,'Fixtures');await fs.mkdir(files,{recursive:true});
await fs.writeFile(path.join(files,'Autumn campaign.md'),'# Autumn campaign\nMarketing launch budget: $24,000. Launch channels: newsletters, partnerships, and a small launch event.');
await fs.writeFile(path.join(files,'Mountain trip.txt'),'A quiet cabin beside an alpine lake. Hiking through pine forests and watching the mountain reflection at sunset.');
await fs.writeFile(path.join(files,'invoice-2026-1042.txt'),'Invoice 2026-1042. Office supplies and stationery. Total $170.');
const store=await new Store(path.join(base,'Data')).init();await ingest(store,[files]);store.data.observationRoots=[files];store.data.settings.setupComplete=true;await store.save();
const workspace=path.join(base,'Workspace');await fs.mkdir(workspace);
const env={...process.env,LAZYFILE_DATA_DIR:path.join(base,'Data')};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({...(process.env.LAZYFILE_TEST_EXECUTABLE?{executablePath:process.env.LAZYFILE_TEST_EXECUTABLE,args:[]}:{args:['.']}),env,timeout:60000});
try{
 const page=await app.firstWindow();await page.waitForSelector('.file-row');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal(await page.locator('.file-row').count(),3);await page.locator('.file-row').first().click();await page.waitForSelector('.file-preview h3');
 await page.screenshot({path:path.join(base,'files.png')});
 await page.getByRole('button',{name:'智能助手',exact:true}).click();await page.waitForSelector('.composer');await page.screenshot({path:path.join(base,'chat.png')});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('语言',{exact:true}).selectOption('en');await page.getByRole('heading',{name:'Settings',exact:true}).waitFor();await page.getByText('Workspace and observation folders',{exact:true}).waitFor();await page.getByText('Advanced storage',{exact:true}).waitFor();await app.evaluate(({dialog},workspace)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[workspace]});},workspace);await page.evaluate(()=>window.lazyfile.chooseWorkspace());assert.equal((await page.evaluate(()=>window.lazyfile.state())).settings.workspaceRoot,path.resolve(workspace));await fs.access(path.join(workspace,'.overview.md'));await fs.access(path.join(workspace,'.intro.md'));assert.equal((await fs.readdir(files)).includes('.intro.md'),false);await page.screenshot({path:path.join(base,'settings.png')});
 await page.getByRole('button',{name:'Quick Search',exact:false}).first().click();await page.getByRole('dialog').waitFor();await page.getByLabel('Search scope',{exact:true}).selectOption('folder');await page.getByLabel('Authorized folder path',{exact:true}).fill(files);await page.locator('.search-input-row input').fill('invoice-2026-1042');await page.getByRole('option',{name:/invoice-2026-1042/}).waitFor({timeout:30000});await page.screenshot({path:path.join(base,'search.png')});await page.keyboard.press('Escape');
 const account=await page.evaluate(()=>window.lazyfile.connect());assert.ok(account.account);assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify({passed:true,screenshots:base,files:3,languageSwitch:true,oauth:account.account.type}));
}finally{await app.close();}
