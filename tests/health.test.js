import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applicationInfo} from '../scripts/version.mjs';
import pkg from '../package.json' with {type:'json'};

test('application metadata reports package version and supplied build identity',()=>{
  assert.deepEqual(applicationInfo({env:{GIT_REVISION:'abc123',BUILD_DATE:'2026-10-26T12:00:00Z'}}),{
    status:'ok',name:pkg.name,version:pkg.version,gitRevision:'abc123',buildDate:'2026-10-26T12:00:00Z'
  });
});

test('local metadata discovers Git and handles distributions without a checkout',async()=>{
  const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  assert.equal(applicationInfo({env:{}}).gitRevision,revision);
  const dir=await mkdtemp(join(tmpdir(),'hammerforge-health-'));
  try{
    assert.equal(applicationInfo({env:{},cwd:dir}).gitRevision,'unknown');
    const path=join(dir,'health.json');
    execFileSync(process.execPath,['scripts/version.mjs',path],{env:{...process.env,GIT_REVISION:'image-revision',BUILD_DATE:'2026-10-26T00:00:00Z'}});
    const metadata=JSON.parse(await readFile(path,'utf8'));
    assert.equal(metadata.gitRevision,'image-revision');assert.equal(metadata.buildDate,'2026-10-26T00:00:00Z');
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('health endpoint serves uncached version JSON, supports HEAD and rejects writes',async()=>{
  const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port),GIT_REVISION:'running-revision',BUILD_DATE:'2026-10-26T00:00:00Z'},stdio:['ignore','pipe','pipe']});
  const exited=once(server,'exit');
  try{
    await Promise.race([
      (async()=>{for await(const chunk of server.stdout){if(chunk.toString().includes('Hammerforge:'))return;}throw Error('Server exited before listening');})(),
      new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out')),10000);timer.unref();})
    ]);
    const url=`http://127.0.0.1:${port}`;
    const response=await fetch(url+'/health');assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/application\/json/);assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(await response.json(),{status:'ok',name:pkg.name,version:pkg.version,gitRevision:'running-revision',buildDate:'2026-10-26T00:00:00Z'});
    const head=await fetch(url+'/health',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    const post=await fetch(url+'/health',{method:'POST'});assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');
    assert.equal((await fetch(url+'/')).status,200);
    assert.equal((await fetch(url+'/missing-health')).status,404);
  }finally{server.kill();await exited;}
});
