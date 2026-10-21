import {descriptor,component,areaContacts,directEffects} from './definitions.js';
export function resolvePaladinPriest(skill,resolved,context={}){
  if(!/^players\/(paladin|priest)\/skills\//.test(skill.source))return null;
  const d=descriptor(skill,resolved),b=resolved.binds||{};
  const add=(label,element,amount,hits=1,flags={})=>component(d,label,element,amount,hits,flags);
  switch(skill.id){
    case 'pal_blessed_strikes':
      add('Blessed impact','physical',b['strike-dmg']);
      if(b['fire-dmg-mul']){add('Burning ground','fire',b['strike-dmg']*b['fire-dmg-mul'],areaContacts(4000));d.sources.push('players/paladin/units/blessed_strike_fire_area.inc');d.limitations.push('All 4-second fire-patch contacts assumed; target movement and overlapping patch placement are not simulated.');}
      if(b['lightning-mul']){add('Initial lightning-upgrade contact (physical in source)','physical',b['strike-dmg']*b['lightning-mul']);d.limitations.push('The first lightning-upgrade link uses physical damage in the source; secondary lightning links to new targets omitted.');}
      break;
    case 'pal_lay_on_hands':case 'holy_banner':d.kind='utility';d.notes.push('Healing, protection or ally/target buffs; no independent damage.');break;
    case 'pal_judgement':{
      const hits=Math.min(7,b['stacks-num']);add('Judgement hammers','physical',b['judgement-dmg'],hits);
      if(b['lightning-dmg-mul'])add('Judgement lightning','lightning',b['judgement-dmg']*b['lightning-dmg-mul'],hits);
      d.durationMs=hits*1000;d.capacityMs=d.durationMs;
      d.notes.push('One hammer per second, capped at seven stacks by stacks_paladin.sval; all hammers target this enemy.');
      d.limitations.push('Kill-based stack extensions and random target selection omitted; buff-boundary timing approximated.');d.sources.push('players/paladin/stacks_paladin.sval','players/paladin/units/judgement.inc');break;
    }
    case 'divine_pillars':{
      // Keep the one central pillar guaranteed at the caster; outward recursive
      // patterns are distinct positions, not 5/21/85 hits on one target.
      add('Central pillar','physical',b['pillar-dmg']);
      if(b['lightning-mul'])add('Central pillar lightning','lightning',b['pillar-dmg']*b['lightning-mul']);
      d.notes.push('One central pillar contact on a target inside its 40-unit radius.');
      d.limitations.push('Outward pillar-pattern overlaps are not counted on this single target; pattern upgrades increase area coverage, not this core contact count.');d.sources.push('players/paladin/units/pillar_of_light.inc','players/paladin/units/pillar_of_light_spawner_1.inc');break;
    }
    case 'radiance_immolation':
      add('Uncharged fire nova','fire',b['immolation-dmg']);
      if(b['lance-mul']){add('Blazing lance contact','fire',b['immolation-dmg']*b['lance-mul']);d.sources.push('players/paladin/projectiles/zealous_lance.unit');}
      d.notes.push('Minimum charge intensity (1×), one nova and one optional lance contact.');d.limitations.push('Charge-duration damage scaling and Fuel the Flames buff contribution omitted.');break;
    case 'inner_light':
      directEffects(d,b['explode-effects'],b,'Inner Light burst');
      d.notes.push('One burst contact. Blindness does not directly change damage.');
      if(b['orb-damage'])d.limitations.push('Chance-spawned Celestial Light orb attacks are omitted; burst damage remains included.');
      if(b['explode-buff2'])d.limitations.push('Shattering Light vulnerability uptime omitted; burst damage retained.');break;
    case 'consecrated_ground':
      add('Consecrated Ground pulses','physical',b['area-dmg'],Math.ceil(b['area-duration']/500));d.durationMs=b['area-duration'];d.capacityMs=d.durationMs;
      d.notes.push('Target stays inside for the full duration; periodic 500ms contacts, no entry damage.');d.limitations.push('Healing and conditional effects on other skills omitted; update-boundary timing approximated.');d.sources.push('players/priest/units/consecrated_ground.inc','scripts/Behaviors/DangerAreaPriestCircle.as');break;
    case 'holy_blast':{
      const channel=resolved['channel-time']?.[0]||800,period=resolved.interval||200;
      const speed=(context.stats?.castSpeed||1)*(context.stats?.skillSpeed||1)*(resolved['cast-speed-mul']??1),hits=Math.floor(channel*speed/period);
      add('Minimum-charge beam physical','physical',b.damage,hits);
      add('Minimum-charge beam fire','fire',b.damage,hits);
      d.castMs=resolved['charge-time']||300;d.fixedCastMs=channel+(resolved['end-fx-time']||0);d.durationMs=channel;
      d.notes.push('Minimum charge/channel, first enemy in the beam. Pulse cadence uses the cast-speed update clock; channel/end timers divide that clock back to wall time.');
      d.limitations.push('Analytical charged-beam timing: cooldown placed conservatively after channel/end. Longer charging, parent-animation termination, frame quantization, penetration decay and Consecrated Ground bonus omitted.');d.sources.push('scripts/Behaviors/Actors/Skills/ShootChargedBeam.as');break;
    }
    case 'flagellate':
      add('Flail contact','physical',b['flagellate-dmg']+Math.trunc((context.stats?.thorns||0)*b['flagellate-thorns-dmg-mult']));
      d.notes.push('Melee rays deduplicate the target: one contact, including modeled Thorns scaling.');
      if(b['bleed-stacks'])d.limitations.push('Bleeding and Ecstasy stack uptime omitted.');break;
    default:
      d.kind='passive';d.notes.push('Passive, conditional or companion effects have no standalone cast cycle. Supported unconditional stat modifiers are applied to other abilities.');
      if(skill.id==='celestial_orbs'){add('Orb beam contact','fire',b.damage);d.limitations.push('Companion/orb autonomous targeting and conditional extra-orb rates require a separate scheduler.');}
  }
  return d;
}
