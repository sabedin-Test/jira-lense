const form = document.getElementById('form');
const result = document.getElementById('result');

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => n.append(k));
  return n;
};

// Wraps each search word in <mark> without using innerHTML.
function highlight(text, terms) {
  const words = terms.filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return [text];
  return text.split(new RegExp(`(${words.join('|')})`, 'ig')).map((part, i) => (i % 2 ? el('mark', { textContent: part }) : part));
}

const TYPE_LABEL = { page: 'Page', blogpost: 'Blog post', attachment: 'File' };

function render(d) {
  if (!d.results.length) {
    result.replaceChildren(el('p', { textContent: `Nothing found for "${d.term}". Try fewer or different words.` }));
    return;
  }
  const note = d.mode === 'any word' ? ' Few pages had every word, so these match at least one of them; the best matches are first.' : '';
  const head = el('p', { className: 'meta', textContent: `Looking for: ${d.terms.join(', ')}. ${d.total} result${d.total === 1 ? '' : 's'}${d.incomplete ? ` (showing the best ${d.results.length})` : ''}.${note}` });
  const list = el('div', { className: 'hits' });
  d.results.forEach((r) => {
    const title = r.url ? el('a', { href: r.url, target: '_blank', rel: 'noopener', className: 'hit-title' }, ...highlight(r.title, d.terms)) : el('span', { className: 'hit-title' }, r.title);
    list.append(el('article', { className: 'hit' },
      title,
      el('div', { className: 'hit-meta' },
        el('span', { className: 'badge', textContent: TYPE_LABEL[r.type] || r.type, style: '--c:#9a6f0b' }),
        el('span', { textContent: r.space || '' }),
        el('span', { textContent: r.modified ? `Updated ${new Date(r.modified).toLocaleDateString()}` : '' })),
      r.excerpt ? el('p', { className: 'hit-excerpt' }, ...highlight(r.excerpt, d.terms)) : ''));
  });
  result.replaceChildren(head, list, el('p', { className: 'meta', textContent: `Retrieved ${new Date(d.retrievedAt).toLocaleString()}.` }));
}

async function search(query) {
  document.getElementById('page').classList.add('searched');
  result.hidden = false;
  result.replaceChildren(el('p', { textContent: 'Searching Confluence...' }));
  try {
    const res = await fetch('/api/confluence/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, scope: document.getElementById('scope').value }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.loginRequired) refreshAuth();
      throw new Error(data.error);
    }
    render(data);
  } catch (e) {
    result.replaceChildren(el('p', { className: 'err', textContent: e.message }));
  }
}

form.addEventListener('submit', (e) => { e.preventDefault(); search(document.getElementById('q').value); });
