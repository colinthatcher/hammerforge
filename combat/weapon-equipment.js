export function weaponDefinition(catalog,path){
  const attacks=catalog.weapons?.attacks;
  return attacks&&typeof path==='string'&&path.startsWith('weapon:')&&Object.hasOwn(attacks,path.slice(7))?attacks[path.slice(7)]:undefined;
}
export function equippedWeaponAttacks(build,catalog){
  const attacks=[];
  for(const item of build.gear.filter(g=>g.equipped)){
    const base=catalog.equipment.find(e=>e.id===item.baseId);if(!base?.attacks)continue;
    const epic=item.sourceQuality===8||item.sourceQuality===undefined&&base.quality==='epic';
    for(const secondary of [false,true]){
      const key=secondary?'skill-secondary':'skill';
      const id=(epic?base.attacks[key+'-epic']:null)||base.attacks[key];
      const def=catalog.weapons?.attacks?.[id];
      if(def)attacks.push({...def,equipmentId:item.id,equipmentName:itemDisplayName(item,catalog),equipmentSource:base.source,secondary});
    }
  }
  return attacks;
}
import {itemDisplayName} from '../item-name.js';
