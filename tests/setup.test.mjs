import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runtimePaths,dataDirectory} from '../electron/runtime.mjs';
import {DigUp} from '../electron/digup.mjs';

test('packaged runtime uses bundled helpers and per-user models without developer paths',()=>{
 const r=runtimePaths({packaged:true,resources:'X:/app/resources',dataDir:'X:/user/data',env:{},platform:'win32'});
 assert.equal(r.digup,path.join('X:/app/resources','digup','digup.exe'));
 assert.equal(r.codex,path.join('X:/app/resources','codex','bin','codex.exe'));
 assert.equal(r.models,path.join('X:/user/data','Models'));
 const override=runtimePaths({packaged:true,resources:'R',dataDir:'D',env:{LAZYFILE_MODELS_PATH:'M'},settings:{codexPath:'C'},platform:'win32'});
 assert.equal(override.models,'M');assert.equal(override.codex,'C');
});
test('storage retains existing libraries but isolates new users',()=>{
 assert.equal(dataDirectory({appData:'A',env:{},platform:'win32',exists:()=>false}),path.join('A','LazyFile'));
 assert.equal(dataDirectory({appData:'A',env:{},platform:'win32',exists:()=>true}),'D:/Apps/LazyFile/Data');
 assert.equal(dataDirectory({appData:'A',env:{LAZYFILE_DATA_DIR:'custom'}}),'custom');
});
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lazyfile-download-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 let count=0,ready=false,child;
 const e=new DigUp({directory:dir,models:dir,executable:'test-helper',spawnProcess:()=>{count++;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();return child;}});
 e.available=async()=>{e.state.available=true;e.state.modelsReady=ready;return true;};
 return {e,spawnCount:()=>count,child:()=>child,setReady:()=>{ready=true;}};
}
const started=async f=>{while(!f.child())await new Promise(r=>setTimeout(r,5));};
test('automatic and manual setup share a download and validate completion',async t=>{
 const f=await fixture(t);const first=f.e.downloadModels(),second=f.e.downloadModels();assert.equal(first,second);await started(f);
 f.child().stdout.write(JSON.stringify({event:'progress',all_bytes:25,all_total:100})+'\n');assert.equal(f.e.state.downloadPercent,25);
 f.setReady();f.child().emit('close',0);await Promise.all([first,second]);assert.equal(f.spawnCount(),1);assert.equal(f.e.state.modelsReady,true);assert.equal(f.e.state.downloading,false);
 await f.e.downloadModels();assert.equal(f.spawnCount(),1);
});
test('download failure clears busy state and permits a retry; partial files cannot report success',async t=>{
 const f=await fixture(t);const first=f.e.downloadModels();await started(f);f.child().emit('close',1);await assert.rejects(first,/download failed/);assert.equal(f.e.state.downloading,false);assert.ok(f.e.state.downloadError);
 const second=f.e.downloadModels();while(f.spawnCount()<2)await new Promise(r=>setTimeout(r,5));f.child().emit('close',0);await assert.rejects(second,/incomplete/);assert.equal(f.e.state.modelsReady,false);
});
test('indexing waits for models so documents cannot be marked complete without vectors',async t=>{
 const f=await fixture(t);let started=false;f.e.start=async()=>{started=true;};
 await f.e.index(['test-root']);assert.equal(started,true);assert.equal(f.e.indexer,undefined);assert.equal(f.e.state.indexing,false);
});
