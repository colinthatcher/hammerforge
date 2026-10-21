import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear,collectStats,validateStatOverrides} from '../planner-model.js';
import {computeCombatStats} from '../combat/stats.js';

const fixture=(modifiers)=>{
 const c=structuredClone(catalog),b=createBuild(c,'wizard');
 for(const path of c.classes.find(cls=>cls.id==='wizard').skills)b.skills[path]={rank:0,upgrades:{}};
 c.equipment.push({id:'defence-fixture',name:'Defence fixture',slot:'head',modifiers});
 b.gear=[{id:'fixture',baseId:'defence-fixture',name:'Defence fixture',equipped:true,roll:.5,affixes:[]}];
 return [b,c];
};

test('defensive modifier addition, multiplication, interpolation, and ordering follow source ordering',()=>{
 const [b,c]=fixture([
  {class:'Modifiers::AttribMul','health-regen':[2,4],'mana-regen':[2,4],'health-gain':[2,4],'mana-gain':[2,4]},
  {class:'Modifiers::AttribAdd','health-regen':[2,6],'mana-regen':[2,6],'health-gain':[.5,1.5],'mana-gain':[.5,1.5]},
  {class:'Modifiers::ArmorAdd',fire:[2,6],ice:[-10,-2],lightning:[1,5],poison:[3,7]},
 ]);
 b.gear[0].roll=.5;const stats=computeCombatStats(b,c,false);
  assert.equal(stats.healthRegen,(1+6*.05+4)*3*6);
  assert.equal(stats.manaRegen,(1+10*.1+4)*3*6);
 assert.equal(stats.healthGain,6);assert.equal(stats.manaGain,6);
  assert.equal(stats.resistances.fire,14);assert.equal(stats.resistances.ice,4);
  assert.deepEqual(Object.keys(stats.resistances),['fire','ice','lightning','poison']);
});

test('recovery derives from vitality/focus and class leveling; overrides apply last',()=>{
 const b=createBuild(catalog,'wizard');for(const path of catalog.classes.find(cls=>cls.id==='wizard').skills)b.skills[path]={rank:0,upgrades:{}};b.level=3;b.attributes.vit=5;b.attributes.foc=3;
 const stats=computeCombatStats(b,catalog,false);assert.equal(stats.healthRegen,1+(6+5)*.05);assert.equal(stats.manaRegen,1+(10+3)*.1);
  b.statOverrides={'attributes.vit':20,'healthGain':2,'manaGain':3,'healthRegen':9,'manaRegen':7,'resistances.fire':-4};
  const overridden=collectStats(b,catalog);assert.equal(overridden.healthRegen,9);assert.equal(overridden.manaRegen,7);assert.equal(overridden.healthGain,2);assert.equal(overridden.manaGain,3);assert.equal(overridden.resistances.fire,-4);
 assert.doesNotThrow(()=>validateStatOverrides(b.statOverrides));
});

test('healing and mana gains scale recovery once; missing-mana bonus uses currentManaPercent',()=>{
 const [b,c]=fixture([{class:'Modifiers::AttribAdd','health-regen':2,'mana-regen':2,'health-gain':1,'mana-gain':1},{class:'Modifiers::MissingManaBasedManaRegenBonus','max-gain':2}]);
  const stats=computeCombatStats(b,c,false);assert.equal(stats.healthRegen,(1+6*.05+2)*2);assert.equal(stats.manaRegen,(1+10*.1+2)*2);
  const baseline=[stats.healthRegen,stats.manaRegen];
  c.equipment.find(item=>item.id==='defence-fixture').modifiers.push({class:'Modifiers::Damage',mul:2},{class:'Modifiers::SpeedAdd','cast-speed':.5});
  assert.deepEqual([computeCombatStats(b,c,false).healthRegen,computeCombatStats(b,c,false).manaRegen],baseline);
  b.currentManaPercent=0;assert.equal(computeCombatStats(b,c,false).manaRegen,(1+10*.1+2)*2*3);
  b.currentManaPercent=50;assert.equal(computeCombatStats(b,c,false).manaRegen,(1+10*.1+2)*2*2);
  b.statOverrides={healthGain:0,manaGain:0};assert.equal(computeCombatStats(b,c,false).healthRegen,0);assert.equal(computeCombatStats(b,c,false).manaRegen,0);
});

test('native penalties apply after modifiers and class resistance truncates before equipment bonuses',()=>{
  const b=createBuild(catalog,'wizard');b.level=2;const unpenalized=collectStats(b,catalog);b.shadowCurses=5;b.ngp=2;
  const plain=collectStats(b,catalog);
  const resPenalty=Math.trunc(5*(catalog.facts.shadowCurseArmorPenalty+2*catalog.facts.shadowCurseArmorNGPPenalty)+2*catalog.facts.ngpResistancePenalty+.5);
  const armorPenalty=Math.trunc(5*(catalog.facts.shadowCurseArmorPenalty+2*catalog.facts.shadowCurseArmorNGPPenalty)+2*catalog.facts.ngpArmorPenalty+.5);
  assert.equal(plain.resistances.fire,unpenalized.resistances.fire-resPenalty);
  assert.equal(plain.armor,unpenalized.armor-armorPenalty);
  assert.ok(plain.sources.includes('scripts/Behaviors/Actors/Modifiers/Modifiers.as'));
});

test('real catalog equipment applies ArmorAdd and preserves negative resistance after curse penalties',()=>{
  const b=createBuild(catalog,'wizard'),base=collectStats(b,catalog);
  b.gear=[createGear(catalog,'chest_str_t1a')];const equipped=collectStats(b,catalog);
  assert.ok(equipped.armor>base.armor);
  b.shadowCurses=100;const cursed=collectStats(b,catalog);assert.ok(cursed.resistances.fire<0);
});

test('move speed combines unconditional additions, multipliers, combo movement bonus, and final override independently',()=>{
  const [b,c]=fixture([
    {class:'Modifiers::SpeedAdd','move-speed':.25,'attack-speed':.5,'cast-speed':.75},
    {class:'Modifiers::SpeedMul','move-speed':1.5,'attack-speed':2,'cast-speed':3},
  ]);
  let stats=computeCombatStats(b,c,false);
  assert.equal(stats.moveSpeed,1.875);assert.equal(stats.attackSpeed,3);assert.equal(stats.castSpeed,5.25);
  b.combo={skills:{},active:true,burstActive:false};stats=computeCombatStats(b,c,false);assert.equal(stats.moveSpeed,2.25);assert.equal(stats.attackSpeed,3);assert.equal(stats.castSpeed,5.25);
  b.statOverrides={moveSpeed:.4};stats=computeCombatStats(b,c,false);assert.equal(stats.moveSpeed,.4);
  assert.doesNotThrow(()=>validateStatOverrides({moveSpeed:0}));
  assert.ok(stats.notes.some(n=>n.includes('flat-terrain MoveSpeed multiplier')));
});
test('combo movement is applied once even with zero or multiple deferred modifiers',()=>{
 const [b,c]=fixture([]);b.combo={skills:{},active:true,burstActive:false};
 assert.equal(computeCombatStats(b,c,false).moveSpeed,1.2);
 c.equipment.at(-1).modifiers.push({class:'Modifiers::SpeedMul','cast-speed':2},{class:'Modifiers::ConvertStat',from:'vit',to:'healthregen',mul:.25,add:true});
 const stats=computeCombatStats(b,c,false);
 assert.equal(stats.moveSpeed,1.2);assert.equal(stats.healthRegen,1+6*.05+6*.25);
 assert.doesNotMatch(stats.limitations.join('\n'),/healthregen.*conversion|conversion.*healthregen/i);
});
test('integer defence ranges round negative halves away from zero and class growth truncates',()=>{
 const [b,c]=fixture([{class:'Modifiers::ArmorAdd',ice:[-2,-3]}]);
 const cls=c.classes.find(cls=>cls.id==='wizard');cls.baseStats.iceResistance=0;cls.baseStats.iceResistancePerLevel=.75;b.level=2;
 assert.equal(computeCombatStats(b,c,false).resistances.ice,-3);
});
test('armor and resistance conversions precede difficulty penalties and manual totals override last',()=>{
 const [b,c]=fixture([{class:'Modifiers::ConvertStat',from:'vit',to:'armor',mul:10,add:false},{class:'Modifiers::ConvertStat',from:'vit',to:'resistancefire',mul:10,add:false}]);
 b.ngp=1;b.shadowCurses=0;
 const stats=computeCombatStats(b,c,false);
 assert.equal(stats.armor,60-110);assert.equal(stats.resistances.fire,60-60);
 b.statOverrides={armor:-7,'resistances.fire':-9};const manual=collectStats(b,c);
 assert.equal(manual.armor,-7);assert.equal(manual.resistances.fire,-9);assert.doesNotThrow(()=>validateStatOverrides(b.statOverrides));
});
