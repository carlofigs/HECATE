#!/usr/bin/env python3
"""
build_rules.py — parse DESIGN-STANDARD.md rule tables into rules.json + rules.yaml, lint them,
and (optionally) regenerate Appendix G in place.

Usage:  python design/build_rules.py DESIGN-STANDARD.md design/ [--update-appendix]
Exit 1 on any lint failure (CI gate for docs PRs). Stdlib only.

Row format (6 columns):
  | **R-04** | MUST | T0 | a11y · color | script | <rule text> ↳ refines R-01 |

Lint:
  L1  every rule row has Level, Tier, ≥1 Topic and a Check tag
  L2  Level ∈ {MUST, SHOULD, MAY}; Tier ∈ {T0, T1, T2}; Topics ⊆ vocabulary; Check ∈ {script, data, review, judgement}
  L3  every T0 rule is MUST
  L4  IDs unique
  L5  every ID referenced anywhere in the document (outside the changelog) is defined
  L6  every rule table header carries the metadata columns
  L7  every `refines` target exists, is not the rule itself, and has a tier number ≤ the refining rule's
  L8  no rule text contains a hard-coded scale that belongs in tokens.json (px lists of 4+ values)
"""
import json, re, sys
from collections import Counter

LEVELS = {"MUST", "SHOULD", "MAY"}
TIERS = {"T0", "T1", "T2"}
CHECKS = {"script", "data", "review", "judgement"}
TOPICS = {"a11y", "color", "type", "space", "layout", "motion", "tokens", "component", "interaction",
          "content", "viz", "doc", "docs", "governance", "process", "performance"}
ID = r"(?:P|R|T|C|D|G|M-(?:app|viz|site|doc))-\d{2}"
ROW = re.compile(r"^\| \*\*(" + ID + r")\*\* \| ([^|]*) \| ([^|]*) \| ([^|]*) \| ([^|]*) \| (.*) \|$")
HEAD = re.compile(r"^## (\d+)\. (.*)$|^### (\d+\.\d+) (.*)$")
OLD_HEADER = re.compile(r"^\| ID \| (?:Rule|Level \| Tier \| Topic \| Rule) \|$", re.M)
REFINES = re.compile(r"\s*↳ refines ((?:" + ID + r")(?:,\s*" + ID + r")*)\s*$")
SCALE = re.compile(r"(?:\d+\s*px[,/·\s]+){4,}")

def profiles_for(rule_id):
    m = re.match(r"M-(app|viz|site|doc)-", rule_id)
    return [m.group(1)] if m else ["all"]

def parse(md):
    rules, section = [], ""
    for ln, line in enumerate(md.splitlines(), 1):
        h = HEAD.match(line)
        if h:
            section = f"{h.group(1) or h.group(3)} {h.group(2) or h.group(4)}".strip(); continue
        m = ROW.match(line)
        if not m or m.group(1).startswith("P-"): continue
        rid, level, tier, topics, check, text = (s.strip() for s in m.groups())
        refines = []
        rm = REFINES.search(text)
        if rm:
            refines = [x.strip() for x in rm.group(1).split(",")]; text = text[:rm.start()].rstrip()
        rules.append({"id": rid, "level": level, "tier": tier,
                      "topics": [t for t in re.split(r"[·,\s]+", topics) if t], "check": check,
                      "refines": refines, "section": section, "profiles": profiles_for(rid),
                      "text": text.replace("**", ""), "line": ln})
    return rules

def lint(md, rules):
    errs, ids = [], [r["id"] for r in rules]
    byid = {r["id"]: r for r in rules}
    for rid, n in Counter(ids).items():
        if n > 1: errs.append(f"L4 duplicate id {rid}")
    for r in rules:
        if not (r["level"] and r["tier"] and r["topics"] and r["check"]): errs.append(f"L1 {r['id']} missing metadata (line {r['line']})")
        if r["level"] not in LEVELS: errs.append(f"L2 {r['id']} bad level {r['level']!r}")
        if r["tier"] not in TIERS: errs.append(f"L2 {r['id']} bad tier {r['tier']!r}")
        if r["check"] not in CHECKS: errs.append(f"L2 {r['id']} bad check {r['check']!r}")
        for t in r["topics"]:
            if t not in TOPICS: errs.append(f"L2 {r['id']} unknown topic {t!r}")
        if r["tier"] == "T0" and r["level"] != "MUST": errs.append(f"L3 {r['id']} is T0 but {r['level']}")
        for tgt in r["refines"]:
            if tgt == r["id"]: errs.append(f"L7 {r['id']} refines itself")
            elif tgt not in byid: errs.append(f"L7 {r['id']} refines unknown {tgt}")
            elif int(byid[tgt]["tier"][1]) > int(r["tier"][1]): errs.append(f"L7 {r['id']} ({r['tier']}) refines {tgt} ({byid[tgt]['tier']}) — target must be at least as blocking")
        if SCALE.search(r["text"]): errs.append(f"L8 {r['id']} embeds a value scale; move it to tokens.json")
    body = md[:md.rfind("\n## Changelog\n")]  # last heading: Appendix B's template also contains one
    defined = set(ids) | set(re.findall(r"\*\*(P-\d{2})\*\*", body))
    for rid in sorted(set(re.findall(r"\b(" + ID + r")\b", body)) - defined): errs.append(f"L5 referenced but undefined: {rid}")
    if OLD_HEADER.search(body): errs.append("L6 a rule table still uses an old header")
    return errs

def to_yaml(rules):
    out = []
    for r in rules:
        out += [f"- id: {r['id']}", f"  level: {r['level']}", f"  tier: {r['tier']}", f"  check: {r['check']}",
                f"  topics: [{', '.join(r['topics'])}]", f"  refines: [{', '.join(r['refines'])}]",
                f"  section: {json.dumps(r['section'])}", f"  profiles: [{', '.join(r['profiles'])}]",
                f"  text: {json.dumps(r['text'])}"]
    return "\n".join(out) + "\n"

def short(t):
    t = re.sub(r"\(.*?\)", "", t); t = re.split(r"\. |: |; ", t)[0].strip()
    return (t[:95] + "…") if len(t) > 95 else t

def appendix_g(rules, version):
    lvl, tier, chk = (Counter(r[k] for r in rules) for k in ("level", "tier", "check"))
    t0 = "\n".join(f"| **{r['id']}** | {' · '.join(r['topics'])} | {short(r['text'])} |" for r in rules if r["tier"] == "T0")
    topics = ["a11y","color","type","space","layout","motion","tokens","component","interaction","content","viz","doc","docs","governance","process","performance"]
    mat = {t: Counter() for t in topics}
    for r in rules:
        for t in r["topics"]: mat[t][r["tier"]] += 1; mat[t]["n"] += 1
    matrix = "\n".join(f"| {t} | {mat[t]['T0']} | {mat[t]['T1']} | {mat[t]['T2']} | {mat[t]['n']} |" for t in topics)
    checks = "\n".join(f"| {k} | {chk[k]} | {', '.join(r['id'] for r in rules if r['check']==k) if k in ('judgement',) else ''} |" for k in ("script","data","review","judgement"))
    return f"""## Appendix G — Rule index and Tier 0 register

<!-- generated by build_rules.py --update-appendix; do not edit by hand -->

Counts (v{version}): {len(rules)} rules — {sum(1 for r in rules if not r['refines'])} root obligations + {sum(1 for r in rules if r['refines'])} refinements. Level: {lvl['MUST']} MUST · {lvl['SHOULD']} SHOULD · {lvl['MAY']} MAY; Tier: {tier['T0']} T0 · {tier['T1']} T1 · {tier['T2']} T2.

### G.1 Tier 0 register — the rules that block shipping in every context

An agent checks this list first. If any item fails and cannot be fixed, the work is not done, whatever else passed.

| ID | Topic | Rule (abridged — see full text) |
|---|---|---|
{t0}

### G.2 Topic × Tier matrix

A rule with two topics is counted under both.

| Topic | T0 | T1 | T2 | Total |
|---|---|---|---|---|
{matrix}

### G.3 Drift exposure — how each rule is checked

| Check | Rules | Judgement-only rules |
|---|---|---|
{checks}

`script`: a shipped or standard tool verifies it (contrast/CVD validator, literal grep, axe, lint). `data`: conformance means the value comes from `tokens.json`. `review`: a person or agent can answer yes/no by inspection against stated criteria. `judgement`: taste — the drift surface; kept deliberately small.

### G.4 Machine-readable index

`build_rules.py` parses every rule row of this file into `design/rules.json` and `design/rules.yaml`:

```yaml
- id: R-04
  level: MUST
  tier: T0
  check: script
  topics: [a11y, color]
  refines: [R-01]
  section: "3.1 Accessibility"
  profiles: [all]        # or [viz] etc. for M-* rules
  text: "Information MUST NOT be conveyed by colour alone. …"
```

The build lints: every rule has all four tags; every `T0` is `MUST`; IDs unique; every ID referenced in the document exists; `refines` targets exist and are at least as blocking; no rule text embeds a value scale. It exits non-zero on any failure, so it can gate a docs PR. `--update-appendix` regenerates this appendix.

Agents filter the index rather than parsing prose:

```bash
python design/rules.py --tier T0                     # blocking list
python design/rules.py --topic a11y --level MUST     # every accessibility MUST, whichever section it lives in
python design/rules.py --profile viz                 # core + viz-profile rules for a dashboard task
python design/rules.py --check judgement             # the rules that need a human eye
python design/rules.py --refines R-26                # every specialisation of a rule (data-view states)
```
"""

def main(src, outdir, update_appendix=False):
    md = open(src, encoding="utf-8").read()
    version = (re.search(r"\*\*Version:\*\* (\S+)", md) or [None, "?"])[1]
    rules = parse(md)
    if update_appendix:
        start = md.find("## Appendix G"); end = md.rfind("\n---\n\n## Changelog")
        assert start > 0 and end > start, "Appendix G / Changelog anchors not found"
        md = md[:start] + appendix_g(rules, version) + md[end:]
        open(src, "w", encoding="utf-8").write(md)
    errs = lint(md, rules)
    for r in rules: r.pop("line")
    payload = {"standard": "DESIGN-STANDARD.md", "version": version,
               "counts": {"rules": len(rules), "level": dict(Counter(r["level"] for r in rules)),
                          "tier": dict(Counter(r["tier"] for r in rules)), "check": dict(Counter(r["check"] for r in rules))},
               "rules": rules}
    outdir = outdir.rstrip("/")
    json.dump(payload, open(f"{outdir}/rules.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    open(f"{outdir}/rules.yaml", "w", encoding="utf-8").write(f"# generated by build_rules.py from {src} v{version} — do not edit\n" + to_yaml(rules))
    print(f"{len(rules)} rules → {outdir}/rules.json, rules.yaml  {payload['counts']}")
    if errs:
        print("\nLINT FAILURES:"); [print("  " + e) for e in errs]; sys.exit(1)
    print("lint: OK")

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0], args[1] if len(args) > 1 else "design", "--update-appendix" in sys.argv)
