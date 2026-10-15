const path=require('node:path');
const fs=require('node:fs');
const runtime=process.env.DIGUP_RUNTIME_DIR||(process.platform==='win32'?'D:/Apps/LazyFileRuntime/DigUp/helper':'/Applications/DigUp.app/Contents/Helpers');
module.exports={
 appId:'app.lazyfile.desktop',productName:'LazyFile',directories:{output:'release-v0.2'},
 files:['dist/**/*','electron/**/*','package.json','LICENSE','THIRD-PARTY-NOTICES.md','licenses/**/*'],
 extraResources:fs.existsSync(runtime)?[{from:runtime,to:'digup',filter:['**/*']},...(fs.existsSync(path.join(runtime,'../THIRD-PARTY-NOTICES.txt'))?[{from:path.join(runtime,'../THIRD-PARTY-NOTICES.txt'),to:'digup/THIRD-PARTY-NOTICES.txt'}]:[])]:[],
 asar:true,icon:'build/icon.png',win:{target:'nsis',icon:'build/icon.ico',signExecutable:false},nsis:{oneClick:false,allowToChangeInstallationDirectory:true},
 mac:{target:'dmg',category:'public.app-category.productivity'},
};
