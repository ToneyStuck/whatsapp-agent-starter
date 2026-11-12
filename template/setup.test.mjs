import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import http from 'node:http';

const here = fileURLToPath(new URL('.', import.meta.url));
const wizard = ['setup.mjs', '../setup.mjs'].map((p) => path.resolve(here, p)).find(fs.existsSync);
assert.ok(wizard, 'setup.mjs not found in template or copied test layout');
const managed = ['NINEROUTER_URL','NINEROUTER_API_KEY','NINEROUTER_MODEL','OWNER_NUMBER','OWNER_LID','TZ','AGENT_NAME','CHAT_MODE','AUTH_FOLDER'];
function fixture(extra = {}) {
  const env = { ...process.env };
  for (const key of managed) delete env[key];
  return { ...env, NINEROUTER_URL:'http://127.0.0.1:20128', NINEROUTER_API_KEY:'none', NINEROUTER_MODEL:'wa-combo', OWNER_NUMBER:'62812345678', OWNER_LID:'00123', TZ:'UTC', AGENT_NAME:'x', CHAT_MODE:'owner_only', AUTH_FOLDER:'auth_info_baileys', ...extra };
}
function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'wa-agent-')); }
function run(dir, args, env = fixture()) { return spawnSync(process.execPath, [wizard, ...args], { cwd:dir, env, encoding:'utf8' }); }
test('international phone separators; LID leading zero; token mask; dotenv round trip', () => {
  const dir=temp();
  try {
    const secret="'hash#\\slash\\n token";
    const out=run(dir,['--from-env'],fixture({OWNER_NUMBER:'+62 (812).345-678', OWNER_LID:'00123', AGENT_NAME:"x'#\\y", NINEROUTER_API_KEY:secret}));
    assert.equal(out.status,0,out.stderr);
    assert.equal(out.stdout.includes(secret),false);
    assert.match(fs.readFileSync(path.join(dir,'.env'),'utf8'),/^OWNER_NUMBER=62812345678$/m);
    assert.match(fs.readFileSync(path.join(dir,'.env'),'utf8'),/^OWNER_LID=00123$/m);
    const check=run(dir,['--check']); assert.equal(check.status,0,check.stdout);
    const childEnv={...process.env}; for(const key of managed) delete childEnv[key];
    const parsed=spawnSync(process.execPath,['--env-file=.env','-e',"process.stdout.write(JSON.stringify([process.env.AGENT_NAME,process.env.NINEROUTER_API_KEY]))"],{cwd:dir,env:childEnv,encoding:'utf8'});
    assert.equal(parsed.status,0,parsed.stderr);
    assert.deepEqual(JSON.parse(parsed.stdout),["x'#\\y",secret]);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('check rejects missing/invalid required values and hides unknown keys; native parser stays lenient', () => {
  const dir=temp();
  try {
    assert.equal(run(dir,['--check']).status,2);
    const env=fixture({AGENT_NAME:'bad\nname',NINEROUTER_API_KEY:'sensitive-secret'});
    let out=run(dir,['--from-env'],env); assert.notEqual(out.status,0); assert.equal(fs.existsSync(path.join(dir,'.env')),false);
    fs.writeFileSync(path.join(dir,'.env'),'OWNER_NUMBER=local\nUNKNOWN_SECRET=never-print\n');
    out=run(dir,['--check']); assert.equal(out.status,2); assert.equal(out.stdout.includes('never-print'),false); assert.equal(out.stderr.includes('never-print'),false);
    fs.writeFileSync(path.join(dir,'.env'),'BADLINE\n');
    out=run(dir,['--check']); assert.equal(out.status,2);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('--from-env rejects invalid existing values without changing file', () => {
  const dir=temp();
  try {
    const file=path.join(dir,'.env'); fs.writeFileSync(file,'OWNER_NUMBER=0812345678\nAGENT_NAME=x\n'); const before=fs.readFileSync(file);
    const bare={...process.env}; for (const key of managed) delete bare[key];
    const out=run(dir,['--from-env'],bare); assert.notEqual(out.status,0); assert.deepEqual(fs.readFileSync(file),before);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('help does not read local .env', () => {
  const dir=temp();
  try {
    fs.mkdirSync(path.join(dir,'.env'));
    const out=run(dir,['--help']); assert.equal(out.status,0,out.stderr);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('non-TTY interactive mode fails safely', () => {
  const dir=temp(); try { const out=run(dir,[]); assert.notEqual(out.status,0); assert.match(out.stderr,/needs a terminal/); } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('copied test layout finds root setup.mjs', () => {
  const dir=temp();
  try {
    fs.mkdirSync(path.join(dir,'test'));
    fs.copyFileSync(wizard,path.join(dir,'setup.mjs'));
    fs.copyFileSync(fileURLToPath(import.meta.url),path.join(dir,'test','setup.test.mjs'));
    const out=spawnSync(process.execPath,['--test','--test-name-pattern=non-TTY interactive','test/setup.test.mjs'],{cwd:dir,env:fixture(),encoding:'utf8',timeout:30000});
    assert.equal(out.status,0,out.stdout+'\\n'+out.stderr);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('--from-env rejects local OWNER_NUMBER and LID separators; keeps leading zero', () => {
  const dir=temp();
  try {
    let out=run(dir,['--from-env'],fixture({OWNER_NUMBER:'0812345678'})); assert.notEqual(out.status,0); assert.equal(fs.existsSync(path.join(dir,'.env')),false);
    out=run(dir,['--from-env'],fixture({OWNER_LID:'12-34'})); assert.notEqual(out.status,0); assert.equal(fs.existsSync(path.join(dir,'.env')),false);
    out=run(dir,['--from-env'],fixture({OWNER_LID:'00123'})); assert.equal(out.status,0,out.stderr);
    assert.match(fs.readFileSync(path.join(dir,'.env'),'utf8'),/^OWNER_LID=00123$/m);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('--from-env rejects control chars in token/model/URL/phone before normalize', () => {
  const dir=temp();
  try {
    for (const extra of [{NINEROUTER_API_KEY:'tok\u0007en'},{NINEROUTER_MODEL:'mod\u0007el'},{NINEROUTER_URL:'http://127.0.0.1:20128\u0007'},{OWNER_NUMBER:'62812\u0007345678'}]) {
      const out=run(dir,['--from-env'],fixture(extra)); assert.notEqual(out.status,0,JSON.stringify(extra)); assert.equal(fs.existsSync(path.join(dir,'.env')),false);
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('--from-env rejects credential URL and /prefix/v1 path', () => {
  const dir=temp();
  try {
    for (const url of ['http://user:pass@127.0.0.1:20128','http://127.0.0.1:20128/prefix/v1']) {
      const out=run(dir,['--from-env'],fixture({NINEROUTER_URL:url})); assert.notEqual(out.status,0,url); assert.equal(fs.existsSync(path.join(dir,'.env')),false);
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('short secret token is fully masked, never printed', () => {
  const dir=temp();
  try {
    const out=run(dir,['--from-env'],fixture({NINEROUTER_API_KEY:'abc'})); assert.equal(out.status,0,out.stderr);
    assert.equal(out.stdout.includes('abc'),false);
    assert.match(out.stdout,/NINEROUTER_API_KEY=\*{3}/);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('AGENT_NAME whitespace-only is invalid', () => {
  const dir=temp();
  try {
    const out=run(dir,['--from-env'],fixture({AGENT_NAME:'   '})); assert.notEqual(out.status,0); assert.equal(fs.existsSync(path.join(dir,'.env')),false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('valid baseline then invalid update leaves file byte-identical', () => {
  const dir=temp();
  try {
    const ok=run(dir,['--from-env'],fixture()); assert.equal(ok.status,0,ok.stderr);
    const file=path.join(dir,'.env'); const before=fs.readFileSync(file);
    const bad=run(dir,['--from-env'],fixture({OWNER_NUMBER:'0812345678'})); assert.notEqual(bad.status,0);
    assert.deepEqual(fs.readFileSync(file),before);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('unknown key in .env is ignored and never printed', () => {
  const dir=temp();
  try {
    const ok=run(dir,['--from-env'],fixture()); assert.equal(ok.status,0,ok.stderr);
    fs.appendFileSync(path.join(dir,'.env'),'UNKNOWN_SECRET=never-print\n');
    const out=run(dir,['--check']); assert.equal(out.status,0,out.stdout);
    assert.equal(out.stdout.includes('never-print'),false); assert.equal(out.stderr.includes('never-print'),false);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
function waitClose(child, ms = 15000) {
  return Promise.race([
    once(child,'close'),
    new Promise((_, reject) => setTimeout(() => { child.kill(); reject(new Error('child timeout')); }, ms).unref()),
  ]);
}
test('gateway checks models safely and rejects bad responses and redirects', async () => {
  const server=http.createServer((req,res)=>{
    if(req.url.startsWith('/redirect')){res.writeHead(302,{Location:'/target'});res.end();return;}
    if(req.url.startsWith('/target')){server.targetHit=true;res.end('{"data":[{"id":"wa-combo"}]}');return;}
    if(req.url.startsWith('/http')){res.writeHead(500);res.end('hidden-secret');return;}
    if(req.url.startsWith('/bad')){res.end('{');return;}
    if(req.url.startsWith('/null')){res.end('{"data":[null,{}]}');return;}
    if(req.url.startsWith('/rootnull')){res.end('null');return;}
    if(req.url.startsWith('/datanull')){res.end('{"data":null}');return;}
    if(req.url.startsWith('/other')){res.end('{"data":[{"id":"other-model"}]}');return;}
    if(req.url.startsWith('/cut')){res.writeHead(200,{'Content-Type':'application/json'});res.write('{"data":[{"id":"wa-');res.destroy();return;}
    server.authHeader=req.headers.authorization;
    res.end('{"data":[{"id":"wa-combo"}]}');
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const port=server.address().port, dir=temp();
  try {
    const base={...fixture(),NINEROUTER_URL:`http://127.0.0.1:${port}`,NINEROUTER_API_KEY:'gateway-secret'};
    for (const [route, good] of [['/ok',true],['/http',false],['/bad',false],['/null',false],['/rootnull',false],['/datanull',false],['/other',false],['/cut',false],['/redirect',false]]) {
      const d=temp();
      try {
        const write=run(d,['--from-env'],{...base,NINEROUTER_URL:`http://127.0.0.1:${port}${route==='/ok'?'':route}`}); assert.equal(write.status,0,write.stderr);
        const child=spawn(process.execPath,[wizard,'--gateway-check'],{cwd:d,env:fixture(),stdio:['ignore','pipe','pipe']});
        let stdout='',stderr=''; child.stdout.on('data',x=>stdout+=x); child.stderr.on('data',x=>stderr+=x);
        const [code]=await waitClose(child); assert.equal(code,good?0:1,stderr); assert.equal((stdout+stderr).includes('gateway-secret'),false); assert.equal((stdout+stderr).includes('hidden-secret'),false);
      } finally { fs.rmSync(d,{recursive:true,force:true}); }
    }
    assert.equal(server.authHeader,'Bearer gateway-secret');
    assert.equal(server.targetHit, undefined);
  } finally { server.close(); await once(server,'close'); fs.rmSync(dir,{recursive:true,force:true}); }
});
