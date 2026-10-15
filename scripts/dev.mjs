import { spawn } from 'node:child_process';
import electron from 'electron';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js','--host','127.0.0.1'], { stdio: 'inherit' });
for (let n=0;n<100;n++) { try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {} await new Promise(r=>setTimeout(r,200)); }
const env={...process.env, LAZYFILE_DEV_URL:'http://127.0.0.1:5173'}; delete env.ELECTRON_RUN_AS_NODE;
const app=spawn(electron,['.'],{stdio:'inherit',env});
app.on('exit',()=>{vite.kill();process.exit();});
process.on('SIGINT',()=>{app.kill();vite.kill();});
