const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => n.append(k));
  return n;
};

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { page: 'Page', blogpost: 'Blog post', attachment: 'File' };
let deck = null;
let idx = 0;

async function loadRoles() {
  const roles = await (await fetch('/api/onboarding/roles')).json();
  $('role').replaceChildren(...roles.map((r) => el('option', { value: r.id, textContent: r.label })));
}

function hit(r) {
  const title = r.url ? el('a', { href: r.url, target: '_blank', rel: 'noopener', className: 'hit-title', textContent: r.title }) : el('span', { className: 'hit-title', textContent: r.title });
  return el('article', { className: 'hit' }, title,
    el('div', { className: 'hit-meta' },
      el('span', { className: 'badge', textContent: TYPE_LABEL[r.type] || r.type, style: '--c:#9a6f0b' }),
      el('span', { textContent: r.space || '' }),
      el('span', { textContent: r.modified ? `Updated ${new Date(r.modified).toLocaleDateString()}` : '' })),
    r.excerpt ? el('p', { className: 'hit-excerpt', textContent: r.excerpt }) : '');
}

function welcomeSlide(s) {
  const kids = [el('h2', { textContent: s.title }), el('p', { className: 'slide-intro', textContent: `Role: ${s.role}. This deck gathers the pages and people you are most likely to need in your first weeks.` })];
  if (s.snapshot) {
    const p = s.snapshot;
    kids.push(
      el('h3', { textContent: `${p.name} in the last 30 days` }),
      el('div', { className: 'kpis' },
        el('div', { className: 'kpi' }, el('div', { className: 'kpi-value', textContent: p.recent }), el('div', { className: 'kpi-label', textContent: 'Issues touched' })),
        el('div', { className: 'kpi good' }, el('div', { className: 'kpi-value', textContent: p.done }), el('div', { className: 'kpi-label', textContent: 'Done' })),
        el('div', { className: 'kpi' }, el('div', { className: 'kpi-value', textContent: p.open }), el('div', { className: 'kpi-label', textContent: 'Still open' }))));
    if (p.people.length) {
      const max = p.people[0].count;
      kids.push(el('h3', { textContent: 'People active in the team' }),
        el('div', { className: 'bars' }, ...p.people.map((x) => el('div', { className: 'bar-row' },
          el('span', { className: 'bar-name', textContent: x.name, title: x.name }),
          el('span', { className: 'bar-track' }, el('span', { className: 'bar-fill', style: `width:${(x.count / max) * 100}%;background:var(--gold)` })),
          el('span', { className: 'bar-n', textContent: x.count })))));
    }
  } else if (s.team) {
    kids.push(el('p', { className: 'meta', textContent: `"${s.team}" did not match a Jira project, so pages are filtered by that word instead and no team snapshot is shown.` }));
  }
  return kids;
}

function topicSlide(s) {
  const kids = [el('h2', { textContent: s.title }), el('p', { className: 'slide-intro', textContent: s.intro })];
  if (s.items.length) {
    if (deck.team) kids.push(el('p', { className: 'meta', textContent: s.scoped ? `Filtered to pages mentioning "${deck.team}".` : `Nothing specific to "${deck.team}" found, so these are general results.` }));
    kids.push(el('div', { className: 'hits' }, ...s.items.map(hit)));
  } else {
    kids.push(el('p', { className: 'meta', textContent: s.error ? 'This topic could not be searched just now.' : 'No obvious pages found for this topic. Ask your onboarding buddy, or try Confluence Lense with your own words.' }));
  }
  return kids;
}

function checklistSlide(s) {
  const key = (i) => `onb:${s.key}:${i}`;
  return [el('h2', { textContent: s.title }), el('p', { className: 'slide-intro', textContent: s.intro }),
    el('ul', { className: 'checklist' }, ...s.items.map((text, i) => {
      const box = el('input', { type: 'checkbox', id: `c${i}`, checked: localStorage.getItem(key(i)) === '1' });
      box.addEventListener('change', () => localStorage.setItem(key(i), box.checked ? '1' : '0'));
      return el('li', {}, box, el('label', { htmlFor: `c${i}`, textContent: text }));
    }))];
}

const slideEl = (s) => el('div', { className: 'slide-body' }, ...({ welcome: welcomeSlide, topic: topicSlide, checklist: checklistSlide }[s.type](s)));

function show(i) {
  idx = Math.max(0, Math.min(i, deck.slides.length - 1));
  $('slide').replaceChildren(slideEl(deck.slides[idx]));
  $('counter').textContent = `${idx + 1} / ${deck.slides.length}`;
  $('prev').disabled = idx === 0;
  $('next').disabled = idx === deck.slides.length - 1;
  [...$('dots').children].forEach((d, n) => d.classList.toggle('active', n === idx));
}

function start(d) {
  deck = d;
  $('dots').replaceChildren(...d.slides.map((s, n) => el('button', { type: 'button', className: 'dot', title: s.title, onclick: () => show(n) })));
  $('setup').hidden = true;
  $('deck').hidden = false;
  show(0);
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('status');
  status.className = 'meta';
  status.textContent = 'Reading Confluence and Jira... this can take 15-30 seconds.';
  try {
    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: $('role').value, team: $('team').value }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.loginRequired) refreshAuth();
      throw new Error(data.error);
    }
    status.textContent = '';
    start(data);
  } catch (err) {
    status.className = 'meta err';
    status.textContent = err.message;
  }
});

$('prev').addEventListener('click', () => show(idx - 1));
$('next').addEventListener('click', () => show(idx + 1));
$('restart').addEventListener('click', () => { $('deck').hidden = true; $('setup').hidden = false; });
document.addEventListener('keydown', (e) => {
  if (!deck || $('deck').hidden || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === 'ArrowRight') show(idx + 1);
  if (e.key === 'ArrowLeft') show(idx - 1);
});

$('print').addEventListener('click', () => {
  $('print-head').replaceChildren(
    el('h1', { textContent: 'Onboarding guide' }),
    el('p', { textContent: `${deck.role}${deck.team ? ` - ${deck.team}` : ''}` }),
    el('p', { textContent: `Generated: ${new Date(deck.generatedAt).toLocaleString()}` }));
  $('all-slides').replaceChildren(...deck.slides.map((s) => el('section', { className: 'print-slide' }, slideEl(s))));
  const title = document.title;
  document.title = `Onboarding guide - ${deck.role}`;
  window.addEventListener('afterprint', () => { document.title = title; $('all-slides').replaceChildren(); }, { once: true });
  window.print();
});

loadRoles();
