#!/usr/bin/env python3
"""Scaffold a new dish file: python tools/new_dish.py aloo-posto --section kobji-dubiye"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def main() -> None:
    sections = [s["id"] for s in json.loads((ROOT / "site.json").read_text(encoding="utf-8"))["sections"]]
    ap = argparse.ArgumentParser(description="Create dishes/<id>.json from a blank template.")
    ap.add_argument("id", help="lowercase-with-hyphens, e.g. aloo-posto")
    ap.add_argument("--section", required=True, choices=sections)
    args = ap.parse_args()

    path = ROOT / "dishes" / f"{args.id}.json"
    if path.exists():
        sys.exit(f"{path.relative_to(ROOT)} already exists; edit it instead.")

    dish = {
        "id": args.id,
        "name_bn": "",
        "name_en": args.id.replace("-", " ").capitalize(),
        "section": args.section,
        "tagline": "",
        "ingredients": [{"item_bn": "", "item_en": "", "qty": ""}],
        "steps": [{
            "action_bn": "",
            "action_en": "",
            "maa_says": "",
            "chemistry": {"title": "", "explanation": ""},
        }],
        "review": {"status": "draft", "notes": ""},
    }
    path.write_text(json.dumps(dish, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Created {path.relative_to(ROOT)}. Fill it in, then run: python build.py --serve")

if __name__ == "__main__":
    main()
