import {calculateSurvival} from './combat/survival.js';

const fmt=v=>v===null?'—':v===Infinity?'Unlimited':new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderSurvival(build,catalog,detailView){
  const result=calculateSurvival(build,catalog,{
    damage:Number(document.querySelector('#incoming-damage').value),
    healthPercent:Number(document.querySelector('#starting-health').value),
    penetration:Number(document.querySelector('#incoming-penetration').value)
  });
  document.querySelector('#hero-resources').innerHTML=`<div class="stat-row resource-color-health"><span>Health:</span><strong>${fmt(result.health)}</strong></div><div class="stat-row resource-color-mana"><span>Mana:</span><strong>${fmt(result.mana)}</strong></div>`;
  const sidebar=document.querySelector('#sidebar-defences');
  if(sidebar){
    const value=(label,n,title='',suffix='')=>`<div class="stat-row"${title?` title="${esc(title)}"`:''}><span>${esc(label)}:</span><strong>${fmt(n)}${suffix}</strong></div>`;
    const physical=result.maximumHits.find(hit=>hit.label==='Physical');
    const modelTitle='Full health; no penetration. Initial direct hit only, using armor or matching resistance. No avoidance, shields, damage-taken modifiers, recovery or affliction ticks. Fire ticks can kill after surviving the initial hit.';
    const elemental=result.maximumHits.filter(hit=>hit.label.endsWith('attack / spell'));
    const elementalHint=element=>{
      if(element==='Fire')return `Fire applies ${fmt(catalog.facts.fireImmediateDamageScale*100)}% of mitigated damage immediately; the remaining ${fmt((1-catalog.facts.fireImmediateDamageScale)*100)}% feeds its burn damage-over-time pool. The game rounds resistance mitigation first, then the immediate damage. This maximum covers only the initial hit, which is why it can exceed ice/lightning. Burn ticks are excluded and can still kill afterward. ${modelTitle}`;
      if(element==='Poison')return `Poison applies ${fmt(catalog.facts.poisonImmediateDamageScale*100)}% of mitigated damage immediately; the remaining ${fmt((1-catalog.facts.poisonImmediateDamageScale)*100)}% feeds its poison damage-over-time pool. The game rounds resistance mitigation first, then the immediate damage. This maximum covers only the initial hit, not subsequent poison ticks. Player poison ticks are nonlethal by themselves; the initial hit can still kill. ${modelTitle}`;
      return modelTitle;
    };
    sidebar.innerHTML=`<div class="sidebar-stat-group" title="${modelTitle}">${value('Armor',result.armor,'Rating after New Game Plus and shadow-curse penalties. Negative armor amplifies damage.')}${value('Physical maximum hit',physical.damage,`Applies equally to physical attacks and spells in this model. ${modelTitle}`)}${elemental.map(hit=>{const element=hit.label.split(' ')[0];return value(`${element} maximum hit`,hit.damage,elementalHint(element));}).join('')}</div><div class="sidebar-stat-group">${value('Health regeneration',result.healthRegen,'Effective health per second, including health-gain modifiers; resumes after the regeneration delay.','/s')}${value('Mana regeneration',result.manaRegen,`Effective mana per second, including mana-gain modifiers. Missing-mana bonuses use ${build.currentManaPercent??100}% current mana.`,'/s')}${['Fire','Ice','Lightning','Poison'].map(element=>value(`${element} resistance`,result.resistances[element.toLowerCase()],'Resistance rating after New Game Plus and shadow-curse penalties, not a percentage.')).join('')}${value('Movement speed',result.moveSpeed,'Flat-terrain stat multiplier. Excludes skill movement, slows, tile effects and engine speed clamps.','×')}</div><small class="sidebar-model-key" title="${modelTitle}">Max hits: initial damage only</small>`;
  }
  const output=document.querySelector('#survival-output');
  detailView?.capture?.(output);
  output.innerHTML=`<p class="panel-note">Starting health: <strong>${fmt(result.currentHealth)} / ${fmt(result.health)}</strong> · Physical armor reduction for this hit: <strong>${fmt(result.reduction*100)}%</strong></p><p class="mechanics-note">Initial landed hits · armor / matching resistance · no recovery or affliction ticks</p><div class="survival-table"><table><caption class="panel-note">Repeated identical direct hits · no recovery or affliction damage between hits. Penetration input affects physical armor only.</caption><thead><tr><th scope="col">Hit scenario</th><th scope="col">Damage taken</th><th scope="col">Health after one hit</th><th scope="col">Hits survived</th></tr></thead><tbody>${result.rows.map(r=>`<tr><th scope="row">${r.label}</th><td>${fmt(r.taken)}</td><td class="${r.lethal?'lethal':''}">${r.lethal?'Lethal':fmt(r.remaining)}</td><td>${fmt(r.hitsSurvived)}</td></tr>`).join('')}</tbody></table></div><details class="mechanics-disclosure" data-disclosure="survival-assumptions"><summary>Survival mechanics & exclusions</summary><p>“Hits survived” counts direct hits you remain alive after; a hit that reduces health to zero is lethal. Fire affliction can still kill afterward. Change the damage to test smaller blows, heavy hits or critical hits.</p><ul class="calculation-limits">${result.limitations.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>${result.sources.map(s=>`<p class="reference-source">Source: <code>${esc(s)}</code></p>`).join('')}</details>`;
  detailView?.apply?.(output);
}
