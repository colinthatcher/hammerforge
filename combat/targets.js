export const LEGACY_TARGET={health:10000,armor:100,resistances:{fire:0,ice:0,lightning:0,poison:0}};

export function mitigateDamage(damage,element,target,stats,catalog,conditions={},part={}){
  const round=value=>value>0?Math.max(1,Math.round(value)):0;
  const taken=conditions.damageTaken??1;
  if(element==='pure')return round(damage*taken);
  const efficiency=catalog.facts.armorEfficiency;
  let defense=0;
  if(element==='physical'){
    defense=(target.armor||0)*(conditions.armor??1);
    if(defense>0)defense*=(1-(stats.armorPenetration||0))*(1-(part.armorPenetration||0));
  }else if(Object.hasOwn(target.resistances||{},element)){
    defense=target.resistances[element]||0;
    if(defense>0)defense*=1-(stats.elementalPenetration?.[element]||0);
  }
  // Armor.as::ApplyArmor rounds before CompositeActorBehavior applies and
  // rounds damage-taken modifiers. Penetration never amplifies negative armor.
  const afterDefense=round(defense>=0?damage/(1+defense*efficiency):damage*(1-defense*efficiency*catalog.facts.armorNegativeMultiplier));
  return round(afterDefense*taken);
}
