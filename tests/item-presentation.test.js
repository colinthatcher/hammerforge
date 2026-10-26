import test from 'node:test';
import assert from 'node:assert/strict';
import {itemQuality,presentItem,presentModifier} from '../item-presentation.js';
import catalog from '../data/game-data.json' with {type:'json'};

test('modifier values scale with roll and have explicit units only for known percentages',()=>{
  assert.equal(presentModifier({class:'Modifiers::DamagePowerAdd','spell-power':[10,20],'attack-power':4},.5),'15 Spell power · 4 Attack power');
  assert.equal(presentModifier({class:'Modifiers::DamageAdd',fire:12,physical:3}), '12 Fire damage · 3 Physical damage');
  assert.equal(presentModifier({class:'Modifiers::DamageMulAdd',fire:.15,ice:.2}), '15% Fire damage · 20% Ice damage');
  assert.equal(presentModifier({class:'Modifiers::StatBasedDamage',stat:'str',type:'fire',amount:.5}), '0.5 damage per Strength (Fire)');
  assert.equal(presentModifier({class:'Modifiers::Mystery',chance:.2}), 'Additional mystery effect — inspect editor for details');
  assert.equal(presentModifier({class:'Modifiers::StatAdd',str:[3,8]},.5),'5.5 Strength');
  assert.equal(presentModifier({class:'Modifiers::SpeedAdd','attack-speed':'0.05'}),'5% Attack speed');
  assert.equal(presentModifier({class:'Modifiers::CriticalHit',chance:.02}),'2% Weapon critical chance');
});

test('conditional damage is readable without implementation fields',()=>{
  assert.equal(presentModifier({class:'Modifiers::Damage',conditional:['tag','has',['elites']],'shown-icons':['elites'],'attack-mul':1.2,'spell-mul':1.2}),'+20% weapon and spell damage against elites');
  assert.equal(presentModifier({class:'Modifiers::Damage',conditional:['tag','has',['boss']],'attack-mul':1.15,'spell-mul':1.15}),'+15% weapon and spell damage against bosses');
  assert.equal(presentModifier({class:'Modifiers::DamageLeeching',life:.01,'weapon-leech':true,'spell-leech':true,'only-crit':true,conditional:['buff','has tag','bleeding']}),'Restore 1% of weapon and spell damage as health on critical hits against targets affected by bleeding');
});

test('trigger descriptions retain chance, scope, effect, target and cooldown',()=>{
  assert.equal(presentModifier({class:'Modifiers::SkillTriggerEffect','skill-type':'mainhand',trigger:'hit',chance:.15,effect:{class:'ApplyBuff',buff:'tweak/buffs/status_effects.sval:stun'}}),'Main Hand Weapon: 15% chance to apply stun to the target on hit');
  assert.equal(presentModifier({class:'Modifiers::TriggerEffect',trigger:'kill',chance:1,'target-self':true,effect:{class:'Heal',heal:1}}),'restore 1 health on kill (affects you)');
  assert.equal(presentModifier({class:'Modifiers::TriggerEffect',trigger:'kill',chance:1,'target-self':true,effect:{class:'GiveMana',mana:2}}),'restore 2 mana on kill (affects you)');
  assert.match(presentModifier({class:'Modifiers::Block',chance:1,any:80,timeout:5000,arc:360} ),/block 80 damage within a 360° arc · 5s cooldown/);
  assert.equal(presentModifier({class:'Modifiers::Armor','dmg-taken-mul':.95}),'-5% damage taken');
});

test('all extracted item effects have prose rather than raw metadata or object dumps',()=>{
  for(const definition of [...catalog.equipment,...catalog.affixes])for(const modifier of definition.modifiers){
    const text=presentModifier(modifier,.5);
    assert.ok(text.length,definition.id);
    assert.doesNotMatch(text,/NaN|undefined|\[object Object\]|Shown Icons|Attack Mul|Spell Mul|Conditional|\.sval|\.unit|Modifiers::/,`${definition.id}: ${text}`);
    assert.doesNotMatch(text,/inspect editor for details/,`${definition.id} should have a known formatter`);
  }
});

test('item preview separates base effects and named prefix/suffix effects with scaled values',()=>{
  const base={modifiers:[{class:'Modifiers::DamageAdd',fire:[0,90]}]};
  const defs={affixes:[{id:'prefix',name:'Brawny',prefix:'Brawny',suffix:'',modifiers:[{class:'Modifiers::StatAdd',str:[3,8]}]},{id:'suffix',name:'of Quickness',prefix:'',suffix:'of Quickness',modifiers:[{class:'Modifiers::SpeedAdd','attack-speed':.05}]}]};
  const result=presentItem({itemLevel:5,upgradeLevel:2,affixes:[{id:'prefix',roll:.1},{id:'suffix',roll:.1}]},base,defs);
  assert.deepEqual(result.baseStats,['60 Fire damage']);
  assert.deepEqual(result.affixes.map(a=>[a.name,a.type]),[['Brawny','Prefix'],['of Quickness','Suffix']]);
  assert.equal(result.affixes[0].stats[0],'6.33 Strength');
  assert.equal(result.affixes[1].stats[0],'5% Attack speed');
});

test('item intensity uses gear intensity including upgrades, with roll fallback',()=>{
  const base={levelMax:9,modifiers:[{class:'Modifiers::DamageAdd',fire:[0,90]}]};
  const catalog={affixes:[]};
  assert.match(presentItem({roll:.25,affixes:[]},base,catalog).stats[0],/^22\.5 Fire damage$/);
  assert.match(presentItem({itemLevel:5,upgradeLevel:2,affixes:[]},base,catalog).stats[0],/^60 Fire damage$/);
});

test('quality thresholds and explicit source quality take precedence over effect count',()=>{
  assert.deepEqual([0,1,2,3].map(n=>itemQuality(n).label),['Common','Uncommon','Rare','Epic']);
  assert.equal(itemQuality(0,16).label,'Legendary');
  assert.notEqual(itemQuality(0,9).label,'Legendary');
  for(const [quality,label] of [[1,'Common'],[2,'Uncommon'],[4,'Rare'],[8,'Epic'],[16,'Legendary'],[128,'Cursed']]){
    assert.equal(itemQuality(0,quality).label,label);
    assert.equal(itemQuality(3,quality).label,label);
    assert.equal(itemQuality(0,label.toLowerCase()).label,label);
  }
  assert.equal(itemQuality(0,9).label,'Unknown quality (9)');
});

test('epic effects have their own presentation type and infer epic quality without saved quality',()=>{
  const base=catalog.equipment.find(b=>b.slot==='head');
  const item={affixes:[{id:'mod_epic_immunity_silence',roll:.5}]};
  const result=presentItem(item,base,catalog);
  assert.equal(result.quality.label,'Epic');assert.equal(result.quality.color,'#ff00ff');
  assert.equal(result.affixes[0].type,'Epic effect');
  assert.ok(result.affixes[0].stats.length);
  assert.equal(presentItem({...item,sourceQuality:4},base,catalog).quality.label,'Rare','Explicit source quality remains authoritative');
  assert.equal(presentItem({affixes:[],sourceQuality:8},base,catalog).quality.label,'Epic');
});

test('unresolved imported modifiers remain visible and counted',()=>{
  const result=presentItem({roll:.5,affixes:[],unresolvedModifiers:['0x12345678','0xabcdef01']},{modifiers:[]},{affixes:[]});
  assert.equal(result.stats.length,2);
  assert.equal(result.quality.label,'Rare');
  assert.match(result.stats.join(' '),/0x12345678/);
  assert.match(result.stats.join(' '),/0xabcdef01/);
});
