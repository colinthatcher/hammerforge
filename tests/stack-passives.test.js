import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear,validatePlannerBuild,availableSkills,calculateAbility} from '../planner-model.js';
import {playerConditions,selectedPlayerConditions,validConditions} from '../combat/statuses.js';
import {computeCombatStats as collectStats} from '../combat/stats.js';
import {emptyCombo,comboSummary} from '../combat/combos.js';

const family=id=>catalog.statuses.player.find(f=>f.id===id);
const skill=id=>Object.values(catalog.skills).find(s=>s.id===id);
function buildFor(cls,spec=cls){const b=createBuild(catalog,cls);b.specializationId=spec;return b;}
function learn(b,id,rank=1,upgrades={}){const s=skill(id);assert.ok(s,id);b.skills[s.source]={rank,upgrades};return s;}
const conditions=(b,...entries)=>{b.conditions={player:Object.fromEntries(entries),enemy:{}};};
const available=(b,id)=>playerConditions(b,catalog).find(f=>f.id===id);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const closeTo=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('actual stack families follow class and specialization skill availability',()=>{
  for(const cls of catalog.classes)for(const spec of [cls.id,...cls.specializations.map(s=>s.id)]){
  const b=buildFor(cls.id,spec),profile=catalog.classes.find(c=>c.id===cls.id).specializations.find(s=>s.id===spec);for(const p of profile?.skills||catalog.classes.find(c=>c.id===cls.id).skills){const s=catalog.skills[p];if(s)b.skills[p]={rank:1,upgrades:{}};}const actual=playerConditions(b,catalog).filter(f=>f.kind==='stack').map(f=>f.id).sort();
  const expectedFamilies=catalog.statuses.player.filter(f=>f.kind==='stack'&&f.classId===cls.id&&profileSkills(profile,catalog.classes.find(c=>c.id===cls.id)).has(f.skillId)).map(f=>f.id).sort();
  assert.deepEqual(actual,expectedFamilies,`${cls.id}/${spec}`);
  }
  for(const [id,cls,spec,skillId] of [
   ['rage','warrior','warrior_berserker','berserker_rage'],['incanters_flow','wizard','wizard_evocation','wiz_incanters_flow'],
   ['inner_flame','paladin','paladin_radiance','radiance_flames'],['ecstasy','priest','priest_flaggelant','flagellate'],
  ]){
   const correct=buildFor(cls,spec);learn(correct,skillId,1,id==='ecstasy'?{flagellate_ecstasy:1}:{});assert.ok(available(correct,id)?.available,id);
   for(const other of catalog.classes.find(c=>c.id===cls).specializations.filter(s=>s.id!==spec)){const wrong=buildFor(cls,other.id);wrong.skills[skill(skillId).source]={rank:1,upgrades:{}};assert.equal(available(wrong,id),undefined,`${id} leaked to ${other.id}`);}
  }
  const ranger=buildFor('ranger','ranger_marksman');learn(ranger,'ran_rhythm',0);conditions(ranger,['rhythm',2]);
  assert.equal(available(ranger,'rhythm').available,false);assert.deepEqual(selectedPlayerConditions(ranger,catalog),[]);
  assert.equal(validatePlannerBuild(ranger,catalog).conditions.player.rhythm,2);
 const switched=buildFor('wizard');switched.skills[skill('ran_rhythm').source]={rank:1,upgrades:{}};conditions(switched,['rhythm',2]);
 assert.equal(available(switched,'rhythm'),undefined);assert.deepEqual(selectedPlayerConditions(switched,catalog),[]);
 });
function profileSkills(profile,cls){return new Set((profile?.skills||cls.skills).map(p=>catalog.skills[p]?.id).filter(Boolean));}

test('Rhythm stacks scale only weapon attacks, with upgrades and without duplicated crit',()=>{
 const b=buildFor('ranger');const rhythmSkill=learn(b,'ran_rhythm');b.gear=[createGear(catalog,'twohanded_daggers_01')];
 const weapon=availableSkills(b,catalog).find(s=>s.id==='attack_2h_daggers');assert.ok(weapon?.weaponAttack);
 const rhythm=family('rhythm');assert.equal(rhythm.definitions.rhythm.max,4);
 const base=collectStats(b,catalog,weapon),baseChance=base.critChance,baseCritDamage=base.critDamage;
 for(let n=1;n<=4;n++){
  conditions(b,['rhythm',n]);const stats=collectStats(b,catalog,weapon);
  closeTo(stats.critChance,1-(1-baseChance)*(1-.025*n));closeTo(stats.critDamage,baseCritDamage+.1*n);
 }
 const off=buildFor('ranger');learn(off,'ran_rhythm');off.gear=[createGear(catalog,'twohanded_daggers_01')];conditions(off,['rhythm',4]);
 const spell=availableSkills(off,catalog).find(s=>s.type==='spell');assert.ok(spell);const withStack=collectStats(off,catalog,spell);off.conditions={player:{},enemy:{}};const without=collectStats(off,catalog,spell);
 close(withStack.critChance,without.critChance);close(withStack.critDamage,without.critDamage);
 for(const [tier,increment] of [[1,.05],[2,.1]]){learn(b,'ran_rhythm',1,{ran_rhythm_attack_speed:tier});conditions(b,['rhythm',4]);closeTo(collectStats(b,catalog,weapon).attackSpeed,base.attackSpeed+increment*4);}
 learn(b,'ran_rhythm',5);conditions(b);const rankFiveBase=collectStats(b,catalog,weapon).critDamage;
 for(const n of [1,4]){conditions(b,['rhythm',n]);const stats=collectStats(b,catalog,weapon);closeTo(stats.critDamage,rankFiveBase+.3*n);}
 assert.equal(rhythmSkill.upgrades.find(u=>u.id==='ran_rhythm_attack_speed').tiers,2);
});

test('Barrier rank upgrades change available max and stale high stacks clamp and validate',()=>{
 const b=buildFor('wizard');learn(b,'wiz_barrier',1);conditions(b,['barrier',5]);
 assert.equal(available(b,'barrier').max,3);assert.equal(validConditions(b.conditions,catalog),true);
 assert.equal(selectedPlayerConditions(b,catalog)[0].intensity,1);
 learn(b,'wiz_barrier',5);assert.equal(available(b,'barrier').max,5);
 const ranked=structuredClone(b);ranked.conditions={player:{barrier:5},enemy:{}};assert.equal(validatePlannerBuild(ranked,catalog).conditions.player.barrier,5);
  learn(b,'wiz_barrier',1);assert.equal(available(b,'barrier').max,3);
  assert.equal(selectedPlayerConditions(b,catalog)[0].intensity,1);
  assert.equal(validatePlannerBuild(b,catalog).conditions.player.barrier,5);
});

test('required stack upgrades are specialization-gated; legacy build and invalid stacks validate',()=>{
 const wizard=buildFor('wizard');learn(wizard,'wiz_barrier');conditions(wizard,['barrier_fire',1]);
 assert.equal(available(wizard,'barrier_fire').available,false);
 learn(wizard,'wiz_barrier',1,{wiz_barrier_fire:1});assert.equal(available(wizard,'barrier_fire').available,true);
 const priest=buildFor('priest','priest_flaggelant');learn(priest,'flagellate');conditions(priest,['ecstasy',1]);
 assert.equal(available(priest,'ecstasy').available,false);learn(priest,'flagellate',1,{flagellate_ecstasy:1});assert.equal(available(priest,'ecstasy').available,true);
 const legacy=buildFor('wizard');assert.equal(validatePlannerBuild(legacy,catalog).conditions,undefined);
 for(const n of [0,6,1.5]){legacy.conditions={player:{barrier:n},enemy:{}};assert.equal(validConditions(legacy.conditions,catalog),false);}
});

test('Inner Flame converts manually selected stacks to both raw weapon hands, not aura damage',()=>{
 const b=buildFor('paladin','paladin_radiance');learn(b,'radiance_flames',1,{radiance_flames_dmg_add:1});b.level=20;b.gear=[createGear(catalog,'mainhand_mace_01')];
 const base=collectStats(b,catalog,false);
 for(const [n,amount] of [[1,3],[5,15]]){conditions(b,['inner_flame',n]);const stats=collectStats(b,catalog,false);assert.equal(stats.mainHand.fire-base.mainHand.fire,amount);assert.equal(stats.offHand.fire-base.offHand.fire,amount);assert.ok(stats.notes.some(s=>s.includes('manually active snapshot')));}
 assert.deepEqual(calculateAbility(b,catalog,skill('radiance_flames').source).components,[]);
});

test('Ecstasy contributes thorns for a non-focused Flagellate build',()=>{
 const b=buildFor('priest','priest_flaggelant');learn(b,'flagellate',1,{flagellate_ecstasy:1});learn(b,'retribution');
 const noStack=collectStats(b,catalog,skill('retribution'));const baseHit=calculateAbility(b,catalog,skill('flagellate').source).components[0].baseDamage;
 assert.ok(noStack.thorns>0);
 for(const [n,mul] of [[1,.02],[5,.1]]){
  conditions(b,['ecstasy',n]);const other=collectStats(b,catalog,skill('retribution'));
  assert.equal(other.thorns,Math.trunc(noStack.thorns*(1+mul)));
  assert.equal(calculateAbility(b,catalog,skill('flagellate').source).components[0].baseDamage,80+Math.trunc(other.thorns*.5));
 }
 assert.ok(calculateAbility(b,catalog,skill('flagellate').source).components[0].baseDamage>baseHit);
});

test('every passive player-stack reference has a configurable family or an explicit auxiliary exclusion',()=>{
 const represented=new Set(catalog.statuses.player.filter(f=>f.kind==='stack').flatMap(f=>Object.keys(f.definitions).map(key=>`${f.source}:${key}`)));
 const auxiliary=new Set([
  'players/paladin/stacks_paladin.sval:divine_protection_timer',
  'players/rogue/stacks_rogue.sval:sidestep_timer',
  ...Array.from({length:5},(_,i)=>`players/paladin/stacks_paladin.sval:inner_flame_damage_${i+1}`),
 ]);
 function check(value,skillId){
  if(typeof value==='string')for(const [reference] of value.matchAll(/players\/\w+\/stacks_\w+\.sval:[\w]+/g))assert.ok(represented.has(reference)||auxiliary.has(reference),`${skillId}: missing ${reference}`);
  else if(value&&typeof value==='object')for(const child of Object.values(value))check(child,skillId);
 }
 for(const s of Object.values(catalog.skills).filter(s=>s.type!=='spell'))check(s,s.id);
});

function renderConditions(build){
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8'),elements=new Map();
 const $=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:''});return elements.get(selector);};
 const context={build,catalog,$,playerConditions,emptyCombo,comboSummary,esc:String,fmt:String,
  option:(value,label,selected)=>`<option value="${value}"${value===selected?' selected':''}>${label}</option>`,
  disclosure:(_id,_title,body)=>body,sourceLink:()=>'',townBuffMarkup:()=>'',comboEstimateMarkup:()=>''};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function renderConditions(){'),source.indexOf('function comboEstimateMarkup(){'))+'\nrenderConditions();',context);
 return $('#player-conditions').innerHTML;
}
test('Configuration renders Rhythm counts, rank-aware Barrier counts and upgrade gates',()=>{
 const b=buildFor('ranger');conditions(b,['rhythm',3]);
 const html=renderConditions(b),select=html.match(/<select[^>]*data-condition-id="rhythm"[^>]*>(.*?)<\/select>/)[0];
 assert.doesNotMatch(select,/disabled/);assert.match(select,/>Off<\/option>/);
 for(let n=1;n<=4;n++)assert.ok(select.includes(`<option value="${n}"${n===3?' selected':''}>${n} stack${n===1?'':'s'}</option>`));
 assert.doesNotMatch(select,/value="5"/);
 learn(b,'ran_rhythm',0);assert.match(renderConditions(b),/data-condition-id="rhythm" disabled/);
 const w=buildFor('wizard');learn(w,'wiz_barrier',5);
 assert.match(renderConditions(w),/data-condition-id="barrier"[^>]*>[^]*?value="5"/);
 assert.match(renderConditions(w),/data-condition-id="barrier_fire" disabled/);
 learn(w,'wiz_barrier',5,{wiz_barrier_fire:1});assert.doesNotMatch(renderConditions(w),/data-condition-id="barrier_fire" disabled/);
 assert.doesNotMatch(renderConditions(buildFor('paladin')),/data-condition-id="inner_flame"/);
});
