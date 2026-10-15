import {useState} from 'react';
import {Search,FolderPlus,Sparkles,Check,Loader2,ArrowRight} from 'lucide-react';
import type {API,State} from './types';

const en={title:'Find your first file.',intro:'A few small steps, then your files are within reach.',language:'Language',search:'Prepare local search',download:'The search model downloads automatically (865 MB, once). Keep LazyFile open. Interrupted downloads can resume.',ready:'Local search is ready',preparing:'Preparing local search…',start:'Prepare search',retry:'Retry download',folders:'Choose what to search',folderHelp:'Add read-only observation folders. A workspace is optional, for files you want LazyFile to receive and organize.',observe:'Add observation folder',workspace:'Choose workspace',selected:'authorized folders',ai:'Connect the assistant · optional',aiHelp:'Local search needs no account. The assistant engine is included. Sign in separately in LazyFile; your existing Codex settings and login stay unchanged. For AI help, relevant file content is sent to OpenAI. Your plan limits apply.',login:'Sign in with ChatGPT',check:'Check connection',connected:'ChatGPT connected',finish:'Start searching',later:'Set up later',waiting:'Choose a folder and wait for the model to finish.',failed:'Setup needs attention',working:'First indexing may take a while. Exact matches appear first; semantic results fill in as indexing completes.'};
const zh:Record<keyof typeof en,string>={title:'找到你的第一个文件。',intro:'完成几个简单步骤，让文件触手可及。',language:'语言',search:'准备本地搜索',download:'搜索模型会自动下载（约 865 MB，仅需一次）。请保持应用打开，下载中断后可继续。',ready:'本地搜索已就绪',preparing:'正在准备本地搜索…',start:'准备搜索',retry:'重试下载',folders:'选择搜索范围',folderHelp:'添加仅观察文件夹，原文件保持只读。需要接收和整理文件时，可另外选择工作空间。',observe:'添加仅观察文件夹',workspace:'选择工作空间',selected:'个授权文件夹',ai:'连接智能助手 · 可选',aiHelp:'本地搜索无需账户。已内置助手引擎；请在 LazyFile 内单独登录 ChatGPT，原有 Codex 配置和登录不受影响。使用 AI 时，相关文件内容会发送给 OpenAI，并受账户额度限制。',login:'使用 ChatGPT 登录',check:'检查连接',connected:'ChatGPT 已连接',finish:'开始查找',later:'稍后设置',waiting:'请选择一个文件夹，并等待模型准备完成。',failed:'设置需要处理',working:'首次索引可能需要一些时间。关键词结果先出现，语义结果会随索引完成逐步补齐。'};

export function Onboarding({state,api,account,connect,close}:{state:State;api:API;account:string;connect:()=>Promise<unknown>;close:()=>void}){
 const t=state.settings.language==='zh'?zh:en;
 const [error,setError]=useState(''),[working,setWorking]=useState(false);
 const roots=[state.settings.workspaceRoot,...state.observationRoots].filter(Boolean);
 const ready=state.engine.modelsReady&&state.engine.available&&roots.length>0;
 async function run(fn:()=>Promise<unknown>){setError('');setWorking(true);try{await fn();}catch(e){setError((e as Error).message);}finally{setWorking(false);}}
 return <div className="setup-backdrop"><section className="setup-card" role="dialog" aria-modal="true" aria-labelledby="setup-title">
  <header><span className="eyebrow">WELCOME TO LAZYFILE</span><select aria-label={t.language} value={state.settings.language} onChange={e=>run(()=>api.settings({language:e.target.value as 'en'|'zh'}))}><option value="en">English</option><option value="zh">简体中文</option></select></header>
  <h1 id="setup-title">{t.title}</h1><p>{t.intro}</p>
  <div className="setup-step"><Search size={22}/><div><h3>1. {t.search}</h3><p>{t.download}</p>
   {state.engine.modelsReady?<strong className="setup-ready"><Check size={16}/>{t.ready}</strong>:<>
    {state.engine.downloading?<><span className="setup-ready"><Loader2 size={15} className="spin"/>{t.preparing} {state.engine.downloadPercent||0}%</span><progress aria-label={t.search} max="100" value={state.engine.downloadPercent||0}/></>:<button disabled={working} onClick={()=>run(()=>api.downloadModels())}>{state.engine.downloadError?t.retry:t.start}</button>}
    {state.engine.downloadError&&<p role="alert" className="inline-error">{t.failed}: {state.engine.downloadError}</p>}
   </>}
  </div></div>
  <div className="setup-step"><FolderPlus size={22}/><div><h3>2. {t.folders}</h3><p>{t.folderHelp}</p><div className="setup-actions"><button disabled={working} onClick={()=>run(()=>api.importFolder())}>{t.observe}</button><button disabled={working} onClick={()=>run(()=>api.chooseWorkspace())}>{t.workspace}</button></div>{roots.length>0&&<small>{roots.length} {t.selected}</small>}{roots.map(root=><div className="setup-path" key={root}>{root}</div>)}</div></div>
  <div className="setup-step"><Sparkles size={22}/><div><h3>3. {t.ai}</h3><p>{t.aiHelp}</p>{account?<strong className="setup-ready"><Check size={16}/>{t.connected}</strong>:<div className="setup-actions"><button disabled={working} onClick={()=>run(()=>api.login())}>{t.login}</button><button disabled={working} onClick={()=>run(connect)}>{t.check}</button></div>}</div></div>
  {error&&<p role="alert" className="inline-error">{error}</p>}
  <footer><p>{ready?t.working:t.waiting}</p><div className="setup-actions"><button onClick={close}>{t.later}</button><button className="primary" disabled={!ready||working} onClick={()=>run(async()=>{await api.completeSetup();close();})}>{t.finish}<ArrowRight size={15}/></button></div></footer>
 </section></div>;
}
