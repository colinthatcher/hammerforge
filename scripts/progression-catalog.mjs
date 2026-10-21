import {parseSval,normalizeSval,child,value} from './sval.mjs';
import {expandLiteralBlocks} from './status-catalog.mjs';

// Literal definitions plus reviewed scaling in PlayerRecord::RefreshModifiers.
export async function buildProgressionCatalog({source,localize}){
  async function load(path,loader){
    const root=parseSval(expandLiteralBlocks(await source(path)));
    if(root.children.find(n=>n.tag==='loader')?.text.trim()!==loader)throw Error(`Unexpected progression loader: ${path}`);
    return root.children.find(n=>n.tag==='array')?.children.filter(n=>n.tag==='dict')||root.children.filter(n=>n.tag==='dict');
  }
  const modifiers=node=>node.children.flatMap(n=>n.name==='modifier'?[normalizeSval(n)]:n.name==='modifiers'?n.children.map(normalizeSval):[]);
  const record=(node,path)=>({id:value(node,'id'),name:localize(value(node,'name')),description:localize(value(node,'description')),modifiers:modifiers(node),source:path});
  const mysticPath='tweak/town/shops/mystic.sval';
  const shop=(await load(mysticPath,'UpgradeShop::LoadSingle'))[0];
  const power=child(shop,'upgrades').children.find(n=>value(n,'id')==='spell-power');
  const mystic={id:'spell-power',shopId:'mystic',name:'Mystic spell power',source:mysticPath,steps:child(power,'steps').children.map(n=>({name:localize(value(n,'name')),modifiers:modifiers(n)}))};
  const armorerPath='tweak/town/shops/armorer.sval';
  const armorerShop=(await load(armorerPath,'UpgradeShop::LoadSingle'))[0];
  const armorerPower=child(armorerShop,'upgrades').children.find(n=>value(n,'id')==='attack-power');
  if(!armorerPower)throw Error('Armorer attack-power upgrade is absent from the catalog source');
  const armorer={id:'attack-power',shopId:'armorer',name:'Armorer attack power',source:armorerPath,steps:child(armorerPower,'steps').children.map(n=>({name:localize(value(n,'name')),modifiers:modifiers(n)}))};
  const masteryPath='tweak/town/spell_masteries.sval';
  const spellMasteries=(await load(masteryPath,'WeaponMastery::LoadMultiple')).map(n=>record(n,masteryPath));
  const weaponMasteryPath='tweak/town/weapon_masteries.sval';
  const weaponMasteries=(await load(weaponMasteryPath,'WeaponMastery::LoadMultiple')).map(n=>record(n,weaponMasteryPath));
  const titlePath='tweak/town/hero_titles.sval';
  const townRecordPath='scripts/Town/TownRecord.as';
  const townRecord=await source(townRecordPath);
  if(!/GetStatCurr\s*\(\s*HashString\s*\(\s*"chapel-revive-"\s*\+\s*mat\s*\)\s*\)/.test(townRecord)||!/int\s*\(\s*pow\s*\(\s*value\s*\/\s*divisor\s*,\s*0\.5f\s*\)\s*\+\s*0\.5f\s*\)/.test(townRecord))throw Error('TownRecord donation title formula changed; review progression catalog');
  const donationScaling={gold:3000,wood:10};
  for(const [material,divisor] of Object.entries(donationScaling)){
    const pattern=new RegExp(`AddDonationTitle\\s*\\(\\s*HeroTitle::Get\\(\\s*["']title_mat_${material}["']\\s*\\)\\s*,\\s*["']${material}["']\\s*,\\s*${divisor}(?:\\.0+)?\\s*\\)`);
    if(!pattern.test(townRecord))throw Error(`TownRecord donation title scaling changed for ${material}; review progression catalog`);
  }
  const heroTitles=(await load(titlePath,'HeroTitle::LoadMultiple')).filter(n=>['title_wizard','title_ranger','title_mat_wood','title_mat_gold'].includes(value(n,'id'))).map(n=>({...record(n,titlePath),...(['title_wizard','title_ranger'].includes(value(n,'id'))?{classId:value(n,'id').slice(6)}:{donationMaterial:value(n,'id').slice(10),donationStat:`chapel-revive-${value(n,'id').slice(10)}`,donationDivisor:donationScaling[value(n,'id').slice(10)]})}));
  const townBuffs=[];
  for(const name of ['tavern','chapel']){
    const path=`tweak/town/buffs_${name}.sval`;
    townBuffs.push(...(await load(path,'MissionBuff::LoadMultiple')).map(n=>({...record(n,path),set:value(n,'set')})));
  }
  const accomplishments=[];
  for(const name of ['adventuring','combat','economy']){
    const path=`tweak/stats/${name}.sval`;
    const root=parseSval(expandLiteralBlocks(await source(path)));
    if(root.children.find(n=>n.tag==='loader')?.text.trim()!=='Stats::StatDef::LoadMultiple')throw Error(`Unexpected progression loader: ${path}`);
    for(const stat of root.children.find(n=>n.tag==='array')?.children.filter(n=>n.tag==='dict')||[]){
      const definition=child(stat,'accomplishments');
      if(!definition)continue;
      const rows=definition.children.filter(n=>n.tag==='dict');
      accomplishments.push({id:value(stat,'id'),source:path,rewards:rows.map(row=>({value:value(row,'value'),attributes:Object.fromEntries(['str','dex','int','foc','vit'].map(attribute=>[attribute,Number(value(row,`reward-${attribute}`)||0)]))}))});
    }
  }
  const mechanicSources=['scripts/Behaviors/Actors/Player/PlayerRecord.as','scripts/Town/UpgradeShop.as','scripts/Town/WeaponMastery.as',townRecordPath,'scripts/GUI/GuildHall/HeroTitles.as','scripts/Missions/MissionBuff.as','scripts/Behaviors/Actors/Modifiers/Modifiers.as','scripts/Stats.as'];
  for(const path of mechanicSources)await source(path);
  return {mystic,armorer,spellMasteries,weaponMasteries,heroTitles,townBuffs,accomplishments,mechanicSources};
}
