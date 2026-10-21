import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeDetailView} from '../ui-details.js';

const KEY='hammerforge.ui.panels.v2';
function harness(saved=null,{denied=false}={}){
  const listeners={};
  const document={all:[],querySelectorAll(){return this.all;},addEventListener(type,fn){listeners[type]=fn;}};
  const storage={writes:[],getItem(key){assert.equal(key,KEY);if(denied)throw Error('denied');return saved;},setItem(key,value){if(denied)throw Error('denied');this.writes.push([key,value]);}};
  const detail=(key,open=false,defaultOpen=false)=>({open,isConnected:true,key,hasAttribute(name){return name==='data-default-open'&&defaultOpen;},getAttribute(name){return name==='data-disclosure'?key:null;},matches(){return true;}});
  return {document,storage,listeners,detail};
}

test('applies data-default-open to static disclosures during initialization',()=>{
  const h=harness();const closed=h.detail('closed',true),opened=h.detail('opened',false,true);h.document.all=[closed,opened];
  initializeDetailView({document:h.document,storage:h.storage});
  assert.equal(closed.open,false);assert.equal(opened.open,true);
});

test('captures manual states and reapplies them to rerendered disclosures',()=>{
  const h=harness(),ui=initializeDetailView({document:h.document,storage:h.storage}),a=h.detail('panel');h.document.all=[a];
  a.open=true;ui.capture();h.document.all=[h.detail('panel')];ui.apply();assert.equal(h.document.all[0].open,true);
  h.document.all[0].open=false;ui.capture();h.document.all=[h.detail('panel',true)];ui.apply();assert.equal(h.document.all[0].open,false);
});

test('toggle preferences restore per disclosure and only use the v2 key',()=>{
  const h=harness();h.document.all=[h.detail('one')];initializeDetailView({document:h.document,storage:h.storage});
  h.document.all[0].open=true;h.listeners.toggle({target:h.document.all[0]});
  assert.deepEqual(h.storage.writes.map(([key])=>key),[KEY]);
  const saved=h.storage.writes[0][1],next=harness(saved);next.document.all=[next.detail('one')];
  initializeDetailView({document:next.document,storage:next.storage});assert.equal(next.document.all[0].open,true);
});

test('invalid or denied storage is safe; unmarked and detached toggles are ignored',()=>{
  for(const options of [{saved:'not json'},{denied:true},{saved:JSON.stringify({mode:'full',states:{bad:'yes'}})}]){
    const h=harness(options.saved??null,options),ui=initializeDetailView({document:h.document,storage:h.storage});
    assert.deepEqual(Object.keys(ui).sort(),['apply','capture']);
    const unmarked={...h.detail('unmarked',true),matches:()=>false};h.listeners.toggle({target:unmarked});
    const detached=h.detail('detached',true);detached.isConnected=false;h.listeners.toggle({target:detached});
    const ordinary=h.detail('ordinary');h.document.all=[ordinary];ui.apply();assert.equal(ordinary.open,false);
  }
});

test('ignores old global detail modes and never modifies the build-library key',()=>{
  const legacy=JSON.stringify({mode:'full',states:{full:{legacy:true}}}),h=harness(legacy);
  h.document.documentElement={dataset:{detailLevel:'unchanged'}};h.document.all=[h.detail('panel')];
  const ui=initializeDetailView({document:h.document,storage:h.storage});
  assert.equal(h.document.all[0].open,false);ui.capture();
  assert.deepEqual(h.document.documentElement.dataset,{detailLevel:'unchanged'});
  assert.equal(h.storage.writes.some(([key])=>key==='hammerforge.ui.build-library.v1'),false);
  assert.deepEqual(h.storage.writes,[]);
});
