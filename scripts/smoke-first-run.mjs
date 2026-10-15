// Exercise the packaged app with no models, no account and no development tools on PATH.
import {_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Store} from '../electron/store.mjs';

const executable=process.env.LAZYFILE_TEST_EXECUTABLE;
if(!executable)throw new Error('Set LAZYFILE_TEST_EXECUTABLE to the packaged app.');
const base=process.env.LAZYFILE_FIRST_RUN_DIR||await fs.mkdtemp(path.join(process.env.TEMP||os.tmpdir(),'lazyfile-first-run-'));
if(!path.basename(base).startsWith('lazyfile-first-run-'))throw new Error('Use an isolated first-run test directory.');
const files=path.join(base,'Demo files');await fs.mkdir(files,{recursive:true});
await fs.writeFile(path.join(files,'journey.txt'),'A quiet cabin beside an alpine lake. Summer hiking in pine forests and mountain reflections at sunset.');
await fs.writeFile(path.join(files,'invoice-2026-1042.txt'),'Invoice 2026-1042. Office furniture and chairs. Total $1,500.');
// A representative mixed library is needed: DigUp's z-score gate rejects pure
// semantic matches in a two-vector corpus (maximum z-score is 1).
const distractors=['Database backups and SQL transactions.','Bread recipe with flour and yeast.','Payroll tax deductions and salaries.','Guitar chords and musical notation.','Basketball scores and team rankings.','Dental appointment and insurance claim.','CPU benchmark and memory timings.','Contract renewal and legal clauses.','Garden irrigation and tomato fertilizer.','Shipping labels and warehouse inventory.','Physics equations and electrical circuits.','Meeting minutes for product launch.','Car engine maintenance and oil changes.','Language grammar and vocabulary exercises.'];
await Promise.all(distractors.map((text,i)=>fs.writeFile(path.join(files,'reference-'+i+'.txt'),text)));
const data=path.join(base,'Data');const store=await new Store(data).init();store.data.settings.language='en';store.data.settings.setupComplete=false;store.data.files=[];store.data.observationRoots=[];await store.save();
if(process.env.LAZYFILE_SEED_MODELS){
 // Reproduce an interrupted download without downloading the complete pair again.
 const models=path.join(data,'Models');await fs.mkdir(models,{recursive:true});
 await fs.copyFile(path.join(process.env.LAZYFILE_SEED_MODELS,'embeddinggemma-2-Q8_0.gguf'),path.join(models,'embeddinggemma-2-Q8_0.gguf'));
 await pipeline(createReadStream(path.join(process.env.LAZYFILE_SEED_MODELS,'mmproj-embeddinggemma-2-Q8_0.gguf'),{end:399999999}),createWriteStream(path.join(models,'mmproj-embeddinggemma-2-Q8_0.gguf.partial')));
 console.log('Testing real resume from a partially downloaded model.');
}
const env={...process.env,LAZYFILE_DATA_DIR:data,CODEX_HOME:path.join(base,'Codex'),PATH:process.env.SystemRoot+'\\System32'};
for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];env.Path=process.env.SystemRoot+'\\System32';
for(const key of ['ELECTRON_RUN_AS_NODE','LAZYFILE_MODELS_PATH','LAZYFILE_DIGUP_PATH','LAZYFILE_DEV_URL'])delete env[key];
await fs.mkdir(env.CODEX_HOME,{recursive:true});
console.log('Clean first-run evidence: '+base);
let app;
try{
 app=await electron.launch({executablePath:executable,args:[],env,timeout:60000});const page=await app.firstWindow();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const setup=page.getByRole('dialog');await setup.getByRole('heading',{name:'Find your first file.'}).waitFor();
 assert.equal(await setup.getByRole('button',{name:'Start searching',exact:true}).isEnabled(),false);
 const cached=(await page.evaluate(()=>window.lazyfile.state())).engine.modelsReady;
 if(!cached){
  await page.waitForFunction(async()=>{const s=await window.lazyfile.state();return s.engine.downloading||s.engine.downloadError;},null,{timeout:30000});
  assert.equal((await page.evaluate(()=>window.lazyfile.state())).engine.downloading,true,'Automatic download did not start');
 }else console.log('Reusing models verified by the previous real download/resume run.');
 await setup.getByLabel('Language',{exact:true}).selectOption('zh');await setup.getByRole('heading',{name:'找到你的第一个文件。'}).waitFor();
 await setup.getByLabel('语言',{exact:true}).selectOption('en');
 await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[files]});},files);
 await setup.getByRole('button',{name:'Add observation folder',exact:true}).click();await setup.getByText(files,{exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.lazyfile.connect())).account,null,'Clean profile must not inherit account credentials');
 await page.screenshot({path:path.join(base,'onboarding-download.png')});
 let ready=false;
 for(let n=0;n<180;n++){
  const s=await page.evaluate(()=>window.lazyfile.state());
  if(s.engine.downloadError)throw new Error(s.engine.downloadError);
  if(s.engine.modelsReady){ready=true;break;}
  if(n%6===0)console.log('Model download: '+(s.engine.downloadPercent||0)+'%');
  await new Promise(r=>setTimeout(r,5000));
 }
 assert.ok(ready,'Model download timed out');
 await setup.getByRole('button',{name:'Start searching',exact:true}).click();await setup.waitFor({state:'hidden'});

 console.log('First index: '+JSON.stringify(await page.evaluate(()=>window.lazyfile.engineStatus())));
 const exact=await page.evaluate(()=>window.lazyfile.search('2026-1042',false));assert.ok(exact.files.some(f=>f.name==='invoice-2026-1042.txt'));
 for(let n=0;n<90;n++){
  const r=await page.evaluate(()=>window.lazyfile.search('湖边木屋的夏日度假',true));
  if(r.meaning&&r.files.some(f=>f.name==='journey.txt'))break;
  await new Promise(r=>setTimeout(r,2000));
 }
 const semantic=await page.evaluate(()=>window.lazyfile.search('湖边木屋的夏日度假',true));assert.equal(semantic.meaning,true);assert.ok(semantic.files.some(f=>f.name==='journey.txt'));
 assert.equal((await fs.readdir(files)).includes('.overview.md'),false);
 await page.getByRole('button',{name:'Quick Search',exact:false}).first().click();await page.locator('.search-input-row input').fill('湖边木屋的夏日度假');await page.getByRole('option',{name:/journey.txt/}).waitFor();await page.locator('.search-input-row .spin').waitFor({state:'hidden'});
 await page.screenshot({path:path.join(base,'first-search.png')});assert.deepEqual(errors,[]);
 await app.close();app=null;
 app=await electron.launch({executablePath:executable,args:[],env,timeout:60000});const reopened=await app.firstWindow();await reopened.locator('.file-row').first().waitFor();
 assert.equal(await reopened.locator('.setup-card').count(),0);assert.equal((await reopened.evaluate(()=>window.lazyfile.state())).settings.setupComplete,true);
 console.log(JSON.stringify({passed:true,base,automaticDownload:!cached,isolatedAccount:true,bilingualSetup:true,keyword:true,semantic:true,restart:true}));
}finally{await app?.close();}
