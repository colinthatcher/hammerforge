import {resolveSkill,bindFields,flattenModifiers} from './definitions.js';

// A manually selected snapshot, not a trigger or duration simulation.
export function playerConditions(build,catalog){
  const cls=catalog.classes.find(c=>c.id===build.classId),profile=cls.specializations.find(s=>s.id===build.specializationId)||cls;
  const skills=profile.skills.map(p=>catalog.skills[p]).filter(Boolean);
  return (catalog.statuses?.player||[]).filter(f=>(!f.classId||f.classId===build.classId)&&(!f.skillId||skills.some(s=>s.id===f.skillId))).map(f=>{
    if(f.kind==='fixed')return {...f,available:true};
    const skill=profile.skills.map(p=>catalog.skills[p]).find(s=>s?.id===f.skillId),state=build.skills[skill?.source]||{rank:1,upgrades:{}};
    if(!skill||state.rank===0)return {...f,available:false,reason:'Learn the associated skill to enable this buff.'};
    if(f.requiredUpgrade&&!(state.upgrades?.[f.requiredUpgrade]>0))return {...f,available:false,reason:'Select the associated skill upgrade to enable this buff.'};
    const {resolved,conflicts}=resolveSkill(skill,state),binds=resolved.binds||{};
    const sourceKey=f.sourceKey||String(binds[f.sourceKeyBinding]||'').split(':').at(-1),definition=f.definitions[sourceKey];
    if(!definition||conflicts.length)return {...f,available:false,reason:'Resolve the associated skill upgrades first.'};
    const reference=`${f.source}:${sourceKey}`,all=bindFields(resolved.modifiers||[],binds);
    const injections=flattenModifiers(all).filter(m=>m.class==='Modifiers::InjectModifiersIntoStack'&&m.buff===reference&&!m.conditional&&!m.conditionals);
    const modifications=flattenModifiers(all).filter(m=>m.class==='Modifiers::ModifyStack'&&m.buff===reference&&!m.conditional&&!m.conditionals);
    const max=definition.max+modifications.reduce((sum,m)=>sum+(m['add-max']||0),0);
    const timer=definition.timer?{...definition.timer,time:definition.timer.time+modifications.reduce((sum,m)=>sum+(m['add-time']||0),0)}:undefined;
    return {...f,available:true,definition:{...definition,max,...(timer?{timer}:{})},sourceKey,max,modifiers:[...(definition.buff?.modifiers||[]),...injections.flatMap(m=>flattenModifiers(m.modifiers||m.modifier))]};
  });
}

export function selectedPlayerConditions(build,catalog){
  return playerConditions(build,catalog).flatMap(f=>{
    const selected=build.conditions?.player?.[f.id];if(!selected||!f.available)return [];
    if(f.kind==='fixed'){const v=f.variants.find(v=>v.id===selected);return v?[{name:f.name,source:v.source,modifiers:v.definition.modifiers||[],intensity:1}]:[];}
    // Retain saved preferences across rank/spec changes; only the active
    // snapshot and UI clamp them to the currently available stack maximum.
    const stacks=Math.min(f.max,selected);
    return [{name:`${f.name} (${stacks} stacks)`,source:f.source,modifiers:f.modifiers,intensity:f.definition['extrapolate-intensity']?stacks:f.max<=1?1:(stacks-1)/(f.max-1)}];
  });
}

export function enemyConditions(build,catalog){
  const result={damageTaken:1,armor:1,critChance:0,names:[],sources:[]};
  for(const f of catalog.statuses?.enemy||[]){
    const variant=f.variants.find(v=>v.id===build.conditions?.enemy?.[f.id]);if(!variant)continue;
    const d=variant.definition;
    result.damageTaken*=d['dmg-taken-mul']??1;result.armor*=d['armor-mul']??1;
    result.critChance=1-(1-result.critChance)*(1-(d['receive-crit-chance']??0));
    result.names.push(`${variant.name} ${f.name}`);result.sources.push(variant.source);
  }
  return result;
}

export function validConditions(conditions,catalog){
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  if(!record(conditions)||Object.keys(conditions).some(k=>!['player','enemy'].includes(k)))return false;
  for(const side of ['player','enemy']){
    if(!record(conditions[side]))return false;
    for(const [id,selected] of Object.entries(conditions[side])){
      const family=catalog.statuses?.[side]?.find(f=>f.id===id);if(!family)return false;
      if(family.kind==='stack'){
        const max=Math.max(family.selectionMax||0,...Object.values(family.definitions).map(d=>d.max));
        if(!Number.isInteger(selected)||selected<1||selected>max)return false;
      }else if(!family.variants.some(v=>v.id===selected))return false;
    }
  }
  return true;
}
