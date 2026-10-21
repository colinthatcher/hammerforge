import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {decodeCharacterProfile,decodeSaveValue,decompressSaveBlock,gameHash,SAVE_LIMITS} from '../save-codec.js';
import {importCharacterProfile,readCharacterFiles} from '../character-import.js';
import {collectStats,calculateAbility,validatePlannerBuild,gearIntensity} from '../planner-model.js';
import {profileFixture,characterFixture,fileFixture,encodeValue,literalBlock,u32} from './save-fixtures.js';
const missiles='players/wizard/skills/wiz_magic_missiles.sval';

test('HashString matches independently observed native equipment and affix hashes',()=>{
  for(const [id,hash] of [['twohanded_greataxe_02',0xddb3ea41],['head_str_t3a',0xd048f112],['chest_str_t1a',0x7c1ccd8f],['feet_str_t2a',0x080ebf34],['mod_debuff_vulnerability_twohanded',0x5dded7d0],['mod_weapon_dmg_fire_1',0x2b2918d1]])assert.equal(gameHash(id),hash);
});
test('H2SV parser reads multiple characters, profile metadata and scenes without executing scene data',()=>{
  const one=characterFixture(),two=characterFixture({'unique-key':987654,name:'Fixture ranger',class:'ranger'}),deleted=characterFixture({'unique-key':0,name:null,class:null,level:0});
  const parsed=decodeCharacterProfile(profileFixture([one,two,deleted],{scene:true,metadata:Buffer.from([7,0,1,2,3,4,5,6])}));
  assert.equal(parsed.name,'Synthetic profile');assert.equal(parsed.savedAt,1700000000000);assert.equal(parsed.characters.length,2);assert.equal(parsed.characters[1].record.class,'ranger');assert.deepEqual(parsed.headerMetadata,[7,0,1,2,3,4,5,6]);
});
test('browser-compatible LZ4 handles literal extensions and overlapping matches',()=>{
  const bytes=new Uint8Array(600).fill(7);assert.deepEqual(decompressSaveBlock(literalBlock(bytes),600),bytes);
  assert.equal(new TextDecoder().decode(decompressSaveBlock(Uint8Array.from([0x13,97,1,0]),8)),'aaaaaaaa');
  assert.throws(()=>decompressSaveBlock(Uint8Array.from([0,0,0]),4));assert.throws(()=>decompressSaveBlock(Uint8Array.from([0x10,97]),2));assert.throws(()=>decompressSaveBlock(new Uint8Array(),SAVE_LIMITS.block+1));
});
test('save values decode typed binary data safely and refuse malformed/unsupported structures',()=>{
  const decoded=decodeSaveValue(encodeValue({name:'Fixture',enabled:true,blob:new Uint8Array([1,2,3]),items:[0,false,null,'']}));
  assert.deepEqual([...decoded.blob],[1,2,3]);assert.deepEqual(decoded.items,[0,false,null,'']);
  for(const bytes of [Uint8Array.from([255]),Buffer.concat([Buffer.from([1]),u32(500000)]),Buffer.concat([Buffer.from([2]),u32(2),Buffer.from('x\0'),Buffer.from([110]),Buffer.from('x\0'),Buffer.from([110])]),Uint8Array.from([110,110])])assert.throws(()=>decodeSaveValue(bytes));
  const fixture=profileFixture();for(const bytes of [fixture.subarray(0,15),fixture.subarray(0,fixture.length-10),Buffer.from('not a save')])assert.throws(()=>decodeCharacterProfile(bytes));
  const version=Buffer.from(fixture);version.writeUInt32LE(5,4);assert.throws(()=>decodeCharacterProfile(version),/version/);
});
test('native mapping retains source attributes, learned ranks, named tiers, item levels and duplicate attuned trinkets',()=>{
  const rows=importCharacterProfile(profileFixture(),catalog,'0.hps');assert.equal(rows.length,1);assert.equal(rows[0].error,undefined);
  const b=rows[0].build;assert.equal(b.classId,'wizard');assert.equal(b.attributes.int,9);assert.equal(b.skills[missiles].rank,3);assert.equal(b.skills[missiles].upgrades.wiz_magic_missiles_projectiles,2);
  assert.equal(b.skills['players/wizard/skills/wiz_arcane_intellect.sval'].rank,catalog.skills['players/wizard/skills/wiz_arcane_intellect.sval'].startingLevel);
  assert.deepEqual(b.trinkets,[{id:'book_spells',count:2,attuned:true}]);assert.equal(b.gear.length,1);assert.equal(b.gear[0].itemLevel,19);assert.equal(b.gear[0].upgradeLevel,2);assert.equal(b.gear[0].baseId,'head_str_t1a');assert.equal(b.gear[0].equipped,true);
  assert.equal(gearIntensity(b.gear[0]),20/9);assert.equal(collectStats(b,catalog).attributes.int,36);assert.equal(collectStats(b,catalog).spellPower,212); // Includes Arcane Intellect and the level-20 Wizard profile title (+60).
  assert.equal(calculateAbility(b,catalog,missiles).hits,5);assert.deepEqual(validatePlannerBuild(JSON.parse(JSON.stringify(b)),catalog),b);
});
test('unlearned skills stay unlearned and copied trinkets apply once per copy',()=>{
  const b=importCharacterProfile(profileFixture([characterFixture({'picked-skills':{},'picked-temp-skills':{}})]),catalog,'0.hps')[0].build;
  const fire='players/wizard/skills/wiz_fireball.sval';assert.equal(b.skills[fire].rank,0);assert.equal(calculateAbility(b,catalog,fire).dps,null);assert.match(calculateAbility(b,catalog,fire).unsupported[0],/not been learned/);
  b.trinkets[0].count=1;assert.equal(collectStats(b,catalog).spellPower,172);
});
test('unknown native items and modifiers are retained with notes instead of invented effects',()=>{
  const c=characterFixture();c.equipped.push([4,0x12345678,.5,10,0,0,0]);c.equipped[2].push(0xdeadbeef|0);
  const row=importCharacterProfile(profileFixture([c]),catalog,'0.hps')[0];assert.equal(row.error,undefined);assert.ok(row.warnings.some(w=>w.includes('0x12345678')));assert.deepEqual(row.build.gear[0].unresolvedModifiers,['0xdeadbeef']);assert.equal(row.build.importInfo.unresolvedEquipped,1);assert.equal(row.build.importInfo.unmappedEquipment.length,1);const r=calculateAbility(row.build,catalog,missiles);assert.ok(r.dps>0);assert.equal(r.status,'partial');assert.ok(r.limitations.some(n=>n.includes('unresolved')));
});
test('unknown class is a per-character error and does not discard supported characters',()=>{
  const rows=importCharacterProfile(profileFixture([characterFixture(),characterFixture({'unique-key':2,name:'Other',class:'unknown_mod_class'})]),catalog,'0.hps');assert.ok(rows[0].build);assert.match(rows[1].error,/not in the current game catalog/);
});
test('folder and multi-file imports prefer primary profiles and deduplicate snapshots by save time',async()=>{
  const main=profileFixture(),old=profileFixture([characterFixture({level:15})],{savedAt:1600000000000});
  for(const folder of [false,true]){const files=[fileFixture('0.hps',main,folder?'saves/0.hps':''),fileFixture('0_1.hps',old,folder?'saves/0_1.hps':''),fileFixture('1.hps',main,folder?'saves/1.hps':'')];const result=await readCharacterFiles(files,catalog);assert.equal(result.characters.length,2);assert.equal(result.skipped.length,1);assert.equal(result.errors.length,0);assert.equal(result.characters[0].level,20);}
  const backups=await readCharacterFiles([fileFixture('0_1.hps',old),fileFixture('0_2.hps',main)],catalog);assert.equal(backups.characters.length,1);assert.equal(backups.characters[0].level,20);
});
test('import errors are isolated per file and resource limits are enforced',async()=>{
  const result=await readCharacterFiles([fileFixture('0.hps',profileFixture()),fileFixture('bad.hps',Buffer.from('bad')),fileFixture('notes.txt',Buffer.from('ignore'))],catalog);assert.equal(result.characters.length,1);assert.equal(result.errors.length,1);assert.equal(result.files,2);
  await assert.rejects(()=>readCharacterFiles(Array.from({length:1001},()=>fileFixture('x.hps',Buffer.alloc(0))),catalog),/1,000/);
  const tooLarge=await readCharacterFiles([{name:'x.hps',size:SAVE_LIMITS.file+1}],catalog);assert.equal(tooLarge.errors.length,1);
});
test('invalid saved levels and imported metadata cannot enter the planner',()=>{
  const row=importCharacterProfile(profileFixture([characterFixture({level:10001})]),catalog,'0.hps')[0];assert.match(row.error,/level/);
  const b=importCharacterProfile(profileFixture(),catalog,'0.hps')[0].build;
  for(const mutate of [x=>x.gear[0].itemLevel=0,x=>x.gear[0].upgradeLevel=-1,x=>x.trinkets[0].count=0,x=>x.trinkets[0].count=1001,x=>x.importInfo.warnings={},x=>x.importInfo.unresolvedEquipped=-1]){const copy=structuredClone(b);mutate(copy);assert.throws(()=>validatePlannerBuild(copy,catalog));}
});

test('failed header candidates share a decompression budget before allocating scene blocks',()=>{
  const block=bytes=>{const compressed=literalBlock(bytes);return Buffer.concat([u32(bytes.length),u32(compressed.length),compressed]);};
  const inner=block(encodeValue({buildings:[]})),outer=block(encodeValue({buildings:[],payload:inner}));
  const size=12*1024*1024,extensions=[];let remaining=size-20;
  while(remaining>=255){extensions.push(255);remaining-=255;}extensions.push(remaining);
  const compressed=Buffer.from([0x1f,0,1,0,...extensions]),sceneBlock=Buffer.concat([u32(size),u32(compressed.length),compressed]);
  const scene=Buffer.concat([Buffer.from('scene\0'),sceneBlock,sceneBlock,Buffer.from('resource\0'),Buffer.alloc(8)]);
  const input=Buffer.concat([Buffer.from('H2SV'),u32(4),Buffer.alloc(8),Buffer.from('Synthetic\0'),outer,u32(1),u32(123456),block(encodeValue(characterFixture())),u32(2),scene,scene,Buffer.alloc(5)]);
  assert.ok(input.length<200000);
  const NativeUint8Array=globalThis.Uint8Array;let allocated=0,overBudget=false,caught;
  try{
    globalThis.Uint8Array=new Proxy(NativeUint8Array,{construct(target,args){if(args.length===1&&typeof args[0]==='number'){if(allocated+args[0]>SAVE_LIMITS.total){overBudget=true;throw Error('TEST_ALLOCATION_GUARD');}allocated+=args[0];}return Reflect.construct(target,args);}});
    try{decodeCharacterProfile(input);}catch(error){caught=error;}
  }finally{globalThis.Uint8Array=NativeUint8Array;}
  assert.equal(overBudget,false);assert.match(caught?.message||'',/decoding budget/i);
});
