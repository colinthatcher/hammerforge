# Core calculation model

The planner now calculates **core damage**, rather than displaying all non-Wizard skills as unsupported. Core damage is the explicitly listed, source-reviewed subset of each skill's damage under documented contact assumptions. It is **not** a complete combat simulation or a claim of runtime-validated game DPS.

## Class coverage

| Class | Damaging class spells | Utility spell |
| --- | --- | --- |
| Warrior | Whirling Axes, Leap, Ancient Totems, Chains | War Cry |
| Paladin | Blessed Strike, Judgement, Divine Pillars, Immolation | Lay on Hands |
| Ranger | Marked Shot, Trap, Rain of Arrows, Spirit Wolves, Entangle | — |
| Wizard | Magic Missiles, Fireball, Meteor Shower, Conjure Hydras | Haste |
| Rogue | Fan of Knives, Flurry of Blades, Mortal Strike, Toxic Cloud, Grenade | — |
| Warlock | Demon's Tail, Dark Ritual, Summon Fiends, Soul Vortex, Chaos Blade | — |
| Sorcerer | Discharge, Elemental Orb, Flame Wall, Frost Nova, Lightning Ball | — |
| Priest | Inner Light, Consecrated Ground, Holy Blast, Flagellate | Holy Banner |

The catalog's 40 passive/companion entries have no independent **cast** DPS. Supported unconditional stat modifiers feed damaging abilities. Proc rates, companion AI and buff-stack uptime are not invented. Some passive definitions expose source per-event components internally; these are not automatically summed into standalone DPS.

Statuses distinguish a source-derived estimate, a **partial estimate** with exclusions, utility, passive, unlearned, missing weapon, conflicting upgrades, and unsupported mechanics. Unknown gear/trinket effects no longer erase reviewed core damage; their exclusions remain visible. This also means a zero modeled gear delta is not a claim that an excluded proc has no in-game value.

## Rank and modifier resolution

Evidence: `scripts/Behaviors/Actors/Player/PlayerBase.as:165–249` and `scripts/Behaviors/Actors/Modifiers/Modifiers.as:707–773`.

- Resolve base definition plus **the selected rank override**, not all previous ranks.
- Resolve each selected named upgrade's base plus its chosen tier, in source declaration order.
- Preserve indexed modifier slots when a null placeholder inherits an earlier slot. Empty replacement slots and flat modifier arrays retain their source meanings.
- Honor an upgrade's replacement skill tags for tag-filtered modifiers.
- Detect catalog `blocked-by-skills` conflicts and withhold the estimate for an incompatible selection.

The catalog preserves original `rankOverrides`, normalized rank views, replacement tags and blocked-upgrade IDs. The text parser still does not execute the entire game preprocessor. Explicit handlers account for reviewed actions hidden in macros, notably Mortal Strike; unreviewed conditions remain excluded.

## Combo snapshots and Nova

Combo choices and ranks are extracted from `players/shared/skills/combo_choices.sval` and `combo_levlable.sval`. `ComboSkill.as` pulses Nova every 1000 ms while combo is active; rank changes the projectile fan (8/12/16/20/24), not its pulse frequency. We assume one projectile contact per pulse against the target. Combo Nova is a separate partial core estimate and is not aggregated into the focused ability or its TTK.

`players/shared/projectiles/combo_nova.unit` has fixed 15 physical damage plus a separate `physical-bind: combo-dmg` effect. Only the fixed damage is included in the current core estimate. `ConvertCustomStat` adds 0.75 × Vitality (Bull Rage) or Focus (Clear Mind). The extracted `CustomPlayerStat` initializes both `mul` and `mulSum` to 1, and `Finalize()` multiplies by their sum, producing a source binding of 1.5 × attribute in the absence of other modifiers. This surprising finalization is reported, not silently replaced by tooltip arithmetic. Conversion from that float binding into `Damage`'s `GetParamInt` parameter is not verified, so the additional damage remains an explicit exclusion rather than a guessed integer result.

`PlayerBase.as:788–907` classifies combo damage separately: spell power and spell damage multipliers apply, but its ordinary spell critical roll/multiplier block is commented out. Marked can flag a critical event without granting ordinary spell-critical damage. Supported physical/elemental bonuses, target armor/penetration and Vulnerability use the existing rounded core damage pipeline. Cast and attack speed do not shorten the fixed pulse timer.

`buffs_combo.sval:damage` supplies a 1.1 damage multiplier for 10 seconds on activation when Bursting Damage is learned. Its manual active-buff state is independent from combo-active because it can outlast combo. Speed is movement-only; protection, recovery, Combo Gasket/Hex procs and automatic scheduling are not modeled as damage. Activation thresholds (10 kills, 3 dashes or 6 parries/evades), obtain windows (1.5/2/1.5 seconds), sustain window (3.5 seconds plus Combo Duration rank) are reference values, not a live event simulation. Conflicting selections and invalid ranks are rejected; older builds without combo settings remain off.

## Stats and gear

Evidence: `scripts/Data/Player.as`, `scripts/Behaviors/Actors/Modifiers/{StatModifier,SkillModifier,Modifiers,Damage}.as`, and the selected class definition.

- Source class base attributes and per-level growth, allocated/elixir attributes, and equipped attribute modifiers.
- Supported unconditional passive modifiers from learned ranks. For example, Arcane Intellect's Intelligence conversion changes the derived spell power and critical stats.
- Class-specific attribute-to-spell-power factors, plus flat spell-power modifiers and supported stat conversions.
- Intelligence-based critical chance/damage formulas; independent chance bonuses combine as `1 − (1 − a)(1 − b)`.
- Supported spell/skill critical bonuses, cast speed, damage multipliers, per-element additions, physical penetration and summon damage/caps.
- Per-skill filters match ID/type and use the source's any-overlapping-tag semantics.
- Mainhand/offhand raw damage channels, source attribute-based weapon damage, and role-specific placement. `PlayerDamage` uses those raw channels, then the owning spell's power/critical path; it does not add a commented legacy flat tooltip amount.
- Imported item intensity is `(itemLevel + upgradeLevel − 1) / 9`, without clamping. Integer additions round; `StatBasedDamage` truncates its derived integer contribution as in the source.
- Trinket copy counts and replacing attuned modifiers. Saved shadow curses support per-curse conversions when present; missing counters are reported rather than invented.

Supported health/Thorns conversions feed Flagellate. Other current-resource, low-health, enemy-tag, buff and stack conditions require state that the fixed-target planner does not simulate, so they appear as exclusions.

## Damage expectation and mitigation

Evidence: `scripts/Behaviors/Effects/Damage.as`, `scripts/Behaviors/Actors/Player/PlayerBase.as:788–940`, `scripts/Behaviors/Armor.as`.

For each elemental component:

1. Resolve the source damage amount and count under the handler's contact assumption. Weapon-scaled portions expand into all nonzero raw mainhand elements and truncate at the `PlayerDamage` stage.
2. Apply the source power factor `(200 + SpellPower) / 200` and supported global, per-skill, elemental and summon modifiers.
3. Round normal and critical channels **separately**, retaining the game's minimum of one for a positive sub-one channel.
4. Apply target defense to each matching damage channel: physical armor uses `1 / (1 + armor × (1 − penetration) × 0.005)`; elemental resistance uses the corresponding elemental penetration. Round defense before Vulnerability. Matching positive penetration reduces defense, while negative defense amplifies damage as armor does. The planner's armored target has 50 physical armor and 0 elemental resistance; the normal target has 0 defense.
5. Expected hit is the probability-weighted normal/critical result. Multiply by that component's contacts, then divide by the repeat cycle. The inspector displays every component and sums their damage/DPS.

Periodic contact is not synonymous with the engine's `DoT` flag. Many area definitions use ordinary `Damage` effects and may crit. Only explicit `dot=true` takes the non-critical/DoT path.

## Timing and persistence

Evidence: `Player.as:1513–1534`, `Skills/PlayerSkillDirectional.as`, `Skills/PlayerSkillPosition.as`, `Skills/ActiveSkill.as`.

For the reviewed full-animation directional/position cast policy:

```text
cast = max(animation duration, timeline duration)
       / (cast speed × per-skill speed × cast-speed-mul)
cooldown = base cooldown × per-skill cooldown multiplier / cast speed
repeat cycle = cast + cooldown
```

These classes establish cooldown at deactivation, and their updates receive the player cast-speed clock. Legacy `ActiveSkill` subclasses such as Fireball establish cooldown on activation, so their repeat model uses overlapping cast/cooldown rather than summing them.

This is still an analytical approximation: frame quantization, animation cancellation, target acquisition, and charged/channel execution are not runtime-scheduled. Holy Blast accounts for its pulse clock separately from the channel/end wall-time timers, with a conservative cooldown-after-channel policy; parent-animation termination remains approximate. When an animation duration is absent, the castpoint lower bound is identified as a limitation. Charged skills use explicitly stated minimum-charge policies.

Persistent capped areas/summons additionally impose a wall-time lifetime/cap floor. Their modeled lifetime damage is spread across the constrained replacement cycle instead of multiplying that damage indefinitely with cast speed. Summon Fiends assumes ideal melee uptime over its lifetime; it is a steady-state core estimate requiring sufficient Essence, not a ramp-up simulation. Hydra core damage currently includes one complete first breath burst per spawned head, not all repeated AI attacks.

## Contact assumptions and exclusions

- **Seeking projectiles:** Magic Missiles and Spirit Wolves assume each emitted seeking projectile reaches the target once. Mixed elemental channels are separate components, not additional casts.
- **Wide fans/patterns:** Chains, Frost Nova, Fan of Knives and the central Divine Pillar count a core target contact, not every ray/projectile in a radial/fan/pattern emission. Rain of Arrows and Meteor Shower count an explicitly stated core strike/impact; additional positional overlaps are omitted.
- **Areas:** stated full occupancy and source cadence, including or excluding entry contact according to the unit definition. Boundary-frame variation is disclosed.
- **Source quirks:** Flurry/Mortal Strike use active weapon scaling rather than commented flat damage; Blessed Strike's initial lightning-upgrade link is physical in this build's source. Shocking Assault schedules three separate shocks. Soul Vortex lightning triggers every 250ms, independently of its 500ms physical/poison pulses.
- **Jittered lightning:** Soul Vortex's included lightning assumes each spawned strike hits; spawn jitter, small radius and delay can reduce actual contacts and are listed explicitly.
- **Conditional upgrades:** Fireball retains its first explosion when bounce/vulnerability behavior is excluded. The number is labeled partial, rather than zeroing the skill or pretending all bounces hit the same target.
- **Unmodeled systems:** bleed/other affliction stack simulation, general triggered trinkets, kills/hits-per-second for passive procs, dynamic buff/stack uptime, sets, town progression beyond the supported Mystic/Armorer/accomplishment-attribute/mastery/title/Tavern/Chapel settings, resources, target movement and rotation competition.

`catalog.targets` defines the normal target (0 defense) and armored target (50 physical armor, 0 elemental resistance), each with 10,000,000 health. Builds without `targetId`, or with `targetId: "generic"`, retain the legacy generic target of 10,000 health and optional 100 physical armor (otherwise 0). An explicit target selection drives TTK, comparisons and combo calculations; the observed green-robed magic target is selectable, not inferred from a save. Core TTK is health divided by sustained core DPS and does not include an opening-cast or mana-exhaustion schedule.

## Town progression and active town buffs

`catalog.progression` contains literal source definitions with original file hashes. `combat/progression.js` supplies their modifiers to the existing stat/filter pipeline before derived spell power. Reviewed engine evidence is recorded alongside the definitions.

- **Mystic:** `tweak/town/shops/mystic.sval` supplies 15 cumulative spell-power steps. The build stores 0 for none, otherwise a one-based purchased tier; native `shop-upgrades` triplets store a zero-based step. Only the selected step's modifiers apply at intensity 1, matching `PlayerRecord::RefreshModifiers`.
- **Armorer:** `tweak/town/shops/armorer.sval` supplies 21 cumulative attack-power steps. `progression.armorerAttackPower` uses the same zero/one-based planner convention as Mystic; native `armorer` / `attack-power` shop hashes map the selected saved step. Tier 13 grants +65, not the sum of tiers 1–13. Old builds lacking this field receive no bonus.
- **Accomplishment attributes:** `progression.accomplishmentAttributes` stores separate integer `str`, `dex`, `int`, `foc`, `vit` bonuses (0–10000 each). Reviewed `Modifiers::BuildStats` adds town accomplishment rewards to all five attributes before derived stats. Native H2SV import derives these bonuses from the observed town-stat tuple schema and literal source thresholds, stacking thresholds inclusively. Missing individual stats initialize to zero as in `Stats.InitializeCollection`; a missing or unsupported collection produces a warning and permits manual fallback. The planner feeds totals into `StatAdd` before attribute conversions, separate from allocated/elixir values. An absent field on older builds/exports means five zeros. JSON export/copy preserves the bonuses. This import does not decode donation-title levels.
- **Spell masteries:** all six entries in `tweak/town/spell_masteries.sval` use saved `weapon-masteries` triplets. Intensity equals mastery level, without clamping to the range endpoint: `[1, 1.04]` becomes `1 + 0.04 × level`. General and matching element filters apply independently and multiply through `BaseSkillModifier`.
- **Spell-related titles:** Wizard and Logger use `tweak/town/hero_titles.sval` at intensity `level / 10`. Wizard yields +3 spell power per level, Logger yields a `1 + 0.005 × level` spell-damage multiplier. Native import derives the Wizard level from the highest matching character in the profile, including specializations. Logger donation metadata imports `donationStat` and `divisor` from TownRecord; level is `int(sqrt(chapel-revive-X / divisor) + .5)`, with divisors 3000 (gold) and 10 (wood). A saved 150316 gold and 516 wood yields level 7 for each title, or +3.5% attack and spell damage.
- **Town buffs:** Tavern/Chapel definitions are selectable one per source set and saved active mission buffs are mapped by hash. Supported modifiers apply at intensity 1. Top-level purchase/unlock conditions are not damage conditions; modifier-level target/health conditions remain excluded explicitly. Buff uptime, resource costs, and unsupported conversions/procs are not simulated.

The new optional `progression` build field is validated, copied and exported with version-2 builds, including supported Mystic/Armorer purchases and accomplishment bonuses. Missing fields on older exports mean no progression bonus, avoiding retroactive guesses. Native import auto-maps only Mystic spell-power and Armorer attack-power purchases; other town upgrades remain unmodeled. Selected progression source files and reviewed engine paths appear in the inspector's calculation sources.

## Equipment-linked weapon attacks

`catalog.weapons` contains 68 definitions referenced explicitly by equipment `skill`, `skill-secondary` and their epic variants. Definition IDs have planner keys `weapon:<id>`; their provenance is the original attacks file, not that synthetic key. Unreferenced/experimental attacks are not selectable. `Equipment::GetSkill/GetSecondarySkill` selects epic definitions only for Epic quality (saved bit value 8), otherwise standard definitions. The equipment editor allows an explicit standard/epic variant for manually built items.

`combat/weapon-attacks.js` follows source timelines and reviewed direct effect containers. It uses literal projectile/bomb/glyph resources, while keeping on-hit, miss and destruction paths distinct to avoid double counting. Melee swings/hitscans count one contact per target, not one per ray. Fanned projectiles count one first-victim projectile; separately scheduled strikes are counted from their timeline. Conditional/chance effects, trigger modifiers, moving periodic projectile contacts and secondary-target arcs are excluded with per-ability limitations. Shield bash/charge have no numeric damage and remain utility.

Weapon attacks select attack power, weapon Dexterity criticals (`BaseWeaponCritDamage` plus `GetDexBasedCritDamage/Chance`), and the attack type's mainhand/offhand speed/crit modifiers. `PlayerDamage.off-hand` independently selects the raw damage channels: a two-handed secondary attack uses offhand attack speed/crit but its effect can explicitly deal mainhand damage. Weapon scaling truncates each channel before power, damage multipliers and separate normal/critical rounding. Per-effect armor penetration combines multiplicatively with Strength/gear penetration. Spell-only modifiers remain scoped to spells.

Directional attacks use their full animation plus cooldown on the handed speed clock. Charged attacks include source charge-time at full intensity; absent release animation data is labeled as a lower-bound estimate. Charges count one collision per cooldown with explicit travel/recovery exclusions. Beams follow castpoint contact cadence and assume continuous fully built-up intensity. Other indefinite channels use their looping timeline period without inventing release frequency.

Finite channels use source wall-time duration plus handed-clock cooldown. Greataxe Whirlwind's base channel is five seconds, twenty ideal 250 ms contacts and 4.5 seconds cooldown. Speed modifiers change contact cadence and cooldown, not the five-second wall-time maximum. `activeDps` divides channel damage by active duration; primary core DPS divides by the full repeat interval. Expiry-frame counts may vary by one contact, and mana exhaustion/early release are not simulated.

Weapon masteries use `tweak/town/weapon_masteries.sval`, intensity equal to saved level, and the singular `skill-tag` filter. Damage ranges `[1,1.05]` extrapolate as `1 + 0.05 × level`. Wizard/Ranger class titles use highest matching profile levels; Ranger adds attack power. Wood/gold donation titles derive from imported donation metadata as described above. Existing progression exports without `weaponMasteries` remain valid. Existing native imports require reimport to populate the new title levels; titles can also be set manually.

## Verification and files

- `combat/definitions.js`: source rank/tier/slot resolution and component helpers.
- `combat/stats.js`: supported stats/modifiers and explicit exclusions.
- `combat/{warrior-ranger,paladin-priest,warlock-sorcerer,wizard-rogue}.js`: reviewed class contact models and resource references.
- `combat/calculate.js`: timing, capacity, elemental expectation and mitigation.
- `tests/combat.test.js`: numerical oracles, all class spell ranks and individual named tiers, rounding, filters, weapons, passives, conflicts and persistent caps.
- `tests/warrior-ranger.test.js`: additional source-family fixtures.

Run `mise run verify` and `mise run data:verify`. The catalog hashes class resources, relevant behavior source and referenced status/stack/combo definitions. Hashes establish which installed definitions were used, not that every hashed behavior has been simulated. Source Steam build is **25932569**. No runtime game modifications or player-save writes are involved.
# Hero resources and landed-hit survival

The hero panel displays modeled maximum health and mana from class base/growth, allocated and supported added attributes, and supported pool modifiers. The snapshot excludes focused active-skill modifiers, so changing the ability inspector does not change the hero's pools. Imported pools are calculated rather than live save-session resource values.

The incoming-hit scratchpad accepts custom integer raw damage, starting health percentage and enemy armor penetration. These inputs are session-wide scenarios, not saved enemy definitions. Physical damage and each elemental channel use their matching armor/resistance rating. For nonnegative effective rating, mitigation is `1 / (1 + rating × 0.005)`; negative ratings amplify by `1 − rating × 0.005 × ArmorNegativeMul`. Penetration reduces positive armor only; the scratchpad penetration input does not apply to elemental resistance. This follows `scripts/Behaviors/Armor.as` and `Player.as:523–538`. The mitigated integer channel is rounded before a second rounding for fire's **0.67** or poison's **0.20** immediate HP-damage scale. Ice/lightning/physical have no such immediate split. The unmitigated reference ignores all defenses and splits.

Starting health is `ceil(maximum health × percentage / 100)`. A hit dealing exactly the remaining health is lethal. Repeated direct hits survived are `ceil(starting health / damage taken) − 1`, or unlimited for zero damage. Sidebar maximums search the exact rounded lethal boundary at full health, with no penetration, independently of the scratchpad. Fire and poison thresholds describe **only the initial hit**, not total survival: fire affliction ticks can kill afterward; player poison affliction is nonlethal. Tick timing, affliction pools, block/parry/evade, damage-taken multipliers, shields/mana shield, recovery, lethal protection, locked health and additional enemy/difficulty damage scaling are excluded. Attack/spell labels share the same physical formula; no unsupported style-specific defense is invented.

### Regeneration, resistance ratings and movement

Catalog class `baseStats` now includes health/mana regeneration and each elemental resistance's base/level growth. `Modifiers.as:483–533` adds **0.05 health regeneration/Vitality** and **0.1 mana regeneration/Focus** to class base and `(level − 1)` growth. `ArmorAdd` adds rounded matching resistance ratings; class resistance growth truncates to integer. Recovery follows `AttribAdd`, then `AttribMul`, then supported stat conversions. The sidebar reports the resulting regeneration multiplied once by `HealthGain`/`ManaGain`, as used by `Player.as:1239–1248`. Missing-mana regeneration uses **Configuration → Current mana %**, defaulting to full mana, not automatic resource consumption. Health recovery resumes after the regen delay (base zero milliseconds in this build); no out-of-combat gate is invented.

After stat modifiers/conversions, armor is reduced by `int(curses × (3 + ngp × 0.66) + ngp × 110 + 0.5)` and each resistance by `int(curses × (3 + ngp × 0.66) + ngp × 60 + 0.5)`, matching `Modifiers.as:336–343`. NGP is an explicitly configured scenario, default zero; native imports already supply shadow curses. Ratings can be negative and have no invented percentage cap. Both settings survive copying and JSON/clipboard import/export.

Movement displays the unconditional `MoveSpeed` stat multiplier from `SpeedAdd`/`SpeedMul`, plus active combo's single ×1.2 bonus. Skill movement, slows, environment/tiles and the absolute engine speed clamps are outside this flat-terrain stat snapshot.

These new stats support Character-page manual overrides; gain overrides feed effective recovery, direct regeneration overrides replace that final rate, and resistance/armor overrides replace final ratings after penalties. Provenance includes class definitions, `Modifiers.as`, `StatModifier.as`, `SpecialStatModifiers.as`, `Player.as`, `PlayerStats.as`, `Armor.as`, `ActorBuffList.as` and tuning sources, with hashes and Steam build ID. Tests cover arithmetic and source contracts, not runtime validation.
