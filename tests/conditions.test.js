import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,calculateAbility,collectStats,validatePlannerBuild,availableSkills} from '../planner-model.js';
import {playerConditions} from '../combat/statuses.js';
const missiles='players/wizard/skills/wiz_magic_missiles.sval';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const conditions=(b,player={},enemy={})=>b.conditions={player,enemy};

test('Vulnerability scales rounded hits, Marked combines independent crit chance, and clearing restores damage',()=>{
 const b=createBuild(catalog),base=calculateAbility(b,catalog,missiles),hit=base.components[0];
 conditions(b,{}, {vulnerability:'vulnerability'});
 const vuln=calculateAbility(b,catalog,missiles).components[0];
 assert.equal(vuln.normalHit,Math.round(hit.normalHit*1.2));assert.equal(vuln.criticalHit,Math.round(hit.criticalHit*1.2));
 conditions(b,{}, {marked:'marked_greater'});
 const marked=calculateAbility(b,catalog,missiles).components[0],chance=1-(1-base.stats.critChance)*.7;
 close(marked.expectedHit,hit.normalHit*(1-chance)+hit.criticalHit*chance);
 delete b.conditions;assert.equal(calculateAbility(b,catalog,missiles).dps,base.dps);
});

test('Armor Break changes physical mitigation only on armored targets and controls do not invent damage',()=>{
 const b=createBuild(catalog),base=calculateAbility(b,catalog,missiles).dps;
 conditions(b,{}, {armor_break:'armor_break_greater',stun:'stun'});
 assert.equal(calculateAbility(b,catalog,missiles).dps,base);
 b.armored=true;const broken=calculateAbility(b,catalog,missiles).dps;
 delete b.conditions;assert.ok(broken>calculateAbility(b,catalog,missiles).dps);
});

test('Haste resolves selected rank and upgrades, only while available and enabled',()=>{
 const b=createBuild(catalog);b.specializationId='wizard_transmutation';
 const f=playerConditions(b,catalog).find(f=>f.id==='haste');assert.equal(f.available,true);
 const before=collectStats(b,catalog).castSpeed;conditions(b,{haste:1});
 close(collectStats(b,catalog).castSpeed,before+.3);
 b.skills['players/wizard/skills/transmutation_haste.sval']={rank:0,upgrades:{}};
 close(collectStats(b,catalog).castSpeed,before);
 b.specializationId='wizard';close(collectStats(b,catalog).castSpeed,before);
});

test('stack intensity interpolates endpoints and uses resolved upgrade injections',()=>{
 const b=createBuild(catalog,'warrior'),f=playerConditions(b,catalog).find(f=>f.id==='killing_spree');
 assert.equal(f.max,10);const before=collectStats(b,catalog).damageMultiplier;
 conditions(b,{killing_spree:1});close(collectStats(b,catalog).damageMultiplier,before*1.02);
 conditions(b,{killing_spree:10});close(collectStats(b,catalog).damageMultiplier,before*1.2);
 const skill=availableSkills(b,catalog).find(s=>s.id==='killing_spree');
 b.skills[skill.source]={rank:1,upgrades:{killing_spree_crit:1}};
 const crit=collectStats(b,catalog).critChance;delete b.conditions;
 close(crit,1-(1-collectStats(b,catalog).critChance)*.9);
});

test('fixed buffs respect class availability and validated state survives export with independent copies',()=>{
 const b=createBuild(catalog,'sorcerer'),before=collectStats(b,catalog).castSpeed;
 conditions(b,{powersurge:'powersurge_3'},{vulnerability:'vulnerability_minor'});
 close(collectStats(b,catalog).castSpeed,before+.3);
 const imported=validatePlannerBuild(JSON.parse(JSON.stringify(b)),catalog);assert.deepEqual(imported,b);
 imported.conditions.enemy.vulnerability='vulnerability_greater';assert.equal(b.conditions.enemy.vulnerability,'vulnerability_minor');
 for(const bad of [null,[],{player:{},enemy:{unknown:'unknown'}},{player:{haste:2},enemy:{}},{player:{powersurge:'missing'},enemy:{}},{player:{},enemy:{vulnerability:2}}]){
  const copy=structuredClone(b);copy.conditions=bad;assert.throws(()=>validatePlannerBuild(copy,catalog));
 }
 delete b.conditions;assert.doesNotThrow(()=>validatePlannerBuild(b,catalog));
});

test('all available catalog stack buffs produce finite snapshots without mutating definitions',()=>{
 const original=JSON.stringify(catalog.statuses);
 for(const cls of catalog.classes)for(const profile of [cls,...cls.specializations]){
  const b=createBuild(catalog,cls.id);b.specializationId=profile.id;
  for(const f of playerConditions(b,catalog).filter(f=>f.kind==='stack'&&f.available)){
   conditions(b,{[f.id]:f.max});
   for(const skill of availableSkills(b,catalog).filter(s=>s.type==='spell')){
    const r=calculateAbility(b,catalog,skill.source);
    assert.ok(Number.isFinite(r.stats.spellPower),`${profile.id}: ${f.id}`);
    if(r.supported)assert.ok(Number.isFinite(r.dps),`${skill.id}: ${f.id}`);
   }
  }
 }
 assert.equal(JSON.stringify(catalog.statuses),original);
});

test('Marked does not add criticals to explicit DoT components',()=>{
 // Synthetic DoT flag on a real damage path; periodic effects aren't implicitly DoT.
 const c=structuredClone(catalog),b=createBuild(c,'priest'),skill=Object.values(c.skills).find(s=>s.id==='inner_light');
 skill.rankOverrides[0].binds['explode-effects'][0].dot=true;
 const base=calculateAbility(b,c,skill.source);assert.equal(base.components[0].dot,true);
 conditions(b,{}, {marked:'marked_greater'});
 const marked=calculateAbility(b,c,skill.source);
 assert.equal(marked.components[0].expectedHit,base.components[0].normalHit);
});
