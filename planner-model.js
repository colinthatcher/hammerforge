import {computeCombatStats} from './combat/stats.js';
import {calculateCore} from './combat/calculate.js';
import {validConditions} from './combat/statuses.js';
import {validProgression} from './combat/progression.js';
import {validCombo} from './combat/combos.js';
import {calculateComboDamage} from './combat/combo-damage.js';
import {weaponDefinition,equippedWeaponAttacks} from './combat/weapon-equipment.js';
import {LEGACY_TARGET} from './combat/targets.js';
import {validateStatOverrides} from './combat/stat-overrides.js';
import {createUuid} from './uuid.js';
export {STAT_OVERRIDE_FIELDS,STAT_OVERRIDE_PATHS,validateStatOverrides} from './combat/stat-overrides.js';

export const ATTRIBUTES={str:'Strength',dex:'Dexterity',int:'Intelligence',foc:'Focus',vit:'Vitality'};
export const SLOT_LABELS={mainhand:'Main Hand',offhand:'Off Hand',twohanded:'Two-Handed',head:'Head',chest:'Chest',feet:'Feet',hands:'Hands',back:'Back'};
export const TARGET={health:10000,armor:100};
export function resolveTarget(build,catalog){
  if(!build.targetId||build.targetId==='generic')return {...LEGACY_TARGET,armor:build.armored?100:0};
  const target=(catalog.targets||[]).find(t=>t.id===build.targetId);
  if(!target)throw Error('Invalid version 2 planner build');
  return target;
}
export const calculateCombo=(build,catalog)=>calculateComboDamage(build,catalog,resolveTarget(build,catalog));
export const gearIntensity=item=>item.itemLevel===undefined?item.roll:(item.itemLevel+item.upgradeLevel-1)/9;
const attributeKeys=Object.keys(ATTRIBUTES),DASH_PATH='players/attacks/dash.sval';
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const validText=value=>typeof value==='string'&&value.trim().length>0&&value.length<=100;
const finiteIn=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const slotKey=slot=>String(slot??'').toLowerCase().replace(/[^a-z]/g,'');
const findClass=(catalog,id)=>catalog.classes.find(c=>c.id===id);
const findSkill=(catalog,path)=>Object.hasOwn(catalog.skills,path)?catalog.skills[path]:undefined;
export const abilityDefinition=(catalog,path)=>findSkill(catalog,path)||weaponDefinition(catalog,path);
const getSpec=(catalog,build)=>findClass(catalog,build.classId)?.specializations.find(s=>s.id===build.specializationId);
function skillPaths(build,catalog){const cls=findClass(catalog,build.classId),profile=getSpec(catalog,build)||cls;return new Set((profile?.skills||[]).filter(path=>path!==DASH_PATH));}
function firstDamagingPath(paths,catalog){return [...paths].find(path=>findSkill(catalog,path)?.type==='spell')||[...paths][0];}
export function createBuild(catalog,classId='wizard'){
  const cls=findClass(catalog,classId);if(!cls)throw Error(`Unknown class: ${classId}`);
  return {version:2,gameBuildId:catalog.buildId,id:createUuid(),name:`New ${cls.name} build`,classId,specializationId:classId,level:20,attributes:Object.fromEntries(attributeKeys.map(a=>[a,0])),armored:false,focusSkill:firstDamagingPath(new Set(cls.skills.filter(p=>p!==DASH_PATH)),catalog),skills:{},gear:[],trinkets:[]};
}
export function availableSkills(build,catalog){return [...[...skillPaths(build,catalog)].map(path=>findSkill(catalog,path)).filter(Boolean),...equippedWeaponAttacks(build,catalog)];}
export function createGear(catalog,baseId){const base=catalog.equipment.find(e=>e.id===baseId);if(!base)throw Error(`Unknown equipment: ${baseId}`);return {id:createUuid(),baseId,name:base.name,equipped:true,roll:.5,affixes:[]};}
export function equipGear(build,item,catalog){
  const base=catalog.equipment.find(e=>e.id===item.baseId);if(!base)return item;
  const slot=slotKey(base.slot),hands=['mainhand','offhand','twohanded'];
  for(const other of build.gear){const otherSlot=slotKey(catalog.equipment.find(e=>e.id===other.baseId)?.slot);if(slot===otherSlot||hands.includes(slot)&&hands.includes(otherSlot)&&(slot==='twohanded'||otherSlot==='twohanded'))other.equipped=false;}
  item.equipped=true;return item;
}
export function compatibleAffixes(base,catalog){return catalog.affixes.filter(a=>(a.tags||[]).some(tag=>(base.tags||[]).includes(tag)));}
export function collectStats(build,catalog){return computeCombatStats(build,catalog);}
export function calculateAbility(build,catalog,path){
   const skill=abilityDefinition(catalog,path),available=skill&&(skill.weaponAttack?equippedWeaponAttacks(build,catalog).some(a=>a.id===skill.id):skillPaths(build,catalog).has(path));
  const stats=computeCombatStats(build,catalog,available?skill:undefined);
   if(!available)return {supported:false,status:skill?.weaponAttack?'missing-equipment':'unsupported',kind:'unknown',dps:null,expectedHit:null,interval:null,hits:null,damage:null,components:[],stats,notes:[],limitations:[],unsupported:[skill?.weaponAttack?'Equip the matching weapon and attack variant to calculate this attack':`Skill unavailable to selected specialization: ${path}`]};
   return calculateCore(build,catalog,skill,stats,resolveTarget(build,catalog));
}
export function validatePlannerBuild(raw,catalog){
  const fail=()=>{throw Error('Invalid version 2 planner build');};
   if(!isRecord(raw)||raw.version!==2||raw.gameBuildId!==catalog.buildId||!validText(raw.id)||!validText(raw.name)||!validText(raw.classId)||!validText(raw.specializationId)||!findClass(catalog,raw.classId)||!getSpec(catalog,raw)&&raw.specializationId!==raw.classId||!Number.isInteger(raw.level)||!finiteIn(raw.level,1,10000)||!isRecord(raw.attributes)||!attributeKeys.every(a=>Number.isInteger(raw.attributes[a])&&finiteIn(raw.attributes[a],0,10000))||typeof raw.armored!=='boolean'||raw.targetId!==undefined&&(typeof raw.targetId!=='string'||!['generic',...(catalog.targets||[]).map(t=>t.id)].includes(raw.targetId))||!Array.isArray(raw.gear)||raw.gear.length>100||!Array.isArray(raw.trinkets)||raw.trinkets.length>catalog.trinkets.length||!isRecord(raw.skills))fail();
  if(raw.shadowCurses!==undefined&&(!Number.isInteger(raw.shadowCurses)||!finiteIn(raw.shadowCurses,0,100000)))fail();
  if(raw.ngp!==undefined&&(!Number.isInteger(raw.ngp)||!finiteIn(raw.ngp,0,10000)))fail();
  if(raw.currentManaPercent!==undefined&&!finiteIn(raw.currentManaPercent,0,100))fail();
   if(raw.conditions!==undefined&&!validConditions(raw.conditions,catalog))fail();
   if(raw.statOverrides!==undefined){try{validateStatOverrides(raw.statOverrides);}catch{fail();}}
  if(raw.progression!==undefined&&!validProgression(raw.progression,catalog))fail();
  if(raw.combo!==undefined&&!validCombo(raw.combo,catalog))fail();
  const build=structuredClone(raw);
  if(build.importInfo!==undefined){const info=build.importInfo;if(!isRecord(info)||typeof info.sourceId!=='string'||info.sourceId.length>1000||typeof info.profile!=='string'||info.profile.length>1000||typeof info.fileName!=='string'||info.fileName.length>1000||!Array.isArray(info.warnings)||info.warnings.length>1000||!info.warnings.every(w=>typeof w==='string'&&w.length<=2000)||!Number.isInteger(info.unresolvedEquipped)||!finiteIn(info.unresolvedEquipped,0,1000))fail();}
  const paths=skillPaths(build,catalog);delete build.skills[DASH_PATH];if(build.focusSkill===DASH_PATH)build.focusSkill=firstDamagingPath(paths,catalog);
  const byPath=new Map([...paths].map(path=>[path,findSkill(catalog,path)]));
  if(typeof build.focusSkill!=='string'||!byPath.has(build.focusSkill)&&!weaponDefinition(catalog,build.focusSkill))fail();
  for(const [path,state] of Object.entries(build.skills)){
    const skill=byPath.get(path);if(!skill||!isRecord(state)||!Number.isInteger(state.rank)||state.rank<0||state.rank>skill.rankCount||!isRecord(state.upgrades))fail();
    for(const [id,tier] of Object.entries(state.upgrades)){const def=skill.upgrades.find(u=>u.id===id);if(!def||!Number.isInteger(tier)||tier<0||tier>def.tiers)fail();}
  }
  const gearIds=new Set();
  for(const item of build.gear){
    if(!isRecord(item))fail();const base=catalog.equipment.find(e=>e.id===item.baseId);
    if(!validText(item.id)||gearIds.has(item.id)||!base||!validText(item.name)||typeof item.equipped!=='boolean'||!finiteIn(item.roll,0,1)||!Array.isArray(item.affixes))fail();
    if(item.itemLevel!==undefined&&(!Number.isInteger(item.itemLevel)||!finiteIn(item.itemLevel,1,10000)||!Number.isInteger(item.upgradeLevel)||!finiteIn(item.upgradeLevel,0,10000)))fail();
    if(item.sourceQuality!==undefined&&(!Number.isInteger(item.sourceQuality)||!finiteIn(item.sourceQuality,0,255)))fail();
    if(item.unresolvedModifiers!==undefined&&(!Array.isArray(item.unresolvedModifiers)||item.unresolvedModifiers.length>100||!item.unresolvedModifiers.every(v=>typeof v==='string'&&/^0x[a-f0-9]{8}$/.test(v))))fail();
    gearIds.add(item.id);const allowed=new Set(compatibleAffixes(base,catalog).map(a=>a.id)),ids=new Set();
    for(const a of item.affixes){if(!isRecord(a)||!allowed.has(a.id)||ids.has(a.id)||!finiteIn(a.roll,0,1))fail();ids.add(a.id);}
  }
  const occupied=new Set(),hands=['mainhand','offhand','twohanded'];
  for(const item of build.gear.filter(g=>g.equipped)){const slot=slotKey(catalog.equipment.find(e=>e.id===item.baseId).slot);if(occupied.has(slot)||hands.includes(slot)&&[...occupied].some(other=>hands.includes(other)&&(slot==='twohanded'||other==='twohanded')))fail();occupied.add(slot);}
  const trinketIds=new Set();let count=0;
  for(const t of build.trinkets){if(!isRecord(t))fail();const def=catalog.trinkets.find(d=>d.id===t.id),copies=t.count??1;if(!def||trinketIds.has(t.id)||typeof t.attuned!=='boolean'||t.attuned&&!def.canAttune||!Number.isInteger(copies)||!finiteIn(copies,1,1000))fail();count+=copies;if(count>1000)fail();trinketIds.add(t.id);}
  return build;
}
