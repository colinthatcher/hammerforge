# Warrior damage reconciliation — Steam build 25932569

This records a user-reported runtime comparison, not a runtime-validated simulation. The equipped-item/rank inputs are reproduced in `tests/warrior-reconciliation.test.js`; no save files or personal identifiers are stored in that fixture.

**Subsequent finding (2026-10-20):** missing gold/wood donation titles and the green-robed magic dummy's elemental resistance have now been identified in the Paladin/Ranger investigation. See [the source-backed reconciliation](PALADIN_RANGER_RECONCILIATION.md). The values and unresolved conclusions below preserve the earlier, title-free generic-target baseline; they do not describe the new target presets or donation-title importer.

## Confirmed missing progression

- Strength: 10 base + 61 picked + 15 town accomplishment = **86**. Warrior uses two spell power per Strength (`players/warrior/class_warrior.sval`, `Modifiers::CalcAttributes`). This gives 172 attribute spell power and **202** total with Mystic tier 6 (+30).
- Attack power: Armorer Weapon 13 (+65) + Ranger title level 17 (+51) + equipped cloak (+31) = **147**. `PlayerRecord::RefreshModifiers` applies only the selected shop step. Native saved shop level 12 corresponds to planner tier 13.
- Accomplishment Strength must affect all derived stats, not just spell power. Raw greataxe physical damage changes from 97 to **100**: 83 level-scaled base + trunc(86 × 0.2). The raw fire channel remains **19**.

These are supported by source hashes in `catalog.sources`, the extracted shop/class/equipment definitions, and the reviewed modifier/PlayerRecord paths. Accomplishment totals are manually entered because native town-stat reconstruction remains unsupported.

## Full recalculation

Armored and enemy/player buff conditions are off. Only the confirmed +15 accomplishment Strength is added; other accomplishment attributes remain zero because their totals have not been supplied. The spell-power and attack-power changes are not injected as artificial modifiers.

| Ability | Normal damage per contact | Expected damage/cycle (crit-weighted) | Repeat interval | Sustained DPS | Reported normal hit |
| --- | ---: | ---: | ---: | ---: | ---: |
| Whirling Axes | 88 per axe | 176.5, both axes | 2.6 s | 67.9 | 91 per axe |
| Leap | 265 landing | 265.8 | 5.5 s | 48.3 | 274 |
| Greataxe Slash | 239 physical + 49 fire = 288 | 292.1 | 0.81 s | 360.6 | 281; 337 vulnerable |
| Whirlwind | 143 physical + 30 fire = 173 per tick | 3509.0, 20 ideal ticks | 9.5 s | 369.4 | 169 first tick |

Whirlwind active-channel DPS is about **701.8** (3509.0 / 5); sustained DPS includes the following 4.5-second cooldown. The standard definition is a constant 75% weapon-damage contact on a looping 250 ms timeline. The corresponding directional-channel class does not change activation intensity over channel stages. No ramp has been added.

## Remaining difference: unresolved, not calibrated away

The corrected stats match the reported power and Strength, but the normal hits do **not** match exactly. Spells remain low by 3 and 9; weapon attacks are now high by 7 and 4. The prior power-only diagnostic (88/265/280/167) omitted Strength's effect on raw weapon damage and must not be treated as the full correction.

Reviewed source paths retain their original rules:

- `Equipment::Item.GetModifierIntensity`: (itemLevel + upgradeLevel − 1) / 9; saved random intensity is not substituted.
- `StatModifier.as`: nearest-integer integer-vector interpolation and truncated Strength-derived weapon damage.
- `PlayerDamage::FillDamage`: truncate each weapon channel after the 125% Slash / 75% Whirlwind coefficient.
- `PlayerBase::DamageActor`: power, skill and damage modifiers followed by per-channel rounding; enemy behavior then applies per-channel defenses and damage-taken modifiers.
- `combat/warrior-ranger.js`: rank-1 bases remain 40 per axe and 120 for Leap, with no selected upgrades.

The green-hooded town target's exact unit defenses/tags were not established from the extracted resources; the planner's generic unarmored, zero-resistance target is not a verified description of that NPC. Conditional target bonuses, automatic vulnerability/procs, other permanent damage bonuses, and runtime timing remain outside this controlled stat correction. The exported build includes a conditional elite-damage affix, which is not applied without target-tag evidence.

Further reconciliation requires a controlled in-game comparison of raw mainhand physical/fire channels, spell/weapon/physical damage multipliers, complete accomplishment totals, and the same target conditions. No single missing multiplier or rounding defect has been established for the remaining gap. Skill coefficients and channel timing are deliberately unchanged; fixture expectations record the source model, not a forced match to the observed numbers.
