# LLM4Rec Homework Report — Assignment A01

**Student:** Anna Grishkina

**Team:** Individual

**Date:** 2026-09-17

**Assignment:** A01 — Random Lunch Generator (Week 1)

**Live app:** https://af851574-oss.github.io/RecSys-LLMs/week1/

## Abstract

The starter Random Lunch Generator sometimes showed a food name without an icon. I checked all 12 menu items against the Font Awesome 6.4.0 file used by the page and found three icon names that did not exist there. I replaced the food icons with emoji and removed the external icon library. After the change, the check passed for all 12 menu items, and the app also worked locally and on GitHub Pages.

**Index Terms —** random recommendation, JavaScript, Font Awesome, GitHub Pages, debugging

## 1. Introduction

**Problem statement.** The provided web app chooses one lunch item at random when the user clicks a button [1]. The food name always appeared, but the icon was blank for some choices.

**Motivation.** This made the app look broken, and the problem was easy to miss because the same three meals were not selected on every run.

**Concrete example.** When the app selected Pasta, it showed the word “Pasta,” but the space above it was empty.

**Contributions.**

- Checked every icon name from the starter code instead of testing only random clicks.
- Fixed the missing icons without adding a framework, build step, or new dependency.

## 2. Related Work

I used the original Week 1 source code as the baseline [1] and checked its icon names against the exact Font Awesome stylesheet loaded by the page [2]. I also used the MDN pages for `Math.random()` [3] and `textContent` [4], plus the GitHub Pages setup guide [5]. I considered replacing only the three incorrect Font Awesome names, but that would leave the app dependent on an external icon file. Local image files were another option, but they would add more files and paths to maintain.

## 3. Method

**Approach.** I extracted the 12 icon classes from the starter menu and searched for each corresponding selector in Font Awesome 6.4.0. Nine were present. The missing classes were `fa-bowl-hot` for Ramen, `fa-pasta` for Pasta, and `fa-bowl` for Soup.

**Pipeline.** Button click → `Math.random()` → menu index → selected meal → update the name and emoji on the page.

**Tools and libraries.**

- HTML, CSS, and browser JavaScript (no framework)
- Node.js v24.10.0 for the regression check
- Google Chrome 152.0.7977.83 for the browser check
- GitHub Pages for static hosting

**Key decision.** I used native emoji for all meals, not only the three broken ones. This removed the cause of the problem and allowed the icon to be inserted with `textContent` instead of HTML.

**Configuration.** The menu still contains the original 12 meals. This assignment does not use a dataset, trained model, hyperparameters, or random seed.

## 4. Experiments

**Setup.** I compared every menu entry with the pinned stylesheet before the fix, then ran the local checks and one browser smoke test after the fix.

| Check | Baseline | Fixed version |
|---|---:|---:|
| Menu items | 12 | 12 |
| Font Awesome classes used | 12 | 0 |
| Classes missing from the loaded stylesheet | 3 | 0 |
| Non-empty native symbols configured | 0 | 12 |

**Verification performed.**

1. `node week1/test.mjs` printed `PASS: 12/12 menu entries have native symbols`.
2. The inline JavaScript passed `node --check`.
3. The local `/week1/` page returned HTTP 200.
4. The deployed page returned HTTP 200, and Chrome rendered a Sushi result with `🍣`.

The automated check covers all configured menu items. The Chrome run is a smoke test, not a claim that I visually checked every possible browser and operating system.

## 5. Discussion

**Failure case.** Ramen, Pasta, and Soup could appear with a blank icon and no JavaScript error.

**Root cause.** The three class names looked valid but had no matching selectors in the stylesheet. The app selected meals randomly, so the same code problem did not appear on every page load.

**Fix and verification.** I removed Font Awesome, added one emoji to each menu item, used `textContent` to display it, and reran the 12-item check.

**What worked.**

- Checking the actual CSS file identified all three missing selectors.
- Replacing the complete icon mapping was simpler than handling three meals differently.

**What surprised me or did not work.**

- A missing icon class does not produce a JavaScript error, so checking the console was not enough.
- Random selection made the same configuration bug look intermittent.

**Next improvement.** I would add a small browser test that selects each menu item in order. I did not add it now because the source-level check already covers the bug found in this assignment.

## 6. AI Usage Disclosure

**AI tools used.** Pi Coding Agent 0.85.1 with an OpenAI model through OpenRouter.

**How I used AI.** I used it to inspect the starter code, organize debugging prompts, edit the page, prepare the test, and review the report.

**What I verified myself.** I checked all 12 classes against the downloaded CSS, ran the commands listed in Section 4, opened every reference, inspected the final PDF, and tested the published page.

**What I trusted without verification.** I relied on browsers rendering standard Unicode emoji, but I did not check their appearance on every operating system.

**Session log.** The attached `argrishkina_a01_session.json` is a privacy-redacted audit generated from the clean final validation run and Git history. It contains verification tool calls, file changes, and milestones, but excludes conversational content and replaces local account identifiers. It is not an unmodified Pi export. The prompts and investigation notes are also recorded in `week1/prompt.md`.

## References

[1] J. S. Jin, “Random Lunch Menu Generator source,” *GitHub*, 2025. [Online]. Available: https://github.com/dryjins/RecSys-LLMs/blob/d8a178a50b1997cd0a5e25604be684b0179418db/week1/index.html. [Accessed: 2026-09-17].

[2] Fonticons, Inc., “Font Awesome Free 6.4.0 — all.min.css,” *cdnjs*. [Online]. Available: https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css. [Accessed: 2026-09-17].

[3] MDN Web Docs, “Math.random(),” Mozilla. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random. [Accessed: 2026-09-17].

[4] MDN Web Docs, “Node: textContent property,” Mozilla. [Online]. Available: https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent. [Accessed: 2026-09-17].

[5] GitHub Docs, “Creating a GitHub Pages site,” GitHub. [Online]. Available: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site. [Accessed: 2026-09-17].
