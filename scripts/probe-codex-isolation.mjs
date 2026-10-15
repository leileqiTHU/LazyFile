import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Codex} from '../electron/codex.mjs';

const base=await fs.mkdtemp('D:/Caches/LazyFile/isolation-');
const foreign=path.join(base,'ExistingCodex');await fs.mkdir(foreign);
const config='this is intentionally invalid TOML: existing user configuration';
const auth='{"OPENAI_API_KEY":"sentinel-not-a-real-key"}';
await fs.writeFile(path.join(foreign,'config.toml'),config);await fs.writeFile(path.join(foreign,'auth.json'),auth);
const previous={CODEX_HOME:process.env.CODEX_HOME,OPENAI_API_KEY:process.env.OPENAI_API_KEY,OPENAI_BASE_URL:process.env.OPENAI_BASE_URL};
process.env.CODEX_HOME=foreign;process.env.OPENAI_API_KEY='sentinel';process.env.OPENAI_BASE_URL='https://example.invalid';
const c=new Codex({cwd:path.join(base,'AgentWorkspace'),home:path.join(base,'CodexHome'),executable:process.env.LAZYFILE_CODEX_TEST_EXECUTABLE});
try{
 assert.equal((await c.account()).account,null);
 assert.ok(c.child.spawnargs.includes('cli_auth_credentials_store="file"'));
 const login=await c.login();assert.ok(login.loginId);assert.equal(new URL(login.authUrl).protocol,'https:');
 await c.request('account/login/cancel',{loginId:login.loginId});
 await c.request('account/logout');
 assert.equal((await c.account()).account,null);
 assert.equal(await fs.readFile(path.join(foreign,'config.toml'),'utf8'),config);
 assert.equal(await fs.readFile(path.join(foreign,'auth.json'),'utf8'),auth);
 assert.deepEqual((await fs.readdir(foreign)).sort(),['auth.json','config.toml']);
 console.log(JSON.stringify({passed:true,base,signedOut:true,loginStartedAndCanceled:true,logoutIsolated:true,foreignProfileUnchanged:true}));
}finally{c.close();for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;}
