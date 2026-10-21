import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/game-data.json' with {type:'json'};
import {createGear,compatibleAffixes,gearIntensity,SLOT_LABELS} from '../planner-model.js';
import {presentModifier} from '../item-presentation.js';
import {itemDisplayName} from '../item-name.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function editor(){
  const elements=new Map();
  const $=selector=>{
    if(!elements.has(selector))elements.set(selector,{value:'',innerHTML:'',textContent:'',querySelector(){return true;},insertAdjacentHTML(_,html){this.innerHTML+=html;}});
    return elements.get(selector);
  };
  const base=catalog.equipment.find(b=>b.slot==='head');
  const draft=createGear(catalog,base.id);
  $('#gear-base').value=base.id;$('#gear-slot').value='head';$('#gear-roll').value='50';
  const context={catalog,draft,$,createGear,compatibleAffixes,gearIntensity,SLOT_LABELS,presentModifier,itemDisplayName,
    detailView:{capture(){},apply(){}},renderScheduler:{request:job=>job()},
    esc:v=>String(v??''),fmt:v=>String(v),option:(id,label)=>`<option value="${id}">${label}</option>`,
    disclosure:(_,title,body)=>`<details><summary>${title}</summary>${body}</details>`,sourceLink:()=>'',modifierText:()=>'<p>Raw definition</p>'};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('function renderBases(){'),source.indexOf('function renderTrinketPicker(){')),context);
  return {context,$,render:()=>vm.runInContext('renderGearDefinitionNow()',context)};
}

test('catalog retains explicit prefix and suffix sides without name inference',()=>{
  assert.ok(catalog.affixes.length);
  for(const a of catalog.affixes){assert.equal(typeof a.prefix,'string');assert.equal(typeof a.suffix,'string');assert.ok(a.prefix||a.suffix);}
});

test('editor preview updates from generated affixes and editable name without changing saved input',()=>{
 const {context,$,render}=editor();context.draft.affixes=[{id:'mod_str',roll:.5}];$('#gear-name').value='My label';render();
 assert.match($('#gear-definition').innerHTML,/My label — Brawny/);
 assert.equal($('#gear-name').value,'My label');
 context.draft.affixes=[];render();assert.doesNotMatch($('#gear-definition').innerHTML,/My label —/);
});

test('editor searches readable stats independently and keeps selected effects visible',()=>{
  const {$,context,render}=editor();
  $('#gear-prefix-search').value='strength';$('#gear-suffix-search').value='attack speed';render();
  assert.match($('#gear-prefixes').innerHTML,/<div class="affix-option" ><label[^>]*><input[^>]*data-affix="mod_str"/);
  assert.match($('#gear-suffixes').innerHTML,/<div class="affix-option" ><label[^>]*><input[^>]*data-affix="mod_attack_speed"/);
  assert.doesNotMatch($('#gear-suffixes').innerHTML,/data-affix="mod_str"/);
  context.draft.affixes.push({id:'mod_str',roll:.7});
  $('#gear-prefix-search').value='attack power';render();
  assert.match($('#gear-prefixes').innerHTML,/<div class="affix-option" ><label[^>]*><input[^>]*data-affix="mod_str"[^>]* checked/);
  assert.match($('#gear-prefixes').innerHTML,/<div class="affix-option" ><label[^>]*><input[^>]*data-affix="mod_attack_power"/);
  assert.equal($('#gear-prefix-count').textContent,'1 / 1 selected');
  assert.equal($('#gear-suffix-search').value,'attack speed');
  assert.equal(context.draft.affixes.length,1);
});

test('prefix and suffix use independent radio groups with explicit empty choices',()=>{
  const {$,context,render}=editor();render();
  for(const side of ['prefix','suffix']){
    const markup=$(`#gear-${side}es`).innerHTML;
    assert.match(markup,new RegExp(`type="radio" name="gear-${side}" data-affix-side="${side}" value="" checked`));
    assert.doesNotMatch(markup,/type="checkbox"/);
  }
  context.draft.affixes=[{id:'mod_str',roll:.5},{id:'mod_attack_power',roll:.8}];render();
  assert.match($('#gear-prefix-count').textContent,/2 saved — choose one/);
  assert.equal(context.draft.affixes.length,2,'Rendering legacy data must not remove modifiers');
});

test('slot change replaces incompatible draft and offers all slot bases',()=>{
  const {$,context}=editor();context.draft.affixes.push({id:'mod_str',roll:.5});
  $('#gear-slot').value='mainhand';vm.runInContext('renderBases()',context);
  assert.equal(context.draft.affixes.length,0);
  assert.equal(catalog.equipment.find(b=>b.id===context.draft.baseId).slot,'mainhand');
  assert.equal(($('#gear-base').innerHTML.match(/<option /g)||[]).length,catalog.equipment.filter(b=>b.slot==='mainhand').length);
});
