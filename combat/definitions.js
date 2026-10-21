const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const elements=['physical','fire','ice','lightning','poison','pure'];

// PlayerBase::AddSkill selects base + the chosen rank, not all earlier ranks.
// LoadIModifiers merges indexed slots; a null placeholder inherits that slot.
export function mergeDefinition(base,override){
  const out=structuredClone(base||{});
  for(const [key,value] of Object.entries(override||{})){
    if(key==='modifiers'&&Array.isArray(value)&&Array.isArray(value[0])&&Array.isArray(out[key]?.[0])){
      const slots=structuredClone(out[key]);value.forEach((slot,index)=>{if(slot?.[0]!==null&&slot?.[0]!=='')slots[index]=structuredClone(slot);});out[key]=slots;
    }else out[key]=object(value)?mergeDefinition(object(out[key])?out[key]:{},value):structuredClone(value);
  }
  return out;
}
export function resolveSkill(skill,state={rank:1,upgrades:{}}){
  const level=state.rank??1,overrides=skill.rankOverrides;
  let resolved=overrides?mergeDefinition(overrides[0],level>1?overrides[level-1]:{}):structuredClone(skill.ranks[Math.max(0,level-1)]||{});
  const selected=[];let tags=skill.tags||[];
  for(const upgrade of skill.upgrades||[]){const tier=state.upgrades?.[upgrade.id]||0;if(!tier)continue;
    const layers=upgrade.rankOverrides;
    const definition=layers?mergeDefinition(layers[0],tier>1?layers[tier-1]:{}):upgrade.ranks[tier-1];
    resolved=mergeDefinition(resolved,definition);selected.push(upgrade);
    if(upgrade.tags?.length)tags=upgrade.tags;
  }
  return {resolved,tags,conflicts:selected.filter(u=>(u.blockedBy||[]).some(id=>selected.some(other=>other.id===id))).map(u=>u.name)};
}
export function bindFields(value,binds){
  if(Array.isArray(value))return value.map(v=>bindFields(v,binds));
  if(!object(value))return value;
  const out={};for(const [key,v] of Object.entries(value))if(!key.endsWith('-bind'))out[key]=bindFields(v,binds);
  for(const [key,v] of Object.entries(value))if(key.endsWith('-bind')&&Object.hasOwn(binds,v))out[key.slice(0,-5)]=bindFields(binds[v],binds);
  return out;
}
export function flattenModifiers(value){
  if(Array.isArray(value))return value.flatMap(flattenModifiers);
  return object(value)&&typeof value.class==='string'?[value]:[];
}
export function findObjects(value,predicate){
  if(!value||typeof value!=='object')return [];
  return [...(!Array.isArray(value)&&predicate(value)?[value]:[]),...Object.values(value).flatMap(v=>findObjects(v,predicate))];
}
export function descriptor(skill,resolved){
  return {kind:skill.type==='spell'?'damage':'passive',components:[],notes:[],limitations:[],sources:[skill.source]};
}
export function component(result,label,element,amount,hits=1,flags={}){
  if(!Number.isFinite(amount)||!Number.isFinite(hits)||amount<0||hits<0){result.limitations.push(`${label}: numeric source data unavailable.`);return;}
  if(hits>0&&(amount>0||flags.weaponScale>0))result.components.push({label,element,amount,hits,...flags});
}
// Damage areas are not inherently DoT: only explicit Damage.dot disables crits.
export function areaContacts(duration,frequency=500,onEntry=true){return (onEntry?1:0)+Math.ceil(duration/frequency);}
export function directEffects(result,effects,binds,label,hits=1){
  let intensity=1;
  for(const raw of effects||[]){
    const effect=bindFields(raw,binds);if(effect.conditional||effect.conditionals){result.limitations.push(`${label}: conditional effect omitted.`);continue;}
    if(effect['intensity-mul']!==undefined)intensity*=effect['intensity-mul'];
    if(effect.class==='Damage')for(const element of elements)if(effect[element])component(result,label,element,effect[element]*intensity,hits,{dot:effect.dot===true});
  }
}
