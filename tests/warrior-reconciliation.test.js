import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,createGear,calculateAbility,collectStats} from '../planner-model.js';

const skillPath=id=>`players/warrior/skills/${id}.sval`;
function reconciledWarrior(){
  const b=createBuild(catalog,'warrior');
  b.specializationId='warrior_berserker';b.level=25;b.attributes={str:61,dex:3,int:0,foc:15,vit:34};b.armored=false;b.trinkets=[];b.shadowCurses=0;
  b.skills=Object.fromEntries(Object.entries({whirling_axes:1,warcry:5,constitution:5,killing_spree:5,berserker_leap:1,berserker_rage:5}).map(([id,rank])=>[skillPath(id),{rank,upgrades:{}}]));
  b.gear=[
    ['twohanded_greataxe_02',21,5,['mod_debuff_vulnerability_twohanded','mod_weapon_dmg_fire_1']],
    ['head_str_t3a',21,4,['mod_curse_gain','mod_dmg_fire']],
    ['chest_str_t1a',15,5,['mod_mana_regen','mod_damage_elites']],
    ['feet_str_t2a',19,5,['mod_health_regen','mod_move_speed']],
    ['hands_str_3a',21,5,['mod_spell_damage','mod_mana_regen']],
    ['back_2b',23,5,['mod_res_armor','mod_dash_charge']],
  ].map(([id,itemLevel,upgradeLevel,affixes])=>({...createGear(catalog,id),itemLevel,upgradeLevel,sourceQuality:4,affixes:affixes.map(id=>({id,roll:.5}))}));
  b.progression={mysticSpellPower:6,armorerAttackPower:13,accomplishmentAttributes:{str:15,dex:0,int:0,foc:0,vit:0},spellMasteries:{},weaponMasteries:{axes:2},heroTitles:{title_ranger:17,title_wizard:0},townBuffs:{}};
  return b;
}

test('reported Warrior progression reconciles power without calibrating skill damage to observed hits',()=>{
  const b=reconciledWarrior(),stats=collectStats(b,catalog);
  assert.equal(stats.attributes.str,86);
  assert.equal(stats.spellPower,202);
  assert.equal(stats.attackPower,147);
  assert.deepEqual(stats.mainHand,{physical:100,fire:19,ice:0,lightning:0,poison:0,pure:0});
  // Source-derived regression expectations, NOT the reported runtime hits 91/274/281/169.
  const expected=[
    [skillPath('whirling_axes'),[88],2.6,176.54117647058823],
    [skillPath('berserker_leap'),[265],5.5,265.8058823529412],
    ['weapon:attack_2h_greataxe',[239,49],.81,292.0623853211009],
    ['weapon:attack_2h_greataxe_secondary',[143,30],9.5,3509.0458715596333],
  ];
  for(const [path,normal,interval,damage] of expected){
    const r=calculateAbility(b,catalog,path);
    assert.deepEqual(r.components.map(c=>c.normalHit),normal,path);
    assert.equal(r.interval,interval,path);
    assert.ok(Math.abs(r.damage-damage)<1e-9,path);
    assert.ok(Math.abs(r.dps-damage/interval)<1e-9,path);
  }
  const whirlwind=calculateAbility(b,catalog,'weapon:attack_2h_greataxe_secondary');
  assert.equal(whirlwind.duration,5);assert.ok(whirlwind.components.every(c=>c.hits===20));
  assert.ok(whirlwind.components.every(c=>c.weaponScale===undefined));
});
