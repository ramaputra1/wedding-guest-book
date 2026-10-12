# Phase <N> — <Name>

**Branch:** `phase-<N>-<slug>`
**Date:** <YYYY-MM-DD>
**Verdict:** <READY TO MERGE | NOT READY>

---

## What was built

Two or three paragraphs in plain language. What exists now that didn't before, and how it works. Write it for the owner reading this in six months, not for yourself today.

Name the files added or changed and what each is for. No need to list every line — the diff shows that. Explain the shape of the thing.

---

## Acceptance criteria

Copy every criterion from `docs/PHASES.md` for this phase. Mark each honestly.

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | <criterion text> | PASS / FAIL / NEEDS DEVICE TEST | how it was verified |
| 2 | | | |

**Rules for this table:**
- `PASS` means it was actually verified. Not "should work," not "looks right."
- `NEEDS DEVICE TEST` is the correct answer for anything requiring an iPad, a real camera, Apple Pencil, or venue wifi. It is never a failure — it is an honest handoff.
- Evidence means a command and its output, a test name, a screenshot path, or a described manual check. "Implemented" is not evidence.

---

## Tests

| Test | Command | Result |
|---|---|---|
| | | |

Paste the meaningful output. If a test was written but not run, say so.

```
<test output>
```

---

## Verified by hand

What was checked manually, and in what. Browser and viewport for anything visual.

- 
- 

---

## Needs a real device

Everything that cannot be proven in a browser on a laptop. Be specific about what the owner should look for and what "wrong" would look like.

| What to test | On | What good looks like | What to watch for |
|---|---|---|---|
| | | | |

---

## Deferred

Work noticed during this phase that belongs to a later one. Note the phase it belongs to.

- 

---

## Problems and surprises

Anything that didn't go as the plan expected — a browser quirk, a wrong assumption in the docs, a limit discovered. **Include things that were worked around**, not just things that broke. This section is where the next phase's nasty surprise gets prevented.

If a document in `docs/` is now wrong because of something learned here, say which one and what it should say. Do not silently edit the architecture.

- 

---

## Owner actions before the next phase

Things only the owner can do — accounts, secrets, assets, decisions.

- [ ] 

---

## Verdict

**<READY TO MERGE | NOT READY>**

If READY: one sentence on what the owner is merging.

If NOT READY: the blocker list, each with what is needed to clear it.

| Blocker | What would clear it |
|---|---|
| | |
