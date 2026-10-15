import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export async function findCodex(configured='') {
  if(configured) {await fs.access(configured);return configured;}
  const exe=process.platform==='win32'?'codex.exe':'codex';
  for(const dir of (process.env.PATH||'').split(path.delimiter)) {try{const p=path.join(dir,exe);await fs.access(p);return p;}catch{}}
  if(process.platform==='win32') {
    const root=path.join(process.env.LOCALAPPDATA||'', 'OpenAI','Codex','bin');
    try{const dirs=await fs.readdir(root);for(const d of dirs.reverse()){const p=path.join(root,d,exe);try{await fs.access(p);return p;}catch{}}}catch{}
  }
  for(const p of ['/opt/homebrew/bin/codex','/usr/local/bin/codex',path.join(os.homedir(),'.local','bin','codex')]){try{await fs.access(p);return p;}catch{}}
  throw new Error('Codex CLI not found. Install Codex or choose its executable in Settings.');
}
export class Codex extends EventEmitter {
  constructor({cwd,executable='',home}={}) {super();this.cwd=cwd;this.executable=executable;this.home=home;this.seq=0;this.pending=new Map();this.runs=new Map();}
  async start() {
    if(this.ready)return this.ready;
    this.ready=this.boot().catch(e=>{this.child?.kill();this.ready=null;throw e;});return this.ready;
  }
  async boot() {
    await fs.mkdir(this.cwd,{recursive:true});const executable=await findCodex(this.executable);
    const args=['app-server','--listen','stdio://','-c','features.shell_tool=false','-c','features.apps=false','-c','features.multi_agent=false','-c','web_search="disabled"'];
    // Keep authentication under Codex's own credential management. Disable inherited MCP servers.
    const home=this.home||process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
    try {const config=await fs.readFile(path.join(home,'config.toml'),'utf8'); for(const m of config.matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]/gm))args.push('-c',`mcp_servers.${m[1]}.enabled=false`);}catch{}
    const env={...process.env};
    // A standalone app must not inherit the host coding chat's workspace routing or IPC identity.
    for(const name of Object.keys(env))if(name.startsWith('CODEX_')&&name!=='CODEX_HOME')delete env[name];
    if(this.home)env.CODEX_HOME=this.home;delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
    this.child=spawn(executable,args,{cwd:this.cwd,env,stdio:['pipe','pipe','pipe'],windowsHide:true});
    this.child.stdin.on('error',()=>{});
    this.child.stderr.on('data',()=>{});
    createInterface({input:this.child.stdout}).on('line',line=>{try{this.receive(JSON.parse(line));}catch{}});
    this.child.on('error',e=>this.fail(e));this.child.on('exit',()=>{this.ready=null;this.fail(new Error('Codex disconnected. Reconnect in Settings.'));});
    await this.request('initialize',{clientInfo:{name:'lazyfile',title:'LazyFile',version:'0.2.0'},capabilities:{experimentalApi:true}},30000);
    this.send({method:'initialized',params:{}});
  }
  send(msg){this.child?.stdin.write(JSON.stringify(msg)+'\n');}
  request(method,params={},timeout=30000){return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method}: timed out`));},timeout);this.pending.set(id,{resolve,reject,timer});this.send({id,method,params});});}
  receive(msg){
    if(msg.id!==undefined && !msg.method){const p=this.pending.get(msg.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);return;}
    if(msg.id!==undefined && msg.method){
      // The model plans only. It cannot execute shell/file tools or bypass the application's move checks.
      if(msg.method.includes('requestApproval'))this.send({id:msg.id,result:{decision:'decline'}});
      else this.send({id:msg.id,error:{code:-32601,message:'LazyFile only supports structured planning. Return your answer without tools.'}});
      return;
    }
    const p=msg.params||{};const run=this.runs.get(p.threadId);
    if(msg.method==='item/agentMessage/delta' && run){run.delta+=p.delta;run.onDelta?.(p.delta);}
    if(msg.method==='item/completed'&&run&&p.item?.type==='agentMessage'){run.final=p.item.text;}
    if(msg.method==='turn/started'&&run)run.turnId=p.turn.id;
    if(msg.method==='turn/completed'&&run){this.runs.delete(p.threadId);clearTimeout(run.timer);if(p.turn.status==='completed')run.resolve(run.final||run.delta);else run.reject(new Error(p.turn.error?.message||`Turn ${p.turn.status}`));}
    this.emit('event',msg);
  }
  fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();for(const r of this.runs.values()){clearTimeout(r.timer);r.reject(e);}this.runs.clear();}
  async account(){await this.start();return this.request('account/read',{refreshToken:false});}
  async models(){await this.start();return this.request('model/list',{limit:100});}
  async login(){await this.start();return this.request('account/login/start',{type:'chatgpt'});}
  async run({prompt,instructions,model,images=[],schema,onDelta}){
    await this.start();
    const {thread}=await this.request('thread/start',{cwd:this.cwd,model:model||undefined,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',environments:[],baseInstructions:instructions,config:{'web_search':'disabled','features.shell_tool':false,'features.apps':false}});
    const result=new Promise((resolve,reject)=>{const run={resolve,reject,onDelta,delta:'',final:'',turnId:null};run.timer=setTimeout(()=>{this.runs.delete(thread.id);if(run.turnId)this.request('turn/interrupt',{threadId:thread.id,turnId:run.turnId}).catch(()=>{});reject(new Error('AI request timed out. Retry or choose a different model.'));},180000);this.runs.set(thread.id,run);});
    try {await this.request('turn/start',{threadId:thread.id,input:[{type:'text',text:prompt,text_elements:[]},...images.map(p=>({type:'localImage',path:p}))],outputSchema:schema});}
    catch(e){const run=this.runs.get(thread.id);if(run){clearTimeout(run.timer);this.runs.delete(thread.id);run.reject(e);}}
    const text=await result;if(!schema)return text;
    try{return JSON.parse(text);}catch{throw new Error('AI returned an invalid result. No file operation was performed.');}
  }
  async cancel(){for(const [threadId,r]of this.runs)if(r.turnId)await this.request('turn/interrupt',{threadId,turnId:r.turnId});}
  close(){this.child?.kill();this.ready=null;}
}
