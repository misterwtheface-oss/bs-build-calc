# Batomon Showdown Planner — progress

## Open
- [ ] User review of the link tags (`_bs_extract/data/entities_audit.md` lists every channel; tags in `tools/tags/facets.py`), one effect at a time like the HMD Dude audit. Known soft spots: Zenith Stone boosts every stat gain (no permanent / battle-only split yet), Level 3+ gates are not checked, Cast links from team-wide speed effects are broad.
- [ ] Ability text in the game's own wording: the loc templates (`monster.ability.*`) need each script's `get_description` values; the planner shows the extract's plain text with the chosen level's numbers.
- [ ] Battle numbers on the board (team HP for the day, cooldowns after speed buffs, output per cast) from 01_battle.md formulas.
- [ ] Bench, items used and the shop: not modelled yet.
- [ ] Real-phone check of the board, selector and detail at 390 px.

## Log
- 2026-11-23 Started. Link graph (`_bs_extract/tools/build_entities.py` + `tools/tags/facets.py`): 368 units, 394 effects, 4510 producer -> consumer links, 3752 unit pairs. App: build-first home (trainer, 2x3 board in game order, trinket shelf, linked / move-to-link lists grouped by receiver, "fits this build" suggestions), selector overlay (tabs, rarity and type chips from the game's label art, search, tooltip + level / shiny toggles, Place / Remove), detail overlay (tooltip + Feeds / Fed by / evolution line), layer-aware Back. Game art, fonts and 9-slice panels throughout; sell value from `monster_instance.gd:221-283`. render_check: 1691 renders, 0 problems.
- 2026-11-23 Trainer and panel headers to the game's layout. Trainer card = `trainer_ui.tscn`: yellow header (name), the game's 120x80 mugshot crop (`trainer_portrait.gd` Kind.LARGE: window centred on `mugshot_center`, clamped to the sprite; computed in `tools/build_data.py` as `crop`/`size`) drawn 1:1 in `trainer_portrait_frame` with the one-texel corner clip, description section beside it (below on phones). Team / Trinkets = `monster_team_ui.tscn`: plain panel_container, full-width `header_red_panel` / `header_yellow_panel` bar (9-slice 4 1 4 2) holding a Guilty Treasure 12 label, slot gap 4; the old shop_team/bench textures are gone. Selector: a trainer's full-body sprite fills the info panel (up to 1 sprite px = 1 game px). render_check 1691 / 0.
