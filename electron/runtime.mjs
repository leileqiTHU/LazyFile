import path from 'node:path';
import {existsSync} from 'node:fs';

// Packaged applications never depend on the developer's machine or PATH.
export function runtimePaths({packaged,resources,dataDir,settings={},env=process.env,platform=process.platform}){
 const bundled=name=>path.join(resources,name,platform==='win32'?`${name}.exe`:name);
 return {
  digup:settings.digupPath||env.LAZYFILE_DIGUP_PATH||(packaged?bundled('digup'):platform==='win32'?'D:/Apps/LazyFileRuntime/DigUp/helper/digup.exe':'/Applications/DigUp.app/Contents/Helpers/digup'),
  codex:settings.codexPath||(packaged?path.join(resources,'codex','bin',platform==='win32'?'codex.exe':'codex'):''),
  models:settings.modelsPath||env.LAZYFILE_MODELS_PATH||path.join(dataDir,'Models'),
 };
}

export function dataDirectory({appData,env=process.env,platform=process.platform,exists=existsSync}){
 if(env.LAZYFILE_DATA_DIR)return env.LAZYFILE_DATA_DIR;
 const legacy='D:/Apps/LazyFile/Data';
 // Preserve existing libraries, but give new installations per-user storage.
 if(platform==='win32'&&exists(path.join(legacy,'library.json')))return legacy;
 return path.join(appData,'LazyFile');
}
