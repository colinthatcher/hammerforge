import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,availableSkills,createGear} from '../planner-model.js';
import {calculateSurvival} from '../combat/survival.js';

function bare(){const b=createBuild(catalog,'wizard');b.level=1;for(const s of availableSkills(b,catalog))b.skills[s.source]={rank:0,upgrades:{}};return b;}

test('resource pools follow class, level, allocated attributes and equipment',()=>{
  const b=bare(),base=calculateSurvival(b,catalog);b.attributes.vit=10;b.attributes.foc=8;
  const added=calculateSurvival(b,catalog);assert.equal(added.health,base.health+50);assert.equal(added.mana,base.mana+40);
  b.gear=[createGear(catalog,catalog.equipment.find(e=>e.modifiers.some(m=>m.class==='Modifiers::ArmorAdd'&&m.armor)).id)];
  assert.ok(calculateSurvival(b,catalog).armor>added.armor);
});
test('landed hits use armor rounding, penetration and exact lethal boundaries',()=>{
  const b=bare();b.attributes.str=100;
  const r=calculateSurvival(b,catalog,{damage:100});
  assert.equal(r.rows[0].taken,Math.round(100/(1+r.armor*.005)));
  assert.equal(calculateSurvival(b,catalog,{damage:100,penetration:100}).rows[0].taken,100);
  const lethal=calculateSurvival(b,catalog,{damage:r.health});assert.equal(lethal.rows[1].lethal,true);assert.equal(lethal.rows[1].hitsSurvived,0);
  const smaller=calculateSurvival(b,catalog,{damage:Math.ceil(r.health/2)});assert.equal(smaller.rows[1].hitsSurvived,1);
  const zero=calculateSurvival(b,catalog,{damage:0});assert.equal(zero.rows[0].taken,0);assert.equal(zero.rows[0].hitsSurvived,Infinity);
  const low=calculateSurvival(b,catalog,{damage:1,healthPercent:1});assert.equal(low.currentHealth,Math.ceil(r.health/100));
});
test('maximum survivable direct hits respect rounded armor and exact lethal boundary',()=>{
  const b=bare(),r=calculateSurvival(b,catalog);
  for(const hit of r.maximumHits.filter(hit=>hit.damage!==null)){assert.ok(Number.isInteger(hit.damage));assert.ok(hit.damage>=0);}
  assert.equal(r.maximumHits.filter(hit=>hit.damage===null).length,0);
  const physical=r.maximumHits[0].damage;
  const taken=d=>Math.round(d/(1+r.armor*.005));
  assert.ok(taken(physical)<r.health);assert.ok(taken(physical+1)>=r.health);
  const scratchpad=calculateSurvival(b,catalog,{damage:999,penetration:100,healthPercent:1});
  assert.deepEqual(scratchpad.maximumHits,r.maximumHits,'Maximums must be independent of scenario inputs');
  b.statOverrides={armor:0};const unarmored=calculateSurvival(b,catalog);
  assert.equal(unarmored.maximumHits[0].damage,unarmored.health-1);
});
test('elemental direct-hit thresholds use resistance including negative resistance and damage rounding',()=>{
  const b=bare();b.statOverrides={'resistances.fire':20,'resistances.ice':-20,'health':5};
  const r=calculateSurvival(b,catalog),fire=r.maximumHits.find(x=>x.label==='Fire attack / spell').damage,ice=r.maximumHits.find(x=>x.label==='Ice attack / spell').damage;
  const dealt=(input,resistance,scale=1)=>{if(input===0)return 0;const a=resistance*.005,mul=a>=0?1/(1+a):1-a*catalog.facts.armorNegativeMultiplier;const mitigated=Math.max(1,Math.round(input*mul));return Math.max(1,Math.round(mitigated*scale));};
  assert.ok(dealt(fire,20,.67)<r.health);assert.ok(dealt(fire+1,20,.67)>=r.health);
  assert.ok(dealt(ice,-20)<r.health);assert.ok(dealt(ice+1,-20)>=r.health);
  assert.equal(r.currentHealth,5);assert.equal(r.resistances.fire,20);
  assert.equal(calculateSurvival(b,catalog,{healthPercent:1}).maximumHits.find(x=>x.label==='Fire attack / spell').damage,fire);
  const low=calculateSurvival(b,catalog,{healthPercent:1});assert.equal(low.currentHealth,1);
});
test('player fire and poison immediate damage splits round after resistance; delayed pools are not counted',()=>{
 const b=bare();b.statOverrides={health:100,armor:-100,...Object.fromEntries(['fire','ice','lightning','poison'].map(e=>[`resistances.${e}`,0]))};
 const result=calculateSurvival(b,catalog,{damage:100});
 const row=element=>result.rows.find(r=>r.label.startsWith(element)).taken;
 assert.equal(row('Fire'),67);assert.equal(row('Poison'),20);assert.equal(row('Ice'),100);assert.equal(row('Lightning'),100);
 assert.equal(row('Physical'),150);
 assert.equal(result.maximumHits.find(h=>h.label==='Fire attack / spell').damage,148);
 assert.equal(result.maximumHits.find(h=>h.label==='Poison attack / spell').damage,497);
 b.statOverrides['resistances.fire']=100;
 // 1 / 1.5 mitigation rounds 2 raw to 1, then 67% stays 1.
 const small=calculateSurvival(b,catalog,{damage:2});assert.equal(small.rows.find(r=>r.label.startsWith('Fire')).taken,1);
 const zero=calculateSurvival(b,catalog,{damage:0});assert.ok(zero.rows.every(r=>r.taken===0));
 b.statOverrides.health=1;const one=calculateSurvival(b,catalog);assert.ok(one.maximumHits.every(h=>h.damage===0));
});
test('class armor growth truncates before Strength and item additions',()=>{
  const b=bare();b.level=20;const cls=catalog.classes.find(c=>c.id===b.classId);
  const expected=Math.trunc(cls.baseStats.armor+19*cls.baseStats.armorPerLevel)+Math.round((cls.attributes.str+19*cls.attributeGrowth.str)*2);
  assert.equal(calculateSurvival(b,catalog).armor,expected);
});
test('hero pools are independent of focused active skill and scenario input is bounded',()=>{
  const b=bare(),before=calculateSurvival(b,catalog);for(const s of availableSkills(b,catalog)){b.focusSkill=s.source;const r=calculateSurvival(b,catalog);assert.equal(r.health,before.health);assert.equal(r.mana,before.mana);assert.equal(r.armor,before.armor);}
  for(const input of [{damage:-1},{damage:NaN},{damage:1.5},{healthPercent:0},{penetration:101}])assert.throws(()=>calculateSurvival(b,catalog,input));
});
