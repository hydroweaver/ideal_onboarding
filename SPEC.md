# Relay — CPaaS onboarding spec

Prototype: open `index.html` (no build). Brand is fictional ("Relay"); the product shape mirrors a WhatsApp-only CPaaS like Heltar: broadcasts, no-code bot, team inbox, API for transactional messages.

## The one idea

**People sign up for a CPaaS to put a WhatsApp message on a customer's phone.** Everything else — Meta verification, templates, billing, webhooks — is in the way of that. So:

1. The aha (a message you sent lands on *your own* phone) happens on screen 3, before Meta, before a card.
2. The first real question is *why are you here* (screen 1) and its answer drives every screen after it, including the home page.
3. After the wizard, the home page is not a dashboard. It is **one next step**, and the platform keeps guiding — calmly.

## Principles

| # | Rule | Where it shows up |
|---|---|---|
| 1 | Aha in < 2 min, before Meta | Screen 3: sandbox number + `join <code>` → live "Connected ✓" → compose → phone mock |
| 2 | Ask "why" first, not last | Screen 1 (JTBD multi-select) → journeys, nav, starter template, home |
| 3 | One decision per screen | Every screen: one primary button, one quiet "later" link, ≤ 4 choices |
| 4 | Never ask what we can derive | Website → company name + industry → pre-written template draft |
| 5 | Show state, not instructions | "Waiting… → Connected ✓", template "pending → approved", number "reviewing → live" |
| 6 | Never show an empty dashboard | Home = "Next up" card; every module has an empty state that names the one thing to do |
| 7 | Blockers come with a "meanwhile" | Number pending → side card says what to do while waiting |
| 8 | Calm over complete | Guidance budget below; progressive-disclosure nav |
| 9 | Agent parity | `GET /v1/onboarding` = the same plan + hints as JSON; errors carry the fix |

## Human flow (8 screens)

| # | Screen | Primary | Skippable | Borrowed |
|---|---|---|---|---|
| 0 | Sign up (Google / email + website) | Continue | – | Zendesk website prefill |
| 1 | What brought you here? (4 cards, multi) + Just me / My team | Next | no — drives everything | OpenRouter persona; Firecrawl "endpoints" moved to the front |
| 2 | Workspace ready: key shown once, ₹2,000 limit + expiry explained, cURL/Node/Python that already sends | Continue | – | OpenRouter p.3 |
| 3 | Send your first message: QR + join code, live status, compose, phone mock, confetti | Send → Continue | "Skip for now" | Twilio sandbox pattern |
| 4 | Connect your coding agent `OPTIONAL`: Claude Code / Cursor / Windsurf / CLI + SKILL.md | I've connected it | yes | Firecrawl p.11 |
| 5 | Connect your own number `OPTIONAL`: 3-item pre-flight checklist → Embedded Signup (simulated) or "keep using sandbox" | Start / Keep sandbox | yes, nagged later | Heltar's real prerequisites |
| 6 | Add payment `OPTIONAL`: "no charge yet", free credits, two bonus-credit tasks | Save card | "I'll do this later" | OpenRouter p.4, Firecrawl p.8 |
| 7 | You're all set: status summary + one-click "where did you hear about us" | Go to your plan | – | OpenRouter p.6 (survey moved here) |

Progress rail: dots + `STEP N OF 7` + `OPTIONAL` badge. Back on every screen. State persists across reload.

## Home — "Your plan"

- Left nav shows only modules relevant to the chosen jobs (`MODULES[].show` in `journeys.js`). Others live under **More** and appear when they become relevant (Templates appears once a template exists or the number is live; API appears when an agent is connected).
- Main: **one big "Next up" card** — title, *why it matters*, `Open`, `Show me how` (spotlight tour), `Do it for me` (seeds the thing). Remaining steps collapsed under it.
- Right: **Your number** card (Sandbox / Meta reviewing + *meanwhile* / Live) and Credits.

Journeys per job (`JOURNEYS` in `journeys.js`):

- **Broadcasts**: add contacts → create template (drafted) → send test to yourself → first broadcast
- **Automation**: pick starter bot → test in sandbox → publish
- **Team inbox**: invite teammate → assign a conversation → hours + away message
- **API**: send from code → set + verify webhook → OTP template

## Guidance layer (WalkMe-style, calm)

Engine: `guide.js`. Data: `journeys.js`. Four mechanisms, **one visible at a time, ever**:

1. **Launcher** (bottom-right bubble, `3/7`): the plan, "Show me" per step, replay tour, tips on/off, and an *Ask* box that answers "what now?" from state.
2. **Spotlight tours**: ≤ 4 steps, auto-start once per page **only when the page is empty**; Back / Next / Skip / Don't show again; Esc closes.
3. **Beacons**: max **one** per page, on the most useful untouched thing; disappears once used.
4. **Nudges**: state-triggered slide-in cards (never modals): number went live → send; template approved → test; webhook unverified → ping; sandbox for 2 sessions → go-live checklist; credits < 20% → add card.

Calm budget (hard-coded in `guide.js`): max **2 nudges per session**, **5-min cooldown**, **none in the first 20 s on a page**, held while the user is typing, priority queue, dismissal remembered, "Turn off tips" kills the layer. Demo controls expose the live budget (`nudges 1/2 · held 2`) and a Fast-timers toggle (2 s / 5 s) for demos.

## The assistant — one tool surface, three clients

The launcher bubble (bottom-right, on every screen) opens the **Relay assistant**. It is not a help-article search: it can explain anything about Relay and WhatsApp rules, tell you the next step, take you to a screen, start a walkthrough — and **do the work**: add contacts, write and submit templates, send tests and broadcasts, invite teammates, set hours and the webhook, build/test/publish a bot, submit your number to Meta.

It does this through `App.work` (`app.js`) — a plain work API (`add_contacts`, `create_template`, `send_broadcast`, `invite_teammate`, `set_webhook`, `pick_bot`, `connect_number`, `get_onboarding`, …) that returns small data and throws on problems, exactly like REST endpoints. **The GUI forms, the in-app assistant and an external MCP agent (Claude Code) are three clients of that one surface.** Consequential actions (a broadcast to real contacts) return `needs_confirmation` with count + cost; the assistant quotes it and only sends on an explicit yes.

Brain: when published as a claude.ai artifact, the assistant is **Claude** (via the `sample` capability) with the work API exposed as tools and the live account state in the prompt, so it answers from truth and acts. Opened locally or elsewhere, a **scripted brain** understands the same commands ("add contacts: Priya +91…", "create a utility template that says…", "send a broadcast", "invite x@y", "set webhook https://…", "build a lead bot", "connect my number +91…").

Calm rules still apply: the assistant lives *inside* the launcher — the single help affordance — and never pops up on its own.

## Agent flow

`npx relay-cli init` → device-code login → key (same limits) → `GET /v1/onboarding` → `POST /v1/messages` → `claude mcp add …` → `hints[]`.

`GET /v1/onboarding` returns `{ status, sandbox:{number, join_code, connected}, own_number, credits, next_steps:[{id,title,why,endpoint}], hints:[{id,text}] }` — the human "Your plan" and the agent's `next_steps` are generated from the same state. Errors carry the fix (`409 sandbox_not_joined` → the join code). Toggle **Agent** in the prototype bar to watch it.

## What we took / what we rejected

| Source | Took | Rejected |
|---|---|---|
| OpenRouter | Persona on screen 1; key once with limit + expiry explained; code tabs; "I'll do this later"; dots; "Go to dashboard" | "Where did you hear about us" before any value — moved to the last screen as one click |
| Firecrawl | `OPTIONAL` badge + `STEP N OF 5`; bonus credits; Connect-to-agent (MCP cmd, SKILL.md, CLI) | "Which endpoints" as the *last* step — it's the first question; 6-tile credit grid — cut to 2 |
| Zendesk | Prefill from website; trial-task checklist | Long profile form (job title, company size) up front |
| WalkMe | Tours, beacons, journeys, launcher | Multiple overlays at once, modal takeovers, tour on every page load |

## Files

`index.html` · `styles.css` (tokens, light/dark) · `journeys.js` (data) · `guide.js` (guidance engine + launcher) · `assistant.js` (assistant: Claude tools + scripted brain) · `app.js` (state, screens, work API, agent mode, demo controls)

Run locally: `python -m http.server 8765` in this folder → http://127.0.0.1:8765/index.html
