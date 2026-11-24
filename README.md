# Batomon Showdown Planner

Team planner for Batomon Showdown: put a trainer, six monsters and your trinkets on the game's own board and see which
effects feed which, including the ones that only link in the right slot (adjacent, above, behind, in front, a fixed
slot). Every monster, trinket, item and trainer opens in the game's tooltip with its links. Mobile first.

## Build
```
python ../_bs_extract/tools/build_entities.py   # the link graph (local extract, never pushed)
python tools/build_data.py [--strict]           # data.js + assets/ from ../_bs_extract; stamps cache-bust tokens
node tools/render_check.js                      # renders every view; must report 0 problems before a push
node tools/serve.mjs                            # local preview; stop it when done
```
`git config core.hooksPath .githooks` once per clone: the pre-commit hook re-stamps cache-bust tokens.

## Data
`../_bs_extract/data/entities.json` holds the units (species, trinkets, items, trainers, event options), their effects,
and the links: an effect that **gives** a stat or **emits** an event (producer) joins one that **scales** with it,
**reacts** to it, **boosts** it or **needs** it (consumer) on the same channel. Monster types are the shared layer:
an effect gated on a type (Toxic allies) links to every monster of that type. Tags are curated per effect in
`_bs_extract/tools/tags/facets.py`, each read from the decoded game script the extract cites. Position rules
come from the game's board code (2 rows x 3 columns, slot 0 front-bottom; `utils.gd`).

## Art and look
All art, fonts and panels are the game's own files, copied unchanged and scaled with nearest-neighbour
(`image-rendering: pixelated`, one game pixel = `--u`). Panels are the game's 9-slice textures with its margins;
the tooltip frame is tinted per rarity like the game does. A missing file fails the build.
Layout follows the game's scenes: headed panels = `monster_team_ui.tscn` / `trainer_ui.tscn` (panel, full-width
red/yellow header bar, Guilty Treasure 12 label), trainer portrait = `trainer_portrait.gd` 120x80 crop, selector =
`selector.tscn` corner brackets outside the object. Jinto / Pantra are the game's "regions" (data: `sets`).

`render_check.js` runs app.js against a stub page that has only `document.querySelector`: keep load-time DOM access
to that (static elements live in index.html, e.g. the search suggestions `#terms`).
