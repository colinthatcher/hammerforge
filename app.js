import {ATTRIBUTES,SLOT_LABELS,resolveTarget,createBuild,createGear,equipGear,compatibleAffixes,availableSkills,abilityDefinition,collectStats,calculateAbility,validatePlannerBuild,gearIntensity} from './planner-model.js';
import {initializeCharacterImport} from './character-import-ui.js';
import {playerConditions} from './combat/statuses.js';
import {emptyCombo,comboSummary} from './combat/combos.js';
import {calculateCombo} from './planner-model.js';
import {emptyProgression,emptyAccomplishmentAttributes} from './combat/progression.js';
import {renderSurvival} from './survival-ui.js';
import {initializeDetailView} from './ui-details.js';
import {createRenderScheduler} from './ui-render.js';
import {resolveSkill} from './combat/definitions.js';
import {presentItem,presentModifier} from './item-presentation.js';
import {itemDisplayName} from './item-name.js';
import {selectAffix,affixSelectionValid,slotItems,selectSlotItem} from './item-selection.js';
import {STAT_OVERRIDE_FIELDS,STAT_OVERRIDE_PATHS} from './combat/stat-overrides.js';
import {openBuildStorage} from './build-storage.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||!Number.isFinite(v)?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v);
const statusLabel=r=>({utility:'Utility',passive:'Passive effect',unlearned:'Not learned',conflict:'Upgrade conflict','missing-equipment':'Weapon required',unsupported:'Unsupported mechanics'}[r.status]||'Core estimate');
const option=(value,label,selected)=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;
function characterLabel(character){
 const base=catalog.classes.find(c=>c.id===character.classId);
 const profession=base?.specializations.find(s=>s.id===character.specializationId)?.name||base?.name;
 return `${character.name} (${profession?`${profession} · `:''}Level ${character.level})`;
}
const detailView=initializeDetailView();
const renderScheduler=createRenderScheduler();
function disclosure(id,title,body,{open=false,className=''}={}){open=open||['town-progression','accomplishments','combo-settings','combo-snapshot','town-buffs','enemy-control','focus-formula'].includes(id)||id.startsWith('progression:');return `<details class="mechanics-disclosure ${className}" data-disclosure="${esc(id)}" ${open?'data-default-open open':''}><summary>${esc(title)}</summary>${body}</details>`;}
let catalog,library,build,buildStorage,compareId='',draft,editingId,selectedGearId='',toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4500);}
function persist(){
 if(!buildStorage){$('#saved').textContent='Storage unavailable — export a backup';return;}
 $('#saved').textContent='Saving locally…';
 void buildStorage.save(library).catch(()=>{$('#saved').textContent='Storage unavailable — export a backup';});
}
function validateLibrary(raw){
 if(!Array.isArray(raw?.builds)||!raw.builds.length||raw.builds.length>100)throw Error('Invalid build library');
 const builds=raw.builds.map(b=>validatePlannerBuild(b,catalog));
 if(new Set(builds.map(b=>b.id)).size!==builds.length)throw Error('Duplicate build IDs');
 return {builds,activeId:builds.some(b=>b.id===raw.activeId)?raw.activeId:builds[0].id};
}
function update(){persist();render();}
const state=path=>build.skills[path]||{rank:1,upgrades:{}};
function editState(path){return build.skills[path]??= {rank:1,upgrades:{}};}
function sourceLink(source){return `<p class="reference-source">Source: <code>${esc(source)}</code></p>`;}
function parameterTable(skill){return `<table class="reference-table"><thead><tr><th>Parameter</th><th>Source rank values</th></tr></thead><tbody>${skill.parameters.map(p=>`<tr><td>${esc(p.label)}</td><td>${p.values.map(esc).join(' / ')}</td></tr>`).join('')}</tbody></table>`;}
function modifierText(modifiers,roll){return modifiers.map(m=>{
 const props=Object.entries(m).filter(([k])=>k!=='class').map(([k,v])=>{
  const ranged=Array.isArray(v)&&v.length===2&&v.every(Number.isFinite);
  const display=ranged?`${fmt(v[0]+(v[1]-v[0])*roll)} (${v.join('–')})`:typeof v==='object'?JSON.stringify(v):v;
  return `${k}: ${display}`;
 }).join(' · ');
 return `<div class="modifier-line"><strong>${esc(m.class.replace('Modifiers::',''))}</strong> ${esc(props||'See game definition')}</div>`;
}).join('')||'<p class="panel-note">No direct stat modifiers in this definition.</p>';}
function impact(other,path=build.focusSkill){const a=calculateAbility(build,catalog,path),b=calculateAbility(other,catalog,path);if(a.dps===null||b.dps===null)return '<span class="impact-muted">No independent damage comparison</span>';const delta=a.dps-b.dps;return `<span class="impact ${delta>0?'positive':delta<0?'negative':'impact-muted'}">${delta>0?'+':''}${fmt(delta)} DPS</span>`;}
function withoutGear(id){const copy=structuredClone(build);copy.gear.find(g=>g.id===id).equipped=false;return copy;}
function progressionMarkup(){
 const data=catalog.progression;if(!data)return '';
  const p=build.progression||emptyProgression();
   const purchased=(kind,definition,label,power)=>`<label>${esc(label)}<select data-progression-kind="${kind}">${option('0','None',String(p[kind]??0))}${definition.steps.map((s,i)=>option(String(i+1),`${s.name} · +${s.modifiers.find(m=>m.class==='Modifiers::DamagePowerAdd')[power]} ${power.replace('-',' ')}`,String(p[kind]??0))).join('')}</select></label>${disclosure(`progression-source:${kind}`,'Source definition',sourceLink(definition.source))}`;
   const accomplishmentTotal=Object.values(p.accomplishmentAttributes||{}).reduce((n,v)=>n+v,0);
    const accomplishments=disclosure('accomplishments',`Accomplishment attributes${accomplishmentTotal?` · +${accomplishmentTotal} total`:''}`,`<p class="panel-note">Native H2SV imports derive these bonuses from observed town statistics when available. Adjust these values manually only if needed; enter only the Accomplishments contribution, not the attribute total.</p><div class="attribute-grid">${Object.entries(ATTRIBUTES).map(([a,label])=>`<label>${esc(label)}<input aria-label="${esc(label)} from accomplishments" type="number" min="0" max="10000" step="1" data-progression-kind="accomplishmentAttributes" data-progression-id="${a}" value="${p.accomplishmentAttributes?.[a]??0}"></label>`).join('')}</div>${disclosure('accomplishments-source','How these attributes apply',`<p>Added separately from base, picked and elixir attributes, before derived power, weapon scaling and defenses.</p>${sourceLink('scripts/Behaviors/Actors/Modifiers/Modifiers.as')}`)}`);
   const levels=(kind,label,help)=>disclosure(`progression:${kind}`,`${label} · ${Object.values(p[kind]||{}).filter(v=>v>0).length} set`,`<p class="panel-note">${help}</p>${(data[kind]||[]).map(d=>`<div class="reference-upgrade"><label>${esc(d.name)}${kind==='heroTitles'?' title level':' mastery level'}<input type="number" min="0" max="10000" step="1" data-progression-kind="${kind}" data-progression-id="${esc(d.id)}" value="${p[kind]?.[d.id]||0}"></label>${disclosure(`progression-effect:${d.id}`,'Exact source effects',modifierText(d.modifiers,kind==='heroTitles'?(p[kind]?.[d.id]||0)/10:(p[kind]?.[d.id]||0))+sourceLink(d.source))}</div>`).join('')}`);
    return disclosure('town-progression','Town progression & masteries',`<p class="panel-note">Permanent bonuses, saved per build. Native imports populate supported purchases, masteries, class titles, gold/wood donation titles and accomplishment attributes. Only Mystic spell-power and Armorer attack-power town purchases auto-import; other town upgrades remain unmodeled. Reimport older characters to populate donation titles, or enter the levels shown in game below.</p>${purchased('mysticSpellPower',data.mystic,'Mystic spell-power upgrade','spell-power')}${data.armorer?purchased('armorerAttackPower',data.armorer,'Armorer attack-power upgrade','attack-power'):''}${accomplishments}${levels('spellMasteries','Spell masteries','Each level adds 4% damage within that mastery. General and matching elemental masteries multiply together; these do not apply to weapon attacks.')}${levels('weaponMasteries','Weapon masteries','Matching weapon tags receive 5% more damage per level. Shield mastery is defensive and does not add attack damage.')}${levels('heroTitles','Damage-related hero titles','Wizard and Ranger: highest matching character level in this profile (+3 spell/attack power per level). Gold and wood donation levels import from chapel-revive town statistics using the reviewed game formula. Each level adds 0.5% attack damage for the gold title or spell damage for Logger; manual correction remains available.')}`,{className:'ability'});
}
function townBuffMarkup(){
 const data=catalog.progression;if(!data)return '';
 const labels={tavern_food:'Tavern meal',tavern_drink:'Tavern drink',chapel:'Chapel blessing'};
  const count=Object.keys(build.progression?.townBuffs||{}).length;
  return disclosure('town-buffs',`Town buffs · ${count} active`,`${[...new Set(data.townBuffs.map(d=>d.set))].map(set=>{const selected=build.progression?.townBuffs?.[set]||'',def=data.townBuffs.find(d=>d.id===selected);return `<div class="condition-row ${selected?'active':''}"><label>${esc(labels[set]||set)}<select data-progression-kind="townBuffs" data-progression-id="${esc(set)}">${option('','Off',selected)}${data.townBuffs.filter(d=>d.set===set).map(d=>option(d.id,d.name,selected)).join('')}</select></label>${def?`<p>${esc(def.description)}</p>${disclosure(`town-buff-source:${set}`,'Exact source effects',modifierText(def.modifiers,1)+sourceLink(def.source))}`:''}</div>`;}).join('')}`);
}
function renderConditions(){
 const families=playerConditions(build,catalog);
 const renderFamily=(f,side)=>{
  const stack=f.kind==='stack',stored=build.conditions?.[side]?.[f.id],selected=stack&&f.available&&stored?Math.min(stored,f.max):stored,disabled=stack&&!f.available;
  const definition=stack?f.definition:f.variants.find(v=>v.id===(selected||f.variants[0].id))?.definition;
  const duration=stack?definition?.timer?.time:definition?.duration;
  const effect=side==='enemy'?({vulnerability:`${fmt(((definition?.['dmg-taken-mul']??1)-1)*100)}% more damage taken`,marked:`${fmt((definition?.['receive-crit-chance']??0)*100)}% additional independent critical chance (non-DoT)`,armor_break:`${fmt((1-(definition?.['armor-mul']??1))*100)}% less physical armor · affects armored targets`}[f.id]||'Control / defensive effect · no direct DPS change'):'Supported modifiers apply to the ability estimate; attack-only, defensive and utility effects may not change spell DPS.';
   return `<div class="condition-row ${selected&&!disabled?'active':''}"><label>${esc(f.name)}<select data-condition-side="${side}" data-condition-id="${esc(f.id)}" ${disabled?'disabled':''}>${option('','Off',disabled?'':String(selected||''))}${stack?Array.from({length:f.max||0},(_,i)=>option(String(i+1),f.max===1?'Active':`${i+1} stack${i?'s':''}`,String(selected||''))).join(''):f.variants.map(v=>option(v.id,v.name,String(selected||''))).join('')}</select></label>${disabled?`<small>${esc(f.reason)}</small>`:side==='enemy'?`<small>${esc(effect)}</small>`:''}${disclosure(`condition:${side}:${f.id}`,'Effect & source definition',`<p>${esc(effect)}${typeof duration==='number'?` · ${fmt(duration/1000)}s base duration`:''}</p><pre>${esc(JSON.stringify(definition||{},null,2))}</pre>${sourceLink(f.source||f.variants?.[0]?.source)}`)}</div>`;
 };
   const combo=build.combo??=emptyCombo(), comboSkills=catalog.combos?.skills||[], burstSelected=comboSkills.some(s=>combo.skills[s.id]>0&&s.burst), summary=comboSummary(build,catalog);
     $('#player-conditions').innerHTML=`<h2>Skill buffs</h2>`+families.map(f=>renderFamily(f,'player')).join('')+`<section class="character-conditions"><h2>Character conditions</h2>`+disclosure('combo-snapshot',`Combo · ${combo.active?'active':'inactive'}${combo.burstActive?' · burst active':''}`,`<div class="condition-row ${combo.active?'active':''}"><label><span>Combo active</span><input type="checkbox" data-combo-active ${combo.active?'checked':''} ${summary.activation?'':'disabled'}></label></div><div class="condition-row ${combo.burstActive?'active':''}"><label><span>Bursting buff active (10s)</span><input type="checkbox" data-combo-burst ${combo.burstActive?'checked':''} ${burstSelected?'':'disabled'}></label><small>Independent of combo state; only the learned burst applies.</small></div>${summary.activation?`<p class="panel-note">${esc(summary.activation.name)} · ${fmt(summary.threshold)} to activate · ${fmt(summary.obtainSeconds)}s obtain / ${fmt(summary.sustainSeconds)}s sustain. Timers are not simulated.</p>`:'<p class="panel-note">Choose combo skills under Upgrades to enable these controls.</p>'}${comboEstimateMarkup()}`,{className:'condition-group'})+townBuffMarkup()+`<div class="condition-row"><label>Current mana %<input type="number" data-defence-setting="currentManaPercent" min="0" max="100" step="any" value="${build.currentManaPercent??100}"></label><small>Snapshot for missing-mana regeneration bonuses, not automatic mana consumption.</small></div><div class="condition-row"><label>New Game Plus level<input type="number" data-defence-setting="ngp" min="0" max="10000" step="1" value="${build.ngp??0}"></label><small>Applies the game’s armor and resistance penalties. Scenario setting, not inferred from character level or imported automatically.</small></div><div class="condition-row"><label>Shadow curses<input type="number" data-defence-setting="shadowCurses" min="0" max="100000" step="1" value="${build.shadowCurses??0}"></label><small>Native saves provide this count. Applies armor/resistance penalties and supported per-curse effects.</small></div></section>`;
  const enemies=catalog.statuses?.enemy||[],direct=new Set(['vulnerability','marked','armor_break']),control=enemies.filter(f=>!direct.has(f.id));
  const controlCount=control.filter(f=>build.conditions?.enemy?.[f.id]).length;
   $('#enemy-conditions').innerHTML=enemies.filter(f=>direct.has(f.id)).map(f=>renderFamily(f,'enemy')).join('')+disclosure('enemy-control',`Control & defensive debuffs · ${controlCount} active`,`<p class="panel-note">Reference conditions; no direct contribution to this target's DPS.</p>${control.map(f=>renderFamily(f,'enemy')).join('')}`);
}
function comboEstimateMarkup(){
 const r=calculateCombo(build,catalog);
  return `<h3 class="spaced">Combo Nova</h3>${r.supported?`<p class="panel-note">Partial estimate · separate from focused DPS. One contact per pulse; custom-stat damage and triggered procs excluded.</p><div class="focus-metrics"><div><small>Normal damage / contact</small><strong>${fmt(r.normalHit)}</strong></div><div><small>Partial DPS</small><strong>${fmt(r.dps)}</strong></div></div>`:`<p>${esc(r.status||'Combo estimate unavailable')}</p>`}${disclosure('combo-calculation','Nova mechanics, exclusions & sources',`<p>${fmt(r.projectiles)} projectiles / pulse. Single-target contact count is not multiplied by the fan.</p>${[...(r.notes||[]),...(r.limitations||[])].map(n=>`<p>${esc(n)}</p>`).join('')}${(r.sources||[]).map(sourceLink).join('')}`)}`;
}
function comboSkillsMarkup(){
 const skills=catalog.combos?.skills||[],combo=build.combo??=emptyCombo();
  return disclosure('combo-settings',`Combo skills · ${Object.values(combo.skills).filter(v=>v>0).length} learned`,`<p class="panel-note">Choose ranks, then enable the snapshot in Configuration. Conflicting choices replace each other. Unlocks and point budgets are not enforced.</p>${skills.map(s=>`<article class="reference-upgrade"><h3>${esc(s.name)}</h3><label>Rank<select data-combo-skill="${esc(s.id)}">${option('0','Not learned',String(combo.skills[s.id]||0))}${Array.from({length:s.rankCount},(_,i)=>option(String(i+1),`Rank ${i+1}`,String(combo.skills[s.id]||0))).join('')}</select></label><p>${esc(s.description)}</p>${disclosure(`combo-source:${s.id}`,'Ranks & source definition',`${s.parameters.length?parameterTable(s):''}${sourceLink(s.source)}<pre>${esc(JSON.stringify(s.ranks[combo.skills[s.id]>0?combo.skills[s.id]-1:0],null,2))}</pre>`)}</article>`).join('')}`,{className:'ability'});
}
function render(){renderScheduler.request(renderNow);}
function renderCharacterStats(){
 const stats=collectStats(build,catalog),natural=structuredClone(build);delete natural.statOverrides;
 const calculated=collectStats(natural,catalog),editable=$('#edit-character-stats').checked;
 const get=(object,path)=>path.split('.').reduce((value,key)=>value?.[key],object);
 const overrides=build.statOverrides||{},count=Object.keys(overrides).length;
 $('#character-stats').innerHTML=[...new Set(STAT_OVERRIDE_FIELDS.map(f=>f.group))].map(group=>`<section class="character-stat-group"><h2>${esc(group)}</h2>${STAT_OVERRIDE_FIELDS.filter(f=>f.group===group).map(f=>{
  const manual=Object.hasOwn(overrides,f.path),value=get(stats,f.path);
  return `<div class="character-stat-row ${manual?'manually-edited':''}"><label for="stat-${esc(f.path)}">${esc(f.label)}${manual?' · manual':''}</label>${editable?`<input id="stat-${esc(f.path)}" data-stat-override="${esc(f.path)}" type="number" step="any" min="${f.min}" max="${f.max}" value="${esc(value)}" aria-describedby="character-override-note">`:`<strong>${fmt(value)}</strong>`}${manual?`<button data-reset-stat="${esc(f.path)}" aria-label="Reset ${esc(f.label)}">Reset</button>`:''}<small>Calculated: ${fmt(get(calculated,f.path))}</small></div>`;
 }).join('')}</section>`).join('');
 $('#reset-stat-overrides').disabled=!count;
 $('#stat-override-warning').hidden=!count;
 $('#stat-override-warning').innerHTML=count?`<button class="text-button" data-go-tab="character" title="Calculated totals have been manually overridden. Open Character to review or reset them.">⚠ Manual raw stats active (${count})</button>`:'';
}
function renderNow(){
  detailView.capture();
 $('#build-select').innerHTML=library.builds.map(b=>option(b.id,characterLabel(b),build.id)).join('');
 $('#build-name').value=build.name;$('#class').innerHTML=catalog.classes.map(c=>option(c.id,c.name,build.classId)).join('');$('#level').value=build.level;
 const base=catalog.classes.find(c=>c.id===build.classId);
 $('#specialization').innerHTML=[base,...base.specializations].map(s=>option(s.id,s===base?'Base class':s.name,build.specializationId)).join('');
 const stats=collectStats(build,catalog);
 $('#character-import-details').hidden=!build.importInfo;
 $('#character-import-info').innerHTML=build.importInfo?`<p>Profile: ${esc(build.importInfo.profile)} · ${esc(build.importInfo.fileName)}</p>${(build.importInfo.warnings||[]).map(w=>`<p>${esc(w)}</p>`).join('')}`:'';
 $('#attributes').innerHTML=Object.entries(ATTRIBUTES).map(([id,label])=>`<label>${esc(label)}<input data-attribute="${id}" aria-label="Allocated ${label}" type="number" min="0" max="10000" step="1" value="${build.attributes[id]}"><small>${fmt(stats.attributes[id])} total</small></label>`).join('');
 $('#gear-count').textContent=build.gear.filter(g=>g.equipped).length;$('#trinket-count').textContent=build.trinkets.length;
  const available=availableSkills(build,catalog),weapons=available.filter(s=>s.weaponAttack);
  const skills=[...weapons,...available.filter(s=>!s.weaponAttack)];
  const missingFocus=!skills.some(s=>s.source===build.focusSkill)?abilityDefinition(catalog,build.focusSkill):null;
  $('#focus-skill').innerHTML=(missingFocus?option(missingFocus.source,`${missingFocus.name} — matching weapon required`,build.focusSkill):'')+skills.map(s=>option(s.source,s.weaponAttack?`${s.name} — ${s.equipmentName}${s.id.endsWith('_epic')?' (epic)':''}`:s.name,build.focusSkill)).join('');
   $('#ability-list').innerHTML=`<h3 class="spaced">Equipped weapon attacks</h3>`+(weapons.length?weapons.map(abilityMarkup).join(''):'<p class="panel-note">No weapon equipped. <button class="text-button" data-go-tab="gear">Add equipment</button> to include its attacks.</p>')+`<h3 class="spaced">Class skills & spells</h3>`+skills.filter(s=>!s.weaponAttack).map(abilityMarkup).join('');
  const twoHanded=build.gear.find(g=>g.equipped&&catalog.equipment.find(e=>e.id===g.baseId)?.slot==='twohanded');
   if(!build.gear.some(g=>g.id===selectedGearId))selectedGearId=build.gear[0]?.id||'';
   $('#gear-slots').innerHTML=Object.entries(SLOT_LABELS).filter(([slot])=>slot!=='twohanded').map(([slot,label])=>{
    const item=build.gear.find(g=>g.equipped&&((slot==='mainhand'&&g===twoHanded)||catalog.equipment.find(e=>e.id===g.baseId)?.slot===slot));
     const candidates=slotItems(build,catalog,slot);
      return `<div class="equipment-slot"><label for="equipped-${slot}">${esc(label)}<select id="equipped-${slot}" data-slot-item="${slot}" style="color:${item?presentItem(item,catalog.equipment.find(b=>b.id===item.baseId),catalog).quality.color:'inherit'}">${option('',slot==='offhand'&&twoHanded?'Occupied by two-handed weapon':'(empty)',item?.id||'')}${candidates.map(g=>option(g.id,`${itemDisplayName(g,catalog)}${catalog.equipment.find(b=>b.id===g.baseId)?.slot==='twohanded'?' · Two-handed':''}`,item?.id||'')).join('')}</select></label><div class="slot-actions">${item?`<button data-select-gear="${esc(item.id)}" aria-label="Inspect ${esc(itemDisplayName(item,catalog))}">View</button>`:''}<button data-create-slot="${esc(slot)}" aria-label="Create ${esc(label)} item">+ New</button></div></div>`;
  }).join('');
   const selected=build.gear.find(g=>g.id===selectedGearId);
  const tooltip=$('#selected-item');
    tooltip.innerHTML=selected?(()=>{const base=catalog.equipment.find(b=>b.id===selected.baseId),p=presentItem(selected,base,catalog);return `<header><span>${esc(SLOT_LABELS[base.slot])} · ${esc(base.name)}</span><h2 style="color:${p.quality.color}">${esc(itemDisplayName(selected,catalog))}</h2><small>${p.quality.label} · ${selected.affixes.length} affixes${selected.itemLevel!==undefined?` · Level ${selected.itemLevel} (+${selected.upgradeLevel})`:''}</small></header><div class="item-stats"><h3>Base stats</h3>${p.baseStats.length?p.baseStats.map(s=>`<p>${esc(s)}</p>`).join(''):'<p>No base stats.</p>'}${['Prefix','Suffix','Affix'].map(side=>{const affixes=p.affixes.filter(a=>a.type===side);if(side==='Affix'&&!affixes.length)return '';return `<h3>${side}</h3>${affixes.length?affixes.map(a=>`<section class="item-affix"><strong>${esc(a.name)}</strong>${a.stats.map(s=>`<p>${esc(s)}</p>`).join('')}</section>`).join(''):`<p>No ${side.toLowerCase()}.</p>`}`;}).join('')}${p.unresolvedStats.length?p.unresolvedStats.map(s=>`<p class="import-failure">${esc(s)}</p>`).join(''):''}</div>${selected.equipped?`<p>${impact(withoutGear(selected.id))}</p>`:'<p>Unequipped</p>'}<div class="row-actions"><button data-edit-gear="${esc(selected.id)}">Edit item</button><button data-remove-gear="${esc(selected.id)}">Remove item</button></div>`;})():'<p>Select an item from an equipment slot to inspect its stats.</p>';
 $('#trinket-list').innerHTML=build.trinkets.map(t=>{
  const def=catalog.trinkets.find(d=>d.id===t.id),without=structuredClone(build);without.trinkets=without.trinkets.filter(d=>d.id!==t.id);
    return `<article class="ability"><div class="ability-top"><strong>${esc(def.name)}</strong><span class="pill">${esc(def.quality)}</span><button data-remove-trinket="${esc(t.id)}" aria-label="Remove ${esc(def.name)}">×</button></div><p>${esc(t.attuned?def.attunedDescription:def.description)}</p>${impact(without)}<label class="trinket-quantity">Copies<input type="number" min="1" max="1000" step="1" data-trinket-count="${esc(t.id)}" value="${t.count??1}"></label>${def.canAttune?`<label class="toggle-label spaced"><input type="checkbox" data-attune="${esc(t.id)}" ${t.attuned?'checked':''}> Attuned</label>`:''}${disclosure(`trinket:${t.id}`,'Exact effects & source (per copy)',`${modifierText(t.attuned?def.attunedModifiers:def.modifiers,1)}${sourceLink(def.source)}${def.canAttune?'':'<p>No attuned variant in source.</p>'}`)}</article>`;
 }).join('')||'<div class="empty">No trinkets selected.<br>Find one by name or effect to explore its impact.</div>';
      $('#game-skills').innerHTML=`<h2 class="spaced">Skill upgrades</h2>`+skills.filter(s=>!s.weaponAttack).map(s=>disclosure(`upgrades:${s.source}`,`${s.name} · ${Object.values(state(s.source).upgrades).filter(v=>v>0).length} selected / ${s.upgrades.length} available`,s.upgrades.length?s.upgrades.map(u=>`<div class="reference-upgrade"><div class="upgrade-heading"><h3>${esc(u.name)}</h3><label>Tier<select data-upgrade-path="${esc(s.source)}" data-upgrade-id="${esc(u.id)}">${option('0','Not selected',String(state(s.source).upgrades[u.id]||0))}${Array.from({length:u.tiers},(_,i)=>option(String(i+1),`Tier ${i+1}`,String(state(s.source).upgrades[u.id]||0))).join('')}</select></label></div><p>${esc(u.description)}</p>${disclosure(`upgrade-source:${s.source}:${u.id}`,'Tier values & source',parameterTable(u)+sourceLink(s.source))}</div>`).join(''):'<p>No named run upgrades in this definition.</p>',{open:s.source===build.focusSkill,className:'ability'})).join('')+progressionMarkup()+comboSkillsMarkup();
      renderCharacterStats();
     renderConditions();renderFocusNow();renderSurvival(build,catalog,detailView);detailView.apply();
}
function abilityMarkup(s){
 const r=calculateAbility(build,catalog,s.source),st=state(s.source);
 const rank=s.weaponAttack?`<span class="pill">${esc(s.equipmentName)} · ${s.secondary?'secondary':'primary'}${s.id.endsWith('_epic')?' · epic':''}</span>`:`<label>Skill rank<select data-rank="${esc(s.source)}">${option('0','Not learned',String(st.rank))}${Array.from({length:s.rankCount},(_,i)=>option(String(i+1),`Rank ${i+1}`,String(st.rank))).join('')}</select></label>`;
  const resolved=s.weaponAttack?s.ranks[0]:resolveSkill(s,st).resolved;
  return `<article class="ability ${s.source===build.focusSkill?'focused':''}" data-calculation-status="${esc(r.status)}"><div class="ability-top"><button class="skill-pick" data-focus="${esc(s.source)}" aria-pressed="${s.source===build.focusSkill}" title="Inspect ${esc(s.name)}">${esc(s.name)}<span class="inspect-hint">${s.source===build.focusSkill?'Focused':'Inspect →'}</span></button><span class="pill">${s.weaponAttack?'weapon attack':esc(s.type||'passive')}</span></div><p class="ability-description">${esc(s.description)}</p><div class="ability-bottom">${rank}<div class="skill-dps"><small>${r.supported?r.status==='partial'?'PARTIAL DPS':'DPS':'ABILITY STATUS'}</small><strong>${r.supported?fmt(r.dps):statusLabel(r)}</strong></div></div>${!r.supported&&r.unsupported.length?`<p class="panel-note">${esc(r.unsupported[0])}</p>`:''}${disclosure(`ability:${s.source}`,'Skill details, ranks & source',`${s.weaponAttack?'':parameterTable(s)}<p>${esc(r.supported?`${r.limitations.length} excluded or simplified effects. Inspect the focused result for the full breakdown.`:r.notes[0]||'No independent damage cycle.')}</p>${sourceLink(s.definitionSource||s.source)}${disclosure(`ability-raw:${s.source}`,'Resolved definition (selected rank & upgrades)',`<p>Extracted configuration, not a claim that every effect is simulated.${st.rank===0?' Not learned: base definition shown for reference.':''}</p><pre>${esc(JSON.stringify(resolved,null,2))}</pre>`)}`)}</article>`;
}
function renderFocus(){renderScheduler.request(renderFocusNow);}
function renderFocusNow(){
  detailView.capture($('#focus-notes'));
  const skill=abilityDefinition(catalog,build.focusSkill),r=calculateAbility(build,catalog,build.focusSkill),target=resolveTarget(build,catalog);
   const hitDamage=field=>r.components.reduce((sum,c)=>sum+c[field]*c.hits,0)/r.hits;
    const summary=r.supported?[['DPS',fmt(r.dps)],['Non-critical hit',fmt(hitDamage('normalHit'))],['Critical hit',fmt(hitDamage('criticalHit'))],[skill.weaponAttack?'Attack rate':'Cast rate',`${fmt(1/r.interval)}/s`],['Repeat interval',`${fmt(r.interval)}s`]]:[];
    if(r.cooldown>0)summary.push(['Cooldown',`${fmt(r.cooldown)}s`]);
    if(r.activeDps!=null)summary.push(['Active-channel DPS',fmt(r.activeDps)]);
     $('#focus-output').innerHTML=`${r.supported?`${summary.map(([label,value])=>`<div class="stat-row ${label==='DPS'?'core-dps':''}" title="${label.includes('hit')?'Per-contact cycle average; elemental channels combined. Critical chance is included in DPS.':label.endsWith('rate')?'Effective repeat rate including modeled cast, cooldown and duration limits.':'Source-derived skill estimate; see Calcs for details.'}"><span>${esc(label)}:</span><strong>${esc(value)}</strong></div>`).join('')}<button class="sidebar-estimate-link text-button" data-open-details="focus-assumptions" title="Open the full calculation and model limitations">${r.status==='partial'?`Partial estimate · ${r.limitations.length} exclusions`:'Source-derived estimate'}</button>`:`<div class="stat-row unsupported" title="${esc([...new Set(r.unsupported.length?r.unsupported:r.notes)].join('; '))}"><span>Ability status:</span><strong>${esc(statusLabel(r))}</strong></div><button class="sidebar-estimate-link text-button" data-open-details="focus-assumptions">Details in Calcs →</button>`}`;
    $('#focus-output').insertAdjacentHTML('afterbegin',`<div class="target-snapshot" title="Target: ${esc(target.name||'Generic target')}${target.id?'':' · no elemental resistance'}. Change under Configuration."><button class="text-button" data-go-tab="conditions">Target: <strong>${esc(target.name||'Generic target')}</strong></button></div>`);
   const donationId=skill.weaponAttack?'title_mat_gold':'title_mat_wood';
    $('#sidebar-model-warnings').innerHTML=build.importInfo&&!Object.hasOwn(build.progression?.heroTitles||{},donationId)?`<div class="sidebar-build-warning" role="status" title="This imported build has no saved ${skill.weaponAttack?'gold':'wood'} donation-title level. Reimport or enter it under Upgrades. Missing bonuses are not guessed."><button class="text-button" data-go-tab="game" aria-label="Upgrades → Hero titles">⚠ Missing ${skill.weaponAttack?'gold':'wood'} title</button></div>`:'';
    if(build.combo?.active||build.combo?.burstActive)$('#focus-output').insertAdjacentHTML('beforeend',`<div class="active-snapshot">Combo ${build.combo.active?'active':'inactive'}${build.combo.burstActive?' · burst active':''}</div>`);
  $('#armored').checked=build.armored;
  $('#target-preset').innerHTML=option('generic','Generic target (legacy)',build.targetId||'generic')+(catalog.targets||[]).map(t=>option(t.id,t.name,build.targetId)).join('');
  $('#generic-armor').hidden=Boolean(target.id);
  $('#armored').disabled=Boolean(target.id);
  const resistances=Object.entries(target.resistances||{}).filter(([,v])=>v).map(([e,v])=>`${v} ${e}`).join(', ');
  $('#target-details').textContent=`${target.health.toLocaleString('en-US')} health · ${target.armor} physical armor · ${resistances?`${resistances} resistance`:'no elemental resistance'}`;
 if(!library.builds.some(b=>b.id===compareId&&b.id!==build.id))compareId='';
  $('#compare-build').innerHTML=option('','No comparison',compareId)+library.builds.filter(b=>b.id!==build.id).map(b=>option(b.id,characterLabel(b),compareId)).join('');
 const comparison=library.builds.find(b=>b.id===compareId);
   if(comparison){const fixed=structuredClone(comparison);fixed.armored=build.armored;fixed.targetId=build.targetId||'generic';fixed.conditions={player:fixed.conditions?.player||{},enemy:structuredClone(build.conditions?.enemy||{})};const before=calculateAbility(fixed,catalog,build.focusSkill);$('#comparison').innerHTML=before.dps!==null&&r.dps!==null?`<div class="compare-result"><strong>${r.dps>=before.dps?'+':''}${fmt(r.dps-before.dps)} DPS</strong><p>${fmt(before.dps)} → ${fmt(r.dps)} · same target and enemy debuffs, each build’s skill rank, upgrades and character buffs. Excluded effects are not compared.</p></div>`:'<p class="panel-note">No independent damage comparison: check skill availability, equipment and ability type in both builds.</p>';}else $('#comparison').innerHTML='';
  const st=r.stats;const derived=[[skill.weaponAttack?'Attack power':'Spell power',skill.weaponAttack?st.attackPower:st.spellPower],[skill.weaponAttack?'Weapon crit chance':'Spell crit chance',`${fmt(st.critChance*100)}%`],[skill.weaponAttack?'Weapon critical multiplier':'Spell critical multiplier',`${fmt(st.critDamage)}×`],[skill.weaponAttack?'Attack-speed multiplier':'Cast-speed multiplier',`${fmt((skill.weaponAttack?st.attackSpeed:st.castSpeed))}×`],['Skill cooldown multiplier',`${fmt(st.cooldownMultiplier)}×`]];
  if(r.components?.some(c=>c.weaponDerived&&c.hand!=='offhand'))derived.push(['Raw mainhand damage',Object.values(st.mainHand).reduce((sum,v)=>sum+v,0)]);
  if(r.components?.some(c=>c.hand==='offhand'))derived.push(['Raw offhand damage',Object.values(st.offHand).reduce((sum,v)=>sum+v,0)]);
 if(r.components?.some(c=>c.summon))derived.push(['Summon damage multiplier',`${fmt(st.summonDamageMultiplier)}×`]);
 if(st.thorns>0)derived.push(['Thorns',st.thorns]);
 if(build.shadowCurses!==undefined)derived.push(['Saved shadow curses',build.shadowCurses]);
   const derivedMarkup=derived.map(([k,v])=>`<div class="stat-row"><span>${esc(k)}:</span><strong>${typeof v==='number'?fmt(v):esc(v)}</strong></div>`).join('');
   $('#focus-stats').innerHTML=derivedMarkup;
    const sidebarOffence=[['Attack power',fmt(st.attackPower)],['Spell power',fmt(st.spellPower)],[skill.weaponAttack?'Attack crit chance':'Spell crit chance',`${fmt(st.critChance*100)}%`],['Crit multiplier',`${fmt(st.critDamage)}×`],[skill.weaponAttack?'Attack speed':'Cast speed',`${fmt(skill.weaponAttack?st.attackSpeed:st.castSpeed)}×`]];
    if(st.thorns>0)sidebarOffence.push(['Thorns',fmt(st.thorns)]);
    $('#sidebar-stats').innerHTML=`<div class="sidebar-stat-group" role="group" aria-label="Offensive stats">${sidebarOffence.map(([label,value])=>`<div class="stat-row"><span>${esc(label)}:</span><strong>${esc(value)}</strong></div>`).join('')}</div><div class="attribute-stats" role="group" aria-label="Attributes">${Object.entries(ATTRIBUTES).map(([id,label])=>`<div class="stat-row attr-${id}"><span>${esc(label)}:</span><strong>${fmt(st.attributes[id])}</strong></div>`).join('')}</div>`;
   $('#focus-notes').innerHTML=`${r.limitations?.length?`<h3 class="spaced">Excluded / simplified effects</h3><ul class="calculation-limits">${r.limitations.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}${disclosure('focus-formula','How core damage is calculated',`<p>For each included elemental component, start with its source base damage (or truncated weapon scaling), then apply the relevant power and supported multipliers.</p><pre>raw = base × (1 + ${skill.weaponAttack?'attack':'spell'} power / ${catalog.facts.powerDivisor})
    × global × skill × elemental × damage multipliers
normal = round(raw), then round target mitigation
critical = round(raw × critical multiplier), then round mitigation
expected = normal × (1 − crit chance) + critical × crit chance
damage = Σ(expected × modeled contacts) / repeat interval</pre><p>Explicit DoT components omit criticals and the dynamic Damage-modifier path. Summons include their supported summon multiplier. Physical damage uses armor; fire, ice, lightning and poison use their matching resistance and penetration. Pure damage bypasses defenses. Defenses round before Vulnerability; Armor Break affects physical armor only.</p><p>Separate elemental and normal/critical channels round separately. Timing, occupancy and contact assumptions are ability-specific; this is source-reviewed damage, not a complete runtime-validated simulation.</p>`)}${disclosure('focus-model-notes','Ability assumptions & applied modifiers',[...new Set([...r.notes,...st.notes,'Supported unconditional passive, skill-filtered and selected town progression modifiers are included. Automatic buff uptime, conditional procs, other progression systems and sets need further simulation.'])].map(n=>`<p>${esc(n)}</p>`).join(''))}${r.sources?.length?disclosure('focus-sources',`Calculation sources · ${r.sources.length}`,r.sources.map(source=>sourceLink(source)).join('')):''}`;
   const rows=r.components?.map(c=>`<tr><th>${esc(c.label)} · ${esc(c.element)}</th><td>${fmt(c.baseDamage)}</td><td>${fmt(c.normalHit)}</td><td>${fmt(c.criticalHit)}</td><td>${fmt(c.expectedHit)}</td><td>${fmt(c.hits)}</td><td>${fmt(c.damage)}</td><td>${fmt(c.dps)}</td></tr>`).join('')||'';
   $('#calc-skill-name').textContent=skill.name;$('#character-name').textContent=build.name;
    $('#calc-output').innerHTML=`${r.supported?`<p class="scope-note">${r.status==='partial'?`Partial estimate · ${r.limitations.length} excluded or simplified effects.`:'Source-derived estimate.'} Normal and critical channels round separately; modeled contacts are not a complete combat simulation.</p><p>Target: ${esc(target.name||'Generic target')} · ${target.health.toLocaleString('en-US')} health · ${target.armor} armor · ${esc(resistances?`${resistances} resistance`:'no elemental resistance')}.</p><div class="table-scroll"><table class="component-table"><thead><tr><th scope="col">Component</th><th scope="col">Base</th><th scope="col">Normal</th><th scope="col">Critical</th><th scope="col">Expected / contact</th><th scope="col">Contacts</th><th scope="col">Cycle damage</th><th scope="col">DPS</th></tr></thead><tbody>${rows}</tbody></table></div><p>Cast ${fmt(r.castTime)}s · cooldown ${fmt(r.cooldown)}s · repeat interval ${fmt(r.interval)}s · sustained TTK ${r.dps>0?`${fmt(target.health/r.dps)}s`:'—'}. TTK is health ÷ sustained DPS, not an opening-cast simulation.</p>${r.activeDps!=null?`<p>Active-channel DPS: ${fmt(r.activeDps)} · channel duration: ${fmt(r.duration)}s</p>`:''}`:`<p class="unsupported">${esc(statusLabel(r))}: ${esc((r.unsupported||r.notes||[]).join('; '))}</p>`}`;
   detailView.apply($('#focus-notes'));
}
 function chooseBuild(id){library.activeId=id;build=library.builds.find(b=>b.id===id);selectedGearId='';compareId='';update();}
function resetSkills(){const available=new Set(availableSkills(build,catalog).map(s=>s.source));build.skills=Object.fromEntries(Object.entries(build.skills).filter(([p])=>available.has(p)));if(!available.has(build.focusSkill))build.focusSkill=availableSkills(build,catalog).find(s=>s.type==='spell')?.source||[...available][0];}
function openGear(id){if(!id&&build.gear.length>=100)return toast('A build can contain up to 100 items.');editingId=id;draft=id?structuredClone(build.gear.find(g=>g.id===id)):createGear(catalog,catalog.equipment[0].id);$('#gear-title').textContent=id?'Edit equipment':'Create equipment';$('#gear-prefix-search').value='';$('#gear-suffix-search').value='';const base=catalog.equipment.find(e=>e.id===draft.baseId);$('#gear-slot').innerHTML=Object.entries(SLOT_LABELS).map(([id,label])=>option(id,label,base.slot)).join('');$('#gear-roll').value=draft.roll*100;$('#gear-name').value=draft.name;renderBases();$('#gear-dialog').showModal();}
function renderBases(){const items=catalog.equipment.filter(b=>b.slot===$('#gear-slot').value);if(items.length&&!items.some(b=>b.id===draft.baseId)){draft=createGear(catalog,items[0].id);$('#gear-name').value=draft.name;$('#gear-roll').value=50;}$('#gear-base').innerHTML=items.map(b=>option(b.id,`${b.name} · item level ${b.levelMin??'?'}${b.levelMax?`–${b.levelMax}`:'+'}`,draft.baseId)).join('');renderGearDefinition();}
function renderGearDefinition(){renderScheduler.request(renderGearDefinitionNow);}
function renderGearDefinitionNow(){const base=catalog.equipment.find(b=>b.id===$('#gear-base').value);$('#gear-roll-label').textContent=`${$('#gear-roll').value}%`;$('#gear-form button[type=submit]').disabled=!base;
  detailView.capture($('#gear-dialog'));
 const leveled=draft.itemLevel!==undefined;$('#gear-level-fields').hidden=!leveled;$('#gear-roll-control').hidden=leveled;$('#gear-item-level').value=draft.itemLevel??1;$('#gear-upgrade-level').value=draft.upgradeLevel??0;
  if(!base){$('#gear-definition').innerHTML='<p>No base items for this slot.</p>';$('#gear-prefixes').innerHTML='';$('#gear-suffixes').innerHTML='';return;}
 const intensity=leveled?gearIntensity(draft):Number($('#gear-roll').value)/100;
    $('#gear-definition').innerHTML=`<p class="panel-note">Generated name preview: <strong>${esc(itemDisplayName({...draft,name:$('#gear-name').value,baseId:base.id},catalog))}</strong></p><p class="panel-note">Requirements: ${esc(Object.entries(base.requirements).map(([k,v])=>`${k.replace('req-','').toUpperCase()} ${v}`).join(' · ')||'None listed')}. Item and affix legality is not enforced.</p>${base.attacks?.skill?`<label>Weapon attack variant<select data-weapon-variant>${option('standard','Standard (common / uncommon / rare)',draft.sourceQuality===8?'epic':'standard')}${option('epic','Epic',draft.sourceQuality===8?'epic':'standard')}</select></label>`:''}${disclosure(`equipment-base:${base.id}`,'Base modifiers & scaling',`<p>${esc(SLOT_LABELS[base.slot])} · source quality ${esc(base.quality)}${leveled?` · saved level scaling: ${fmt(intensity)}× range intensity (can exceed 1)`:''}</p>${modifierText(base.modifiers,intensity)}${sourceLink(base.source)}`)}${draft.unresolvedModifiers?.length?`<p class="import-failure">${draft.unresolvedModifiers.length} unresolved saved modifiers are retained. Their effects are not calculated.</p>`:''}`;
  const affixes=compatibleAffixes(base,catalog);
  for(const [side,selector] of [['prefix','#gear-prefix-search'],['suffix','#gear-suffix-search']]){
    const query=$(selector).value.trim().toLowerCase(),list=affixes.filter(a=>a[side]),selectedCount=list.filter(a=>draft.affixes.some(d=>d.id===a.id)).length,host=$(`#gear-${side}es`);
    $(`#gear-${side}-count`).textContent=selectedCount>1?`${selectedCount} saved — choose one to replace them`:`${selectedCount} / 1 selected`;
    host.innerHTML=`<label class="toggle-label affix-none"><input type="radio" name="gear-${side}" data-affix-side="${side}" value="" ${selectedCount===0?'checked':''}> No ${side}</label>`+list.map(a=>{
      const selected=draft.affixes.find(d=>d.id===a.id),roll=leveled?intensity:selected?.roll??.5,text=modifierText(a.modifiers,roll),readable=a.modifiers.map(m=>presentModifier(m,roll)).join(' · '),hidden=!!query&&!selected&&!`${a[side]} ${a.name} ${readable}`.toLowerCase().includes(query);
      return `<div class="affix-option" ${hidden?'hidden':''}><label class="toggle-label"><input type="radio" name="gear-${side}" data-affix-side="${side}" data-affix="${esc(a.id)}" value="${esc(a.id)}" ${selected&&selectedCount===1?'checked':''}> ${esc(a[side]||a.name)} <small>${esc(a.quality)}${selected&&selectedCount>1?' · Saved modifier':''}</small></label><p class="affix-effect">${esc(readable)}</p>${selected&&!leveled?`<label>Affix roll · ${fmt(selected.roll*100)}%<input type="range" min="0" max="100" value="${selected.roll*100}" data-affix-roll="${esc(a.id)}"></label>`:''}${disclosure(`equipment-affix:${a.id}`,'Exact modifiers',text+sourceLink(a.source))}</div>`;
    }).join('');
    if(!host.querySelector('.affix-option:not([hidden])'))host.insertAdjacentHTML('beforeend','<p>No matching attributes.</p>');
  }
  detailView.apply($('#gear-dialog'));
}
function renderTrinketPicker(){const search=$('#trinket-search').value.toLowerCase();$('#trinket-results').innerHTML=catalog.trinkets.filter(t=>`${t.name} ${t.description} ${t.attunedDescription}`.toLowerCase().includes(search)).map(t=>{const exists=build.trinkets.some(s=>s.id===t.id);return `<article class="ability"><div class="ability-top"><strong>${esc(t.name)}</strong><span class="pill">${esc(t.quality)}</span><button data-pick-trinket="${esc(t.id)}" ${exists?'disabled':''}>${exists?'Selected':'+ Add'}</button></div><p>${esc(t.description)}</p>${t.canAttune?`<p class="attuned-copy">Attuned: ${esc(t.attunedDescription)}</p>`:''}</article>`;}).join('')||'<p>No trinkets match your search.</p>';}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.resetStat){delete build.statOverrides?.[d.resetStat];if(!Object.keys(build.statOverrides||{}).length)delete build.statOverrides;update();}
  if(d.goTab){$(`#tab-${d.goTab}`)?.click();$(`#view-${d.goTab}`)?.scrollIntoView({behavior:'smooth',block:'start'});}
   if(d.openDetails){if(['focus-assumptions','focus-sources','focus-notes'].includes(d.openDetails)){$('[data-tab="calcs"]')?.click();$('#focus-notes')?.scrollIntoView({behavior:'smooth',block:'nearest'});}else{const target=document.querySelector(`details[data-disclosure="${d.openDetails}"]`);if(target){for(let parent=target;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;target.scrollIntoView({behavior:'smooth',block:'nearest'});}}}
 if(d.close)$('#'+d.close).close();
   if(d.tab){document.querySelectorAll('[data-tab]').forEach(t=>{t.setAttribute('aria-selected',String(t===b));t.tabIndex=t===b?0:-1;});document.querySelectorAll('[id^="view-"][role=tabpanel]').forEach(p=>p.hidden=p.id!==`view-${d.tab}`);}
   if(d.focus){build.focusSkill=d.focus;update();if(matchMedia('(max-width: 760px)').matches)$('.focus-panel').scrollIntoView({behavior:'smooth',block:'start'});}
  if(d.editGear)openGear(d.editGear);
  if(d.selectGear){selectedGearId=d.selectGear;render();}
  if(d.createSlot){openGear();if($('#gear-dialog').open){$('#gear-slot').value=d.createSlot;renderBases();}}
  if(d.removeGear){build.gear=build.gear.filter(g=>g.id!==d.removeGear);if(selectedGearId===d.removeGear)selectedGearId=build.gear[0]?.id||'';update();}
 if(d.removeTrinket){build.trinkets=build.trinkets.filter(t=>t.id!==d.removeTrinket);update();}
 if(d.pickTrinket&&!build.trinkets.some(t=>t.id===d.pickTrinket)){build.trinkets.push({id:d.pickTrinket,attuned:false});update();renderTrinketPicker();toast('Trinket added to this build.');}
});
document.addEventListener('change',e=>{const d=e.target.dataset;
  if(d.defenceSetting){if(!e.target.value||!e.target.checkValidity()){e.target.reportValidity();render();return;}build[d.defenceSetting]=Number(e.target.value);update();}
  if(d.statOverride){
   if(e.target.value===''){delete build.statOverrides?.[d.statOverride];if(!Object.keys(build.statOverrides||{}).length)delete build.statOverrides;update();return;}
   const field=STAT_OVERRIDE_PATHS[d.statOverride],value=Number(e.target.value);
   if(!field||!Number.isFinite(value)||!e.target.checkValidity()){e.target.reportValidity();render();return;}
   (build.statOverrides??={})[d.statOverride]=value;update();
  }
  if(d.slotItem){const item=selectSlotItem(build,catalog,d.slotItem,e.target.value);if(item)selectedGearId=item.id;update();}
  if(d.comboSkill!==undefined){const combo=build.combo??=emptyCombo(),def=catalog.combos.skills.find(s=>s.id===d.comboSkill),rank=Number(e.target.value);combo.skills[d.comboSkill]=rank;if(rank)for(const blocked of def.blockedBy||[])delete combo.skills[blocked];const activation=comboSummary(build,catalog).activation;if(!activation)combo.active=false;if(!catalog.combos.skills.some(s=>combo.skills[s.id]>0&&s.burst))combo.burstActive=false;update();}
  if(d.comboActive!==undefined){build.combo??=emptyCombo();build.combo.active=e.target.checked&&!!comboSummary(build,catalog).activation;update();}
  if(d.comboBurst!==undefined){build.combo??=emptyCombo();build.combo.burstActive=e.target.checked&&catalog.combos.skills.some(s=>build.combo.skills[s.id]>0&&s.burst);update();}
  if(d.progressionKind){
    if(!e.target.checkValidity()||e.target.type==='number'&&!e.target.value){e.target.reportValidity();render();return;}
    const p=build.progression??=emptyProgression();
    if(['mysticSpellPower','armorerAttackPower'].includes(d.progressionKind))p[d.progressionKind]=Number(e.target.value);
    else if(d.progressionKind==='accomplishmentAttributes'){p.accomplishmentAttributes??=emptyAccomplishmentAttributes();p.accomplishmentAttributes[d.progressionId]=Number(e.target.value);}
    else if(d.progressionKind==='townBuffs'){if(e.target.value)p.townBuffs[d.progressionId]=e.target.value;else delete p.townBuffs[d.progressionId];}
    else (p[d.progressionKind]??={})[d.progressionId]=Number(e.target.value);
    update();
  }
  if(d.conditionSide){build.conditions??={player:{},enemy:{}};const side=build.conditions[d.conditionSide];if(e.target.value)side[d.conditionId]=d.conditionSide==='player'&&playerConditions(build,catalog).find(f=>f.id===d.conditionId)?.kind==='stack'?Number(e.target.value):e.target.value;else delete side[d.conditionId];update();}
 if(d.attribute){if(!e.target.value||!e.target.checkValidity()){e.target.reportValidity();render();return;}build.attributes[d.attribute]=Number(e.target.value);update();}
 if(d.rank){editState(d.rank).rank=Number(e.target.value);update();}
 if(d.upgradePath){editState(d.upgradePath).upgrades[d.upgradeId]=Number(e.target.value);update();}
 if(d.equip){const item=build.gear.find(g=>g.id===d.equip);if(e.target.checked)equipGear(build,item,catalog);else item.equipped=false;update();}
 if(d.attune){build.trinkets.find(t=>t.id===d.attune).attuned=e.target.checked;update();}
 if(d.trinketCount){const count=Number(e.target.value),other=build.trinkets.filter(t=>t.id!==d.trinketCount).reduce((sum,t)=>sum+(t.count??1),0);if(!e.target.value||!e.target.checkValidity()||count+other>1000){toast('Choose a valid quantity (maximum 1,000 trinkets total).');render();return;}build.trinkets.find(t=>t.id===d.trinketCount).count=count;update();}
  if(d.affixSide&&e.target.checked){const base=catalog.equipment.find(b=>b.id===$('#gear-base').value);selectAffix(draft,d.affixSide,e.target.value,catalog,base);renderGearDefinition();}
  if(d.weaponVariant!==undefined){draft.sourceQuality=e.target.value==='epic'?8:4;renderGearDefinition();}
 if(d.affixRoll){draft.affixes.find(a=>a.id===d.affixRoll).roll=Number(e.target.value)/100;renderGearDefinition();}
});
$('.tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...document.querySelectorAll('[data-tab]')],i=tabs.indexOf(document.activeElement);if(i<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus();});
$('#build-select').addEventListener('change',e=>chooseBuild(e.target.value));
$('#edit-character-stats').addEventListener('change',renderCharacterStats);
$('#reset-stat-overrides').addEventListener('click',()=>{delete build.statOverrides;update();});
$('#build-name').addEventListener('change',e=>{build.name=e.target.value.trim()||'Untitled build';update();});
$('#level').addEventListener('change',e=>{if(!e.target.value||!e.target.checkValidity()){e.target.reportValidity();render();return;}build.level=Number(e.target.value);update();});
$('#class').addEventListener('change',e=>{build.classId=e.target.value;build.specializationId=build.classId;build.skills={};build.focusSkill=createBuild(catalog,build.classId).focusSkill;update();});
$('#specialization').addEventListener('change',e=>{build.specializationId=e.target.value;resetSkills();update();});
$('#focus-skill').addEventListener('change',e=>{build.focusSkill=e.target.value;update();});
$('#armored').addEventListener('change',e=>{build.armored=e.target.checked;update();});
$('#target-preset').addEventListener('change',e=>{build.targetId=e.target.value;update();});
function renderSurvivalSnapshot(){renderSurvival(build,catalog,detailView);}
for(const id of ['#incoming-damage','#starting-health','#incoming-penetration'])$(id).addEventListener('change',e=>{if(!e.target.value||!e.target.checkValidity()){e.target.reportValidity();e.target.value=e.target.defaultValue;}renderScheduler.request(renderSurvivalSnapshot);});
 $('#clear-conditions').addEventListener('click',()=>{delete build.conditions;if(build.progression)build.progression.townBuffs={};build.combo??=emptyCombo();build.combo.active=false;build.combo.burstActive=false;update();});
$('#compare-build').addEventListener('change',e=>{compareId=e.target.value;renderFocus();});
$('#copy-build').addEventListener('click',()=>{if(library.builds.length>=100)return toast('Maximum 100 saved builds.');const copy=structuredClone(build);copy.id=crypto.randomUUID();copy.name=`${build.name.slice(0,90)} · copy`;library.builds.push(copy);const previous=build.id;chooseBuild(copy.id);compareId=previous;renderFocus();toast('Independent build copy created.');});
$('#new-build').addEventListener('click',()=>{if(library.builds.length>=100)return toast('Maximum 100 saved builds.');$('#new-name').value='';$('#new-class').innerHTML=catalog.classes.map(c=>option(c.id,c.name,build.classId)).join('');$('#new-dialog').showModal();});
$('#new-form').addEventListener('submit',e=>{e.preventDefault();if(!$('#new-name').value.trim())return;const next=createBuild(catalog,$('#new-class').value);next.name=$('#new-name').value.trim();library.builds.push(next);chooseBuild(next.id);$('#new-dialog').close();});
$('#delete-build').addEventListener('click',()=>{$('#delete-description').textContent=`“${build.name}” will be removed from this browser. Export it first if you want a backup.`;$('#confirm-dialog').returnValue='';$('#confirm-dialog').showModal();});
$('#confirm-dialog').addEventListener('close',()=>{if($('#confirm-dialog').returnValue!=='delete')return;library.builds=library.builds.filter(b=>b.id!==build.id);if(!library.builds.length)library.builds.push(createBuild(catalog));chooseBuild(library.builds[0].id);});
$('#add-gear').addEventListener('click',()=>openGear());
 $('#gear-slot').addEventListener('change',renderBases);for(const selector of ['#gear-prefix-search','#gear-suffix-search'])$(selector).addEventListener('input',renderGearDefinition);$('#gear-name').addEventListener('input',renderGearDefinition);
$('#gear-base').addEventListener('change',()=>{draft=createGear(catalog,$('#gear-base').value);$('#gear-name').value=draft.name;$('#gear-roll').value=50;renderGearDefinition();});
$('#gear-roll').addEventListener('input',()=>{$('#gear-roll-label').textContent=`${$('#gear-roll').value}%`;});$('#gear-roll').addEventListener('change',renderGearDefinition);
for(const [id,field] of [['#gear-item-level','itemLevel'],['#gear-upgrade-level','upgradeLevel']])$(id).addEventListener('change',e=>{if(!e.target.value||!e.target.checkValidity()){e.target.reportValidity();renderGearDefinition();return;}draft[field]=Number(e.target.value);renderGearDefinition();});
 $('#gear-form').addEventListener('submit',e=>{e.preventDefault();const base=catalog.equipment.find(b=>b.id===$('#gear-base').value);if(!base||!$('#gear-name').value.trim())return;if(!affixSelectionValid(draft,catalog))return toast('Choose at most one prefix and one suffix before saving. Existing modifiers are kept until you save.');const old=build.gear.find(g=>g.id===editingId);const item={...draft,id:old?.id||draft.id,name:$('#gear-name').value.trim(),baseId:base.id,roll:Number($('#gear-roll').value)/100,equipped:old?.equipped??true};if(item.equipped)equipGear(build,item,catalog);if(old)build.gear[build.gear.indexOf(old)]=item;else build.gear.push(item);selectedGearId=item.id;$('#gear-dialog').close();update();});
$('#add-trinket').addEventListener('click',()=>{$('#trinket-search').value='';renderTrinketPicker();$('#trinket-dialog').showModal();});$('#trinket-search').addEventListener('input',renderTrinketPicker);
$('#import-open').addEventListener('click',()=>{$('#import-error').textContent='';$('#import-file').value='';$('#import-dialog').showModal();});
function importBuildText(text){
 if(!catalog||!library)throw Error('Wait for game definitions to load.');
 if(library.builds.length>=100)throw Error('Maximum 100 saved builds.');
 if(new Blob([text]).size>1024*1024)throw Error('Maximum build size is 1 MB.');
 let raw;try{raw=JSON.parse(text);}catch{throw Error('Not valid JSON. Use the character save picker above for .hps files.');}
 if(raw?.version===1)throw Error('Version 1 sandbox files contain custom abilities and fictional slots. They cannot be applied to the game-backed planner; keep the export as a backup.');
 if(raw?.version===2&&raw.gameBuildId!==catalog.buildId)throw Error('This build targets a different or unspecified game patch. Recreate it against the current catalog.');
 const imported=validatePlannerBuild(raw,catalog);imported.id=crypto.randomUUID();library.builds.push(imported);chooseBuild(imported.id);$('#import-dialog').close();toast('Build imported as a separate copy.');
}
$('#import-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('Maximum file size is 1 MB.');importBuildText(await file.text());}catch(error){$('#import-error').textContent=error.message;}finally{e.target.value='';}});
$('#clipboard-copy').addEventListener('click',async()=>{if(!build)return;try{await navigator.clipboard.writeText(JSON.stringify(build,null,2));toast('Build copied to clipboard.');}catch{toast('Clipboard access unavailable. Use Export build to save a file instead.');}});
$('#clipboard-read').addEventListener('click',async()=>{try{$('#clipboard-content').value=await navigator.clipboard.readText();$('#clipboard-error').textContent='';}catch{$('#clipboard-error').textContent='Clipboard access was denied or is unavailable. Paste the copied build into the field instead.';$('#clipboard-content').focus();}});
$('#clipboard-import').addEventListener('click',()=>{try{importBuildText($('#clipboard-content').value);$('#clipboard-error').textContent='';$('#clipboard-content').value='';}catch(error){$('#clipboard-error').textContent=error.message;}});
$('#export').addEventListener('click',()=>{if(!build)return;const blob=new Blob([JSON.stringify(build,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${build.name.replace(/[^a-z0-9_-]/gi,'-')||'build'}.hammerforge.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
try{
 const response=await fetch('./data/game-data.json');if(!response.ok)throw Error(`Game catalog HTTP ${response.status}`);catalog=await response.json();let restoration='';
  let restored=true;
  try{
   buildStorage=await openBuildStorage({validateLibrary,onStatus:text=>{$('#saved').textContent=text;}});
   library=await buildStorage.load();
  }catch{restored=false;restoration='Could not restore the saved library. A fresh build is shown; the stored data is untouched until you make a change.';$('#saved').textContent='Restore failed — export a backup before editing';}
  if(!library){const first=createBuild(catalog);library={builds:[first],activeId:first.id};}build=library.builds.find(b=>b.id===library.activeId);
  if(restored)persist();
 initializeCharacterImport({catalog,getBuilds:()=>library.builds,onImport:chosen=>{const copies=chosen.map(b=>({...validatePlannerBuild(b,catalog),id:crypto.randomUUID()}));if(!copies.length||library.builds.length+copies.length>100)throw Error('Maximum 100 saved builds.');library.builds.push(...copies);chooseBuild(copies[0].id);toast(`${copies.length} characters imported. Your existing builds are kept.`);}});
   $('#loading').textContent=restoration||`Game data ready · Steam build ${catalog.buildId}. Estimates are partial, not a full combat simulation.`;$('#data-version').textContent=`Build ${catalog.buildId}`;$('#planner').hidden=false;renderNow();
}catch(error){$('#loading').textContent=`Unable to load planner: ${error.message}. Serve the project using mise run dev.`;}
