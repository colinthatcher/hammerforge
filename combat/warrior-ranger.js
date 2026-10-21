// Reviewed extracted definitions, not a runtime simulation. Paths below are game resources.
const W = 'players/warrior/';
const R = 'players/ranger/';
const S = 'scripts/Behaviors/';
const present = value => typeof value === 'string' && value !== 'null' && value !== 'dummy' && value !== '';
function effectClasses(value, out = new Set()) {
  if (value && typeof value === 'object') {
    if (typeof value.class === 'string') out.add(value.class);
    for (const child of Object.values(value)) effectClasses(child, out);
  }
  return out;
}

/** Unscaled single-target damage over one cast (or explicitly documented passive event).
 * context is reserved; power, gear, crit and mitigation belong to the caller.
 */
export function resolveWarriorRanger(skill, resolved, context = {}) {
  if (!/^players\/(warrior|ranger)\/skills\//.test(skill?.source ?? '')) return null;
  const b = resolved?.binds ?? {};
  const result = {kind: 'damage', components: [], notes: [], limitations: [], sources: [skill.source]};
  const source = (...paths) => result.sources.push(...paths.filter(present));
  const note = text => result.notes.push(text);
  const limit = text => result.limitations.push(text);
  const add = (label, element, amount, hits = 1, flags = {}) => {
    if (Number.isFinite(amount) && amount >= 0 && Number.isFinite(hits) && hits > 0 && (amount > 0 || flags.weaponScale > 0)) {
      result.components.push({label, element, amount, hits, ...flags});
    } else if (!Number.isFinite(amount) || !Number.isFinite(hits)) {
      limit(`${label}: missing numeric source binding; component omitted.`);
    }
  };
  const passive = text => {
    result.kind = 'passive';
    note(text);
    limit('Passive events have no independently repeatable DPS; no attacks/sec, kills/sec, dash rate or buff uptime is assumed.');
  };
  const bleed = () => {
    if (b['bleeding-stacks'] > 0 && b['bleeding-chance'] > 0) {
      source('tweak/buffs/stacks_actors.sval');
      limit('Bleeding stack damage, refreshes and target-dependent uptime are omitted; direct damage is retained.');
    }
  };
  const area = (ttl, cap = 1) => {
    result.durationMs = ttl;
    result.capacityMs = ttl / cap;
    source(S + 'DangerAreaBehavior.as', S + 'Actors/Player/Player.as');
    note(`Full occupancy for ${ttl}ms; one entry contact plus ${Math.ceil(ttl / 500)} periodic contacts at 500ms intervals, starting on the first update. No extra expiry-frame or re-entry contacts.`);
    limit('Area damage assumes the target remains inside throughout; frame-boundary variation and re-entry damage are omitted.');
    return 1 + Math.ceil(ttl / 500);
  };

  switch (skill.id) {
    case 'whirling_axes': {
      source(b['proj-right-unit'], b['proj-left-unit'], W + 'projectiles/whirling_axe.inc');
      add('Two axes', 'physical', b['physical-dmg'], 2);
      if (String(b['proj-right-unit']).includes('_fire')) add('Fiery axes', 'fire', b['physical-dmg'] * b['fire-dmg-mul'], 2);
      note('One single-target contact per emitted axe (two axes per cast).');
      limit('Curved paths, return travel and repeated contacts are not simulated; the estimate counts only one contact per axe.');
      if (b['culling-chance'] > 0) limit('Culling is conditional current-HP execution against low-health non-bosses; omitted from flat damage.');
      bleed();
      break;
    }
    case 'warcry':
      result.kind = 'utility';
      result.durationMs = 8000;
      source(W + 'buffs_warrior.sval', W + 'stacks_warrior.sval');
      note('Warcry applies an 8-second movement/weapon-speed buff, with optional weakness, healing and Killing Spree stacks; its Explode action contains no Damage effect.');
      limit('Buff/debuff uptime and their contribution to other attacks are not included as independent damage.');
      break;
    case 'berserker_leap': {
      add('Landing', 'physical', b['leap-dmg']);
      note('One landing explosion contact on the target.');
      if (present(b['tremor-unit'])) {
        source(b['tremor-unit']);
        add('Five tremors', 'physical', b['leap-dmg'] * b['tremor-dmg-mul'], 5);
        note('Five delayed tremor explosions (750ms plus up to 250ms random delay); one contact per explosion.');
        limit('Tremor offsets/jitter may prevent all five explosions from overlapping one target.');
      }
      if (present(b['fire-area-unit-land'])) {
        source(b['fire-area-unit-land'], b['fire-area-unit']);
        const ticks = area(4000, 101);
        add('Landing fire area', 'fire', b['leap-dmg'] * b['fire-dmg-mul'], ticks, {periodic: true});
        note('Only the landing fire patch is counted; each patch lasts 4000ms, default summon cap 1 + 100.');
        limit('The separate departure fire patch is omitted: departure and landing need not overlap the same target.');
      }
      break;
    }
    case 'primalist_totem': {
      const ttl = b['totem-ttl'], cap = 1 + (context.stats?.summonCaps?.[b['totem-unit']] ?? b['totem-num-max']) + (context.stats?.summonCaps?.['*'] ?? 0);
      result.durationMs = ttl;
      result.capacityMs = ttl / cap;
      source(b['totem-unit'], W + 'units/totem.inc', S + 'Actors/Player/Player.as', S + 'Actors/Player/PlayerOwnedActor.as', S + 'Actors/Enemies/Skills/CompositeActorUtilitySkill.as', S + 'Actors/Enemies/Skills/CompositeActorSkill.as');
      add('Totem pulses', String(b['totem-unit']).includes('_ice') ? 'ice' : 'physical', b['totem-dmg'], Math.floor(ttl / 500), {summon: true});
      note(`One totem per cast, ${ttl}ms lifetime, cap ${cap} per unit type (default 1 plus totem-num-max). Full-life damage uses the caster repeat cycle with a lifetime/cap capacity floor.`);
      note('Totem utility cooldown starts at 500ms; count pulses at 500, 1000, … through the lifetime boundary (actor updates before TTL death). Frost replaces physical with ice.');
      limit('Requires continuous target acquisition and target occupancy within the 65-unit pulse radius; AI/update delays are not simulated.');
      if ((resolved.actions?.cast ?? []).some(a => a.unit === W + 'units/totem_shock.unit')) {
        source(W + 'units/totem_shock.unit', S + 'BoltShooter.as');
        add('Shock totem bolts', 'lightning', b['totem-dmg'] * b['lightning-dmg-mul'], Math.ceil(ttl / 500), {summon: true});
        note('Shock creates a separate capped unit alongside the pulse totem. Count its immediate bolt and 500ms bolts strictly before expiry.');
        limit('Shock links between totems (250ms raycasts) and a possible expiry-frame bolt are omitted; they depend on placement/frame timing.');
      }
      break;
    }
    case 'tyrant_chains': {
      const fan = (resolved.actions?.cast ?? []).find(a => a.class === 'ShootProjectileFan');
      const count = fan?.projectiles ?? 9;
      source(W + 'projectiles/chains.unit', W + 'projectiles/chains.inc');
      add('One chain contact', 'physical', b['chains-dmg']);
      note(`${count} emitted chains; one chain contacts this single target as the first victim on that path.`);
      limit('The 320-degree fan is coverage, not nine hits on one target. Extra overlap and later-victim 0.9 intensity decay are not simulated.');
      if (b['spikes-num'] > 0) {
        source(W + 'projectiles/spikes.unit');
        add('One chain-end spike', 'physical', b['chains-dmg'] * 0.2);
        note('Every destroyed chain emits spikes-num spikes; each spike is counted once at 20% chain damage.');
        limit('Chain-end spike contact and inherited projectile intensity depend on the chain path; nominal first-contact intensity is used.');
      }
      bleed();
      break;
    }
    case 'ran_mark':
      source(R + 'projectiles/marked_shot_arrow.unit', 'tweak/buffs/status_effects.sval');
      add('Marked Shot', 'physical', b['proj-dmg']);
      note('One projectile/terminal explosion contact per cast.');
      limit('Additional overlap between piercing contact and terminal explosion is omitted. Marked-target damage bonuses, Big Game conditions, healing and pursuit buffs are not included in core damage.');
      break;
    case 'ran_trap': {
      source(R + 'units/bear_trap_throw.unit', b['trap-unit'], R + 'units/bear_trap.inc', S + 'Actors/Player/Player.as');
      add('Trap triggers', 'physical', b['trap-physical-dmg'], b['throw-num']);
      if (String(b['trap-unit']).includes('_ice')) add('Frost traps', 'ice', b['trap-physical-dmg'] * b['ice-dmg-mul'], b['throw-num']);
      note(`One trigger per thrown trap (${b['throw-num']} per cast), assumed consumed before the next cast. Base trap cap is ${1 + b['traps-max']}; no TTL is configured.`);
      limit('Trap placement, target movement and trigger delay are not simulated. Frost unit lacks the base-unit ModifySummons binding, so its source cap defaults to one; sequential triggers are assumed.');
      bleed();
      break;
    }
    case 'marksman_rain_of_arrows':
      source(b['proj-unit'], R + 'projectiles/rain_of_arrows_projectile.inc', R + 'projectiles/rain_of_arrows_bomb.unit', S + 'Projectiles/NewProjectile.as');
      add('One arrow rain strike', 'physical', b['proj-dmg']);
      result.durationMs = 4700;
      note('4000ms carrier emits bombs every 150ms, first after 150ms: 26 emissions before expiry, each exploding 700ms later. One contact per emitted strike; no direct carrier damage. Bomb cap is 1 + 100.');
      limit('Forward-moving strikes occur at different positions: the core estimate counts one strike on the target, not all 26 emissions. Extra overlaps and early carrier destruction are not simulated.');
      limit('Emission counts use ideal continuous-time boundaries; a frame crossing expiry can skip the final periodic emission (notably thunder at 3996ms).');
      if (String(b['proj-unit']).includes('_lightning')) {
        source(R + 'projectiles/rain_of_arrows_thunder.unit');
        add('One thunder strike', 'lightning', b['proj-dmg'] * b['lightning-dmg-mul']);
        result.durationMs = 5600;
        note('Four 999ms periodic thunder emissions plus four terminal emissions at 200/700/1100/1400ms; each has 100ms plus up to 100ms bomb delay, cap 101.');
      }
      break;
    case 'beasts_spirit_wolves':
      source(R + 'projectiles/spectral_wolf.unit');
      add('Spirit wolf impacts', 'physical', b['spirit-dmg'], b['spirit-num']);
      add('Spirit wolf frost', 'ice', b['spirit-dmg'], b['spirit-num']);
      note('One impact per emitted spirit wolf; physical and ice each use spirit-dmg, not the combined tooltip number.');
      limit('Seeking/retargeting and repeat collision contacts are omitted; all emitted wolves are assumed to reach the target once.');
      if (b['chain-chance'] > 0) limit('Relentless Hunters retargets to new targets; no additional single-target chain contacts are assumed.');
      if (b['kill-chance'] > 0) limit('Restless Spirits kill-triggered wolves are omitted without an external kill rate.');
      break;
    case 'nature_entangle': {
      source(b['area-unit'], R + 'units/entangle_area.inc');
      const ticks = area(b['area-ttl']);
      add('Entangle contacts', 'physical', b['area-dmg'], ticks, {periodic: true});
      if (String(b['area-unit']).includes('_poison')) add('Poison Ivy contacts', 'poison', b['area-dmg'] * b['poison-dmg-mul'], ticks, {periodic: true});
      note('Entangle is a non-stacking area with default per-unit cap one; its lifetime is a floor on the caster repeat cycle.');
      if (present(b['area-heal-buff'])) source(R + 'buffs_ranger.sval');
      break;
    }
    case 'primalist_strikes':
      source(S + 'Effects/Damage.as');
      passive('Components describe one successful Tremor Strikes proc, not a cast cycle.');
      add('Tremor mainhand proc', 'physical', 0, 1, {weaponScale: b['mainhand-dmg-mul']});
      note('PlayerDamage explicitly uses mainhand-dmg-mul; the legacy strikes-dmg flat binding is not used.');
      note('PlayerDamage scales all mainhand channels; the caller expands the weaponScale component into those elements.');
      if (b['tempest-chance'] > 0) add('Tempest successful proc', 'lightning', b['procs-dmg-light']);
      if (b['glacial-chance'] > 0) add('Glacial successful proc', 'ice', b['procs-dmg-ice']);
      limit('Elemental upgrades are separate chance-on-melee-hit events; displayed per-success amounts are not summed into automatic DPS. Secondary target arcs are omitted.');
      break;
    case 'nature_wind_weaver':
      source(b['proj-unit'], R + 'projectiles/wind_slash.inc', S + 'Effects/Damage.as');
      passive('Components describe one wind gust contact per successful weapon-hit proc.');
      add('Wind mainhand contact', 'physical', 0, 1, {weaponScale: b['mainhand-dmg-mul']});
      if (b['ice-dmg'] > 0) add('Winter Winds', 'ice', b['ice-dmg']);
      note('Active PlayerDamage uses mainhand ratio, not the commented-out wind-dmg. Winter Winds uses flat ice-dmg, not ice-dmg-mul.');
      note('PlayerDamage scales all mainhand channels; the caller expands the weaponScale component into those elements.');
      if (b['proj-num'] > 0) limit(`Wind Runner emits ${b['proj-num']} gusts on dash; this separate event is omitted without a dash rate/overlap model.`);
      break;
    case 'beasts_wolf':
      source(resolved.unit, R + 'units/wolf.inc', S + 'Actors/Skills/PassiveSummonSkill.as');
      passive('Components describe one companion melee contact, not a summon cast or a 20-second attack cycle.');
      add('Wolf bite', 'physical', b['wolf-dmg'], 1, {summon: true});
      if (String(resolved.unit).includes('_winter')) add('Winter wolf bite', 'ice', b['wolf-dmg'] * b['ice-dmg-mul'], 1, {summon: true});
      note(`Companions have no finite TTL; cap ${1 + b['wolf-add-num']}. The 20000ms passive interval replenishes missing wolves, not their attack frequency.`);
      limit('Companion AI, 175ms castpoint, animation, travel, survival and melee contacts require a separate uptime/attack scheduler.');
      break;
    case 'tyrant_passive':
      passive('Physical bonus and bleeding are modifiers/procs, not repeatable casts.');
      bleed();
      if (b['explode-chance'] > 0) {
        add('Successful kill explosion', 'physical', b['explode-dmg']);
        limit('Explosion is a chance-on-kill event; no extra single-target kills or explosion rate assumed.');
      }
      break;
    case 'archery':
      passive('Bow/crossbow damage, movement and speed modifiers affect other skills.');
      if (b['frost-chance'] > 0) {
        add('Successful Frost Arrows proc', 'ice', b['frost-dmg']);
        note('Frost Arrows is chance-on-hit with a 500ms timeout; amount is per successful proc.');
      }
      break;
    case 'constitution':
    case 'killing_spree':
    case 'berserker_rage':
    case 'ran_rhythm':
    case 'ran_survivalist':
      passive('Stat/conditional stack modifiers have no standalone damage component.');
      if (skill.id !== 'constitution') source(skill.source.startsWith(W) ? W + 'stacks_warrior.sval' : R + 'stacks_ranger.sval');
      break;
    case 'charge':
      add('Uncharged contact', 'physical', b['charge-dmg']);
      note('Minimum charge intensity, one contact; charged intensity and charge time are not included.');
      limit('Charge scaling, movement geometry and trigger upgrades require a charge-duration model.');
      break;
    default:
      result.kind = skill.tags?.includes('passive') ? 'passive' : 'utility';
      limit('This warrior/ranger definition has no reviewed action resolver; no damage is invented.');
  }

  // Unknown future bindings must not erase reviewed base damage or silently appear modeled.
  const known = new Set(Object.keys(skill.ranks?.[0]?.binds ?? {}));
  for (const upgrade of skill.upgrades ?? []) for (const rank of upgrade.ranks ?? []) {
    for (const key of Object.keys(rank.binds ?? {})) known.add(key);
  }
  for (const key of Object.keys(b)) if (!known.has(key)) limit(`Unreviewed binding ${key}: additional effects omitted; reviewed base components retained.`);
  const knownClasses = effectClasses([skill.ranks ?? [], (skill.upgrades ?? []).map(u => u.ranks)]);
  for (const cls of effectClasses(resolved)) if (!knownClasses.has(cls)) limit(`Unreviewed effect ${cls}: additional effects omitted; reviewed base components retained.`);
  if (result.kind === 'damage' && !result.components.length) limit('No numeric damage component could be resolved from the supplied source bindings.');
  result.sources = [...new Set(result.sources)];
  return result;
}
