# মিশ্রণ · Mishron

মায়ের রান্নার খাতা, রসায়নের চোখে. A Bengali kitchen notebook, read through chemistry.

Every recipe pairs three voices at each step: what you do, what মা says, and what's
actually happening in the pan. The site is static: dish files go in, HTML comes out,
and GitHub Pages hosts it for free.

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python build.py --serve        # builds site/ and previews at http://localhost:8000
```

`build.py` options: `--strict` fails on warnings too (CI uses this for pull requests),
`--no-drafts` leaves out unverified dishes, `--port` changes the preview port.

## Adding a dish

1. `python tools/new_dish.py aloo-posto --section kobji-dubiye` creates a blank file,
   or draft one with an LLM using `tools/draft_prompt.md`.
2. Fill it in. Every molecule with a `smiles` string is drawn automatically by RDKit;
   proteins and other large molecules without one get a drawn coil instead.
3. Check every chemistry claim, then set `"review": {"status": "verified"}`. Draft
   pages show a notice asking readers to report mistakes.
4. `python build.py --serve` to preview, then commit and push.

The build tells you exactly what's wrong and where, for example:

```
error    dishes/beguni.json: quiz/0: answer index 9 is out of range
error    dishes/beguni.json steps/1: RDKit could not parse SMILES 'C1CC(('
```

## Project layout

```
site.json                 site title, tagline, repo URL, and the four sections
schema/dish.schema.json   the shape every dish must follow
dishes/*.json             one file per dish; the file name must match its id
templates/                Jinja2 templates for the contents page and dish pages
templates/art/            folk-style illustrations, one per dish or section id
static/                   style.css and app.js (quiz, show-all toggle, print)
tools/                    new-dish scaffolder and the LLM drafting prompt
build.py                  validates, renders molecules and energy diagrams, writes site/
```

Sections live in `site.json`, so adding one (say, পুজোর ভোগ) is a config change, not a
code change.

Each dish and section page shows the illustration in `templates/art/` whose file name
matches its id (`rosogolla.svg`, `mishti-mukh.svg`). A dish without its own drawing
uses its section's. The drawings are inline SVG with fill classes (`r` crimson, `y`
basanti, `c` cream, `w` rice white, `g` leaf, `o` terracotta, `v` aubergine) that
`static/style.css` colours.

## Publishing on GitHub Pages

1. Create a repo called `mishron` and push this folder to `main`.
2. In `site.json`, set `repo_url` to your repo's URL (it powers the submission and
   report-a-mistake links).
3. In the repo, go to Settings → Pages and set Source to **GitHub Actions**.
4. Every push to `main` now rebuilds and deploys the site. Pull requests get a strict
   build check but don't deploy.

## Recipe submissions

`.github/ISSUE_TEMPLATE/submit-recipe.yml` gives visitors a form for sending in family
recipes, including what their মা said at each step and a consent checkbox for
CC BY-SA 4.0. Nothing goes live until you've added and checked the chemistry.

## Design notes

Two notebooks on one page: মা's ruled রান্নার খাতা (Sulekha-blue ink, an alta-red
binding, haldi highlights on her lines) and a lab notebook's graph paper, which appears
only inside the chemistry notes. Type is Galada for headlines and মা's voice, Tiro
Bangla for recipe text in both scripts, and IBM Plex Sans in the lab notes. It supports
dark mode, works without JavaScript, and prints with the chemistry expanded.
