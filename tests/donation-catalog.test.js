import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProgressionCatalog} from '../scripts/progression-catalog.mjs';

function sources(townRecord){
  const map=new Map();
  map.set('tweak/town/shops/mystic.sval','<loader>UpgradeShop::LoadSingle</loader><array><dict><dict name="upgrades"><dict><string name="id">spell-power</string><array name="steps"><dict/></array></dict></dict></dict></array>');
  map.set('tweak/town/shops/armorer.sval','<loader>UpgradeShop::LoadSingle</loader><array><dict><dict name="upgrades"><dict><string name="id">attack-power</string><array name="steps"><dict/></array></dict></dict></dict></array>');
  for(const [path,loader] of [['tweak/town/spell_masteries.sval','WeaponMastery::LoadMultiple'],['tweak/town/weapon_masteries.sval','WeaponMastery::LoadMultiple'],['tweak/town/hero_titles.sval','HeroTitle::LoadMultiple'],['tweak/town/buffs_tavern.sval','MissionBuff::LoadMultiple'],['tweak/town/buffs_chapel.sval','MissionBuff::LoadMultiple']])map.set(path,`<loader>${loader}</loader><array></array>`);
  for(const name of ['adventuring','combat','economy'])map.set(`tweak/stats/${name}.sval`,'<loader>Stats::StatDef::LoadMultiple</loader><array></array>');
  for(const path of ['scripts/Behaviors/Actors/Player/PlayerRecord.as','scripts/Town/UpgradeShop.as','scripts/Town/WeaponMastery.as','scripts/GUI/GuildHall/HeroTitles.as','scripts/Missions/MissionBuff.as','scripts/Behaviors/Actors/Modifiers/Modifiers.as','scripts/Stats.as'])map.set(path,'');
  map.set('scripts/Town/TownRecord.as',townRecord);return map;
}
const sourceText='AddDonationTitle(HeroTitle::Get("title_mat_gold"), "gold", 3000);\nAddDonationTitle(HeroTitle::Get("title_mat_wood"), "wood", 10);\nauto value = g_myTownRecord.statsTown.GetStatCurr(HashString("chapel-revive-" + mat));\nauto level = int(pow(value / divisor, 0.5f) + 0.5f);';

test('progression generator accepts reviewed native AddDonationTitle source shape',async()=>{
  const map=sources(sourceText),catalog=await buildProgressionCatalog({source:async path=>map.get(path),localize:key=>key});
  assert.equal(catalog.heroTitles.length,0);
});

test('progression generator rejects changed native donation divisors',async()=>{
  const map=sources(sourceText.replace('"gold", 3000','"gold", 3001'));
  await assert.rejects(buildProgressionCatalog({source:async path=>map.get(path),localize:key=>key}),/scaling changed for gold/);
});
test('progression generator rejects a changed rounding or donation-stat formula',async()=>{
  for(const sourceTextChanged of [sourceText.replace('+ 0.5f','+ 0.0f'),sourceText.replace('chapel-revive-','donated-')]){
    const map=sources(sourceTextChanged);
    await assert.rejects(buildProgressionCatalog({source:async path=>map.get(path),localize:key=>key}),/formula changed/);
  }
});
