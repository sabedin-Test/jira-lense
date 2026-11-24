const form = document.getElementById('form');
const result = document.getElementById('result');
let last = null;
const history = [];

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach((k) => n.append(k));
  return n;
};

async function ask(question) {
  document.getElementById('page').classList.add('searched');
  result.hidden = false;
  result.replaceChildren(el('p', { textContent: 'Searching Jira...' }));
  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.loginRequired) refreshAuth();
      if (data.choices) {
        result.replaceChildren(el('p', { textContent: `${data.error}` }),
          el('div', { className: 'chips' }, ...data.choices.map((name) => el('button', {
            type: 'button',
            textContent: name,
            onclick: () => {
              const swapped = question.replace(new RegExp(data.candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), name);
              document.getElementById('q').value = swapped;
              ask(swapped);
            },
          }))));
        return;
      }
      throw new Error(data.error);
    }
    last = { question, ...data };
    history.push({ q: question, a: data.answer });
    render(data);
  } catch (e) {
    result.replaceChildren(el('p', { className: 'err', textContent: e.message }));
  }
}

const CAT_COLORS = { Done: '#16a34a', 'In Progress': '#2563eb', 'To Do': '#94a3b8', None: '#cbd5e1' };
const PRIORITY_COLORS = { Highest: '#dc2626', Critical: '#dc2626', Blocker: '#dc2626', High: '#ea580c', Medium: '#d97706', Low: '#2563eb', Lowest: '#94a3b8', None: '#cbd5e1' };
const FALLBACK_COLORS = ['#bd8b13', '#1f1c1a', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
const SVG_NS = 'http://www.w3.org/2000/svg';

const svg = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  return n;
};

const badge = (text, color) => el('span', { className: 'badge', textContent: text || 'n/a', style: `--c:${color}` });

function kpi(label, value, tone = '') {
  return el('div', { className: `kpi ${tone}` }, el('div', { className: 'kpi-value', textContent: value }), el('div', { className: 'kpi-label', textContent: label }));
}

function donut(counts, colorOf) {
  const entries = Object.entries(counts);
  const total = entries.reduce((a, [, n]) => a + n, 0) || 1;
  const r = 15.9155;
  const chart = svg('svg', { viewBox: '0 0 42 42', class: 'donut', role: 'img', 'aria-label': 'Issues by status' });
  chart.append(svg('circle', { cx: 21, cy: 21, r, fill: 'none', stroke: '#e2e8f0', 'stroke-width': 6 }));
  let offset = 25;
  entries.forEach(([name, n]) => {
    const pct = (n / total) * 100;
    chart.append(svg('circle', { cx: 21, cy: 21, r, fill: 'none', stroke: colorOf(name), 'stroke-width': 6, 'stroke-dasharray': `${pct} ${100 - pct}`, 'stroke-dashoffset': offset }));
    offset -= pct;
  });
  const legend = el('ul', { className: 'legend' });
  entries.forEach(([name, n]) => legend.append(el('li', {}, el('i', { style: `background:${colorOf(name)}` }), `${name} `, el('b', { textContent: n }))));
  return el('div', { className: 'donut-wrap' }, chart, legend);
}

function bars(counts, colorOf) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, n]) => n), 1);
  const wrap = el('div', { className: 'bars' });
  entries.forEach(([name, n], i) => wrap.append(el('div', { className: 'bar-row' },
    el('span', { className: 'bar-name', textContent: name }),
    el('span', { className: 'bar-track' }, el('span', { className: 'bar-fill', style: `width:${(n / max) * 100}%;background:${colorOf(name, i)}` })),
    el('span', { className: 'bar-n', textContent: n }))));
  return wrap;
}

const card = (title, ...kids) => el('section', { className: 'card' }, el('h3', { textContent: title }), ...kids);

function issueTable(sources, total, title = 'Issues') {
  const table = el('table', { className: 'issues' });
  table.append(el('thead', {}, el('tr', {}, ...['Key', 'Summary', 'Type', 'Status', 'Priority', 'Assignee'].map((h) => el('th', { textContent: h })))));
  const body = el('tbody');
  sources.forEach((s) => body.append(el('tr', {},
    el('td', {}, el('a', { href: s.url, target: '_blank', rel: 'noopener', textContent: s.key })),
    el('td', { className: 'summary', textContent: s.summary }),
    el('td', {}, badge(s.type, '#64748b')),
    el('td', {}, badge(s.status, CAT_COLORS[s.statusCategory] || CAT_COLORS.None)),
    el('td', {}, badge(s.priority, PRIORITY_COLORS[s.priority] || PRIORITY_COLORS.None)),
    el('td', { textContent: s.assignee }))));
  table.append(body);
  const shown = total && total > sources.length ? ` (showing ${sources.length} of ${total})` : '';
  return card(`${title}${shown}`, el('div', { className: 'table-scroll' }, table));
}

const HIGH_RE = /highest|critical|blocker|high/i;

function takeaways(items) {
  if (!items.length) return '';
  return el('section', { className: 'card' }, el('h3', { textContent: 'Key takeaways' }),
    el('ul', { className: 'takeaways' }, ...items.map((i) => el('li', { className: `take ${i.tone}`, textContent: i.text }))));
}

function searchTakeaways(f) {
  const items = [];
  const done = f.byStatusCategory.Done || 0;
  if (done > 0 && done < f.total) {
    const pct = Math.round((done / f.total) * 100);
    items.push({ tone: pct >= 70 ? 'good' : pct >= 40 ? 'warn' : 'bad', text: `${pct}% complete: ${done} of ${f.total} issues are done.` });
  }
  if (f.overdue) items.push({ tone: 'bad', text: `${f.overdue} issue${f.overdue === 1 ? ' is' : 's are'} overdue.` });
  if (f.unassigned) items.push({ tone: 'warn', text: `${f.unassigned} open issue${f.unassigned === 1 ? ' has' : 's have'} no assignee.` });
  const high = Object.entries(f.byPriority).filter(([k]) => HIGH_RE.test(k)).reduce((n, [, v]) => n + v, 0);
  if (high) items.push({ tone: 'warn', text: `${high} high-priority item${high === 1 ? '' : 's'} need attention.` });
  const people = Object.entries(f.byAssignee || {}).filter(([k]) => k !== 'Unassigned').sort((a, b) => b[1] - a[1]);
  if (people.length > 1) items.push({ tone: 'info', text: `${people[0][0]} holds the most work (${people[0][1]} of ${f.total}).` });
  if (!f.overdue && !f.unassigned) items.push({ tone: 'good', text: 'Nothing overdue and nothing left unassigned.' });
  return items;
}

function progressBar(counts, colorOf) {
  const entries = Object.entries(counts);
  const total = entries.reduce((a, [, n]) => a + n, 0) || 1;
  const bar = el('div', { className: 'stack', role: 'img', 'aria-label': 'Progress by status' });
  entries.forEach(([name, n]) => bar.append(el('span', { style: `width:${(n / total) * 100}%;background:${colorOf(name)}`, title: `${name}: ${n}` })));
  const legend = el('ul', { className: 'legend inline' });
  entries.forEach(([name, n]) => legend.append(el('li', {}, el('i', { style: `background:${colorOf(name)}` }), `${name} `, el('b', { textContent: `${n} (${Math.round((n / total) * 100)}%)` }))));
  return card('Progress', bar, legend);
}

const summaryCard = (d) => (d.aiGenerated ? card('Summary', el('p', { className: 'answer', textContent: d.answer })) : '');

// Issues stay hidden until the user asks for them.
function collapsedIssues(d, title) {
  if (!d.sources.length) return '';
  const body = issueTable(d.sources, d.facts.total, title);
  body.hidden = true;
  const ask = 'Want to see the actual issues? Click here.';
  const link = el('a', { href: '#', className: 'show-issues', textContent: ask });
  link.addEventListener('click', (e) => {
    e.preventDefault();
    body.hidden = !body.hidden;
    link.textContent = body.hidden ? ask : 'Hide the issues.';
  });
  const jiraLink = d.searchUrl ? [' \u00b7 ', el('a', { href: d.searchUrl, target: '_blank', rel: 'noopener', textContent: 'Open this search in Jira' })] : [];
  return el('div', {}, el('p', { className: 'issues-link' }, link, ...jiraLink), body);
}

function render(d) {
  const f = d.facts;
  const parts = [];
  const stamp = `Retrieved ${new Date(d.retrievedAt).toLocaleString()}. ${d.aiGenerated ? 'AI-generated summary.' : 'Rule-based summary.'}`;

  if (d.kind === 'issue') {
    const s = d.sources[0];
    parts.push(el('section', { className: 'card issue-card' },
      el('a', { className: 'issue-key', href: s.url, target: '_blank', rel: 'noopener', textContent: s.key }),
      el('h2', { textContent: s.summary }),
      el('div', { className: 'badges' }, badge(s.type, '#64748b'), badge(s.status, CAT_COLORS[s.statusCategory] || CAT_COLORS.None), badge(s.priority, PRIORITY_COLORS[s.priority] || PRIORITY_COLORS.None), badge(s.assignee, '#7c3aed')),
      el('p', { className: 'answer', textContent: f.issue.description || 'No description.' })));
  } else if (d.kind === 'answer') {
    parts.push(card('Answer', el('p', { className: 'answer', textContent: d.answer })));
    parts.push(collapsedIssues(d, 'Related issues'));
  } else if (d.kind === 'coverage') {
    const pct = f.total ? Math.round((f.withTests / f.total) * 100) : 0;
    const colors = { 'With test cases': '#16a34a', 'No test cases': '#dc2626' };
    parts.push(
      el('div', { className: 'result-head' }, el('h2', { textContent: `${f.project} test coverage (QMetry)` })),
      el('div', { className: 'kpis' },
        kpi('Stories', f.total),
        kpi('Coverage', `${pct}%`, pct >= 80 ? 'good' : 'warn'),
        kpi('With test cases', f.withTests, 'good'),
        kpi('No test cases', f.withoutTests, f.withoutTests ? 'bad' : ''),
        kpi('Automated', f.automated),
        kpi('Latest fail', f.failed, f.failed ? 'bad' : '')),
      takeaways([
        { tone: pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad', text: `${pct}% of stories have a linked test case (${f.withTests} of ${f.total}).` },
        ...(f.withoutTests ? [{ tone: 'bad', text: `${f.withoutTests} stories have no test case at all.` }] : []),
        ...(f.failed ? [{ tone: 'bad', text: `${f.failed} stories have a test case whose latest run failed.` }] : [{ tone: 'good', text: 'No stories with a failing latest run.' }]),
      ]),
      el('div', { className: 'grid' },
        card('Stories by coverage', donut({ 'With test cases': f.withTests, 'No test cases': f.withoutTests }, (n) => colors[n])),
        card('Latest execution (stories)', bars({ Pass: f.passed, Fail: f.failed }, (n) => (n === 'Pass' ? '#16a34a' : '#dc2626')))),
      summaryCard(d),
      d.sources.length ? collapsedIssues(d, 'Open stories with no test cases') : el('p', { className: 'meta', textContent: 'Every open story has a linked test case.' }));
  } else if (d.kind === 'search' && !f.total) {
    parts.push(el('div', { className: 'result-head' }, el('h2', { textContent: f.title })), card('Summary', el('p', { className: 'answer', textContent: d.answer })));
  } else {
    const done = f.byStatusCategory.Done || 0;
    const title = d.kind === 'search' ? f.title.charAt(0).toUpperCase() + f.title.slice(1)
      : `${f.project} ${{ bugs: 'open bugs', sprint: 'current sprint', stories: 'user stories', health: 'recent activity (60 days)' }[d.kind]}`;
    const people = d.kind === 'search' && Object.keys(f.byAssignee).length > 1 ? [card('By assignee', bars(f.byAssignee, (n, i) => FALLBACK_COLORS[i % FALLBACK_COLORS.length]))] : [];
    if (d.kind === 'search' && Object.keys(f.byProject).length > 1) people.unshift(card('By project', bars(f.byProject, (n, i) => FALLBACK_COLORS[i % FALLBACK_COLORS.length])));
    parts.push(
      el('div', { className: 'result-head' }, el('h2', { textContent: title })),
      el('div', { className: 'kpis' },
        kpi('Issues', f.total),
        kpi('Done', done, 'good'),
        kpi('Not done', f.total - done),
        kpi('Overdue', f.overdue, f.overdue ? 'bad' : ''),
        kpi('Unassigned', f.unassigned, f.unassigned ? 'warn' : '')),
      takeaways(searchTakeaways(f)),
      progressBar(f.byStatusCategory, (n) => CAT_COLORS[n] || CAT_COLORS.None),
      el('div', { className: 'grid' },
        card('By status', donut(f.byStatusCategory, (n) => CAT_COLORS[n] || CAT_COLORS.None)),
        card('By priority', bars(f.byPriority, (n) => PRIORITY_COLORS[n] || PRIORITY_COLORS.None)),
        card('By type', bars(f.byType, (n, i) => FALLBACK_COLORS[i % FALLBACK_COLORS.length])),
        ...people),
      summaryCard(d),
      collapsedIssues(d, 'Issues'));
  }

  parts.push(
    ...(d.incomplete ? [el('p', { className: 'meta warn', textContent: 'Results may be incomplete: more issues matched than were retrieved.' })] : []),
    el('p', { className: 'meta', textContent: stamp }),
    el('div', { className: 'report' }, 'Would you like a report?', el('button', { type: 'button', textContent: 'Download PDF report', onclick: downloadReport })));
  result.replaceChildren(...parts);
}

function downloadReport() {
  const head = document.getElementById('print-head');
  head.replaceChildren(
    el('h1', { textContent: 'Jira report' }),
    el('p', { textContent: `Question: ${last.question}` }),
    el('p', { textContent: `Retrieved: ${new Date(last.retrievedAt).toLocaleString()}` }));
  const hidden = [...result.querySelectorAll('[hidden]')];
  hidden.forEach((n) => { n.hidden = false; });
  const title = document.title;
  document.title = `Jira report - ${last.question.slice(0, 60)}`;
  window.addEventListener('afterprint', () => {
    hidden.forEach((n) => { n.hidden = true; });
    document.title = title;
  }, { once: true });
  window.print();
}

form.addEventListener('submit', (e) => { e.preventDefault(); ask(document.getElementById('q').value); });
document.getElementById('chips').addEventListener('click', (e) => {
  const prefix = e.target.dataset?.prefix;
  if (!prefix) return;
  const q = document.getElementById('q');
  q.value = prefix;
  q.focus();
});
