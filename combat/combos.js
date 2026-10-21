import {bindFields,flattenModifiers} from './definitions.js';

export const emptyCombo=()=>({skills:{},active:false,burstActive:false});
export function selectedCombos(build,catalog){
  return (catalog.combos?.skills||[]).filter(s=>build.combo?.skills[s.id]>0).map(s=>({...s,resolved:bindFields(s.ranks[build.combo.skills[s.id]-1],s.ranks[build.combo.skills[s.id]-1].binds||{})}));
}
export function comboSummary(build,catalog){
  const skills=selectedCombos(build,catalog),activation=skills.find(s=>['combo_kills','combo_dash','combo_parry'].includes(s.id));
  const mods=skills.flatMap(s=>flattenModifiers(s.resolved.modifiers||s.resolved.modifier)).filter(m=>m.class==='Modifiers::Combo');
  const sum=key=>mods.reduce((n,m)=>n+(m[key]||0),0);
  return {activation:activation||null,threshold:activation?sum('trigger-num'):null,obtainSeconds:activation?sum('obtain-reset-timer')/1000:null,sustainSeconds:activation?sum('sustain-reset-timer')/1000:null};
}
export function validCombo(combo,catalog){
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  if(!record(combo)||Object.keys(combo).some(k=>!['skills','active','burstActive'].includes(k))||!record(combo.skills)||typeof combo.active!=='boolean'||typeof combo.burstActive!=='boolean')return false;
  if(catalog.combos&&!Array.isArray(catalog.combos.skills))return false;
  const definitions=catalog.combos?.skills||[];
  for(const [id,rank] of Object.entries(combo.skills)){
    const def=definitions.find(s=>s?.id===id);
    if(!def||!Array.isArray(def.blockedBy)||!Array.isArray(def.ranks)||!Number.isInteger(def.rankCount)||!Number.isInteger(rank)||rank<0||rank>def.rankCount||rank>0&&def.blockedBy.some(id=>combo.skills[id]>0))return false;
  }
  if(combo.active&&!comboSummary({combo},catalog).activation)return false;
  if(combo.burstActive&&!selectedCombos({combo},catalog).some(s=>s.burst))return false;
  return true;
}

// Only explicitly selected source effects contribute. No automatic trigger uptime.
export function comboModifiers(build,catalog){
  return selectedCombos(build,catalog).flatMap(s=>{
    if(s.burst&&build.combo.burstActive){
      const buff=catalog.combos.buffs[s.burst];
      return [{name:s.name,source:catalog.combos.buffSource,intensity:1,modifiers:s.burst==='damage'?[{class:'Modifiers::Damage',mul:buff['dmg-mul']}]:[]}];
    }
    return [];
  });
}
