import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBuild,createGear,calculateAbility,collectStats,validatePlannerBuild} from '../planner-model.js';
import {emptyProgression} from '../combat/progression.js';
import {importCharacterProfile} from '../character-import.js';
import {gameHash} from '../save-codec.js';
import {profileFixture,characterFixture} from './save-fixtures.js';
const catalog=JSON.parse(readFileSync(new URL('../data/game-data.json',import.meta.url)));
const axes='players/warrior/skills/whirling_axes.sval',leap='players/warrior/skills/berserker_leap.sval';
function warrior(){
  const b=createBuild(catalog,'warrior');b.specializationId='warrior_berserker';b.attributes.str=61;b.focusSkill=axes;
  b.progression=emptyProgression();b.skills[axes]={rank:1,upgrades:{}};b.skills[leap]={rank:1,upgrades:{}};
  const g=createGear(catalog,'hands_str_3a');g.itemLevel=21;g.upgradeLevel=5;g.affixes=[{id:'mod_spell_damage',roll:.5}];b.gear=[g];return b;
}
const normal=(b,path)=>calculateAbility(b,catalog,path).components[0].normalHit;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('Mystic uses the selected cumulative tier, fixing missing spell power without summing prior tiers',()=>{
  const b=warrior();assert.equal(collectStats(b,catalog).spellPower,142);assert.equal(normal(b,axes),75);assert.equal(normal(b,leap),226);
  b.progression.mysticSpellPower=11;
  assert.equal(collectStats(b,catalog).spellPower,202);assert.equal(normal(b,axes),88);assert.equal(normal(b,leap),265);
  assert.ok(calculateAbility(b,catalog,axes).sources.includes('tweak/town/shops/mystic.sval'));
});
test('general and matching element masteries extrapolate by level and multiply, without affecting other elements',()=>{
  const b=warrior();b.progression.spellMasteries={spells_all:2,spells_physical:3,spells_fire:5};
  close(calculateAbility(b,catalog,axes).stats.skillDamageMultiplier,1.08*1.12);
  assert.equal(normal(b,axes),Math.round(40*1.71*1.1*1.08*1.12));
  const w=createBuild(catalog,'wizard');w.progression=structuredClone(b.progression);
  close(calculateAbility(w,catalog,'players/wizard/skills/wiz_fireball.sval').stats.skillDamageMultiplier,1.08*1.2);
});
test('Wizard and Logger titles scale at level/10, persist and remain independent between copies',()=>{
  const b=warrior();b.progression.heroTitles={title_wizard:20,title_mat_wood:6};
  assert.equal(collectStats(b,catalog).spellPower,202);close(collectStats(b,catalog).damageMultiplier,1.1*1.03);
  const copy=validatePlannerBuild(JSON.parse(JSON.stringify(b)),catalog);copy.progression.heroTitles.title_wizard=30;
  assert.equal(collectStats(copy,catalog).spellPower,232);assert.equal(collectStats(b,catalog).spellPower,202);
});
test('active Chapel and Tavern bonuses combine; enemy-tag conditionals are not assumed on the training target',()=>{
  const b=warrior();b.progression.townBuffs={chapel:'chapel_damage',tavern_drink:'tavern_drink_dark_desire'};
  close(collectStats(b,catalog).damageMultiplier,1.1*1.1*1.2);
  b.progression.townBuffs.tavern_food='tavern_meal_beasts';
  const r=calculateAbility(b,catalog,axes);close(r.stats.damageMultiplier,1.1*1.1*1.2);
  assert.ok(r.limitations.some(n=>n.includes("Hunter's Travel Rations")&&n.includes('conditional')));
  b.progression.townBuffs.tavern_drink='tavern_drink_the_impetuous_apprentice';
  close(calculateAbility(b,catalog,axes).interval,.6/1.25+2*.75);
});
test('old builds retain zero progression; invalid IDs, fractions, duplicate buff sets and out-of-range tiers are rejected',()=>{
  const b=warrior();delete b.progression;assert.doesNotThrow(()=>validatePlannerBuild(b,catalog));assert.equal(normal(b,axes),75);
  for(const change of [p=>p.mysticSpellPower=16,p=>p.mysticSpellPower=.5,p=>p.spellMasteries.unknown=1,p=>p.heroTitles.title_wizard=-1,p=>p.townBuffs.chapel='tavern_drink_dark_desire',p=>p.townBuffs.extra='chapel_damage',p=>p.spellMasteries=[]]){
    b.progression=emptyProgression();change(b.progression);assert.throws(()=>validatePlannerBuild(b,catalog));
  }
});
test('native import maps zero-based shop tiers, hashed spell masteries, active buffs and highest profile Wizard level',()=>{
  const c=characterFixture({class:'warrior_berserker','shop-upgrades':[gameHash('mystic'),gameHash('spell-power'),10],'weapon-masteries':[gameHash('spells_all'),2,0,gameHash('spells_physical'),1,0],'mission-buffs':[123,gameHash('chapel_damage')]});
  const wiz=characterFixture({'unique-key':42,class:'wizard',level:20}),other=characterFixture({'unique-key':43,class:'wizard_evocation',level:12});
  const rows=importCharacterProfile(profileFixture([c,wiz,other]),catalog);
  assert.equal(rows[0].error,undefined);const p=rows[0].build.progression;
  assert.equal(p.mysticSpellPower,11);assert.deepEqual(p.spellMasteries,{spells_all:2,spells_physical:1});
  assert.equal(p.heroTitles.title_wizard,20);assert.equal(p.townBuffs.chapel,'chapel_damage');
  const noShop=importCharacterProfile(profileFixture([characterFixture({'shop-upgrades':[]})]),catalog)[0];assert.equal(noShop.build.progression.mysticSpellPower,0);
  const first=importCharacterProfile(profileFixture([characterFixture({'shop-upgrades':[gameHash('mystic'),gameHash('spell-power'),0]})]),catalog)[0];assert.equal(first.build.progression.mysticSpellPower,1);
});
test('malformed progression save arrays fail character import rather than silently losing bonuses',()=>{
  for(const patch of [{'shop-upgrades':[1,2]},{'weapon-masteries':[gameHash('spells_all'),-2,0]},{'mission-buffs':[1]}]){
    assert.ok(importCharacterProfile(profileFixture([characterFixture(patch)]),catalog)[0].error);
  }
});
test('progression catalog carries original source hashes and reviewed mechanic sources',()=>{
  const p=catalog.progression;
  for(const d of [p.mystic,p.armorer,...p.spellMasteries,...p.heroTitles,...p.townBuffs])assert.match(catalog.sources[d.source],/^[a-f0-9]{64}$/);
  for(const path of p.mechanicSources)assert.match(catalog.sources[path],/^[a-f0-9]{64}$/);
  assert.equal(p.mystic.steps[10].modifiers[0]['spell-power'],60);
  assert.equal(p.armorer.steps[12].modifiers[0]['attack-power'],65);
  assert.deepEqual(p.spellMasteries[0].modifiers[0]['damage-mul'],[1,1.04]);
});

test('armorer applies its selected cumulative attack-power tier to weapon attacks, not spells',()=>{
  const b=warrior();b.progression.armorerAttackPower=13;
  assert.equal(collectStats(b,catalog).attackPower,65);
  assert.equal(normal(b,axes),75);assert.equal(normal(b,leap),226);
  assert.ok(calculateAbility(b,catalog,axes).sources.includes('tweak/town/shops/armorer.sval'));
  b.progression.armorerAttackPower=12;
  assert.equal(collectStats(b,catalog).attackPower,catalog.progression.armorer.steps[11].modifiers[0]['attack-power']);
});

test('accomplishment attributes precede conversions and affect derived stats without mutation',()=>{
  const b=warrior();b.progression.accomplishmentAttributes={str:15,dex:5,int:4,foc:3,vit:2};
  const before=structuredClone(b),base=collectStats(warrior(),catalog),stats=collectStats(b,catalog);
  for(const a of ['str','dex','int','foc','vit'])assert.equal(stats.attributes[a],base.attributes[a]+b.progression.accomplishmentAttributes[a]);
  assert.equal(stats.spellPower,base.spellPower+30);
  assert.equal(stats.armor,base.armor+30);assert.equal(stats.mana,base.mana+15);
  assert.ok(stats.health>base.health);assert.ok(stats.armorPenetration>base.armorPenetration);
  assert.ok(stats.critChance>base.critChance);assert.ok(stats.critDamage>base.critDamage);
  const axe=createGear(catalog,'twohanded_greataxe_02');b.gear.push(axe);
  const weapon=calculateAbility(b,catalog,'weapon:attack_2h_greataxe');
  const plain=structuredClone(b);plain.progression.accomplishmentAttributes=emptyProgression().accomplishmentAttributes;
  const weaponBefore=calculateAbility(plain,catalog,'weapon:attack_2h_greataxe');
  assert.equal(weapon.stats.mainHand.physical-weaponBefore.stats.mainHand.physical,3);
  assert.ok(weapon.stats.critChance>weaponBefore.stats.critChance);
  b.gear.pop();
  assert.deepEqual(b,before);
  // An attribute conversion must see the accomplishment addition as well.
  const c=structuredClone(catalog);
  c.trinkets.push({id:'accomplishment_conversion',name:'Synthetic attribute conversion',modifiers:[{class:'Modifiers::ConvertStat',from:'str',to:'str',mul:.5,add:true}]});
  b.trinkets.push({id:'accomplishment_conversion',count:1,attuned:false});
  assert.equal(collectStats(b,c).attributes.str,129);
});

test('progression defaults and exports are independent; legacy builds remain valid without new fields',()=>{
  const a=emptyProgression(),b=emptyProgression();
  assert.deepEqual(a.accomplishmentAttributes,{str:0,dex:0,int:0,foc:0,vit:0});
  a.accomplishmentAttributes.str=7;assert.equal(b.accomplishmentAttributes.str,0);
  const old=warrior();delete old.progression.armorerAttackPower;delete old.progression.accomplishmentAttributes;
  assert.doesNotThrow(()=>validatePlannerBuild(old,catalog));assert.equal(collectStats(old,catalog).attackPower,0);
  old.progression.armorerAttackPower=13;old.progression.accomplishmentAttributes={str:15,dex:0,int:0,foc:0,vit:0};
  const exported=validatePlannerBuild(JSON.parse(JSON.stringify(old)),catalog);
  assert.equal(collectStats(exported,catalog).attributes.str,86);assert.equal(collectStats(exported,catalog).attackPower,65);
  exported.progression.accomplishmentAttributes.str=1;exported.progression.armorerAttackPower=0;
  assert.equal(old.progression.accomplishmentAttributes.str,15);assert.equal(old.progression.armorerAttackPower,13);
});

test('progression rejects malformed accomplishment attributes and armorer tiers',()=>{
  const b=warrior();
  for(const attributes of [null,[],{str:-1,dex:0,int:0,foc:0,vit:0},{str:.5,dex:0,int:0,foc:0,vit:0},{str:0,dex:0,int:0,foc:0,vit:0,extra:0},{str:0,dex:0,int:0,foc:0},{str:10001,dex:0,int:0,foc:0,vit:0}]){
    b.progression=emptyProgression();b.progression.accomplishmentAttributes=attributes;assert.throws(()=>validatePlannerBuild(b,catalog));
  }
  for(const tier of [-1,.5,catalog.progression.armorer.steps.length+1]){
    b.progression=emptyProgression();b.progression.armorerAttackPower=tier;assert.throws(()=>validatePlannerBuild(b,catalog));
  }
});
