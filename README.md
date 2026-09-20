# Relay — CPaaS onboarding prototype

A clickable prototype of a calm, self-guided onboarding for a WhatsApp CPaaS (Heltar-like): sandbox-first wizard, a job-driven "Your plan" home, budgeted WalkMe-style guidance, and an in-app assistant that does the work through the same tool surface an external agent uses.

**Live:** https://relay-onboarding-production.up.railway.app · **Repo:** https://github.com/hydroweaver/ideal_onboarding · **Design rationale and flow:** [SPEC.md](SPEC.md)

Deploys automatically from `main` via Railway (nginx, see `Dockerfile`). Open a PR for changes; merge = deploy.

## Run it

No build step. Any static server works:

```
python -m http.server 8765
# → http://127.0.0.1:8765/index.html
```

Use **Demo controls** in the top bar to skip the wizard, fire triggers (approve template, number goes live…) and reset.

## Files

| File | What |
|---|---|
| `index.html` | shell |
| `styles.css` | tokens (light/dark), all styling |
| `journeys.js` | **data only** — jobs, journeys, tours, beacons, nudge rules. Edit this to change what the product guides people towards. |
| `guide.js` | guidance engine: launcher, tours, beacons, nudges, calm budget |
| `assistant.js` | in-app assistant — Claude-backed on claude.ai artifacts, scripted brain elsewhere |
| `app.js` | state, wizard screens, app pages, **work API** (`App.work`), agent mode, demo controls |

## Contributing

- Copy/flow/nudge changes: almost always `journeys.js`.
- New screens or pages: `app.js` → `screens` / `pages`, plus a `[data-tour]` anchor if it should be tourable.
- Keep the calm rules (`SPEC.md` → Guidance layer): one guidance element at a time, no modals, ≤4 choices per screen.
