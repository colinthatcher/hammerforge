import {descriptor,component,areaContacts,findObjects} from './definitions.js';
export function resolveWizardRogue(skill,resolved,context={}){
  if(!/^players\/(wizard|rogue)\/skills\//.test(skill.source))return null;
  const d=descriptor(skill,resolved),b=resolved.binds||{},add=(label,element,amount,hits=1,flags={})=>component(d,label,element,amount,hits,flags);
  switch(skill.id){
    case 'wiz_magic_missiles':
      add('Seeking missiles','physical',b['missile-dmg'],b['projectiles-num']);
      d.notes.push('All seeking missiles reach the single target once; jumps do not create extra contacts with that target.');d.sources.push('players/wizard/projectiles/magic_missile_seeking.unit');break;
    case 'fireball':
      add('Fireball explosion','fire',b['proj-dmg']);d.sources.push('players/wizard/projectiles/fireball.unit');
      d.notes.push('One explosion per cast; no additional direct-collision overlap.');
      if(b['proj-bounces']>0)d.limitations.push(`${b['proj-bounces']} bounce explosions may occur elsewhere; only one explosion contact is counted on this target.`);
      if(b['blastwave-buff']&&b['blastwave-buff']!=='null')d.limitations.push('Vulnerability application and later-hit uptime omitted; the first explosion is included.');break;
    case 'wiz_meteor':{
      const comet=String(b['meteor-unit']).includes('comet'),mul=comet?b['comet-dmg-mul']:1;
      add('One meteor impact','physical',b['meteor-dmg']*mul);add('One meteor elemental impact',comet?'ice':'fire',b['meteor-dmg']*mul);
      d.durationMs=b['meteor-ttl'];d.sources.push('players/wizard/units/meteor_spawner.unit',comet?'players/wizard/units/comet.unit':'players/wizard/units/meteor.unit');
      if(String(b['meteor-unit']).includes('burning')){add('One meteor fire patch','fire',b['meteor-dmg']*b['fire-dmg-mul'],areaContacts(b['area-ttl']));d.sources.push('players/wizard/units/meteor_burning_area.unit');}
      d.notes.push('One impact contacts this target; comet applies its multiplier to both physical and ice.');d.limitations.push('Random spawn positions, additional meteor overlaps and multiple burning patches omitted.');break;
    }
    case 'conjuration_hydras':{
      const heads=findObjects(resolved.actions?.cast,v=>v.class==='SpawnUnit'&&v['unit-bind']==='hydra-unit').length;
      add('First breath burst per hydra',String(b['hydra-unit']).includes('_ice')?'ice':'fire',b['hydra-dmg'],heads*10,{summon:true});
      d.durationMs=b['hydra-ttl'];d.capacityMs=b['hydra-ttl']*heads/(1+(context.stats?.summonCaps?.[b['hydra-unit']]??b['hydra-num-max'])+(context.stats?.summonCaps?.['*']??0));
      d.notes.push(`${heads} hydras, first 1500ms breath burst at one projectile per 150ms. Cap ${1+b['hydra-num-max']} and full source lifetime constrain the replacement cycle.`);
      d.limitations.push('Only the first complete breath burst per head is included. Repeated AI burst scheduling, travel, acquisition and partial final bursts omitted.');d.sources.push('players/wizard/units/conjure_hydra.inc','scripts/Behaviors/Actors/Enemies/Skills/ChannelingSpewSkill.as');break;
    }
    case 'transmutation_haste':d.kind='utility';d.notes.push('Speed/evasion/slow buffs have no direct damage; active Haste uptime is not assumed for other abilities.');break;
    case 'rog_fan_of_knives':
      add('Primary knife contact','physical',b['proj-dmg']);if(b['poison-dmg-mul'])add('Envenomed knife','poison',b['proj-dmg']*b['poison-dmg-mul']);
      d.notes.push(`One first-victim contact out of ${b['proj-num']} emitted knives. Focused Knife damage/crit modifiers are applied separately.`);d.limitations.push('Fan overlap, ricochet and later-victim intensity decay omitted.');d.sources.push('players/rogue/projectiles/rog_throwing_knife.inc');break;
    case 'rog_flurry':{
      const hits=(resolved.timeline||[]).filter((v,i)=>i%2===1&&v==='cast').length;
      add('Flurry mainhand contacts','physical',0,hits,{weaponScale:b['mainhand-dmg-mul']});
      if(b['lightning-dmg']){const shocks=(resolved.timeline||[]).filter((v,i)=>i%2===1&&v==='shock').length;add('Lightning flurry','lightning',b['lightning-dmg'],shocks);d.notes.push(`${shocks} separately scheduled shock actions, one contact on this target per action.`);d.limitations.push('Only the direct lightning contacts are included; other targets/chains omitted.');}
      d.notes.push(`${hits} timeline strikes. Active PlayerDamage uses mainhand scaling; the old flat flurry-dmg tooltip binding is commented out.`);d.limitations.push('Bolas damage-over-time and debuff effects omitted.');break;
    }
    case 'blades_mortal_strike':
      add('Mortal Strike mainhand','physical',0,1,{weaponScale:b['mainhand-dmg-mul']});
      d.notes.push('PlayerDamage scales all mainhand elements; the legacy flat physical-dmg action is commented out.');d.limitations.push('Phantasmal fan links deduplicate targets; no additional chain contact is assumed against the same single target.');break;
    case 'poison_cloud':
      add('Toxic Cloud contacts','poison',b['area-poison-dmg'],areaContacts(b['area-ttl']));d.capacityMs=b['area-ttl'];d.durationMs=b['area-ttl'];d.sources.push('players/rogue/units/toxic_cloud.unit');d.notes.push('Full cloud occupancy, entry plus 500ms periodic contacts. These Damage effects do not set the engine DoT flag and may crit.');d.limitations.push('Movement and corrosion/evasion buffs omitted.');break;
    case 'demolitions_grenade':
      add('Grenade explosion','physical',b['grenade-dmg']);
      if(b['lightning-dmg-mul'])add('Shock contact','lightning',b['grenade-dmg']*b['lightning-dmg-mul']);
      d.sources.push('players/rogue/projectiles/grenade_explode.inc');d.limitations.push('Incendiary ground damage, dash-triggered grenades and chains to other enemies omitted; direct explosion retained.');break;
    default:d.kind='passive';d.notes.push('Passive or companion effect: supported unconditional stat modifiers affect other skills; no arbitrary proc/attack rate is assumed.');
  }
  return d;
}
