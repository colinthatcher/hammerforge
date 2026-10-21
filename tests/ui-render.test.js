import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderScheduler} from '../ui-render.js';

function harness(){
  const listeners={},queue=[];const document={activeElement:null,all:[],addEventListener(type,fn){listeners[type]=fn;},querySelectorAll(){return this.all;}};
  const window={addEventListener(type,fn){listeners[`window:${type}`]=fn;}};
  const scheduler=createRenderScheduler({document,window,schedule:fn=>(queue.push(fn),queue.length),cancel(){}});
  return {document,listeners,queue,scheduler,run(){queue.shift()?.();}};
}
function node(tag='INPUT',attrs={}){return {tagName:tag,id:attrs.id||'',type:attrs.type||'text',attributes:Object.entries(attrs).map(([name,value])=>({name,value})),isConnected:true,disabled:false,focus(){this.focused=true;harnessDummy.document.activeElement=this;},setSelectionRange(a,b,d){this.selectionStart=a;this.selectionEnd=b;this.selectionDirection=d;}};}
let harnessDummy;

test('coalesces jobs and waits through pointerup until click has dispatched',()=>{
  const h=harness(),calls=[];const job=()=>calls.push(1);h.scheduler.request(job);h.scheduler.request(job);h.listeners.pointerdown({target:{isConnected:true}});h.run();assert.deepEqual(calls,[]);h.listeners.pointerup();h.listeners.click();h.run();h.run();assert.equal(calls.length,1);
});
test('restores replaced keyboard control draft and caret',()=>{
  const h=harness();harnessDummy=h;const old=node('INPUT',{id:'stat',type:'number','data-stat':'dex'});old.value='25';old.selectionStart=1;old.selectionEnd=2;old.selectionDirection='forward';h.document.activeElement=old;
  const replacement=node('INPUT',{id:'stat',type:'number','data-stat':'dex'});replacement.isConnected=false;
  h.scheduler.request(()=>{old.isConnected=false;replacement.isConnected=true;h.document.all=[replacement];h.document.activeElement={tagName:'BODY',isConnected:true};});h.run();
  assert.equal(h.document.activeElement,replacement);assert.equal(replacement.value,'25');assert.equal(replacement.selectionStart,1);
});
test('does not steal intentionally moved focus or focus disabled/missing replacements',()=>{
  const h=harness();harnessDummy=h;const old=node('INPUT',{id:'a'});h.document.activeElement=old;const modal=node('BUTTON');
  h.scheduler.request(()=>{old.isConnected=false;h.document.activeElement=modal;});h.run();assert.equal(h.document.activeElement,modal);
});
test('does not focus disabled or absent replacements',()=>{
  for(const disabled of [true,false]){
    const h=harness();harnessDummy=h;const old=node('INPUT',{id:'removed'});h.document.activeElement=old;
    const replacement=node('INPUT',{id:'removed'});replacement.disabled=true;
    const body={tagName:'BODY',isConnected:true};
    h.scheduler.request(()=>{old.isConnected=false;h.document.activeElement=body;h.document.all=disabled?[replacement]:[];});h.run();
    assert.equal(h.document.activeElement,body);assert.equal(replacement.focused,undefined);
  }
});
test('restores a replaced select without overwriting its model-derived value',()=>{
  const h=harness();harnessDummy=h;const old=node('SELECT',{id:'rank'});old.value='1';h.document.activeElement=old;
  const replacement=node('SELECT',{id:'rank'});replacement.value='2';
  h.scheduler.request(()=>{old.isConnected=false;h.document.activeElement={tagName:'BODY',isConnected:true};h.document.all=[replacement];});h.run();
  assert.equal(h.document.activeElement,replacement);assert.equal(replacement.value,'2');
});
test('native select change releases pointer barrier and window blur recovers',()=>{
  const h=harness();let runs=0;h.scheduler.request(()=>runs++);h.listeners.pointerdown({target:{isConnected:true}});h.listeners.change({target:{tagName:'SELECT'}});h.run();assert.equal(runs,1);
  h.scheduler.request(()=>runs++);h.listeners.pointerdown({target:{isConnected:true}});h.listeners['window:blur']();h.run();assert.equal(runs,2);
});
test('a repeated pointer id after a missed release cannot leave rendering suspended',()=>{
  const h=harness();let runs=0;
  h.listeners.pointerdown({pointerId:1,target:{isConnected:true}});h.scheduler.request(()=>runs++);h.run();
  h.listeners.pointerdown({pointerId:1,target:{isConnected:true}});h.listeners.pointerup({pointerId:1});h.listeners.click();
  while(h.queue.length)h.run();assert.equal(runs,1);
});
