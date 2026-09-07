import json, re, html
from bs4 import BeautifulSoup

soup = BeautifulSoup(open('ps1.html', encoding='utf-8', errors='replace').read(), 'lxml')

def clean(s):
    s = html.unescape(s or '')
    s = re.sub(r'<[^>]+>', ' ', s)
    s = s.replace('•', '- ').replace('\xa0', ' ')
    return re.sub(r'[ \t]+', ' ', re.sub(r'\s*\n\s*', '\n', s)).strip()

out = []
for modal in soup.select('div[id^=ViewProblemStatement]'):
    psid = modal.get('id').replace('ViewProblemStatement', '')
    rec = {'ps_id': psid}
    for tr in modal.select('table tr'):
        th = tr.find('th'); td = tr.find('td')
        if not th or not td: continue
        k = clean(th.get_text()).rstrip(':')
        if k == 'Description':
            # description html lives in a div, sometimes double-escaped
            v = clean(td.decode_contents())
        else:
            v = clean(td.get_text(' '))
        rec[k] = v
    # row-level cells (category, count, deadline) from the parent <tr>
    row = modal.find_parent('tr')
    if row:
        tds = [clean(t.get_text(' ')) for t in row.find_all('td', recursive=False)]
        m = [t for t in tds if re.fullmatch(r'\d+/\d+', t)]
        if m: rec['submissions'] = m[0]
        d = [t for t in tds if re.search(r'\b20\d\d\b', t) and len(t) < 30]
        if d: rec['deadline'] = d[-1]
    out.append(rec)

# normalise keys
norm = []
for r in out:
    norm.append({
        'ps_id': r.get('ps_id'),
        'title': r.get('Problem Statement Title', ''),
        'org': r.get('Organization', ''),
        'department': r.get('Department', ''),
        'category': r.get('Category', ''),
        'theme': r.get('Theme', ''),
        'description': r.get('Description', ''),
        'dataset': r.get('Dataset Link', ''),
        'youtube': r.get('Youtube Link', ''),
        'submissions': r.get('submissions', ''),
        'deadline': r.get('deadline', ''),
    })

json.dump(norm, open('sih2026_ps.json', 'w'), indent=1, ensure_ascii=False)
print('count', len(norm))
from collections import Counter
print('categories', Counter(x['category'] for x in norm))
print('themes:')
for t, c in Counter(x['theme'] for x in norm).most_common():
    print(f'  {c:3d}  {t}')
print('empty desc:', sum(1 for x in norm if len(x['description']) < 50))
print('sample:', json.dumps(norm[0], ensure_ascii=False)[:600])
