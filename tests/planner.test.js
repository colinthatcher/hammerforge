import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {TARGET,createBuild,createGear,equipGear,compatibleAffixes,availableSkills,collectStats,calculateAbility,validatePlannerBuild} from '../planner-model.js';
import {createUuid} from '../uuid.js';
const missiles='players/wizard/skills/wiz_magic_missiles.sval';
const fireball='players/wizard/skills/wiz_fireball.sval';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function state(build,path,rank=1,upgrades={}){build.skills[path]={rank,upgrades};}
function bare(c=catalog){const b=createBuild(c);for(const s of availableSkills(b,c))if(s.type!=='spell')state(b,s.source,0);return b;}
function synthetic(modifiers){const c=structuredClone(catalog);c.trinkets.push({id:'test-effects',canAttune:false,modifiers,attunedModifiers:modifiers});const b=bare(c);b.trinkets=[{id:'test-effects',attuned:false}];return [b,c];}

test('UUID helper prefers native randomUUID and generates RFC 4122 v4 IDs without it',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),crypto=globalThis.crypto,ids=new Set();
 try{
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=> 'native-id'}});
  assert.equal(createUuid(),'native-id');
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:bytes=>crypto.getRandomValues(bytes)}});
  for(let i=0;i<100;i++)ids.add(createUuid());
  assert.equal(ids.size,100);
  for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 }finally{Object.defineProperty(globalThis,'crypto',descriptor);}
});
test('build and gear creation use fallback UUIDs when randomUUID is absent',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),crypto=globalThis.crypto;
 try{
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:bytes=>crypto.getRandomValues(bytes)}});
  const build=createBuild(catalog),gear=createGear(catalog,catalog.equipment[0].id);
  assert.match(build.id,/^[0-9a-f-]{36}$/);assert.match(gear.id,/^[0-9a-f-]{36}$/);assert.notEqual(build.id,gear.id);
 }finally{Object.defineProperty(globalThis,'crypto',descriptor);}
});

test('all catalog classes create valid independent builds with available source-path focus',()=>{
 for(const cls of catalog.classes){const b=createBuild(catalog,cls.id);assert.equal(b.specializationId,cls.id);assert.ok(cls.skills.includes(b.focusSkill));assert.ok(catalog.skills[b.focusSkill]);assert.equal(catalog.skills[b.focusSkill].type,'spell');assert.deepEqual(validatePlannerBuild(b,catalog),b);for(const profile of [cls,...cls.specializations]){b.specializationId=profile.id;assert.ok(availableSkills(b,catalog).every(s=>s.source!=='players/attacks/dash.sval'));}}
 const b=createBuild(catalog),other=createBuild(catalog);assert.notEqual(b.id,other.id);b.attributes.int=42;assert.equal(other.attributes.int,0);
});
test('Magic Missiles uses source power multiplier and Intelligence critical formulas',()=>{
 const b=bare();const stats=collectStats(b,catalog);assert.equal(stats.spellPower,20);
 const chance=(1-100/110)*.3;const critDamage=1.5+.007*10+(.17*Math.sqrt(10)-.007*10)*10/500;
 close(stats.critChance,chance);close(stats.critDamage,critDamage);
 const r=calculateAbility(b,catalog,missiles);close(r.expectedHit,55*(1-chance)+87*chance);close(r.dps,r.expectedHit*3/1.6);assert.equal(r.interval,1.6);
 b.attributes.int=10;assert.equal(collectStats(b,catalog).spellPower,40);assert.ok(calculateAbility(b,catalog,missiles).dps>r.dps);
});
test('skill ranks and named projectile tiers alter only that skill',()=>{
 const b=bare();const base=calculateAbility(b,catalog,missiles),f=calculateAbility(b,catalog,fireball);
 state(b,missiles,5);assert.equal(calculateAbility(b,catalog,missiles).components[0].normalHit,99);assert.equal(base.components[0].normalHit,55);
 state(b,missiles,1,{wiz_magic_missiles_projectiles:1});assert.equal(calculateAbility(b,catalog,missiles).hits,4);
 state(b,missiles,1,{wiz_magic_missiles_projectiles:2});assert.equal(calculateAbility(b,catalog,missiles).hits,5);
 assert.equal(calculateAbility(b,catalog,fireball).dps,f.dps);
 state(b,missiles,1,{wiz_magic_missiles_jumps:2});assert.equal(calculateAbility(b,catalog,missiles).hits,3);
});
test('physical armor and Strength penetration affect missiles but not fire damage',()=>{
 const b=bare(),m=calculateAbility(b,catalog,missiles),f=calculateAbility(b,catalog,fireball);b.armored=true;
 const pen=(1-400/402)*.85,factor=1/(1+TARGET.armor*(1-pen)*catalog.facts.armorEfficiency),chance=m.stats.critChance;
 close(calculateAbility(b,catalog,missiles).expectedHit,Math.round(55*factor)*(1-chance)+Math.round(87*factor)*chance);
 assert.equal(calculateAbility(b,catalog,fireball).dps,f.dps);const before=calculateAbility(b,catalog,missiles).dps;b.attributes.str=100;assert.ok(calculateAbility(b,catalog,missiles).dps>before);
});
test('Book of Spells applies 20 power, attuned variant replaces with 40',()=>{
 const b=bare(),base=calculateAbility(b,catalog,missiles);b.trinkets=[{id:'book_spells',attuned:false}];
 assert.equal(collectStats(b,catalog).spellPower,40);assert.equal(calculateAbility(b,catalog,missiles).components[0].normalHit,60);assert.ok(calculateAbility(b,catalog,missiles).dps>base.dps);
 b.trinkets[0].attuned=true;assert.equal(collectStats(b,catalog).spellPower,60);assert.equal(calculateAbility(b,catalog,missiles).components[0].normalHit,65);
 assert.deepEqual(validatePlannerBuild(b,catalog),b);
});
test('normalized attribute, spell power, speed, crit, damage and elemental modifiers use their source fields',()=>{
 const [b,c]=synthetic([{'class':'Modifiers::StatAdd',int:[3,8]},{'class':'Modifiers::DamagePowerAdd','spell-power':20},{'class':'Modifiers::CriticalHit','spell-chance':.1},{'class':'Modifiers::CritDamage','spell-crit-dmg':.2},{'class':'Modifiers::SpeedAdd','cast-speed':.2},{'class':'Modifiers::SpeedMul','cast-speed':1.5},{'class':'Modifiers::Damage',mul:1.05,'spell-mul':1.1},{'class':'Modifiers::DamageMulAdd',fire:.2}]);
 const st=collectStats(b,c);assert.equal(st.attributes.int,18);assert.equal(st.spellPower,56);close(st.castSpeed,1.8);close(st.critChance,1-(1-(1-100/118)*.3)*.9);close(st.damageMultiplier,1.05*1.1);close(st.elements.fire,1.2);assert.equal(st.elements.physical,1);
});
test('gear rolls interpolate ranges, integer attributes round and float bonuses retain fractions',()=>{
 const c=structuredClone(catalog),base=c.equipment.find(e=>e.slot==='head');base.modifiers=[{'class':'Modifiers::StatAdd',int:[3,8]},{'class':'Modifiers::SpeedAdd','cast-speed':[.05,.15]}];
 const b=bare(c),g=createGear(c,base.id);b.gear=[g];g.roll=0;assert.equal(collectStats(b,c).attributes.int,13);close(collectStats(b,c).castSpeed,1.05);g.roll=1;assert.equal(collectStats(b,c).attributes.int,18);close(collectStats(b,c).castSpeed,1.15);
 g.roll=.5;assert.equal(collectStats(b,c).attributes.int,16);close(collectStats(b,c).castSpeed,1.1);
 g.equipped=false;assert.equal(collectStats(b,c).attributes.int,10);
});
test('unknown skills have no numbers while omitted effects retain explicitly partial core damage',()=>{
 const b=createBuild(catalog);for(const path of ['missing','__proto__']){const r=calculateAbility(b,catalog,path);assert.equal(r.supported,false);assert.equal(r.dps,null);assert.ok(r.unsupported.length);}
 const passive=calculateAbility(b,catalog,'players/wizard/skills/wiz_barrier.sval');assert.equal(passive.status,'passive');assert.equal(passive.dps,null);
 for(const id of ['fireball_bounces','fireball_blastwave']){state(b,fireball,1,{[id]:1});const r=calculateAbility(b,catalog,fireball);assert.ok(r.dps>0);assert.equal(r.status,'partial');assert.ok(r.limitations.some(n=>/bounce|Vulnerability/.test(n)));}
 state(b,fireball,1,{fireball_size:1});assert.equal(calculateAbility(b,catalog,fireball).supported,true);
 const [s,c]=synthetic([{'class':'Modifiers::TriggerEffect',trigger:'hit'}]);const r=calculateAbility(s,c,missiles);assert.ok(r.dps>0);assert.equal(r.status,'partial');assert.ok(r.limitations.some(n=>n.includes('automatic hit trigger/proc scheduling')));
});
test('specialization makes only its own added skills available',()=>{
 const b=createBuild(catalog);assert.equal(availableSkills(b,catalog).length,4);b.specializationId='wizard_evocation';assert.equal(availableSkills(b,catalog).length,6);
 assert.ok(availableSkills(b,catalog).some(s=>s.name==='Meteor Shower'));assert.ok(!availableSkills(b,catalog).some(s=>s.name==='Conjure Hydras'));
});
test('hand occupancy and same-slot gear replacement retain inventory items',()=>{
 const b=createBuild(catalog),make=slot=>createGear(catalog,catalog.equipment.find(e=>e.slot===slot).id);
 const main=make('mainhand'),off=make('offhand'),two=make('twohanded'),head=make('head'),head2=make('head');b.gear=[main,off,two,head,head2];
 equipGear(b,two,catalog);assert.equal(main.equipped,false);assert.equal(off.equipped,false);assert.equal(two.equipped,true);
 equipGear(b,main,catalog);assert.equal(two.equipped,false);equipGear(b,off,catalog);assert.equal(main.equipped,true);assert.equal(off.equipped,true);
 equipGear(b,head2,catalog);assert.equal(head.equipped,false);assert.equal(head2.equipped,true);assert.equal(b.gear.length,5);assert.doesNotThrow(()=>validatePlannerBuild(b,catalog));
});
test('validation rejects malformed references, out of range ranks/tiers/rolls, duplicates and occupancy conflicts',()=>{
 const b=createBuild(catalog),base=catalog.equipment.find(e=>e.slot==='head'),g=createGear(catalog,base.id);b.gear=[g];
 const mutations=[x=>x.gameBuildId='different-patch',x=>x.level=0,x=>x.level=1.5,x=>x.attributes.int=-1,x=>x.attributes.int=NaN,x=>x.name=' ',x=>x.specializationId='paladin',x=>x.focusSkill='wiz_magic_missiles',x=>x.skills={[missiles]:{rank:6,upgrades:{}}},x=>x.skills={[missiles]:{rank:1,upgrades:{wiz_magic_missiles_projectiles:3}}},x=>x.skills={[missiles]:{rank:1,upgrades:{missing:1}}},x=>x.skills={[fireball]:null},x=>x.gear[0]=null,x=>x.gear[0].baseId='missing',x=>x.gear[0].roll=1.1,x=>x.gear[0].affixes=[{id:'missing',roll:.5}],x=>x.gear.push({...x.gear[0]}),x=>x.gear.push({...x.gear[0],id:'other'}),x=>x.trinkets=[{id:'missing',attuned:false}],x=>x.trinkets=[{id:'book_spells',attuned:false},{id:'book_spells',attuned:true}],x=>x.trinkets=[{id:catalog.trinkets.find(t=>!t.canAttune).id,attuned:true}]];
 for(const mutate of mutations){const copy=structuredClone(b);mutate(copy);assert.throws(()=>validatePlannerBuild(copy,catalog));}for(const raw of [null,[],{},'build'])assert.throws(()=>validatePlannerBuild(raw,catalog));
 const compatible=compatibleAffixes(base,catalog);assert.ok(compatible.length);const a=compatible[0];b.gear[0].affixes=[{id:a.id,roll:.5}];assert.doesNotThrow(()=>validatePlannerBuild(b,catalog));b.gear[0].affixes.push({id:a.id,roll:.5});assert.throws(()=>validatePlannerBuild(b,catalog));
});
test('build copies and validated imports have independent nested state',()=>{
 const b=createBuild(catalog);b.gear=[createGear(catalog,catalog.equipment[0].id)];state(b,missiles,2,{wiz_magic_missiles_projectiles:1});b.trinkets=[{id:'book_spells',attuned:false}];
 const copy=validatePlannerBuild(b,catalog);copy.gear[0].roll=0;copy.skills[missiles].upgrades.wiz_magic_missiles_projectiles=2;copy.trinkets[0].attuned=true;
 assert.equal(b.gear[0].roll,.5);assert.equal(b.skills[missiles].upgrades.wiz_magic_missiles_projectiles,1);assert.equal(b.trinkets[0].attuned,false);
});

test('derived stat overrides validate, round-trip, affect combat and reset with the build copy',()=>{
 const b=bare(),natural=calculateAbility(b,catalog,missiles),original=collectStats(b,catalog);
 b.statOverrides={'attributes.int':100,health:5000,'elements.fire':2};
 const copy=validatePlannerBuild(b,catalog);assert.deepEqual(copy.statOverrides,b.statOverrides);
 assert.equal(collectStats(copy,catalog).attributes.int,100);assert.equal(collectStats(copy,catalog).spellPower,200);
 assert.ok(calculateAbility(copy,catalog,missiles).dps>natural.dps);
 assert.equal(collectStats(copy,catalog).health,5000);
 const naturalBuild=structuredClone(copy);delete naturalBuild.statOverrides;assert.equal(collectStats(naturalBuild,catalog).health,original.health);
 for(const value of [{'bogus':1},{constructor:1},{toString:1},{health:Infinity},{health:-1},{health:1000001},{critChance:1.1},{attackSpeed:0},{'attributes.nope':1}]){const invalid=structuredClone(b);invalid.statOverrides=value;assert.throws(()=>validatePlannerBuild(invalid,catalog));}
});
test('attribute override replaces equipped additive attribute total before derived stats',()=>{
 const c=structuredClone(catalog),base=c.equipment.find(e=>e.slot==='head');base.modifiers=[{'class':'Modifiers::StatAdd',int:25}];
 const b=bare(c),gear=createGear(c,base.id);b.gear=[gear];b.statOverrides={'attributes.int':77};
 assert.equal(collectStats(b,c).attributes.int,77);assert.equal(collectStats(b,c).spellPower,154);
});

test('existing Dash selections migrate without discarding the rest of the build',()=>{
 const b=createBuild(catalog);b.focusSkill='players/attacks/dash.sval';b.skills[b.focusSkill]={rank:1,upgrades:{}};state(b,missiles,3);b.trinkets=[{id:'book_spells',attuned:true}];
 const migrated=validatePlannerBuild(b,catalog);assert.equal(migrated.focusSkill,missiles);assert.equal(migrated.skills['players/attacks/dash.sval'],undefined);assert.equal(migrated.skills[missiles].rank,3);assert.deepEqual(migrated.trinkets,b.trinkets);assert.equal(b.focusSkill,'players/attacks/dash.sval');
});
