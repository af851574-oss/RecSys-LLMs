# Week 1 — LLM prompt journal

The starting point is the instructor's published example:

- App: https://dryjins.github.io/RecSys-LLMs/week1/
- Source prompt: https://github.com/dryjins/RecSys-LLMs/blob/main/week1/prompt.md
- Source code: https://github.com/dryjins/RecSys-LLMs/blob/main/week1/index.html

## 1. BUILD — inspect the baseline

> Read the Week 1 Random Lunch Generator source before changing it. Explain how a click becomes a recommendation, list every external dependency, and give me a reproducible way to test all menu entries instead of relying on random clicks. Do not propose a fix yet.

## 2. ASK WHY — diagnose the intermittent failure

> The food name always changes, but the food icon is blank for some randomly selected entries. Form hypotheses from the actual HTML and test them against the exact Font Awesome 6.4.0 CSS loaded by the page. Report which entries fail and cite direct source URLs. Do not infer that an icon exists from its plausible name.

## 3. TEST — challenge the diagnosis

> Review the diagnosis as a skeptical student. Check every icon class from `lunchMenu` against the loaded stylesheet, distinguish present selectors from missing selectors, and give exact counts. Reject any claim that is not supported by the source or a runnable check.

## 4. EXPLAIN — state the result in my own words

> Explain why the icon problem appears only sometimes even though the underlying configuration error is deterministic. Use the concrete 12/9/3 counts and distinguish what the source-level check proves from what the browser smoke test proves. Keep the explanation short and do not introduce new claims.

## 5. IMPROVE — request the smallest reliable fix

> Propose the smallest fix that guarantees a visible food symbol for every menu entry on GitHub Pages. Prefer browser-native features and remove an external dependency if it is no longer needed. Keep the app in plain HTML, CSS, and JavaScript. Add one small runnable regression check for all menu entries; do not add a framework or build step.

## 6. FINAL REVIEW — detect hallucinations

> Audit the final code, report, and references against each other. Verify that every URL opens, every named API or CSS class exists, every result number can be reproduced, and no test or observation is claimed unless it was actually performed. List contradictions as blockers; do not rewrite evidence to make it look successful.

## Baseline finding recorded before the fix

The page loads Font Awesome Free 6.4.0 from:
https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css

A selector-by-selector check found 9 of 12 configured food icon classes and did not find these three:

- Ramen — `fa-bowl-hot`
- Pasta — `fa-pasta`
- Soup — `fa-bowl`

This explains why the symptom looks intermittent: selection is random, while the failure is deterministic for 3 of 12 entries.

## Verification after the fix

The fix replaced all food icon classes with native emoji and removed the Font Awesome dependency. Checks actually run:

- `node week1/test.mjs` — `PASS: 12/12 menu entries have native symbols`
- extracted inline JavaScript with `node --check` — exit code 0
- served `/week1/` locally — HTTP 200 and expected page title
- loaded the local page in headless Chrome — exit code 0; the sampled Ramen result rendered as `🍜`
- published from `main`/root with GitHub Pages — the live `/week1/` URL returned HTTP 200; headless Chrome rendered the sampled Sushi result as `🍣`

Live app: https://af851574-oss.github.io/RecSys-LLMs/week1/

The regression test checks all configured entries; the two Chrome smoke tests check real browser paths without claiming exhaustive visual testing.
