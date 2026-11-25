"""Build data.js + assets/ for the Batomon Showdown planner from ../_bs_extract (local only, never pushed).

  python tools/build_data.py [--strict]

Reads _bs_extract/data/entities.json (tools/build_entities.py there) and copies every image the app shows straight
from the recovered game project (no rescale: the browser scales pixel art with image-rendering: pixelated). A
referenced file that does not exist stops the build (A-provenance-guards); --strict also fails on warnings.
Every asset path in data.js carries ?v=<md5[:8]> of its bytes; index.html / sw.js are stamped by
../tools/app/stamp_cache.py at the end (A-cache-bust).
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WS = os.path.dirname(APP)
X = os.path.join(WS, "_bs_extract")
REC = os.path.join(X, "recovered")
STRICT = "--strict" in sys.argv
errors, warnings = [], []
copied = {}  # res path -> app path with ?v=

# UI textures the stylesheet uses (fixed names under assets/ui/), fonts under assets/fonts/
UI = ["common/panel_container_bg.png", "common/section_panel_bg.png", "common/section_inner_panel_bg.png",
      "common/highlighted_panel_container.png", "common/red_header_panel.png", "common/yellow_header_panel.png",
      "common/button_blue_normal.png", "common/button_blue_pressed.png", "common/button_red_normal.png",
      "common/button_red_pressed.png", "common/button_yellow_normal.png", "common/button_yellow_pressed.png",
      "common/button_disabled.png", "common/dex_level_button_on.png", "common/dex_level_button_off.png",
      "common/toggle_button_blue_on.png", "common/toggle_button_off.png", "common/selector.png",
      "common/scroll_bar_grabber.png", "common/scroll_bar_under.png", "common/x_icon.png",
      "tooltip/rarity_frame.png", "tooltip/type_label_bgs/type_bg_shadow.png",
      "shop/shop_bg.png", "shop/top_hud_panel.png",
      "shop/shop_monster_slot_bg.png", "shop/team_slot_arrows/above_arrow.png",
      "board_markers/crest_marker.png", "board_markers/crown_marker.png", "board_markers/flag_marker.png",
      "trainer_description/trainer_portrait_frame.png"]
RARITY = ["common", "uncommon", "rare", "super_rare", "legendary", "mythic"]
RARITY_COLORS = ["#70707a", "#4ab500", "#0084bd", "#a040a0", "#d47c00", "#dc2844"]  # utils/glossary.gd RARITY_COLORS
FONTS = ["Guilty Treasure.otf", "Primary School.otf", "ChevyRay - Picory.ttf"]


def ver(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()[:8]


def copy(res, dest_rel):
    """res:// path (or path under recovered/) -> assets/<dest_rel>?v=hash; missing source = error"""
    if res is None:
        errors.append("no source for " + dest_rel)
        return None
    src = os.path.join(REC, res.replace("res://", "").replace("/", os.sep))
    if not os.path.isfile(src):
        errors.append("missing %s (for %s)" % (res, dest_rel))
        return None
    dest = os.path.join(APP, "assets", dest_rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if not os.path.isfile(dest) or ver(dest) != ver(src):
        shutil.copyfile(src, dest)
    rel = "assets/" + dest_rel
    copied[rel] = True
    return "%s?v=%s" % (rel, ver(dest))


def main():
    with open(os.path.join(X, "data", "entities.json"), encoding="utf-8") as f:
        E = json.load(f)

    ui = {}
    for u in UI:
        key = os.path.splitext(os.path.basename(u))[0]
        ui[key] = copy("assets/ui/textures/" + u, "ui/" + os.path.basename(u))
    for r in RARITY:
        ui["rarity_" + r] = copy("assets/ui/textures/tooltip/rarity_label_bgs/%s_rarity_bg.png" % r,
                                 "ui/rarity/%s.png" % r)
    # the tooltip frame is white and tinted per rarity in game (description_box.gd FRAME_COLORS via self_modulate):
    # pre-multiply it here, a plain colour multiply like Godot's modulate
    from PIL import Image
    frame = Image.open(os.path.join(REC, "assets", "ui", "textures", "tooltip", "rarity_frame.png")).convert("RGBA")
    for i, hexc in enumerate(RARITY_COLORS):
        c = tuple(int(hexc[k:k + 2], 16) for k in (1, 3, 5))
        r, g, b, a = frame.split()
        im = Image.merge("RGBA", (r.point(lambda v: v * c[0] // 255), g.point(lambda v: v * c[1] // 255),
                                  b.point(lambda v: v * c[2] // 255), a))
        dest = os.path.join(APP, "assets", "ui", "frame_r%d.png" % (i + 1))
        im.save(dest)
        copied["assets/ui/frame_r%d.png" % (i + 1)] = True
        ui["frame_r%d" % (i + 1)] = "assets/ui/frame_r%d.png?v=%s" % (i + 1, ver(dest))
    for name in FONTS:
        copy("assets/ui/fonts/" + name, "fonts/" + name.replace(" ", "_"))

    types = []
    for t in E["types"]:
        types.append({"id": t["id"], "name": t["name"], "color": t["color"],
                      "bg": copy(t["bg"], "ui/types/%s.png" % t["id"])})
    for extra in ("trinket", "item"):
        ui["type_" + extra] = copy("assets/ui/textures/tooltip/type_label_bgs/%s_type_bg.png" % extra,
                                   "ui/types/%s.png" % extra)

    def ab(a):
        o = {"tr": a.get("trigger"), "text": a.get("text"), "src": a.get("src")}
        return o

    species = []
    for s in E["species"]:
        o = {"id": s["id"], "name": s["name"], "tier": s["tier"], "cost": s["cost"], "types": s["types"],
             "set": s["set"], "pool": s["pool_sets"], "event": s["event_only"], "dex": s["in_dex"],
             "img": copy(s["sprite"], "monsters/%s.png" % s["id"]), "stats": s["stats"], "ab": ab(s["ability"]),
             "file": s["file"]}
        if (s["ability"].get("params") or {}).get("unlimited_levels"):
            o["unl"] = 1  # sell multiplier 2^(level-1) (monster_instance.gd level_cost_multiplier_for)
        sh = s.get("shiny")
        if sh:
            o["shiny"] = {"img": copy(sh["sprite"], "monsters/%s_shiny.png" % s["id"]) if sh.get("sprite") else None,
                          "stats": sh["stats"], "ab": ab(sh["ability"])}
        species.append(o)

    def held(kind, rows, folder):
        out = []
        for t in rows:
            o = {"id": t["id"], "name": t["name"], "tier": t["tier"], "text": t["text"], "src": t["src"],
                 "img": copy(t["icon"], "%s/%s.png" % (folder, t["id"]))}
            for k in ("sets", "is_unique", "has_drawback", "requirement", "cost", "pool", "condition", "berry"):
                if t.get(k) not in (None, "", False, []):
                    o[k] = t[k]
            out.append(o)
        return out

    trinkets = held("trinket", E["trinkets"], "trinkets")
    items = held("item", E["items"], "items")
    # item family = the shared effect class its script extends (game/items/common_effects/); one-off classes and
    # plain ItemEffect get none. Names: keyword.potion / keyword.berry, item.effect.ticket / item.effect.gift
    FAMILY = {"PotionEffect": "potion", "RollTieredItemEffect": "ticket", "GiftEffect": "gift",
              "BuffToTypeItemEffect": "type_boost", "BerryEffect": "berry"}
    for o in items:
        script = os.path.join(REC, o["src"].replace("res://", "", 1).split(":")[0])  # first cited file = its own script
        if not os.path.isfile(script):
            errors.append("item %s: effect script not found (%s)" % (o["id"], o["src"]))
            continue
        with open(script, encoding="utf-8") as f:
            ext = next((l.split()[1] for l in f if l.startswith("extends ")), "")
        if ext in FAMILY:
            o["fam"] = FAMILY[ext]
    def mugshot(t):
        """game/trainers/trainer_portrait.gd region_for(Kind.LARGE): a 120x80 window centred on mugshot_center,
        clamped inside the full sprite (UNSET centre -> x centre, top) -> [x, y, w, h] in sprite pixels, [sprite w, h]"""
        w, h = 120, 80
        sw, sh = Image.open(os.path.join(REC, t["sprite"].replace("res://", ""))).size
        cx, cy = t["mugshot_center"]
        if (cx, cy) == (-1, -1):
            warnings.append("trainer %s has no mugshot_center" % t["id"])
            cx, cy = sw // 2, h // 2
        return [min(max(cx - w // 2, 0), max(0, sw - w)), min(max(cy - h // 2, 0), max(0, sh - h)), w, h], [sw, sh]

    trainers = []
    for t in E["trainers"]:
        crop, size = mugshot(t)
        trainers.append({"id": t["id"], "name": t["name"], "text": t["text"], "src": t["src"], "sets": t["sets"],
                         "pool": t["in_pool"], "img": copy(t["sprite"], "trainers/%s.png" % t["id"]),
                         "crop": crop, "size": size})

    # effects: id -> [unit, variant, facets[[facet, ch, scope, gate|0, implicit|0, src]]]
    effects = {}
    for e in E["effects"]:
        effects[e["id"]] = [e["unit"], e.get("variant") or 0,
                            [[f["facet"], f["ch"], f["scope"], f.get("gate") or 0, 1 if f.get("implicit") else 0]
                             for f in e["facets"]]]
    # links: [kind, ch, from, pf, to, cf, pos|0, pos_of|0, gate|0, shiny|0, via|0]
    links = [[l["kind"], l["ch"], l["from"], l["pf"], l["to"], l["cf"], l.get("pos") or 0, l.get("pos_of") or 0,
              l.get("gate") or 0, 1 if l.get("shiny") else 0, l.get("via") or 0] for l in E["synergy"]["links"]]
    edges = [[e["a"], e["b"], e["score"], e["channels"], 1 if e.get("shiny_only") else 0]
             for e in E["edges"] if e["kind"] == "synergy"]
    graph = [[e["kind"], e["a"], e["b"]] for e in E["edges"] if e["kind"] in ("evolves", "grants")]

    data = {"types": types, "sets": sorted(E["sets"], key=lambda s: s["unlock_wins"]), "keywords": E["keywords"], "species": species, "trinkets": trinkets,
            "items": items, "trainers": trainers, "events": E["events"], "effects": effects, "links": links,
            "edges": edges, "graph": graph, "rarity": E["synergy"]["rarity"], "ui": ui}
    if errors:
        print("\n".join("ERROR " + e for e in errors))
        sys.exit(1)
    if warnings:
        print("\n".join("WARN " + w for w in warnings))
        if STRICT:
            sys.exit(1)
    js = "window.BS_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(os.path.join(APP, "data.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(js)

    # precache list for the service worker (offline art), versioned by its own content
    lst = sorted(copied)
    with open(os.path.join(APP, "precache-list.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({"version": hashlib.md5("\n".join(lst).encode()).hexdigest()[:8], "assets": lst}, f, indent=0)
    # stale assets: anything under assets/ this build did not write
    for root, _, files in os.walk(os.path.join(APP, "assets")):
        for n in files:
            rel = os.path.relpath(os.path.join(root, n), APP).replace(os.sep, "/")
            if rel not in copied and not rel.startswith("assets/app/"):
                os.remove(os.path.join(root, n))
    subprocess.run([sys.executable, os.path.join(WS, "tools", "app", "stamp_cache.py"), APP], check=True)
    print("data.js %d KB: %d species, %d trinkets, %d items, %d trainers, %d links, %d edges, %d assets" % (
        len(js) // 1024, len(species), len(trinkets), len(items), len(trainers), len(links), len(edges), len(lst)))


if __name__ == "__main__":
    main()
