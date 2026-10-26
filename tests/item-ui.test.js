import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear,SLOT_LABELS} from '../planner-model.js';
import {presentItem} from '../item-presentation.js';
import {slotItems} from '../item-selection.js';
import {itemDisplayName} from '../item-name.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('item inspector markup groups base stats and named typed affix stats',()=>{
  const build=createBuild(catalog),base=catalog.equipment[0],definition=catalog.affixes.find(a=>a.name&&a.modifiers?.length);
  const item={...build.gear[0],baseId:base.id,affixes:[{id:definition.id,roll:.5}]};
  const presented=presentItem(item,base,catalog);
  assert.ok(Array.isArray(presented.baseStats));assert.equal(presented.affixes[0].name,definition.name);
  assert.ok(['Prefix','Suffix','Affix'].includes(presented.affixes[0].type));assert.ok(presented.affixes[0].stats.length);
  assert.match(source,/<h3>Base stats<\/h3>/);assert.match(source,/\['Prefix','Suffix','Affix','Epic effect'\]/);
  assert.match(source,/itemDisplayName\(g,catalog\)/);assert.match(source,/aria-label="Inspect \$\{esc\(itemDisplayName\(item,catalog\)\)\}"/);
  assert.match(source,/esc\(itemDisplayName\(selected,catalog\)\)/);
  assert.match(source,/No \$\{side\.toLowerCase\(\)\}/);assert.match(source,/a\.name/);assert.match(source,/a\.type/);
});

test('every catalog epic effect renders in the inspector with Epic color and readable stats',()=>{
  for(const definition of catalog.affixes.filter(a=>a.quality==='epic')){
    const base=catalog.equipment.find(b=>b.tags.some(tag=>definition.tags.includes(tag)));
    const item={...createGear(catalog,base.id),sourceQuality:8,equipped:false,affixes:[{id:definition.id,roll:.5}]};
    const tooltip={innerHTML:''},before=structuredClone(item);
    const context={selected:item,catalog,presentItem,itemDisplayName,SLOT_LABELS,$:()=>tooltip,esc:v=>String(v)};
    vm.createContext(context);
    vm.runInContext(source.slice(source.indexOf("const tooltip=$('#selected-item')"),source.indexOf("$('#trinket-list')")),context);
    assert.match(tooltip.innerHTML,/#ff00ff/);assert.match(tooltip.innerHTML,/Epic · 1 affixes/);
    assert.match(tooltip.innerHTML,/<h3>Epic effect<\/h3>/);
    assert.ok(tooltip.innerHTML.includes(definition.name));
    for(const stat of presentItem(item,base,catalog).affixes[0].stats)assert.ok(tooltip.innerHTML.includes(stat),definition.id);
    assert.deepEqual(item,before);
  }
});

test('slot dropdowns contain only fitting build items without an inventory list',()=>{
  const build=createBuild(catalog),main=createGear(catalog,'mainhand_mace_01'),two=createGear(catalog,'twohanded_greataxe_02'),off=createGear(catalog,'offhand_shield_01'),head=createGear(catalog,'head_str_t1a');
  build.gear=[main,two,off,head];main.equipped=false;off.equipped=false;two.equipped=true;
  const elements=new Map(),$=s=>{if(!elements.has(s))elements.set(s,{innerHTML:''});return elements.get(s);};
  const context={build,catalog,SLOT_LABELS,slotItems,presentItem,itemDisplayName,$,selectedGearId:two.id,esc:v=>String(v),option:(v,label,selected)=>`<option value="${v}" ${v===selected?'selected':''}>${label}</option>`};
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('  const twoHanded='),source.indexOf("const tooltip=$('#selected-item')")),context);
  const html=$('#gear-slots').innerHTML;
  assert.match(html,/data-slot-item="mainhand"/);assert.match(html,/data-slot-item="offhand"/);
  const select=slot=>html.match(new RegExp(`<select[^>]*data-slot-item="${slot}"[^>]*>([\\s\\S]*?)<\\/select>`))[1];
  assert.ok(select('mainhand').includes(main.id));assert.ok(select('mainhand').includes(two.id));
  assert.ok(!select('mainhand').includes(off.id));assert.ok(!select('mainhand').includes(head.id));
  assert.ok(select('offhand').includes(off.id));assert.match(select('offhand'),/Occupied by two-handed weapon/);
  const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.doesNotMatch(page,/id="gear-list"|<h2>All items<\/h2>/);
});

test('impact delta distinguishes positive, zero and negative comparisons',()=>{
  const start=source.indexOf('function impact('),end=source.indexOf('\nfunction withoutGear',start),fn=source.slice(start,end);
  const build={},catalog={},$=()=>{};
  const context={build,catalog,calculateAbility:()=>({dps:10}),fmt:n=>String(n)};
  for(const [delta,klass,text] of [[2,'positive','+2 DPS'],[0,'impact-muted','0 DPS'],[-2,'negative','-2 DPS']]){
    let calls=0;context.calculateAbility=()=>({dps:calls++===0?10+delta:10});
    vm.createContext(context);const result=vm.runInContext(`${fn}\nimpact({})`,context);
    assert.match(result,new RegExp(`class="impact ${klass}"`));assert.ok(result.includes(text));
  }
});
