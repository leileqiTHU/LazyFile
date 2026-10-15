const { contextBridge, ipcRenderer, webUtils } = require('electron');
const calls=['state','importFolder','importFiles','settings','chooseWorkspace','removeObservation','browse','repairDescriptions','chooseCodex','chooseDigup','connect','login','models','search','open','reveal','preview','chat','analyze','undo','cancel','reindex','engineStatus','downloadModels','completeSetup','window'];
const api={platform:process.platform};
for(const method of calls)api[method]=(...args)=>ipcRenderer.invoke('lazyfile:'+method,...args);
api.importDropped=files=>ipcRenderer.invoke('lazyfile:importDropped',Array.from(files).map(f=>webUtils.getPathForFile(f)));
api.on=(event,fn)=>{if(!['state','search-open','engine','account','agent-step','busy'].includes(event))return ()=>{};const listener=(_,data)=>fn(data);ipcRenderer.on('lazyfile:'+event,listener);return ()=>ipcRenderer.removeListener('lazyfile:'+event,listener);};
contextBridge.exposeInMainWorld('lazyfile',api);
