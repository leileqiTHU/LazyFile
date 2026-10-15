import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {within} from './access.mjs';

export class Store {
  constructor(dir) { this.dir=dir; this.file=path.join(dir,'library.json'); this.tail=Promise.resolve(); }
  async init() {
    await fs.mkdir(this.dir,{recursive:true});
    try { this.data=JSON.parse(await fs.readFile(this.file,'utf8')); }
    catch(e) { if(e.code!=='ENOENT') throw new Error('Library could not be read. Preserve library.json and restore its backup.');
      this.data={version:2,files:[],observationRoots:[],activity:[],messages:[],settings:{language:'zh',autoFile:true,workspaceRoot:'',model:'',codexPath:''}};
    }
    if(this.data.version!==2){
      await fs.writeFile(path.join(this.dir,'library-v1-backup-'+Date.now()+'.json'),JSON.stringify(this.data),{flag:'wx'});
      const w=this.data.settings.archiveRoot||'';this.data.settings.workspaceRoot=w;
      this.data.observationRoots=(this.data.roots||[]).filter(r=>!w||(!within(w,r)&&!within(r,w)));
      this.data.files=this.data.files.filter(f=>(w&&within(w,f.path))||this.data.observationRoots.some(r=>within(r,f.path)));
      this.data.messages=[];delete this.data.roots;delete this.data.settings.archiveRoot;this.data.version=2;
      this.data.migrationNotice='v1';await this.save();
    }
    return this;
  }
  save() {
    const snapshot=JSON.stringify(this.data);
    this.tail=this.tail.catch(()=>{}).then(async()=>{const temp=this.file+'.tmp'; await fs.writeFile(temp,snapshot); await fs.rename(temp,this.file);});
    return this.tail;
  }
  log(type,details) { const item={id:randomUUID(),type,at:new Date().toISOString(),...details}; this.data.activity.unshift(item); return item; }
  public() { return {...this.data, files:this.data.files.map(({text,...f})=>f)}; }
}
