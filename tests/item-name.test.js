import test from 'node:test';
import assert from 'node:assert/strict';
import {itemDisplayName} from '../item-name.js';
import catalog from '../data/game-data.json' with {type:'json'};

const base=catalog.equipment.find(x=>x.name),prefix=catalog.affixes.find(x=>x.prefix),suffix=catalog.affixes.find(x=>x.suffix);
const cat={equipment:[base],affixes:[prefix,suffix]};
test('real prefix and suffix render on the correct sides regardless of saved order',()=>{
 const item={baseId:base.id,name:base.name,affixes:[{id:suffix.id},{id:prefix.id}]};
 assert.equal(itemDisplayName(item,cat),`${prefix.prefix} ${base.name} ${suffix.suffix}`);
});
test('no sides, unknown definitions and missing base names safely fall back',()=>{
 assert.equal(itemDisplayName({baseId:base.id,name:'Saved',affixes:[{id:'unknown'}]},cat),'Saved');
 assert.equal(itemDisplayName({baseId:base.id,affixes:[{id:'unknown'}]},cat),base.name);
 assert.equal(itemDisplayName({name:'Custom',affixes:[{id:prefix.id}]},{affixes:[prefix]}),'Custom');
});
test('custom labels and imported quality names are retained with generated affixes',()=>{
 const affixes=[{id:prefix.id}];
 assert.equal(itemDisplayName({baseId:base.id,name:'My label',affixes},cat),`My label — ${prefix.prefix} ${base.name}`);
 assert.equal(itemDisplayName({baseId:base.id,name:`Rare ${base.name}`,affixes},cat),`Rare ${prefix.prefix} ${base.name}`);
 assert.equal(itemDisplayName({baseId:base.id,name:`${prefix.prefix} ${base.name}`,affixes},cat),`${prefix.prefix} ${base.name}`);
});
test('formatter is pure and reflects affix changes and removal',()=>{
 const item={baseId:base.id,name:base.name,affixes:[{id:prefix.id}]},before=structuredClone(item);
 assert.equal(itemDisplayName(item,cat),`${prefix.prefix} ${base.name}`);assert.deepEqual(item,before);
 item.affixes=[{id:suffix.id}];assert.equal(itemDisplayName(item,cat),`${base.name} ${suffix.suffix}`);
 item.affixes=[];assert.equal(itemDisplayName(item,cat),base.name);
});
test('repeated display and save roundtrips never accumulate generated names',()=>{
 for(const name of [`Epic ${base.name}`,`Imported ${base.name}`,'My weapon']){
  let item={baseId:base.id,name,affixes:[{id:prefix.id},{id:suffix.id}]};
  const expected=itemDisplayName(item,cat);
  for(let i=0;i<3;i++){
   item=JSON.parse(JSON.stringify(item));
   assert.equal(item.name,name);
   assert.equal(itemDisplayName(item,cat),expected);
  }
 }
});
