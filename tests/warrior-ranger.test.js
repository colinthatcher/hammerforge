import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type: 'json'};
import {resolveWarriorRanger} from '../combat/warrior-ranger.js';

// Local source-style deep merge: dictionaries merge, action/modifier array slots replace
// recursively, and null/empty placeholders preserve the inherited slot.
function merge(base, patch) {
  if (patch === null || patch === '') return structuredClone(base);
  if (Array.isArray(patch)) {
    const out = structuredClone(base ?? []);
    patch.forEach((value, i) => { out[i] = merge(out[i], value); });
    return out;
  }
  if (patch && typeof patch === 'object') {
    const out = structuredClone(base ?? {});
    for (const [key, value] of Object.entries(patch)) out[key] = merge(out[key], value);
    return out;
  }
  return patch;
}
function fixture(id, rank = 1, upgrades = {}) {
  const skill = Object.values(catalog.skills).find(s => s.id === id && /^players\/(warrior|ranger)\/skills\//.test(s.source));
  assert.ok(skill, id);
  let resolved = structuredClone(skill.ranks[rank - 1]);
  for (const [upgradeId, tier] of Object.entries(upgrades)) {
    const upgrade = skill.upgrades.find(u => u.id === upgradeId);
    assert.ok(upgrade?.ranks[tier - 1], upgradeId);
    resolved = merge(resolved, upgrade.ranks[tier - 1]);
  }
  return {skill, resolved, result: resolveWarriorRanger(skill, resolved, {build: {}, catalog, stats: {spellPower: 99999}})};
}
const signature = r => r.components.map(({element, amount, hits}) => [element, amount, hits]);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('every real warrior/ranger rank and named upgrade tier produces a complete descriptor', () => {
  const skills = Object.values(catalog.skills).filter(s => /^players\/(warrior|ranger)\/skills\//.test(s.source));
  assert.equal(skills.length, 20);
  for (const skill of skills) {
    for (let rank = 1; rank <= skill.ranks.length; rank++) {
      const variants = [{}, ...skill.upgrades.flatMap(u => u.ranks.map((_, i) => ({[u.id]: i + 1})))];
      for (const upgrades of variants) {
        const {result: r} = fixture(skill.id, rank, upgrades);
        assert.ok(['damage', 'utility', 'passive'].includes(r.kind), skill.id);
        for (const key of ['components', 'notes', 'limitations', 'sources']) assert.ok(Array.isArray(r[key]));
        assert.ok(r.sources.includes(skill.source));
        assert.ok(r.notes.length);
        if (r.kind === 'damage') assert.ok(r.components.length, skill.id);
        for (const c of r.components) {
          assert.ok(Number.isFinite(c.amount) && c.amount >= 0);
          assert.ok(Number.isFinite(c.hits) && c.hits > 0);
          assert.ok(['physical', 'fire', 'ice', 'lightning', 'poison', 'pure'].includes(c.element));
        }
      }
    }
  }
  assert.equal(resolveWarriorRanger(catalog.skills['players/wizard/skills/wiz_fireball.sval'], {}), null);
  assert.equal(resolveWarriorRanger({id: 'whirling_axes', source: 'players/wizard/skills/fake.sval'}, {}), null);
});

test('axes preserve rank damage, add fire from the active projectile variant, and retain base under omissions', () => {
  assert.deepEqual(signature(fixture('whirling_axes').result), [['physical', 40, 2]]);
  const r = fixture('whirling_axes', 5, {whirling_axes_fire: 3, whirling_axes_return: 1, whirling_axes_culling: 1}).result;
  assert.deepEqual(signature(r), [['physical', 130, 2], ['fire', 104, 2]]);
  assert.ok(r.limitations.some(s => /Culling/.test(s)));
  assert.ok(r.limitations.some(s => /return/.test(s)));
  const {skill, resolved} = fixture('whirling_axes', 3);
  resolved.binds['unknown-upgrade-dmg'] = 500;
  resolved.modifiers = [[{class: 'UnreviewedUpgradeExplosion', physical: 900}]];
  const partial = resolveWarriorRanger(skill, resolved);
  assert.deepEqual(signature(partial), [['physical', 70, 2]]);
  assert.ok(partial.limitations.some(s => /unknown-upgrade-dmg/.test(s)));
  assert.ok(partial.limitations.some(s => /UnreviewedUpgradeExplosion/.test(s)));
});

test('Warcry is utility even with all upgrades; stat passives have no invented damage', () => {
  const r = fixture('warcry', 5, {warcry_weakness: 2, warcry_restore_health: 3, warcry_killing_spree: 1}).result;
  assert.equal(r.kind, 'utility');
  assert.equal(r.durationMs, 8000);
  assert.deepEqual(r.components, []);
  for (const id of ['constitution', 'killing_spree', 'berserker_rage', 'ran_rhythm', 'ran_survivalist']) {
    const p = fixture(id, 5).result;
    assert.equal(p.kind, 'passive');
    assert.deepEqual(p.components, []);
    assert.equal(p.cycleMs, undefined);
  }
});

test('Leap counts landing, five tremors and one full landing fire patch, not both separated patches', () => {
  assert.deepEqual(signature(fixture('berserker_leap').result), [['physical', 120, 1]]);
  const r = fixture('berserker_leap', 5, {leap_tremors: 3, leap_fire: 3}).result;
  assert.deepEqual(signature(r), [['physical', 240, 1], ['physical', 216, 5], ['fire', 96, 9]]);
  assert.equal(r.durationMs, 4000);
  close(r.capacityMs, 4000/101);
  assert.equal(r.components[2].periodic, true);
  assert.ok(r.limitations.some(s => /departure/.test(s)));
});

test('totems use source lifetime, additive cap, delayed pulses and capped replacement cycle', () => {
  const first = fixture('primalist_totem').result;
  assert.deepEqual(signature(first), [['physical', 60, 14]]);
  assert.equal(first.durationMs, 7000); // Tooltip says 6s; actual binding is 7s.
  close(first.capacityMs, 7000 / 3); // add-max-num=2 is added to default one.
  assert.equal(first.components[0].summon, true);
  const frost = fixture('primalist_totem', 3, {primalist_totem_frost: 2}).result;
  assert.deepEqual(signature(frost), [['ice', 80, 16]]);
  assert.equal(frost.capacityMs, 2000);
  const both = fixture('primalist_totem', 5, {primalist_totem_frost: 2, primalist_totem_shock: 2}).result;
  assert.deepEqual(signature(both), [['ice', 100, 20], ['lightning', 40, 20]]);
  assert.equal(both.durationMs, 10000);
  assert.equal(both.capacityMs, 2000);
  assert.ok(both.limitations.some(s => /links/.test(s)));
  assert.equal(first.components[0].amount * first.components[0].hits / first.capacityMs * 1000, 360);
});

test('chains do not multiply a nine-projectile fan into nine hits on one target', () => {
  assert.deepEqual(signature(fixture('tyrant_chains').result), [['physical', 100, 1]]);
  const r = fixture('tyrant_chains', 5, {tyrant_chains_spikes: 3, tyrant_chains_bleeding: 3}).result;
  assert.deepEqual(signature(r), [['physical', 300, 1], ['physical', 60, 1]]);
  assert.ok(r.limitations.some(s => /Bleeding/.test(s)));
  assert.ok(r.limitations.some(s => /overlap/.test(s)));
});

test('Marked Shot retains direct core under conditional upgrades; traps reflect count and extra ice', () => {
  assert.deepEqual(signature(fixture('ran_mark', 5, {ran_mark_big_game: 3, ran_mark_kill: 3}).result), [['physical', 80, 1]]);
  assert.deepEqual(signature(fixture('ran_trap').result), [['physical', 60, 1]]);
  const r = fixture('ran_trap', 5, {ran_trap_multiple: 2, ran_trap_frost: 3, ran_trap_bleeding: 2}).result;
  assert.deepEqual(signature(r), [['physical', 220, 3], ['ice', 220, 3]]);
  assert.ok(r.notes.some(s => /cap is 12/.test(s)));
  assert.ok(r.limitations.some(s => /defaults to one/.test(s)));
  assert.equal(r.durationMs, undefined); // Mines have no configured TTL or ticking damage.
});

test('Rain of Arrows uses unit/action damage and delayed periodic/terminal emissions', () => {
  const first = fixture('marksman_rain_of_arrows').result;
  assert.deepEqual(signature(first), [['physical', 50, 1]]); // Tooltip says 40; source damage is 50. Only one stationary-target strike assumed.
  const r = fixture('marksman_rain_of_arrows', 5, {ran_rain_of_arrows_lightning: 3, ran_rain_of_arrows_size: 2}).result;
  assert.deepEqual(signature(r), [['physical', 200, 1], ['lightning', 600, 1]]);
  assert.equal(r.durationMs, 5600);
  assert.ok(r.limitations.some(s => /overlap/.test(s)));
});

test('Spirit Wolves split actual physical/ice damage, keep base count under retarget/kill upgrades', () => {
  assert.deepEqual(signature(fixture('beasts_spirit_wolves').result), [['physical', 60, 5], ['ice', 60, 5]]);
  const r = fixture('beasts_spirit_wolves', 5, {beasts_spirit_wolves_chain: 2, beasts_spirit_wolves_kills: 2}).result;
  assert.deepEqual(signature(r), [['physical', 100, 7], ['ice', 100, 7]]);
  assert.ok(r.limitations.some(s => /kill rate/.test(s)));
});

test('Entangle includes entry contact plus first-update ticking, source poison, and cap-one cycle floor', () => {
  const first = fixture('nature_entangle').result;
  assert.deepEqual(signature(first), [['physical', 20, 15]]);
  assert.equal(first.durationMs, 7000);
  assert.equal(first.capacityMs, 7000);
  const {skill, resolved, result: r} = fixture('nature_entangle', 5, {nature_entangle_heal: 3, nature_entangle_poison: 3});
  assert.deepEqual(signature(r), [['physical', 60, 23], ['poison', 60, 23]]);
  assert.equal(r.durationMs, 11000);
  assert.ok(r.components.every(c => c.periodic&&!c.dot));
  resolved.cooldown = 1000; // A resolved cooldown reduction cannot multiply a cap-one area's lifetime damage.
  assert.equal(resolveWarriorRanger(skill, resolved).capacityMs, 11000);
});

test('damage passives expose source amounts per event without inventing a repeat rate', () => {
  const strikes = fixture('primalist_strikes', 5, {primalist_strikes_tempest: 3, primalist_strikes_glacial: 3}).result;
  assert.equal(strikes.kind, 'passive');
  assert.equal(strikes.components[0].amount, 0); // Legacy strikes-dmg must not be added.
  assert.equal(strikes.components[0].weaponScale, 1);
  assert.deepEqual(signature(strikes).slice(1), [['lightning', 140, 1], ['ice', 140, 1]]);
  const wind = fixture('nature_wind_weaver', 5, {nature_wind_weaver_winter: 3, nature_wind_weaver_dash: 3}).result;
  assert.equal(wind.components[0].weaponScale, 0.6);
  assert.deepEqual(signature(wind), [['physical', 0, 1], ['ice', 200, 1]]);
  assert.deepEqual(signature(fixture('archery', 5, {archery_frost_arrows: 3}).result), [['ice', 60, 1]]);
  assert.deepEqual(signature(fixture('tyrant_passive', 5, {tyrant_explode: 3}).result), [['physical', 200, 1]]);
  const wolves = fixture('beasts_wolf', 5, {beasts_wolf_pack: 2, beasts_wolf_winter: 3}).result;
  assert.deepEqual(signature(wolves), [['physical', 160, 1], ['ice', 160, 1]]);
  for (const r of [strikes, wind, wolves]) {
    assert.equal(r.kind, 'passive');
    assert.equal(r.cycleMs, undefined);
    assert.ok(r.limitations.some(s => /independently repeatable DPS/.test(s)));
  }
});

test('resolver is deterministic and does not mutate catalog, resolved rank or reserved context', () => {
  const {skill, resolved} = fixture('primalist_totem', 2, {primalist_totem_shock: 1});
  const before = structuredClone({skill, resolved});
  const context = {build: {}, catalog: {}, stats: {}};
  const a = resolveWarriorRanger(skill, resolved, context);
  a.components[0].amount = -1;
  assert.equal(resolveWarriorRanger(skill, resolved, context).components[0].amount, 70);
  assert.deepEqual({skill, resolved}, before);
  assert.deepEqual(context, {build: {}, catalog: {}, stats: {}});
});
