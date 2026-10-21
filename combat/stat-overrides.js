import {elements} from './definitions.js';
// Numeric character stats supported by the combat model. Paths are stable build.statOverrides keys.
export const STAT_OVERRIDE_FIELDS = [
  ...['str','dex','int','foc','vit'].map(key=>({path:`attributes.${key}`,label:{str:'Strength',dex:'Dexterity',int:'Intelligence',foc:'Focus',vit:'Vitality'}[key],group:'Attributes',min:0,max:1000000})),
  ...[['health','Health',0],['mana','Mana',0],['armor','Armor',-1000000],['healthRegen','Health regeneration / second',-1000000],['manaRegen','Mana regeneration / second',-1000000],['healthGain','Health gain multiplier',0],['manaGain','Mana gain multiplier',0],['moveSpeed','Movement speed multiplier',0]].map(([path,label,min])=>({path,label,group:'Resources & recovery',min,max:1000000})),
  ...[['spellPower','Spell power',0,1000000],['attackPower','Attack power',0,1000000],['attackSpeed','Attack speed',.01,1000000],['critChance','Critical chance',0,1],['critDamage','Critical damage',0,1000000],['castSpeed','Cast speed',.01,1000000],['damageMultiplier','Damage multiplier',0,1000000],['globalDamageMultiplier','Global damage multiplier',0,1000000],['skillDamageMultiplier','Skill damage multiplier',0,1000000],['skillSpeed','Skill speed',.01,1000000],['cooldownMultiplier','Cooldown multiplier',0,1000000],['summonDamageMultiplier','Summon damage multiplier',0,1000000],['armorPenetration','Armor penetration',0,1],['thorns','Thorns',0,1000000]].map(([path,label,min,max])=>({path,label,group:'Combat',min,max})),
  ...['fire','ice','lightning','poison'].map(element=>({path:`resistances.${element}`,label:`${element} resistance`,group:'Defences',min:-1000000,max:1000000})),
  ...elements.flatMap(element=>[
    {path:`mainHand.${element}`,label:`Main hand ${element}`,group:'Weapon damage',min:0,max:1000000},
    {path:`offHand.${element}`,label:`Off hand ${element}`,group:'Weapon damage',min:0,max:1000000},
    {path:`elements.${element}`,label:`${element} damage multiplier`,group:'Damage multipliers',min:0,max:1000000},
    {path:`elementalPenetration.${element}`,label:`${element} penetration`,group:'Penetration',min:0,max:1},
  ]),
];
export const STAT_OVERRIDE_PATHS = Object.freeze(Object.fromEntries(STAT_OVERRIDE_FIELDS.map(field=>[field.path,field])));
export function validateStatOverrides(value){
  if(value===undefined)return {};
  if(value===null||typeof value!=='object'||Array.isArray(value)||(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw Error('Invalid stat overrides');
  for(const [path,number] of Object.entries(value)){const field=Object.hasOwn(STAT_OVERRIDE_PATHS,path)?STAT_OVERRIDE_PATHS[path]:null;if(!field||typeof number!=='number'||!Number.isFinite(number)||number<field.min||number>field.max)throw Error('Invalid stat overrides');}
  return {...value};
}
export function applyStatOverrides(stats,overrides={}){for(const [path,value] of Object.entries(overrides)){const parts=path.split('.');if(parts.length===1)stats[parts[0]]=value;else stats[parts[0]][parts[1]]=value;}return stats;}
