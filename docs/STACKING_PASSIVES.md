# Player stacking-passive catalog audit

Scope: all eight catalog classes and their 24 specializations, checking passive skill/rank/upgrade references against the extracted player stack definitions and configurable families in `scripts/status-catalog.mjs`. Names/IDs and class skill availability are from Steam build **25932569** (`players/<class>/class_<class>.sval`, skill files and `stacks_<class>.sval`). Stack entries are extracted definitions, not runtime-validated simulation. A skill listed at the base profile is common to its three specializations; specialization-only skills are indicated below.

| Family | Class / skill | Availability |
| --- | --- | --- |
| Haste | Wizard / `transmutation_haste` | Transmutation specialization |
| Killing Spree | Warrior / `killing_spree` | Base and all specializations |
| Rage | Warrior / `berserker_rage` | Berserker specialization |
| Incanter Cadence | Wizard / `wiz_incanters_flow` | Evocation specialization |
| Slice and Dice | Rogue / `rog_slice_and_dice` | Base and all specializations |
| Essence | Warlock / `drain_essence` | Base and all specializations |
| Divine Favor | Priest / `divine_favor` | Base and all specializations (Holy DLC) |
| Elemental Affinity: Fire, Ice, Lightning | Sorcerer / `elemental_affinity` | Base and all specializations; separate element definitions |
| Rhythm | Ranger / `ran_rhythm` | Base and all specializations |
| Survivalist | Ranger / `ran_survivalist` | Base and all specializations |
| Inner Flame | Paladin / `radiance_flames` | Radiance specialization |
| Barrier | Wizard / `wiz_barrier` | Base and all specializations |
| Barrier: Fire | Wizard / `wiz_barrier` | Requires upgrade `wiz_barrier_fire` |
| Sidestep | Rogue / `rog_evasion` | Base and all specializations |
| Divine Protection | Paladin / `divine_protection` | Divine specialization |
| Ecstasy | Priest / `flagellate` | Flagellant specialization (Holy DLC); requires upgrade `flagellate_ecstasy` |

Barrier preserves the extracted source definition maximum unchanged (base definition `max` is 1). Its catalog selection ceiling is 5, reflecting the source's reviewed `barrier-stacks` added by skill ranks; it is not a rewrite of the source definition. Upgrade-gated states carry `requiredUpgrade` metadata so they are not represented as baseline states.

Rhythm offers Off and 1–4 stacks. It retains the skill's unconditional critical chance exactly once, adding the rank-bound stack critical chance/damage and any selected attack-speed upgrade separately. Inner Flame offers 1–5 stacks; its weapon-damage upgrade supplies level-to-mainhand/offhand Fire conversions. Ecstasy offers 1–5 stacks only after learning Flagellate's Ecstasy upgrade, and its Thorns increase applies even when another ability is focused. Source `ModifyStack` modifiers adjust the available maximum and displayed duration without mutating extracted definitions. Wrong-specialization families are hidden; unlearned skills and unselected prerequisite upgrades are disabled.

Selections are retained in saved/exported builds when changing skill ranks, upgrades or specialization, so changing back restores the user's preference. Retention is not activation: unavailable selections contribute no modifiers. Both the selector and combat snapshot clamp a retained high count to the current maximum (for example, stored Barrier 5 is displayed and calculated as 3 at rank 1). The stored count is not rewritten; export validation accepts counts up to the source-reviewed family ceiling. Reset conditions clears the stored preferences.

These controls are manually held snapshots. Selecting defensive states such as Survivalist, Sidestep or Divine Protection does not turn the initial direct-hit estimate into a defensive proc simulation. Supported regeneration/resistance modifiers and stat conversions now contribute to the stat snapshot; damage-taken, aura and triggered effects not implemented by that path remain excluded/disclosed. Recovery does not contribute to maximum-hit thresholds. Aura/proc damage is not silently added to the focused weapon's per-hit damage or DPS.

## Deliberate exclusions / audit issues

- Auxiliary timer records (including timer companion definitions) are not independent player stack families.
- Inner Flame's `inner_flame_damage_<rank>` records are rank aliases for damage sourced from the same aura, not a distinct stack count; the periodic aura damage remains outside this passive-stack catalog.
- `arcane_trickster` has no current skill reference in the class/profile arrays and is not admitted merely because source files might exist.
- Judgement and Soul Vortex are active skills with scheduled effects, not passive stack-stat families; their scheduling and damage are outside this catalog.

`tests/stack-passives.test.js` checks every normalized passive skill's player-stack reference against configurable families or an explicit auxiliary exclusion, as well as all class/spec availability, concrete stack stat changes, and rendered Configuration selectors. This guards against silently omitting new passive stack references in future catalogs. The audit does not infer mechanics from sample/test values or claim complete runtime behavior.
