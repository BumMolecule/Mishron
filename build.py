#!/usr/bin/env python3
"""মিশ্রণ (Mishron) site builder.

Reads dishes/*.json, validates them, renders molecule and energy-diagram
SVGs, and writes a static site into site/.

Usage:
    python build.py              # build into site/
    python build.py --strict     # treat warnings as errors (use in CI)
    python build.py --no-drafts  # leave out dishes whose review status is draft
    python build.py --serve      # build, then preview at http://localhost:8000
"""

from __future__ import annotations

import argparse
import hashlib
import http.server
import json
import re
import shutil
import socketserver
import sys
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, TemplateError, select_autoescape
from markupsafe import Markup, escape

try:
    import jsonschema
except ImportError:  # validation degrades to basic checks
    jsonschema = None

try:
    from rdkit import Chem, RDLogger
    from rdkit.Chem import rdMolDescriptors
    from rdkit.Chem.Draw import rdMolDraw2D

    RDLogger.DisableLog("rdApp.*")
except ImportError:  # molecules degrade to a text fallback
    Chem = None

ROOT = Path(__file__).resolve().parent
DISHES_DIR = ROOT / "dishes"
OUT_DIR = ROOT / "site"
CACHE_DIR = ROOT / ".cache" / "molecules"
RENDER_VERSION = "5"  # bump to invalidate the molecule cache after changing drawing options

BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


# ---------------------------------------------------------------- reporting

@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def error(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append(f"{where}: {msg}")

    def print(self) -> None:
        for w in self.warnings:
            print(f"  warning  {w}")
        for e in self.errors:
            print(f"  error    {e}")


# ---------------------------------------------------------------- loading

def load_json(path: Path, report: Report):
    where = str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else path.name
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        report.error(where, f"invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}")
    except OSError as exc:
        report.error(where, f"could not read file: {exc}")
    return None


def validate_dish(dish: dict, path: Path, schema: dict | None, section_ids: set[str], report: Report) -> bool:
    where = f"dishes/{path.name}"
    ok = True

    if jsonschema is not None and schema is not None:
        validator = jsonschema.Draft202012Validator(schema)
        for err in sorted(validator.iter_errors(dish), key=lambda e: list(e.path)):
            loc = "/".join(str(p) for p in err.path) or "(top level)"
            report.error(where, f"{loc}: {err.message}")
            ok = False
        if not ok:
            return False
    elif jsonschema is None:
        report.warn(where, "jsonschema is not installed; only basic checks were run")

    if dish.get("id") != path.stem:
        report.error(where, f"id '{dish.get('id')}' must match the file name '{path.stem}'")
        ok = False
    if dish.get("section") not in section_ids:
        report.error(where, f"section '{dish.get('section')}' is not defined in site.json "
                            f"(expected one of: {', '.join(sorted(section_ids))})")
        ok = False
    for i, q in enumerate(dish.get("quiz", [])):
        if not 0 <= q.get("answer", -1) < len(q.get("options", [])):
            report.error(where, f"quiz/{i}: answer index {q.get('answer')} is out of range")
            ok = False
    for i, step in enumerate(dish.get("steps", [])):
        if "maa_says" not in step:
            report.warn(where, f"steps/{i}: no maa_says line")
        if "chemistry" not in step:
            report.warn(where, f"steps/{i}: no chemistry block")
    return ok


# ---------------------------------------------------------------- molecules

def render_molecule(smiles: str, where: str, report: Report) -> dict:
    """Return {'svg': Markup | None, 'formula': str | None}. Cached on disk."""
    if Chem is None:
        report.warn(where, "RDKit is not installed; molecules will show as text")
        return {"svg": None, "formula": None}

    key = hashlib.sha1(f"{RENDER_VERSION}:{smiles}".encode()).hexdigest()[:16]
    svg_path, formula_path = CACHE_DIR / f"{key}.svg", CACHE_DIR / f"{key}.txt"
    if svg_path.exists() and formula_path.exists():
        formula, _, heavy = formula_path.read_text().partition("|")
        return {"svg": Markup(svg_path.read_text()), "formula": formula, "heavy_atoms": int(heavy or 0)}

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        report.error(where, f"RDKit could not parse SMILES '{smiles}'")
        return {"svg": None, "formula": None, "heavy_atoms": 0}

    wide = mol.GetNumHeavyAtoms() > 20
    drawer = rdMolDraw2D.MolDraw2DSVG(*((620, 200) if wide else (320, 220)))
    opts = drawer.drawOptions()
    opts.clearBackground = False
    opts.useBWAtomPalette()
    opts.bondLineWidth = 2
    opts.padding = 0.12
    opts.minFontSize = 13
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()

    # Make the drawing inline-friendly: no XML prolog, scalable, and inked in
    # currentColor so it follows the page's light/dark theme.
    svg = re.sub(r"<\?xml[^>]*\?>\s*", "", svg)
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S)
    svg = re.sub(r"width='\d+px' height='\d+px'", "class='mol' role='img' aria-hidden='true'", svg, count=1)
    svg = svg.replace("#000000", "currentColor").replace("#FFFFFF", "none")

    formula = rdMolDescriptors.CalcMolFormula(mol)
    heavy = mol.GetNumHeavyAtoms()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    svg_path.write_text(svg)
    formula_path.write_text(f"{formula}|{heavy}")
    return {"svg": Markup(svg), "formula": formula, "heavy_atoms": heavy}


def _protein_glyph() -> Markup:
    """A schematic coiled backbone for proteins too large to draw atom by atom."""
    import math
    pts, a, b = [], 7.0, 13.0  # prolate cycloid: loops look like a helix seen side-on
    for i in range(0, 361):
        t = i / 360 * 6 * math.pi
        pts.append((24 + a * t - b * math.sin(t), 60 - b * math.cos(t)))
    d = "M4,60 L" + f"{pts[0][0]:.1f},{pts[0][1]:.1f} " + " ".join(f"L{x:.1f},{y:.1f}" for x, y in pts[1:])
    d += f" L{pts[-1][0] + 36:.1f},{pts[-1][1]:.1f}"
    return Markup(
        f"<svg class='mol protein' viewBox='0 42 {pts[-1][0] + 44:.0f} 36' role='img' aria-hidden='true'>"
        f"<path d='{d}' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/>"
        "</svg>"
    )


PROTEIN_GLYPH = _protein_glyph()


def formula_html(formula: str | None) -> Markup:
    if not formula:
        return Markup("")
    # C12H22O11 -> C<sub>12</sub>H<sub>22</sub>O<sub>11</sub>; charges become superscripts
    out = re.sub(r"(?<=[A-Za-z\)])(\d+)", r"<sub>\1</sub>", str(escape(formula)))
    out = re.sub(r"([+-])$", r"<sup>\1</sup>", out)
    return Markup(out)


# ---------------------------------------------------------------- energy diagrams

def _wrap(text: str, width: int = 16) -> list[str]:
    words, lines, line = text.split(), [], ""
    for w in words:
        if line and len(line) + 1 + len(w) > width:
            lines.append(line)
            line = w
        else:
            line = f"{line} {w}".strip()
    if line:
        lines.append(line)
    return lines


def render_energy_diagram(diagram: dict) -> Markup:
    """Reaction-coordinate style diagram: flat plateaus joined by smooth curves."""
    stages = diagram["stages"]
    n = len(stages)
    W, H = 560, 260
    left, right, top, plot_bottom = 44, 8, 18, 170
    plateau = 44
    span = (W - left - right - plateau) / max(n - 1, 1)

    pts = []
    for i, s in enumerate(stages):
        cx = left + plateau / 2 + i * span
        cy = top + (1 - s["energy"]) * (plot_bottom - top)
        pts.append((cx, cy))

    d = f"M{pts[0][0] - plateau / 2:.1f},{pts[0][1]:.1f} H{pts[0][0] + plateau / 2:.1f}"
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        sx, ex = x0 + plateau / 2, x1 - plateau / 2
        mid = (sx + ex) / 2
        d += f" C{mid:.1f},{y0:.1f} {mid:.1f},{y1:.1f} {ex:.1f},{y1:.1f} H{x1 + plateau / 2:.1f}"

    parts = [
        f"<svg class='energy' viewBox='0 0 {W} {H}' role='img' aria-label='Energy diagram'>",
        f"<line class='axis' x1='{left - 16}' y1='{top - 6}' x2='{left - 16}' y2='{plot_bottom + 8}'/>",
        f"<line class='axis' x1='{left - 16}' y1='{plot_bottom + 8}' x2='{W - right}' y2='{plot_bottom + 8}'/>",
        f"<text class='ylab' transform='translate({left - 24},{(top + plot_bottom) / 2}) rotate(-90)' "
        f"text-anchor='middle'>{escape(diagram.get('y_label', 'Energy'))}</text>",
        f"<path class='curve' d='{d}'/>",
    ]
    for i, ((x, y), s) in enumerate(zip(pts, stages)):
        parts.append(f"<circle class='dot' cx='{x:.1f}' cy='{y:.1f}' r='3.5'/>")
        # Edge labels hug the plateau's outer end so they never run off the canvas.
        if i == 0 and n > 1:
            lx, anchor = x - plateau / 2, "start"
        elif i == n - 1 and n > 1:
            lx, anchor = x + plateau / 2, "end"
        else:
            lx, anchor = x, "middle"
        lines = _wrap(s["label"])
        tspans = "".join(
            f"<tspan x='{lx:.1f}' dy='{0 if j == 0 else 14}'>{escape(line)}</tspan>"
            for j, line in enumerate(lines)
        )
        parts.append(f"<text class='stage' x='{lx:.1f}' y='{plot_bottom + 28}' text-anchor='{anchor}'>{tspans}</text>")
    parts.append("</svg>")
    return Markup("".join(parts))


# ---------------------------------------------------------------- build

OPTIONAL_DEFAULTS = {
    "dish": {"serves": None, "time_minutes": None, "contributor": None, "golpo": None,
             "quote": None, "trivia": [], "quiz": [], "further_reading": []},
    "contributor": {"credit": None},
    "golpo": {"source": None},
    "quote": {"translation": None, "source": None},
    "ingredient": {"qty": None},
    "step": {"maa_says": None, "chemistry": None},
    "chemistry": {"molecules": [], "energy_diagram": None, "energy_svg": None},
    "molecule": {"smiles": None, "note": None},
    "energy_diagram": {"caption": None},
}


def _defaults(obj: dict | None, kind: str) -> None:
    if obj is not None:
        for key, value in OPTIONAL_DEFAULTS[kind].items():
            obj.setdefault(key, value.copy() if isinstance(value, list) else value)


def enrich(dish: dict, report: Report) -> dict:
    """Fill optional fields (templates run with StrictUndefined) and render SVGs."""
    where = f"dishes/{dish['id']}.json"
    _defaults(dish, "dish")
    for kind in ("contributor", "golpo", "quote"):
        _defaults(dish[kind], kind)
    for ing in dish["ingredients"]:
        _defaults(ing, "ingredient")
    for i, step in enumerate(dish["steps"]):
        _defaults(step, "step")
        chem = step["chemistry"]
        if not chem:
            continue
        _defaults(chem, "chemistry")
        _defaults(chem["energy_diagram"], "energy_diagram")
        for mol in chem["molecules"]:
            _defaults(mol, "molecule")
        for mol in chem.get("molecules", []):
            rendered = render_molecule(mol["smiles"], f"{where} steps/{i}", report) if mol.get("smiles") else {}
            mol["svg"] = rendered.get("svg") or (None if mol["smiles"] else PROTEIN_GLYPH)
            mol["formula_html"] = formula_html(rendered.get("formula"))
            mol["wide"] = rendered.get("heavy_atoms", 0) > 20  # long molecules get two grid columns
        if chem.get("energy_diagram"):
            chem["energy_svg"] = render_energy_diagram(chem["energy_diagram"])
    return dish


def build(strict: bool, include_drafts: bool) -> int:
    report = Report()
    site = load_json(ROOT / "site.json", report)
    schema = load_json(ROOT / "schema" / "dish.schema.json", report)
    if site is None:
        report.print()
        return 1

    sections = site["sections"]
    section_ids = {s["id"] for s in sections}

    dishes = []
    paths = sorted(DISHES_DIR.glob("*.json"))
    if not paths:
        report.warn("dishes/", "no dish files found; the site will only show empty sections")
    for path in paths:
        dish = load_json(path, report)
        if dish is None or not validate_dish(dish, path, schema, section_ids, report):
            continue
        if not include_drafts and dish["review"]["status"] == "draft":
            continue
        dishes.append(enrich(dish, report))

    if report.errors or (strict and report.warnings):
        print("Build stopped:")
        report.print()
        if strict and report.warnings and not report.errors:
            print("  (--strict treats warnings as errors)")
        return 1

    by_section = {s["id"]: [] for s in sections}
    for dish in dishes:
        by_section[dish["section"]].append(dish)
    for items in by_section.values():
        items.sort(key=lambda d: d["name_en"].lower())
    section_lookup = {s["id"]: s for s in sections}

    env = Environment(
        loader=FileSystemLoader(ROOT / "templates"),
        autoescape=select_autoescape(["html"]),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["bn_digits"] = lambda v: str(v).translate(BN_DIGITS)

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    (OUT_DIR / "dishes").mkdir(parents=True)
    shutil.copytree(ROOT / "static", OUT_DIR / "static")
    (OUT_DIR / ".nojekyll").touch()

    submit_url = site["repo_url"].rstrip("/") + "/issues/new?template=submit-recipe.yml"
    common = {"site": site, "sections": sections, "submit_url": submit_url}

    try:
        (OUT_DIR / "index.html").write_text(
            env.get_template("index.html").render(root="", by_section=by_section, dish_count=len(dishes), **common),
            encoding="utf-8",
        )
    except TemplateError as exc:
        report.error("templates/index.html", f"{type(exc).__name__}: {exc}")
    for dish in dishes:
        siblings = by_section[dish["section"]]
        idx = siblings.index(dish)
        try:
            html = env.get_template("dish.html").render(
                root="../",
                dish=dish,
                section=section_lookup[dish["section"]],
                prev_dish=siblings[idx - 1] if idx > 0 else None,
                next_dish=siblings[idx + 1] if idx < len(siblings) - 1 else None,
                issue_url=site["repo_url"].rstrip("/") + "/issues/new?title=" + dish["id"] + "%3A%20",
                **common,
            )
        except TemplateError as exc:
            report.error(f"templates/dish.html ({dish['id']})", f"{type(exc).__name__}: {exc}")
            continue
        (OUT_DIR / "dishes" / f"{dish['id']}.html").write_text(html, encoding="utf-8")

    if report.errors:
        print("Build failed while rendering templates:")
        report.print()
        return 1
    report.print()
    drafts = sum(d["review"]["status"] == "draft" for d in dishes)
    print(f"Built {len(dishes)} dish page(s) into {OUT_DIR.relative_to(ROOT)}/ "
          f"({drafts} draft, {len(dishes) - drafts} verified).")
    return 0


def serve(port: int) -> None:
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(OUT_DIR))
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"Previewing at http://localhost:{port}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the মিশ্রণ static site.")
    ap.add_argument("--strict", action="store_true", help="fail on warnings as well as errors")
    ap.add_argument("--no-drafts", action="store_true", help="skip dishes with review status 'draft'")
    ap.add_argument("--serve", action="store_true", help="serve the built site locally")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    code = build(strict=args.strict, include_drafts=not args.no_drafts)
    if code == 0 and args.serve:
        serve(args.port)
    sys.exit(code)


if __name__ == "__main__":
    main()
