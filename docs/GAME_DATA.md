# Game-data validation report

## Source and scope

Initially inspected the locally installed **Heroes of Hammerwatch II**, Steam app **619820**, build **25509441**; the combo catalog refresh uses installed build **25932569**. The game's own files are the primary source. The two community wiki domains attempted during the initial pass returned HTTP 503, so no online balance values were adopted.

The installation contains `res/assets.bin`, English `.lang` files, and the official `PACKAGER.exe`/toolkit. We did not need executable disassembly: `assets.bin` contains readable SValue definitions and AngelScript gameplay source after decompression. The installation was read only.

Extraction discovered **15,660 archive entries** and wrote **1,475 text resources** under ignored `.game-data/` for inspection. The checked-in catalog includes:

- Eight base classes (including the Holy DLC Priest) and all 24 class specializations, linked by the actual class definitions.
- 81 unique class-referenced skills, including the shared Dash (80 class-specific skills). Dash is retained as source evidence, excluded from planner abilities.
- 198 `modifier-skills` definitions, including their described parameters and defined tier counts.
- Base cooldown, animation length, and castpoint fields where directly present.
- Equipment slot enum and power-divisor constant.
- Steam build ID, archive SHA-256, and individual hashes for localization and relevant source files.

Only skills referenced by the active class/profile arrays are cataloged as class skills. The archive also contains experimental/unreferenced content, such as Wizard's `phantasmal_force.sval`; finding a file alone does not prove it is available in the game. The expanded catalog also includes **159 equipment bases, 113 affixes and 114 trinkets**, their normalized modifier structures, descriptions and attuned variants. A separate weapon catalog contains the **68 attacks explicitly referenced by equipment**, standard/epic selection mappings, and literal linked combat resources. Weapon attacks have source-reviewed core estimates with documented trajectory/proc/uptime exclusions; broader town and DLC systems are not comprehensively modeled.

## Reproduce locally

```sh
mise install
mise run data:catalog
mise run data:verify
mise run verify
```

The default game directory is:

```text
~/.local/share/Steam/steamapps/common/Heroes of Hammerwatch 2
```

Override it for another Steam library:

```sh
HOH2_GAME_DIR="/path/to/steamapps/common/Heroes of Hammerwatch 2" mise run data:catalog
HOH2_GAME_DIR="/path/to/steamapps/common/Heroes of Hammerwatch 2" mise run data:verify
```

The Steam manifest must be at the enclosing `steamapps/appmanifest_619820.acf`. A copied standalone resource folder can be extracted, but catalog generation requires the manifest to identify the installed build. Raw extracted scripts stay in `.game-data/`, which is ignored; the distributable reference is `data/game-data.json`. No character saves are read by these tasks.

`data:verify` compares the actual installed archive, build ID, and every recorded source hash. It fails when those change rather than silently treating a different patch as verified. After a game update, regenerate and review the catalog and the build-specific tests together. Generation is deterministic for identical inputs.

Affix records preserve their existing `id` and `name` and now expose localized `prefix` and `suffix` strings separately; an absent source side is represented by `""`. In Steam build **25932569**, all 113 affixes have exactly one side: 55 prefixes and 58 suffixes; none have both or neither. A UI rendering an affix name should place the prefix before the base item name or the suffix after it. If future source definitions supply both, render both around the base item name rather than concatenating them together ahead of the item name. If neither is supplied, use the existing `name` fallback (currently the affix ID), not a classification inferred from the name.

## What is confirmed from source

### Real specialization definitions

`players/<class>/class_<class>.sval` defines parent class, specialization ID, localized name key, and the actual skill list. For example:

| Wizard specialization | Added spell | Added passive |
| --- | --- | --- |
| Evocation | Meteor Shower | Incanter's Cadence |
| Conjuration | Conjure Hydras | Animated Sword |
| Transmutation | Haste | Enhanced Physique |

These add distinct skills and mechanics, rather than flat bonuses. The current UI uses these real class/specialization IDs; the prototype's Offensive/Critical/Rapid profiles have been removed.

### Fireball: reviewed example

Source: `players/wizard/skills/wiz_fireball.sval`.

| Parameter | Definition |
| --- | --- |
| Damage ranks | 80 / 90 / 110 / 130 / 170 |
| Mana cost ranks | 40 / 40 / 50 / 50 / 60 |
| Base cooldown | 5,000 ms |
| Animation length | 400 ms |
| Castpoint | 100 ms |
| Enhanced Fireball | +25% / +50% size; radius bindings 60 / 72 vs base 48 |
| Blastwave | Vulnerability / Greater Vulnerability |
| Bouncing Fireball | 1 / 2 additional bounces |

The damage and mana display ranks were checked against the base skill and rank override values, not just localized prose. The timing fields are raw configuration, **not proof of an effective cast interval**.

The projectile definition, `players/wizard/projectiles/fireball.unit`, contains separate collision-hit, ground-bounce, and destruction-explosion effects. It is therefore unsafe to assume that one cast always equals one hit, or that every bounce hits the same target. This requires trajectory/hit testing before claiming single-target DPS.

### Power scaling differs from the prototype

`scripts/Data/Player.as` defines `DamagePowerDivisor = 200.0f`.

`scripts/Behaviors/Actors/Player/PlayerBase.as`, `DamageActor`, lines 840–849, applies:

```text
attack power factor = (200 + AttackPower) / 200
spell power factor  = (200 + SpellPower) / 200
```

Thus +100 power multiplies the relevant damage by 1.5 at this stage. It is not a flat +100 damage. The adjacent source comment about the divisor is stale; the executable expression and constant take precedence over that comment.

The same function contains separate mainhand, offhand, and spell critical paths; per-skill modifiers; summon handling; DoT exceptions; hit triggers; and per-element damage multiplication/rounding. `PlayerStats.as` confirms separate weapon and spell power, critical stats, cast/attack speed, and elemental multipliers. The version 2 model now selects spell or weapon stats according to the focused ability, including handed weapon critical/speed modifiers. Weapon attacks have reviewed core contact estimates rather than a full runtime simulation.

### Cooldown modifiers and run upgrades

`scripts/Behaviors/Actors/Modifiers/SkillModifier.as`, lines 48–57, multiplies per-skill cooldown, speed, and damage modifiers. The old blanket additive cooldown reduction and 80% cap were sandbox assumptions and are not used by the version 2 model. Unsupported per-skill modifiers are reported rather than approximated with that cap.

Run upgrades are named `modifier-skills` with individual effects and upgrade arrays, not a universal stack of +damage/+hits/+CDR. Tier counts in the catalog mean **defined tiers**, not confirmed acquisition probability, simultaneous availability, or unlock order. Quality and progression rules need a separate pass.

### Equipment slots

`scripts/Items/Equipment.as`, enum `Slot`, lines 3–14:

```text
MainHand, OffHand, TwoHanded, Head, Chest, Feet, Hands, Back
```

TwoHanded is an equipment category requiring hand-occupancy handling, not an extra independent slot. Ring and Amulet are not entries in this enum. The version 2 inventory uses these real categories and enforces hand occupancy. Old sandbox data is preserved separately rather than silently converted.

## Extraction format and limitations

The read-only reader supports the observed `HW2R` archive version 4: a 21-byte header, entry count at offset 17, length-prefixed resource names, resource flags, uncompressed/compressed lengths, and raw or LZ4 block data. External resource entries use the observed `0xff`/`0xffffffff` marker. The reader checks bounds, paths, duplicate names, decompression lengths, and trailing data; unknown versions fail.

The text SValue reader is **structural**, not the game's runtime preprocessor. It removes comments and macro definitions and ignores directive lines. Normalized literal scalars/vectors become numbers and arrays; symbols stay as text. The catalog preserves original rank overrides as well as base-plus-selected-rank views. The calculation layer implements the reviewed indexed-modifier-slot merge and upgrade precedence from the runtime scripts. Includes, arbitrary expressions, conditional execution and the full preprocessor are not evaluated. Files containing relevant directives are marked. Display parameters can be incomplete or outdated; explicit reviewed handlers are used for damage rather than assuming tooltips are formulas.

## Native character saves

The native importer supports the observed **H2SV v4** profile format. It was checked read-only against 20 local profile files: two current profiles plus 18 numbered snapshots. The current profiles contain 10 non-deleted characters in total. No real saves or personal character records were copied into the project. Tests use synthetic profiles.

### Container decoding

- Magic `H2SV`, uint32 version 4, uint64 saved timestamp and UTF-8 null-terminated profile name.
- Profile metadata varies with enabled mods. A bounded scan (4 KB) identifies the town block only when the town dictionary, all character records, scene blocks and exact file ending match the observed layout.
- Blocks have uncompressed/compressed lengths and LZ4 block payloads. Character entries have an unsigned ID, SValue record and optional saved scenes. Each observed scene stores a name, two blocks, resource string and eight opaque engine bytes.
- Character records with key zero are deleted/empty slots and are excluded.
- The last four bytes are an opaque engine checksum. It is **not validated**. Unknown serialization tags or versions fail explicitly; structural validation is not a complete integrity check.
- Limits: 16 MB file/block, 64 MB cumulative decompression including failed header candidates, 64-level nesting, bounded node/string/collection counts, 1,000 selected files and 64 MB selected profile bytes. Only read-only decoding occurs; scene data is not interpreted or executed.

### IDs and mapping evidence

The registered `HashString` implementation in `HWR2.exe` is MurmurHash3 x86-32 with seed **`0xf808409c`**. The registration string at file offset `0x559a98` references the wrapper at `0x1b3960`, which calls the hashing routine at `0x16af0`. The routine contains that seed and the Murmur3 constants. Executable SHA-256 is recorded in the catalog under `provenance.nativeSaveHashEvidence` and checked by `data:verify`.

Corroborated mappings include `twohanded_greataxe_02 → ddb3ea41`, `head_str_t3a → d048f112`, `chest_str_t1a → 7c1ccd8f`, `feet_str_t2a → 080ebf34`, and two independently resolved modifier hashes. Signed saved integers are converted to unsigned 32-bit hashes for lookup.

`PlayerRecord.as` establishes fields for attributes, class, equipped/carried equipment, picked and temporary skills, trinkets, attunements and shadow curses. Effective skill rank includes saved permanent/temporary increments plus the source starting level. Stat-based/library rank bonuses are not evaluated. Unlearned ranks remain zero. The catalog retains starting levels and rank-bonus-stat references for base skills and named modifiers.

`Equipment::Item.Save` (`scripts/Items/Equipment.as:183–200`) writes `[quality, baseHash, savedIntensity, itemLevel, upgradeLevel, colorA, colorB, ...modifierHashes]`. Equipped arrays have seven positional slots, with two-handed weapons in the mainhand position (`scripts/EquippedItems.as`). Enchantments use the same modifier-hash list, not a separate serialized field. Modifier intensity is **`(itemLevel + upgradeLevel − 1) / 9`**, not the saved intensity float (`Equipment.as:319`, `PlayerRecord.as:1908–1915`). It is not clamped. Integer-vector interpolation uses nearest-integer rounding (`StatModifier.as:3–11`); float modifiers preserve fractions. Imported item levels drive both base and affix scaling; manual range-roll items remain available separately.

Trinket inventories store string IDs and permit duplicates. Attunement stores ID hashes and replaces the modifier list for every copy. Import therefore preserves a copy count and applies supported modifiers once per copy. Supported progression maps Mystic spell power and Armorer attack power from `shop-upgrades` triplets, weapon/spell masteries from `weapon-masteries` triplets, and Tavern/Chapel buffs from `mission-buffs` pairs. Highest Wizard/Ranger class/specialization levels across the profile supply their power titles. Native import reads donation `donationStat` and `divisor` metadata from TownRecord; title level is `int(sqrt(chapel-revive-X / divisor) + .5)` (gold divisor 3000, wood divisor 10). For example, 150316 gold and 516 wood produce level 7 of each title, granting +3.5% attack and spell damage. The importer decodes the observed town-stat tuple schema and derives five accomplishment attributes using literal source thresholds, stacking inclusively. Missing individual stats initialize to zero per `Stats.InitializeCollection`; a missing or unsupported collection warns and allows manual fallback. `Modifiers::BuildStats` adds the town accomplishment reward aggregate before derived stats, separate from picked/elixir values. Only Mystic spell-power and Armorer attack-power town purchases auto-import; other town upgrades, library rank bonuses, automatic buff uptime, sets and other excluded runtime systems remain disclosed rather than invented. JSON exports/copies preserve bonuses and supported merchant tiers. Reimport an existing native save to populate bonuses and donation titles; this creates a separate build and does not automatically overwrite the existing library entry. No destructive migration is performed; titles remain editable manually. Unknown equipment records, modifier hashes and other unmapped IDs are retained in build import metadata with warnings. Class mapping includes Priest because real current profiles contain that DLC class.

Bulk folder import prefers current profiles over numbered snapshots; snapshot-only imports keep the latest record by save timestamp. The browser never overwrites a game save or an existing planner build. Already-imported source identities are unchecked so edited builds are not silently replaced. A user can deliberately import an additional copy.

## Current estimate support and next work

`planner-model.js` now delegates to the modular `combat/` engine. It implements source-derived core estimates for all **36 damaging class spells**, including mixed elements, raw-mainhand-scaled spells, periodic effects, summon capacity, supported unconditional passives, stat conversions and skill-filtered modifiers. Elemental normal/critical channels and physical mitigation are rounded separately. Full-animation timing distinguishes cooldown-at-deactivation directional/position spells from cooldown-at-activation legacy ActiveSkill spells. See [the calculation report](CALCULATIONS.md) for the class matrix and source assumptions.

The UI shows included damage components, **Partial estimate** exclusions, **Utility**, **Passive effect**, **Not learned**, missing-weapon and conflict statuses. Unknown procs/conditional gear effects leave known core damage available with explicit limitations rather than making every skill unavailable. These are not runtime-validated total-DPS results: contact geometry, jitter, dynamic buffs/procs, companion AI, resource exhaustion and rotations remain simplified or omitted. Target catalog entries include normal (0 defense) and armored (50 physical armor, 0 elemental resistance), each with 10,000,000 health; a separate green-robed magic target is selectable for the observed target. Builds lacking a target ID retain the generic 10,000-HP target with optional 100 physical armor (or 0). Target selection is explicit, never inferred from a save. Manual roll sliders interpolate source ranges; imported items use saved level-based scaling. Full item-generation legality and triggered trinket/set systems are not implemented.

Version 2 builds store real source IDs, named tiers, allocated attributes and game build provenance. They can be created/copied/compared independently. The next work is:

1. Extend the version 2 spell-oriented schema with weapon attack calculations and complete item-generation rules.
2. Extend the reviewed rank/modifier/timing paths with more conditional state and exact charged/channel execution scheduling.
3. Runtime-validate the supported spell estimates, including Fireball projectile/explosion hit assumptions, mitigation, critical rolls, and rounding.
4. Extend the current unconditional-passive and core summon/area calculations with dynamic stacks, conditional buffs, full companion scheduling, affliction damage and resource/rotation constraints.
5. Compare controlled in-game observations to calculated outputs for the same build and game version.

Native save decoding is now supported for the observed v4 format described above. Runtime comparison with the running game was limited to normal hits: a level-103 Paladin mace hit (93 physical, 10 ice) and a Ranger dagger hit (124). This narrow check is not validation of the simulation, DPS, or procs. See [Paladin/Ranger reconciliation](PALADIN_RANGER_RECONCILIATION.md). Save decoding does not grant remote Steam Cloud access; the user must have local files or download their saves through Steam.
