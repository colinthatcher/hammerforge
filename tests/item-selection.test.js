import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear} from '../planner-model.js';
import {selectAffix,affixSelectionValid,slotItems,selectSlotItem} from '../item-selection.js';

const base=catalog.equipment.find(item=>item.tags?.length);
const compatible=catalog.affixes.filter(item=>(item.tags||[]).some(tag=>base.tags.includes(tag)));
const prefix=compatible.find(item=>item.prefix),prefix2=compatible.find(item=>item.prefix&&item.id!==prefix.id),suffix=compatible.find(item=>item.suffix);

test('manual affix selection replaces duplicates on one side and preserves rolls and the opposite side',()=>{
  const item={affixes:[{id:prefix.id,roll:.8},{id:prefix.id,roll:.2},{id:suffix.id,roll:.7}]};
  assert.equal(selectAffix(item,'prefix',prefix2.id,catalog,base),true);
  assert.deepEqual(item.affixes,[{id:suffix.id,roll:.7},{id:prefix2.id,roll:.5}]);
  item.affixes.find(a=>a.id===prefix2.id).roll=.35;item.affixes.push({id:prefix2.id,roll:.8});
  assert.equal(selectAffix(item,'prefix',prefix2.id,catalog,base),true);
  assert.equal(item.affixes.find(a=>a.id===prefix2.id).roll,.35);
  assert.equal(selectAffix(item,'suffix','',catalog,base),true);
  assert.deepEqual(item.affixes,[{id:prefix2.id,roll:.35}]);
});

test('affix selection leaves unknown imports untouched and rejects invalid choices without mutation',()=>{
  const item={affixes:[{id:'imported-unknown',roll:.1},{id:prefix.id,roll:.4},{id:suffix.id,roll:.6}]};
  const before=structuredClone(item);
  assert.equal(selectAffix(item,'prefix','missing',catalog,base),false);
  assert.equal(selectAffix(item,'bad',prefix.id,catalog,base),false);
  assert.equal(selectAffix(item,'prefix',suffix.id,catalog,base),false);
  assert.deepEqual(item,before);
  selectAffix(item,'prefix','',catalog,base);
  assert.deepEqual(item.affixes,[{id:'imported-unknown',roll:.1},{id:suffix.id,roll:.6}]);
});

test('manual affix guard only counts explicit known side metadata',()=>{
  const item={affixes:[{id:prefix.id},{id:prefix2.id},{id:'unknown'}]};
  assert.equal(affixSelectionValid(item,catalog),false);
  item.affixes=[{id:prefix.id},{id:suffix.id},{id:'unknown'}];
  assert.equal(affixSelectionValid(item,catalog),true);
});

test('slot selection swaps equipment and handles two-handed occupancy and empty slots',()=>{
  const build=createBuild(catalog);
  const main=createGear(catalog,'mainhand_mace_01'),off=createGear(catalog,'offhand_shield_01'),two=createGear(catalog,'twohanded_greataxe_02'),head=createGear(catalog,'head_str_t1a');
  build.gear=[main,off,two,head];
  assert.equal(slotItems(build,catalog,'mainhand').length,2);
  assert.equal(selectSlotItem(build,catalog,'mainhand',two.id),two);
  assert.deepEqual([main.equipped,off.equipped,two.equipped],[false,false,true]);
  assert.equal(selectSlotItem(build,catalog,'offhand',''),null);
  assert.equal(two.equipped,true);
  assert.equal(selectSlotItem(build,catalog,'offhand',off.id),off);
  assert.equal(two.equipped,false);assert.equal(off.equipped,true);
  assert.equal(selectSlotItem(build,catalog,'mainhand',main.id),main);
  assert.equal(main.equipped,true);assert.equal(off.equipped,true);
  assert.equal(selectSlotItem(build,catalog,'head',''),head);assert.equal(head.equipped,false);
  assert.equal(selectSlotItem(build,catalog,'head',''),null);
  const state=structuredClone(build.gear);
  assert.equal(selectSlotItem(build,catalog,'head',two.id),null);
  assert.deepEqual(build.gear,state);
});
