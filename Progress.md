# Batomon Showdown Planner — progress

## Open
- [ ] User review of the link tags (`_bs_extract/data/entities_audit.md` lists every channel; tags in `tools/tags/facets.py`), one effect at a time like the HMD Dude audit. Known soft spots: Zenith Stone boosts every stat gain (no permanent / battle-only split yet), Level 3+ gates are not checked, Cast links from team-wide speed effects are broad.
- [ ] Ability text in the game's own wording: the loc templates (`monster.ability.*`) need each script's `get_description` values; the planner shows the extract's plain text with the chosen level's numbers.
- [ ] Battle numbers on the board (team HP for the day, cooldowns after speed buffs, output per cast) from 01_battle.md formulas.
- [ ] Bench, items used and the shop: not modelled yet.
- [ ] Real-phone check of the board, selector and detail at 390 px.

## Log
- 2026-11-23 Started. Link graph (`_bs_extract/tools/build_entities.py` + `tools/tags/facets.py`): 368 units, 394 effects, 4510 producer -> consumer links, 3752 unit pairs. App: build-first home (trainer, 2x3 board in game order, trinket shelf, linked / move-to-link lists grouped by receiver, "fits this build" suggestions), selector overlay (tabs, rarity and type chips from the game's label art, search, tooltip + level / shiny toggles, Place / Remove), detail overlay (tooltip + Feeds / Fed by / evolution line), layer-aware Back. Game art, fonts and 9-slice panels throughout; sell value from `monster_instance.gd:221-283`. render_check: 1691 renders, 0 problems.
