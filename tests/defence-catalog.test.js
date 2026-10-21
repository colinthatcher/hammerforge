import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {numericConstant} from '../scripts/defence-catalog.mjs';

test('numeric source constants accept int/float literals and fail closed when absent or changed',()=>{
 assert.equal(numericConstant('const int NGPArmorPenalty = 110;','NGPArmorPenalty'),110);
 assert.equal(numericConstant('const float SCurseArmorNGPPenalty = 0.66f;','SCurseArmorNGPPenalty'),0.66);
 assert.equal(numericConstant('const float NGPArmorPenalty = 110.0;','NGPArmorPenalty'),110);
 assert.equal(numericConstant('const float FireImmediateDmgScale = 0.67f;','FireImmediateDmgScale'),0.67);
 assert.equal(numericConstant('const float PoisonImmmediateDmgScale = 0.20f;','PoisonImmmediateDmgScale'),0.20);
 for(const text of ['', 'const float NGPArmorPenalty = value;','const double NGPArmorPenalty = 110.0;'])assert.throws(()=>numericConstant(text,'NGPArmorPenalty'),/Missing literal NGPArmorPenalty/);
});

test('generated class defences and recovery facts have source evidence',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../data/game-data.json',import.meta.url),'utf8'));
 const fields=['healthRegen','healthRegenPerLevel','manaRegen','manaRegenPerLevel','fireResistance','fireResistancePerLevel','iceResistance','iceResistancePerLevel','lightningResistance','lightningResistancePerLevel','poisonResistance','poisonResistancePerLevel'];
 for(const cls of catalog.classes)for(const field of fields)assert.equal(typeof cls.baseStats[field],'number',`${cls.id}.${field}`);
 assert.equal(catalog.facts.healthRegenPerVitality,0.05);
 assert.equal(catalog.facts.manaRegenPerFocus,0.1);
 assert.equal(typeof catalog.facts.healthRegenDelayMs,'number');
 assert.equal(catalog.facts.fireImmediateDamageScale,0.67);
 assert.equal(catalog.facts.poisonImmediateDamageScale,0.2);
 assert.deepEqual(Object.fromEntries(['ngpArmorPenalty','ngpResistancePenalty','shadowCurseArmorPenalty','shadowCurseArmorNGPPenalty'].map(key=>[key,catalog.facts[key]])),{ngpArmorPenalty:110,ngpResistancePenalty:60,shadowCurseArmorPenalty:3,shadowCurseArmorNGPPenalty:0.66});
 const required=['scripts/Behaviors/Actors/Modifiers/Modifiers.as','scripts/Behaviors/Actors/Player/Player.as','scripts/Behaviors/Actors/Player/PlayerStats.as','scripts/Behaviors/Actors/Modifiers/StatModifier.as','scripts/Behaviors/Actors/ActorBuffList.as','scripts/GUI/PlayerMenu/Modifications.as','scripts/Data/Player.as','scripts/Data/Misc.as'];
 assert.equal(catalog.defences.status,'source-reviewed; runtime simulation not validated');
 for(const path of required){assert.ok(catalog.defences.mechanicSources.includes(path),path);assert.match(catalog.sources[path],/^[a-f\d]{64}$/,`missing source hash ${path}`);}
 assert.ok(Number.isFinite(catalog.facts.armorNegativeMultiplier));
});
