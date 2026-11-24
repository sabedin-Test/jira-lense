// Builds an onboarding deck for a role by searching Confluence per topic and summarising the team's recent Jira activity.
const esc = (s) => s.replace(/(["\\])/g, '\\$1');

const COMMON_TOPICS = [
  { id: 'access', title: 'Accesses & accounts', intro: 'What to request or set up before you can start working.', phrases: ['access request', 'request access', 'new joiner', 'account setup', 'vpn', 'onboarding checklist'] },
  { id: 'tools', title: 'Tools & environments', intro: 'Where the team works and the environments you will use.', phrases: ['environment setup', 'tools', 'environments', 'urls', 'getting started'] },
  { id: 'ways', title: 'Ways of working', intro: 'How the team plans, delivers and releases.', phrases: ['ways of working', 'definition of done', 'sprint ceremonies', 'release process', 'agile'] },
  { id: 'overview', title: 'Product & architecture', intro: 'What the team builds and how it fits together.', phrases: ['solution overview', 'architecture overview', 'product overview', 'solution intent', 'high level design'] },
  { id: 'contacts', title: 'Who to ask', intro: 'Contacts, support channels and escalation paths.', phrases: ['contacts', 'escalation', 'support model', 'raci', 'team structure'] },
];

const ROLES = {
  qa: {
    label: 'QA / Test Engineer',
    topics: [
      { id: 'strategy', title: 'Test strategy & plans', intro: 'How the team approaches testing and what is expected of you.', phrases: ['test strategy', 'test plan', 'test approach', 'sit', 'uat'] },
      { id: 'testenv', title: 'Test environments & data', intro: 'Where to test and which data to use.', phrases: ['test environment', 'test data', 'sit environment', 'uat environment', 'test accounts'] },
      { id: 'defects', title: 'Defect management', intro: 'How bugs are raised, triaged and prioritised.', phrases: ['defect management', 'bug triage', 'defect process', 'severity', 'bug report'] },
      { id: 'automation', title: 'Test automation', intro: 'Frameworks and guidelines for automated tests.', phrases: ['test automation', 'automation framework', 'regression suite', 'automation guide'] },
      { id: 'qmetry', title: 'Test case management (QMetry)', intro: 'How test cases and cycles are written and tracked.', phrases: ['qmetry', 'test case guidelines', 'test cycle', 'test case template'] },
    ],
    checklist: ['Get Jira and Confluence access', 'Request QMetry access', 'Get test environment URLs and test accounts', 'Read the test strategy', 'Join sprint ceremonies and the defect triage call', 'Shadow one test cycle end to end', 'Meet your onboarding buddy'],
  },
  dev: {
    label: 'Developer',
    topics: [
      { id: 'setup', title: 'Developer setup', intro: 'Repositories, tooling and local setup.', phrases: ['developer setup', 'local setup', 'repository', 'git branching', 'coding standards'] },
      { id: 'cicd', title: 'CI/CD & deployment', intro: 'How code gets built, reviewed and released.', phrases: ['ci/cd', 'pipeline', 'deployment process', 'release process', 'code review'] },
      { id: 'design', title: 'Design & APIs', intro: 'Designs and interfaces you will work against.', phrases: ['api specification', 'low level design', 'technical design', 'swagger', 'integration'] },
      { id: 'quality', title: 'Quality & testing', intro: 'Unit testing and quality gates.', phrases: ['unit test', 'quality gate', 'definition of done', 'test strategy'] },
    ],
    checklist: ['Get Jira, Confluence and source control access', 'Set up your local environment', 'Get access to dev and test environments', 'Read the coding standards and branching guide', 'Make a first small pull request', 'Meet your onboarding buddy'],
  },
  ba: {
    label: 'Business Analyst / Product',
    topics: [
      { id: 'reqs', title: 'Requirements & user stories', intro: 'Templates and standards for writing requirements.', phrases: ['requirements', 'user story', 'acceptance criteria', 'business requirements', 'brd'] },
      { id: 'backlog', title: 'Backlog & prioritisation', intro: 'How work is refined and prioritised.', phrases: ['backlog refinement', 'prioritisation', 'roadmap', 'release plan', 'epic'] },
      { id: 'stakeholders', title: 'Stakeholders & governance', intro: 'Who decides what, and how.', phrases: ['stakeholders', 'governance', 'steering committee', 'sign off', 'raci'] },
    ],
    checklist: ['Get Jira and Confluence access', 'Review the product roadmap and backlog', 'Read the requirement and story templates', 'Meet key stakeholders', 'Join backlog refinement', 'Meet your onboarding buddy'],
  },
  pm: {
    label: 'Project / Delivery Manager',
    topics: [
      { id: 'plan', title: 'Planning & status', intro: 'Plans, milestones and how status is reported.', phrases: ['project plan', 'status report', 'milestones', 'release plan', 'weekly status'] },
      { id: 'raid', title: 'Risks & governance', intro: 'Risk, issue and change management.', phrases: ['raid log', 'risk register', 'governance', 'change request', 'steering committee'] },
      { id: 'budget', title: 'Resourcing & vendors', intro: 'Team structure and external partners.', phrases: ['team structure', 'resource plan', 'vendor', 'rate card', 'raci'] },
    ],
    checklist: ['Get Jira and Confluence access', 'Review the current plan and RAID log', 'Meet the sponsor and key stakeholders', 'Join governance and status meetings', 'Meet your onboarding buddy'],
  },
  data: {
    label: 'Data Engineer',
    topics: [
      { id: 'platform', title: 'Data platform', intro: 'The platform, workspaces and key datasets.', phrases: ['databricks', 'data platform', 'delta', 'workspace', 'data catalog'] },
      { id: 'pipelines', title: 'Pipelines & operations', intro: 'How pipelines are built, deployed and monitored.', phrases: ['pipeline', 'data pipeline', 'deployment', 'monitoring', 'runbook'] },
      { id: 'standards', title: 'Standards & governance', intro: 'Coding, naming and data governance standards.', phrases: ['coding standards', 'naming convention', 'data governance', 'data quality', 'best practices'] },
    ],
    checklist: ['Get Jira, Confluence and workspace access', 'Set up your development environment', 'Read the platform and standards documentation', 'Review a recent pipeline end to end', 'Meet your onboarding buddy'],
  },
};

const norm = (s = '') => s.toLowerCase();

function scoreItem(r, phrases) {
  const title = norm(r.title);
  const text = norm(r.excerpt);
  let score = r.type === 'attachment' ? 0 : 3;
  phrases.forEach((p) => {
    const q = norm(p);
    if (title.includes(q)) score += 8;
    else if (q.split(' ').every((w) => title.includes(w))) score += 4;
    if (text.includes(q)) score += 2;
  });
  const ageDays = r.modified ? (Date.now() - new Date(r.modified).getTime()) / 864e5 : 9999;
  if (ageDays < 365) score += 2;
  else if (ageDays > 365 * 4) score -= 2;
  return score;
}

async function runTopic(confluence, topic, team) {
  const base = `type in (page, blogpost, attachment) AND (${topic.phrases.map((p) => `title ~ "${esc(p)}" OR text ~ "${esc(p)}"`).join(' OR ')})`;
  let scoped = false;
  let found = { results: [] };
  if (team) {
    found = await confluence.search(`${base} AND (title ~ "${esc(team)}" OR text ~ "${esc(team)}")`, 30);
    scoped = found.results.length > 0;
  }
  if (found.results.length < 3) {
    const wide = await confluence.search(base, 30);
    const seen = new Set(found.results.map((r) => r.id));
    found = { results: [...found.results, ...wide.results.filter((r) => !seen.has(r.id))] };
  }
  const ranked = found.results
    .map((r, i) => ({ r, i, s: scoreItem(r, topic.phrases) + (scoped && i < 30 ? 1 : 0) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 5)
    .map((x) => x.r);
  return { type: 'topic', id: topic.id, title: topic.title, intro: topic.intro, items: ranked, scoped };
}

async function snapshot(jira, project) {
  const { issues } = await jira.search(`project = ${project.key} AND updated >= -30d ORDER BY updated DESC`, 100);
  const people = {};
  issues.forEach((i) => { if (i.assignee && i.assignee !== 'Unassigned') people[i.assignee] = (people[i.assignee] || 0) + 1; });
  const done = issues.filter((i) => i.statusCategory === 'Done').length;
  return {
    key: project.key,
    name: project.name,
    recent: issues.length,
    done,
    open: issues.length - done,
    people: Object.entries(people).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
  };
}

// Runs tasks a few at a time to stay gentle on the Atlassian session.
async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

async function build({ jira, confluence, projects, role, team }) {
  const cfg = ROLES[role];
  if (!cfg) throw Object.assign(new Error('Choose a role.'), { status: 400 });
  const teamText = String(team || '').trim().slice(0, 60);
  const lower = norm(teamText);
  const project = lower ? (projects || []).find((p) => norm(p.key) === lower || norm(p.name) === lower || new RegExp(`\\b${norm(p.key)}\\b`).test(lower)) : null;
  const scopeTerm = project?.name || teamText;

  const welcome = { type: 'welcome', title: `Welcome${teamText ? ` to ${project?.name || teamText}` : ''}`, role: cfg.label, team: teamText, snapshot: null };
  if (project) {
    try { welcome.snapshot = await snapshot(jira, project); } catch (e) { if (e.loginRequired) throw e; }
  }

  const topics = [...COMMON_TOPICS.slice(0, 2), ...cfg.topics, ...COMMON_TOPICS.slice(2)];
  const topicSlides = await inBatches(topics, 3, async (t) => {
    try {
      return await runTopic(confluence, t, scopeTerm);
    } catch (e) {
      if (e.loginRequired || e.status === 401) throw e;
      return { type: 'topic', id: t.id, title: t.title, intro: t.intro, items: [], error: true };
    }
  });

  return {
    role: cfg.label,
    team: teamText,
    generatedAt: new Date().toISOString(),
    slides: [welcome, ...topicSlides, { type: 'checklist', title: 'Your first-week checklist', intro: 'A suggested starting list. Tick things off as you go; your ticks are saved on this device.', items: cfg.checklist, key: role }],
  };
}

const roleOptions = () => Object.entries(ROLES).map(([id, r]) => ({ id, label: r.label }));

module.exports = { build, roleOptions };
