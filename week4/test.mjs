import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// Minimal window/document stubs so the real, unmodified script.js boots in
// node exactly as it does in the browser (classic scripts, window.HW4 global).
// ---------------------------------------------------------------------------

const element = () => {
  const el = { dataset: {}, value: '1', _html: '', _text: '' };
  // Setting innerHTML must be readable back through textContent, like a real
  // element, or the harness's empty-state check cannot see its own output.
  const strip = (html) =>
    String(html)
      .replace(/<[^>]*>/g, ' ')
      .replace(/&mdash;|&ndash;/g, '-')
      .replace(/&ldquo;|&rdquo;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`PASS ${name}`);
};

// ---------------------------------------------------------------------------
// 1. The starter's own harness must be fully green on the real dataset.
// ---------------------------------------------------------------------------
const scriptSource = read('script.js');
check('no unimplemented TODO(hw4) stub throws remain', () => {
  assert.ok(!/throw new Error\("TODO\(hw4\)/.test(scriptSource),
    'script.js still contains a throwing TODO(hw4) stub');
});

const harness = run('runTests()');
check('starter harness: 11 passed / 0 failed / 0 pending', () => {
  assert.equal(harness.passed, 11, `passed = ${harness.passed}`);
  assert.equal(harness.failed, 0, `failed = ${harness.failed}`);
  assert.equal(harness.pending, 0, `pending = ${harness.pending}`);
  assert.ok(harness.checks.every((c) => c.status === 'PASS'));
});

// ---------------------------------------------------------------------------
// 2. Dataset anchors.
// ---------------------------------------------------------------------------
check('dataset anchors: N = 17080 baskets, 3653 distinct items, count(85123A) = 1959', () => {
  assert.equal(run('N'), 17080, 'N must be 17080');
  assert.equal(run('DATASET_INDEX.byStock.size'), 3653, 'distinct items must be 3653');
  assert.equal(run('countItem(DATASET_INDEX, "85123A")'), 1959,
    'the readme anchor fact: 85123A in 1959 of 17080 baskets');
  // 1959 / 17080 = 11.47% (the readme's rounded anchor percentage).
  const support = run('computeSupport(countItem(DATASET_INDEX, "85123A"), N)');
  assert.ok(close(support.value, 1959 / 17080) && support.defined);
  assert.equal((support.value * 100).toFixed(2), '11.47');
});

// ---------------------------------------------------------------------------
// 3. dedupeBasket / countItemset contracts (mixed input shapes, unknown stocks).
// ---------------------------------------------------------------------------
check('dedupeBasket keeps first-appearance order over strings and objects', () => {
  const deduped = run(`dedupeBasket([
    { stock: 'milk', description: 'M' }, 'bread', { stock: 'milk' }, 'bread', 'jam',
  ])`);
  assert.deepEqual([...deduped], ['milk', 'bread', 'jam']);
  assert.deepEqual([...run('dedupeBasket([])')], []);
});

check('countItemset: 0 for empty request, 0 for unknown stock, dedupes the request', () => {
  assert.equal(run('countItemset(DATASET_INDEX, [])'), 0);
  assert.equal(run('countItemset(DATASET_INDEX, ["NOPE"])'), 0);
  assert.equal(run('countItemset(DATASET_INDEX, ["85123A", "85123A"])'),
    run('countItemset(DATASET_INDEX, ["85123A"])'));
});

// ---------------------------------------------------------------------------
// 4. Lecture-slide example on 8 baskets: support 3/8, confidence 3/5, lift 0.96.
//    count(A) = 5, count(B) = 5, count(A and B) = 3, N = 8.
// ---------------------------------------------------------------------------
check('lecture example: support 37.5%, confidence 60%, lift 0.96', () => {
  const example = run(`(() => {
    const baskets = [
      ['A', 'B'], ['A', 'B'], ['A', 'B'], ['A'], ['A'], ['B'], ['B'], ['C'],
    ];
    const index = asIndex(baskets);
    const joint = countItemset(index, ['A', 'B']);
    const countA = countItemset(index, ['A']);
    const countB = countItemset(index, ['B']);
    const support = computeSupport(joint, baskets.length);
    const confidence = computeConfidence(joint, countA);
    const lift = computeLift(confidence, countB, baskets.length);
    return { n: baskets.length, joint, countA, countB, support, confidence, lift };
  })()`);
  assert.deepEqual(
    [example.n, example.joint, example.countA, example.countB],
    [8, 3, 5, 5],
    '8 baskets, count(A)=5, count(B)=5, count(A and B)=3',
  );
  assert.ok(close(example.support.value, 3 / 8), 'support = 3/8 = 37.5%');
  assert.ok(close(example.confidence.value, 3 / 5), 'confidence = 3/5 = 60%');
  assert.ok(close(example.lift.value, 0.96), `lift = 0.96, got ${example.lift.value}`);
  assert.ok(example.support.defined && example.confidence.defined && example.lift.defined);
});

// ---------------------------------------------------------------------------
// 5. Direction example: confidence is not symmetric, lift is.
//    N = 8, count(A) = 5, count(B) = 6, count(A and B) = 3:
//    conf(A->B) = 3/5 = 60%, conf(B->A) = 3/6 = 50%,
//    lift = 0.6 / (6/8) = 0.8 = 0.5 / (5/8) in both directions.
// ---------------------------------------------------------------------------
check('direction example: A->B 60% vs B->A 50%, identical lift 0.8', () => {
  const example = run(`(() => {
    const baskets = [['A', 'B'], ['A', 'B'], ['A', 'B'], ['A'], ['A'], ['B'], ['B'], ['B']];
    const index = asIndex(baskets);
    const joint = countItemset(index, ['A', 'B']);
    const countA = countItemset(index, ['A']);
    const countB = countItemset(index, ['B']);
    const forward = computeConfidence(joint, countA);
    const backward = computeConfidence(joint, countB);
    const liftForward = computeLift(forward, countB, baskets.length);
    const liftBackward = computeLift(backward, countA, baskets.length);
    return { joint, countA, countB, forward, backward, liftForward, liftBackward };
  })()`);
  assert.deepEqual([example.joint, example.countA, example.countB], [3, 5, 6]);
  assert.ok(close(example.forward.value, 0.6), 'confidence(A -> B) = 60%');
  assert.ok(close(example.backward.value, 0.5), 'confidence(B -> A) = 50%');
  assert.ok(close(example.liftForward.value, example.liftBackward.value),
    'lift must be symmetric');
  assert.ok(close(example.liftForward.value, 0.8), 'lift = 0.8 in both directions');
});

// ---------------------------------------------------------------------------
// 6. Zero-denominator guards.
// ---------------------------------------------------------------------------
check('zero denominators return defined: false', () => {
  const plain = (result) => ({ value: result.value, defined: result.defined });
  assert.deepEqual(plain(run('computeSupport(5, 0)')), { value: 0, defined: false });
  assert.deepEqual(plain(run('computeConfidence(5, 0)')), { value: 0, defined: false });
  assert.deepEqual(plain(run('computeLift({ value: 0.5, defined: true }, 0, 8)')),
    { value: 0, defined: false });
  assert.deepEqual(plain(run('computeLift({ value: 0.5, defined: false }, 100, 8)')),
    { value: 0, defined: false });
  assert.deepEqual(plain(run('computeLift({ value: 0.5, defined: true }, 100, 0)')),
    { value: 0, defined: false });
});

// ---------------------------------------------------------------------------
// 7. Real-data miner + rule invariants at the chosen thresholds (1% / 50%).
// ---------------------------------------------------------------------------
const MIN_SUPPORT = 0.01;
const MIN_CONFIDENCE = 0.5;

const pipeline = run(`(() => {
  const itemsets = findFrequentItemsets(TRANSACTIONS, ${MIN_SUPPORT});
  const rules = generateRules(itemsets, ${MIN_CONFIDENCE});
  return { itemsets, rules };
})()`);

check('every frequent itemset really satisfies minSupport (recounted)', () => {
  assert.ok(pipeline.itemsets.length > 0);
  for (const itemset of pipeline.itemsets) {
    assert.ok(close(itemset.support, itemset.count / 17080),
      `support field must equal count / N for ${itemset.items.join(',')}`);
    assert.ok(itemset.support >= MIN_SUPPORT - 1e-12,
      `support ${itemset.support} below threshold for ${itemset.items.join(',')}`);
    const recounted = run(`countItemset(DATASET_INDEX, ${JSON.stringify(itemset.items)})`);
    assert.equal(recounted, itemset.count,
      `count mismatch for ${itemset.items.join(',')}`);
  }
});

check('downward closure: every (k-1)-subset of a frequent itemset is in the output', () => {
  const keys = new Set(pipeline.itemsets.map((i) => [...i.items].sort().join('\u0000')));
  for (const itemset of pipeline.itemsets) {
    const items = [...itemset.items].sort();
    for (let drop = 0; drop < items.length; drop++) {
      const subset = items.slice(0, drop).concat(items.slice(drop + 1));
      if (subset.length === 0) continue;
      assert.ok(keys.has(subset.join('\u0000')),
        `subset ${subset.join(',')} of ${items.join(',')} missing from the miner output`);
    }
  }
});

const ruleKey = (rule) =>
  `${[...rule.antecedent].sort().join('\u0000')}=>${[...rule.consequent].sort().join('\u0000')}`;

check('every table rule satisfies BOTH thresholds and carries correct raw counts', () => {
  assert.ok(pipeline.rules.length > 0);
  for (const rule of pipeline.rules) {
    assert.ok(rule.support >= MIN_SUPPORT - 1e-12,
      `rule ${ruleKey(rule)} below minSupport`);
    assert.ok(rule.confidence >= MIN_CONFIDENCE - 1e-12,
      `rule ${ruleKey(rule)} below minConfidence`);
    assert.ok(close(rule.confidence, rule.jointCount / rule.antecedentCount),
      'confidence = count(A and B) / count(A)');
    assert.ok(close(rule.support, rule.jointCount / 17080),
      'support = count(A and B) / N');
    const expectedLift =
      (rule.jointCount / rule.antecedentCount) / (rule.consequentCount / 17080);
    assert.ok(close(rule.lift, expectedLift),
      `lift = confidence / (count(B) / N), got ${rule.lift} expected ${expectedLift}`);
  }
});

check('both directions are generated, and lift(A->B) = lift(B->A) for every rule', () => {
  const byKey = new Map(pipeline.rules.map((r) => [ruleKey(r), r]));
  let mirrored = 0;
  for (const rule of pipeline.rules) {
    const mirror = byKey.get(
      `${[...rule.consequent].sort().join('\u0000')}=>${[...rule.antecedent].sort().join('\u0000')}`,
    );
    // A mirror rule exists exactly when the mirror direction also passes the
    // confidence threshold: confidence(B -> A) = joint / count(B).
    const mirrorConfidence = rule.jointCount / rule.consequentCount;
    if (mirrorConfidence >= MIN_CONFIDENCE - 1e-12) {
      assert.ok(mirror, `mirror of ${ruleKey(rule)} missing`);
      assert.ok(close(rule.lift, mirror.lift, 1e-9),
        `lift differs between directions for ${ruleKey(rule)}`);
      mirrored += 1;
    } else {
      assert.ok(!mirror, `mirror of ${ruleKey(rule)} must fail the confidence threshold`);
    }
  }
  assert.ok(mirrored > 0, 'at least one rule pair must exist in both directions');
});

// ---------------------------------------------------------------------------
// 8. Hand-computed real rule, verified from raw basket scans (not via the
//    inverted index): 22916 -> 22917.
//      22916 HERB MARKER THYME, 22917 HERB MARKER ROSEMARY
//      count(22916) = 186, count(22917) = 190, count(22916 and 22917) = 176,
//      N = 17080.
//      support    = 176 / 17080 = 0.010304  (1.0304%)
//      confidence = 176 / 186   = 0.946237  (94.6237%)
//      lift       = 0.946237 / (190 / 17080) = 85.0617
// ---------------------------------------------------------------------------
const HAND = {
  antecedent: '22916',
  consequent: '22917',
  antecedentDescription: 'HERB MARKER THYME',
  consequentDescription: 'HERB MARKER ROSEMARY',
  countA: 186,
  countB: 190,
  countAB: 176,
  n: 17080,
  support: 0.0103,
  confidence: 0.9462,
  lift: 85.0617,
};

check('hand-computed rule 22916 -> 22917 matches raw basket scans and the pipeline', () => {
  // Independent count: scan the decoded baskets with plain loops, no index.
  const raw = run(`(() => {
    let countA = 0, countB = 0, countAB = 0;
    for (const basket of TRANSACTIONS) {
      let hasA = false, hasB = false;
      for (const item of basket) {
        if (item.stock === '${HAND.antecedent}') hasA = true;
        if (item.stock === '${HAND.consequent}') hasB = true;
      }
      if (hasA) countA += 1;
      if (hasB) countB += 1;
      if (hasA && hasB) countAB += 1;
    }
    return { countA, countB, countAB };
  })()`);
  assert.deepEqual({ ...raw },
    { countA: HAND.countA, countB: HAND.countB, countAB: HAND.countAB });

  const metrics = run(`(() => {
    const index = DATASET_INDEX;
    const countAB = countItemset(index, ['${HAND.antecedent}', '${HAND.consequent}']);
    const countA = countItemset(index, ['${HAND.antecedent}']);
    const countB = countItemset(index, ['${HAND.consequent}']);
    const support = computeSupport(countAB, N);
    const confidence = computeConfidence(countAB, countA);
    const lift = computeLift(confidence, countB, N);
    return { countAB, countA, countB, support, confidence, lift };
  })()`);

  assert.equal(metrics.countA, HAND.countA);
  assert.equal(metrics.countB, HAND.countB);
  assert.equal(metrics.countAB, HAND.countAB);
  assert.ok(close(metrics.support.value, HAND.countAB / HAND.n));
  assert.ok(close(metrics.confidence.value, HAND.countAB / HAND.countA));
  assert.ok(close(metrics.lift.value,
    (HAND.countAB / HAND.countA) / (HAND.countB / HAND.n)));
  // 4-decimal agreement with the hand arithmetic above.
  assert.equal(metrics.support.value.toFixed(4), HAND.support.toFixed(4));
  assert.equal(metrics.confidence.value.toFixed(4), HAND.confidence.toFixed(4));
  assert.equal(metrics.lift.value.toFixed(4), HAND.lift.toFixed(4));

  // The same numbers flow out of generateRules, so the table cannot disagree.
  const rule = pipeline.rules.find(
    (r) => r.antecedent.length === 1 && r.antecedent[0] === HAND.antecedent
      && r.consequent.length === 1 && r.consequent[0] === HAND.consequent,
  );
  assert.ok(rule, '22916 -> 22917 must be in the 1% / 50% rule table');
  assert.equal(rule.jointCount, HAND.countAB);
  assert.equal(rule.antecedentCount, HAND.countA);
  assert.equal(rule.consequentCount, HAND.countB);
  assert.equal(rule.confidence.toFixed(4), HAND.confidence.toFixed(4));
  assert.equal(rule.lift.toFixed(4), HAND.lift.toFixed(4));
  assert.equal(rule.support.toFixed(4), HAND.support.toFixed(4));
});

console.log(`\nHW4 test.mjs: all ${checks} checks passed.`);
