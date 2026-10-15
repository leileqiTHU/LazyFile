import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';

// Protocol reference: DigUp Sources/digup/{SearchService,IndexService}.swift (MIT).
export class DigUp extends EventEmitter {
  constructor({directory,executable,models}){super();this.directory=directory;this.executable=executable;this.models=models;this.pending=new Map();this.seq=0;this.roots=[];this.state={available:false,indexing:false,encoder:'stopped'};}
  env(){return {...process.env,DIGUP_MODELS:this.models};}
  async available(){try{await fs.access(this.executable);await fs.mkdir(this.directory,{recursive:true});this.state.available=true;}catch{this.state.available=false;}try{this.state.modelsReady=(await fs.stat(path.join(this.models,'embeddinggemma-2-Q8_0.gguf'))).size===309855456&&(await fs.stat(path.join(this.models,'mmproj-embeddinggemma-2-Q8_0.gguf'))).size===554821024;}catch{this.state.modelsReady=false;}return this.state.available;}
  async start(roots){if(!await this.available())throw new Error('Local search engine is not installed. Set up DigUp in Settings.');this.roots=roots;
    if(this.child){await this.ask('folders',{roots});return;}
    const child=spawn(this.executable,['search-service',...roots,'--index',this.directory,'--encoder-idle','120'],{env:this.env(),windowsHide:true,stdio:['pipe','pipe','pipe']});this.child=child;
    child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);const p=this.pending.get(r.id);if(p){clearTimeout(p.timer);this.pending.delete(r.id);r.ok===false?p.reject(new Error(r.error)):p.resolve(r);}else this.emit('event',r);}catch{}});
    const stop=e=>{if(this.child===child)this.child=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();};child.on('error',stop);child.on('exit',()=>stop(new Error('Local search engine stopped.')));
  }
  ask(op,params={}){return new Promise((resolve,reject)=>{if(!this.child){reject(new Error('Search engine is not running.'));return;}const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Local search timed out.'));},90000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,op,...params})+'\n');});}
  async search(q,meaning=true,limit=40){await this.start(this.roots);if(meaning&&this.state.modelsReady){await this.ask('prewarm');for(let i=0;i<100;i++){const s=await this.ask('status');if(s.encoder==='ready'||s.encoder==='unavailable')break;await new Promise(r=>setTimeout(r,100));}}return this.ask('search',{q,meaning,prefix_last:!meaning,limit});}
  async status(){if(!await this.available())return this.state;try{await this.start(this.roots);Object.assign(this.state,await this.ask('status'));}catch(e){this.state.error=e.message;}return this.state;}
  async downloadModels(){if(this.downloader)return;if(!await this.available())throw new Error('Choose the DigUp helper first.');await fs.mkdir(this.models,{recursive:true});this.state.downloading=true;this.emit('state',this.state);
    return new Promise((resolve,reject)=>{const child=spawn(this.executable,['download-model','--to',this.models],{env:this.env(),windowsHide:true,stdio:['ignore','pipe','pipe']});this.downloader=child;let error='';child.stderr.on('data',()=>{});let last=0;createInterface({input:child.stdout}).on('line',line=>{try{const r=JSON.parse(line);if(r.event==='error')error=r.message;if(r.event==='progress'){this.state.downloadPercent=Math.round(r.all_bytes/r.all_total*100);if(Date.now()-last<500)return;last=Date.now();}this.emit('state',this.state);}catch{}});child.on('error',e=>{error=e.message;});child.on('close',async code=>{this.downloader=null;this.state.downloading=false;await this.available();this.emit('state',this.state);if(code===0)resolve();else reject(new Error(error||'Model download failed. Retry to resume.'));});});
  }
  async index(roots){if(!roots.length||!await this.available())return;this.roots=roots;await this.start(roots);if(this.indexer){this.reindexNeeded=true;return;}
    this.state.indexing=true;this.emit('state',this.state);
    const child=spawn(this.executable,['index-service',...roots,'--index',this.directory,'--include-code','--backfill','--linger','1'],{env:this.env(),windowsHide:true,stdio:['pipe','pipe','pipe']});this.indexer=child;
    child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});createInterface({input:child.stdout}).on('line',line=>{try{const event=JSON.parse(line);this.state.progress=event;this.emit('state',this.state);if(['file','summary','sync'].includes(event.event))this.ask('reload').catch(()=>{});}catch{}});
    child.on('error',e=>{this.state.error=e.message;});child.on('exit',()=>{this.indexer=null;this.state.indexing=false;this.ask('reload').catch(()=>{});this.emit('state',this.state);if(this.reindexNeeded){this.reindexNeeded=false;this.index(this.roots).catch(()=>{});}});
  }
  close(){this.downloader?.kill();this.child?.stdin.write('{"op":"quit"}\n');this.indexer?.stdin.write('stop\n');setTimeout(()=>{this.child?.kill();this.indexer?.kill();},1500).unref();}
}
