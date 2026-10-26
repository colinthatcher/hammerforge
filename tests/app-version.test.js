import test from 'node:test';
import assert from 'node:assert/strict';
import {initAppVersion} from '../app-version.js';

function fixture(fetchImpl){const element={textContent:'',title:''};return {element,run:()=>initAppVersion({fetchImpl,element})};}
const response=(data,{ok=true}={})=>({ok,json:async()=>data});

test('renders health version and abbreviated revision with full revision and date in title',async()=>{
 const revision='abcdef0123456789abcdef0123456789';let options;
 const f=fixture(async(url,init)=>{assert.equal(url,'/health');options=init;return response({version:'0.1.0',gitRevision:revision,buildDate:'2026-10-26T12:00:00Z'});});
 await f.run();assert.equal(options.cache,'no-store');assert.equal(f.element.textContent,'App v0.1.0 · Git abcdef012345');assert.match(f.element.title,new RegExp(revision));assert.match(f.element.title,/2026-10-26/);
});

test('unknown revision is explicit and malformed, non-OK, and rejected requests stay handled',async()=>{
 const unknown=fixture(async()=>response({version:'0.1.0',gitRevision:'unknown'}));await unknown.run();assert.equal(unknown.element.textContent,'App v0.1.0 · Git unknown');
 for(const fetchImpl of [async()=>response({version:'<img>',gitRevision:'abc'}),async()=>response({}, {ok:false}),async()=>{throw Error('offline');}]){
  const f=fixture(fetchImpl);await assert.doesNotReject(f.run());assert.equal(f.element.textContent,'App version unavailable');
 }
});
