// Offline natural-language interpreter: turns a casual question into JQL using local rules only (nothing leaves the server).
const TYPE_WORDS = [
  [/\b(bugs?|defects?)\b/, 'Bug'],
  [/\bstor(y|ies)\b/, 'Story'],
  [/\b(sub-?tasks?)\b/, 'Sub-task'],
  [/\btasks?\b/, 'Task'],
  [/\bepics?\b/, 'Epic'],
];
const PRIORITY_RE = /\b(urgent|critical|blockers?|highest|high[- ]priority|high priority|high)\b/;
const DONE_RE = /\b(done|closed|completed?|resolved|finished|delivered)\b/;
const OPEN_RE = /\b(open|unresolved|pending|outstanding|remaining|active|not done|incomplete|still)\b/;
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const UNIT = { day: 'd', days: 'd', week: 'w', weeks: 'w', month: 'M', months: 'M' };

const esc = (s) => s.replace(/(["\\])/g, '\\$1');

function timeClause(q, field) {
  let m = q.match(/\b(?:last|past|previous)\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|months?)\b/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Math.min(Number(m[1]), 365) : NUM[m[1]];
    return { sql: `${field} >= -${n}${UNIT[m[2]]}`, label: `${field} in the last ${n} ${m[2].replace(/s$/, '')}${n > 1 ? 's' : ''}` };
  }
  if (/\btoday\b/.test(q)) return { sql: `${field} >= startOfDay()`, label: `${field} today` };
  if (/\byesterday\b/.test(q)) return { sql: `${field} >= startOfDay(-1d) AND ${field} < startOfDay()`, label: `${field} yesterday` };
  if (/\blast week\b/.test(q)) return { sql: `${field} >= startOfWeek(-1w) AND ${field} < startOfWeek()`, label: `${field} last week` };
  if (/\b(this|current) week\b/.test(q)) return { sql: `${field} >= startOfWeek()`, label: `${field} this week` };
  if (/\blast month\b/.test(q)) return { sql: `${field} >= startOfMonth(-1M) AND ${field} < startOfMonth()`, label: `${field} last month` };
  if (/\b(this|current) month\b/.test(q)) return { sql: `${field} >= startOfMonth()`, label: `${field} this month` };
  if (/\brecent(ly)?|lately|latest\b/.test(q)) return { sql: `${field} >= -14d`, label: `${field} in the last 14 days` };
  return null;
}

// ctx: { projects: [{key,name}] | null, people: string[], resolved?: { users: [{accountId, displayName}] } }
const NOT_NAME = new Set('me my mine i we you he she they it this that these those the a an all everyone everybody anyone someone nobody team teams project projects sprint sprints week month today yesterday open done closed bugs bug stories story tasks task issues issue tickets high urgent critical in on at for of to from by with and or last next current recent right now jira working doing assigned'.split(' '));
const LEAD = new Set('show list give find get see tell display what whats who which any please can could'.split(' '));
const NAME = "[a-z][a-z.-]+(?:\\s+[a-z][a-z.-]+)?";
const PERSON_PATTERNS = [
  new RegExp(`\\bwhat\\s+(?:is|has|was|did|does|are)\\s+(${NAME})\\s+(?:working|doing|done|handling|assigned|completed|closed|busy|up to|been)\\b`),
  new RegExp(`\\bwhat\\s+(${NAME})\\s+(?:is|has|was)\\s+(?:working|doing|assigned|handling)\\b`),
  new RegExp(`\\b(?:assigned to|assignee|owned by|belonging to|raised by|reported by|done by|closed by|worked on by)\\s+(${NAME})\\b`),
  new RegExp(`\\b(${NAME})(?:'s|\u2019s)\\s+(?:(?:open|closed|current|recent|all|high|critical|pending|new)\\s+)*(?:tasks?|issues?|tickets?|work|bugs?|stories|items?|workload|backlog)\\b`),
  new RegExp(`\\b(?:tasks?|issues?|tickets?|bugs?|stories|work|workload|items?)\\s+(?:of|for)\\s+(${NAME})\\b`),
];

function findPersonCandidate(q, projects) {
  const projectWords = new Set(projects.flatMap((p) => [p.key, p.name].filter(Boolean).flatMap((x) => x.toLowerCase().split(/\s+/))));
  for (const re of PERSON_PATTERNS) {
    const m = q.match(re);
    if (!m) continue;
    const words = [];
    for (const w of m[1].split(/\s+/)) {
      if (!words.length && LEAD.has(w)) continue;
      if (NOT_NAME.has(w) || projectWords.has(w)) break;
      words.push(w);
    }
    const name = words.join(' ').trim();
    if (name.length >= 3) return name;
  }
  return null;
}

function interpret(question, ctx) {
  const q = question.toLowerCase().replace(/[?!.,]+/g, ' ');
  const where = [];
  const labels = [];
  const client = [];

  const projects = ctx.projects || [];
  let keys = [...new Set(projects
    .filter((p) => new RegExp(`\\b${p.key.toLowerCase()}\\b`).test(q) || (p.name && q.includes(p.name.toLowerCase())))
    .map((p) => p.key))];
  if (!keys.length && !projects.length) keys = [...new Set((question.match(/\b[A-Z][A-Z0-9_]{1,19}\b/g) || []).filter((w) => !['AI', 'JIRA', 'QA', 'ME', 'I', 'BUG', 'BUGS'].includes(w)))];
  else if (!keys.length && projects.length === 1) keys = [projects[0].key];
  const project = keys.length === 1 ? keys[0] : null;
  if (keys.length === 1) { where.push(`project = ${keys[0]}`); labels.push(`project ${keys[0]}`); }
  else if (keys.length > 1) { where.push(`project in (${keys.join(', ')})`); labels.push(`projects ${keys.join(' + ')}`); }

  let personFilter = false;
  let personCandidate = null;
  if (/\b(my|mine|me|i am|i'm|assigned to me)\b/.test(q)) {
    where.push('assignee = currentUser()');
    labels.push('assigned to you');
    personFilter = true;
  } else if (ctx.resolved?.users?.length) {
    where.push(`assignee in (${ctx.resolved.users.map((u) => `"${esc(u.accountId)}"`).join(', ')})`);
    labels.push(`assigned to ${[...new Set(ctx.resolved.users.map((u) => u.displayName))].join(' / ')}`);
    personFilter = true;
  } else {
    // A name introduced by a cue ("what is X working on") is looked up in Jira; only an exact full-name match skips that.
    const candidate = findPersonCandidate(q, projects);
    const people = ctx.people || [];
    const name = candidate
      ? people.find((n) => n.toLowerCase() === candidate)
      : people.find((n) => {
        const parts = n.toLowerCase().split(/\s+/);
        return q.includes(n.toLowerCase()) || parts.some((p) => p.length >= 3 && new RegExp(`\\b${p}('s)?\\b`).test(q));
      });
    if (name) { where.push(`assignee = "${esc(name)}"`); labels.push(`assigned to ${name}`); personFilter = true; }
    else personCandidate = candidate;
  }
  if (/\bunassigned|nobody|no one|not assigned\b/.test(q)) { where.push('assignee is EMPTY'); labels.push('unassigned'); }

  const type = TYPE_WORDS.find(([re]) => re.test(q))?.[1];
  if (type) { where.push(`issuetype = "${type}"`); labels.push({ Story: 'stories', Bug: 'bugs', Task: 'tasks', Epic: 'epics', 'Sub-task': 'sub-tasks' }[type]); }

  const wantsDone = DONE_RE.test(q) && !/\bnot (done|closed|completed)\b/.test(q);
  const wantsOpen = OPEN_RE.test(q) || /\boverdue\b/.test(q);
  const sprint = /\bsprint\b/.test(q);
  let statusSet = false;
  if (/\bin progress|working on|being worked|ongoing|wip\b/.test(q)) { where.push('statusCategory = "In Progress"'); labels.push('in progress'); statusSet = true; }
  else if (/\bto ?do|backlog|not started|new requests?\b/.test(q)) { where.push('statusCategory = "To Do"'); labels.push('not started'); statusSet = true; }
  else if (wantsDone && !wantsOpen) { where.push('statusCategory = Done'); labels.push('done'); statusSet = true; }
  else if (wantsOpen || ((type === 'Bug' || personFilter) && !wantsDone)) { where.push('statusCategory != Done'); labels.push('open'); statusSet = true; }

  if (/\boverdue|past due|late\b/.test(q)) { where.push('duedate < now()'); labels.push('overdue'); if (!statusSet) where.push('statusCategory != Done'); }
  else if (/\bdue (soon|this week|next week)\b/.test(q)) { where.push('duedate >= now() AND duedate <= 7d'); labels.push('due within 7 days'); }

  if (sprint) { where.push('sprint in openSprints()'); labels.push('in the current sprint'); }

  const field = /\b(created|raised|opened|logged|reported|new)\b/.test(q) ? 'created'
    : wantsDone && !wantsOpen && /\b(closed|completed?|resolved|finished|delivered|done)\b/.test(q) ? 'resolutiondate' : 'updated';
  const time = timeClause(q, field);
  if (time) { where.push(time.sql); labels.push(time.label.replace('resolutiondate', 'resolved')); }

  const rawPhrase = question.match(/["“']([^"”']{2,60})["”']/)?.[1] || question.match(/\b(?:about|regarding|mentioning|containing|related to|around)\s+([a-z0-9 _-]{3,40})/i)?.[1];
  const phrase = rawPhrase?.replace(/\s+(in|for|on|from|of|within|this|last|that|which|assigned|created|updated|are|is)\b.*$/i, '').trim();
  if (phrase && phrase.length >= 2) { where.push(`text ~ "${esc(phrase)}"`); labels.push(`mentioning "${phrase}"`); }

  if (PRIORITY_RE.test(q)) {
    const strict = /\b(urgent|critical|blockers?|highest)\b/.test(q);
    client.push((i) => (strict ? /highest|critical|blocker|urgent/i : /high|critical|blocker|urgent/i).test(i.priority || ''));
    labels.push(strict ? 'highest priority' : 'high priority');
  }

  const wantsCount = /\bhow many|number of|count\b/.test(q);
  const specific = where.length > (keys.length ? 1 : 0) || client.length > 0 || keys.length > 1;
  if (!where.length && !client.length) return null;
  return {
    project,
    personCandidate,
    projects: keys,
    specific,
    wantsCount,
    labels,
    client,
    jql: `${where.join(' AND ')} ORDER BY updated DESC`,
    whereOnly: where.join(' AND '),
  };
}

module.exports = { interpret };
