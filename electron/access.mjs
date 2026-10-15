import fs from 'node:fs/promises';
import path from 'node:path';

export function within(root,target){const rel=path.relative(root,target);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
export const protocolNames=new Set(['.overview.md','.intro.md']);
export async function opaque(dir){
  if(['node_modules','.git','.hg','.svn','.venv','venv'].includes(path.basename(dir)))return true;
  if(/\.(app|bundle|framework|photoslibrary)$/i.test(dir))return true;
  for(const name of ['.git','.hg','.svn','package.json','Cargo.toml','pyproject.toml'])try{await fs.lstat(path.join(dir,name));return true;}catch{}
  return false;
}
// Reject links in every component, including configured roots. Canonical spelling is retained.
export async function canonical(input){
  if(typeof input!=='string'||!path.isAbsolute(input)||input.includes('\0'))throw new Error('An absolute authorized path is required.');
  const resolved=path.resolve(input);let cursor=path.parse(resolved).root;
  for(const part of resolved.slice(cursor.length).split(path.sep).filter(Boolean)){
    if(part.includes(':'))throw new Error('Alternate streams are not allowed.');
    cursor=path.join(cursor,part);if((await fs.lstat(cursor)).isSymbolicLink())throw new Error('Symbolic links are not allowed.');
  }
  return fs.realpath(resolved);
}
export class Access {
  constructor(store){this.store=store;}
  roots(){return [this.store.data.settings.workspaceRoot,...this.store.data.observationRoots].filter(Boolean);}
  source(p){const w=this.store.data.settings.workspaceRoot;return w&&within(w,p)?'workspace':this.store.data.observationRoots.some(r=>within(r,p))?'observation':null;}
  async check(input,{write=false,directory=false,ordinary=false}={}){
    // Check lexical scope before any filesystem read, then revalidate canonical scope.
    if(!this.source(path.resolve(String(input))))throw new Error('Path is outside authorized folders.');
    const real=await canonical(input);const source=this.source(real);
    if(!source||(write&&source!=='workspace'))throw new Error('Observation folders are read-only.');
    for(const root of this.roots().filter(r=>within(r,real)))await canonical(root);
    const st=await fs.lstat(real);if(directory&&!st.isDirectory())throw new Error('A directory is required.');
    if(write||ordinary){const w=this.store.data.settings.workspaceRoot;if(w&&within(w,real)){let p=st.isDirectory()?real:path.dirname(real);while(within(w,p)){if(await opaque(p))throw new Error('Opaque projects and packages must remain intact.');if(p===w)break;p=path.dirname(p);}}}
    if(write&&!st.isDirectory()&&protocolNames.has(path.basename(real)))throw new Error('Use the directory protocol tool.');
    return {path:real,source,stat:st};
  }
  async scope(scope='global',folder=''){
    if(!['global','workspace','folder'].includes(scope))throw new Error('Invalid search scope.');
    const roots=scope==='global'?this.roots():scope==='workspace'?[this.store.data.settings.workspaceRoot].filter(Boolean):[folder];
    return Promise.all(roots.map(async r=>(await this.check(r,{directory:true})).path));
  }
  async configureWorkspace(input){
    const real=await canonical(input);if(!(await fs.stat(real)).isDirectory()||await opaque(real))throw new Error('Choose an ordinary workspace folder.');
    if(within(real,this.store.dir)||within(this.store.dir,real))throw new Error('Workspace and application data must be separate.');
    if(this.store.data.observationRoots.some(r=>within(r,real)||within(real,r)))throw new Error('Workspace and observation folders cannot overlap.');
    this.store.data.settings.workspaceRoot=real;await this.store.save();return real;
  }
  async observe(input){
    const real=await canonical(input);if(!(await fs.stat(real)).isDirectory())throw new Error('Choose a folder.');
    const w=this.store.data.settings.workspaceRoot;
    if((w&&(within(real,w)||within(w,real)))||within(real,this.store.dir)||within(this.store.dir,real))throw new Error('Observation folders cannot overlap workspace or application data.');
    if(!this.store.data.observationRoots.some(r=>within(r,real))){this.store.data.observationRoots=this.store.data.observationRoots.filter(r=>!within(real,r));this.store.data.observationRoots.push(real);}
    await this.store.save();return real;
  }
}
