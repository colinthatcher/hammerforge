import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear,availableSkills,calculateAbility,collectStats} from '../planner-model.js';
import {resolveSkill,mergeDefinition} from '../combat/definitions.js';
const skillById=id=>Object.values(catalog.skills).find(s=>s.id===id);
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
function bare(classId='wizard',specialization=classId,c=catalog){const b=createBuild(c,classId);b.specializationId=specialization;for(const s of availableSkills(b,c))if(s.type!=='spell')b.skills[s.source]={rank:0,upgrades:{}};return b;}
function set(b,id,rank=1,upgrades={}){const skill=skillById(id);b.skills[skill.source]={rank,upgrades};return skill.source;}
function result(b,id,c=catalog){return calculateAbility(b,c,skillById(id).source);}
function withEffects(effects,b=bare()){
  const c=structuredClone(catalog);c.trinkets.push({id:'fixture',name:'Fixture effects',canAttune:false,modifiers:effects,attunedModifiers:effects});b.trinkets.push({id:'fixture',attuned:false});return [b,c];
}

test('every class and specialization has finite core damage for learned damaging spells',()=>{
  let damageIds=new Set(),checks=0;
  for(const cls of catalog.classes)for(const profile of [cls,...cls.specializations]){
    const b=bare(cls.id,profile.id);b.gear=[createGear(catalog,'mainhand_mace_01')];
    for(const skill of availableSkills(b,catalog)){
      if(skill.type!=='spell')continue;
      const run=()=>{const r=calculateAbility(b,catalog,skill.source);checks++;assert.ok(['utility','damage'].includes(r.kind),skill.id);if(r.kind==='utility'){assert.equal(r.dps,null);assert.equal(r.status,'utility');return;}damageIds.add(skill.id);assert.ok(r.supported,`${skill.id}: ${r.unsupported.join(';')}`);assert.ok(Number.isFinite(r.dps)&&r.dps>0,skill.id);assert.ok(r.components.length);close(r.components.reduce((s,c)=>s+c.dps,0),r.dps);assert.ok(r.sources.every(path=>Object.hasOwn(catalog.sources,path)),`${skill.id}: missing source hash`);};
      for(let rank=1;rank<=skill.rankCount;rank++){b.skills[skill.source]={rank,upgrades:{}};run();}
      for(const u of skill.upgrades)for(let tier=1;tier<=u.tiers;tier++){b.skills[skill.source]={rank:skill.rankCount,upgrades:{[u.id]:tier}};run();}
    }
  }
  assert.equal(damageIds.size,36);assert.ok(checks>900);
});
test('utilities, passive procs, unlearned skills and absent weapons have distinct statuses',()=>{
  const b=bare('warrior');assert.equal(result(b,'warcry').status,'utility');assert.equal(result(b,'warcry').dps,null);
  set(b,'constitution',1);assert.equal(result(b,'constitution').status,'passive');assert.equal(result(b,'constitution').dps,null);
  set(b,'whirling_axes',0);assert.equal(result(b,'whirling_axes').status,'unlearned');
  const rogue=bare('rogue');assert.equal(result(rogue,'rog_flurry').status,'missing-equipment');
});
test('directional casting and cooldown use sequential source clocks; legacy Fireball overlaps them',()=>{
  const mage=bare(),paladin=bare('paladin');close(result(mage,'wiz_magic_missiles').interval,1.6);close(result(mage,'fireball').interval,5);close(result(paladin,'pal_blessed_strikes').interval,1.75);
  const [b,c]=withEffects([{class:'Modifiers::SpeedAdd','cast-speed':.5}],mage);close(result(b,'wiz_magic_missiles',c).interval,1.6/1.5);close(result(b,'fireball',c).interval,5/1.5);
});
test('Hourglass and named spell cooldown modifiers stack multiplicatively and preserve passive slots',()=>{
  const b=bare();b.trinkets=[{id:'hourglass',attuned:false}];close(result(b,'wiz_magic_missiles').interval,1.1);
  const intellect=skillById('wiz_arcane_intellect'),scholar=intellect.upgrades.find(u=>u.id==='wiz_arcane_intellect_scholar');
  set(b,intellect.id,1,{[scholar.id]:scholar.tiers});const resolved=resolveSkill(intellect,b.skills[intellect.source]).resolved;
  assert.ok(resolved.modifiers[0].some(m=>m.class==='Modifiers::ConvertStat'));assert.ok(resolved.modifiers[1].some(m=>m.class==='Modifiers::BaseSkillModifier'));
  assert.equal(collectStats(b,catalog).attributes.int,11);close(result(b,'wiz_magic_missiles').interval,.6+1*.5*.5);
});
test('persistent areas and summons keep lifetime/cap floors when caster speed increases',()=>{
  const [totem,c]=withEffects([{class:'Modifiers::SpeedAdd','cast-speed':3},{class:'Modifiers::SummonStatMulAdd','damage-mul':.3}],bare('warrior','warrior_primalist'));
  const r=result(totem,'primalist_totem',c);close(r.interval,7000/3/1000);assert.equal(r.stats.summonDamageMultiplier,1.3);assert.equal(r.components[0].summon,true);
  const [cloud,cloudCatalog]=withEffects([{class:'Modifiers::SpeedAdd','cast-speed':99}],bare('rogue','rogue_poison'));close(result(cloud,'poison_cloud',cloudCatalog).interval,6);
});
test('only explicit engine DoT flags suppress critical and dynamic Damage modifier paths',()=>{
  const b=bare('priest'),c=structuredClone(catalog),skill=Object.values(c.skills).find(s=>s.id==='inner_light');
  skill.rankOverrides[0].binds['explode-effects'][0].dot=true;
  c.trinkets.push({id:'fixture-dot',name:'Fixture',canAttune:false,modifiers:[{class:'Modifiers::Damage',mul:2}],attunedModifiers:[]});b.trinkets=[{id:'fixture-dot',attuned:false}];
  const r=result(b,'inner_light',c);assert.equal(r.components[0].dot,true);assert.equal(r.components[0].normalHit,66);assert.equal(r.components[0].expectedHit,66);
  const periodic=bare('rogue','rogue_poison'),normal=result(periodic,'poison_cloud');assert.notEqual(normal.components[0].expectedHit,normal.components[0].normalHit);
});
test('normal and critical damage are rounded independently before physical armor',()=>{
  const b=bare();const r=result(b,'wiz_magic_missiles'),piece=r.components[0];assert.equal(piece.normalHit,55);assert.equal(piece.criticalHit,87);close(piece.expectedHit,55*(1-r.stats.critChance)+87*r.stats.critChance);
  b.armored=true;const armored=result(b,'wiz_magic_missiles'),p=armored.components[0];assert.equal(p.normalHit,37);assert.equal(p.criticalHit,58);close(p.expectedHit,37*(1-r.stats.critChance)+58*r.stats.critChance);
});
test('mixed physical/ice Spirit Wolves mitigate only physical; fractional counts are not invented',()=>{
  const b=bare('ranger','ranger_beasts'),plain=result(b,'beasts_spirit_wolves');assert.deepEqual(plain.components.map(p=>[p.element,p.baseDamage,p.hits]),[['physical',60,5],['ice',60,5]]);
  b.armored=true;const armored=result(b,'beasts_spirit_wolves');assert.ok(armored.components[0].damage<plain.components[0].damage);assert.equal(armored.components[1].damage,plain.components[1].damage);
});
test('Flurry and Mortal Strike use all raw mainhand channels, not commented flat tooltip damage',()=>{
  const c=structuredClone(catalog),weapon=c.equipment.find(e=>e.id==='mainhand_mace_01');weapon.modifiers=[{class:'Modifiers::DamageAdd',physical:100,fire:20}];
  const b=bare('rogue','rogue_blades',c);b.gear=[createGear(c,weapon.id)];
  const flurry=result(b,'rog_flurry',c);assert.deepEqual(flurry.components.map(p=>[p.element,p.baseDamage,p.hits]),[['physical',30,3],['fire',6,3]]);
  const strike=result(b,'blades_mortal_strike',c);assert.deepEqual(strike.components.map(p=>[p.element,p.baseDamage,p.hits]),[['physical',200,1],['fire',40,1]]);
});
test('Shocking Assault fires three separate scheduled shocks at every upgrade tier',()=>{
  const b=bare('rogue');b.gear=[createGear(catalog,'mainhand_mace_01')];
  for(const [tier,amount] of [[1,30],[2,60],[3,90]]){
    set(b,'rog_flurry',1,{rog_flurry_of_blades_lightning:tier});const r=result(b,'rog_flurry');
    const shock=r.components.find(c=>c.element==='lightning');assert.equal(shock.baseDamage,amount);assert.equal(shock.hits,3);
    const weapon=r.components.find(c=>c.weaponDerived);assert.equal(weapon.hits,3);
  }
});
test('Soul Vortex lightning uses its own 250ms schedule rather than the 500ms pulse schedule',()=>{
  const b=bare('warlock','warlock_souls');
  for(const [rank,duration,amount] of [[1,8000,25],[3,10000,35],[5,12000,45]]){
    set(b,'soul_vortex',rank,{soul_vortex_lightning:1});const r=result(b,'soul_vortex');
    assert.equal(r.components.find(c=>c.element==='physical').hits,duration/500);
    assert.equal(r.components.find(c=>c.element==='poison').hits,duration/500);
    const lightning=r.components.find(c=>c.element==='lightning');assert.equal(lightning.hits,duration/250);assert.equal(lightning.baseDamage,Math.round(amount*.4));
    assert.ok(r.limitations.some(n=>n.includes('jitter')));
  }
});
test('Holy Blast keeps its channel/end wall-time floor while cast speed changes pulse cadence',()=>{
  const b=bare('priest','priest_divine_light'),base=result(b,'holy_blast');assert.equal(base.components[0].hits,4);close(base.castTime,1.38);
  const [fast,c]=withEffects([{class:'Modifiers::SpeedAdd','cast-speed':1}],b),r=result(fast,'holy_blast',c);assert.equal(r.components[0].hits,8);close(r.castTime,1.23);close(r.interval,6.23);assert.ok(r.limitations.some(n=>n.includes('conservatively')));
});
test('Intelligence gear, spell power, cast speed and source skill filters change the appropriate core',()=>{
  const b=bare(),initial=result(b,'wiz_magic_missiles');const g=createGear(catalog,'head_str_t1a');g.affixes=[{id:'mod_int',roll:1}];b.gear=[g];assert.ok(result(b,'wiz_magic_missiles').dps>initial.dps);
  const [filtered,c]=withEffects([{class:'Modifiers::BaseSkillModifier','skill-tags':['fire'],'damage-mul':2,'cooldown-mul':.5}],bare());
  close(result(filtered,'wiz_magic_missiles',c).dps,initial.dps);assert.ok(result(filtered,'fireball',c).dps>result(bare(),'fireball').dps*3);
});
test('unconditional passive ranks and upgrades affect core stats while unselected stacks remain inactive',()=>{
  const b=bare('sorcerer');const before=result(b,'static_discharge');set(b,'innate_power',5);const after=result(b,'static_discharge');assert.ok(after.stats.critChance>before.stats.critChance);assert.ok(after.dps>before.dps);
  set(b,'elemental_affinity',1);const dynamic=result(b,'static_discharge');assert.ok(dynamic.notes.some(n=>n.includes('stack bonus inactive')));assert.equal(dynamic.stats.elements.lightning,1);
});
test('Shadow curse count is used only when known for saved per-curse conversions',()=>{
  const b=bare();b.trinkets=[{id:'pickled_eye',attuned:false}];assert.ok(result(b,'wiz_magic_missiles').limitations.some(n=>n.includes('shadowcurses')));b.shadowCurses=5;assert.equal(collectStats(b,catalog).spellPower,35);
});
test('Flagellate includes truncated Thorns contribution and passive health-based Retribution',()=>{
  const b=bare('priest','priest_flaggelant');set(b,'retribution',1);const r=result(b,'flagellate');assert.equal(r.stats.health,197);assert.equal(r.stats.thorns,41);assert.equal(r.components[0].baseDamage,100);
  b.attributes.vit=20;assert.ok(result(b,'flagellate').components[0].baseDamage>r.components[0].baseDamage);
});
test('source upgrade conflicts are surfaced without a misleading damage number',()=>{
  const b=bare('paladin');set(b,'pal_blessed_strikes',1,{pal_blessed_strikes_fire:1,pal_blessed_strikes_lightning:1});assert.equal(result(b,'pal_blessed_strikes').status,'conflict');assert.equal(result(b,'pal_blessed_strikes').dps,null);
});
test('source rank selection does not inherit a field found only on a previous rank',()=>{
  const skill={rankOverrides:[{binds:{amount:10,flag:0}},{binds:{amount:20,flag:1}},{binds:{amount:30}}],rankCount:3,upgrades:[],tags:[]};
  const r=resolveSkill(skill,{rank:3,upgrades:{}}).resolved;assert.equal(r.binds.amount,30);assert.equal(r.binds.flag,0);
  const merged=mergeDefinition({modifiers:[[{class:'A'}],[{class:'B'}]]},{modifiers:[[''],[{class:'C'}],[]]});assert.deepEqual(merged.modifiers,[[{class:'A'}],[{class:'C'}],[]]);
});
test('known damage survives excluded triggered effects with a partial label and explicit limitation',()=>{
  const base=bare(),expected=result(base,'wiz_magic_missiles');const [b,c]=withEffects([{class:'Modifiers::TriggerEffect',trigger:'hit',effects:[{class:'Damage',fire:500}]}],base);
  const r=result(b,'wiz_magic_missiles',c);assert.equal(r.status,'partial');assert.equal(r.dps,expected.dps);assert.ok(r.limitations.some(n=>n.includes('automatic hit trigger/proc scheduling')));assert.ok(r.components.every(p=>p.element==='physical'));
});
