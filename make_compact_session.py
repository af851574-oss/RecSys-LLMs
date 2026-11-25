"""Build the submission-sized session export (documented derivative).

Keeps every user prompt, tool call, tool result and assistant text verbatim.
Removes only: base64 image attachments (failed image-preview reads, 1.6 MB)
and internal thinking blocks; both removals are documented in a prepended
custom event and in the report. The native JSONL stays in the repository.
"""
import hashlib
import json

SRC = r'D:\Anna\Anna\hw2_session_native.jsonl'  # placeholder, set below
SRC = r'D:\Anna\Documents\LLM4Rec\hw2\argrishkina_hw2_session.json'
DST = r'D:\Anna\Documents\LLM4Rec\hw2\argrishkina_hw2_session_compact.json'

raw = open(SRC, 'rb').read()
native_sha = hashlib.sha256(raw).hexdigest()
lines = raw.decode('utf-8').splitlines()

kept, images, thinking_blocks = [], 0, 0
for line in lines:
    if not line.strip():
        continue
    d = json.loads(line)
    m = d.get('message')
    if isinstance(m, dict) and isinstance(m.get('content'), list):
        new_content = []
        for block in m['content']:
            if not isinstance(block, dict):
                new_content.append(block)
                continue
            if block.get('type') == 'image':
                images += 1
                new_content.append({'type': 'text',
                                    'text': f"[base64 image attachment omitted in this derived export "
                                            f"({len(str(block))} chars); the model could not render images, "
                                            f"and the same screenshots were OCR-processed in a tool call]"})
            elif block.get('type') == 'thinking':
                thinking_blocks += 1
            else:
                new_content.append(block)
        m['content'] = new_content
    kept.append(json.dumps(d, ensure_ascii=False))

doc = {'type': 'custom', 'derivation': {
    'source': 'tool-native pi session JSONL (unmodified copy: '
              'argrishkina_hw2_session_native.jsonl in repository branch hw2)',
    'source_sha256': native_sha,
    'removed': ['base64 image attachments (failed image-preview reads)',
                'internal thinking blocks'],
    'preserved_verbatim': ['all user prompts', 'all tool calls', 'all tool results',
                           'all assistant text (including generated code)', 'event order and timestamps'],
    'reason': 'submission-channel file-size limit; permitted documented derivative '
              'per homework 2 ("a documented derivative must preserve the generated '
              'code, tool calls, and results")'}}

with open(DST, 'w', encoding='utf-8') as f:
    f.write(json.dumps(doc, ensure_ascii=False) + '\n')
    for line in kept:
        f.write(line + '\n')

import os
print('native KB:', round(len(raw) / 1024), '| compact KB:', round(os.path.getsize(DST) / 1024))
print('images removed:', images, '| thinking blocks removed:', thinking_blocks)

# verify: same tool calls/results/prompts as native
def count(path, skip_doc=False):
    calls = results = users = assistant_text = 0
    for line in open(path, encoding='utf-8'):
        if not line.strip():
            continue
        d = json.loads(line)
        if d.get('type') == 'custom' and 'derivation' in d:
            continue
        m = d.get('message')
        if not isinstance(m, dict):
            continue
        c = m.get('content')
        if m.get('role') == 'user':
            if isinstance(c, str) and c.strip():
                users += 1
        if isinstance(c, list):
            for b in c:
                if isinstance(b, dict):
                    if b.get('type') == 'toolCall':
                        calls += 1
                    elif b.get('type') == 'toolResult' or (m.get('role') == 'toolResult'):
                        pass
        if m.get('role') == 'toolResult':
            results += 1
        if m.get('role') == 'assistant' and isinstance(c, list):
            assistant_text += sum(1 for b in c if isinstance(b, dict) and b.get('type') == 'text')
    return calls, results, users, assistant_text

a = count(SRC)
b = count(DST)
print('native : toolCalls=%d toolResults=%d userMsgs=%d assistantTexts=%d' % a)
print('compact: toolCalls=%d toolResults=%d userMsgs=%d assistantTexts=%d' % b)
print('PRESERVED:', a == b)
