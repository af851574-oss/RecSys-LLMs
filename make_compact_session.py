"""Build the submission session export v4: a single valid JSON document.

Why: the channel advertises "JSON text .json"; a single JSON object parses
under any strict json.loads validator, and every string is capped so no
long value (bash command, file read, message) can choke the backend.

Documented derivative rules (homework 2 permits this; native JSONL stays in
the repository, sha256 recorded):
  - "generated_code": the complete, byte-exact final state of every file this
    session authored (read from the working tree). The generated code is
    preserved 100%, independent of event-string caps.
  - "events": all conversation events in order with timestamps; system /
    compaction context, thinking blocks and base64 images are omitted; every
    string value (tool results, tool-call arguments, assistant texts) is
    capped at STRING_CAP chars with an explicit truncation marker.
  - The unmodified native JSONL is committed alongside in the repository.
"""
import hashlib
import json
import os

ROOT = r'D:\Anna\Documents\LLM4Rec\hw2'
SRC = os.path.join(ROOT, 'argrishkina_hw2_session_native.jsonl')
DST = os.path.join(ROOT, 'argrishkina_hw2_session.json')
STRING_CAP = 1200

CODE_FILES = [
    'far-trans-llm/profile_encoder.py',
    'far-trans-llm/test_profile_encoder.py',
    'far-trans-llm/runtime.py',
    'verify_hw2.py',
    'make_compact_session.py',
    'README.md',
]

raw = open(SRC, 'rb').read()
native_sha = hashlib.sha256(raw).hexdigest()
MARK = ' …[string capped in derived export; full value in the native JSONL, sha256 ' + native_sha[:16] + ']'
stats = {'system': 0, 'thinking': 0, 'images': 0, 'capped': 0, 'kept': 0}


def cap(value):
    if isinstance(value, str) and len(value) > STRING_CAP:
        stats['capped'] += 1
        return value[:STRING_CAP] + MARK
    if isinstance(value, dict):
        return {k: cap(v) for k, v in value.items()}
    if isinstance(value, list):
        return [cap(v) for v in value]
    return value


events = []
for line in raw.decode('utf-8').splitlines():
    if not line.strip():
        continue
    d = json.loads(line)
    if d.get('type') == 'context_edit':
        continue
    m = d.get('message')
    if isinstance(m, dict) and m.get('role') == 'system':
        stats['system'] += 1
        continue
    if isinstance(m, dict) and isinstance(m.get('content'), list):
        content = []
        for block in m['content']:
            if not isinstance(block, dict):
                content.append(block)
            elif block.get('type') == 'image':
                stats['images'] += 1
            elif block.get('type') == 'thinking':
                stats['thinking'] += 1
            else:
                content.append(cap(block))
        m['content'] = content
    events.append(cap(d))
    stats['kept'] += 1

generated_code = {}
for rel in CODE_FILES:
    path = os.path.join(ROOT, rel.replace('/', os.sep))
    if os.path.exists(path):
        data = open(path, 'rb').read()
        generated_code[rel] = {
            'sha256': hashlib.sha256(data).hexdigest(),
            'content': data.decode('utf-8'),
        }

doc = {
    'derivation': {
        'source': 'tool-native pi session JSONL (unmodified copy: '
                  'argrishkina_hw2_session_native.jsonl in repository branch hw2)',
        'source_sha256': native_sha,
        'format': 'single JSON document (channel accepts "JSON text .json")',
        'removed': ['system/compaction context events (harness-injected, not conversation)',
                    'internal thinking blocks', 'base64 image attachments'],
        'capped': [f'every string value over {STRING_CAP} chars, in events only, '
                   'with an explicit truncation marker'],
        'generated_code_preserved': 'the complete byte-exact final state of every code '
                                    'file authored this session is in "generated_code"; the report '
                                    'HTML equals the submitted PDF and the repository copy',
        'preserved': ['all user prompts', 'all tool calls', 'all tool results',
                      'all assistant texts (long ones capped with markers)',
                      'event order and timestamps'],
        'reason': 'submission-channel rejection of the native-size export; documented '
                  'derivative permitted by homework 2 ("a documented derivative must '
                  'preserve the generated code, tool calls, and results")',
    },
    'generated_code': generated_code,
    'events': events,
}

with open(DST, 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False)

# verification: strict single-JSON parse + counts
parsed = json.load(open(DST, encoding='utf-8'))
calls = results = users = 0
for d in parsed['events']:
    m = d.get('message')
    if not isinstance(m, dict):
        continue
    if m.get('role') == 'toolResult':
        results += 1
    if m.get('role') == 'user':
        users += 1
    c = m.get('content')
    if isinstance(c, list):
        for b in c:
            if isinstance(b, dict) and b.get('type') == 'toolCall':
                calls += 1
big = 0
def walk(o):
    global big
    if isinstance(o, str):
        if len(o) > 3000: big += 1
    elif isinstance(o, dict):
        [walk(v) for v in o.values()]
    elif isinstance(o, list):
        [walk(v) for v in o]
walk(parsed)
print('size KB:', round(os.path.getsize(DST) / 1024))
print('stats:', stats)
print(f'events={len(parsed["events"])} toolCalls={calls} toolResults={results} '
      f'userMsgs={users} codeFiles={len(parsed["generated_code"])}')
print('strings >3000 (only code files expected):', big, '| code strings:',
      sum(1 for v in parsed['generated_code'].values() if len(v['content']) > 3000))
