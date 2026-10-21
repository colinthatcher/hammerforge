import {computeCombatStats} from './stats.js';
import {damageRound} from './calculate.js';

// A source-reviewed direct, landed-hit scenario. Values are planner inputs, not enemy data.
export function calculateSurvival(build,catalog,{damage=100,healthPercent=100,penetration=0}={}){
  if(!Number.isInteger(damage)||damage<0||damage>100000000||!Number.isFinite(healthPercent)||healthPercent<1||healthPercent>100||!Number.isFinite(penetration)||penetration<0||penetration>100)throw Error('Invalid incoming-hit scenario');
  const stats=computeCombatStats(build,catalog,false);
  const health=Math.max(1,Math.round(stats.health)),mana=Math.max(0,Math.round(stats.mana));
  const currentHealth=Math.max(1,Math.ceil(health*healthPercent/100));
  const defenseMultiplier=defense=>{
    const a=defense*catalog.facts.armorEfficiency;
    return a>=0?1/(1+a):1-a*catalog.facts.armorNegativeMultiplier;
  };
  const physicalDefense=stats.armor>0?stats.armor*(1-penetration/100):stats.armor;
  const physicalMultiplier=defenseMultiplier(physicalDefense);
  // ApplyArmor rounds before fire/poison's immediate damage split rounds again.
  const direct=(input,multiplier,scale=1)=>damageRound(damageRound(input*multiplier)*scale);
  const immediateScale=element=>element==='Fire'?catalog.facts.fireImmediateDamageScale:element==='Poison'?catalog.facts.poisonImmediateDamageScale:1;
  const describe=(label,taken)=>({label,taken,remaining:Math.max(0,currentHealth-taken),lethal:taken>=currentHealth,hitsSurvived:taken===0?Infinity:Math.max(0,Math.ceil(currentHealth/taken)-1)});
  // Sidebar maximums use full health and no penetration, independent of the Calcs scratchpad.
  const maximumHit=(multiplier,scale=1)=>{
    let lo=0,hi=1;
    while(direct(hi,multiplier,scale)<health){lo=hi;hi*=2;if(!Number.isFinite(hi))return Number.MAX_SAFE_INTEGER;}
    while(lo<hi){const mid=lo+Math.ceil((hi-lo)/2);if(direct(mid,multiplier,scale)<health)lo=mid;else hi=mid-1;}
    return lo;
  };
  const armorMax=maximumHit(defenseMultiplier(stats.armor));
  return {health,mana,currentHealth,armor:stats.armor,healthRegen:stats.healthRegen,manaRegen:stats.manaRegen,healthGain:stats.healthGain,manaGain:stats.manaGain,moveSpeed:stats.moveSpeed,resistances:stats.resistances,reduction:1-physicalMultiplier,maximumHits:[
    {label:'Physical',damage:armorMax,mitigation:'Armor; direct hit (attacks and spells)'},
    ...['Fire','Ice','Lightning','Poison'].map(element=>({label:`${element} attack / spell`,damage:maximumHit(defenseMultiplier(stats.resistances[element.toLowerCase()]),immediateScale(element)),mitigation:'Resistance and initial damage split; direct hit'})),
    {label:'Unmitigated reference',damage:maximumHit(1),mitigation:'No defenses; not an elemental prediction'}
  ],rows:[describe('Physical · armor',direct(damage,physicalMultiplier)),describe('Unmitigated · reference',damage),...['Fire','Ice','Lightning','Poison'].map(element=>describe(`${element} · resistance (initial hit)`,direct(damage,defenseMultiplier(stats.resistances[element.toLowerCase()]),immediateScale(element))))],limitations:[
    'Source-reviewed pool, armor, and resistance direct-hit estimate, not a runtime-validated simulation. Imported heroes use modeled maximum pools, not live health or mana.',
    'Assumes every hit lands and can kill. Block, evade, parry, shields (including mana shield), damage-taken modifiers, healing, regeneration, lethal-hit protection and resource consumption are excluded.',
    'Thresholds and rows are the initial single-channel landed hit only: no affliction ticks, regeneration, avoidance, or excluded damage-taken modifiers. Fire affliction ticks can kill after surviving the initial hit; poison affliction is nonlethal and is not included in total survival. No general attack/spell mitigation is known. The unmitigated row ignores all defenses.',
    'Passive, equipment, trinket and selected supported buff modifiers feed the pools. Other progression systems and unsupported or conditional modifiers may change in-game values.',
    ...stats.limitations
  ],sources:[...new Set(['scripts/Behaviors/Actors/Player/Player.as','scripts/Behaviors/Armor.as',...(catalog.defences?.mechanicSources||[]),...stats.sources])]};
}
