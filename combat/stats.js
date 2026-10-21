import {resolveSkill,bindFields,flattenModifiers,elements} from './definitions.js';
import {playerConditions,selectedPlayerConditions} from './statuses.js';
import {progressionModifiers} from './progression.js';
import {weaponDefinition} from './weapon-equipment.js';
import {comboModifiers} from './combos.js';
import {itemDisplayName} from '../item-name.js';
import {applyStatOverrides} from './stat-overrides.js';
const attrs=['str','dex','int','foc','vit'];
const channel=()=>Object.fromEntries(elements.map(e=>[e,0]));
const value=(v,t,fallback=0)=>typeof v==='number'?v:Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)?v[0]+(v[1]-v[0])*t:fallback;
const combine=(a,b)=>1-(1-a)*(1-b);
const key=v=>String(v||'').toLowerCase().replaceAll('_','').replaceAll('-','');
const actionClasses=new Set(['TimedTriggerEffect','TriggerEffect','SkillTriggerEffect','QuantityTriggerEffect','TriggerEffectQuantityScaled','ModifyStack','InjectModifiersIntoStack','Aura']);
const defences=['fire','ice','lightning','poison'];
const roundedValue=(v,t)=>{const n=value(v,t);return Math.sign(n)*Math.floor(Math.abs(n)+.5);};

export function computeCombatStats(build,catalog,focusedSkill){
  const cls=catalog.classes.find(c=>c.id===build.classId),profile=cls.specializations.find(s=>s.id===build.specializationId)||cls;
  const paths=profile.skills.filter(p=>!p.endsWith('/dash.sval')),entries=[],notes=[],limitations=[];
  const overrides=build.statOverrides||{};
  const attributes=Object.fromEntries(attrs.map(a=>[a,cls.attributes[a]+cls.attributeGrowth[a]*(build.level-1)+(build.attributes[a]||0)]));
  // false requests a hero-wide snapshot without focused active-skill modifiers.
  const focus=focusedSkill===false?undefined:focusedSkill||catalog.skills[build.focusSkill]||weaponDefinition(catalog,build.focusSkill),weapon=Boolean(focus?.weaponAttack),offhand=focus?.type==='offhand';
  const appliesToHand=role=>role==='both'||role===(offhand?'offhand':'mainhand');
  const focusState=build.skills[focus?.source]||{rank:1,upgrades:{}};
  const focusResolved=focus?resolveSkill(focus,focusState):{tags:[]};
  function consume(modifiers,intensity,source,role='both',active=false,skillId){
    for(const raw of flattenModifiers(modifiers))entries.push({m:raw,intensity,source,role,active,skillId});
  }
  const progression=progressionModifiers(build,catalog);
  for(const entry of progression){
    consume(entry.modifiers,entry.intensity,entry.name);
    notes.push(`${entry.name}: source-defined progression/active town bonus included.`);
  }
  for(const item of build.gear.filter(g=>g.equipped)){
    const displayName=itemDisplayName(item,catalog);
    const base=catalog.equipment.find(e=>e.id===item.baseId),intensity=item.itemLevel===undefined?item.roll:(item.itemLevel+item.upgradeLevel-1)/9;
    const role=base.slot==='offhand'?'offhand':['mainhand','twohanded'].includes(base.slot)?'mainhand':'both';
    consume(base.modifiers,intensity,displayName,role);
    for(const state of item.affixes){const def=catalog.affixes.find(a=>a.id===state.id);if(def)consume(def.modifiers,item.itemLevel===undefined?state.roll:intensity,`${displayName}: ${def.name}`,role);}
    if(item.unresolvedModifiers?.length)limitations.push(`${displayName}: unresolved saved modifiers excluded (${item.unresolvedModifiers.length}).`);
  }
  for(const state of build.trinkets){const def=catalog.trinkets.find(t=>t.id===state.id);for(let i=0;i<(state.count??1);i++)consume(state.attuned?def.attunedModifiers:def.modifiers,1,def.name);}
  for(const path of paths){
    const skill=catalog.skills[path],state=build.skills[path]||{rank:1,upgrades:{}};
    if(state.rank===0)continue;
    if(skill.type==='spell'&&path!==focus?.source)continue; // No automatic active buff uptime.
    const {resolved}=resolveSkill(skill,state);
    consume(bindFields(resolved.modifiers||[],resolved.binds||{}),1,skill.name,'both',skill.type==='spell',skill.id);
  }
  if(weapon)consume(focusResolved.resolved.modifiers||[],1,focus.name);
  for(const condition of selectedPlayerConditions(build,catalog)){
    consume(condition.modifiers,condition.intensity,condition.name);
    notes.push(`${condition.name}: manually active snapshot; duration and trigger uptime are not simulated.`);
  }
  for(const entry of comboModifiers(build,catalog)){
    consume(entry.modifiers,entry.intensity,entry.name);
     notes.push(`${entry.name}: manually held-active 10-second combo burst; expiry is not simulated.${entry.modifiers.length?'':' Movement/defensive effects do not contribute to core damage; damage-taken modifiers are excluded from the direct-hit survival estimate.'}`);
  }
   if(build.combo?.active)notes.push('Combo active snapshot: no universal attack/spell damage or attack/cast-speed multiplier is defined; Combo Nova is estimated separately.');
   notes.push('Movement: flat-terrain MoveSpeed multiplier only; skill movement, slows, tileset/environment speed, and engine clamps are not simulated.');
  if(build.importInfo?.unresolvedEquipped)limitations.push(`${build.importInfo.unresolvedEquipped} saved equipped items are unresolved; their effects are excluded.`);
  if(build.importInfo?.unknownTrinkets?.length)limitations.push('Unresolved saved trinket effects are excluded.');
      const stats={attributes,spellPower:0,attackPower:0,attackSpeed:1,moveSpeed:1,critChance:0,critDamage:weapon?catalog.facts.baseWeaponCritDamage:catalog.facts.baseSpellCritDamage,castSpeed:1,damageMultiplier:1,globalDamageMultiplier:1,skillDamageMultiplier:1,skillSpeed:1,cooldownMultiplier:1,summonDamageMultiplier:1,summonCaps:{},elements:Object.fromEntries(elements.map(e=>[e,1])),mainHand:channel(),offHand:channel(),armorPenetration:0,elementalPenetration:channel(),thorns:0,health:0,mana:0,armor:0,healthRegen:0,manaRegen:0,healthGain:1,manaGain:1,resistances:Object.fromEntries(defences.map(e=>[e,0])),sources:[...new Set([...(progression.length?[...progression.map(p=>p.source),...catalog.progression.mechanicSources]:[]),...(catalog.defences?.mechanicSources||[])])],notes,unsupported:limitations,limitations};
  const accepted=[];
  const stackFamilies=playerConditions(build,catalog).filter(f=>f.kind==='stack'&&f.available);
  stats.sources.push(...comboModifiers(build,catalog).map(e=>e.source));
  function filter(entry){
    const m=entry.m,type=m.class.replace('Modifiers::','');
    const conditional=v=>Array.isArray(v)?v.length>0:Boolean(v);
    if(conditional(m.conditional)||conditional(m.conditionals)){limitations.push(`${entry.source}: conditional ${type} excluded (buff/health/target state not simulated).`);return false;}
    if(m['skill-id']&&m['skill-id']!==focus?.id)return false;
    if(m['skill-type']&&m['skill-type']!==focus?.type)return false;
    if(m['skill-tags']?.length&&!m['skill-tags'].some(t=>focusResolved.tags.includes(t)))return false;
    if(m['skill-tag']&&!focusResolved.tags.includes(m['skill-tag']))return false;
    return true;
  }
  for(const entry of entries){
    const type=entry.m.class.replace('Modifiers::','');
    if(['InjectModifiersIntoStack','ModifyStack'].includes(type)){
      const family=stackFamilies.find(f=>f.skillId===entry.skillId&&entry.m.buff===`${f.source}:${f.sourceKey}`);
      if(family&&!entry.m.conditional&&!entry.m.conditionals){
        // The stack resolver, not the ordinary passive-stat path, applies
        // these definitions. Do not label already handled metadata a proc.
        const selected=build.conditions?.player?.[family.id];
        notes.push(type==='ModifyStack'?`${entry.source}: stack maximum/duration changes are handled by Configuration.`:selected?`${entry.source}: selected stack modifiers are handled by the manual Configuration snapshot; individual unsupported effects remain listed separately.`:`${entry.source}: stack bonus inactive; select stacks under Configuration to apply supported modifiers.`);
        continue;
      }
    }
    if(entry.active&&actionClasses.has(type)){
      notes.push(`${entry.source}: ${type} action scheduling is included only where listed in this ability's damage components.`);
      continue;
    }
    if(!filter(entry))continue;
    const m=entry.m,v=(k,f=0)=>value(m[k],entry.intensity,f);
    if(type==='StatAdd'){for(const a of attrs)attributes[a]+=Math.round(v(a));}
    else accepted.push(entry);
  }
  // Attribute conversions run after additive attributes, before derived stats.
  const statValue=name=>{
    const normalized=key(name);
    if(attrs.includes(normalized))return attributes[normalized];
    const scalar={lvl:build.level,level:build.level,spellpwr:stats.spellPower,spellpower:stats.spellPower,attackpwr:stats.attackPower,health:stats.health,mana:stats.mana,healthregen:stats.healthRegen,manaregen:stats.manaRegen,healthgain:stats.healthGain,managain:stats.manaGain,movespeed:stats.moveSpeed,armor:stats.armor,thorns:stats.thorns,numtrinkets:build.trinkets.reduce((s,t)=>s+(t.count??1),0),shadowcurses:build.shadowCurses};
    if(Object.hasOwn(scalar,normalized))return scalar[normalized];
    for(const element of defences)if(normalized===`resistance${element}`)return stats.resistances[element];
    for(const [prefix,hand] of [['mainhand',stats.mainHand],['offhand',stats.offHand]])for(const e of elements)if(normalized===prefix+e+'damage')return hand[e];
    return undefined;
  };
  function conversion(entry,attributeOnly){
    const m=entry.m,to=key(m.to);if(attrs.includes(to)!==attributeOnly)return false;
    if(['mainhandcritdamage','offhandcritdamage'].includes(to)&&(!weapon||to!==(offhand?'offhandcritdamage':'mainhandcritdamage'))){notes.push(`${entry.source}: other-hand/weapon critical conversion does not affect this ability.`);return true;}
    const from=statValue(m.from);if(from===undefined){limitations.push(`${entry.source}: ${m.from} conversion is not available in the current model.`);return true;}
    const mul=value(m.mul,entry.intensity,1),offset=value(m.offset,entry.intensity),amount=from*mul+offset;
    if(attributeOnly)attributes[to]=Math.max(0,Math.trunc((m.add?attributes[to]:0)+amount));
    else if(['healthregen','manaregen','healthgain','managain','movespeed'].includes(to)){const field={healthregen:'healthRegen',manaregen:'manaRegen',healthgain:'healthGain',managain:'manaGain',movespeed:'moveSpeed'}[to];stats[field]=(m.add?stats[field]:0)+amount;}
    else if(defences.some(e=>to===`resistance${e}`)){const element=to.slice('resistance'.length);stats.resistances[element]=(m.add?stats.resistances[element]:0)+Math.trunc(amount);}
    else if(['spellpwr','spellpower','attackpwr','health','mana','armor','thorns'].includes(to)){const field=['spellpwr','spellpower'].includes(to)?'spellPower':to==='attackpwr'?'attackPower':to;stats[field]=Math.max(0,Math.trunc((m.add?stats[field]:0)+amount));}
    else if(['mainhandcritdamage','offhandcritdamage'].includes(to))stats.critDamage=Math.max(0,(m.add?stats.critDamage:0)+amount);
    else if(['mainhand','offhand'].some(prefix=>elements.some(e=>to===prefix+e+'damage'))){
      const prefix=to.startsWith('mainhand')?'mainhand':'offhand',element=to.slice(prefix.length,-'damage'.length),hand=prefix==='mainhand'?stats.mainHand:stats.offHand;
      hand[element]=Math.max(0,Math.trunc((m.add?hand[element]:0)+amount));
    }
    else limitations.push(`${entry.source}: conversion to ${m.to} not included.`);
    return true;
  }
  for(const entry of accepted)if(entry.m.class==='Modifiers::ConvertStat')conversion(entry,true);
  for(const a of attrs)if(Object.hasOwn(overrides,`attributes.${a}`))attributes[a]=overrides[`attributes.${a}`];
  for(const a of attrs)attributes[a]=Math.max(0,attributes[a]);
  const intelligence=attributes.int,strength=attributes.str,criticalAttribute=weapon?attributes.dex:intelligence;
  stats.spellPower=attrs.reduce((sum,a)=>sum+Math.round(attributes[a]*cls.powerScaling[a]),0);
  stats.critChance=(1-100/(criticalAttribute+100))*.3;
  stats.critDamage+=(.007*criticalAttribute)+((weapon ? .15 : .17)*Math.sqrt(criticalAttribute)-.007*criticalAttribute)*Math.min(1,criticalAttribute/500);
  stats.armorPenetration=(1-400/(strength+400))*.85;
   const base=cls.baseStats||{};
  stats.health=(base.health||0)+(build.level-1)*(base.healthPerLevel||0)+attributes.vit*5;
  stats.mana=(base.mana||0)+(build.level-1)*(base.manaPerLevel||0)+attributes.foc*5;
   stats.armor=Math.trunc((base.armor||0)+(build.level-1)*(base.armorPerLevel||0))+Math.round(strength*2);
   stats.healthRegen=(base.healthRegen||0)+(build.level-1)*(base.healthRegenPerLevel||0)+attributes.vit*(catalog.facts.healthRegenPerVitality||0);
   stats.manaRegen=(base.manaRegen||0)+(build.level-1)*(base.manaRegenPerLevel||0)+attributes.foc*(catalog.facts.manaRegenPerFocus||0);
    for(const e of defences)stats.resistances[e]=Math.trunc((base[`${e}Resistance`]||0)+(build.level-1)*(base[`${e}ResistancePerLevel`]||0));
   const later=[];
   // PlayerModifierCollection sorts stat modifiers by Ordering. Apply only the
   // defensive/recovery modifiers in their source ordering, preserving original
   // order among equal-order entries; leave the established offense path alone.
   const defensiveOrdering=entry=>({ArmorAdd:0,AttribAdd:1,AttribMul:2}[entry.m.class.replace('Modifiers::','')]??3);
   const defensiveEntries=accepted.map((entry,index)=>({entry,index})).filter(({entry})=>['ArmorAdd','AttribAdd','AttribMul','MissingManaBasedManaRegenBonus'].includes(entry.m.class.replace('Modifiers::',''))).sort((a,b)=>defensiveOrdering(a.entry)-defensiveOrdering(b.entry)||a.index-b.index);
   const defensiveSet=new Set(defensiveEntries.map(({entry})=>entry));
   for(const {entry} of defensiveEntries){
     const {m,intensity,source}=entry,v=(k,f=0)=>value(m[k],intensity,f),type=m.class.replace('Modifiers::','');
      if(type==='ArmorAdd'){stats.armor+=roundedValue(m.armor,intensity);for(const e of defences)stats.resistances[e]+=roundedValue(m[e],intensity);}
      else if(type==='AttribAdd'){stats.health+=roundedValue(m.health,intensity);stats.mana+=roundedValue(m.mana,intensity);stats.healthRegen+=v('health-regen');stats.manaRegen+=v('mana-regen');stats.healthGain+=v('health-gain');stats.manaGain+=v('mana-gain');}
      else if(type==='AttribMul'){stats.health=Math.trunc(stats.health*v('health',1));stats.mana=Math.trunc(stats.mana*v('mana',1));stats.healthRegen*=v('health-regen',1);stats.manaRegen*=v('mana-regen',1);stats.healthGain*=v('health-gain',1);stats.manaGain*=v('mana-gain',1);}
      else {stats.manaRegen*=1+v('max-gain')*(1-Math.max(0,Math.min(100,build.currentManaPercent??100))/100);}
   }
   for(const entry of accepted){
     if(defensiveSet.has(entry))continue;
    const {m,intensity,role,source}=entry,type=m.class.replace('Modifiers::',''),v=(k,f=0)=>value(m[k],intensity,f);
    const hands=role==='mainhand'?[stats.mainHand]:role==='offhand'?[stats.offHand]:[stats.mainHand,stats.offHand];
    switch(type){
      case 'ConvertStat':if(!attrs.includes(key(m.to)))later.push(entry);break;
       case 'DamagePowerAdd':stats.spellPower+=Math.round(v('spell-power'));stats.attackPower+=Math.round(v('attack-power'));break;
       case 'AttribAdd':case 'AttribMul':case 'ArmorAdd':break;
      case 'DamageAdd':for(const hand of hands)for(const e of elements)hand[e]+=Math.round(v(e));break;
      case 'StatBasedDamage':later.push(entry);break;
       case 'SpeedAdd':stats.castSpeed+=v('cast-speed');stats.moveSpeed+=v('move-speed');if(appliesToHand(role))stats.attackSpeed+=v('attack-speed');break;
      case 'SpeedMul':later.push(entry);break;
      case 'CriticalHit':if(!weapon||appliesToHand(role))stats.critChance=combine(stats.critChance,v(weapon?'chance':'spell-chance'));break;
      case 'CriticalHitPerCurse':if(build.shadowCurses===undefined)limitations.push(`${source}: per-curse crit bonus excluded; shadow curse count is missing.`);else if(!weapon||appliesToHand(role))stats.critChance=combine(stats.critChance,v(weapon?'chance-per-curse':'spell-chance-per-curse')*build.shadowCurses);break;
      case 'CritDamage':if(!weapon||appliesToHand(role))stats.critDamage+=v(weapon?'attack-crit-dmg':'spell-crit-dmg');break;
      case 'SkillCrit':stats.critChance=combine(stats.critChance,v('chance'));stats.critDamage+=v('crit-dmg');break;
      case 'Damage':stats.damageMultiplier*=v('mul',1)*v(weapon?'attack-mul':'spell-mul',1);break;
      case 'DamageMulAdd':for(const e of elements)stats.elements[e]+=v(e);break;
      case 'ArmorPenetration':stats.armorPenetration=combine(stats.armorPenetration,v('armor-penetration'));for(const e of ['fire','ice','lightning','poison'])stats.elementalPenetration[e]=combine(stats.elementalPenetration[e],v(`${e}-penetration`));break;
      case 'BaseSkillModifier':stats.skillSpeed*=v('skill-speed-mul',1);stats.cooldownMultiplier*=v('cooldown-mul',1);stats.skillDamageMultiplier*=v('damage-mul',1);break;
      case 'SummonStatMulAdd':stats.summonDamageMultiplier+=v('damage-mul');break;
      case 'ModifySummons':{const unit=m.unit||'*';stats.summonCaps[unit]=(stats.summonCaps[unit]||0)+Math.round(v('add-max-num'));break;}
      case 'AddThorns':stats.thorns+=Math.round(v('thorns'));break;
       case 'MissingManaBasedManaRegenBonus':break;
       case 'SkillCost':case 'SkillDamageLeeching':case 'DamageLeeching':case 'SkillSlowScale':case 'Parry':case 'Block':case 'Evade':case 'Experience':case 'MaterialGain':case 'Potion':case 'Dash':case 'BuffImmune':case 'PlayerTargetedRange':case 'DummyModifier':case 'AddThornsEliteMultiplier':case 'ShadowCurseGain':case 'PlayerLight':
        notes.push(`${source}: ${type} has no direct contribution to this target's core damage.`);break;
      case 'SkillSpeedWalkMul':notes.push(`${source}: stationary estimate; walking speed penalties are not applied.`);break;
       case 'Armor':limitations.push(`${source}: damage-taken modifiers are excluded from the direct-hit survival estimate; no direct core damage contribution.`);break;
      case 'TriggerEffect':case 'SkillTriggerEffect':case 'TimedTriggerEffect':case 'QuantityTriggerEffect':case 'TriggerEffectQuantityScaled':
        limitations.push(`${source}: automatic ${m.trigger||'effect'} trigger/proc scheduling is excluded from core damage.`);break;
       default:
         limitations.push(`${source}: ${type} proc/conditional behavior is excluded from core damage.`);
    }
   }
    for(const entry of later){const {m,intensity,role,source}=entry;
     if(m.class==='Modifiers::SpeedMul'){stats.castSpeed*=value(m['cast-speed'],intensity,1);stats.moveSpeed*=value(m['move-speed'],intensity,1);if(appliesToHand(role))stats.attackSpeed*=value(m['attack-speed'],intensity,1);}
    else if(m.class==='Modifiers::ConvertStat')conversion(entry,false);
    else if(m.class==='Modifiers::StatBasedDamage'){
      const from=statValue(m.stat);if(from===undefined||!elements.includes(m.type)){limitations.push(`${source}: weapon scaling from ${m.stat} is unavailable.`);continue;}
      const damage=Math.max(0,Math.trunc(from*value(m.amount,intensity)));
      for(const hand of role==='mainhand'?[stats.mainHand]:role==='offhand'?[stats.offHand]:[stats.mainHand,stats.offHand])hand[m.type]+=damage;
   }
   }
   // Penalties follow stat modifiers, including conversions. Combo movement is
   // one runtime multiplier, not one multiplier per deferred stat effect.
   const ngp=build.ngp??0,shadowCurses=build.shadowCurses??0,facts=catalog.facts;
   const cursePenalty=shadowCurses*(facts.shadowCurseArmorPenalty+ngp*facts.shadowCurseArmorNGPPenalty);
   stats.armor-=Math.trunc(cursePenalty+ngp*facts.ngpArmorPenalty+.5);
   for(const element of defences)stats.resistances[element]-=Math.trunc(cursePenalty+ngp*facts.ngpResistancePenalty+.5);
   if(build.combo?.active)stats.moveSpeed*=1.2;
    const finalOverrides={...overrides};for(const a of attrs)delete finalOverrides[`attributes.${a}`];
   const healthRegenOverride=finalOverrides.healthRegen,manaRegenOverride=finalOverrides.manaRegen;
   const healthGainOverride=finalOverrides.healthGain,manaGainOverride=finalOverrides.manaGain;
   const moveSpeedOverride=finalOverrides.moveSpeed;
   delete finalOverrides.healthRegen;delete finalOverrides.manaRegen;delete finalOverrides.healthGain;delete finalOverrides.manaGain;
   delete finalOverrides.moveSpeed;
   applyStatOverrides(stats,finalOverrides);
   if(healthGainOverride!==undefined)stats.healthGain=healthGainOverride;
   if(manaGainOverride!==undefined)stats.manaGain=manaGainOverride;
   stats.healthRegen*=stats.healthGain;stats.manaRegen*=stats.manaGain;
   if(healthRegenOverride!==undefined)stats.healthRegen=healthRegenOverride;
   if(manaRegenOverride!==undefined)stats.manaRegen=manaRegenOverride;
   if(moveSpeedOverride!==undefined)stats.moveSpeed=moveSpeedOverride;
  stats.critChance=Math.max(0,Math.min(1,stats.critChance));stats.castSpeed=Math.max(.01,stats.castSpeed);stats.attackSpeed=Math.max(.01,stats.attackSpeed);stats.skillSpeed=Math.max(.01,stats.skillSpeed);stats.cooldownMultiplier=Math.max(0,stats.cooldownMultiplier);
  stats.notes=[...new Set(notes)];stats.limitations=stats.unsupported=[...new Set(limitations)];
  return stats;
}
