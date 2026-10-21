# Paladin / Ranger normal hits — Steam build 25932569 (B176)

## Runtime observations, 2026-10-20

Inspected the running game through window captures and ordinary character-menu controls. Repeated normal floating hits on the **green-robed town dummy** were **103 for the level-19 Paladin's mace** and **124 per strike for the level-17 Ranger's dual daggers**. The later typed Paladin value 130 was not reproduced; 103 was captured directly. No equipment, points, cheats, or installed game files were changed. Screenshots and raw saves are not committed.

These two normal-contact comparisons are runtime observations, **not** validation of criticals, procs, repeat timing, resource behavior, or complete DPS. Sanitized contributing build inputs are in `tests/runtime-reconciliation-fixtures.js`.

## Two missing inputs, not a damage-coefficient correction

1. **Gold donation title:** the profile's `chapel-revive-gold` town statistic is 150,316. `TownRecord::AddDonationTitle` computes `int(sqrt(value / divisor) + 0.5)`; the gold divisor is 3,000. This is **level 7**, supplying **×1.035 attack damage** through `PlayerRecord::RefreshModifiers` and `title_mat_gold`. Wood donations of 516 similarly produce level 7 with divisor 10 and ×1.035 spell damage. The old importer reconstructed accomplishments but left donation titles manual and unset.
2. **Target identity:** the green-robed sprite is the magic dummy's town `pop` frame **21 23 21 22**, not the normal dummy. `target_dummy_magic.unit` has **zero physical armor and 100 fire/ice/lightning/poison resistance**. The previous generic target had no elemental resistance. This explains why the missing damage bonus and missing defense affected these characters in opposite directions.

| Input / stage | Paladin mace | Ranger dual daggers |
| --- | ---: | ---: |
| Raw mainhand | 63 physical + 11 ice | 62 physical |
| Attack power | 71 (×1.355) | 122 (×1.61) |
| Physical damage multiplier | 1.0527777778 | 1.0944444444 |
| Weapon mastery | ×1 | ×1.1 |
| Gold title | ×1.035 | ×1.035 |
| Rounded pre-defense normal hit | 93 physical + 15 ice | 124 physical |
| Magic dummy defense | ice: round(15 / 1.5) = 10 | no physical armor |
| **Final normal contact** | **93 + 10 = 103** | **124** |

No Paladin/Ranger-specific multiplier, flat adjustment, or observed-hit override is added. Removing the title and reverting to the generic target reproduces the original UI values 105 and 120.

## UI and compatibility

Native imports now reconstruct supported gold/wood donation titles from the validated town-stat tuples, with warning/manual fallback for missing or unsupported stats. Existing browser builds and JSON exports remain independent: **reimport the character**, or set its gold donation title to 7 under Upgrades. Reimport adds a separate build; it does not overwrite manual edits.

In the left **Offence** panel's **Enemy target** dropdown, select **Green-robed magic dummy**. Targets are explicit scenario settings, not inferred from a save. Generic legacy builds keep their former 10,000-HP zero-resistance target and optional 100 armor. Named dummy presets use their own source-defined health and defenses; TTK uses the selected target's health. Armor/resistance mitigation rounds before damage-taken modifiers, and elemental penetration applies only to its matching positive resistance.

## Provenance

Catalog `sources` hashes cover the installed archive's target units, shared sprite, mechanics, and donation definitions, with Steam build ID retained. Key sources:

- `scripts/Town/TownRecord.as`: `RefreshDonationTitles` / `AddDonationTitle`.
- `tweak/town/hero_titles.sval`: `title_mat_gold` / `title_mat_wood`.
- `scripts/Behaviors/Actors/Player/PlayerRecord.as`: `RefreshModifiers`.
- `doodads/generic/target_dummy_magic.unit` and `target_dummy.png`: defenses and green town sprite.
- `scripts/Behaviors/Effects/Damage.as`: per-channel weapon truncation.
- `scripts/Behaviors/Actors/Player/PlayerBase.as`: power and outgoing per-channel damage rounding.
- `scripts/Behaviors/Armor.as` and `scripts/Behaviors/Actors/Enemies/CompositeActorBehavior.as`: defense rounding followed by damage-taken rounding.
