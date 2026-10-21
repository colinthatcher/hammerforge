const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const level=(v,max=10000)=>Number.isInteger(v)&&v>=0&&v<=max;
export const accomplishmentAttributeKeys=['str','dex','int','foc','vit'];
export const emptyAccomplishmentAttributes=()=>Object.fromEntries(accomplishmentAttributeKeys.map(a=>[a,0]));
export const emptyProgression=()=>({mysticSpellPower:0,armorerAttackPower:0,accomplishmentAttributes:emptyAccomplishmentAttributes(),spellMasteries:{},weaponMasteries:{},heroTitles:{},townBuffs:{}});

export function validProgression(p,catalog){
  const data=catalog.progression;
  if(!data||!record(p)||Object.keys(p).some(k=>!['mysticSpellPower','armorerAttackPower','accomplishmentAttributes','spellMasteries','weaponMasteries','heroTitles','townBuffs'].includes(k)))return false;
  if(!level(p.mysticSpellPower,data.mystic.steps.length))return false;
  if(p.armorerAttackPower!==undefined&&!level(p.armorerAttackPower,data.armorer?.steps.length??0))return false;
  if(p.accomplishmentAttributes!==undefined){
    const a=p.accomplishmentAttributes;
    if(!record(a)||Object.keys(a).length!==accomplishmentAttributeKeys.length||!accomplishmentAttributeKeys.every(k=>Object.hasOwn(a,k)&&level(a[k])))return false;
  }
  for(const kind of ['spellMasteries','weaponMasteries','heroTitles']){
    if(kind==='weaponMasteries'&&p[kind]===undefined)continue;
    if(!record(p[kind]))return false;
    for(const [id,n] of Object.entries(p[kind]))if(!data[kind].some(d=>d.id===id)||!level(n))return false;
  }
  if(!record(p.townBuffs))return false;
  return Object.entries(p.townBuffs).every(([set,id])=>data.townBuffs.some(d=>d.set===set&&d.id===id));
}

export function progressionModifiers(build,catalog){
  const p=build.progression,data=catalog.progression;
  if(!p||!data)return [];
  const entries=[];
  const add=(d,intensity,label=d.name)=>entries.push({...d,intensity,name:label});
  if(p.accomplishmentAttributes&&accomplishmentAttributeKeys.some(a=>p.accomplishmentAttributes[a]>0)){
    // Reviewed BuildStats adds these town totals before attribute conversions.
    // This is a manual snapshot, not a reconstruction of native StatCollection.
    add({name:'Town accomplishment attributes',source:'scripts/Behaviors/Actors/Modifiers/Modifiers.as',modifiers:[{class:'Modifiers::StatAdd',...p.accomplishmentAttributes}]},1);
  }
  if(p.mysticSpellPower>0){const step=data.mystic.steps[p.mysticSpellPower-1];if(step)add({...data.mystic,...step},1,`Mystic: ${step.name}`);}
  if(p.armorerAttackPower>0){const step=data.armorer?.steps[p.armorerAttackPower-1];if(step)add({...data.armorer,...step},1,`Armorer: ${step.name}`);}
  for(const d of data.spellMasteries)if(p.spellMasteries[d.id]>0)add(d,p.spellMasteries[d.id],`${d.name} (level ${p.spellMasteries[d.id]})`);
  for(const d of data.weaponMasteries||[])if(p.weaponMasteries?.[d.id]>0)add(d,p.weaponMasteries[d.id],`${d.name} mastery (level ${p.weaponMasteries[d.id]})`);
  for(const d of data.heroTitles)if(p.heroTitles[d.id]>0)add(d,p.heroTitles[d.id]/10,`${d.name} title (level ${p.heroTitles[d.id]})`);
  for(const d of data.townBuffs)if(p.townBuffs[d.set]===d.id)add(d,1,`Town buff: ${d.name}`);
  return entries;
}
