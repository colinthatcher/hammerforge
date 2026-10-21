import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear,availableSkills} from '../planner-model.js';
import {computeCombatStats} from '../combat/stats.js';
import {calculateSurvival} from '../combat/survival.js';

const skill=id=>Object.values(catalog.skills).find(s=>s.id===id);
function buildFor(cls,spec=cls){
  const b=createBuild(catalog,cls);b.specializationId=spec;
  for(const s of availableSkills(b,catalog))if(s.type!=='spell')b.skills[s.source]={rank:0,upgrades:{}};
  return b;
}
function learn(b,id,rank=1,upgrades={}){const s=skill(id);assert.ok(s,id);b.skills[s.source]={rank,upgrades};return s;}
function conditions(b,id,count){b.conditions={player:{[id]:count},enemy:{}};}
const noInjectionWarning=stats=>assert.doesNotMatch(stats.limitations.join('\n'),/InjectModifiersIntoStack/);

test('selected Rhythm uses its snapshot without injection warnings; trigger scheduling remains excluded',()=>{
  const b=buildFor('ranger','ranger_marksman');learn(b,'ran_rhythm');b.gear=[createGear(catalog,'twohanded_daggers_01')];
  const dagger=availableSkills(b,catalog).find(s=>s.id==='attack_2h_daggers');assert.ok(dagger);
   const base=computeCombatStats(b,catalog,dagger);conditions(b,'rhythm',1);
   assert.ok(base.notes.some(n=>/Rhythm: stack bonus inactive.*Configuration/.test(n)));
  const active=computeCombatStats(b,catalog,dagger);
  assert.equal(active.attackSpeed,base.attackSpeed);
  assert.ok(Math.abs(active.critChance-(1-(1-base.critChance)*(1-.025)))<1e-9);
  assert.equal(active.critDamage,base.critDamage+.1);
  noInjectionWarning(active);
  assert.ok(active.notes.some(n=>/rhythm.*manual|manual.*rhythm/i.test(n)));
   assert.ok(active.limitations.some(n=>/Rhythm: automatic crit trigger\/proc scheduling/.test(n)),'the skill\'s crit trigger is still reported');
   conditions(b,'rhythm',4);const maximum=computeCombatStats(b,catalog,dagger);
   assert.ok(Math.abs(maximum.critChance-(1-(1-base.critChance)*.9))<1e-9);
   assert.equal(maximum.critDamage,base.critDamage+.4);noInjectionWarning(maximum);

  const spell=availableSkills(b,catalog).find(s=>s.type==='spell');assert.ok(spell);
  const inactive=computeCombatStats(b,catalog,spell);
  assert.ok(inactive.notes.some(n=>/configuration|select.*rhythm|manually/i.test(n)));
});

test('Survivalist Armor is a real non-proc limitation while armor survival explains excluded damage-taken effects',()=>{
  const b=buildFor('ranger','ranger_marksman');learn(b,'ran_survivalist');
  const stats=computeCombatStats(b,catalog,false);
  conditions(b,'survivalist',1);
  const selected=computeCombatStats(b,catalog,false);
   const armorWarning=selected.limitations.find(n=>/Survivalist.*damage-taken modifiers/.test(n));
   assert.ok(armorWarning);assert.doesNotMatch(armorWarning,/proc|conditional/i);
   assert.ok(selected.limitations.some(n=>/Survivalist: automatic hurt trigger\/proc scheduling/.test(n)));
  learn(b,'ran_survivalist',1,{ran_survivalist_regen:1});
  const regen=computeCombatStats(b,catalog,false);
  assert.ok(regen.healthRegen>selected.healthRegen,'Survivalist regen conversion now contributes to recovery');
  assert.doesNotMatch(regen.limitations.join('\n'),/healthregen.*conversion|conversion.*healthregen/i);
  const survival=calculateSurvival(b,catalog);
  assert.ok(survival.limitations.some(n=>/damage.taken.*excluded.*direct.hit|direct.hit.*excluded.*damage.taken/i.test(n)));
   assert.deepEqual(survival.rows,calculateSurvival({...b,conditions:undefined},catalog).rows);
});

test('Barrier stack cap and duration modifiers are noted rather than called unsupported metadata',()=>{
  const b=buildFor('wizard');learn(b,'wiz_barrier',5);conditions(b,'barrier',5);
  const stats=computeCombatStats(b,catalog,false);
  assert.ok(stats.notes.some(n=>/barrier.*manual|manual.*barrier/i.test(n)));
  assert.doesNotMatch(stats.limitations.join('\n'),/ModifyStack|add-max|add-time/);
});

test('unknown and conditional stack injections remain explicit limitations',()=>{
  for(const modifier of [
    {class:'Modifiers::InjectModifiersIntoStack',buff:'fixture:unknown',modifiers:[{class:'Modifiers::ArmorAdd',armor:10}]},
    {class:'Modifiers::InjectModifiersIntoStack',buff:'players/ranger/stacks_ranger.sval:rhythm',conditional:{class:'Always'},modifiers:[{class:'Modifiers::ArmorAdd',armor:10}]},
  ]){
    const c=structuredClone(catalog),b=buildFor('ranger','ranger_marksman');
    c.trinkets.push({id:'fixture-exclusion',name:'Fixture injection',canAttune:false,modifiers:[modifier],attunedModifiers:[modifier]});
    b.trinkets=[{id:'fixture-exclusion',attuned:false}];learn(b,'ran_rhythm');
    conditions(b,'rhythm',1);
    const stats=computeCombatStats(b,c,false);
    assert.ok(stats.limitations.some(n=>/InjectModifiersIntoStack|conditional/i.test(n)),JSON.stringify(stats.limitations));
  }
});
