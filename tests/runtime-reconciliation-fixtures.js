import {createBuild,createGear,availableSkills} from '../planner-model.js';

// Sanitized inputs for the build-25932569 town-dummy comparison. No save IDs,
// character names, or paths. Only the 103/124 normal contacts were observed live;
// this fixture is not validation of procs, criticals, timing, or complete DPS.
export function runtimeReconciliationBuild(catalog,classId){
  const b=createBuild(catalog,classId),paladin=classId==='paladin';
  b.specializationId=paladin?'paladin_divine':'ranger_nature';b.level=paladin?19:17;
  b.attributes=paladin?{str:30,dex:0,int:0,foc:28,vit:24}:{str:9,dex:49,int:0,foc:0,vit:40};
  b.targetId='dummy-magic';b.armored=false;b.shadowCurses=0;
  b.skills=Object.fromEntries(availableSkills(b,catalog).map(s=>[s.source,{rank:0,upgrades:{}}]));
  const ranks=paladin?{pal_blessed_strikes:4,pal_lay_on_hands:4,pal_shining_knight:3,pal_conviction:3,divine_pillars:1,divine_protection:1}:{ran_marked_shot:3,ran_rhythm:5,ran_survivalist:5,nature_entangle:1,nature_wind_weaver:5};
  for(const [id,rank] of Object.entries(ranks))b.skills[`players/${classId}/skills/${id}.sval`]={rank,upgrades:{}};
  const gear=paladin?[
    ['mainhand_mace_02',12,0,4,['mod_weapon_dmg_ice_1','mod_poison_penetration']],
    ['offhand_shield_01',8,0,2,['mod_res_armor']],
    ['head_str_t1a',13,0,4,['mod_str','mod_kill_mana']],
    ['chest_str_t1a',7,0,2,['mod_mana']],
    ['feet_str_t1a',18,0,4,['mod_res_poison','mod_dash_recovery']],
    ['hands_int_1a',2,0,2,['mod_dmg_physical']],
    ['back_2a',18,0,4,['mod_damage_elites','mod_dmg_fire']],
  ]:[
    ['twohanded_daggers_01',9,3,4,['mod_attack_power','mod_parry']],
    ['head_dex_t1b',14,0,8,['mod_spell_crit_dmg','mod_kill_health','mod_epic_immunity_vulnerability']],
    ['chest_str_t1a',3,3,4,['mod_foc','mod_damage_elites']],
    ['feet_dex_t2a',17,3,4,['mod_int','mod_dmg_reduction']],
    ['hands_str_1a',12,5,4,['mod_dmg_poison','mod_fire_penetration']],
    ['back_2b',17,0,4,['mod_dmg_physical','mod_dash_charge']],
  ];
  b.gear=gear.map(([id,itemLevel,upgradeLevel,sourceQuality,affixes])=>({...createGear(catalog,id),itemLevel,upgradeLevel,sourceQuality,affixes:affixes.map(id=>({id,roll:.5}))}));
  b.progression={mysticSpellPower:paladin?8:1,armorerAttackPower:paladin?4:6,accomplishmentAttributes:{str:15,dex:6,int:12,foc:13,vit:3},spellMasteries:{},weaponMasteries:paladin?{shields:1}:{daggers:2},heroTitles:{title_ranger:17,title_wizard:0,title_mat_gold:7,title_mat_wood:7},townBuffs:{}};
  b.focusSkill=paladin?'weapon:attack_swing_mace':'weapon:attack_2h_daggers';
  return b;
}
