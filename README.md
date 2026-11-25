# Atlassian Lense

A lightweight web app for exploring Jira and Confluence data, with an onboarding deck builder. Ask plain-language questions about Jira projects, search Confluence pages and files, or generate role-specific onboarding slides from your team's Atlassian content.

## Features

- **Jira Lense:** Search issues and people, view project health, bugs, sprint progress, stories, and QMetry test coverage.
- **Confluence Lense:** Search pages, blog posts, and attachments by keywords.
- **Onboarding Assist:** Build a role-specific onboarding deck using relevant Confluence content and recent Jira activity. Print or save the deck as a PDF.
- **Two authentication modes:** Use a shared Jira API token, or let each user sign in through Atlassian OAuth.
- **Optional AI answers:** Configure an OpenAI-compatible chat-completions endpoint for conversational answers. Without an LLM key, Jira questions use the built-in rules and summaries.

## Requirements

- Node.js. The package declares Node.js 18 or newer; `npm start` uses Node's `--env-file-if-exists` option, so use a release that supports it (Node.js 20.18+ or 22.9+).
- An Atlassian Cloud site with access to the Jira and/or Confluence data you want to use.
- For token authentication, a Jira API token and the Atlassian account email that owns it.

## Setup

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Copy the example environment file:

   ```sh
   # macOS / Linux
   cp .env.example .env

   # Windows PowerShell
   Copy-Item .env.example .env
   ```

3. Edit `.env` and set the Atlassian site URL and credentials for your chosen authentication mode.

4. Start the server:

   ```sh
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000). Set `PORT` in `.env` to use a different port.

## Authentication

### Shared API token (default)

Set `AUTH_MODE=token` and provide:

```dotenv
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-atlassian-api-token
```

The same Jira API token is used for Jira and Confluence requests. Create an API token in your Atlassian account settings. Keep `.env` private; it is excluded from Git.

### Per-user Atlassian OAuth

Set `AUTH_MODE=oauth`. Each user signs in with Atlassian through the Atlassian MCP service; the app uses that user's access for Jira and Confluence.

Set `APP_URL` to the exact origin users visit, for example `http://localhost:3000` for local development. The OAuth callback is `${APP_URL}/auth/callback`; use a publicly reachable HTTPS origin when hosting the app for other users. `JIRA_BASE_URL` should identify the Atlassian site to use. `ATLASSIAN_MCP_URL` is optional and defaults to `https://mcp.atlassian.com/v2/mcp`.

## Configuration

| Variable | Description |
| --- | --- |
| `AUTH_MODE` | `token` (default) or `oauth`. |
| `JIRA_BASE_URL` | Atlassian site URL, e.g. `https://your-company.atlassian.net`. |
| `JIRA_EMAIL` | Account email for shared-token mode. |
| `JIRA_API_TOKEN` | Atlassian API token for shared-token mode. |
| `APP_URL` | App origin used to construct the OAuth callback; defaults to `http://localhost:${PORT || 3000}`. |
| `ATLASSIAN_MCP_URL` | Atlassian MCP endpoint; defaults to `https://mcp.atlassian.com/v2/mcp`. |
| `LLM_BASE_URL` | Optional OpenAI-compatible API base URL; defaults to `https://api.openai.com/v1`. |
| `LLM_API_KEY` | Optional model API key. When set, enables the conversational Jira agent and LLM-generated summaries. |
| `LLM_MODEL` | Model name; defaults to `gpt-4o-mini`. |
| `PORT` | HTTP server port; defaults to `3000`. |

QMetry coverage uses QMetry JQL functions in Jira. It requires QMetry to be available on the Atlassian site and the signed-in/shared account to have permission to query the relevant test data.

## Using the app

- Start at the home page and choose Jira, Confluence, or Onboarding.
- In Jira Lense, ask questions such as “open bugs in MERC”, “what is Alex working on?”, or “how healthy is MERC?”
- In Confluence Lense, search for phrases and optionally limit results to pages or files.
- In Onboarding Assist, choose a role and optionally enter a team or project. Generate the deck, navigate the slides, and use **Save as PDF** to print it.

## Notes

- The app is designed for read-only Atlassian exploration; it does not create or modify Jira issues or Confluence content.
- Jira searches may return a limited set of recent issues and indicate when results are incomplete.
- The onboarding checklist's tick marks are saved in the current browser.
