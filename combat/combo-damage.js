import {computeCombatStats} from './stats.js';
import {selectedCombos,comboSummary} from './combos.js';
import {enemyConditions} from './statuses.js';
import {damageRound} from './calculate.js';
import {mitigateDamage} from './targets.js';

export function calculateComboDamage(build,catalog,target){
  const selected=selectedCombos(build,catalog),nova=selected.find(s=>s.id==='combo_nova');
  const result={supported:false,status:!nova?'Learn Combo Nova under Upgrades':!build.combo?.active?'Combo inactive — enable it under Configuration':'Combo activation required',dps:null,expectedHit:null,normalHit:null,interval:null,projectiles:nova?.resolved['pulse-action']?.projectiles??0,notes:[],limitations:[],sources:[]};
  if(!nova||!build.combo?.active||!comboSummary(build,catalog).activation)return result;
  const focus={...nova,upgrades:[]},stats=computeCombatStats(build,catalog,focus),enemy=enemyConditions(build,catalog);
  const interval=nova.resolved['pulse-cooldown']/1000;
  const fixed=catalog.combos.projectile['hit-effects'].filter(e=>e.class==='Damage').reduce((sum,e)=>sum+(e.physical||0),0);
  const conversion=selected.flatMap(s=>s.resolved.modifiers||[]).find(m=>m.class==='Modifiers::ConvertCustomStat'&&m.to==='combo-dmg');
  const attribute=conversion?.from==='vitality'?'vit':'foc';
  // CustomPlayerStat::Finalize multiplies val by (mul + mulSum), both initially 1.
  const customBinding=conversion?stats.attributes[attribute]*conversion.mul*2:0;
  // Engine float-to-GetParamInt coercion is not source available. Keep this
  // contribution out of the reviewed core rather than inventing its rounding.
  const raw=fixed*(1+stats.spellPower/catalog.facts.powerDivisor)*stats.damageMultiplier*stats.globalDamageMultiplier*stats.skillDamageMultiplier*stats.elements.physical;
  const normalHit=mitigateDamage(damageRound(raw),'physical',target,stats,catalog,enemy);
  const limitations=[...stats.limitations,'One projectile contact against the target per one-second pulse is assumed; projectile count is not multiplied into single-target DPS.','Combo uptime, travel, kill-triggered Combo Gasket and Combo Hex procs are not simulated.','Partial source-reviewed core estimate, not runtime-validated combo DPS.'];
  if(conversion)limitations.push(`The combo-dmg binding is ${customBinding} from ${conversion.from} (0.75 conversion × source custom-stat finalization factor 2). Its additional projectile damage is excluded: engine float-to-integer binding behavior has not been verified.`);
  const targetNote=target.id?`Target preset: ${target.name||target.id}; armor ${target.armor}, elemental resistance ${Object.entries(target.resistances||{}).filter(([,v])=>v).map(([e,v])=>`${e} ${v}`).join(', ')||'none'}.`:null;
  return {...result,supported:true,status:'partial',dps:normalHit/interval,expectedHit:normalHit,normalHit,interval,customBinding,stats,notes:['Combo hits use spell power and spell-damage modifiers, but do not receive ordinary spell critical damage. Marked can flag a critical event without adding the ordinary spell-critical multiplier.','Nova is shown separately; it is not included in the focused ability DPS or TTK. Higher ranks widen the projectile fan, not the assumed single-target contact count.',...(targetNote?[targetNote]:[]),...stats.notes],limitations,sources:[...new Set([nova.source,catalog.combos.projectileSource,...catalog.combos.mechanicSources,...(target.source?[target.source]:[]),...(target.mechanicSources||[]),'scripts/Behaviors/Armor.as',...stats.sources,...enemy.sources])]};
}
