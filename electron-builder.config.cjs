const path=require('node:path');
const fs=require('node:fs');
const runtime=process.env.DIGUP_RUNTIME_DIR||(process.platform==='win32'?'D:/Apps/LazyFileRuntime/DigUp/helper':'/Applications/DigUp.app/Contents/Helpers');
const codex=process.env.CODEX_RUNTIME_DIR||'D:/Apps/LazyFileRuntime/Codex/package/vendor/x86_64-pc-windows-msvc';
for(const file of [path.join(runtime,process.platform==='win32'?'digup.exe':'digup'),path.join(codex,'bin',process.platform==='win32'?'codex.exe':'codex')])if(!fs.existsSync(file))throw new Error(`Required runtime missing: ${file}. See docs/development.md.`);
module.exports={
 appId:'app.lazyfile.desktop',productName:'LazyFile',directories:{output:'release-v0.3'},
 files:['dist/**/*','electron/**/*','package.json','LICENSE','THIRD-PARTY-NOTICES.md','licenses/**/*'],
 extraResources:[{from:runtime,to:'digup',filter:['**/*']},{from:path.join(runtime,'../THIRD-PARTY-NOTICES.txt'),to:'digup/THIRD-PARTY-NOTICES.txt'},{from:codex,to:'codex',filter:['**/*']}],
 asar:true,icon:'build/icon.png',win:{target:[{target:'nsis',arch:['x64']}],icon:'build/icon.ico',signExecutable:false},nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,runAfterFinish:true,createDesktopShortcut:true,installerLanguages:['en_US','zh_CN'],artifactName:'LazyFile-${version}-windows-x64-setup.${ext}'},
 mac:{target:'dmg',category:'public.app-category.productivity'},
};
