import { Codex } from '../electron/codex.mjs';
const c=new Codex({cwd:'D:/Caches/LazyFile/probe'});
try {const r=await c.run({instructions:'Return the requested JSON. Do not use tools.',prompt:'Return an object with ok set to true.',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false}});if(r.ok!==true)throw new Error('Unexpected response');console.log('Codex OAuth inference verified.');}catch(e){console.error(e.message);process.exitCode=1;}finally{c.close();}
