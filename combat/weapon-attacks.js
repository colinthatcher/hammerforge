import {elements,bindFields} from './definitions.js';

// Reviewed core contacts, not a trajectory/proc or resource simulation.
export function resolveWeaponAttack(skill,resolved,{catalog,stats}){
  if(!skill.weaponAttack)return null;
  const result={kind:'damage',components:[],notes:[],limitations:[],sources:[skill.definitionSource,'scripts/Items/Equipment.as','scripts/Data/Player.as','scripts/Behaviors/Effects/Damage.as','scripts/Behaviors/Actors/Skills/PlayerSkill.as','scripts/Behaviors/Actors/Skills/PlayerSkillDirectional.as','scripts/Behaviors/Actors/Skills/PlayerSkillDirectionalChannelling.as','scripts/Behaviors/Actors/Skills/ShootBeam.as']};
  const limit=text=>result.limitations.push(text),note=text=>result.notes.push(text);
  const effects=(d,prefix='')=>d[`${prefix}effects`]||d[`${prefix}effect`]||[];
  const list=v=>Array.isArray(v)?v:[v];
  const clock=stats.attackSpeed,skillSpeed=stats.skillSpeed*(resolved['cast-speed-mul']??1),speed=clock*skillSpeed;
  const cooldown=(resolved.cooldown??0)*stats.cooldownMultiplier/(1000*clock);
  function add(part){
    const existing=result.components.find(c=>c.label===part.label&&c.element===part.element&&c.weaponScale===part.weaponScale&&c.hand===part.hand&&c.armorPenetration===part.armorPenetration&&c.amount===part.amount);
    if(existing)existing.hits+=part.hits;else result.components.push(part);
  }
  function walk(raw,hits,label,intensity=1,chain=[]){
    const entries=list(raw).filter(Boolean).map(v=>bindFields(v,resolved.binds||{}));
    const penetration=entries.filter(e=>e.class==='DamagePenetration').reduce((p,e)=>1-(1-p)*(1-(e.armor??0)*intensity),0);
    for(const e of entries){
      if(e['intensity-set']!==undefined)intensity=e['intensity-set'];
      if(e['intensity-mul']!==undefined)intensity*=e['intensity-mul'];
      if(e.conditional||e.conditionals||e.chance!==undefined&&e.chance<1){if(e.class)limit(`${label}: conditional/chance ${e.class} effect omitted.`);continue;}
      if(e.class==='PlayerDamage')add({label,element:'physical',amount:0,hits,weaponScale:(e.mul??1)*intensity,hand:e['off-hand']?'offhand':'mainhand',armorPenetration:penetration,dot:e.dot===true});
      else if(e.class==='Damage'){for(const element of elements)if(e[element]>0)add({label,element,amount:e[element]*intensity,hits,armorPenetration:penetration,dot:e.dot===true});}
      else if(['MeleeSwing','Explode','Hitscan','Nova'].includes(e.class))walk(effects(e),hits,label,intensity,chain);
      else if(['ShootProjectile','ShootProjectileFan','SpawnUnit'].includes(e.class)){
        if(e['ignore-shoots']){limit(`${label}: intermittent secondary projectile emissions and their geometry-dependent damage are omitted.`);continue;}
        if(e.class==='ShootProjectileFan'&&e.projectiles>1)limit(`${label}: projectile fan counts one projectile on this single target, not all ${e.projectiles}.`);
        if(e.jitter||e.spread||e.offset)limit(`${label}: projectile spread/offsets or spawn jitter may prevent modeled contacts.`);
        resource(e.projectile||e.unit,hits,label,intensity,chain);
      }else if(e.class==='HitscanRandomEnemy')limit(`${label}: secondary-target arcs are omitted.`);
      else if(['ApplyBuff','AddStacks'].includes(e.class))limit(`${label}: automatic debuff/affliction application and uptime are omitted; select supported enemy conditions manually.`);
      else if(e.class&&!['PlaySound','SpawnEffect','DamagePenetration','Suicide','PlayerHeal','PlayerMana'].includes(e.class))limit(`${label}: ${e.class} behavior is not included in core damage.`);
    }
  }
  function resource(path,hits,label,intensity,chain){
    if(chain.includes(path)||chain.length>12){limit(`${label}: recursive spawned effects omitted.`);return;}
    const r=catalog.weapons.resources[path];
    if(!r||r.unsupported){limit(`${label}: resource ${path} is not a reviewed literal damage path.`);return;}
    result.sources.push(path);const next=[...chain,path];
    for(const b of r.behaviors){
      if(['NewProjectile','RayProjectile'].includes(b.class)){
        const primary=effects(b,'hit-'),direct=list(primary).filter(Boolean);
        const base=direct.length?primary:effects(b);
        if(list(base).length)walk(base,hits,label,intensity,next);
        else {
          const terminal=effects(b,'destroyed-');
          const damagingTerminal=list(terminal).some(e=>e?.class==='Explode'||e?.class==='PlayerDamage');
          if(damagingTerminal)walk(terminal,hits,label,intensity,next);
          else {
            const bounce=(b.modifiers||[]).find(m=>m.class==='Projectile::GroundBouncing');
            if(bounce){walk(effects(bounce),hits,label,intensity,next);limit(`${label}: one moving ground-bounce explosion contact counted; other overlap is omitted.`);}
          }
        }
        if((b.modifiers||[]).some(m=>m.class==='Projectile::PeriodicEffect'))limit(`${label}: moving projectile periodic contacts are omitted.`);
        if(b.penetration>0||b.bounces>0)limit(`${label}: only the first target contact is modeled; repeat hits, chains, later-victim intensity and extra bounce/terminal overlap are omitted.`);
      }else if(b.class==='BombBehavior'){
        walk(b.actions||[],hits,label,intensity,next);
        if(b['delay-random'])limit(`${label}: bomb timing jitter is not scheduled.`);
      }else if(b.class==='OwnedTripMineP'){
        for(const s of b.skills||[])if(s.class==='CompositeActorTriggeredSkill'&&s.trigger==='OnDeath')walk(s.actions||[],hits,label,intensity,next);
        limit(`${label}: assumes each glyph triggers before the next cast; trap occupancy, placement and replacement are not simulated.`);
      }else if(b.class==='DangerAreaBehaviorP'){
        walk(effects(b),hits,label,intensity,next);
        limit(`${label}: one area contact counted; full-duration periodic exposure and overlapping areas are not simulated.`);
      }else limit(`${label}: ${b.class} unit behavior omitted.`);
    }
  }
  const action=(name,hits,intensity=1)=>walk(resolved.actions?.[name]||[],hits,'Weapon contact',intensity);
  if(resolved.class==='Skills::PlayerSkillDirectionalChannelling'){
    result.sources.push('scripts/Behaviors/Actors/Skills/PlayerSkillDirectionalChannelling.as');
    const duration=resolved['cast-time-max']?resolved['cast-time-max']/1000:null;
    const timelines=resolved['timelines-looping']||[];
    if(duration){
      for(const timeline of timelines){const period=Math.max(...timeline.filter((v,i)=>i%2===0));for(let i=0;i<timeline.length;i+=2){const contacts=Math.max(0,Math.floor((duration*1000*speed-timeline[i])/period)+1);if(contacts)action(timeline[i+1],contacts);}}
      result.timing={interval:duration+cooldown,castTime:duration,cooldown,duration};
      note(`Maximum ${duration}s wall-time channel followed by cooldown. Contacts follow the looping attack-speed clock.`);
      limit('Channel counts use ideal timing boundaries; an expiry-frame contact may vary by one hit. Resource exhaustion and early release are omitted.');
    }else {
      const period=Math.max(0,...timelines.flatMap(t=>t.filter((v,i)=>i%2===0)));
      for(const timeline of timelines)for(let i=1;i<timeline.length;i+=2)action(timeline[i],1);
      result.timing={interval:period/(1000*speed),castTime:period/(1000*speed),cooldown,duration:null,continuous:true};
      note('Continuous held channel; DPS is the repeating active-channel cycle. Release/restart downtime is not assumed.');
    }
  }else if(resolved.class==='Skills::ShootBeam'){
    walk(effects(resolved),1,'Beam contact');
    const interval=(resolved.castpoint||0)/(1000*speed);
    result.timing={interval,castTime:interval,cooldown,duration:null,continuous:true};
    note('Beam contacts follow castpoint, not the release cooldown. Continuous first-target beam contact is assumed.');
    if(resolved['buildup-time']>0)limit('Beam uses fully built-up intensity; startup ramp and release/restart downtime are omitted.');
    if(resolved['periodic-effects'])limit('Secondary periodic beam arcs are omitted.');
  }else if(resolved.class==='Skills::Charge'){
    walk(effects(resolved,'hit-'),1,'Charge contact');
    result.timing={interval:cooldown,castTime:0,cooldown,duration:null};
    limit('One charge collision is counted per cooldown; travel, wall collisions and post-charge recovery are omitted.');
    result.sources.push('scripts/Behaviors/Actors/Skills/Charge.as');
  }else {
    const timeline=resolved.timeline||[];
    const charged=resolved.class==='Skills::PlayerSkillDirectionalCharged';
    const chargeTime=charged?(resolved['charge-time']||0):0;
    const intensity=charged?(resolved['intensity-range']?.[1]??1):1;
    for(let i=0;i<timeline.length;i+=2)action(timeline[i+1],1,intensity);
    let release=Math.max(resolved['anim-length']||0,...timeline.filter((v,i)=>i%2===0),0);
    if(!resolved['anim-length'])limit('Release animation duration is unavailable; the source timeline is a lower-bound recovery estimate.');
    const castTime=(chargeTime+release)/(1000*speed);
    result.timing={interval:castTime+cooldown,castTime,cooldown,duration:null};
    note('Full source animation/charge followed by cooldown; uses the attack type’s mainhand/offhand speed clock. Stationary, no animation cancellation.');
    if(charged){note('Fully charged release at charge-time, not an uncharged tap.');result.sources.push('scripts/Behaviors/Actors/Skills/PlayerSkillDirectionalCharged.as');}
  }
  if(!result.components.length&&skill.tags.includes('shield')){result.kind='utility';note('Shield attack applies control/defense without a source damage component.');}
  note('Weapon attacks use attack power, Dexterity-based weapon criticals and explicit mainhand/offhand damage channels. Spell-power and spell-only bonuses do not apply.');
  note('Each modeled contact assumes the target is in range and inside the full-damage part of the hit area; no travel or distance-falloff simulation.');
  limit('Automatic weapon-hit procs, bleeding, status application and conditional target bonuses are not simulated.');
  result.notes=[...new Set(result.notes)];result.limitations=[...new Set(result.limitations)];result.sources=[...new Set(result.sources)];
  return result;
}
