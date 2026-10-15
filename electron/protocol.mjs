import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {getEncoding} from 'js-tiktoken';
import {opaque,protocolNames} from './access.mjs';

const tokenizer=getEncoding('o200k_base');
export const tokens=text=>tokenizer.encode(text,[],[]).length;
// Retain complete paragraphs/sentences. Never cut token bytes or split a filename.
export function compress(text,max,fallback){
  if(typeof text!=='string'||text.length>200000)throw new Error('Invalid directory description.');
  if(text.length<max*8&&tokens(text)<=max)return text;
  const selected=[];let count=0;const cache=new Map();
  for(const paragraph of text.split(/\n|(?<=[。！？.!?])\s+/)){
    if(!paragraph.trim()||paragraph.length>max*8)continue;
    let n=cache.get(paragraph);if(n===undefined){n=tokens(paragraph+'\n');cache.set(paragraph,n);}
    if(count+n<=max){selected.push(paragraph);count+=n;}if(count>=max-8)break;
  }
  while(selected.length&&tokens(selected.join('\n')+'\n')>max)selected.pop();
  return selected.length?selected.join('\n')+'\n':fallback;
}
export class Protocol {
  constructor(store,access){this.store=store;this.access=access;this.tail=Promise.resolve();}
  sync(){const next=this.tail.catch(()=>{}).then(()=>this.refresh());this.tail=next;return next;}
  async write(dir,overview,intro){
    await this.access.check(dir,{write:true,directory:true});
    const values={'.overview.md':compress(overview,200,'Contents are listed in .intro.md.\n'),'.intro.md':compress(intro,2000,'Browse the directory to inspect its current contents.\n')};
    for(const [name,text]of Object.entries(values)){
      const file=path.join(dir,name);try{const st=await fs.lstat(file);if(st.isSymbolicLink()||!st.isFile()||st.nlink>1)throw new Error('Unsafe directory description file.');if(await fs.readFile(file,'utf8')===text)continue;}catch(e){if(e.code!=='ENOENT')throw e;}
      await this.access.check(dir,{write:true,directory:true});
      const temp=path.join(dir,'.lazyfile-'+randomUUID()+'.tmp');await fs.writeFile(temp,text,{flag:'wx'});try{await fs.rename(temp,file);}finally{await fs.unlink(temp).catch(()=>{});}
    }
    return {path:dir,overviewTokens:tokens(values['.overview.md']),introTokens:tokens(values['.intro.md'])};
  }
  async refresh(){
    const root=this.store.data.settings.workspaceRoot;const failures=[];if(!root)return;
    const zh=this.store.data.settings.language==='zh';
    const walk=async dir=>{
      try{
        await this.access.check(dir,{write:true,directory:true});
        const entries=(await fs.readdir(dir,{withFileTypes:true})).filter(e=>!e.isSymbolicLink()&&!protocolNames.has(e.name)&&!e.name.startsWith('.lazyfile-')).sort((a,b)=>a.name.localeCompare(b.name));
        const folders=entries.filter(e=>e.isDirectory()),files=entries.filter(e=>e.isFile());const childInfo=[];
        for(const e of folders){const p=path.join(dir,e.name);const whole=await opaque(p);if(!whole)await walk(p);childInfo.push({name:e.name,whole});}
        const count=zh?`${folders.length} 个子文件夹，${files.length} 个文件。`:`${folders.length} folders and ${files.length} files.`;
        const topics=[...new Set(this.store.data.files.filter(f=>path.dirname(f.path)===dir&&f.topic).map(f=>f.topic))].slice(0,8);
        const overview=(zh?'本目录包含':'This directory contains ')+count+'\n'+(topics.length?(zh?'内容主题：':'Topics: ')+topics.join('、')+'\n':'')+childInfo.slice(0,6).map(e=>e.name+'/').join(' · ');
        const lines=[zh?'# 目录导航':'# Directory guide',count];
        for(const e of childInfo)lines.push(`- ${JSON.stringify(e.name+'/')}${e.whole?(zh?'：整体项目或软件包，保持内部结构。':': intact project or package.'):''}`);
        const ordered=files.map(e=>({e,f:this.store.data.files.find(f=>f.path===path.join(dir,e.name))})).sort((a,b)=>Number(!!b.f?.summary)-Number(!!a.f?.summary));
        for(const {e,f}of ordered)lines.push(`- ${JSON.stringify(e.name)}${f?.summary?': '+f.summary:''}`);
        lines.push(zh?'未列出的条目可通过浏览目录查看。':'Browse this directory for any omitted entries.');
        const signature=createHash('sha256').update(JSON.stringify([overview,lines])).digest('hex');
        this.store.data.protocolSignatures||={};let current=this.store.data.protocolSignatures[dir]===signature;
        if(current)for(const name of protocolNames)try{const c=await this.access.check(path.join(dir,name));if(!c.stat.isFile()||c.stat.size>64000||c.stat.nlink>1){current=false;continue;}const text=await fs.readFile(path.join(dir,name),'utf8');if(tokens(text)>(name==='.overview.md'?200:2000))current=false;}catch{current=false;}
        if(!current){await this.write(dir,overview,lines.join('\n')+'\n');this.store.data.protocolSignatures[dir]=signature;}
      }catch(e){failures.push({path:dir,error:e.message});}
    };
    await walk(root);this.store.data.protocol={failures,updatedAt:new Date().toISOString(),tokenizer:'o200k_base'};await this.store.save();return this.store.data.protocol;
  }
}
