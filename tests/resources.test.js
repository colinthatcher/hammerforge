import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readArchive,decodeLz4} from '../scripts/game-resources.mjs';
import {parseSval,parseLanguage,value,normalizeSval,mergeSval} from '../scripts/sval.mjs';

function fixture(name,body,compressed=false){
 const header=Buffer.alloc(21);header.write('HW2R');header[4]=4;header.writeUInt32LE(1,17);
 const n=Buffer.alloc(4);n.writeUInt32LE(Buffer.byteLength(name));
 const sizes=Buffer.alloc(9);sizes[0]=1;sizes.writeUInt32LE(compressed?8:body.length,1);sizes.writeUInt32LE(compressed?body.length:0,5);
 return Buffer.concat([header,n,Buffer.from(name),sizes,body]);
}
test('LZ4 decodes literals, matches, and overlapping back references',()=>{
 assert.equal(decodeLz4(Buffer.from([0x40,97,98,99,100,4,0]),8).toString(),'abcdabcd');
 assert.equal(decodeLz4(Buffer.from([0x13,97,1,0]),8).toString(),'aaaaaaaa');
 assert.equal(decodeLz4(Buffer.from([0x30,97,98,99]),3).toString(),'abc');
 for(const [bytes,size] of [[[0x40,97],4],[[0,0,0],4],[[0x10,97,2,0],5],[[0x10,97],2]])assert.throws(()=>decodeLz4(Buffer.from(bytes),size));
});
test('HW2R reader supports raw and compressed entries and rejects malformed paths/data',()=>{
 assert.equal(readArchive(fixture('skills/test.sval',Buffer.from('example'))).get('skills/test.sval').read().toString(),'example');
 assert.equal(readArchive(fixture('test',Buffer.from([0x40,97,98,99,100,4,0]),true)).get('test').read().toString(),'abcdabcd');
 for(const path of ['../escape','/absolute','dir/../../escape','a\\b'])assert.throws(()=>readArchive(fixture(path,Buffer.from('x'))));
 const bytes=fixture('test',Buffer.from('hello'));assert.throws(()=>readArchive(bytes.subarray(0,bytes.length-1)));
 bytes[4]=5;assert.throws(()=>readArchive(bytes),/Unsupported/);
});
test('structural parser excludes inactive comments and macro definitions, retains symbolic values',()=>{
 const parsed=parseSval('%defblock Shared\n<dict><string name="id">not-active</string></dict>\n%endblock\n<dict><!-- <int name="damage">9999</int> --><int name="damage">80</int><int name="cost">SKILLCOSTLEVEL_1</int></dict>');
 assert.equal(parsed.children.length,1);assert.equal(value(parsed.children[0],'damage'),'80');assert.equal(value(parsed.children[0],'cost'),'SKILLCOSTLEVEL_1');
 assert.throws(()=>parseSval('<dict></array>'));assert.throws(()=>parseSval('<dict>'));
 assert.equal(parseLanguage('<string name="test">Deals \\cffffffFire\\d &amp; Ice</string>').get('test'),'Deals Fire & Ice');
});
const catalog=JSON.parse(readFileSync(new URL('../data/game-data.json',import.meta.url)));
test('catalog contains linked active class profiles and hashed skill sources',()=>{
 assert.equal(catalog.classes.length,8);assert.equal(catalog.classes.flatMap(c=>c.specializations).length,24);
 const paths=new Set();for(const base of catalog.classes){for(const profile of [base,...base.specializations]){for(const path of profile.skills){assert.ok(catalog.skills[path],path);paths.add(path);}}}
 assert.equal(paths.size,Object.keys(catalog.skills).length);
 for(const [path,skill] of Object.entries(catalog.skills)){assert.match(catalog.sources[path],/^[a-f0-9]{64}$/);assert.ok(skill.id);assert.ok(skill.name);assert.equal(skill.source,path);for(const upgrade of skill.upgrades){assert.ok(upgrade.name);assert.ok(upgrade.id);assert.ok(upgrade.tiers>=1);}}
 // Unreferenced developer/experimental skill files must not become selectable.
 assert.ok(!catalog.skills['players/wizard/skills/phantasmal_force.sval']);
});
test('reviewed Fireball and Wizard definitions match build 25932569',()=>{
 assert.equal(catalog.buildId,'25932569');
 assert.equal(catalog.facts.powerDivisor,200);
 assert.deepEqual(catalog.facts.equipmentSlots.map(s=>s.id),['MainHand','OffHand','TwoHanded','Head','Chest','Feet','Hands','Back']);
 const wizard=catalog.classes.find(c=>c.id==='wizard');assert.deepEqual(wizard.specializations.map(s=>s.name),['Evocation','Conjuration','Transmutation']);
 const fireball=catalog.skills['players/wizard/skills/wiz_fireball.sval'];
 assert.deepEqual(fireball.parameters.find(p=>p.key==='damage').values,['80','90','110','130','170']);
 assert.equal(fireball.baseTiming.cooldownMs,'5000');
 assert.deepEqual(fireball.upgrades.map(u=>u.name),['Enhanced Fireball','Blastwave','Bouncing Fireball']);
 assert.deepEqual(fireball.upgrades[2].parameters.find(p=>p.key==='bounces').values,['1','2']);
});
test('normalization preserves nested definitions and symbolic values; rank merges replace arrays',()=>{
 const node=parseSval('<dict><s name="class">Modifiers::DamagePowerAdd</s><float name="power">-2.5</float><i name="cost">COST * 2</i><ivec2 name="range">1 20</ivec2><vec2 name="symbolic">MIN MAX</vec2><dict name="binds"><i name="damage">50</i><i name="count">3</i></dict><a name="actions"><dict><b name="enabled">t</b></dict></a></dict>').children[0];
 const base=normalizeSval(node);
 assert.deepEqual(base,{class:'Modifiers::DamagePowerAdd',power:-2.5,cost:'COST * 2',range:[1,20],symbolic:'MIN MAX',binds:{damage:50,count:3},actions:[{enabled:true}]});
 const next=mergeSval(base,{binds:{damage:60},actions:[]});
 assert.deepEqual(next.binds,{damage:60,count:3});assert.deepEqual(next.actions,[]);
 assert.equal(base.binds.damage,50);assert.equal(base.actions.length,1);
});
test('equipment, affixes and trinkets have unique IDs, localized names and hashed definition references',()=>{
 assert.deepEqual([catalog.equipment.length,catalog.affixes.length,catalog.trinkets.length],[159,113,114]);
 for(const [kind,records] of Object.entries({equipment:catalog.equipment,affixes:catalog.affixes,trinkets:catalog.trinkets})){
  assert.equal(new Set(records.map(r=>r.id)).size,records.length);
  for(const record of records){
   assert.ok(record.id);assert.ok(record.name);assert.ok(!record.name.startsWith('.'),record.id);
   assert.match(catalog.sources[record.source],/^[a-f0-9]{64}$/);
   assert.match(record.source,kind==='equipment'?/^tweak\/items\/equipment\/equipment_.*\.sval$/:kind==='affixes'?/^tweak\/items\/modifiers_equipment.*\.sval$/:/^tweak\/trinkets\/.*\.sval$/);
   assert.ok(Array.isArray(record.modifiers));
   for(const modifier of record.modifiers)assert.equal(typeof modifier.class,'string',record.id);
  }
 }
 const slots=catalog.facts.equipmentSlots.map(s=>s.id.toLowerCase());
 assert.deepEqual([...new Set(catalog.equipment.map(e=>e.slot))].sort(),slots.sort());
 for(const item of catalog.equipment){assert.ok(slots.includes(item.slot));for(const requirement of Object.values(item.requirements))assert.equal(typeof requirement,'string');}
 const shield=catalog.equipment.find(e=>e.id==='offhand_shield_01');
 assert.deepEqual(shield.requirements,{'req-str':'10 20'});assert.deepEqual(shield.modifiers[0],{class:'Modifiers::ArmorAdd',armor:[5,15]});
 assert.deepEqual([shield.levelMin,shield.levelMax],[1,20]);
 const affix=catalog.affixes.find(a=>a.id==='mod_str');
 assert.equal(affix.name,'Brawny');assert.deepEqual(affix.modifiers,[{class:'Modifiers::StatAdd',str:[3,8]}]);
 assert.ok(catalog.equipment.some(e=>e.slot==='chest'&&e.tags.some(t=>affix.tags.includes(t))));
 assert.deepEqual([...new Set(catalog.affixes.map(a=>a.quality))].sort(),['common','epic','rare']);
});
test('trinket attunement retains exact Book of Spells powers and description substitution',()=>{
 const book=catalog.trinkets.find(t=>t.id==='book_spells');
 assert.equal(book.name,'Book of Spells');assert.equal(book.canAttune,true);
 assert.equal(book.description,'+20 Spell Power');assert.equal(book.attunedDescription,'+40 Spell Power');
 assert.deepEqual(book.modifiers,[{class:'Modifiers::DamagePowerAdd','spell-power':20}]);
 assert.deepEqual(book.attunedModifiers,[{class:'Modifiers::DamagePowerAdd','spell-power':40}]);
 const antidote=catalog.trinkets.find(t=>t.id==='apothecarys_antidote');
 assert.equal(antidote.canAttune,false);assert.deepEqual(antidote.attunedModifiers,antidote.modifiers);assert.equal(antidote.attunedDescription,antidote.description);
 const tincture=catalog.trinkets.find(t=>t.id==='apothecarys_tincture');
 assert.ok(tincture.modifiers[0].effects.some(e=>e.class==='ApplyBuff'&&e.buff==='tweak/buffs/buffs_items.sval:apothecarys_tincture'));
 assert.ok(!tincture.modifiers[0].effects.some(e=>e.class==='DebugLog'));
});
test('class attributes, scaling and combat constants are source-linked',()=>{
 assert.deepEqual(catalog.classes.map(c=>c.name),['Warrior','Paladin','Ranger','Wizard','Rogue','Warlock','Sorcerer','Priest']);
 assert.equal(catalog.classes.find(c=>c.id==='priest').requiresDlc,'holy');
 const wizard=catalog.classes.find(c=>c.id==='wizard');
 assert.deepEqual(wizard.attributes,{str:2,dex:2,int:10,foc:10,vit:6});
 assert.deepEqual(wizard.powerScaling,{str:0,dex:0,int:2,foc:0,vit:0});
 assert.deepEqual(wizard.attributeGrowth,{str:0,dex:0,int:0,foc:0,vit:0});
 for(const c of catalog.classes)for(const field of ['attributes','powerScaling','attributeGrowth'])assert.deepEqual(Object.keys(c[field]),['str','dex','int','foc','vit']);
 assert.equal(catalog.facts.armorEfficiency,0.005);assert.equal(catalog.facts.baseSpellCritDamage,1.5);assert.equal(catalog.facts.simulationValidated,false);
 for(const path of ['scripts/Behaviors/Armor.as','scripts/Data/Misc.as',...['Modifiers','StatModifier','Damage'].map(n=>`scripts/Behaviors/Actors/Modifiers/${n}.as`),...['PlayerSkill','PlayerSkillDirectional','PlayerSkillPosition'].map(n=>`scripts/Behaviors/Actors/Skills/${n}.as`)])assert.match(catalog.sources[path],/^[a-f0-9]{64}$/);
});
test('skill ranks retain numeric binds, original override layers and preprocessing caveats',()=>{
 for(const skill of Object.values(catalog.skills)){
   assert.equal(skill.ranks.length,skill.rankCount);
   assert.equal(skill.rankOverrides.length,skill.rankCount);
   for(const upgrade of skill.upgrades){assert.equal(upgrade.ranks.length,upgrade.tiers);assert.equal(upgrade.rankOverrides.length,upgrade.tiers);assert.ok(Array.isArray(upgrade.blockedBy));}
 }
 const missiles=catalog.skills['players/wizard/skills/wiz_magic_missiles.sval'];
 assert.equal(missiles.rankCount,5);assert.equal(missiles.startingLevel,1);
 assert.deepEqual(missiles.ranks.map(r=>r.binds['missile-dmg']),[50,60,70,80,90]);
 assert.deepEqual(missiles.ranks.map(r=>r['mana-cost']),[30,30,40,40,50]);
 assert.ok(missiles.ranks.every(r=>r.binds['projectiles-num']===3&&r.cooldown===1000));
 const projectiles=missiles.upgrades.find(u=>u.id==='wiz_magic_missiles_projectiles');
 assert.deepEqual([missiles.ranks[0],...projectiles.ranks].map(r=>r.binds['projectiles-num']),[3,4,5]);
 assert.equal(missiles.ranks[0]['skill-cost'],'SKILLCOSTLEVEL_1');
 assert.equal(missiles.requiresPreprocessing,true);assert.ok(missiles.preprocessorDirectives.includes('%include "players/skills_cost.inc"'));
});
