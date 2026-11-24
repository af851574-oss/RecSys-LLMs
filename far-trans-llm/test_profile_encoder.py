"""Profile-encoder arithmetic and injected-generator tests; not LLM experiments."""
import json
import math
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from profile_encoder import (clean, history_facts, profile_prompt, template_profile,
                             asset_text, fit_tfidf, vectorize_query, profile_ranking,
                             generate_profiles)


class Fake:
    def __init__(self, texts):
        self.texts, self.index = texts, 0
        self.output_dir = None

    def generate(self, prompt, max_new_tokens=160):
        text = self.texts[self.index]
        self.index += 1
        return {'text': text, 'input_tokens': 10, 'output_tokens': 5, 'seconds': 0.0}


ASSET = {'assetName': 'Secret Name', 'ISIN': 'SECRET', 'assetCategory': 'Stock',
         'assetSubCategory': 'Large Cap', 'sector': 'Utilities',
         'industry': 'Not_Available', 'marketID': 'XATH',
         'timestamp': '2099-01-01', 'future_returns': 'LEAK'}


class ProfileEncoderTests(unittest.TestCase):
    def assertSparse(self, actual, expected, tolerance=1e-12):
        self.assertEqual(set(actual), set(expected))
        for key in expected:
            self.assertAlmostEqual(actual[key], expected[key], delta=tolerance)

    def test_facts_exclude_names_ids_and_money(self):
        facts = history_facts({'SECRET': 3}, {'SECRET': ASSET})
        self.assertEqual(facts, [{'category': 'Stock', 'subcategory': 'Large Cap',
                                  'sector': 'Utilities', 'industry': 'unknown',
                                  'market': 'XATH', 'buy_count': 3}])
        prompt = profile_prompt(facts)
        self.assertNotIn('Secret Name', prompt)
        self.assertNotIn('SECRET', prompt)
        self.assertNotIn('2099', prompt)
        self.assertNotIn('LEAK', prompt)

    def test_facts_order_and_cap(self):
        counts = {'A': 1, 'B': 5, 'C': 5}
        assets = {k: dict(ASSET, marketID=k) for k in counts}
        facts = history_facts(counts, assets)
        self.assertEqual([f['market'] for f in facts], ['B', 'C', 'A'])  # count desc, id asc
        self.assertEqual(len(history_facts({k: 1 for k in map(str, range(30))},
                                           {str(i): ASSET for i in range(30)})), 20)

    def test_template_deterministic_and_same_facts(self):
        facts = history_facts({'SECRET': 3}, {'SECRET': ASSET})
        first, second = template_profile(facts), template_profile(facts)
        self.assertEqual(first, second)
        self.assertIn('category Stock', first)
        self.assertIn('bought 3 time(s)', first)
        self.assertEqual(template_profile([]),
                         'This customer has no recorded purchases.')

    def test_tfidf_query_math(self):
        documents = {'A': 'stock utilities', 'B': 'stock stock bond'}
        vectors, df, n = fit_tfidf(documents)
        # stock: df=2 of n=2 -> IDF 1; utilities/bond: df=1 -> 1+ln(3/2).
        idf = 1 + math.log(1.5)
        # B: stock tf=2, weight 2*1=2; bond weight idf -> after normalize:
        norm = math.sqrt(4 + idf * idf)
        self.assertSparse(vectors['B'], {'stock': 2 / norm, 'bond': idf / norm})
        query = vectorize_query('utilities utilities', df, n)
        self.assertSparse(query, {'utilities': 1.0})
        # Unseen query terms survive with sub-1e12 finite weight but match nothing.
        query = vectorize_query('totally unseen word', df, n)
        self.assertEqual(set(query), {'totally', 'unseen', 'word'})

    def test_ranking_order_and_degenerate_fallback(self):
        documents = {'A': 'utilities renewable', 'B': 'stock technology'}
        vectors, df, n = fit_tfidf(documents)
        pop = {'A': 5, 'B': 7}
        ranking, degenerate = profile_ranking('utilities renewable', vectors, df, n,
                                              pop, ['B', 'A'])
        self.assertEqual(ranking, ['A', 'B'])
        self.assertFalse(degenerate)
        ranking, degenerate = profile_ranking('unmatchable gibberish zzz', vectors, df, n,
                                              pop, ['B', 'A'])
        self.assertEqual(ranking, ['B', 'A'])  # popularity order (7 > 5)
        self.assertTrue(degenerate)

    def test_generate_profiles_validation_and_fallback(self):
        facts = {'U1': history_facts({}, {}), 'U2': history_facts({}, {})}
        fake = Fake(['A good profile about utilities stocks.'] * 2)
        profiles, failures = generate_profiles(facts, fake, 'fallback')
        self.assertEqual(failures, [])
        # Invalid outputs (empty; 81 words) fall back to the template.
        fake = Fake(['', ' '.join(['word'] * 81)])
        profiles, failures = generate_profiles(facts, fake, 'fallback')
        self.assertEqual(len(failures), 2)
        self.assertEqual(profiles['U1'], template_profile(facts['U1']))
        with self.assertRaises(ValueError):
            generate_profiles(facts, Fake(['', '']), 'error')

    def test_asset_text_allowlist(self):
        text = asset_text(ASSET)
        self.assertEqual(json.loads(text),
                         {'category': 'Stock', 'industry': 'unknown',
                          'market': 'XATH', 'sector': 'Utilities',
                          'subcategory': 'Large Cap'})
        self.assertNotIn('Secret Name', text)
        self.assertNotIn('LEAK', text)


if __name__ == '__main__':
    unittest.main()
