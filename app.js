/* app.js — state machine, wizard screens, post-onboarding app, agent mode, demo controls. */
window.App = (function () {
  const STORAGE = "relay-onboarding-proto-v1";
  const SANDBOX = { number: "+91 22 4890 1122", code: "calm-otter" };
  const WIZARD = ["signup", "why", "workspace", "first", "agent", "number", "billing", "done"];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function defaultState() {
    return {
      mode: "human", screen: "signup", page: "home", pageEnteredAt: Date.now(),
      profile: { email: "", website: "", company: "", industry: "default", persona: "me" },
      jtbd: [],
      apiKey: "rl_live_7f3a" + Math.random().toString(36).slice(2, 10) + "…c04e", keyCopied: false,
      sandbox: { status: "waiting", messages: [] },
      agentConnected: false, agentTab: "claude",
      meta: { status: "none", number: "", checklist: { notOnWa: false, bm: false, doc: false }, remind: false },
      billing: { added: false, credits: 500, creditsTotal: 500, bonus: [] },
      source: null,
      contacts: [], templates: [], broadcasts: [], bot: null, team: [], hours: null,
      conversations: [{ id: "c1", name: "You (sandbox)", last: "Hi! This is your first message from Relay 🎉", assignee: null }],
      apiSent: false, webhook: { url: "", pinged: false },
      done: {},
      seen: [], dismissed: [], fired: [], toursDone: [], tipsOff: false,
      sessions: 1, nudgeCount: 0, lastNudgeAt: 0,
      demo: { open: false, fast: true },
      agentLog: [], agentStep: 0,
      waba: null, numbers: [], signup: WA.emptySignup(), tplDraft: null,
      ui: { codeTab: "curl", panelOpen: false },
    };
  }
  function migrate(s) {
    s.numbers = s.numbers || []; s.waba = s.waba || null; s.signup = s.signup || WA.emptySignup(); s.tplDraft = s.tplDraft || null; s.ui = s.ui || {};
    s.templates = (s.templates || []).map(t => t.header ? t : Object.assign(WA.emptyTemplate(), t, { status: t.status || "pending" }));
    return s;
  }
  let S = load() || defaultState();
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE); if (!raw) return null;
      const s = migrate(JSON.parse(raw)); s.sessions = (s.sessions || 1) + 1; s.nudgeCount = 0; s.pageEnteredAt = Date.now();
      return s;
    } catch { return null; }
  }
  function save() { try { localStorage.setItem(STORAGE, JSON.stringify(S)); } catch {} }
  function set(patch) { Object.assign(S, patch); save(); render(); }
  function go(screen) { set({ screen }); scrollTo(0, 0); }
  function nav(page) { S.page = page; S.pageEnteredAt = Date.now(); save(); render(); scrollTo(0, 0); }
  function completeToast(msg) { Guide.toast(`<span class="ok">✓</span> ${msg}`); }

  /* ================= WIZARD ================= */
  function wizardShell(inner, opts) {
    const idx = WIZARD.indexOf(S.screen); const n = WIZARD.length - 1; // steps 1..7 after sign-up
    const dots = WIZARD.slice(1).map((_, i) => `<i class="${i + 1 < idx ? "done" : i + 1 === idx ? "on" : ""}"></i>`).join("");
    return `<div class="wizard">
      <div class="brand"><span class="brandmark">R</span> Relay</div>
      <div class="card">
        ${idx > 0 ? `<div class="steprail"><div class="dots">${dots}</div><div class="row"><span class="stepno">STEP ${idx} OF ${n}</span>${opts && opts.optional ? `<span class="badge-opt">OPTIONAL</span>` : ""}</div></div>` : ""}
        ${inner}
      </div>
    </div>`;
  }
  function foot(back, primary, later) {
    return `<div class="foot">
      <div>${back ? `<button class="btn ghost" data-action="back">← Back</button>` : ""}</div>
      <div class="right">${later ? `<button class="btn link" data-action="${later.action}">${later.label}</button>` : ""}${primary || ""}</div>
    </div>`;
  }

  const screens = {
    signup() {
      return wizardShell(`
        <div class="head"><h1>Start sending on WhatsApp</h1><p>Your first message lands on your own phone in about two minutes. No card, no paperwork to start.</p></div>
        <form data-form="signup" class="stack">
          <button type="button" class="btn secondary block" data-action="google">Continue with Google</button>
          <div class="row"><hr class="grow" style="border:0;border-top:1px solid var(--line)"><span class="hint">or</span><hr class="grow" style="border:0;border-top:1px solid var(--line)"></div>
          <div class="field"><label>Work email</label><input type="email" name="email" required value="${esc(S.profile.email)}" placeholder="you@company.com"></div>
          <div class="field"><label>Company website <span class="muted">(we'll fill in your business details from it)</span></label><input type="text" name="website" value="${esc(S.profile.website)}" placeholder="acme.in"></div>
          <div class="foot"><div></div><button class="btn primary" type="submit">Continue</button></div>
        </form>`);
    },
    why() {
      const cards = Object.entries(JTBD).map(([k, v]) => `
        <button type="button" class="choice ${S.jtbd.includes(k) ? "on" : ""}" data-action="toggleJtbd" data-key="${k}">
          <span class="row between"><span class="ttl"><span class="ic">${v.icon}</span>${v.title}</span><span class="tick"></span></span>
          <span class="sub">${v.sub}</span>
        </button>`).join("");
      return wizardShell(`
        <div class="head"><h1>What brought you here${S.profile.company ? `, ${esc(S.profile.company)}` : ""}?</h1><p>Pick everything that applies. This decides what we set up for you — you can change it later.</p></div>
        <div class="choice-grid">${cards}</div>
        <div class="row between" style="margin-top:18px">
          <span class="small muted">Who's using this?</span>
          <div class="seg-toggle"><button data-action="persona" data-v="me" class="${S.profile.persona === "me" ? "on" : ""}">Just me</button><button data-action="persona" data-v="team" class="${S.profile.persona === "team" ? "on" : ""}">My team</button></div>
        </div>
        ${foot(true, `<button class="btn primary" data-action="go" data-to="workspace" ${S.jtbd.length ? "" : "disabled"}>Next</button>`)}`);
    },
    workspace() {
      const dev = S.jtbd.includes("api");
      const snip = {
        curl: `curl https://api.relay.example/v1/messages \\\n  -H "Authorization: Bearer ${S.apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "to": "YOUR_WHATSAPP_NUMBER",\n        "text": "Hi from ${esc(S.profile.company || "Relay")} 👋" }'`,
        node: `const r = await fetch("https://api.relay.example/v1/messages", {\n  method: "POST",\n  headers: { Authorization: "Bearer ${S.apiKey}", "Content-Type": "application/json" },\n  body: JSON.stringify({ to: "YOUR_WHATSAPP_NUMBER", text: "Hi from ${esc(S.profile.company || "Relay")} 👋" }),\n});\nconsole.log(await r.json()); // { id, status: "sent" }`,
        python: `import requests\nr = requests.post("https://api.relay.example/v1/messages",\n    headers={"Authorization": "Bearer ${S.apiKey}"},\n    json={"to": "YOUR_WHATSAPP_NUMBER", "text": "Hi from ${esc(S.profile.company || "Relay")} 👋"})\nprint(r.json())  # {"id": "...", "status": "sent"}`,
      };
      const setup = S.jtbd.map(k => ({ broadcast: ["📣", "Broadcasts", "a starter template drafted for your industry, ready to submit to Meta"], bot: ["🤖", "Bots", "three working starter bots to pick from"], inbox: ["💬", "Team inbox", "your sandbox conversation is already in it; invite teammates any time"], api: ["⚙️", "API", "a key with a spend limit and code that already sends"] }[k])).map(([i, t, d]) => `<div class="li ok"><span class="st">${i}</span><span><strong>${t}</strong> — ${d}</span></div>`).join("");
      return wizardShell(`
        <div class="head"><h1><span style="color:var(--ok)">✓</span> Your workspace is ready</h1><p>We made <strong>${esc(S.profile.company || "your workspace")}</strong> and gave it a <strong>sandbox WhatsApp number</strong> so you can send right now, before any paperwork.</p></div>
        <div class="stack">
          <div><div class="eyebrow" style="margin-bottom:8px">Set up for you</div><div class="summary"><div class="li ok"><span class="st">📱</span><span><strong>Sandbox number</strong> ${SANDBOX.number} — message yourself and your team while the Meta paperwork happens later</span></div>${setup}</div></div>
          ${dev ? `
          <div>
            <label>Your API key</label>
            <div class="keybox"><span class="grow">${S.apiKey}</span><button class="btn secondary sm" data-action="copyKey">${S.keyCopied ? "Copied ✓" : "Copy"}</button></div>
            <p class="hint" style="margin-top:6px">Shown in full only this once. It has a <strong>₹2,000 spend limit</strong> and expires <strong>20 Sep 2027</strong> so a leak can't hurt much — raise either on the Keys page.</p>
          </div>
          <div>
            <label>Send a message from your code</label>
            <div class="codetabs">
              <div class="tabs">${["curl", "node", "python"].map(t => `<button class="${S.ui.codeTab === t ? "on" : ""}" data-action="codeTab" data-v="${t}">${{ curl: "cURL", node: "Node", python: "Python" }[t]}</button>`).join("")}<button class="copy btn link sm" data-action="copySnippet">Copy</button></div>
              <pre>${esc(snip[S.ui.codeTab])}</pre>
            </div>
            <p class="hint" style="margin-top:6px">Sends from the sandbox number to any phone that has joined it — you'll do that next.</p>
          </div>` : `<p class="hint">Building with code, or have a developer? Your API key and code samples live under <strong>API</strong> in the sidebar — nothing to do now.</p>`}
        </div>
        ${foot(true, `<button class="btn primary" data-action="go" data-to="first">Continue</button>`)}`);
    },
    first() {
      const sb = S.sandbox; const connected = sb.status === "connected"; const sent = sb.messages.length > 0;
      const chat = [
        ...(sb.status !== "waiting" ? [`<div class="bub out">join ${SANDBOX.code}<span class="tm">now</span></div>`] : []),
        ...(connected ? [`<div class="bub">✅ You're connected to the <b>${esc(S.profile.company || "Relay")}</b> sandbox. Messages sent from the dashboard or API will show up here.<span class="tm">now</span></div>`] : []),
        ...sb.messages.map(m => `<div class="bub">${esc(m)}<span class="tm">now ✓✓</span></div>`),
      ].join("") || `<div class="empty">Your phone will show the conversation here</div>`;
      return wizardShell(`
        <div class="head"><h1>Send your first message</h1><p>Link your own phone to the sandbox number, then send yourself something. This is the whole product in one minute.</p></div>
        <div class="first-grid">
          <div class="stack" style="gap:18px">
            <div class="steps-list">
              <div class="s ${sb.status !== "waiting" ? "done" : ""}"><span class="n">${sb.status !== "waiting" ? "✓" : "1"}</span><div><div class="t">On your phone, send <code>join ${SANDBOX.code}</code> to <code>${SANDBOX.number}</code></div><div class="hint">Or scan to open the chat with the message pre-filled.</div>
                <div class="row" style="margin-top:8px;align-items:flex-start;gap:14px">${qr()}<div class="stack" style="gap:6px">
                  ${sb.status === "waiting" ? `<div class="status-line"><span class="spinner"></span> Waiting for your message…</div><button class="btn secondary sm" data-action="simulateJoin">Prototype: pretend I sent it</button>` : connected ? `<div class="status-line" style="color:var(--ok)">● Connected ✓</div>` : `<div class="status-line"><span class="spinner"></span> Message received, linking…</div>`}
                </div></div></div></div>
              <div class="s ${sent ? "done" : ""}"><span class="n">${sent ? "✓" : "2"}</span><div><div class="t">Send yourself a message</div>
                ${connected && !sent ? `<form data-form="firstMsg" class="row" style="margin-top:8px"><input type="text" name="text" value="Hi ${esc(firstName())}! This is your first message from ${esc(S.profile.company || "Relay")} 🎉"><button class="btn primary" type="submit">Send</button></form>` : sent ? `<div class="callout ok">Delivered to your phone. That's it — that's the product.</div>` : `<div class="hint">Unlocks once you're connected.</div>`}
              </div></div>
            </div>
          </div>
          ${phone(chat)}
        </div>
        ${foot(true, `<button class="btn primary" data-action="go" data-to="agent" ${sent ? "" : "disabled"}>Continue</button>`, !sent ? { label: "Skip for now", action: "skipFirst" } : null)}`);
    },
    agent() {
      const tabs = { claude: "Claude Code", cursor: "Cursor", windsurf: "Windsurf", cli: "Any terminal" };
      const cmd = {
        claude: `claude mcp add --transport http relay https://mcp.relay.example/v1\nclaude mcp login relay`,
        cursor: `// .cursor/mcp.json\n{ "mcpServers": { "relay": { "url": "https://mcp.relay.example/v1",\n    "headers": { "Authorization": "Bearer ${S.apiKey}" } } } }`,
        windsurf: `// ~/.codeium/windsurf/mcp_config.json\n{ "mcpServers": { "relay": { "serverUrl": "https://mcp.relay.example/v1",\n    "headers": { "Authorization": "Bearer ${S.apiKey}" } } } }`,
        cli: `npx relay-cli init --key ${S.apiKey}\n# writes .relay/config, installs the SKILL.md, verifies with a sandbox message`,
      };
      return wizardShell(`
        <div class="head"><h1>Connect Relay to your coding agent</h1><p>One connection and Claude Code, Cursor or any MCP client can send messages, manage templates and read your inbox for you.</p></div>
        <div class="stack">
          <div class="codetabs">
            <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<button class="${S.agentTab === k ? "on" : ""}" data-action="agentTab" data-v="${k}">${v}</button>`).join("")}<button class="copy btn link sm" data-action="copyAgent">Copy</button></div>
            <pre>${esc(cmd[S.agentTab])}</pre>
          </div>
          <div class="callout row between"><div><strong>SKILL.md</strong> <span class="muted">— paste into your agent's context so it knows how to search, send and reply</span></div><div class="row"><button class="btn link sm" data-action="viewSkill">View</button><button class="btn secondary sm" data-action="copySkill">Copy</button></div></div>
          <div id="skill-view" hidden><pre class="callout mono" style="white-space:pre-wrap">${esc(skillMd())}</pre></div>
          ${S.agentConnected ? `<div class="callout ok">Agent connected — it can now send from your sandbox number.</div>` : ""}
        </div>
        ${foot(true, `<button class="btn primary" data-action="agentDone">${S.agentConnected ? "Continue" : "I've connected it"}</button>`, S.agentConnected ? null : { label: "Skip for now", action: "goAgentSkip" })}`, { optional: true });
    },
    billing() {
      const bonus = [["star", "Star the open-source SDK", 50], ["community", "Join the community", 25]];
      return wizardShell(`
        <div class="head"><h1>Add a payment method</h1><p>No charge yet. You have <strong>₹${S.billing.creditsTotal} in free credits</strong> — about 640 marketing or 4,300 utility messages. A card only matters when those run out.</p></div>
        ${S.billing.added ? `<div class="callout ok">Payment method on file. You'll never be charged without credits running out first.</div>` : `
        <form data-form="billing" class="stack">
          <div class="form-grid">
            <div class="field"><label>Full name</label><input type="text" name="name" required placeholder="As on the card"></div>
            <div class="field"><label>Country</label><select name="country"><option>India</option><option>United States</option><option>United Kingdom</option><option>Other</option></select></div>
            <div class="field full"><label>Card</label><input type="text" name="card" placeholder="4242 4242 4242 4242" required></div>
          </div>
          <div class="row"><button class="btn primary" type="submit">Save card</button></div>
        </form>`}
        <div style="margin-top:22px"><div class="eyebrow" style="margin-bottom:8px">Earn extra credits</div>
          <div class="bonus">${bonus.map(([k, t, cr]) => `<button data-action="bonus" data-key="${k}" class="${S.billing.bonus.includes(k) ? "on" : ""}"><span>${t}</span><span class="cr">${S.billing.bonus.includes(k) ? "claimed" : `+₹${cr}`}</span></button>`).join("")}</div></div>
        ${foot(true, `<button class="btn primary" data-action="go" data-to="done">Continue</button>`, S.billing.added ? null : { label: "I'll do this later", action: "goDoneSkipBilling" })}`, { optional: true });
    },
    done() {
      const li = (ok, t) => `<div class="li ${ok ? "ok" : "no"}"><span class="st">${ok ? "✓" : "–"}</span><span>${t}</span></div>`;
      const src = ["X / Twitter", "LinkedIn", "A friend", "Google", "ChatGPT / Claude", "Other"];
      return wizardShell(`
        <div class="head"><h1><span style="color:var(--ok)">✓</span> You're all set, ${esc(firstName())}</h1><p>Here's where things stand. Nothing here is a blocker — your plan on the next screen picks up from exactly this point.</p></div>
        <div class="summary">
          ${li(S.sandbox.status === "connected", S.sandbox.status === "connected" ? "Sandbox connected — you've sent your first message" : "Sandbox — join it from Your plan when you like")}
          ${li(S.agentConnected, S.agentConnected ? "Coding agent connected" : "Coding agent — connect any time from API")}
          ${li(S.meta.status !== "none", S.meta.status === "live" ? "Own number live" : S.meta.status === "pending" ? "Own number submitted to Meta — review in progress" : "Own number — connect when you're ready for real customers")}
          ${li(S.billing.added, S.billing.added ? "Payment method on file" : `₹${S.billing.creditsTotal} free credits, no card needed yet`)}
        </div>
        <div style="margin-top:24px"><div class="eyebrow" style="margin-bottom:8px">One last thing — where did you first hear about Relay?</div>
          <div class="chips">${src.map(s => `<button class="chip ${S.source === s ? "on" : ""}" data-action="source" data-v="${esc(s)}">${s}</button>`).join("")}</div></div>
        ${foot(true, `<button class="btn primary" data-action="enterApp">Go to your plan →</button>`)}`);
    },
  };

  function firstName() { const e = S.profile.email || ""; const n = e.split("@")[0].split(/[._-]/)[0]; return n ? n[0].toUpperCase() + n.slice(1) : "there"; }
  function phone(chat) {
    return `<div class="phone"><div class="screen"><div class="bar"><span class="av">R</span><div><div>${esc(S.profile.company || "Relay")} sandbox</div><div style="font-size:10px;opacity:.8">${SANDBOX.number}</div></div></div><div class="chat">${chat}</div></div></div>`;
  }
  function qr() {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cells = []; for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      let on; if (finder) { const fx = x % 14 > 6 ? x - 14 : x, fy = y % 14 > 6 ? y - 14 : y; const lx = fx < 7 ? fx : fx - 14, ly = fy < 7 ? fy : fy - 14; on = lx === 0 || lx === 6 || ly === 0 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4); } else on = rnd() > .55;
      cells.push(`<i class="${on ? "b" : ""}"></i>`);
    }
    return `<div class="qr" aria-label="QR code to open WhatsApp chat">${cells.join("")}</div>`;
  }
  function skillMd() {
    return `# Relay — WhatsApp messaging skill
Use when the user wants to send, schedule or read WhatsApp messages via Relay.
Base URL: https://api.relay.example/v1 · Auth: Authorization: Bearer $RELAY_API_KEY
- POST /messages { to, text | template:{name, params[]} } → { id, status }
- GET  /onboarding → { status, next_steps[], hints[], sandbox:{number, join_code} }  ← call this first when unsure what to do
- POST /templates { name, category, body } → submitted to Meta; poll GET /templates/{name}
- GET  /conversations?unassigned=true
Rules: outside the 24h window you MUST use an approved template. Sandbox can only message numbers that joined it.`;
  }

  /* ================= APP ================= */
  function appShell(inner) {
    const mods = MODULES.filter(m => m.show(S));
    const nx = Guide.next();
    const navLink = m => `<a class="nav ${S.page === m.id ? "on" : ""}" href="#${m.id}" data-action="nav" data-page="${m.id}"><span class="ic">${m.icon}</span>${m.label}${m.id === "home" && nx ? "" : ""}</a>`;
    const num = S.meta.status === "live" ? `<span class="pill ok"><span class="dot"></span>${esc(S.meta.number)}</span>` : S.meta.status === "pending" ? `<span class="pill warn"><span class="dot"></span>Meta reviewing</span>` : `<span class="pill"><span class="dot"></span>Sandbox number</span>`;
    return `<div class="app">
      <nav class="sidenav">
        <div class="brand"><span class="brandmark">R</span><div>Relay<span class="ws">${esc(S.profile.company || "Workspace")}</span></div></div>
        ${mods.map(navLink).join("")}
        <details class="more"><summary>More</summary>${MORE_MODULES.filter(m => !mods.some(x => x.id === m.id)).map(navLink).join("")}</details>
        <div class="numstat"><div class="eyebrow">Sending from</div>${num}<div class="muted tabular">₹${S.billing.credits} credits left</div></div>
      </nav>
      <div class="main">${inner}</div>
    </div>`;
  }
  function tourBtn() { return TOURS[S.page] ? `<button class="btn ghost sm" data-action="replayTour" title="Replay the walkthrough for this page">? Show me around</button>` : ""; }
  const pages = {
    home() {
      const p = Guide.plan(); const nx = Guide.next(); const done = p.filter(x => x.isDone).length;
      const nextCard = nx ? `
        <div class="next-card">
          <div class="eyebrow">Next up · ${nx.jlabel}</div>
          <h2>${nx.title}</h2>
          <p class="why">${nx.why}</p>
          <div class="acts">
            <button class="btn primary" data-action="nav" data-page="${nx.page}">Open ${MODULES.find(m => m.id === nx.page).label}</button>
            <button class="btn secondary" data-action="showMe" data-journey="${nx.journey}" data-step="${nx.id}">Show me how</button>
            ${nx.doForMe ? `<button class="btn ghost" data-action="${nx.doForMe}">Do it for me</button>` : ""}
          </div>
        </div>` : `
        <div class="next-card"><div class="eyebrow">Plan complete</div><h2>You've done everything you came for.</h2><p class="why">${S.meta.status === "live" ? "Your number is live and your first messages are out. From here it's just running the business." : "The one thing left is connecting your own number so real customers can hear from you."}</p><div class="acts">${S.meta.status !== "live" ? `<button class="btn primary" data-action="openNumber">Connect your number</button>` : `<button class="btn primary" data-action="nav" data-page="${S.jtbd[0] ? JTBD[S.jtbd[0]].module : "inbox"}">Open ${S.jtbd[0] ? JTBD[S.jtbd[0]].module : "inbox"}</button>`}</div></div>`;
      const list = p.map(st => `<div class="item ${st.isDone ? "done" : ""} ${nx && st.id === nx.id && st.journey === nx.journey ? "cur" : ""}"><span class="st">${st.isDone ? "✓" : ""}</span><span class="t">${st.title}</span><span class="jn">${st.jlabel}</span></div>`).join("");
      const metaCard = S.meta.status === "live"
        ? `<div class="side-card"><h3>Your number</h3><span class="pill ok"><span class="dot"></span>${esc(S.meta.number)} · live</span><p class="small muted">Everything you send now goes from your own number.</p></div>`
        : S.meta.status === "pending"
        ? `<div class="side-card"><h3>Your number</h3><span class="pill warn"><span class="dot"></span>Meta reviewing ${esc(S.meta.number)}</span><div class="meanwhile"><strong>Meanwhile:</strong> ${nx ? `${nx.title.toLowerCase()} — it works on the sandbox and carries over.` : "everything you build on the sandbox carries over."}</div><p class="small muted">Usually a few hours. We'll WhatsApp you when it's live.</p></div>`
        : `<div class="side-card" data-beacon="number"><h3>Your number</h3><span class="pill"><span class="dot"></span>Sandbox · ${SANDBOX.number}</span><p class="small muted">Good for you and your team. Real customers need your own number.</p><button class="btn secondary sm" data-action="openNumber">Connect your number</button></div>`;
      return appShell(`
        <div class="ph"><div><div class="eyebrow">Your plan</div><h1>Hi ${esc(firstName())}.</h1><p>${p.length ? `${done} of ${p.length} done. One thing at a time.` : "Pick what you want to do in Settings and we'll lay out a plan."}</p></div></div>
        <div class="home-grid">
          <div>${nextCard}
            ${p.length ? `<details class="plan-list" ${done > 0 ? "open" : ""}><summary><span>Everything in your plan</span><span class="tabular">${done}/${p.length}</span></summary>${list}</details>` : ""}
          </div>
          <div class="stack">
            ${metaCard}
            <div class="side-card"><h3>Credits</h3><div class="cr-big tabular">₹${S.billing.credits}</div><div class="progress"><i style="width:${Math.round(S.billing.credits / S.billing.creditsTotal * 100)}%"></i></div><p class="small muted">${S.billing.added ? "Card on file — top-ups are automatic." : "Free credits. No card needed until they run out."}</p></div>
          </div>
        </div>`);
    },
    contacts() {
      const rows = S.contacts.map(c => `<tr><td>${esc(c.name)}</td><td class="mono">${esc(c.phone)}</td><td><span class="pill ${c.joined ? "ok" : ""}">${c.joined ? "in sandbox" : "customer"}</span></td></tr>`).join("");
      return appShell(`
        <div class="ph"><div><h1>Contacts</h1><p>${S.contacts.length ? `${S.contacts.length} contact${S.contacts.length > 1 ? "s" : ""}.` : "Who you'll message. Start with yourself."}</p></div>${tourBtn()}<button class="btn secondary" data-action="importCsv" data-tour="import">Import CSV</button></div>
        <div class="panel" data-tour="paste"><h3>Add contacts</h3>
          <form data-form="contacts" class="stack"><textarea name="raw" rows="3" placeholder="One per line, e.g.&#10;Priya, +91 98765 43210&#10;+91 91234 56789"></textarea><div class="row"><button class="btn primary" type="submit">Add</button><button type="button" class="btn ghost" data-action="seedContacts">Add 3 sample contacts</button></div></form></div>
        ${S.contacts.length ? `<div class="panel"><table class="table"><thead><tr><th>Name</th><th>Phone</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="panel empty"><div class="big">👥</div><h3>No contacts yet</h3><p>Paste a number above — your own is the best first one, so you see exactly what customers will.</p></div>`}`);
    },
    broadcasts() {
      const approved = S.templates.filter(t => t.status === "approved"); const pending = S.templates.filter(t => t.status === "pending");
      const banner = !S.contacts.length ? `<div class="inline-banner">You need contacts before you can broadcast. <button class="btn guide sm" data-action="nav" data-page="contacts">Add contacts</button></div>`
        : !S.templates.length ? `<div class="inline-banner">You need a template first — the draft is already written. <button class="btn guide sm" data-action="nav" data-page="templates">Create template</button></div>`
        : !approved.length ? `<div class="inline-banner">“${esc(pending[0].name)}” is with Meta for approval. You'll get a nudge the moment it's approved. <button class="btn guide sm" data-action="approveTemplate" data-name="${esc(pending[0].name)}">Prototype: approve now</button></div>` : "";
      const rows = S.broadcasts.map(b => `<tr><td>${esc(b.template)}</td><td>${b.test ? "Test · you" : `${b.count} contacts`}</td><td><span class="pill ok">delivered</span></td><td class="tabular muted">${b.read} read</td></tr>`).join("");
      return appShell(`
        <div class="ph"><div><h1>Broadcasts</h1><p>One template, many people, delivered and read counts as they happen.</p></div>${tourBtn()}</div>
        ${banner}
        <div class="panel"><form data-form="broadcast" class="form-grid">
          <div class="field" data-tour="audience"><label>Audience</label><select name="audience"><option value="all">All contacts (${S.contacts.length})</option><option value="sandbox">Only sandbox contacts (${S.contacts.filter(c => c.joined).length})</option></select></div>
          <div class="field" data-tour="template"><label>Template</label><select name="template">${approved.map(t => `<option>${esc(t.name)}</option>`).join("")}${pending.map(t => `<option disabled>${esc(t.name)} (pending)</option>`).join("")}${S.templates.length ? "" : `<option disabled>No templates yet</option>`}</select></div>
          <div class="full row"><button class="btn secondary" type="button" data-action="sendTest" data-tour="test" ${approved.length ? "" : "disabled"}>Send test to me</button><button class="btn primary" type="submit" data-tour="send" ${approved.length && S.contacts.length ? "" : "disabled"}>Send to ${S.contacts.length} contact${S.contacts.length === 1 ? "" : "s"}</button></div>
        </form></div>
        ${S.broadcasts.length ? `<div class="panel"><table class="table"><thead><tr><th>Template</th><th>To</th><th>Status</th><th>Reads</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}`);
    },
    bots() {
      const b = S.bot;
      const starters = STARTERS.bots.map(s => `<button class="choice ${b && b.id === s.id ? "on" : ""}" data-action="pickBot" data-id="${s.id}"><span class="row between"><span class="ttl">${s.title}</span><span class="tick"></span></span><span class="sub">${s.sub}</span></button>`).join("");
      const chat = b ? (b.chat || []).map(m => `<div class="bub ${m.out ? "out" : ""}">${esc(m.text)}</div>`).join("") : "";
      return appShell(`
        <div class="ph"><div><h1>Bots</h1><p>${b ? `${STARTERS.bots.find(s => s.id === b.id).title} · ${b.published ? "published" : "draft"}` : "Answers customers when you can't. Start from one that already works."}</p></div>${tourBtn()}${b ? `<button class="btn primary" data-action="publishBot" data-tour="publish" ${b.published ? "disabled" : ""}>${b.published ? "Published ✓" : "Publish"}</button>` : `<span data-tour="publish"></span>`}</div>
        <div class="panel" data-tour="starters"><h3>${b ? "Starter" : "Pick a starter"}</h3><div class="starter-grid">${starters}</div></div>
        <div class="panel" data-tour="testchat"><h3>Test it</h3>
          ${b ? `<div class="chatbox">${chat || `<div class="muted small" style="margin:auto">Say something as a customer would.</div>`}</div><form data-form="botchat" class="row" style="margin-top:10px"><input type="text" name="text" placeholder="e.g. what are your hours?"><button class="btn secondary" type="submit">Send</button></form>` : `<p class="hint">Pick a starter first.</p>`}
        </div>`);
    },
    inbox() {
      const convos = S.conversations.map(c => `<div class="convo" data-tour="convo"><span class="av">${esc(c.name[0])}</span><div class="grow"><div><strong>${esc(c.name)}</strong></div><div class="small muted">${esc(c.last)}</div></div><select data-action-change="assign" data-id="${c.id}"><option value="">Unassigned</option><option ${c.assignee === "me" ? "selected" : ""} value="me">Me</option>${S.team.map(t => `<option ${c.assignee === t.email ? "selected" : ""} value="${esc(t.email)}">${esc(t.name)}</option>`).join("")}</select></div>`).join("");
      return appShell(`
        <div class="ph"><div><h1>Inbox</h1><p>Every WhatsApp conversation, shared with your team.</p></div>${tourBtn()}</div>
        <div class="panel"><h3>Conversations</h3><div class="stack">${convos}</div></div>
        <div class="panel" data-tour="invite"><h3>Team</h3>
          ${S.team.length ? `<div class="stack" style="margin-bottom:12px">${S.team.map(t => `<div class="row"><span class="pill accent">${esc(t.name)}</span><span class="small muted">${esc(t.email)} · invited</span></div>`).join("")}</div>` : ""}
          <form data-form="invite" class="row"><input type="email" name="email" placeholder="teammate@company.com" required><button class="btn primary" type="submit">Invite</button></form></div>
        <div class="panel" data-tour="hours"><h3>Business hours & away message</h3>
          ${S.hours ? `<dl class="kv"><dt>Hours</dt><dd>${esc(S.hours.hours)}</dd><dt>Away message</dt><dd>${esc(S.hours.away)}</dd></dl>` : `<form data-form="hours" class="form-grid"><div class="field"><label>Hours</label><input type="text" name="hours" value="Mon–Sat, 10:00–19:00 IST"></div><div class="field"><label>Away message</label><input type="text" name="away" value="Thanks for messaging ${esc(S.profile.company || "us")}! We're away right now and will reply when we're back."></div><div class="full"><button class="btn primary" type="submit">Save</button></div></form>`}
        </div>`);
    },
    api() {
      const snippet = `curl https://api.relay.example/v1/messages \\\n  -H "Authorization: Bearer ${S.apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "to": "YOUR_WHATSAPP_NUMBER", "text": "Hello from the API 👋" }'`;
      return appShell(`
        <div class="ph"><div><h1>API</h1><p>Send from code. Your sandbox number can reach any phone that has joined it.</p></div>${tourBtn()}</div>
        <div class="panel" data-tour="snippet"><h3>Send a message</h3>
          <div class="keybox" style="margin-bottom:10px"><span class="grow">${S.apiKey}</span><span class="pill">₹2,000 limit</span></div>
          <div class="codetabs"><pre>${esc(snippet)}</pre></div>
          <div class="row" style="margin-top:10px"><button class="btn primary" data-action="simulateApi">${S.apiSent ? "Sent ✓ — send again" : "Prototype: run this request"}</button>${S.apiSent ? `<span class="small muted">200 OK · { "status": "sent" }</span>` : ""}</div></div>
        <div class="panel" data-tour="webhook"><h3>Webhook</h3><p class="hint" style="margin-bottom:10px">Replies and delivery receipts are POSTed here.</p>
          <form data-form="webhook" class="row"><input type="url" name="url" value="${esc(S.webhook.url)}" placeholder="https://yourapp.com/webhooks/relay"><button class="btn secondary" type="submit">Save</button><button type="button" class="btn primary" data-action="pingWebhook" ${S.webhook.url ? "" : "disabled"}>Send test ping</button></form>
          ${S.webhook.url ? `<p class="small" style="margin-top:8px">${S.webhook.pinged ? `<span class="pill ok">verified · 200 OK</span>` : `<span class="pill warn">not yet verified</span>`}</p>` : ""}</div>
        <div class="panel"><h3>Coding agent</h3><div class="row between"><span class="small">${S.agentConnected ? `<span class="pill ok">connected</span> Claude Code / Cursor can send on your behalf.` : "Let Claude Code or Cursor send, reply and manage templates for you."}</span><button class="btn secondary sm" data-action="goAgentFromApp">${S.agentConnected ? "Show setup" : "Connect"}</button></div></div>`);
    },
    settings() {
      return appShell(`
        <div class="ph"><div><h1>Settings</h1></div></div>
        <div class="panel"><h3>What you're here to do</h3><div class="chips">${Object.entries(JTBD).map(([k, v]) => `<button class="chip ${S.jtbd.includes(k) ? "on" : ""}" data-action="toggleJtbd" data-key="${k}">${v.icon} ${v.title}</button>`).join("")}</div><p class="hint" style="margin-top:8px">Changes your plan and which modules show in the sidebar.</p></div>
        <div class="panel"><h3>Guidance</h3>
          <button class="toggle ${S.tipsOff ? "" : "on"}" data-action="toggleTips" style="background:none;border:none;padding:0"><span class="sw"></span><span>Tips, tours and nudges</span></button>
          <div class="row" style="margin-top:10px"><button class="btn secondary sm" data-action="resetTours">Replay all tours</button></div></div>
        <div class="panel"><h3>Billing</h3><p class="small">₹${S.billing.credits} of ₹${S.billing.creditsTotal} credits · ${S.billing.added ? "card on file" : "no card"}</p>${S.billing.added ? "" : `<button class="btn primary sm" style="margin-top:8px" data-action="addCardQuick">Add payment method</button>`}</div>
        <div class="panel"><h3>Workspace</h3><dl class="kv"><dt>Company</dt><dd>${esc(S.profile.company || "—")}</dd><dt>Email</dt><dd>${esc(S.profile.email || "—")}</dd><dt>Sandbox</dt><dd class="mono">${SANDBOX.number} · join ${SANDBOX.code}</dd></dl></div>`);
    },
  };
  function pillFor(st) { return st === "approved" ? `<span class="pill ok"><span class="dot"></span>approved</span>` : st === "pending" ? `<span class="pill warn"><span class="dot"></span>pending Meta review</span>` : `<span class="pill bad">rejected</span>`; }

  /* ================= AGENT MODE ================= */
  function onboardingJson() {
    const plan = Guide.plan();
    return {
      status: S.meta.status === "live" ? "live" : S.sandbox.status === "connected" ? "sandbox_connected" : "sandbox_unjoined",
      workspace: S.profile.company || "workspace",
      sandbox: { number: SANDBOX.number, join_code: SANDBOX.code, connected: S.sandbox.status === "connected" },
      own_number: { status: S.meta.status, number: S.meta.number || null },
      waba: S.waba ? { id: S.waba.id, business_verification: S.waba.businessVerification, official_business_account: S.waba.oba } : null,
      numbers: S.numbers.map(n => ({ id: n.id, phone: n.phone, display_name: n.displayName, display_name_status: n.displayNameStatus, status: n.status, quality: n.quality, messaging_limit: WA.TIERS[WA.tierFor(S, n)].label })),
      templates: S.templates.map(t => ({ name: t.name, language: t.language, category: t.category, status: t.status, rejection_reason: t.rejectionReason || undefined })),
      credits: { remaining_inr: S.billing.credits, payment_method: S.billing.added },
      next_steps: plan.filter(p => !p.isDone).map(p => ({ id: `${p.journey}.${p.id}`, title: p.title, why: p.why, endpoint: endpointFor(p) })),
      hints: NUDGES.filter(n => !n.page && n.when(S) && !S.dismissed.includes(n.id)).map(n => ({ id: n.id, text: `${n.title} — ${typeof n.body === "function" ? n.body(S) : n.body}` })),
    };
  }
  function endpointFor(p) { return { contacts: "POST /v1/contacts", template: "POST /v1/templates", otp: "POST /v1/templates", test: "POST /v1/messages", broadcast: "POST /v1/broadcasts", send: "POST /v1/messages", webhook: "PUT /v1/webhook", pickbot: "POST /v1/bots", testbot: "POST /v1/messages", publish: "POST /v1/bots/{id}/publish", invite: "POST /v1/team", assign: "PATCH /v1/conversations/{id}", hours: "PUT /v1/settings/hours" }[p.id] || "GET /v1/onboarding"; }
  const AGENT_STEPS = [
    () => ({ cmd: "npx relay-cli init", out: [`Relay CLI 1.4.0`, `Open https://relay.example/device and enter code  <span class="s">GHXK-7Q2P</span>`, `<span class="dim">waiting for approval…</span>`, `<span class="ok">✓ Logged in as ${esc(S.profile.email || "you@company.com")}</span>`, `<span class="ok">✓ API key issued</span> ${S.apiKey} <span class="dim">(₹2,000 limit · expires 2027-09-20)</span>`, `<span class="ok">✓ Wrote .relay/config · installed SKILL.md</span>`] }),
    () => ({ cmd: "relay onboarding", out: [`<span class="dim">GET /v1/onboarding</span>`, `<span class="json">${esc(JSON.stringify(onboardingJson(), null, 2))}</span>`] }),
    () => ({ cmd: `relay send --to YOUR_NUMBER --text "Hi from ${esc(S.profile.company || "Relay")} 👋"`, out: S.sandbox.status === "connected" ? [`<span class="dim">POST /v1/messages</span>`, `<span class="ok">✓ delivered</span> { "id": "msg_01J9…", "status": "delivered" }`] : [`<span class="dim">POST /v1/messages</span>`, `<span style="color:#f2a08b">✗ 409 sandbox_not_joined</span> — the recipient must send <span class="s">join ${SANDBOX.code}</span> to ${SANDBOX.number} first.`, `<span class="dim">hint: GET /v1/onboarding → sandbox.join_code</span>`], effect: () => { if (S.sandbox.status === "connected" && !S.apiSent) { S.apiSent = true; } } }),
    () => ({ cmd: "claude mcp add --transport http relay https://mcp.relay.example/v1 && claude mcp login relay", out: [`<span class="ok">✓ Added MCP server "relay"</span> — tools: send_message, list_templates, create_template, get_onboarding, list_conversations`, `<span class="ok">✓ Logged in</span>`], effect: () => { S.agentConnected = true; } }),
    () => ({ cmd: "relay onboarding --hints", out: [`<span class="dim">GET /v1/onboarding · hints[]</span>`, ...(onboardingJson().hints.length ? onboardingJson().hints.map(h => `• ${esc(h.text)}`) : [`<span class="dim">(no hints right now — nothing needs attention)</span>`]), ``, `<span class="dim">next_steps[0]:</span> ${onboardingJson().next_steps[0] ? `${esc(onboardingJson().next_steps[0].title)} → <span class="s">${esc(onboardingJson().next_steps[0].endpoint)}</span>` : "none — plan complete"}`] }),
  ];
  function renderAgent() {
    const lines = S.agentLog.map(l => `<div class="cmd">${l.cmd}</div>${l.out.map(o => `<div>${o}</div>`).join("")}<div>&nbsp;</div>`).join("");
    const nxt = S.agentStep < AGENT_STEPS.length;
    const plan = Guide.plan();
    return `<div class="agent-grid">
      <div>
        <div class="row between" style="margin-bottom:12px"><div><div class="eyebrow">Agent onboarding</div><h1>Same platform, no browser</h1></div><div class="row"><button class="btn primary" data-action="agentNext" ${nxt ? "" : "disabled"}>${nxt ? "Run next command →" : "Done"}</button><button class="btn ghost sm" data-action="agentReset">Clear</button></div></div>
        <div class="terminal">${lines || `<div class="dim"># A coding agent (Claude Code, Cursor, a script) onboards through the CLI + API.\n# Every screen a human sees has an equivalent here. Press “Run next command”.</div>`}<span class="cursor"></span></div>
      </div>
      <div class="agent-side">
        <div class="side-card"><h3>Shared state</h3><p class="small muted">The agent and the human dashboard read the same onboarding state. Switch to Human to see the same plan as a UI.</p>
          <dl class="kv small"><dt>Sandbox</dt><dd>${S.sandbox.status}</dd><dt>Own number</dt><dd>${S.meta.status}</dd><dt>Agent</dt><dd>${S.agentConnected ? "connected" : "—"}</dd><dt>Plan</dt><dd>${plan.filter(p => p.isDone).length}/${plan.length} done</dd></dl></div>
        <div class="side-card"><h3>Why this works for agents</h3><ul class="small" style="margin:0;padding-left:18px;color:var(--ink-2);display:grid;gap:6px">
          <li><code>GET /v1/onboarding</code> is the agent's “Your plan” — ordered <code>next_steps</code> with the endpoint for each.</li>
          <li><code>hints[]</code> are the same nudges a human sees, as data.</li>
          <li>Errors carry the fix (<code>409 sandbox_not_joined</code> → the join code), so the agent never guesses.</li>
          <li>Device-code login: no browser session needed, key limits identical.</li>
          <li>SKILL.md teaches the rules WhatsApp enforces (24h window, templates).</li>
          <li>Same tool surface as the in-app assistant: <code>add_contacts</code>, <code>create_template</code>, <code>send_broadcast</code>… one API, three clients (GUI, assistant, agent).</li></ul></div>
      </div></div>`;
  }

  /* ================= DEMO CONTROLS ================= */
  function renderProtoBar() {
    const g = Guide.status();
    document.getElementById("proto-bar").innerHTML = `
      <span class="tag">PROTOTYPE</span>
      <span class="seg"><button class="${S.mode === "human" ? "on" : ""}" data-action="mode" data-v="human">Human</button><button class="${S.mode === "agent" ? "on" : ""}" data-action="mode" data-v="agent">Agent</button></span>
      <span class="spacer"></span>
      <span style="opacity:.7">${S.screen === "app" ? `guidance: showing ${g.showing} · nudges ${g.budget} · held ${g.held}` : `screen: ${S.screen}`}</span>
      <button class="btn" data-action="demoToggle">${S.demo.open ? "Hide" : "Demo controls"}</button>`;
    const d = document.getElementById("demo-drawer"); d.hidden = !S.demo.open;
    if (S.demo.open) d.innerHTML = `
      <div class="group"><span class="lbl">Jump</span><button class="btn secondary sm" data-action="jumpApp">Skip wizard → app</button><button class="btn secondary sm" data-action="resetDemo">Reset everything</button></div>
      <div class="group"><span class="lbl">Fire triggers</span><button class="btn secondary sm" data-action="demoApprove">Approve template</button><button class="btn secondary sm" data-action="demoLive">Number goes live</button><button class="btn secondary sm" data-action="demoPending">Meta pending</button><button class="btn secondary sm" data-action="demoDrain">Drain credits</button><button class="btn secondary sm" data-action="demoSessions">Pretend 2nd session</button></div>
      <div class="group"><span class="lbl">WhatsApp</span><button class="btn secondary sm" data-action="demoRejectTemplate">Reject template</button><button class="btn secondary sm" data-action="demoVerify">Verify business</button><button class="btn secondary sm" data-action="demoRejectName">Reject display name</button><button class="btn secondary sm" data-action="demoQualityYellow">Quality → yellow</button><button class="btn secondary sm" data-action="demoTierUp">Tier up</button></div>
      <div class="group"><span class="lbl">Calm budget</span><span class="budget">nudges ${g.budget} · held ${g.held}</span><button class="btn secondary sm" data-action="demoResetBudget">Reset budget</button><label class="toggle ${S.demo.fast ? "on" : ""}" data-action="demoFast" style="margin:0"><span class="sw"></span><span class="small">Fast timers</span></label></div>`;
  }

  /* ================= RENDER ================= */
  function render() {
    Object.assign(S.meta, WA.summarizeMeta(S));
    const root = document.getElementById("root");
    if (S.mode === "agent") root.innerHTML = renderAgent();
    else if (S.screen === "app") root.innerHTML = pages[S.page] ? pages[S.page]() : pages.home();
    else root.innerHTML = screens[S.screen]();
    renderProtoBar();
    Guide.tick(S);
  }

  /* ================= ACTIONS ================= */
  const act = {
    back() { const i = WIZARD.indexOf(S.screen); if (i > 0) go(WIZARD[i - 1]); },
    go(d) { go(d.to); },
    google() { S.profile.email = S.profile.email || "karan@acme.in"; act.deriveCompany(); go("why"); },
    deriveCompany() {
      const w = (S.profile.website || S.profile.email.split("@")[1] || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/.]/)[0];
      if (w && !["gmail", "yahoo", "outlook", "hotmail"].includes(w)) S.profile.company = w[0].toUpperCase() + w.slice(1);
      S.profile.industry = /shop|store|mart|retail|fashion/.test(w) ? "retail" : /cafe|food|kitchen|eat|bistro/.test(w) ? "food" : "default";
    },
    toggleJtbd(d) { const i = S.jtbd.indexOf(d.key); if (i >= 0) S.jtbd.splice(i, 1); else S.jtbd.push(d.key); save(); render(); },
    persona(d) { S.profile.persona = d.v; save(); render(); },
    codeTab(d) { S.ui.codeTab = d.v; save(); render(); },
    copyKey() { copy(S.apiKey); S.keyCopied = true; save(); render(); },
    copySnippet() { copy(document.querySelector(".codetabs pre").textContent); Guide.toast("Copied"); },
    copyAgent() { copy(document.querySelector(".codetabs pre").textContent); Guide.toast("Copied"); },
    copySkill() { copy(skillMd()); Guide.toast("SKILL.md copied"); },
    viewSkill() { const v = document.getElementById("skill-view"); v.hidden = !v.hidden; },
    agentTab(d) { S.agentTab = d.v; save(); render(); },
    simulateJoin() { S.sandbox.status = "linking"; save(); render(); setTimeout(() => { S.sandbox.status = "connected"; if (!S.contacts.some(c => c.joined)) S.contacts.unshift({ name: "You", phone: "+91 98••• ••210", joined: true }); save(); render(); }, 1400); },
    skipFirst() { go("agent"); },
    agentDone() { S.agentConnected = true; save(); go("number"); },
    goAgentSkip() { go("number"); },
    goAgentFromApp() { S.screen = "agent"; save(); render(); },
    remindNumber() { S.meta.remind = true; save(); go("billing"); },
    replayTour() { Guide.startTour(S.page, 0, true); },
    bonus(d) { if (!S.billing.bonus.includes(d.key)) { S.billing.bonus.push(d.key); const cr = d.key === "star" ? 50 : 25; S.billing.credits += cr; S.billing.creditsTotal += cr; } save(); render(); },
    goDoneSkipBilling() { go("done"); },
    source(d) { S.source = d.v; save(); render(); },
    enterApp() { S.screen = "app"; S.page = "home"; S.pageEnteredAt = Date.now(); save(); render(); scrollTo(0, 0); },
    nav(d) { if (S.screen !== "app") { S.screen = "app"; } nav(d.page); },
    showMe(d) { const st = JOURNEYS[d.journey].steps.find(s => s.id === d.step); nav(st.page); requestAnimationFrame(() => Guide.startTour(st.page, st.tourStep || 0, true)); },
    openNumber() { S.screen = "number"; if (S.signup.step >= WA.ES_STEPS.length - 1) S.signup = WA.emptySignup(); save(); render(); scrollTo(0, 0); },
    toggleTips() { S.tipsOff = !S.tipsOff; save(); Guide.resetRuntime(); render(); },
    resetTours() { S.toursDone = []; S.seen = []; save(); render(); Guide.toast("Tours will play again on each page"); },
    addCardQuick() { S.billing.added = true; save(); render(); completeToast("Payment method saved"); },
    // journey "do it for me"
    seedContacts() { const seed = [{ name: "You", phone: "+91 98••• ••210", joined: S.sandbox.status === "connected" }, { name: "Priya Nair", phone: "+91 91234 56789", joined: false }, { name: "Rahul Mehta", phone: "+91 99887 76655", joined: false }]; seed.forEach(c => { if (!S.contacts.some(x => x.name === c.name)) S.contacts.push(c); }); save(); afterStep("Contacts added"); },
    seedTemplate() { submitTemplate(WA.starter(S.profile.industry, S.profile.company)); },
    seedOtpTemplate() { submitTemplate(WA.OTP_STARTER()); },
    seedBot() { act.pickBot({ id: "faq" }); },
    seedTeam() { if (!S.team.length) S.team.push({ name: "Aisha", email: "aisha@" + (S.profile.email.split("@")[1] || "company.com") }); save(); afterStep("Invite sent to Aisha"); },
    seedHours() { S.hours = { hours: "Mon–Sat, 10:00–19:00 IST", away: `Thanks for messaging ${S.profile.company || "us"}! We'll reply when we're back.` }; save(); afterStep("Hours and away message saved"); },
    importCsv() { act.seedContacts(); },
    approveTemplate(d) { const t = S.templates.find(x => x.name === d.name); if (t) { t.status = "approved"; t.quality = "green"; t.rejectionReason = null; save(); render(); } },
    sendTest() { const t = S.templates.find(x => x.status === "approved"); if (!t) return; S.broadcasts.push({ template: t.name, test: true, count: 1, read: 1 }); save(); afterStep("Test delivered to your phone"); },
    pickBot(d) { S.bot = { id: d.id, tested: false, published: false, chat: [] }; save(); afterStep("Starter bot loaded — now test it"); },
    publishBot() { if (S.bot) { S.bot.published = true; save(); afterStep("Bot published"); } },
    simulateApi() { S.apiSent = true; S.billing.credits = Math.max(0, S.billing.credits - 1); save(); afterStep("Message sent from the API"); },
    pingWebhook() { if (!S.webhook.url) return; S.webhook.pinged = true; save(); afterStep("Webhook verified · 200 OK"); },
    // proto bar / demo
    mode(d) { S.mode = d.v; save(); Guide.resetRuntime(); render(); },
    demoToggle() { S.demo.open = !S.demo.open; save(); renderProtoBar(); },
    demoFast() { S.demo.fast = !S.demo.fast; save(); renderProtoBar(); },
    jumpApp() { if (!S.jtbd.length) S.jtbd = ["broadcast", "api"]; if (!S.profile.email) { S.profile.email = "karan@acme.in"; S.profile.website = "acme.in"; act.deriveCompany(); } if (S.sandbox.status !== "connected") { S.sandbox.status = "connected"; S.contacts.unshift({ name: "You", phone: "+91 98••• ••210", joined: true }); } S.screen = "app"; S.mode = "human"; S.page = "home"; S.pageEnteredAt = Date.now(); save(); render(); },
    resetDemo() { try { localStorage.removeItem(STORAGE); } catch {} S = defaultState(); S.demo.open = true; Guide.resetRuntime(); render(); },
    demoApprove() { let t = S.templates.find(x => x.status === "pending"); if (!t) { const st = WA.starter(S.profile.industry, S.profile.company); t = S.templates.find(x => x.name === st.name); if (!t) { t = Object.assign(st, { status: "pending" }); S.templates.push(t); } } t.status = "approved"; t.quality = "green"; t.rejectionReason = null; save(); render(); },
    demoRejectTemplate() { let t = S.templates.find(x => x.status === "pending") || S.templates[0]; if (!t) { t = Object.assign(WA.starter(S.profile.industry, S.profile.company), { status: "pending" }); S.templates.push(t); } t.status = "rejected"; t.rejectionReason = "TAG_CONTENT_MISMATCH: too many variables for too little fixed content — the meaning of the message isn't clear from the template."; save(); render(); },
    demoLive() { if (!S.numbers.length) WAUI.quickConnect({}); else { S.numbers[0].status = "connected"; S.numbers[0].registered = true; } if (S.screen === "number") S.screen = "app"; save(); render(); },
    demoPending() { if (!S.numbers.length) WAUI.quickConnect({}); S.numbers[0].displayNameStatus = "pending"; if (S.waba) S.waba.businessVerification = "unverified"; if (S.screen === "number") S.screen = "app"; save(); render(); },
    demoDrain() { S.billing.credits = Math.round(S.billing.creditsTotal * 0.12); save(); render(); },
    demoSessions() { S.sessions = 2; S.pageEnteredAt = 0; save(); render(); },
    demoResetBudget() { S.nudgeCount = 0; S.lastNudgeAt = 0; S.pageEnteredAt = 0; S.dismissed = []; save(); render(); },
    // agent
    agentNext() { const st = AGENT_STEPS[S.agentStep]; if (!st) return; const r = st(); if (r.effect) r.effect(); S.agentLog.push({ cmd: r.cmd, out: r.out }); S.agentStep++; save(); render(); const t = document.querySelector(".terminal"); if (t) t.scrollTop = t.scrollHeight; },
    agentReset() { S.agentLog = []; S.agentStep = 0; save(); render(); },
  };
  function submitTemplate(t) {
    t = t.header ? t : Object.assign(WA.emptyTemplate(), t);
    if (S.templates.some(x => x.name === t.name && x.language === t.language && x.status !== "draft" && x.status !== "rejected")) { nav("templates"); return; }
    S.templates = S.templates.filter(x => !(x.name === t.name && x.language === t.language));
    t.status = "pending"; t.submittedAt = Date.now(); t.rejectionReason = null; delete t.editingName;
    S.templates.push(t); save(); if (S.screen === "app") nav("templates"); afterStep(`“${t.name}” submitted to Meta`);
    setTimeout(() => { const x = S.templates.find(y => y.name === t.name && y.language === t.language); if (x && x.status === "pending") WAUI.applyReview(x); }, S.demo.fast ? 9000 : 90000);
  }
  function afterStep(msg) {
    render();
    const nx = Guide.next();
    completeToast(nx ? `${msg} — next: ${nx.title}` : `${msg} — that's your plan done`);
  }
  function copy(t) { try { navigator.clipboard.writeText(t); } catch {} }

  const forms = {
    signup(f) { S.profile.email = f.email.value.trim(); S.profile.website = f.website.value.trim(); act.deriveCompany(); save(); go("why"); },
    firstMsg(f) { S.sandbox.messages.push(f.text.value); S.billing.credits -= 0; save(); render(); confetti(); },
    billing(f) { S.billing.added = true; save(); render(); },
    contacts(f) { const lines = f.raw.value.split("\n").map(l => l.trim()).filter(Boolean); lines.forEach(l => { const [a, b] = l.split(",").map(x => x.trim()); const phone = b || a; const name = b ? a : "Contact " + (S.contacts.length + 1); S.contacts.push({ name, phone, joined: false }); }); if (lines.length) { save(); afterStep(`${lines.length} contact${lines.length > 1 ? "s" : ""} added`); } },
    broadcast(f) { const n = f.audience.value === "sandbox" ? S.contacts.filter(c => c.joined).length : S.contacts.length; S.broadcasts.push({ template: f.template.value, test: false, count: n, read: Math.max(1, Math.round(n * 0.7)) }); S.billing.credits = Math.max(0, S.billing.credits - n); save(); afterStep(`Broadcast sent to ${n}`); confetti(); },
    botchat(f) { const q = f.text.value.trim(); if (!q || !S.bot) return; S.bot.chat.push({ text: q, out: true }); const a = /hour|open|time/.test(q.toLowerCase()) ? `We're open Mon–Sat, 10am–7pm. Anything else?` : /price|cost|rate/.test(q.toLowerCase()) ? `Pricing starts at ₹499. Want me to send the full list?` : `I'm not sure about that — I've asked a teammate to jump in.`; S.bot.chat.push({ text: a, out: false }); const first = !S.bot.tested; S.bot.tested = true; save(); if (first) afterStep("Bot tested"); else render(); },
    invite(f) { const email = f.email.value.trim(); S.team.push({ name: email.split("@")[0], email }); save(); afterStep(`Invite sent to ${email}`); },
    hours(f) { S.hours = { hours: f.hours.value, away: f.away.value }; save(); afterStep("Hours and away message saved"); },
    webhook(f) { S.webhook.url = f.url.value.trim(); S.webhook.pinged = false; save(); render(); },
  };
  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#0b6e4f", "#3fb48a", "#b7791f", "#f2a93b", "#25d366"];
    for (let i = 0; i < 40; i++) { const s = document.createElement("span"); s.className = "confetti"; s.style.left = Math.random() * 100 + "vw"; s.style.background = colors[i % colors.length]; s.style.animationDelay = Math.random() * .4 + "s"; document.body.appendChild(s); setTimeout(() => s.remove(), 2200); }
  }

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-action]"); if (!a || a.tagName === "LABEL") return;
    if (a.tagName === "A") e.preventDefault();
    const fn = act[a.dataset.action]; if (fn) fn(a.dataset, a);
  });
  document.addEventListener("change", e => {
    const lbl = e.target.closest("label[data-action]"); if (lbl) { act[lbl.dataset.action](); return; }
    const s = e.target.closest("[data-action-change]"); if (!s) return;
    if (s.dataset.actionChange === "assign") { const c = S.conversations.find(x => x.id === s.dataset.id); const first = !S.conversations.some(x => x.assignee); c.assignee = s.value || null; save(); if (c.assignee && first) afterStep("Conversation assigned"); else render(); }
  });
  document.addEventListener("submit", e => {
    const f = e.target.closest("form[data-form]"); if (!f) return; e.preventDefault();
    const fn = forms[f.dataset.form]; if (fn) fn(f.elements);
  });
  addEventListener("hashchange", () => { const p = location.hash.slice(1); if (S.screen === "app" && pages[p] && p !== S.page) nav(p); });

  /* ================= WORK API =================
     One tool surface, three clients: the GUI (forms above), the in-app assistant, and an
     external agent over MCP/REST. Every function returns small plain data and throws on a
     problem, exactly like an API endpoint would. */
  const work = {
    add_contacts({ contacts }) {
      const list = (Array.isArray(contacts) ? contacts : []).map(c => ({ name: String(c.name || "").trim() || "Contact " + (S.contacts.length + 1), phone: String(c.phone || "").trim(), joined: false })).filter(c => c.phone);
      if (!list.length) throw new Error("No contacts with a phone number were given.");
      list.forEach(c => { if (!S.contacts.some(x => x.phone === c.phone)) S.contacts.push(c); });
      save(); afterStep(`${list.length} contact${list.length > 1 ? "s" : ""} added`);
      return { added: list.length, total: S.contacts.length };
    },
    create_template({ name, category, body, language, header, footer, buttons, samples }) {
      const t = WA.emptyTemplate();
      t.name = String(name || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_|_$/g, "");
      t.category = String(category || "MARKETING").toUpperCase(); t.language = language && WA.LANGUAGES[language] ? language : "en";
      t.body = String(body || "").trim(); t.footer = String(footer || ""); t.samples = Array.isArray(samples) ? samples.map(String) : [];
      if (header && typeof header === "object") t.header = { type: header.type || "none", text: header.text || "", sample: header.sample || "" };
      if (Array.isArray(buttons)) t.buttons = buttons.map(b => ({ type: String(b.type || "QUICK_REPLY").toUpperCase(), text: String(b.text || ""), url: b.url, phone: b.phone, sample: b.sample }));
      if (t.category === "AUTHENTICATION") t.body = "";
      WA.variables(t.body).forEach((n, i) => { if (!t.samples[i]) t.samples[i] = ["Priya", "48213", "Tuesday", "₹499"][i] || "value"; });
      const errs = WA.validateTemplate(t).filter(e => !e.warn);
      if (errs.length) throw new Error("Meta would reject this: " + errs.map(e => e.msg).join(" "));
      if (S.templates.some(x => x.name === t.name && x.language === t.language && x.status !== "rejected" && x.status !== "draft")) throw new Error(`A ${t.language} template named "${t.name}" already exists.`);
      submitTemplate(t);
      return { name: t.name, language: t.language, category: t.category, status: "pending", note: "Usually approved in minutes to a few hours." };
    },
    review_template({ name }) { const t = S.templates.find(x => x.name === name); if (!t) throw new Error("No such template."); if (t.status !== "pending") return { name, status: t.status, reason: t.rejectionReason }; WAUI.applyReview(t); return { name, status: t.status, reason: t.rejectionReason || undefined, fix: t.rejectionReason ? WA.fixFor(t.rejectionReason) : undefined }; },
    list_templates() { return S.templates.map(t => ({ name: t.name, language: t.language, category: t.category, status: t.status, reason: t.rejectionReason || undefined })); },
    send_message({ to, text }) {
      text = String(text || "").trim(); if (!text) throw new Error("Message text is empty.");
      if (S.sandbox.status !== "connected" && S.meta.status !== "live") throw new Error(`sandbox_not_joined: the recipient must send "join ${SANDBOX.code}" to ${SANDBOX.number} first.`);
      S.sandbox.messages.push(text); S.apiSent = true; S.conversations[0].last = text; save(); afterStep("Message delivered to your phone");
      return { to: to || "you", status: "delivered" };
    },
    send_test({ template }) {
      const t = S.templates.find(x => x.name === template && x.status === "approved") || (!template && S.templates.find(x => x.status === "approved"));
      if (!t) throw new Error(S.templates.length ? `No approved template${template ? ` named "${template}"` : ""}. Pending templates can't be sent yet.` : "No templates yet — create one first.");
      S.broadcasts.push({ template: t.name, test: true, count: 1, read: 1 }); save(); afterStep("Test delivered to your phone");
      return { template: t.name, to: "you", status: "delivered" };
    },
    send_broadcast({ template, audience, confirmed }) {
      const t = S.templates.find(x => x.name === template && x.status === "approved") || (!template && S.templates.find(x => x.status === "approved"));
      if (!t) throw new Error("No approved template to send. Create one or wait for approval.");
      const recipients = audience === "sandbox" ? S.contacts.filter(c => c.joined) : S.contacts;
      if (!recipients.length) throw new Error("No contacts to send to. Add contacts first.");
      if (!confirmed) return { needs_confirmation: true, template: t.name, recipients: recipients.length, cost_inr: +(recipients.length * (t.category === "MARKETING" ? 0.78 : 0.115)).toFixed(2) };
      S.broadcasts.push({ template: t.name, test: false, count: recipients.length, read: Math.max(1, Math.round(recipients.length * 0.7)) });
      S.billing.credits = Math.max(0, S.billing.credits - recipients.length); save(); afterStep(`Broadcast sent to ${recipients.length}`); confetti();
      return { template: t.name, sent: recipients.length, status: "delivered" };
    },
    invite_teammate({ email }) {
      email = String(email || "").trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address.");
      if (S.team.some(t => t.email === email)) return { email, status: "already_invited" };
      S.team.push({ name: email.split("@")[0], email }); save(); afterStep(`Invite sent to ${email}`);
      return { email, status: "invited" };
    },
    set_hours({ hours, away }) {
      S.hours = { hours: String(hours || "Mon–Sat, 10:00–19:00 IST"), away: String(away || `Thanks for messaging ${S.profile.company || "us"}! We'll reply when we're back.`) };
      save(); afterStep("Hours and away message saved"); return S.hours;
    },
    assign_conversation({ conversation, assignee }) {
      const c = S.conversations.find(x => x.id === conversation) || S.conversations[0];
      const who = String(assignee || "me"); if (who !== "me" && !S.team.some(t => t.email === who || t.name === who)) throw new Error(`No teammate "${who}". Invite them first.`);
      const first = !S.conversations.some(x => x.assignee); c.assignee = who === "me" ? "me" : (S.team.find(t => t.email === who || t.name === who) || {}).email; save();
      if (first) afterStep("Conversation assigned"); else render(); return { conversation: c.id, assignee: c.assignee };
    },
    set_webhook({ url }) {
      url = String(url || "").trim(); if (!/^https?:\/\//.test(url)) throw new Error("Webhook must be an http(s) URL.");
      S.webhook = { url, pinged: false }; save(); render(); const ping = work.ping_webhook(); return { url, ...ping };
    },
    ping_webhook() { if (!S.webhook.url) throw new Error("No webhook set."); S.webhook.pinged = true; save(); afterStep("Webhook verified · 200 OK"); return { url: S.webhook.url, status: 200, verified: true }; },
    pick_bot({ starter }) {
      const id = String(starter || "faq").toLowerCase(); if (!STARTERS.bots.some(b => b.id === id)) throw new Error("Starter must be faq, lead or order.");
      act.pickBot({ id }); return { bot: id, status: "draft" };
    },
    test_bot({ text }) {
      if (!S.bot) throw new Error("No bot yet — pick a starter first.");
      const q = String(text || "what are your hours?"); forms.botchat({ text: { value: q } }); return { asked: q, replied: S.bot.chat[S.bot.chat.length - 1].text };
    },
    publish_bot() { if (!S.bot) throw new Error("No bot yet — pick a starter first."); if (!S.bot.tested) throw new Error("Test the bot once before publishing."); act.publishBot(); return { bot: S.bot.id, status: "published" }; },
    connect_number({ number, display_name }) {
      if (!number) { act.openNumber(); return { status: "opened_signup", note: "Opened Embedded Signup — a phone number is needed to continue." }; }
      number = String(number).trim(); if (!/^\+?\d[\d\s-]{8,}\d$/.test(number)) throw new Error("Phone number must include the country code, e.g. +91 98765 43210.");
      const dn = display_name || S.profile.company || "Relay Store"; const v = WA.validateDisplayName(dn, S.profile.company);
      if (!v.ok) throw new Error("Display name would be rejected: " + v.errs.join(" "));
      if (S.numbers.some(n => n.phone === number)) return { status: "already_connected", number };
      const n = WAUI.quickConnect({ number, displayName: dn }); if (S.screen === "number") S.screen = "app"; save(); render();
      return { status: "connected", phone_number_id: n.id, waba_id: S.waba.id, display_name_status: "pending", messaging_limit: WA.TIERS[WA.tierFor(S, n)].label, note: "Display name under review. Business is unverified → 250 conversations/day until verified." };
    },
    verify_business({ legal_name, document }) {
      if (!S.waba) throw new Error("Connect a number first — verification belongs to the WhatsApp Business Account.");
      if (S.waba.businessVerification === "verified") return { status: "verified" };
      S.waba.businessVerification = "pending"; S.waba.businessName = legal_name || S.waba.businessName; S.waba.verificationDoc = document || "GST certificate"; save(); render();
      setTimeout(() => { if (S.waba && S.waba.businessVerification === "pending") { S.waba.businessVerification = "verified"; S.numbers.forEach(n => n.tier = Math.max(n.tier, 1)); save(); render(); } }, S.demo.fast ? 15000 : 3 * 60000);
      return { status: "pending", note: "Meta reviews in 1–3 business days. Limit stays 250/day until then." };
    },
    set_display_name({ name }) { const n = S.numbers[0]; if (!n) throw new Error("No number connected."); const v = WA.validateDisplayName(name, S.waba.businessName); if (!v.ok) throw new Error("Meta would reject it: " + v.errs.join(" ")); n.displayName = String(name).trim(); n.displayNameStatus = "pending"; n.displayNameReason = null; save(); render(); return { name: n.displayName, status: "pending" }; },
    update_profile(p) { const n = S.numbers[0]; if (!n) throw new Error("No number connected."); ["about", "description", "address", "email", "website", "vertical"].forEach(k => { if (p[k] != null) n.profile[k] = String(p[k]); }); save(); render(); return n.profile; },
    get_waba() { if (!S.waba) return { status: "none", note: "Only the sandbox so far." }; return { waba_id: S.waba.id, business: S.waba.businessName, business_verification: S.waba.businessVerification, official_business_account: S.waba.oba, numbers: S.numbers.map(n => ({ phone: n.phone, display_name: n.displayName, display_name_status: n.displayNameStatus, reason: n.displayNameReason || undefined, status: n.status, quality: n.quality, messaging_limit: WA.TIERS[WA.tierFor(S, n)].label, two_step_pin: n.twoStepPin })) }; },
    get_onboarding() { return onboardingJson(); },
  };

  WAUI.install({ S: () => S, esc, wizardShell, foot, appShell, save, render, nav, go, afterStep, submitTemplate, pillFor, toast: m => Guide.toast(m), firstName, tourBtn, screens, pages, act, forms });
  render();
  return { act: (id, d) => act[id] && act[id](d || {}), nav, save, state: () => S, work };
})();
