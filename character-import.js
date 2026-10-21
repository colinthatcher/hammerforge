import {createBuild,createGear,availableSkills,compatibleAffixes,validatePlannerBuild} from './planner-model.js';
import {decodeCharacterProfile,gameHash,SAVE_LIMITS} from './save-codec.js';
import {emptyProgression} from './combat/progression.js';

const integer=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw Error(`Invalid saved ${label}`);return value;};
const hex=value=>`0x${(value>>>0).toString(16).padStart(8,'0')}`;
const basename=path=>String(path).replaceAll('\\','/').split('/').at(-1);
const dictionary=value=>value&&typeof value==='object'&&!Array.isArray(value);
function indexHashes(records){const map=new Map();for(const item of records){const key=gameHash(item.id);if(map.has(key))throw Error('Ambiguous catalog hash');map.set(key,item);}return map;}
const qualityNames={1:'Common',2:'Uncommon',4:'Rare',8:'Epic',16:'Legendary',128:'Cursed'};
const accomplishmentWarning='Town accomplishment attribute bonuses could not be fully reconstructed from native town statistics; enter the five totals shown in game under Upgrades.';
const accomplishmentImported='Town accomplishment attribute bonuses imported from saved town statistics.';

function importAccomplishments(town,catalog,warnings,p){
  const definitions=catalog.progression?.accomplishments;
  const stats=town?.['stats-town']?.stats;
  const keys=['str','dex','int','foc','vit'];
  const zero=()=>Object.fromEntries(keys.map(k=>[k,0]));
  if(!Array.isArray(definitions)||!Array.isArray(stats)){warnings.push(accomplishmentWarning);return;}
  const byId=new Map();
  let valid=true;
  if(stats.length%5!==0){warnings.push('Native town statistics have an unsupported shape; accomplishment bonuses were not imported.');valid=false;}
  for(let i=0;i+4<stats.length;i+=5){
    const [id,type,value,extraA,extraB]=stats.slice(i,i+5);
    if(typeof id!=='string'||![2,3].includes(type)||!(extraA&&typeof extraA==='object'&&!Array.isArray(extraA))||!(extraB&&typeof extraB==='object'&&!Array.isArray(extraB))||byId.has(id)){
      warnings.push('Native town statistics contain an invalid or unsupported accomplishment stat value; no accomplishment bonuses were imported.');valid=false;continue;
    }
    try{
      let n;
      if(typeof value==='number'){if(!Number.isSafeInteger(value))throw Error();n=BigInt(value);}
      else if(typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value))n=BigInt(value);
      else throw Error();
      if(n<0n||n>9223372036854775807n)throw Error();byId.set(id,n);
    }catch{warnings.push(`Native accomplishment stat “${id}” has an invalid value; no accomplishment bonuses were imported.`);valid=false;}
  }
  const totals=zero();
  for(const def of definitions){
    if(!def||typeof def.id!=='string'||!Array.isArray(def.rewards)){valid=false;continue;}
    const value=byId.get(def.id)??0n;
    for(const reward of def.rewards){
      let threshold;try{threshold=BigInt(reward.value);}catch{valid=false;continue;}
      if(value<threshold)break;
      for(const k of keys){const bonus=reward.attributes?.[k];if(!Number.isSafeInteger(bonus)||bonus<0){warnings.push(`Accomplishment “${def.id}” has an invalid ${k} reward; no accomplishment bonuses were imported.`);valid=false;continue;}totals[k]+=bonus;if(!Number.isSafeInteger(totals[k])||totals[k]>10000){valid=false;}}
    }
  }
  if(valid){p.accomplishmentAttributes=totals;warnings.push(accomplishmentImported);}else{p.accomplishmentAttributes=zero();warnings.push(accomplishmentWarning);}
}

function importDonationTitles(town,catalog,warnings,p){
  const titles=(catalog.progression?.heroTitles||[]).filter(d=>d.donationStat&&d.donationDivisor);
  if(!titles.length)return false;
  for(const def of titles)p.heroTitles[def.id]=0;
  const stats=town?.['stats-town']?.stats;
  if(!Array.isArray(stats)){warnings.push('Donation title levels could not be reconstructed from native town statistics; set them manually under Upgrades.');return false;}
  const found=new Map();let valid=true;
  if(stats.length%5){warnings.push('Native town statistics have an unsupported shape; donation titles were not imported.');valid=false;}
  for(let i=0;i+4<stats.length;i+=5){
    const [id,type,value,extraA,extraB]=stats.slice(i,i+5);
    if(typeof id!=='string'||![2,3].includes(type)||!dictionary(extraA)||!dictionary(extraB)||found.has(id)){warnings.push('Native town statistics contain an invalid or unsupported donation stat value; donation titles were not imported.');valid=false;continue;}
    try{const n=typeof value==='number'&&Number.isSafeInteger(value)?BigInt(value):typeof value==='string'&&/^(0|[1-9]\d*)$/.test(value)?BigInt(value):null;if(n===null||n<0n||n>9223372036854775807n)throw Error();found.set(id,n);}catch{warnings.push(`Native donation stat “${id}” has an invalid value; donation titles were not imported.`);valid=false;}
  }
  if(!valid){warnings.push('Donation title levels could not be reconstructed from native town statistics; set them manually under Upgrades.');return false;}
  // Compare squared half-level thresholds exactly, including wide save values.
  for(const def of titles){const raw=found.get(def.donationStat)??0n, divisor=BigInt(def.donationDivisor);let level=0;while(level<10000&&raw*4n>=divisor*BigInt((2*level+1)**2))level++;if(level===10000&&raw*4n>=divisor*20001n**2n)warnings.push(`${def.name}: donation title level capped to the planner maximum of 10,000.`);p.heroTitles[def.id]=level;}
  return true;
}

function importProgression(record,profile,catalog,warnings){
  const p=emptyProgression(),data=catalog.progression;
  if(!data)return undefined;
  const hash=(v,label)=>integer(v,-2147483648,4294967295,label)>>>0;
  function rows(key,width){
    const values=record[key]??[];
    if(!Array.isArray(values)||values.length>3000||values.length%width)throw Error(`Invalid saved ${key}`);
    return Array.from({length:values.length/width},(_,i)=>values.slice(i*width,(i+1)*width));
  }
  for(const [shop,upgrade,savedLevel] of rows('shop-upgrades',3)){
    const shopId=hash(shop,'shop ID'),upgradeId=hash(upgrade,'shop upgrade ID');
    const n=integer(savedLevel,-1,10000,'shop upgrade level');
    if(shopId===gameHash(data.mystic.shopId)&&upgradeId===gameHash(data.mystic.id)){
      p.mysticSpellPower=Math.min(n+1,data.mystic.steps.length);
      if(n>=data.mystic.steps.length)warnings.push('Mystic spell power tier capped to the current catalog maximum.');
    }
    if(data.armorer&&shopId===gameHash(data.armorer.shopId)&&upgradeId===gameHash(data.armorer.id)){
      p.armorerAttackPower=Math.min(n+1,data.armorer.steps.length);
      if(n>=data.armorer.steps.length)warnings.push('Armorer attack power tier capped to the current catalog maximum.');
    }
  }
  const masteries=indexHashes([...data.spellMasteries,...(data.weaponMasteries||[])]);
  for(const [id,n] of rows('weapon-masteries',3)){
    const def=masteries.get(hash(id,'mastery ID')),rank=integer(n,0,10000,'mastery level');
    if(def){const kind=data.spellMasteries.some(d=>d.id===def.id)?'spellMasteries':'weaponMasteries';p[kind][def.id]=rank;}
  }
  // TownRecord derives class titles from the highest level in the whole profile.
  for(const def of data.heroTitles.filter(d=>d.classId)){
    const cls=catalog.classes.find(c=>c.id===def.classId);
    const ids=new Set([cls.id,...cls.specializations.map(s=>s.id)]);
    p.heroTitles[def.id]=Math.max(0,...(profile.characters||[]).filter(c=>ids.has(c.record.class)).map(c=>integer(c.record.level,1,10000,'title character level')));
  }
  const buffs=indexHashes(data.townBuffs);
  for(const [instance,id] of rows('mission-buffs',2)){
    hash(instance,'mission buff instance');const buffId=hash(id,'mission buff ID'),def=buffs.get(buffId);
    if(def){
      if(p.townBuffs[def.set]&&p.townBuffs[def.set]!==def.id)warnings.push(`Multiple saved ${def.set} buffs: the last entry is selected; review active town buffs.`);
      p.townBuffs[def.set]=def.id;
    }else warnings.push(`Saved mission buff ${hex(buffId)} is outside the supported Tavern/Chapel catalog.`);
  }
  warnings.push(`Supported Mystic spell power and Armorer attack power, weapon/spell masteries, profile-derived Wizard/Ranger titles and saved Tavern/Chapel buffs imported.${importDonationTitles(profile.town,catalog,warnings,p)?' Donation titles reconstructed from saved town statistics.':''}`);
  importAccomplishments(profile.town,catalog,warnings,p);
  return p;
}

export function mapSavedCharacter(character,profile,catalog,fileName){
  const record=character.record;
  const base=catalog.classes.find(c=>c.id===record.class||c.specializations.some(s=>s.id===record.class));
  if(!base)throw Error(`Class “${record.class}” is not in the current game catalog`);
  const build=createBuild(catalog,base.id),warnings=[],unmappedEquipment=[];
  build.name=String(record.name).trim().slice(0,100)||`Imported ${base.name}`;
  build.specializationId=record.class;
  build.level=integer(record.level,1,10000,'character level');
  build.progression=importProgression(record,profile,catalog,warnings);
  build.shadowCurses=integer(record['shadow-curses']??0,0,100000,'shadow curse count');
  for(const attr of Object.keys(build.attributes)){
    const allocated=integer(record[`picked-${attr}`]??0,0,10000,`${attr} allocation`),elixir=integer(record[`elixir-${attr}`]??0,0,10000,`${attr} elixir bonus`);
    build.attributes[attr]=integer(allocated+elixir,0,10000,`${attr} total allocation`);
  }
  if(Object.keys(build.attributes).some(attr=>(record[`elixir-${attr}`]||0)>0))warnings.push('Allocated attribute values include saved elixir bonuses.');
  const permanent=record['picked-skills']??{},temporary=record['picked-temp-skills']??{};
  if(!dictionary(permanent)||!dictionary(temporary))throw Error('Invalid saved skill dictionaries');
  const recognized=new Set(['dash_skill']);
  function rankFor(def,max){
    recognized.add(def.id);
    const rank=integer(permanent[def.id]??0,0,10000,'skill rank')+integer(temporary[def.id]??0,0,10000,'temporary skill rank')+Number(def.startingLevel??0);
    if(def.levelBonusStat)warnings.push(`${def.name}: stat-based rank bonuses are not included.`);
    if(rank>max)warnings.push(`${def.name}: rank ${rank} capped to the catalog maximum ${max}.`);
    return Math.min(rank,max);
  }
  for(const skill of availableSkills(build,catalog)){
    const upgrades=Object.fromEntries(skill.upgrades.map(u=>[u.id,rankFor(u,u.tiers)]));
    build.skills[skill.source]={rank:rankFor(skill,skill.rankCount),upgrades};
  }
  const unknownSkills=[...new Set([...Object.keys(permanent),...Object.keys(temporary)])].filter(id=>!recognized.has(id));
  if(unknownSkills.length)warnings.push(`${unknownSkills.length} saved skill IDs are not available to this catalog class/specialization.`);
  const learned=availableSkills(build,catalog).filter(s=>s.type==='spell'&&build.skills[s.source].rank>0);
  if(learned.length)build.focusSkill=learned[0].source;
  const savedCombos=record['picked-combo-skills']??{};
  if(!dictionary(savedCombos))throw Error('Invalid saved combo skill dictionary');
  const comboDefs=catalog.combos?.skills||[], comboById=new Map(comboDefs.map(s=>[s.id,s]));
  const comboRanks={};
  for(const [id,value] of Object.entries(savedCombos)){
    const rank=integer(value,0,10000,'combo skill rank');
    const def=comboById.get(id);
    if(!def){if(rank>0)warnings.push(`Saved combo skill ID “${id}” is not available in the current catalog.`);continue;}
    if(rank>def.rankCount)warnings.push(`${def.name}: combo rank ${rank} capped to the catalog maximum ${def.rankCount}.`);
    if(rank>0)comboRanks[id]=Math.min(rank,def.rankCount);
  }
  // PlayerRecord::Load migrates an old library activation skill into combos.
  if(record['library-skill']!==undefined){
    const libraryId=integer(record['library-skill'],-2147483648,4294967295,'library skill ID')>>>0;
    const activation=comboDefs.find(s=>['combo_kills','combo_dash','combo_parry'].includes(s.id)&&gameHash(s.id)===libraryId);
    if(activation)comboRanks[activation.id]=1;
  }
  const selected=comboDefs.filter(s=>comboRanks[s.id]>0);
  const conflicts=selected.filter(s=>(s.blockedBy||[]).some(id=>comboRanks[id]>0));
  if(conflicts.length)throw Error(`Saved combo skills contain mutually exclusive choices: ${conflicts.map(s=>s.name).join(', ')}.`);
  if(Object.keys(comboRanks).length)build.combo={skills:comboRanks,active:false,burstActive:false};
  const bases=indexHashes(catalog.equipment),affixes=indexHashes(catalog.affixes),trinkets=indexHashes(catalog.trinkets);
  let unresolvedEquipped=0;
  const occupied=new Set();
  function mapItem(data,equipped,index){
    if(data===null)return;
    if(!Array.isArray(data)||data.length<7||data.length>107)throw Error('Invalid saved equipment record');
    const quality=integer(data[0],0,255,'equipment quality'),baseHash=integer(data[1],-2147483648,4294967295,'equipment hash')>>>0;
    const base=bases.get(baseHash);
    if(!base){unmappedEquipment.push({equipped,index,record:data});if(equipped)unresolvedEquipped++;warnings.push(`Unresolved ${equipped?'equipped':'inventory'} item ${hex(baseHash)} retained in import details.`);return;}
    const item=createGear(catalog,base.id);item.equipped=equipped;
    item.itemLevel=integer(data[3],1,10000,'item level');item.upgradeLevel=integer(data[4],0,10000,'upgrade level');
    item.sourceQuality=quality;item.savedIntensity=data[2];item.sourceColors=data.slice(5,7);item.unresolvedModifiers=[];
    const compatible=new Set(compatibleAffixes(base,catalog).map(a=>a.id));
    for(const raw of data.slice(7)){
      const hash=integer(raw,-2147483648,4294967295,'modifier hash')>>>0,affix=affixes.get(hash);
      if(!affix||!compatible.has(affix.id)||item.affixes.some(a=>a.id===affix.id))item.unresolvedModifiers.push(hex(hash));
      else item.affixes.push({id:affix.id,roll:.5});
    }
    if(item.unresolvedModifiers.length)warnings.push(`${base.name}: ${item.unresolvedModifiers.length} saved modifiers are unresolved or incompatible; their hashes are preserved.`);
    item.name=`${qualityNames[quality]||'Imported'} ${base.name}`.slice(0,100);
    if(equipped){
      const slots=base.slot==='twohanded'?['mainhand','offhand']:[base.slot];
      if(slots.some(s=>occupied.has(s))){item.equipped=false;warnings.push(`${base.name}: conflicting saved hand/slot occupancy; imported unequipped.`);}else slots.forEach(s=>occupied.add(s));
    }
    if(build.gear.length>=100){unmappedEquipment.push({equipped,index,record:data});if(equipped)unresolvedEquipped++;warnings.push('Inventory exceeds the planner’s 100-item limit; extra records retained in import details.');return;}
    build.gear.push(item);
  }
  const equipped=record.equipped??[],inventory=record.equipment??[];
  if(!Array.isArray(equipped)||equipped.length>8||!Array.isArray(inventory)||inventory.length>1000)throw Error('Invalid saved equipment inventory');
  equipped.forEach((item,index)=>mapItem(item,true,index));inventory.forEach((item,index)=>mapItem(item,false,index));
  const attuned=record['attuned-trinkets']??[],owned=record.trinkets??[];
  if(!Array.isArray(attuned)||!Array.isArray(owned)||owned.length>1000)throw Error('Invalid saved trinkets');
  const attunedIds=new Set(attuned.map(h=>integer(h,-2147483648,4294967295,'attunement hash')>>>0)),unknownTrinkets=[];
  for(const id of owned){
    const trinket=catalog.trinkets.find(t=>t.id===id);
    if(!trinket){unknownTrinkets.push(id);continue;}
    const existing=build.trinkets.find(t=>t.id===id);
    if(existing)existing.count++;else build.trinkets.push({id,count:1,attuned:trinket.canAttune&&attunedIds.has(gameHash(id))});
  }
  const unknownAttunements=attuned.filter(h=>!trinkets.has(h>>>0));
  if(unknownTrinkets.length)warnings.push(`${unknownTrinkets.length} owned trinkets could not be mapped; IDs retained in import details.`);
  if(unknownAttunements.length)warnings.push(`${unknownAttunements.length} attunement IDs are absent from the current catalog.`);
  warnings.push('Other town upgrades, library rank bonuses, automatic buff uptime, sets and run effects are not simulated.');
  warnings.push('H2SV v4 decoding is experimental. The file checksum and original game patch are not verified; IDs are mapped against the displayed catalog build.');
  const canonicalFile=basename(fileName).replace(/^(\d+)_\d+\.hps$/i,'$1.hps');
  const sourceId=`hps4:${canonicalFile}:${profile.name}:${character.id}`;
  build.importInfo={sourceId,fileName:basename(fileName),profile:profile.name,savedAt:profile.savedAt,characterId:character.id,saveVersion:4,catalogBuildId:catalog.buildId,warnings:[...new Set(warnings)],unresolvedEquipped,unmappedEquipment,unknownSkills,unknownTrinkets,unknownAttunements};
  return validatePlannerBuild(build,catalog);
}

export function importCharacterProfile(bytes,catalog,fileName='profile.hps'){
  const profile=decodeCharacterProfile(bytes);
  return profile.characters.map(character=>{
    try{const build=mapSavedCharacter(character,profile,catalog,fileName);return {key:build.importInfo.sourceId,name:build.name,className:catalog.classes.find(c=>c.id===build.classId).name,level:build.level,profile:profile.name,fileName:basename(fileName),savedAt:profile.savedAt,warnings:build.importInfo.warnings,build};}
    catch(error){return {key:`${fileName}:${character.id}`,name:character.record.name,className:character.record.class,level:character.record.level,profile:profile.name,fileName:basename(fileName),savedAt:profile.savedAt,error:error.message,warnings:[]};}
  });
}

export async function readCharacterFiles(files,catalog){
  if(files.length>1000)throw Error('Select the game’s saves folder rather than your entire Steam installation (maximum 1,000 files).');
  const hps=files.filter(f=>/\.hps$/i.test(f.name));
  const directory=file=>{const path=(file.webkitRelativePath||file.name).replaceAll('\\','/');return path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';};
  const primary=new Set(hps.filter(f=>/^\d+\.hps$/i.test(f.name)).map(f=>directory(f)+'/'+f.name));
  const skipped=[],errors=[],rows=[];
  let total=0;
  for(const file of hps){
    const backup=file.name.match(/^(\d+)_\d+\.hps$/i);
    const dir=directory(file);
    if(backup&&primary.has(dir+'/'+backup[1]+'.hps')){skipped.push(file.name);continue;}
    if(file.size>SAVE_LIMITS.file){errors.push(`${file.name}: exceeds 16 MB`);continue;}
    total+=file.size;if(total>64*1024*1024)throw Error('Selected profiles exceed the 64 MB import limit.');
    try{rows.push(...importCharacterProfile(await file.arrayBuffer(),catalog,file.name));}catch(error){errors.push(`${file.name}: ${error.message}`);}
  }
  const newest=new Map();for(const row of rows){const old=newest.get(row.key);if(!old||row.savedAt>old.savedAt)newest.set(row.key,row);}
  return {characters:[...newest.values()],errors,skipped,files:hps.length};
}
