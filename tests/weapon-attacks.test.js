import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear,availableSkills,calculateAbility,validatePlannerBuild} from '../planner-model.js';
import {emptyProgression} from '../combat/progression.js';
import {importCharacterProfile} from '../character-import.js';
import {gameHash} from '../save-codec.js';
import {characterFixture,profileFixture} from './save-fixtures.js';
const whirl='weapon:attack_2h_greataxe_secondary';
const axes='players/warrior/skills/whirling_axes.sval';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function build(baseId='twohanded_greataxe_01',c=catalog){
  const b=createBuild(c,'warrior');
  for(const s of availableSkills(b,c))b.skills[s.source]={rank:s.type==='spell'?1:0,upgrades:{}};
  b.gear=[createGear(c,baseId)];b.focusSkill=availableSkills(b,c).find(s=>s.weaponAttack).source;
  return b;
}
function withEffects(modifiers,baseId='twohanded_greataxe_01'){
  const c=structuredClone(catalog),b=build(baseId,c);
  c.trinkets.push({id:'weapon_fixture',name:'Synthetic weapon modifiers',canAttune:false,modifiers,attunedModifiers:modifiers});b.trinkets.push({id:'weapon_fixture',attuned:false});return {b,c};
}

test('equipped weapons grant exact primary/secondary IDs; unequipped items grant nothing and epic variants follow saved quality',()=>{
  const b=build();assert.deepEqual(availableSkills(b,catalog).filter(s=>s.weaponAttack).map(s=>s.id),['attack_2h_greataxe','attack_2h_greataxe_secondary']);
  b.gear.push({...createGear(catalog,'twohanded_shortbow_01'),equipped:false});assert.equal(availableSkills(b,catalog).filter(s=>s.weaponAttack).length,2);
  b.gear[0].sourceQuality=8;assert.ok(availableSkills(b,catalog).filter(s=>s.weaponAttack).every(s=>s.id.endsWith('_epic')));
  assert.equal(calculateAbility(b,catalog,whirl).status,'missing-equipment');
  b.gear[0].equipped=false;assert.equal(availableSkills(b,catalog).filter(s=>s.weaponAttack).length,0);
});
test('Whirlwind uses 75% truncated mainhand damage, twenty contacts in a five-second channel and cooldown downtime',()=>{
  const b=build(),r=calculateAbility(b,catalog,whirl);
  assert.equal(r.supported,true);assert.equal(r.components.length,1);assert.equal(r.components[0].baseDamage,41);assert.equal(r.components[0].normalHit,41);
  assert.equal(r.components[0].hits,20);assert.equal(r.castTime,5);assert.equal(r.cooldown,4.5);assert.equal(r.interval,9.5);
  close(r.activeDps,r.damage/5);close(r.dps,r.damage/9.5);assert.ok(r.activeDps>r.dps);
});
test('weapon power/damage/speed modifiers are independent from spell-only modifiers and criticals use Dexterity',()=>{
  const b=build(),base=calculateAbility(b,catalog,whirl);
  const {b:boost,c}=withEffects([{class:'Modifiers::DamagePowerAdd','attack-power':100,'spell-power':1000},{class:'Modifiers::Damage','attack-mul':1.2,'spell-mul':4},{class:'Modifiers::SpeedAdd','attack-speed':.5,'cast-speed':2}]);
  const r=calculateAbility(boost,c,whirl);assert.equal(r.components[0].normalHit,74);assert.equal(r.components[0].hits,30);close(r.interval,8);
  const {b:spell,c:sc}=withEffects([{class:'Modifiers::DamagePowerAdd','spell-power':1000},{class:'Modifiers::Damage','spell-mul':4},{class:'Modifiers::SpeedAdd','cast-speed':2},{class:'Modifiers::CriticalHit','spell-chance':1}]);
  close(calculateAbility(spell,sc,whirl).dps,base.dps);
  b.attributes.int=100;close(calculateAbility(b,catalog,whirl).dps,base.dps);
  b.attributes.dex=100;assert.ok(calculateAbility(b,catalog,whirl).stats.critChance>base.stats.critChance);assert.ok(calculateAbility(b,catalog,whirl).stats.critDamage>base.stats.critDamage);
});
test('offhand attacks use explicit offhand damage while two-handed secondary attacks use mainhand damage',()=>{
  const b=build('offhand_crossbow_01'),r=calculateAbility(b,catalog,'weapon:attack_offhand_crossbow');
  assert.ok(r.supported);assert.ok(r.components.every(c=>c.hand==='offhand'));assert.equal(Object.values(r.stats.mainHand).reduce((a,b)=>a+b),0);
  const two=calculateAbility(build(),catalog,whirl);assert.ok(two.components.every(c=>c.hand==='mainhand'));
});
test('mixed weapon channels round separately and only physical armor is mitigated; projectile penetration remains per component',()=>{
  const b=build('twohanded_greataxe_02');b.gear[0].itemLevel=21;b.gear[0].upgradeLevel=5;b.gear[0].affixes=[{id:'mod_weapon_dmg_fire_1',roll:.5}];
  const r=calculateAbility(b,catalog,whirl);assert.deepEqual(r.components.map(c=>[c.element,c.normalHit]),[['physical',63],['fire',14]]);
  assert.equal(r.hits,20);close(r.expectedHit,r.components.reduce((sum,p)=>sum+p.expectedHit,0));
  close(r.damage,r.expectedHit*20);close(r.dps,r.damage/r.interval);
  b.armored=true;const armored=calculateAbility(b,catalog,whirl);assert.ok(armored.components[0].normalHit<r.components[0].normalHit);assert.equal(armored.components[1].normalHit,r.components[1].normalHit);
  const cross=build('twohanded_crossbow_01');close(calculateAbility(cross,catalog,'weapon:attack_2h_crossbow').components[0].armorPenetration,.1);
});
test('mixed weapon channels count each original weapon contact once without changing channel damage',()=>{
  const {b,c}=withEffects([{class:'Modifiers::DamageAdd',physical:100,fire:20}],'mainhand_mace_01');
  b.classId='paladin';b.specializationId='paladin';b.skills={};
  const r=calculateAbility(b,c,'weapon:attack_swing_mace');
  assert.ok(r.supported);
  assert.deepEqual(r.components.map(p=>p.element),['physical','fire']);
  assert.equal(r.hits,1);
  assert.ok(r.components.every(p=>p.hits===1));
  close(r.expectedHit,r.components.reduce((sum,p)=>sum+p.expectedHit,0));
  close(r.damage,r.components.reduce((sum,p)=>sum+p.damage,0));
  close(r.dps,r.damage/r.interval);
  b.armored=true;
  const armored=calculateAbility(b,c,'weapon:attack_swing_mace');
  assert.equal(armored.hits,1);
  close(armored.expectedHit,armored.components.reduce((sum,p)=>sum+p.expectedHit,0));
  assert.ok(armored.components[0].normalHit<r.components[0].normalHit);
  assert.equal(armored.components[1].normalHit,r.components[1].normalHit);
  const repeated=calculateAbility(build(),catalog,whirl);
  assert.equal(repeated.hits,20);
  assert.equal(repeated.expectedHit,repeated.components[0].expectedHit);
});
test('attack timelines preserve multi-strikes and fan coverage is not multiplied into all projectiles hitting one target',()=>{
  const daggers=build('twohanded_daggers_01');assert.equal(calculateAbility(daggers,catalog,'weapon:attack_2h_daggers').components[0].hits,2);
  daggers.gear[0].sourceQuality=8;assert.equal(calculateAbility(daggers,catalog,'weapon:attack_2h_daggers_epic').components[0].hits,3);
  const wand=build('mainhand_wand_ice_01');assert.equal(calculateAbility(wand,catalog,'weapon:attack_wand_ice').components[0].hits,3);
  const cross=build('offhand_crossbow_01');cross.gear[0].sourceQuality=8;const fan=calculateAbility(cross,catalog,'weapon:attack_offhand_crossbow_epic');assert.equal(fan.components[0].hits,1);assert.ok(fan.limitations.some(n=>n.includes('fan counts one')));
});
test('weapon masteries and Ranger/donation titles apply to matching attacks without changing spells',()=>{
  const b=build(),baseSpell=calculateAbility(b,catalog,axes).dps;
  b.progression=emptyProgression();b.progression.weaponMasteries={axes:2,maces:5};b.progression.heroTitles={title_ranger:20,title_mat_gold:6};b.progression.spellMasteries={spells_all:10,spells_physical:10};
  const r=calculateAbility(b,catalog,whirl);assert.equal(r.stats.attackPower,60);close(r.stats.skillDamageMultiplier,1.1);close(r.stats.damageMultiplier,1.03);
  b.progression.spellMasteries={};close(calculateAbility(b,catalog,axes).dps,baseSpell);
  const old=structuredClone(b);delete old.progression.weaponMasteries;assert.doesNotThrow(()=>validatePlannerBuild(old,catalog));
});
test('weapon focus survives save validation/copying and missing equipment gives a status instead of corrupting the build',()=>{
  const b=build();b.focusSkill=whirl;const copy=validatePlannerBuild(JSON.parse(JSON.stringify(b)),catalog);assert.equal(copy.focusSkill,whirl);
  copy.gear[0].equipped=false;assert.doesNotThrow(()=>validatePlannerBuild(copy,catalog));assert.equal(calculateAbility(copy,catalog,whirl).status,'missing-equipment');assert.ok(calculateAbility(b,catalog,whirl).supported);
  for(const id of ['invented','__proto__','constructor','toString']){copy.focusSkill=`weapon:${id}`;assert.throws(()=>validatePlannerBuild(copy,catalog));assert.equal(calculateAbility(b,catalog,copy.focusSkill).supported,false);}
});
test('native import retains epic weapon variants, weapon mastery levels and the highest Ranger profile title',()=>{
  const c=characterFixture({class:'warrior',equipped:[[8,gameHash('twohanded_greataxe_01'),.5,10,0,0,0]],'picked-skills':{},'picked-temp-skills':{},'weapon-masteries':[gameHash('axes'),2,0]});
  const ranger=characterFixture({'unique-key':42,class:'ranger_marksman',level:20});
  const rows=importCharacterProfile(profileFixture([c,ranger]),catalog);assert.equal(rows[0].error,undefined);
  const b=rows[0].build;assert.equal(b.progression.weaponMasteries.axes,2);assert.equal(b.progression.heroTitles.title_ranger,20);assert.ok(availableSkills(b,catalog).filter(s=>s.weaponAttack).every(s=>s.id.endsWith('_epic')));
});
test('every equipment-linked standard/epic attack has a finite damage estimate or explicit shield utility status and hashed sources',()=>{
  const seen=new Set(),utilities=new Set();
  for(const base of catalog.equipment.filter(e=>e.attacks.skill))for(const quality of [4,8]){
    const b=build(base.id);b.gear[0].sourceQuality=quality;
    for(const skill of availableSkills(b,catalog).filter(s=>s.weaponAttack)){
      if(seen.has(skill.id))continue;seen.add(skill.id);
      const r=calculateAbility(b,catalog,skill.source);
      if(r.kind==='utility'){utilities.add(skill.id);assert.equal(r.dps,null);}else{assert.ok(r.supported,`${skill.id}: ${r.unsupported}`);assert.ok(Number.isFinite(r.dps)&&r.dps>0,skill.id);assert.ok(r.components.length);}
      assert.ok(r.sources.every(path=>Object.hasOwn(catalog.sources,path)),skill.id);
    }
  }
  assert.equal(seen.size,68);assert.equal(utilities.size,2);assert.equal(catalog.weapons.attacks.attack_thrust_spear,undefined);
});
