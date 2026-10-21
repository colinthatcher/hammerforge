import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear,availableSkills,calculateAbility,calculateCombo,validatePlannerBuild,resolveTarget} from '../planner-model.js';
import {mitigateDamage} from '../combat/targets.js';

const copyCatalog=()=>{const c=structuredClone(catalog);c.facts.armorNegativeMultiplier=1; c.targets=[
 {id:'dummy-normal',name:'Normal dummy',health:10000000,armor:0,resistances:{fire:0,ice:0,lightning:0,poison:0},source:'fixture',tags:[],immuneBuffTags:[],mechanicSources:['fixture-target-source']},
 {id:'dummy-magic',name:'Magic dummy',health:10000000,armor:0,resistances:{fire:100,ice:100,lightning:100,poison:100},source:'fixture',tags:[],immuneBuffTags:[],mechanicSources:['fixture-target-source']},
 {id:'dummy-armored',name:'Armored dummy',health:10000000,armor:50,resistances:{fire:0,ice:0,lightning:0,poison:0},source:'fixture',tags:[],immuneBuffTags:[],mechanicSources:['fixture-target-source']}
 ];return c;};
function build(c,classId='wizard'){const b=createBuild(c,classId);for(const s of availableSkills(b,c))if(s.type!=='spell')b.skills[s.source]={rank:0,upgrades:{}};return b;}
test('catalog target presets override generic armor flag; generic legacy values and validation roundtrip persist',()=>{
 const c=copyCatalog(),b=build(c);b.armored=true;let generic=calculateAbility(b,c,b.focusSkill);assert.equal(generic.components[0].normalHit,37);
 b.targetId='dummy-normal';const preset=calculateAbility(b,c,b.focusSkill);assert.equal(preset.components[0].normalHit,55);assert.ok(preset.sources.includes('fixture-target-source'));assert.ok(preset.notes.some(n=>n.includes('Normal dummy')));
 const saved=validatePlannerBuild(b,c);assert.equal(saved.targetId,'dummy-normal');assert.throws(()=>validatePlannerBuild({...saved,targetId:'bad'},c));
 for(const targetId of [null,42,{},[],false,''])assert.throws(()=>validatePlannerBuild({...saved,targetId},c));
 const copy=validatePlannerBuild(JSON.parse(JSON.stringify(saved)),c);copy.targetId='dummy-magic';assert.equal(saved.targetId,'dummy-normal');
});
test('source mitigation rounds armor/resistance before vulnerability, elemental channels and negative defenses',()=>{
 const c=copyCatalog(),target={armor:50,resistances:{fire:100,ice:100,lightning:0,poison:-100}},stats={armorPenetration:0,elementalPenetration:{fire:.5,ice:0,lightning:0,poison:0}};
 assert.equal(mitigateDamage(103,'fire',target,stats,c,{damageTaken:1.5}),123); // round(103/1.25)=82, then round × 1.5
 assert.equal(mitigateDamage(100,'ice',target,stats,c),67);
 assert.equal(mitigateDamage(100,'poison',target,stats,c),150);
 assert.equal(mitigateDamage(100,'fire',target,stats,c,{damageTaken:1.5}),120); // round(100/1.25)=80, then vulnerability
 assert.equal(mitigateDamage(100,'physical',{armor:-100,resistances:{}},stats,c),150); // negative armor amplifies damage
 assert.equal(mitigateDamage(100,'pure',target,stats,c),100);
 stats.armorPenetration=.9;stats.elementalPenetration.poison=.9;
 assert.equal(mitigateDamage(100,'poison',target,stats,c),150);
 assert.equal(mitigateDamage(100,'physical',{armor:-100,resistances:{}},stats,c),150);
 assert.equal(mitigateDamage(1,'ice',{resistances:{ice:10000}},stats,c),1);
 assert.equal(mitigateDamage(100,'pure',target,stats,c,{damageTaken:1.5}),150);
});
test('combo uses shared target armor mitigation',()=>{
 const c=copyCatalog(),b=build(c);b.combo={skills:{combo_kills:1,combo_nova:1},active:true,burstActive:false};b.targetId='dummy-normal';
 const normal=calculateCombo(b,c);assert.ok(normal.supported);
 b.targetId='dummy-magic';assert.equal(calculateCombo(b,c).normalHit,normal.normalHit);
 b.targetId='dummy-armored';const armored=calculateCombo(b,c);
 assert.ok(armored.normalHit<normal.normalHit);
 assert.equal(armored.normalHit,mitigateDamage(normal.normalHit,'physical',resolveTarget(b,c),armored.stats,c));
 assert.ok(armored.sources.includes('fixture-target-source'));
});
test('elemental penetration from gear reaches resistance mitigation without affecting other channels',()=>{
 const c=copyCatalog(),b=build(c,'paladin');b.gear=[createGear(c,'mainhand_mace_01')];b.targetId='dummy-magic';
 b.gear[0].affixes=[{id:'mod_weapon_dmg_fire_1',roll:.5}];
 const path='weapon:attack_swing_mace',base=calculateAbility(b,c,path);
 const gloves=createGear(c,'hands_str_1a');gloves.affixes=[{id:'mod_fire_penetration',roll:.5}];b.gear.push(gloves);
 const after=calculateAbility(b,c,path);
 assert.ok(after.stats.elementalPenetration.fire>0);
 assert.ok(after.components.find(c=>c.element==='fire').normalHit>base.components.find(c=>c.element==='fire').normalHit);
 assert.equal(after.components.find(c=>c.element==='physical').normalHit,base.components.find(c=>c.element==='physical').normalHit);
});
