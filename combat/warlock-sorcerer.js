import {descriptor,component,areaContacts,findObjects,bindFields} from './definitions.js';
const periodic=(duration,freq)=>Math.max(0,Math.ceil(duration/freq)-1);
export function resolveWarlockSorcerer(skill,resolved,context={}){
  if(!/^players\/(warlock|sorcerer)\/skills\//.test(skill.source))return null;
  const d=descriptor(skill,resolved),b=resolved.binds||{},add=(label,element,amount,hits=1,flags={})=>component(d,label,element,amount,hits,flags);
  switch(skill.id){
    case 'demons_tail':
      add('Whip impact','physical',b['whip-dmg']);
      d.notes.push('One whip impact. A second terminal explosion overlap is not assumed.');
      d.sources.push('players/warlock/projectiles/demons_tail.inc');
      if(String(b['proj-unit']).includes('_lightning')){
        add('Crackling Lash arcs','lightning',b['whip-dmg']*b['lightning-dmg-mul'],periodic(500,50));
        d.limitations.push('All 50ms lightning searches before the 500ms expiry assumed to find this target within 60 units; path and acquisition can reduce contacts.');
      }
      if(String(b['proj-unit']).includes('_fire')){
        add('One Fiery Lash patch','fire',b['whip-dmg']*b['fire-dmg-mul'],areaContacts(b['fire-area-ttl']));
        d.sources.push('players/warlock/projectiles/demons_tail_lash_fire.unit');
        d.limitations.push('One fire patch under the target for its full lifetime; overlaps with other patches along the whip path omitted.');
      }
      d.limitations.push('Travel and impact overlap are geometry-dependent.');break;
    case 'dark_ritual':{
      const fire=String(b['area-unit']).includes('_fire'),element=fire?'fire':'physical';
      add('Ritual pulses',element,b['area-dmg'],areaContacts(3000));
      add('Completed ritual explosion',element,b['area-dmg']*b[fire?'area-fire-end-dmg-mul':'area-end-dmg-mul']);
      d.durationMs=3000;d.capacityMs=3000;d.sources.push('players/warlock/units/ritual_area.inc','scripts/Behaviors/DangerAreaRitualBehavior.as');
      d.notes.push('Full three-second occupancy and completed ritual. Conflagration replaces physical damage with fire.');d.limitations.push('Leaving the ritual cancels the terminal explosion; bleed stacks and leech buffs omitted.');break;
    }
    case 'soul_vortex':{
      const duration=8000+(b['stack-duration-add']||0),hits=duration/500;
      add('Vortex pulses','physical',b['vortex-dmg'],hits);add('Vortex poison','poison',b['vortex-dmg'],hits);
      if(b['lightning-dmg-mul']){
        add('Vortex lightning strikes','lightning',b['vortex-dmg']*b['lightning-dmg-mul'],duration/250);
        d.sources.push('players/warlock/units/soul_vortex_lightning_strike.unit');
        d.notes.push('Lightning has its own 250ms trigger, distinct from the 500ms physical/poison pulses.');
        d.limitations.push('Every jittered lightning strike is assumed to hit this target; the 48×48 spawn jitter, 24-unit explosion radius and 100–200ms delay are not simulated.');
      }
      d.durationMs=duration;d.capacityMs=duration;d.sources.push('players/warlock/stacks_warlock.sval');
      d.notes.push('One physical and poison pulse per 500ms for the active buff duration.');d.limitations.push('Full target occupancy in the vortex; periodic buff-boundary timing approximated.');break;
    }
    case 'chaos_blade':
      add('Blade contact','physical',b['blade-dmg']);add('Blade lightning','lightning',b['blade-dmg']);
      if(b['projectiles-num']>0){add('One Chaos Arc','physical',b['blade-dmg']*.25);add('One Chaos Arc lightning','lightning',b['blade-dmg']*.25);d.sources.push('players/warlock/projectiles/chaos_blade_projectile.unit');d.limitations.push(`One arc contacts this target out of ${b['projectiles-num']} emitted projectiles; fan overlap and bleed damage omitted.`);}
      d.notes.push('Melee rays hit each victim once; physical and lightning each use blade-dmg.');break;
    case 'summon_fiends':{
      const life=b['fiend-ttl'],attacks=Math.floor(life/400);
      add('Fiend melee over full life','physical',b['fiend-dmg'],attacks,{summon:true});
      if(String(b['fiend-unit']).includes('infernal'))add('Infernal melee fire','fire',b['fiend-dmg']*b['fire-dmg-mul'],attacks,{summon:true});
      d.castMs=100;d.capacityMs=life/(1+(context.stats?.summonCaps?.[b['fiend-unit']]??9)+(context.stats?.summonCaps?.['*']??0));d.durationMs=life;d.sources.push('players/warlock/units/fiend.inc');
      d.notes.push('One fiend per summon; 400ms melee animation with zero configured cooldown; cap ten. Full-life damage divided by the capped replacement cycle models steady state.');
      d.limitations.push('Requires sufficient Essence and surviving fiends already in melee range. AI, ramp-up, Infernal ranged attacks, death explosions and competition between summon attacks omitted.');break;
    }
    case 'static_discharge':{
      const first=findObjects(bindFields(resolved.actions||{},b),v=>v.class==='Damage')[0];
      for(const element of ['physical','fire','ice','lightning'])if(first?.[element])add('Primary discharge contact',element,first[element]);
      d.notes.push('ChainAction deduplicates victims: the fan ray count is coverage, not seven hits on one target.');d.limitations.push('Secondary chains, penetration and retarget contacts are excluded from single-target core damage.');d.sources.push('scripts/Behaviors/Actions/ChainAction.as');break;
    }
    case 'elemental_orb':{
      const hits=periodic(b['proj-ttl'],250),affinity=findObjects(resolved.actions||{},v=>typeof v.projectile==='string').some(v=>/elemental_orb_(fire|ice|lightning)\.unit/.test(v.projectile));
      const specialization=context.build?.specializationId||'',element=affinity?['fire','ice','lightning'].find(e=>specialization.endsWith('_'+e)):null;
      for(const e of element?[element]:['fire','ice','lightning'])add('Orb periodic contact',e,b[element?'proj-dmg-single':'proj-dmg'],hits);
      d.durationMs=b['proj-ttl'];d.sources.push('players/sorcerer/projectiles/elemental_orb.inc');
      d.notes.push('Target stays within the moving orb’s 28-unit pulse radius throughout its lifetime; contacts every 250ms strictly before expiry.');
      d.limitations.push('Spiral secondary projectiles, travel/occupancy and expiry-frame contacts omitted.');break;
    }
    case 'fire_wall':
      add('Flame Wall contacts','fire',b['wall-dmg'],areaContacts(b['wall-ttl']));d.durationMs=b['wall-ttl'];d.capacityMs=d.durationMs;
      d.sources.push('players/sorcerer/projectiles/wall_fire.inc');d.notes.push('One wall segment under the target for its whole lifetime, one entry contact plus 500ms periodic contacts.');d.limitations.push('Overlapping wall segments, movement, dash-spawned walls and Flamewalker buffs omitted.');break;
    case 'ice_frost_nova':
      add('One outward Frost Shard','ice',b['nova-damage']);d.sources.push('players/sorcerer/projectiles/frost_nova.unit');
      d.notes.push(`One of ${b['nova-num']} outward shards contacts the single target; radial emission count is not multiplied into single-target damage.`);d.limitations.push('Returning shards and kill-triggered repeats omitted; additional contact depends on placement and other enemies.');break;
    case 'lightning_ball':
      add('Uncharged ball contact','lightning',b['lightning-dmg']);d.sources.push('players/sorcerer/projectiles/lightning_ball.inc');
      d.notes.push('Minimum projectile intensity (1×), one contact.');d.limitations.push('Charge time/intensity, lifespan-driven recontacts, static areas and intensity decay on later contacts omitted.');break;
    default:d.kind='passive';d.notes.push('Passive/companion effects are not standalone casts. Supported unconditional modifiers are included in other skills; proc/AI rates are not invented.');
  }
  return d;
}
