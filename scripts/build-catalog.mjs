import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {parseSval,parseLanguage,child,value,normalizeSval,mergeSval} from './sval.mjs';
import {buildStatusCatalog} from './status-catalog.mjs';
import {buildProgressionCatalog} from './progression-catalog.mjs';
import {buildWeaponCatalog} from './weapon-catalog.mjs';
import {buildTargetCatalog} from './target-catalog.mjs';
import {numericConstant} from './defence-catalog.mjs';
const game=process.env.HOH2_GAME_DIR||join(homedir(),'.local/share/Steam/steamapps/common/Heroes of Hammerwatch 2');
const hash=body=>createHash('sha256').update(body).digest('hex');
const sources={};
const strings=new Map();
for(const file of (await readdir(join(game,'res/language/english'))).filter(f=>f.endsWith('.lang')).sort()){
 const body=await readFile(join(game,'res/language/english',file));sources[`res/language/english/${file}`]=hash(body);
 for(const [key,text] of parseLanguage(body.toString()))strings.set(key,text);
}
function localize(key){
 if(!key)return '';if(!key.startsWith('.'))return key;
 const [id,query]=key.slice(1).split('?');let text=strings.get(id);
 if(text===undefined)throw new Error(`Missing localization: ${key}`);
 for(const [param,val] of new URLSearchParams(query))text=text.replaceAll(`%${param}%`,val);
 return text;
}
async function source(path){const body=await readFile(join('.game-data',path));sources[path]=hash(body);return body.toString();}
function params(node){
 return (child(node,'description-params')?.children||[]).filter(n=>n.tag==='array').map(row=>{
  const cells=row.children.filter(n=>['s','string'].includes(n.tag)).map(n=>n.text.trim());
  const label=cells.findIndex(s=>s.startsWith('.skills.desc.params.'));
  return {key:row.name||cells[0],label:label<0?(row.name||cells[0]):localize(cells[label]),values:cells.slice(label<0?1:label+1).map(localize)};
 });
}
function record(node){return {id:value(node,'id'),name:localize(value(node,'name')),nameKey:value(node,'name'),description:localize(value(node,'description')),parameters:params(node)};}
function ranks(node){
 const base=normalizeSval(child(node,'skill'))||{},result=[base];
 for(const upgrade of child(node,'upgrades')?.children||[])result.push(mergeSval(base,normalizeSval(upgrade)));
 return result;
}
function rankOverrides(node){return [normalizeSval(child(node,'skill'))||{},...(child(node,'upgrades')?.children||[]).map(normalizeSval)];}
function unique(records,label){const ids=new Set();for(const record of records){if(!record.id||ids.has(record.id))throw new Error(`Missing/duplicate ${label} ID: ${record.id}`);ids.add(record.id);}}
function caveats(text){return {requiresPreprocessing:/^\s*%(?:if|block|define|include)/m.test(text),preprocessorDirectives:text.replace(/<!--[\s\S]*?-->/g,'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('%')&&!s.startsWith('%//'))};}
const classes=[],skills={};
for(const id of ['warrior','paladin','ranger','wizard','rogue','warlock','sorcerer','priest']){
 const path=`players/${id}/class_${id}.sval`;const text=await source(path);
 const nodes=parseSval(text).children.find(n=>n.tag==='array')?.children;
 if(!nodes)throw new Error(`Missing class array: ${path}`);
 const profiles=nodes.filter(n=>n.tag==='dict').map(n=>({id:value(n,'id'),parent:value(n,'parent'),name:localize(value(n,'name')),skills:(child(n,'skills')?.children||[]).map(n=>n.text.trim()),source:path}));
 const base=profiles.find(p=>p.id===id);const specializations=profiles.filter(p=>p.parent===id);
 if(!base||specializations.length!==3)throw new Error(`Unexpected class structure: ${id}`);
  const sharedText=text.replace(/<!--[\s\S]*?-->/g,'').match(/%defblock\s+SharedStats\s*\r?\n([\s\S]*?)%endblock/)?.[1];
  if(!sharedText)throw new Error(`Missing SharedStats: ${path}`);
  const shared=parseSval(sharedText),attrs=['str','dex','int','foc','vit'];
  const stats=(key,defaultValue)=>Object.fromEntries(attrs.map(a=>{const n=child(shared,key(a));if(!n&&defaultValue===undefined)throw new Error(`Missing ${key(a)}: ${path}`);return [a,n?normalizeSval(n):defaultValue];}));
    const baseStats={};for(const [name,field] of Object.entries({health:'base-health',healthPerLevel:'level-health',mana:'base-mana',manaPerLevel:'level-mana',armor:'base-armor',armorPerLevel:'level-armor',healthRegen:'base-health-regen',healthRegenPerLevel:'level-health-regen',manaRegen:'base-mana-regen',manaRegenPerLevel:'level-mana-regen',fireResistance:'base-fire-res',fireResistancePerLevel:'level-fire-res',iceResistance:'base-ice-res',iceResistancePerLevel:'level-ice-res',lightningResistance:'base-lightning-res',lightningResistancePerLevel:'level-lightning-res',poisonResistance:'base-poison-res',poisonResistancePerLevel:'level-poison-res'}))baseStats[name]=Number(value(shared,field)||0);
   classes.push({...base,specializations,attributes:stats(a=>`base-${a}`),powerScaling:stats(a=>`${a}-spellpwr`,0),attributeGrowth:stats(a=>`level-${a}`),baseStats,...(id==='priest'?{requiresDlc:'holy'}:{})});
 for(const path of new Set(profiles.flatMap(p=>p.skills))){
  if(skills[path])continue;
  const text=await source(path);const node=parseSval(text).children.find(n=>n.tag==='dict');
  if(!node)throw new Error(`Missing skill dict: ${path}`);
  const definition=child(node,'skill');
    skills[path]={...record(node),source:path,status:'extracted-definition',type:value(node,'type'),tags:child(node,'tags')?.children.map(n=>n.text.trim())||[],parameters:params(node),baseTiming:{cooldownMs:value(definition,'cooldown'),animationMs:value(definition,'anim-length'),castpointMs:value(definition,'castpoint')},...caveats(text),rankCount:1+(child(node,'upgrades')?.children.length||0),ranks:ranks(node),rankOverrides:rankOverrides(node),startingLevel:Number(value(node,'starting-level')||0),levelBonusStat:value(node,'level-bonus-stat'),upgrades:(child(node,'modifier-skills')?.children||[]).filter(n=>n.tag==='dict').map(n=>({...record(n),quality:value(n,'quality'),tiers:1+(child(n,'upgrades')?.children.length||0),startingLevel:Number(value(n,'starting-level')||0),levelBonusStat:value(n,'level-bonus-stat'),tags:child(n,'tags')?.children.map(v=>v.text.trim())||[],blockedBy:child(n,'blocked-by-skills')?.children.map(v=>v.text.trim())||[],ranks:ranks(n),rankOverrides:rankOverrides(n)}))};
 }
}
unique(classes.flatMap(c=>[c,...c.specializations]),'class');
unique(Object.values(skills),'skill');
unique(Object.values(skills).flatMap(s=>s.upgrades),'skill upgrade');
const expectedNames=['Warrior','Paladin','Ranger','Wizard','Rogue','Warlock','Sorcerer','Priest'];
if(classes.some((c,i)=>c.name!==expectedNames[i]))throw new Error('Unexpected class names');
function modifiers(node,prefix=''){
 return node.children.flatMap(n=>n.name===`${prefix}modifier`?[normalizeSval(n)]:n.name===`${prefix}modifiers`?n.children.map(normalizeSval):[]);
}
function tags(node){return child(node,'tags')?.children.map(n=>n.text.trim())||[];}
async function definitions(dir,pattern,loader){
 const result=[];
 for(const file of (await readdir(join('.game-data',dir))).filter(f=>pattern.test(f)).sort()){
  const path=`${dir}/${file}`,text=await source(path),root=parseSval(text);
  if(root.children.find(n=>n.tag==='loader')?.text.trim()!==loader)continue;
  for(const node of root.children.filter(n=>n.tag==='array').flatMap(n=>n.children).filter(n=>n.tag==='dict'))result.push({node,path,text});
 }
 return result;
}
const equipmentItems=[];
for(const {node,path,text} of await definitions('tweak/items/equipment',/^equipment_.*\.sval$/,'Equipment::BaseItem::LoadMultiple')){
 // Equipment::ParseSlot maps the source spelling "twohand" to Slot::TwoHanded.
 const rawSlot=value(node,'slot'),slot=rawSlot==='twohand'?'twohanded':rawSlot;
 if(!['mainhand','offhand','twohanded','head','chest','feet','hands','back'].includes(slot))throw new Error(`Unknown slot: ${slot} (${path})`);
  equipmentItems.push({id:value(node,'id'),name:localize(value(node,'name')),slot,quality:value(node,'quality'),attacks:Object.fromEntries(['skill','skill-epic','skill-secondary','skill-secondary-epic'].map(k=>[k,value(node,k)]).filter(([,v])=>v)),levelMin:normalizeSval(child(node,'ilvl')),levelMax:normalizeSval(child(node,'ilvl-max')),requirements:Object.fromEntries(node.children.filter(n=>n.name?.startsWith('req-')).map(n=>[n.name,n.text.trim()])),tags:tags(node),modifiers:modifiers(node),source:path,...caveats(text)});
}
const affixes=[];
 for(const {node,path,text} of await definitions('tweak/items',/^modifiers_equipment.*\.sval$/,'Equipment::ItemModifier::LoadMultiple')){
  const prefix=localize(value(node,'prefix')),suffix=localize(value(node,'suffix'));
  affixes.push({id:value(node,'id'),name:[value(node,'prefix'),value(node,'suffix')].filter(Boolean).map(localize).join(' ')||value(node,'id'),prefix,suffix,quality:value(node,'quality'),tags:tags(node),modifiers:modifiers(node),source:path,...caveats(text)});
 }
const trinkets=[];
for(const {node,path,text} of await definitions('tweak/trinkets',/\.sval$/,'Item::Trinket::LoadMultiple')){
 const base=modifiers(node),attuned=modifiers(node,'attune-'),description=localize(value(node,'desc')),attunedDescription=localize(value(node,'attune-desc'));
 // The attunement shop tests the presence of m_desc2 (attune-desc).
 trinkets.push({id:value(node,'id'),name:localize(value(node,'name')),quality:value(node,'quality'),description,attunedDescription:attunedDescription||description,modifiers:base,attunedModifiers:attuned.length?attuned:base,canAttune:Boolean(attunedDescription),source:path,...caveats(text)});
}
await source('scripts/Town/TrinketAttunement.as');
unique(equipmentItems,'equipment');unique(affixes,'affix');unique(trinkets,'trinket');
const tuning=await source('scripts/Data/Player.as');
const powerDivisor=Number(tuning.match(/const float DamagePowerDivisor\s*=\s*([\d.]+)f/)?.[1]);
if(!Number.isFinite(powerDivisor)||powerDivisor<=0)throw new Error('Power divisor definition changed; review required');
const equipment=await source('scripts/Items/Equipment.as');
const slotBlock=equipment.match(/enum Slot\s*\{([^}]+)\}/)?.[1];
if(!slotBlock)throw new Error('Equipment slot definition changed');
const equipmentSlots=[...slotBlock.matchAll(/(\w+)\s*=\s*(\d+)/g)].filter(m=>m[1]!=='None').map(m=>({id:m[1],mask:Number(m[2])}));
for(const path of ['scripts/Behaviors/Actors/Player/PlayerBase.as','scripts/Behaviors/Actors/Player/PlayerStats.as','scripts/Behaviors/Actors/Player/PlayerRecord.as','scripts/Behaviors/Actors/Player/PlayerClass.as','scripts/EquippedItems.as','scripts/Items/Item.as','scripts/GUI/Widgets/TrinketInventoryWidget.as','scripts/GUI/Widgets/EquipmentInventoryWidget.as','scripts/Behaviors/Actors/Modifiers/SkillModifier.as','players/wizard/projectiles/fireball.unit','scripts/Behaviors/Armor.as','scripts/Items/Trinkets.as',...['Modifiers','StatModifier','Damage'].map(n=>`scripts/Behaviors/Actors/Modifiers/${n}.as`),...['PlayerSkill','PlayerSkillDirectional','PlayerSkillPosition'].map(n=>`scripts/Behaviors/Actors/Skills/${n}.as`)])await source(path);
const misc=await source('scripts/Data/Misc.as');
const facts={powerDivisor,equipmentSlots,armorEfficiency:numericConstant(misc,'ArmorApplyEfficiency'),armorNegativeMultiplier:numericConstant(misc,'ArmorNegativeMul'),baseSpellCritDamage:numericConstant(misc,'BaseSpellCritDamage'),baseWeaponCritDamage:numericConstant(misc,'BaseWeaponCritDamage'),fireImmediateDamageScale:numericConstant(misc,'FireImmediateDmgScale'),poisonImmediateDamageScale:numericConstant(misc,'PoisonImmmediateDmgScale'),healthRegenPerVitality:numericConstant(tuning,'HealthRegenPerVit'),manaRegenPerFocus:numericConstant(tuning,'ManaRegenPerFoc'),healthRegenDelayMs:numericConstant(tuning,'HealthRegenDelay'),ngpArmorPenalty:numericConstant(tuning,'NGPArmorPenalty'),ngpResistancePenalty:numericConstant(tuning,'NGPResistancePenalty'),shadowCurseArmorPenalty:numericConstant(tuning,'SCurseArmorPenalty'),shadowCurseArmorNGPPenalty:numericConstant(tuning,'SCurseArmorNGPPenalty'),simulationValidated:false};
// Record source evidence for the explicitly coded contact models and modifier
// paths. Hashing is provenance, not a claim that every behavior is simulated.
async function recordTree(dir){for(const entry of await readdir(join('.game-data',dir),{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())await recordTree(path);else if(/\.(sval|inc|unit|as)$/.test(entry.name))await source(path);}}
await recordTree('players');await recordTree('scripts/Behaviors');
await source('tweak/buffs/stacks_actors.sval');await source('tweak/buffs/status_effects.sval');
await source('scripts/Utils/Conditional.as');
const statuses=await buildStatusCatalog({source,localize});
const progression=await buildProgressionCatalog({source,localize});
const weapons=await buildWeaponCatalog({source,localize,equipment:equipmentItems});
const targets=await buildTargetCatalog({source});
const defenceMechanicSources=['scripts/Behaviors/Actors/Modifiers/Modifiers.as','scripts/Behaviors/Actors/Player/Player.as','scripts/Behaviors/Actors/Player/PlayerStats.as','scripts/Behaviors/Actors/Modifiers/StatModifier.as','scripts/Behaviors/Actors/ActorBuffList.as','scripts/GUI/PlayerMenu/Modifications.as','scripts/Data/Player.as','scripts/Data/Misc.as','scripts/Behaviors/Actors/Player/PlayerClass.as'];
for(const path of defenceMechanicSources)await source(path);
const defences={mechanicSources:defenceMechanicSources,status:'source-reviewed; runtime simulation not validated'};
const comboSkills=[];
for(const path of ['players/shared/skills/combo_choices.sval','players/shared/skills/combo_levlable.sval']){
 const root=parseSval(await source(path));
 for(const node of root.children.find(n=>n.tag==='array').children.filter(n=>n.tag==='dict'))comboSkills.push({...record(node),source:path,type:'combo',tags:tags(node),rankCount:ranks(node).length,ranks:ranks(node),blockedBy:child(node,'blocked-by-skills')?.children.map(n=>n.text.trim())||[]});
}
unique(comboSkills,'combo skill');
for(const s of comboSkills){const buff=s.ranks[0].modifier?.effect?.buff;if(buff)s.burst=buff.split(':').at(-1);}
const comboBuffSource='tweak/buffs/buffs_combo.sval',comboProjectileSource='players/shared/projectiles/combo_nova.unit';
const comboBuffRoot=parseSval(await source(comboBuffSource));
const combos={skills:comboSkills,buffSource:comboBuffSource,buffs:normalizeSval({...comboBuffRoot.children.find(n=>n.tag==='svals'),tag:'dict'}),projectileSource:comboProjectileSource,projectile:normalizeSval({...parseSval(await source(comboProjectileSource)).children.find(n=>n.tag==='unit').children.find(n=>n.tag==='behavior'),tag:'dict'}),mechanicSources:['scripts/Behaviors/Actors/Skills/ComboSkill.as','scripts/Behaviors/Actors/Player/PlayerBase.as','scripts/Behaviors/Actors/Player/Player.as','scripts/Behaviors/Actors/Player/PlayerStats.as','scripts/Behaviors/Actors/Modifiers/SpecialStatModifiers.as','scripts/Behaviors/Effects/Damage.as']};
for(const path of combos.mechanicSources)await source(path);
const provenance=JSON.parse(await readFile('.game-data/provenance.json','utf8'));
provenance.nativeSaveHashEvidence={file:'HWR2.exe',sha256:hash(await readFile(join(game,'HWR2.exe'))),algorithm:'MurmurHash3-x86-32',seed:'0xf808409c'};
const manifest=await readFile(join(dirname(dirname(game)),'appmanifest_619820.acf'),'utf8');
const buildId=manifest.match(/"buildid"\s+"(\d+)"/)?.[1];if(!buildId)throw new Error('Steam build ID missing');
const catalog={schemaVersion:1,game:'Heroes of Hammerwatch II',steamAppId:619820,buildId,provenance,status:'Definitions extracted; combat simulation not yet validated',facts,classes,skills,equipment:equipmentItems,affixes,trinkets,statuses,progression,weapons,targets,combos,defences,sources};
await mkdir('data',{recursive:true});await writeFile('data/game-data.json',JSON.stringify(catalog,null,2)+'\n');
console.log(`Catalog: ${classes.length} classes, ${classes.flatMap(c=>c.specializations).length} specializations, ${Object.keys(skills).length} referenced skills, ${Object.values(skills).flatMap(s=>s.upgrades).length} upgrades, ${equipmentItems.length} equipment, ${affixes.length} affixes, ${trinkets.length} trinkets. Steam build ${buildId}.`);
