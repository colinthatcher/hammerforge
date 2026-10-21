import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear,calculateAbility,calculateCombo,collectStats,validatePlannerBuild} from '../planner-model.js';
import {emptyCombo,comboSummary,validCombo} from '../combat/combos.js';

function build(){const b=createBuild(catalog);b.combo=emptyCombo();b.combo.skills={combo_kills:1,combo_nova:1};return b;}
test('old builds default to no combo and combo selections roundtrip independently',()=>{
  const old=createBuild(catalog);assert.doesNotThrow(()=>validatePlannerBuild(old,catalog));assert.equal(calculateCombo(old,catalog).dps,null);
  const b=build();b.combo.active=true;const copy=validatePlannerBuild(JSON.parse(JSON.stringify(b)),catalog);
  assert.deepEqual(copy.combo,b.combo);copy.combo.skills.combo_nova=5;assert.equal(b.combo.skills.combo_nova,1);
});
test('combo validation rejects malformed state, ranks, IDs and mutually exclusive choices',()=>{
  for(const patch of [c=>c.skills=[],c=>c.active=1,c=>c.skills.unknown=1,c=>c.skills.combo_nova=6,c=>c.skills.combo_nova=.5,c=>c.skills.combo_dash=1,c=>c.burstActive=true]){
    const b=build();patch(b.combo);
    assert.throws(()=>validatePlannerBuild(b,catalog));
  }
  const b=build();b.combo.active=true;delete b.combo.skills.combo_kills;assert.throws(()=>validatePlannerBuild(b,catalog));
  b.combo.active=false;b.combo.skills={combo_bull_rage:1,combo_clear_mind:1};assert.throws(()=>validatePlannerBuild(b,catalog));
});
test('source activation thresholds and extra-time rank use selected rank, not sum of ranks',()=>{
  const b=build();let s=comboSummary(b,catalog);assert.equal(s.threshold,10);assert.equal(s.obtainSeconds,1.5);assert.equal(s.sustainSeconds,3.5);
  b.combo.skills={combo_dash:1,combo_time:5};s=comboSummary(b,catalog);assert.equal(s.threshold,3);assert.equal(s.obtainSeconds,2);assert.equal(s.sustainSeconds,5.5);
  b.combo.skills={combo_parry:1};assert.equal(comboSummary(b,catalog).threshold,6);
});
test('incomplete combo catalogs reject selected ranks instead of throwing',()=>{
  const b=build();assert.equal(validCombo(b.combo,{combos:{}}),false);
  assert.equal(validCombo(b.combo,{combos:{skills:[{id:'combo_kills',rankCount:1}]}}),false);
});
test('combo state alone does not invent ability damage or cast-speed bonuses',()=>{
  const b=build(),off=calculateAbility(b,catalog,b.focusSkill);b.combo.active=true;
  assert.equal(calculateAbility(b,catalog,b.focusSkill).dps,off.dps);assert.equal(collectStats(b,catalog).castSpeed,off.stats.castSpeed);
});
test('Bursting Damage is independent of combo state, affects spell and weapon damage and expires by manual snapshot',()=>{
  const b=build(),base=collectStats(b,catalog).damageMultiplier;b.combo.skills.combo_bursting_dmg=1;b.combo.burstActive=true;
  assert.equal(collectStats(b,catalog).damageMultiplier,base*1.1);assert.doesNotThrow(()=>validatePlannerBuild(b,catalog));
  const spell=calculateAbility(b,catalog,b.focusSkill);assert.ok(spell.sources.includes(catalog.combos.buffSource));
  b.gear=[createGear(catalog,'twohanded_greataxe_01')];
  const path='weapon:attack_2h_greataxe_secondary',on=calculateAbility(b,catalog,path);b.combo.burstActive=false;
  const off=calculateAbility(b,catalog,path);assert.equal(on.supported,true);assert.equal(on.stats.damageMultiplier,off.stats.damageMultiplier*1.1);assert.ok(on.dps>off.dps);
  b.combo.skills.combo_bursting_dmg=0;b.combo.skills.combo_bursting_speed=1;b.combo.burstActive=true;
  assert.equal(collectStats(b,catalog).castSpeed,1);assert.equal(collectStats(b,catalog).attackSpeed,1);
});
test('Nova requires learning and active combo, uses one contact per pulse independent of fan rank and normal spell crit',()=>{
  const b=build();assert.equal(calculateCombo(b,catalog).dps,null);b.combo.active=true;
  const low=calculateCombo(b,catalog);assert.equal(low.interval,1);assert.equal(low.projectiles,8);assert.equal(low.dps,low.normalHit);
  assert.equal(low.normalHit,Math.round(15*(1+low.stats.spellPower/catalog.facts.powerDivisor)*low.stats.damageMultiplier));
  b.combo.skills.combo_nova=5;const high=calculateCombo(b,catalog);assert.equal(high.projectiles,24);assert.equal(high.dps,low.dps);
  b.conditions={player:{},enemy:{marked:catalog.statuses.enemy.find(f=>f.id==='marked').variants[0].id}};
  assert.equal(calculateCombo(b,catalog).dps,high.dps);
  b.armored=true;assert.ok(calculateCombo(b,catalog).dps<high.dps);
  b.combo.skills.combo_nova=0;assert.equal(calculateCombo(b,catalog).dps,null);
});
test('Nova keeps uncertain custom-stat damage explicitly excluded and reports its source binding',()=>{
  const b=build();b.combo.active=true;const plain=calculateCombo(b,catalog);b.combo.skills.combo_bull_rage=1;
  const r=calculateCombo(b,catalog);assert.equal(r.dps,plain.dps);assert.equal(r.customBinding,r.stats.attributes.vit*.75*2);
  assert.ok(r.limitations.some(n=>n.includes('additional projectile damage is excluded')));
});
test('Nova pulse cadence is fixed while Bursting Damage and enemy vulnerability change its contact damage',()=>{
  const b=build();b.combo.active=true;const plain=calculateCombo(b,catalog);
  b.combo.skills.combo_bursting_dmg=1;b.combo.burstActive=true;
  const burst=calculateCombo(b,catalog);assert.ok(burst.normalHit>plain.normalHit);assert.equal(burst.interval,plain.interval);
  const vuln=catalog.statuses.enemy.find(f=>f.id==='vulnerability');b.conditions={player:{},enemy:{vulnerability:vuln.variants[0].id}};
  assert.ok(calculateCombo(b,catalog).normalHit>burst.normalHit);
  const c=structuredClone(catalog);c.trinkets.push({id:'combo_speed_fixture',name:'Synthetic cast speed',modifiers:[{class:'Modifiers::SpeedAdd','cast-speed':5}]});
  b.trinkets.push({id:'combo_speed_fixture',attuned:false});assert.equal(calculateCombo(b,c).interval,1);
});
test('combo catalog has source hashes, real ranks, projectile and timed buff constants',()=>{
  const c=catalog.combos;assert.equal(c.skills.length,15);
  assert.deepEqual(c.skills.find(s=>s.id==='combo_nova').ranks.map(r=>r.binds['num-projs']),[8,12,16,20,24]);
  assert.equal(c.projectile['hit-effects'][0].physical,15);assert.equal(c.buffs.damage['dmg-mul'],1.1);assert.equal(c.buffs.damage.duration,10000);
  assert.equal(c.skills.find(s=>s.id==='combo_bursting_dmg').burst,'damage');
  for(const p of [...c.skills.map(s=>s.source),c.projectileSource,c.buffSource,...c.mechanicSources])assert.match(catalog.sources[p],/^[a-f0-9]{64}$/);
});
