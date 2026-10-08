// HW4 analysis — printed with only the implemented functions from script.js
// (findFrequentItemsets, generateRules, countItemset, computeSupport,
// computeConfidence, computeLift, dedupeBasket). Deterministic, no files
// written. Run: node week4/analysis.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// Same minimal window/document stubs as test.mjs, so the real script.js boots
// in node exactly as in the browser.
const element = () => {
  const el = { dataset: {}, value: '1', _html: '', _text: '' };
  const strip = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html,
    set: (v) => { el._html = String(v); el._text = strip(v); },
  });
  Object.defineProperty(el, 'textContent', {
    get: () => el._text,
    set: (v) => { el._text = String(v); el._html = ''; },
  });
  el.addEventListener = () => {};
  el.querySelectorAll = () => [];
  el.querySelector = () => element();
  return el;
};
const document = {
  readyState: 'complete',
  getElementById: () => element(),
  createElement: () => element(),
  addEventListener() {},
  body: { innerHTML: '' },
};
const sandbox = { console, document };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(read('transactions.js'), ctx);
vm.runInContext(read('script.js'), ctx);
const run = (expression) => vm.runInContext(expression, ctx);

// The implemented functions and the decoded baskets, straight from the module.
const { findFrequentItemsets, generateRules, countItem, computeConfidence, computeLift } = {
  findFrequentItemsets: run('findFrequentItemsets'),
  generateRules: run('generateRules'),
  countItem: run('countItem'),
  computeConfidence: run('computeConfidence'),
  computeLift: run('computeLift'),
};
const TRANSACTIONS = run('TRANSACTIONS');
const N = run('N');
const { stocks, descriptions } = run(
  'JSON.parse(JSON.stringify({ stocks: data.stocks, descriptions: data.descriptions }))',
);
const descriptionOf = new Map(stocks.map((s, i) => [s, descriptions[i]]));
const label = (items) => items.map((s) => `${s} ${descriptionOf.get(s) || ''}`).join(' + ');

const pct = (x, digits = 2) => `${(x * 100).toFixed(digits)}%`;
const num = (x, digits = 4) => x.toFixed(digits);
const row = (rule) =>
  `${label(rule.antecedent)} | ${label(rule.consequent)} | ${String(rule.antecedentCount).padStart(4)} | `
  + `${String(rule.consequentCount).padStart(4)} | ${String(rule.jointCount).padStart(4)} | `
  + `${pct(rule.support).padStart(7)} | ${pct(rule.confidence).padStart(10)} | ${num(rule.lift)}`;
const header = 'A (antecedent) | B (consequent) | count(A) | count(B) | count(AuB) | support | confidence | lift';

// Mine once per support level; the confidence sweep reuses the itemsets.
const SUPPORTS = [0.005, 0.01, 0.02, 0.03];
const CONFIDENCES = [0.3, 0.5, 0.6];
const mined = new Map();
for (const support of SUPPORTS) {
  const t0 = Date.now();
  const itemsets = findFrequentItemsets(TRANSACTIONS, support);
  mined.set(support, { itemsets, ms: Date.now() - t0 });
}

// Chosen final thresholds (justified against the sweep below).
const MIN_SUPPORT = 0.01;
const MIN_CONFIDENCE = 0.5;

console.log(`HW4 analysis — UCI Online Retail, N = ${N.toLocaleString('en-US')} baskets,`
  + ` ${descriptionOf.size.toLocaleString('en-US')} distinct items`);
console.log('All numbers come from week4/script.js (Apriori + rule generation).\n');

// ---------------------------------------------------------------------------
// 1. Threshold sweep
// ---------------------------------------------------------------------------
console.log('=== 1. Threshold sweep: support x confidence ===');
console.log('support | conf  | itemsets by size (size:count) | total sets | rules   | lift > 1 | miner');
console.log('--------|-------|-------------------------------|------------|---------|----------|------');
for (const support of SUPPORTS) {
  const { itemsets, ms } = mined.get(support);
  const bySize = new Map();
  for (const itemset of itemsets) {
    bySize.set(itemset.items.length, (bySize.get(itemset.items.length) || 0) + 1);
  }
  const sizeText = [...bySize.entries()].sort((a, b) => a[0] - b[0])
    .map(([size, count]) => `${size}:${count}`).join(' ');
  for (const confidence of CONFIDENCES) {
    const rules = generateRules(itemsets, confidence);
    console.log(
      `${pct(support, 1).padStart(7)} | ${pct(confidence, 0).padStart(5)} | ${sizeText.padEnd(29)} | `
      + `${String(itemsets.length).padStart(10)} | ${String(rules.length).padStart(7)} | `
      + `${String(rules.filter((r) => r.lift > 1).length).padStart(8)} | ${ms} ms`,
    );
  }
}
console.log('\nReading of the sweep: support alone decides which itemsets are frequent (each');
console.log('row shares one mining run — confidence never re-mines), so the rules column is');
console.log('confidence-driven at fixed support and collapses as support rises: downward');
console.log('closure kills small itemsets first, and every rule from a killed itemset dies with it.\n');

// ---------------------------------------------------------------------------
// 2. Final rule table at the chosen thresholds, top 15 by lift
// ---------------------------------------------------------------------------
const { itemsets: finalItemsets, ms: finalMs } = mined.get(MIN_SUPPORT);
const finalRules = generateRules(finalItemsets, MIN_CONFIDENCE);
const looseRules = generateRules(mined.get(0.005).itemsets, 0.1);
console.log(`=== 2. Final rule table: support >= ${pct(MIN_SUPPORT, 1)},`
  + ` confidence >= ${pct(MIN_CONFIDENCE, 0)} — top 15 of ${finalRules.length} rules by lift ===`);
console.log(`${finalRules.length} rules pass; ${finalRules.filter((r) => r.lift > 1).length} have lift > 1`
  + ` (miner ${finalMs} ms).`);
console.log(header);
finalRules.slice(0, 15).forEach((rule, i) => {
  console.log(`${String(i + 1).padStart(2)} | ${row(rule)}`);
});
console.log(`Why ${pct(MIN_SUPPORT, 1)}/${pct(MIN_CONFIDENCE, 0)}: at 0.5% support the same confidence cut `
  + `returns ${generateRules(mined.get(0.005).itemsets, MIN_CONFIDENCE).length} rules and mining takes `
  + `${mined.get(0.005).ms} ms instead of ${finalMs} ms, while 2% and 3% support keep only `
  + `${generateRules(mined.get(0.02).itemsets, MIN_CONFIDENCE).length} and `
  + `${generateRules(mined.get(0.03).itemsets, MIN_CONFIDENCE).length} rules and lose every `
  + '3+-item pattern; 1% keeps a readable table with the strongest pairs plus a few bundles.\n');

// ---------------------------------------------------------------------------
// 3. Useful vs misleading candidates
// ---------------------------------------------------------------------------
console.log('=== 3a. USEFUL candidates: lift comfortably above 1 AND count(A) >= 500 ===');
const useful = finalRules
  .filter((r) => r.lift > 1 && r.antecedentCount >= 500)
  .sort((a, b) => b.lift - a.lift);
console.log(`${useful.length} of the ${finalRules.length} final rules have lift > 1 and count(A) >= 500;`
  + ' top 10 by lift:');
console.log(header);
for (const rule of useful.slice(0, 10)) console.log(row(rule));

console.log(`\n=== 3b. MISLEADING candidates (loosest setting: 0.5% support / 10% confidence,`
  + ` ${looseRules.length} rules) ===`);

console.log('\n(i) highest confidence with lift in [0.8, 1.2] — association ~ independence:');
console.log(header);
for (const rule of [...looseRules]
  .filter((r) => r.lift >= 0.8 && r.lift <= 1.2)
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 8)) console.log(row(rule));

console.log('\n(ii) highest confidence with the smallest antecedent counts (thinnest evidence):');
console.log(header);
for (const rule of [...looseRules]
  .sort((a, b) => b.confidence - a.confidence || a.antecedentCount - b.antecedentCount)
  .slice(0, 8)) console.log(row(rule));

const topItem = '85123A';
const toItem = [...looseRules]
  .filter((r) => r.consequent.length === 1 && r.consequent[0] === topItem)
  .sort((a, b) => b.confidence - a.confidence);
console.log(`\n(iii) rules whose consequent is ${topItem} ${descriptionOf.get(topItem)}, the most frequent item`
  + ` (in ${countItem(run('DATASET_INDEX'), topItem)} of ${N} baskets = ${pct(countItem(run('DATASET_INDEX'), topItem) / N)}):`);
console.log(`${toItem.length} rules at 0.5%/10% end in ${topItem}; top 8 by confidence:`);
console.log(header);
for (const rule of toItem.slice(0, 8)) console.log(row(rule));

// ---------------------------------------------------------------------------
// 4. A -> B vs B -> A for three selected rules
// ---------------------------------------------------------------------------
console.log('\n=== 4. Direction check: confidence flips, lift does not (3 rules) ===');
const selected = [
  finalRules[0],
  useful[0],
  finalRules.find((r) => r.antecedent.length === 2) || finalRules[1],
];
for (const rule of selected) {
  const forward = computeConfidence(rule.jointCount, rule.antecedentCount);
  const backward = computeConfidence(rule.jointCount, rule.consequentCount);
  const liftForward = computeLift(forward, rule.consequentCount, N);
  const liftBackward = computeLift(backward, rule.antecedentCount, N);
  console.log(`${label(rule.antecedent)} -> ${label(rule.consequent)}`);
  console.log(`   count(A)=${rule.antecedentCount}  count(B)=${rule.consequentCount}  `
    + `count(AuB)=${rule.jointCount}  N=${N}`);
  console.log(`   confidence(A->B)=${pct(forward.value)}   confidence(B->A)=${pct(backward.value)}`
    + `   lift(A->B)=${num(liftForward.value)}   lift(B->A)=${num(liftBackward.value)}`
    + `   |diff|=${Math.abs(liftForward.value - liftBackward.value).toExponential(1)}`);
}

// ---------------------------------------------------------------------------
// 5. Basket-size distribution (limitation discussion)
// ---------------------------------------------------------------------------
console.log('\n=== 5. Basket-size distribution (distinct items per basket) ===');
const dedupeBasket = run('dedupeBasket');
const sizes = TRANSACTIONS.map((basket) => dedupeBasket(basket).length);
const sorted = [...sizes].sort((a, b) => a - b);
const median = sorted.length % 2
  ? sorted[(sorted.length - 1) / 2]
  : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
const p90 = sorted[Math.ceil(0.9 * sorted.length) - 1];
const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
const bigSets = [...mined.get(0.005).itemsets].filter((i) => i.items.length >= 4).length;
console.log(`baskets=${sorted.length}  min=${sorted[0]}  median=${median}  mean=${mean.toFixed(2)}  `
  + `p90=${p90}  max=${sorted[sorted.length - 1]}`);
console.log(`A basket of size s offers at most C(s,2) pairs; with median ${median} and p90 ${p90}, evidence for`
  + ` 4+-itemsets is thin — only ${bigSets} itemsets of size >= 4 survive even at 0.5% support.`);
