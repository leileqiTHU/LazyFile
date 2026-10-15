import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {Codex,codexEnvironment} from '../electron/codex.mjs';

test('private Codex environment excludes inherited account, endpoint and host routing',()=>{
 const source={CODEX_HOME:'existing',CODEX_API_KEY:'secret',OPENAI_API_KEY:'secret',OPENAI_BASE_URL:'https://example.invalid',codex_thread_id:'host',NODE_OPTIONS:'--require host.js',ELECTRON_RUN_AS_NODE:'1',PATH:'tools',HTTPS_PROXY:'proxy'};
 const env=codexEnvironment('private',source);
 assert.deepEqual(env,{CODEX_HOME:'private',PATH:'tools',HTTPS_PROXY:'proxy'});
 assert.equal(source.CODEX_HOME,'existing');
});
test('default Codex home belongs to its own workspace, never the host environment',()=>{
 const c=new Codex({cwd:'test-workspace'});
 assert.equal(c.home,path.join('test-workspace','CodexHome'));
 assert.equal(new Codex({cwd:'test-workspace',home:'private'}).home,'private');
});
