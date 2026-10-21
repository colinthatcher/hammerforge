import {equipGear} from './planner-model.js';

const definition = (catalog,id) => catalog?.affixes?.find(entry=>entry.id===id);

export function selectAffix(item,side,id,catalog,base){
  if(!item||!['prefix','suffix'].includes(side)||typeof id!=='string'||!Array.isArray(item.affixes))return false;
  const selected=id===''?undefined:definition(catalog,id);
  if(id!==''&&(!selected||!selected[side]||!(selected.tags||[]).some(tag=>(base?.tags||[]).includes(tag))))return false;
  const existing=item.affixes.find(affix=>affix.id===id);
  const retained=item.affixes.filter(affix=>!definition(catalog,affix.id)?.[side]);
  if(selected){
    retained.push({id,roll:existing?.roll??.5});
  }
  item.affixes=retained;
  return true;
}

export function affixSelectionValid(item,catalog){
  const counts={prefix:0,suffix:0};
  for(const affix of item?.affixes||[]){const def=definition(catalog,affix.id);for(const side of Object.keys(counts))if(def?.[side])counts[side]++;}
  return counts.prefix<=1&&counts.suffix<=1;
}

export function slotItems(build,catalog,slot){
  if(!['mainhand','offhand','head','chest','feet','hands','back'].includes(slot))return [];
  return build.gear.filter(item=>{const base=catalog.equipment.find(entry=>entry.id===item.baseId);return base&&(slot==='mainhand'?['mainhand','twohanded'].includes(base.slot):base.slot===slot);});
}

export function selectSlotItem(build,catalog,slot,id){
  if(!['mainhand','offhand','head','chest','feet','hands','back'].includes(slot)||typeof id!=='string')return null;
  if(id===''){
    const occupant=build.gear.find(item=>{if(!item.equipped)return false;const base=catalog.equipment.find(entry=>entry.id===item.baseId);return slot==='mainhand'?['mainhand','twohanded'].includes(base?.slot):base?.slot===slot;});
    if(!occupant)return null;occupant.equipped=false;return occupant;
  }
  const item=slotItems(build,catalog,slot).find(candidate=>candidate.id===id);
  if(!item)return null;
  equipGear(build,item,catalog);return item;
}
