import {resolveSkill,elements} from './definitions.js';
import {resolveWarriorRanger} from './warrior-ranger.js';
import {resolvePaladinPriest} from './paladin-priest.js';
import {resolveWarlockSorcerer} from './warlock-sorcerer.js';
import {resolveWizardRogue} from './wizard-rogue.js';
import {enemyConditions,selectedPlayerConditions} from './statuses.js';
import {resolveWeaponAttack} from './weapon-attacks.js';
import {mitigateDamage} from './targets.js';

export const damageRound=value=>value>0?Math.max(1,Math.round(value)):0;
export function describeAbility(skill,resolved,context){
  return resolveWeaponAttack(skill,resolved,context)||resolveWarriorRanger(skill,resolved,context)||resolvePaladinPriest(skill,resolved,context)||resolveWarlockSorcerer(skill,resolved,context)||resolveWizardRogue(skill,resolved,context);
}
export function calculateCore(build,catalog,skill,stats,target){
  const state=skill.weaponAttack?{rank:1,upgrades:{}}:build.skills[skill.source]||{rank:1,upgrades:{}};
  const result={supported:false,status:'unsupported',kind:'unknown',dps:null,expectedHit:null,interval:null,hits:null,damage:null,stats,components:[],notes:[],limitations:[],unsupported:[],sources:[]};
  if(state.rank===0)return {...result,status:'unlearned',unsupported:['This ability has not been learned']};
  const {resolved,conflicts}=resolveSkill(skill,state);
  if(conflicts.length)return {...result,status:'conflict',unsupported:[`Incompatible upgrades selected: ${conflicts.join(', ')}`]};
  const model=describeAbility(skill,resolved,{build,catalog,stats});
  if(!model)return {...result,unsupported:['No source-reviewed damage path for this skill']};
  const notes=[...model.notes,...stats.notes],limitations=[...model.limitations,...stats.limitations];
   const conditions=enemyConditions(build,catalog);
   if(conditions.names.length)notes.push(`Enemy conditions held active: ${conditions.names.join(', ')}. Automatic application, expiry and conditional procs are not simulated.`);
     const sources=[...new Set([...model.sources,...(target.source?[target.source]:[]),...(target.mechanicSources||[]),...(stats.sources||[]),...conditions.sources,...selectedPlayerConditions(build,catalog).map(c=>c.source),'scripts/Behaviors/Actors/ActorBuff.as','scripts/Behaviors/Actors/ActorBuffList.as','scripts/Behaviors/Actors/Enemies/CompositeActorBehavior.as','scripts/Behaviors/Actors/Player/PlayerBase.as','scripts/Behaviors/Actors/Player/Player.as','scripts/Behaviors/Armor.as'])];
   if(target.id)notes.push(`Target preset: ${target.name||target.id}; armor ${target.armor}, elemental resistance ${Object.entries(target.resistances||{}).filter(([,v])=>v).map(([e,v])=>`${e} ${v}`).join(', ')||'none'}.`);
  if(model.kind!=='damage')return {...result,kind:model.kind,status:model.kind,notes,limitations:[...new Set(limitations)],sources,unsupported:[],eventComponents:model.components};
  if(!model.components.length)return {...result,kind:'damage',notes,limitations,sources,unsupported:['No numeric source damage components could be resolved']};

  const binds=resolved.binds||{},timeline=(resolved.timeline||[]).filter((v,i)=>i%2===0&&typeof v==='number');
  let castMs=model.castMs??Math.max(resolved['anim-length']||0,...timeline,0);
  if(!castMs&&!model.timing){castMs=resolved.castpoint||0;limitations.push('Source animation duration is not available; castpoint is used as a lower-bound cast duration.');}
  const cooldownMs=resolved.cooldown??binds[resolved['cooldown-bind']];
  if(!Number.isFinite(cooldownMs)||cooldownMs<0||!Number.isFinite(castMs))return {...result,kind:'damage',notes,limitations,sources,unsupported:['Source timing is incomplete']};
  const castTime=model.timing?.castTime??(model.fixedCastMs||0)/1000+castMs/(1000*stats.castSpeed*stats.skillSpeed*(resolved['cast-speed-mul']??1));
  const cooldown=model.timing?.cooldown??cooldownMs*stats.cooldownMultiplier/(1000*stats.castSpeed);
  const activationCooldown=['Skills::ShootProjectileTarget','Skills::ShootProjectile','Skills::ActiveSkill'].includes(resolved.class);
  const interval=model.timing?.interval??Math.max(activationCooldown?Math.max(castTime,cooldown):castTime+cooldown,(model.capacityMs??model.cycleMs??0)/1000);
  if(!Number.isFinite(interval)||interval<=0)return {...result,kind:'damage',notes,limitations,sources,unsupported:['No positive repeat cycle is defined']};
  if(!model.timing)notes.push(activationCooldown?'Cooldown starts on activation and overlaps the animation (ActiveSkill).':'Full cast animation followed by cooldown; both use the player cast-speed update clock. No animation cancellation is assumed.');
  if(model.capacityMs||model.cycleMs)notes.push('The repeat cycle also respects the modeled lifetime/maximum-active-effect capacity.');
  notes.push('Single-target core estimate with unlimited mana/resources. No resource-aware rotation, travel scheduler or runtime validation.');
  const pieces=[];
  let hits=0;
  for(const component of model.components){
    if(component.weaponScale){
      const hand=component.hand==='offhand'?stats.offHand:stats.mainHand;
      const before=pieces.length;
      for(const element of elements){const amount=hand[element]*component.weaponScale;if(amount>0)pieces.push({...component,element,amount:Math.trunc(amount),weaponScale:undefined,weaponDerived:true});}
      // Elemental channels share the original weapon contact, not extra hits.
      if(pieces.length>before)hits+=component.hits;
    }
    if(component.amount>0){pieces.push({...component,weaponScale:undefined});hits+=component.hits;}
  }
  if(!pieces.length)return {...result,kind:'damage',status:'missing-equipment',notes,limitations,sources,unsupported:['Equip a mainhand weapon to calculate this weapon-scaled ability']};
  const components=pieces.map(part=>{
    const base=part.weaponDerived?part.amount:damageRound(part.amount);
    const raw=base*(1+(skill.weaponAttack?stats.attackPower:stats.spellPower)/catalog.facts.powerDivisor)*stats.globalDamageMultiplier*stats.skillDamageMultiplier*stats.elements[part.element]*(part.summon?stats.summonDamageMultiplier:1)*(part.dot?1:stats.damageMultiplier);
    const chance=part.dot?0:1-(1-stats.critChance)*(1-conditions.critChance);
     const mitigate=damage=>mitigateDamage(damage,part.element,target,stats,catalog,conditions,part);
    const normalHit=mitigate(damageRound(raw)),criticalHit=mitigate(damageRound(raw*stats.critDamage));
    const expectedHit=normalHit*(1-chance)+criticalHit*chance,damage=expectedHit*part.hits;
    return {...part,baseDamage:base,normalHit,criticalHit,expectedHit,damage,dps:damage/interval};
  });
  const damage=components.reduce((sum,c)=>sum+c.damage,0),distinct=[...new Set(limitations)];
  return {supported:true,status:distinct.length?'partial':'estimate',kind:'damage',dps:damage/interval,activeDps:model.timing?.duration?damage/model.timing.duration:null,damage,hits,expectedHit:damage/hits,interval,castTime,cooldown,duration:model.timing?.duration??(model.durationMs?model.durationMs/1000:null),manaCost:resolved['mana-cost']??null,stats,components,notes:[...new Set(notes)],limitations:distinct,unsupported:[],sources};
}
