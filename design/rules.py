#!/usr/bin/env python3
"""
rules.py: query the generated rules index (design/rules.json).

Usage:
  python design/rules.py --tier T0
  python design/rules.py --topic a11y --level MUST
  python design/rules.py --profile viz            # 'all' rules + the viz profile
  python design/rules.py --id R-04
  python design/rules.py --check judgement
  python design/rules.py --refines R-26               # specialisations of a rule
  python design/rules.py --topic color --format json
Filters combine with AND. Output: table (default), ids, or json.
"""
import argparse, json, os, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", default=os.path.join(os.path.dirname(__file__), "rules.json"))
    ap.add_argument("--tier"); ap.add_argument("--level"); ap.add_argument("--topic")
    ap.add_argument("--profile"); ap.add_argument("--id"); ap.add_argument("--section")
    ap.add_argument("--check"); ap.add_argument("--refines", help="list rules that refine this ID")
    ap.add_argument("--format", choices=["table", "ids", "json"], default="table")
    a = ap.parse_args()
    rules = json.load(open(a.index, encoding="utf-8"))["rules"]
    def keep(r):
        return ((not a.tier or r["tier"] == a.tier.upper()) and
                (not a.level or r["level"] == a.level.upper()) and
                (not a.topic or a.topic in r["topics"]) and
                (not a.profile or "all" in r["profiles"] or a.profile in r["profiles"]) and
                (not a.id or r["id"].lower() == a.id.lower()) and
                (not a.section or r["section"].lower().startswith(a.section.lower())) and
                (not a.check or r["check"] == a.check.lower()) and
                (not a.refines or a.refines.lower() in [x.lower() for x in r.get("refines", [])]))
    hits = [r for r in rules if keep(r)]
    if not hits:                      # silent-empty is the failure mode that hides typos and case bugs
        known = {r["id"].lower() for r in rules}
        for flag, val in (("--id", a.id), ("--refines", a.refines)):
            if val and val.lower() not in known:
                print(f"warning: {flag} {val!r} is not a rule ID in this index", file=sys.stderr)
        print("-- 0 rule(s) matched", file=sys.stderr)
    order = {"T0": 0, "T1": 1, "T2": 2}; lvl = {"MUST": 0, "SHOULD": 1, "MAY": 2}
    hits.sort(key=lambda r: (order[r["tier"]], lvl[r["level"]], r["id"]))
    if a.format == "json": print(json.dumps(hits, indent=2, ensure_ascii=False)); return
    if a.format == "ids": print(" ".join(r["id"] for r in hits)); return
    for r in hits:
        ref = f" ↳ {','.join(r['refines'])}" if r.get("refines") else ""
        print(f"{r['id']:<10} {r['level']:<6} {r['tier']} {r['check']:<9} [{', '.join(r['topics'])}]{ref}  {r['text'][:100]}")
    print(f"-- {len(hits)} rule(s)", file=sys.stderr)

if __name__ == "__main__":
    main()
