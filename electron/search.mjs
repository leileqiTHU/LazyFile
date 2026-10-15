import path from 'node:path';
import {createHash} from 'node:crypto';
import {DigUp} from './digup.mjs';
import {within,protocolNames} from './access.mjs';

// DigUp filters roots AFTER top-k. Dedicated scope indexes ensure scope is applied BEFORE ranking.
export class Search {
  constructor(store,access,options,factory=o=>new DigUp(o)){Object.assign(this,{store,access,options,factory});this.engines=new Map();}
  async engineFor(roots){
    const key=createHash('sha256').update(JSON.stringify([...roots].sort())).digest('hex').slice(0,24);
    let engine=this.engines.get(key);if(!engine){if(this.engines.size>=4){const [oldKey,old]=this.engines.entries().next().value;old.close();this.engines.delete(oldKey);}engine=this.factory({...this.options,directory:path.join(this.options.directory,key)});engine.roots=roots;this.engines.set(key,engine);await engine.index(roots);}
    return engine;
  }
  async search(query,meaning=true,{scope='global',folder='',limit=40}={}){
    if(typeof query!=='string'||query.length>2000||!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid search request.');
    const roots=await this.access.scope(scope,folder);const start=Date.now();const eligible=[];
    for(const f of this.store.data.files){if(f.status==='missing'||protocolNames.has(f.name)||!roots.some(r=>within(r,f.path)))continue;try{await this.access.check(f.path);eligible.push(f);}catch{}}
    const q=query.trim().toLowerCase();const exact=eligible.filter(f=>!q||`${f.name} ${f.summary} ${(f.tags||[]).join(' ')} ${f.text||''}`.toLowerCase().includes(q));
    let result={hits:[],meaning:false};let warning;
    if(q&&roots.length)try{const engine=await this.engineFor(roots);if(!await engine.available())throw new Error('Local semantic engine unavailable; showing keyword matches.');if(engine.state.indexing)warning='This scope is indexing; results may be incomplete.';result=await engine.search(q,meaning,limit);}catch(e){warning=e.message;}
    const key=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
    const found=[];for(const h of result.hits||[]){const f=eligible.find(f=>key(f.path)===key(h.path));if(f&&!found.some(x=>x.id===f.id))found.push({...f,score:h.cosine,excerpt:h.excerpt,matchReason:h.excerpt,loc:h.loc});}
    for(const f of exact)if(!found.some(x=>x.id===f.id))found.push(f);
    const files=[];for(const f of found.slice(0,limit)){try{const c=await this.access.check(f.path);if(!roots.some(r=>within(r,c.path)))continue;files.push({...f,text:undefined,source:c.source});}catch{}}
    return {files,meaning:result.meaning,warning:warning||result.warning,ms:Date.now()-start,scope,folder};
  }
  async refresh(){for(const e of this.engines.values()){if(e.roots.every(r=>this.access.source(r)))await e.index(e.roots);else{e.close();for(const[k,v]of this.engines)if(v===e)this.engines.delete(k);}}const roots=this.access.roots();if(roots.length)await this.engineFor(await this.access.scope('global'));}
  close(){for(const e of this.engines.values())e.close();this.engines.clear();}
}
