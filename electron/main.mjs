import { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, nativeImage, Menu } from 'electron';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { Codex } from './codex.mjs';
import { Intelligence } from './intelligence.mjs';
import { DigUp } from './digup.mjs';
import { ingest, undoMove, recoverMoves, within } from './files.mjs';
import chokidar from 'chokidar';
import {Access,protocolNames} from './access.mjs';
import {Protocol} from './protocol.mjs';
import {Workspace} from './workspace.mjs';
import {Search} from './search.mjs';
import {runtimePaths,dataDirectory} from './runtime.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const dataDir=dataDirectory({appData:app.getPath('appData')});await fs.mkdir(dataDir,{recursive:true});app.setPath('userData',dataDir);app.setPath('sessionData',path.join(dataDir,'Browser'));
if(!app.requestSingleInstanceLock())app.quit();
let win,store,codex,ai,engine,watcher,access,protocol,workspace,searchService;let importChain=Promise.resolve();let chatBusy=false;
const emit=(name,data)=>{if(win&&!win.isDestroyed())win.webContents.send('lazyfile:'+name,data);};
const safe=fn=>async(event,...args)=>{const url=event.senderFrame?.url||'';if(event.sender!==win?.webContents||!(url.startsWith('file://')||url.startsWith('http://127.0.0.1:5173/')))throw new Error('Invalid IPC sender');return fn(...args);};
const handle=(name,fn)=>ipcMain.handle('lazyfile:'+name,safe(fn));
const state=()=>({...store.public(),files:store.public().files.filter(f=>access.source(f.path)).map(f=>({...f,source:access.source(f.path)})),dataDir,engine:engine.state,platform:process.platform});
const notify=()=>emit('state',state());
const file=id=>{const f=store.data.files.find(x=>x.id===id);if(!f)throw new Error('Unknown file');return f;};
async function validFile(id){const f=file(id);const c=await access.check(f.path);if(!c.stat.isFile())throw new Error('Not a file.');return f;}
function roots(){return access.roots();}
let watchTimer;
async function watch(){clearTimeout(watchTimer);await watcher?.close();watcher=chokidar.watch(roots(),{ignoreInitial:true,followSymlinks:false,ignored:p=>within(dataDir,p)||protocolNames.has(path.basename(p))||path.basename(p).startsWith('.lazyfile-')||p.split(/[\\/]/).some(x=>['node_modules','.git'].includes(x)),awaitWriteFinish:{stabilityThreshold:1500}});watcher.on('all',()=>{clearTimeout(watchTimer);watchTimer=setTimeout(async()=>{try{if(ai.busy||chatBusy){watchTimer=setTimeout(()=>watcher?.emit('all','refresh',''),1800);return;}await workspace.refresh();await searchService.refresh();notify();}catch(e){emit('error',e.message);}},1800);});}
async function importPaths(paths,folder=false){
  if(!Array.isArray(paths)||paths.some(p=>typeof p!=='string'||!path.isAbsolute(p)))throw new Error('Invalid import');
  const task=async()=>{if(ai.busy||chatBusy)throw new Error('Wait for the current Agent task or stop it first.');
    const ids=folder?(await workspace.observe(paths),[]):await workspace.receive(paths);
    await store.save();notify();await searchService.refresh();await watch();
    if(ids.length&&!chatBusy)codex.account().then(a=>{if(a.account&&!chatBusy)ai.enqueue(ids);}).catch(()=>{});
    return ids;};
  importChain=importChain.catch(()=>{}).then(task);return importChain;
}
app.whenReady().then(async()=>{
store=await new Store(dataDir).init();access=new Access(store);protocol=new Protocol(store,access);workspace=new Workspace(store,access,protocol);await recoverMoves(store);await workspace.refresh();
const runtime=runtimePaths({packaged:app.isPackaged,resources:process.resourcesPath,dataDir,settings:store.data.settings});
// Existing installations keep their already downloaded models.
if(!store.data.settings.modelsPath&&!process.env.LAZYFILE_MODELS_PATH&&dataDir.replaceAll('\\','/').toLowerCase()==='d:/apps/lazyfile/data'&&existsSync('D:/Caches/LazyFile/Models/embeddinggemma-2-Q8_0.gguf'))runtime.models='D:/Caches/LazyFile/Models';
codex=new Codex({cwd:path.join(dataDir,'AgentWorkspace'),executable:runtime.codex});
engine=new DigUp({directory:path.join(dataDir,'SearchIndex'),executable:runtime.digup,models:runtime.models});
engine.roots=roots();engine.on('state',s=>emit('engine',s));codex.on('event',e=>{if(e.method==='account/login/completed'||e.method==='account/updated')emit('account',e.params);});
searchService=new Search(store,access,{directory:path.join(dataDir,'ScopedSearch'),executable:engine.executable,models:engine.models},o=>{const e=new DigUp(o);e.on('state',s=>{Object.assign(engine.state,s);emit('engine',engine.state);});return e;});
ai=new Intelligence(store,codex,(name,data)=>name==='state'?notify():emit(name,data),{workspace,search:searchService});
Menu.setApplicationMenu(process.platform==='darwin'?Menu.buildFromTemplate([{label:'LazyFile',submenu:[{role:'about'},{type:'separator'},{role:'quit'}]},{role:'editMenu'}]):null);
win=new BrowserWindow({width:1440,height:940,minWidth:1040,minHeight:700,show:false,backgroundColor:'#f8f9fc',title:'LazyFile',titleBarStyle:'hidden',...(process.platform!=='darwin'?{titleBarOverlay:{color:'#fafbfd',symbolColor:'#7a8293',height:46}}:{}),webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
win.once('ready-to-show',()=>win.show());
handle('state',()=>state());
handle('importFolder',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory','multiSelections']});return r.canceled?[]:importPaths(r.filePaths,true);});
async function chooseWorkspace(){if(ai.busy||chatBusy)throw new Error('Stop the current Agent task before changing permissions.');const r=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']});if(r.canceled)return false;await workspace.setWorkspace(r.filePaths[0]);searchService.close();await searchService.refresh();await watch();notify();return true;}
handle('importFiles',async()=>{if(!store.data.settings.workspaceRoot&&!await chooseWorkspace())return [];const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections']});return r.canceled?[]:importPaths(r.filePaths);});
handle('importDropped',async p=>{if(!store.data.settings.workspaceRoot&&!await chooseWorkspace())return [];return importPaths(p);});
handle('settings',async patch=>{const allowed={language:v=>['zh','en'].includes(v),autoFile:v=>typeof v==='boolean',model:v=>typeof v==='string'&&v.length<150};for(const[k,v]of Object.entries(patch||{})){if(!allowed[k]?.(v))throw new Error('Invalid setting');store.data.settings[k]=v;}await store.save();notify();return state();});
handle('chooseWorkspace',chooseWorkspace);
handle('removeObservation',async p=>{if(ai.busy||chatBusy)throw new Error('Stop the current Agent task before changing permissions.');await workspace.removeObservation(p);searchService.close();await searchService.refresh();await watch();notify();});
handle('browse',p=>workspace.browse(p));
handle('repairDescriptions',async()=>{if(ai.busy||chatBusy)throw new Error('Agent is busy.');store.data.protocolSignatures={};await protocol.sync();notify();});
handle('chooseCodex',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile']});if(!r.canceled){codex.close();store.data.settings.codexPath=r.filePaths[0];codex.executable=r.filePaths[0];await store.save();notify();}});
handle('chooseDigup',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile']});if(!r.canceled){engine.close();engine.child=null;engine.executable=r.filePaths[0];store.data.settings.digupPath=r.filePaths[0];searchService.close();searchService.options.executable=r.filePaths[0];await store.save();notify();}});
handle('connect',()=>codex.account());
handle('login',async()=>{const r=await codex.login();if(r.authUrl){const url=new URL(r.authUrl);if(url.protocol!=='https:'||!['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(url.hostname))throw new Error('Unexpected login host');await shell.openExternal(r.authUrl);}return {loginId:r.loginId};});
handle('models',()=>codex.models());
handle('search',(q,semantic=true,scope={})=>searchService.search(q,semantic,scope));
handle('engineStatus',async()=>roots().length?(await searchService.engineFor(roots())).status():engine.available().then(()=>engine.state));
async function prepareSearch(){await engine.downloadModels();await searchService.refresh();notify();}
handle('downloadModels',prepareSearch);
handle('completeSetup',async()=>{await engine.available();if(!engine.state.modelsReady||!roots().length)throw new Error('Finish model preparation and choose a folder first.');store.data.settings.setupComplete=true;await store.save();notify();});
handle('reindex',async()=>{if(ai.busy||chatBusy)throw new Error('Agent is busy.');await workspace.refresh();await searchService.refresh();notify();});
handle('analyze',async ids=>{if(chatBusy)throw new Error('A conversation is running. Finish or stop it first.');if(!Array.isArray(ids)||ids.length>5000||ids.some(id=>!store.data.files.some(f=>f.id===id)))throw new Error('Invalid file selection');ai.enqueue(ids);return true;});
handle('chat',async(text,id)=>{if(ai.busy||chatBusy)throw new Error('AI is already working. Finish or pause it first.');chatBusy=true;try{const r=await ai.chat(text,id);await workspace.refresh();await searchService.refresh();notify();return r;}finally{chatBusy=false;}});
handle('cancel',()=>ai.cancel());
handle('undo',async id=>{if(ai.busy||chatBusy)throw new Error('Agent is busy.');await workspace.undo(id);await searchService.refresh();notify();});
handle('open',async id=>{const f=await validFile(id);if(/\.(exe|com|bat|cmd|ps1|sh|msi|app|lnk|url|scr|vbs|js)$/i.test(f.path))throw new Error('Executable files can be revealed, not launched from LazyFile.');const error=await shell.openPath(f.path);if(error)throw new Error(error);});
handle('reveal',async id=>shell.showItemInFolder((await validFile(id)).path));
handle('preview',async(id,loc)=>{const f=await validFile(id);if(f.kind==='image'&&f.size<25*1024*1024){const img=nativeImage.createFromPath(f.path);if(!img.isEmpty())return {image:img.resize({width:900}).toDataURL()};}
  if((f.ext==='PDF'||f.kind==='video')&&await engine.available()){await engine.start(roots());const r=await engine.ask('render',{path:f.path,kind:f.ext==='PDF'?'pdf':'video',loc:Number.isFinite(loc)?Math.max(0,loc):f.ext==='PDF'?1:0,pixels:1000});if(r.image&&within(engine.directory,r.image)){const bytes=await fs.readFile(r.image);return {image:'data:image/jpeg;base64,'+bytes.toString('base64')};}}
  return {text:f.text?.slice(0,16000)||f.summary||'',extraction:f.extraction};});
handle('window',action=>{if(action==='minimize')win.minimize();if(action==='close')win.close();});
if(process.env.LAZYFILE_DEV_URL)await win.loadURL(process.env.LAZYFILE_DEV_URL);else await win.loadFile(path.join(here,'../dist/index.html'));
const shortcutOk=globalShortcut.register('CommandOrControl+Shift+Space',()=>{win.show();win.focus();emit('search-open',true);});engine.state.shortcut=shortcutOk;
app.on('second-instance',()=>{win.show();win.focus();});
app.on('window-all-closed',()=>app.quit());app.on('will-quit',()=>{globalShortcut.unregisterAll();clearTimeout(watchTimer);codex.close();engine.close();searchService.close();watcher?.close();});
await engine.available();await watch();if(roots().length)await searchService.engineFor(roots());notify();
if((app.isPackaged||process.env.LAZYFILE_AUTO_SETUP==='1')&&!engine.state.modelsReady)prepareSearch().catch(e=>{engine.state.downloadError=e.message;emit('engine',engine.state);});
}).catch(error=>{console.error(error);dialog.showErrorBox('LazyFile could not start',error.message);app.quit();});
