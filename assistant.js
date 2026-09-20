/* assistant.js — the in-product assistant. Lives inside the launcher, available on every screen.
   It gets WORK done through App.work — the same tool surface the GUI forms and an external
   MCP agent use. Brain: Claude via the artifact `sample` capability when published; a scripted
   brain when that isn't available (local file, other hosts). */
window.Assistant = (function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let sample = null, ready = false, busy = false, abort = null;
  const R = { el: null, draft: "", pendingConfirm: null };
  const S = () => App.state();
  const chat = () => { const s = S(); if (!s.chat) s.chat = []; return s.chat; };

  (async () => {
    try { if (window.claude && typeof claude.use === "function") sample = await claude.use("sample"); } catch { sample = null; }
    ready = true; if (R.el) render(R.el);
  })();

  /* ---------- knowledge ---------- */
  const GLOSSARY = `
Relay is a WhatsApp Business API platform (a CPaaS). People use it for broadcasts (one approved template to many contacts), bots (no-code auto-replies), a shared team inbox, and an API for transactional messages (OTPs, order updates).
- Sandbox number: shared test number ${"+91 22 4890 1122"}. Anyone who sends "join calm-otter" to it can receive messages from this workspace. For testing only; real customers need the workspace's OWN number.
- Own number: Meta Embedded Signup. Needs a phone number NOT currently on WhatsApp, admin access to a Facebook Business Manager (Meta can create one), and one legal document (GST, MSME or Certificate of Incorporation). Review takes a few hours; sandbox work carries over.
- Templates: WhatsApp requires a Meta-approved template to START a conversation, or to message a customer more than 24 hours after their last message. Inside the 24-hour window free-form replies are fine. Categories: MARKETING, UTILITY, AUTHENTICATION. Use {{1}}, {{2}} for variables. Approval: minutes to hours.
- Pricing: per conversation, not per message. Marketing ≈ ₹0.78, utility/authentication ≈ ₹0.115. Incoming free. ₹500 free credits to start; a card only matters once credits run out.
- API: Authorization: Bearer <key>. Key shown once, ₹2,000 spend limit, expires 20 Sep 2027. POST /v1/messages, POST /v1/templates, GET /v1/onboarding (next_steps + hints). Webhook receives replies and delivery receipts; verify with a test ping.
- Coding agents: "claude mcp add --transport http relay https://mcp.relay.example/v1" for Claude Code; mcp.json for Cursor/Windsurf; "npx relay-cli init". They use the SAME tools you have.
- Guidance: tips/tours/nudges can be turned off; at most one tip shows at a time. Tours can be replayed from "Show me around" on each page.
- Embedded Signup (connecting your own number): Facebook login → Business Portfolio → WhatsApp Business Account (WABA) → phone number (new / migrate from another provider with 2FA turned off there / coexistence with the WhatsApp Business app) → OTP → display name (Meta's naming rules; reviewed after signup) → two-step PIN → permissions. Result: number connected immediately; display name under review; business UNVERIFIED → 250 customer conversations/24h.
- Business verification: one legal document (GST/MSME/Certificate of Incorporation), 1–3 business days → limit becomes 1,000/day; then 10K → 100K → unlimited as volume grows with green quality. Also unlocks requesting the Official Business Account green tick (needs notability).
- Quality rating (green/yellow/red) per number comes from customer blocks/reports. Low quality for 7 days lowers the limit; templates can be PAUSED for low quality.
- Template rules Meta enforces: name lowercase_snake; body ≤1024; variables {{1}},{{2}} sequential, not at start/end, not adjacent, each with a sample; header text ≤60 / image / video / document; footer ≤60; ≤10 buttons (≤2 URL, ≤1 phone), quick replies grouped; no shortened URLs; AUTHENTICATION templates use Meta's fixed wording (you pick copy-code vs one-tap and expiry). Meta may reclassify UTILITY with promotional words as MARKETING. Each language is a separate template.`;

  function stateSummary() {
    const s = S(); const plan = Guide.plan(); const nx = Guide.next();
    return {
      where: s.screen === "app" ? `app page "${s.page}"` : `onboarding screen "${s.screen}"`,
      person: { name: s.profile.email ? s.profile.email.split("@")[0] : null, company: s.profile.company || null, jobs: s.jtbd },
      sandbox: s.sandbox.status, own_number: s.meta.status, own_number_value: s.meta.number || null, agent_connected: s.agentConnected,
      credits: { left: s.billing.credits, total: s.billing.creditsTotal, card_on_file: s.billing.added },
      contacts: s.contacts.map(c => `${c.name} ${c.phone}`).slice(0, 12), contacts_total: s.contacts.length,
      templates: s.templates.map(t => `${t.name} (${t.category}, ${t.status})`), broadcasts_sent: s.broadcasts.length,
      bot: s.bot ? { starter: s.bot.id, tested: s.bot.tested, published: s.bot.published } : null,
      team: s.team.map(t => t.email), hours_set: !!s.hours, webhook: s.webhook.url ? (s.webhook.pinged ? `verified (${s.webhook.url})` : `set, unverified (${s.webhook.url})`) : "not set",
      tips_on: !s.tipsOff,
      waba: s.waba ? { business_verification: s.waba.businessVerification, official_business_account: s.waba.oba } : null,
      numbers: s.numbers.map(n => ({ phone: n.phone, display_name: n.displayName, display_name_status: n.displayNameStatus, reason: n.displayNameReason || undefined, quality: n.quality, messaging_limit: WA.TIERS[WA.tierFor(s, n)].label })),
      rejected_templates: s.templates.filter(t => t.status === "rejected").map(t => ({ name: t.name, reason: t.rejectionReason, fix: WA.fixFor(t.rejectionReason) })),
      plan: plan.map(p => ({ id: `${p.journey}.${p.id}`, title: p.title, page: p.page, done: p.isDone })),
      next_step: nx ? `${nx.journey}.${nx.id}` : null,
    };
  }

  /* ---------- navigation & guidance actions ---------- */
  const PAGES = ["home", "inbox", "broadcasts", "bots", "contacts", "templates", "api", "settings", "numbers"];
  const nav = {
    goTo(target) {
      target = String(target || "").toLowerCase();
      if (PAGES.includes(target)) { App.act("nav", { page: target }); return `Opened ${target}.`; }
      if (target === "number") { App.act("openNumber"); return "Opened “Connect your own number”."; }
      if (target === "agent") { App.act("goAgentFromApp"); return "Opened “Connect your coding agent”."; }
      throw new Error(`Unknown place "${target}". Pages: ${PAGES.join(", ")}; screens: number, agent.`);
    },
    step(id) { const [j, st] = String(id || "").split("."); const s = (JOURNEYS[j] || { steps: [] }).steps.find(x => x.id === st); if (!s) throw new Error(`Unknown step "${id}".`); return { ...s, journey: j }; },
    showMe(id) { const st = nav.step(id); App.act("showMe", { journey: st.journey, step: st.id }); return `Started the walkthrough for “${st.title}”.`; },
    setTips(on) { const s = S(); if (!!on === !s.tipsOff) return `Tips are already ${on ? "on" : "off"}.`; App.act("toggleTips"); return `Tips turned ${on ? "on" : "off"}.`; },
  };

  /* ---------- tools Claude can call = App.work + navigation ---------- */
  const W = () => App.work;
  const TOOLS = [
    { name: "go_to", description: "Take the person to a page (home, inbox, broadcasts, bots, contacts, templates, api, settings) or setup screen (number, agent).", inputSchema: { type: "object", properties: { target: { type: "string" } }, required: ["target"] }, execute: i => nav.goTo(i.target) },
    { name: "show_me", description: "Start a spotlight walkthrough for a plan step by id (e.g. broadcast.template). Use when they want to see how, not have it done.", inputSchema: { type: "object", properties: { step_id: { type: "string" } }, required: ["step_id"] }, execute: i => nav.showMe(i.step_id) },
    { name: "add_contacts", description: "Add contacts to the workspace. Returns counts.", inputSchema: { type: "object", properties: { contacts: { type: "array", items: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" } }, required: ["phone"] } } }, required: ["contacts"] }, execute: i => W().add_contacts(i) },
    { name: "create_template", description: "Draft and submit a WhatsApp message template to Meta. name: snake_case; category: MARKETING|UTILITY|AUTHENTICATION; body may use {{1}} variables. Write the body yourself from what the person wants. Returns status pending.", inputSchema: { type: "object", properties: { name: { type: "string" }, category: { type: "string" }, body: { type: "string" } }, required: ["name", "category", "body"] }, execute: i => W().create_template(i) },
    { name: "send_message", description: "Send a free-form WhatsApp message to the person's own phone via the sandbox. Returns delivery status.", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, execute: i => W().send_message(i) },
    { name: "send_test", description: "Send an approved template as a test to the person's own phone. template optional (first approved).", inputSchema: { type: "object", properties: { template: { type: "string" } } }, execute: i => W().send_test(i) },
    { name: "send_broadcast", description: "Send an approved template to contacts (audience: all|sandbox). Costs credits and reaches real people: FIRST call without confirmed to get recipient count and cost, tell the person, and only call again with confirmed:true after they explicitly say yes.", inputSchema: { type: "object", properties: { template: { type: "string" }, audience: { type: "string" }, confirmed: { type: "boolean" } } }, execute: i => W().send_broadcast(i) },
    { name: "invite_teammate", description: "Invite a teammate to the shared inbox by email.", inputSchema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] }, execute: i => W().invite_teammate(i) },
    { name: "set_hours", description: "Set business hours and the away message.", inputSchema: { type: "object", properties: { hours: { type: "string" }, away: { type: "string" } } }, execute: i => W().set_hours(i) },
    { name: "assign_conversation", description: "Assign the inbox conversation to 'me' or a teammate email.", inputSchema: { type: "object", properties: { assignee: { type: "string" } }, required: ["assignee"] }, execute: i => W().assign_conversation(i) },
    { name: "set_webhook", description: "Set the webhook URL and verify it with a test ping.", inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] }, execute: i => W().set_webhook(i) },
    { name: "bot", description: "Bot actions: action=pick (starter: faq|lead|order), test (text), publish.", inputSchema: { type: "object", properties: { action: { type: "string" }, starter: { type: "string" }, text: { type: "string" } }, required: ["action"] }, execute: i => i.action === "pick" ? W().pick_bot(i) : i.action === "test" ? W().test_bot(i) : W().publish_bot() },
    { name: "connect_number", description: "Connect the person's own WhatsApp number via Embedded Signup. With number (+ optional display_name): completes signup (only after they confirm they have a number not on WhatsApp and a Facebook business login). Without: opens the guided signup.", inputSchema: { type: "object", properties: { number: { type: "string" }, display_name: { type: "string" } } }, execute: i => W().connect_number(i) },
    { name: "verify_business", description: "Submit business verification to Meta (legal_name, document type). Lifts the 250/day limit to 1,000 after review.", inputSchema: { type: "object", properties: { legal_name: { type: "string" }, document: { type: "string" } } }, execute: i => W().verify_business(i) },
    { name: "set_display_name", description: "Change the display name of the connected number (validated against Meta's rules; goes to review).", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }, execute: i => W().set_display_name(i) },
    { name: "get_waba", description: "Read the WhatsApp Business Account: verification, numbers, display-name status, quality, messaging limits.", execute: () => W().get_waba() },
    { name: "review_template", description: "Fetch a template's review result (status, rejection reason, fix). In this prototype also triggers the review if still pending.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] }, execute: i => W().review_template(i) },
    { name: "set_tips", description: "Turn tips, tours and nudges on or off.", inputSchema: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] }, execute: i => nav.setTips(!!i.on) },
  ];

  function prompt(history) {
    const instructions = `You are the Relay assistant inside the Relay dashboard. You can explain anything about Relay and WhatsApp rules, tell the person what to do next, take them to the right screen, walk them through a step, and DO WORK for them with tools — add contacts, write and submit templates, send messages and tests, invite teammates, set hours, set the webhook, build and publish a bot, start connecting their number. Be brief (1–3 short sentences unless asked for detail), concrete, warm, never salesy. Never invent state — CURRENT STATE is the truth. When asked to do something, do it with tools, then say what happened in one line. Write template bodies yourself in the person's voice, using {{1}} for the customer's name. Broadcasts reach real people: quote count + cost and get an explicit yes first. If they seem lost, give the single next step and offer to take them there or do it.

PRODUCT FACTS:${GLOSSARY}

CURRENT STATE (JSON):
${JSON.stringify(stateSummary())}`;
    const turns = history.slice(-10).map(m => ({ role: m.role, content: m.text }));
    turns[turns.length - 1].content = `${instructions}\n\nPERSON SAYS: ${turns[turns.length - 1].content}`;
    return turns;
  }

  /* ---------- scripted brain (no Claude): understands commands + questions ---------- */
  function scripted(q) {
    const s = S(); const t = q.trim(); const l = t.toLowerCase(); const nx = Guide.next(); const w = App.work;
    const ok = (text, chips) => ({ text, chips });
    const run = (fn, done) => { try { const r = fn(); return ok(typeof done === "function" ? done(r) : done); } catch (e) { return ok(e.message); } };
    let m;

    // confirmations
    if (R.pendingConfirm && /^(yes|y|yeah|yep|send it|confirm|go ahead|do it)\b/.test(l)) { const p = R.pendingConfirm; R.pendingConfirm = null; return run(() => w.send_broadcast({ ...p, confirmed: true }), r => `Sent “${r.template}” to ${r.sent} contacts. Delivery and reads will show on Broadcasts.`); }
    if (R.pendingConfirm && /^(no|nope|cancel|stop|not now)\b/.test(l)) { R.pendingConfirm = null; return ok("Cancelled — nothing was sent."); }

    // work commands
    if ((m = t.match(/(?:add|save|create)\s+(?:a\s+)?contacts?\s*:?\s*(.+)/i))) {
      const contacts = m[1].split(/;|\band\b|\n/).map(x => x.trim()).filter(Boolean).map(x => { const ph = (x.match(/\+?[\d][\d\s\-]{7,}\d/) || [])[0]; const name = x.replace(ph || "", "").replace(/[,()-]+/g, " ").replace(/\b(phone|number|no\.?)\b/gi, "").trim(); return { name, phone: ph }; }).filter(c => c.phone);
      return run(() => w.add_contacts({ contacts }), r => `Added ${r.added} — you now have ${r.total} contacts.`);
    }
    if ((m = t.match(/(?:create|make|write|draft|submit)\s+(?:a\s+|an\s+)?(marketing|utility|authentication|otp)?\s*template\s*(?:called|named)?\s*([a-z0-9_ ]+?)?\s*(?:that says|saying|with|:)\s*["“]?(.+?)["”]?$/i))) {
      const cat = (m[1] || "").toLowerCase() === "otp" ? "AUTHENTICATION" : (m[1] || "marketing").toUpperCase(); const name = (m[2] || "").trim() || (cat === "AUTHENTICATION" ? "login_otp" : "custom_" + (s.templates.length + 1));
      return run(() => w.create_template({ name, category: cat, body: m[3] }), r => `Submitted “${r.name}” (${r.category}) to Meta. ${r.note}`);
    }
    if (/otp template|authentication template/.test(l)) return run(() => w.create_template(STARTERS.otpTemplate), r => `Submitted “${r.name}” — authentication templates are approved fast.`);
    if (/(create|make|add|draft)\s+(a\s+)?template/.test(l)) return run(() => w.create_template(STARTERS.templateFor(s.profile.industry, s.profile.company)), r => `Drafted and submitted “${r.name}” (${r.category}) — a ${s.profile.industry === "default" ? "shipping update" : "promo"} written for ${s.profile.company || "you"}. ${r.note}`);
    if ((m = t.match(/(?:send|message|text)\s+(?:me|myself)\s*(?:a message)?\s*(?:saying|that says|:)\s*["“]?(.+?)["”]?$/i))) return run(() => w.send_message({ text: m[1] }), "Delivered to your phone.");
    if (/send (a |the )?test/.test(l)) { const tn = (t.match(/template\s+([a-z0-9_]+)/i) || [])[1]; return run(() => w.send_test({ template: tn }), r => `Test of “${r.template}” delivered to your phone.`); }
    if (/send (a |the |my )?(broadcast|campaign|blast)|send (it )?to (all|everyone|my contacts)/.test(l)) {
      const tn = (t.match(/template\s+([a-z0-9_]+)/i) || [])[1]; const audience = /sandbox/.test(l) ? "sandbox" : "all";
      try { const r = w.send_broadcast({ template: tn, audience }); if (r.needs_confirmation) { R.pendingConfirm = { template: r.template, audience }; return ok(`This sends “${r.template}” to ${r.recipients} contact${r.recipients > 1 ? "s" : ""} for about ₹${r.cost_inr}. Go ahead?`, ["Yes, send it", "No"]); } } catch (e) { return ok(e.message); }
    }
    if ((m = t.match(/invite\s+([^\s]+@[^\s]+)/i))) return run(() => w.invite_teammate({ email: m[1] }), r => r.status === "invited" ? `Invited ${r.email}. They'll get their own login to the shared inbox.` : `${r.email} is already invited.`);
    if (/invite/.test(l)) return ok("Who should I invite? Give me an email, e.g. “invite aisha@acme.in”.");
    if ((m = t.match(/(?:set|change)\s+(?:my\s+|the\s+)?(?:business\s+)?hours\s*(?:to|:)?\s*(.+)/i))) return run(() => w.set_hours({ hours: m[1].split(/away/i)[0].trim(), away: (m[1].split(/away (?:message)?:?/i)[1] || "").trim() || undefined }), r => `Hours set to ${r.hours}. Away message: “${r.away}”`);
    if ((m = t.match(/away message\s*(?:to|:)\s*["“]?(.+?)["”]?$/i))) return run(() => w.set_hours({ hours: (s.hours || {}).hours, away: m[1] }), r => `Away message saved: “${r.away}”`);
    if (/assign/.test(l)) { const who = (t.match(/to\s+([^\s]+@[^\s]+|me)/i) || [, "me"])[1]; return run(() => w.assign_conversation({ assignee: who }), r => `Assigned to ${r.assignee}.`); }
    if ((m = t.match(/webhook\s*(?:to|url|:)?\s*(https?:\/\/\S+)/i))) return run(() => w.set_webhook({ url: m[1] }), r => `Webhook set to ${r.url} and verified — 200 OK.`);
    if (/ping|verify (the |my )?webhook/.test(l)) return run(() => w.ping_webhook(), "Webhook verified — 200 OK.");
    if (/publish (the |my )?bot/.test(l)) return run(() => w.publish_bot(), "Bot published. It now answers new conversations and hands over when asked.");
    if ((m = t.match(/(?:test|ask) (?:the |my )?bot\s*(?:with|:)?\s*["“]?(.+?)["”]?$/i))) return run(() => w.test_bot({ text: m[1] }), r => `Bot replied: “${r.replied}”`);
    if (/(build|create|make|set up|pick|start)\s+(a |the |an )?(faq |lead |order )?bot/.test(l)) { const st = /lead/.test(l) ? "lead" : /order/.test(l) ? "order" : "faq"; return run(() => w.pick_bot({ starter: st }), r => `Loaded the ${r.bot} starter as a draft. Say “test the bot: what are your hours?” then “publish the bot”.`); }
    if (/connect (my|our|own|a) number|go live|submit (my )?number/.test(l)) { const num = (t.match(/\+?\d[\d\s-]{8,}\d/) || [])[0]; if (num) return run(() => w.connect_number({ number: num }), r => `Submitted ${r.number} to Meta. ${r.note}`); return ok("I can submit it if you have: a number not on WhatsApp, Business Manager access, and one legal doc. Say “connect my number +91 …” or I'll open the checklist.", ["Open the checklist"]); }
    if (/tips? (off|stop)|turn off|stop (the )?(tips|popups|nudges)/.test(l)) return run(() => nav.setTips(false), "Tips off. Bring them back from Settings or here.");
    if (/tips? on|turn on (tips|tours)/.test(l)) return run(() => nav.setTips(true), "Tips on again.");
    if (/do it for me|just do it|set it up for me|do the next/.test(l)) {
      if (!nx) return ok("Your plan is done — nothing to do for you right now.");
      const auto = { contacts: () => scripted("add sample contacts"), template: () => scripted("create a template"), otp: () => scripted("create an otp template"), test: () => scripted("send a test"), broadcast: () => scripted("send a broadcast"), pickbot: () => scripted("build a bot"), testbot: () => scripted("test the bot: what are your hours?"), publish: () => scripted("publish the bot"), invite: () => ok("Who should I invite? Give me an email."), assign: () => scripted("assign to me"), hours: () => scripted("set hours to Mon–Sat, 10:00–19:00 IST"), send: () => scripted("send me a message saying Hi from the assistant 👋"), webhook: () => ok("What's your webhook URL? e.g. “set webhook https://yourapp.com/relay”") };
      return (auto[nx.id] || (() => ok(`I'll walk you through “${nx.title}”.`)))();
    }
    if (/add (3 |three |some )?sample contacts/.test(l)) return run(() => w.add_contacts({ contacts: [{ name: "Priya Nair", phone: "+91 91234 56789" }, { name: "Rahul Mehta", phone: "+91 99887 76655" }, { name: "Sana Khan", phone: "+91 98111 22333" }] }), r => `Added ${r.added} sample contacts (${r.total} total).`);
    if (/show me|walk me|how do i|where do i/.test(l) && nx && !/number|meta/.test(l)) return run(() => nav.showMe(`${nx.journey}.${nx.id}`), `Here's how: ${nx.title.toLowerCase()}.`);
    for (const p of PAGES) if (new RegExp(`(go to|open|take me to|show)\\s+(the\\s+)?${p}`).test(l)) return run(() => nav.goTo(p), `Opened ${p}.`);
    if (/open the checklist|checklist/.test(l)) return run(() => nav.goTo("number"), "Here's the checklist.");
    if (/take me there/.test(l) && nx) return run(() => nav.goTo(nx.page), `Opened ${nx.page}.`);

    if (/verify (my |the |our )?business|business verification|lift (the )?limit/.test(l)) return run(() => w.verify_business({}), r => r.status === "verified" ? "Your business is already verified." : `Submitted for business verification. ${r.note}`);
    if ((m = t.match(/(?:change|set|rename)\s+(?:the |my )?display name\s*(?:to|:)\s*["“]?(.+?)["”]?$/i))) return run(() => w.set_display_name({ name: m[1] }), r => `Display name “${r.name}” sent to Meta for review.`);
    if (/why (was|is) (my |the )?template rejected|rejected template|template (got )?rejected/.test(l)) { const rt = s.templates.filter(x => x.status === "rejected"); return ok(rt.length ? rt.map(x => `“${x.name}”: ${x.rejectionReason}\nFix: ${WA.fixFor(x.rejectionReason)}`).join("\n\n") : "None of your templates are rejected.", rt.length ? ["Open templates"] : []); }
    if (/messaging limit|how many (messages|conversations)|250|tier|limit/.test(l)) { const n = s.numbers[0]; return ok(n ? `You can start ${WA.TIERS[WA.tierFor(s, n)].label} customer conversations. ${s.waba.businessVerification !== "verified" ? "Verify your business to move to 1K/day — say “verify my business”." : "Keep quality green and send at volume to move up automatically."}` : "On the sandbox there's no limit, but you can only message people who joined it. Your own number starts at 250 conversations/day and grows with verification and quality."); }
    if (/quality( rating)?/.test(l)) { const n = s.numbers[0]; return ok(n ? `Quality on ${n.phone} is ${n.quality === "unknown" ? "not rated yet — Meta rates after enough sends" : n.quality}. ${n.quality === "yellow" || n.quality === "red" ? "Pause marketing, check opt-ins, add an opt-out." : ""}` : "Quality is rated per number once you have your own. It comes from customer blocks and reports."); }
    if (/display name|waba|whatsapp business account|embedded sign ?up|green tick|official/.test(l)) return ok(s.waba ? `WABA ${s.waba.id} · business ${s.waba.businessVerification}. ${s.numbers.map(n => `${n.phone}: display name “${n.displayName}” ${n.displayNameStatus}${n.displayNameReason ? " — " + n.displayNameReason : ""}`).join("; ")}. ${s.waba.oba ? "You have the green tick." : s.waba.businessVerification === "verified" ? "You can request the green tick from Numbers & WABA." : "Green tick needs business verification first."}` : "You don't have a WhatsApp Business Account yet — it's created during Embedded Signup when you connect your number. Say “connect my number +91 …” or I'll open the guided flow.", s.waba ? ["Open numbers"] : ["Open the checklist"]);
    if (/(replay|restart|show me around|start) (the )?tour/.test(l)) { App.act("replayTour"); return ok(`Replaying the walkthrough for ${s.page}.`); }

    // questions
    if (/claude code|cursor|mcp|coding agent|windsurf/.test(l)) return s.agentConnected ? ok("Your coding agent is connected and uses the same tools I do — send, templates, inbox.") : run(() => nav.goTo("agent"), "Here's the one-command setup for Claude Code or Cursor. The agent gets the same tools I have.");
    if (/card|payment|bill|pay|price|cost|pricing|₹|rupee|charge/.test(l)) return ok(`You pay per conversation: about ₹0.78 marketing, ₹0.115 utility/OTP; incoming is free. You have ₹${s.billing.credits} of ₹${s.billing.creditsTotal} free credits${s.billing.added ? " and a card on file" : " — no card needed until they run out"}.`);
    if (/number|meta|verif|live/.test(l)) return ok(s.meta.status === "live" ? `Your number ${s.meta.number} is live — everything sends from it now.` : s.meta.status === "pending" ? `Meta is reviewing ${s.meta.number}. Usually a few hours; we'll WhatsApp you. Meanwhile keep building on the sandbox — it all carries over.` : "You're on the sandbox number — perfect for testing. For real customers you connect your own: a number not on WhatsApp, Business Manager access, and one legal doc (GST/MSME/CoI). I can submit it for you: “connect my number +91 …”.", s.meta.status === "none" ? ["Open the checklist"] : []);
    if (/template/.test(l)) return ok((s.templates.length ? `You have ${s.templates.map(x => `${x.name} (${x.status})`).join(", ")}. ` : "No templates yet. ") + "WhatsApp needs a Meta-approved template to start a conversation or after 24h of silence. Tell me what it should say and I'll write and submit it — e.g. “create a template that says Hi {{1}}, your order has shipped”.");
    if (/sandbox|join|test number/.test(l)) return ok(`The sandbox is a shared test number (+91 22 4890 1122). Anyone who sends “join calm-otter” to it can receive your messages. ${s.sandbox.status === "connected" ? "You're connected." : "You haven't joined yet."} Real customers need your own number.`);
    if (/webhook|api|key|token|curl|endpoint/.test(l)) return ok(`Auth is “Authorization: Bearer <key>”. POST /v1/messages sends; GET /v1/onboarding tells you what's next. Your key has a ₹2,000 limit. Webhook: ${s.webhook.url ? (s.webhook.pinged ? "set and verified." : "set but not verified — say “ping webhook”.") : "not set — say “set webhook https://…” and I'll verify it."}`);
    if (/bot|automat|auto.?repl/.test(l)) return ok(s.bot ? `Your ${s.bot.id} bot is ${s.bot.published ? "published" : s.bot.tested ? "tested, not published yet — say “publish the bot”" : "loaded but untested — say “test the bot: what are your hours?”"}.` : "Say “build an FAQ bot” (or lead / order) and I'll load a working starter; then test it here and publish.");
    if (/inbox|team|hours|away/.test(l)) return ok(`The inbox is shared with your team (${s.team.length} invited). I can “invite someone@acme.in”, “assign to me”, or “set hours to Mon–Sat 10–7”.`);
    if (/broadcast|campaign|bulk|blast/.test(l)) return ok(`A broadcast is one approved template to many contacts. You have ${s.contacts.length} contacts and ${s.templates.filter(x => x.status === "approved").length} approved template(s). Say “send a test” first, then “send a broadcast” and I'll quote the count and cost before sending.`);
    if (/what can you|help|who are you|what do you do/.test(l)) return ok("I can explain Relay and WhatsApp rules, and I can do the work: add contacts, write and submit templates, send tests and broadcasts, invite teammates, set hours and webhooks, build and publish a bot, submit your number to Meta. Try “what's next?” or “do it for me”.");
    return nx ? ok(`Next: ${nx.title}. ${nx.why}`, ["Take me there", "Do it for me", "Show me how"]) : ok(s.meta.status === "live" ? "Your plan is done and your number is live. Ask me anything or tell me what to do." : "Your plan is done. The one thing left is connecting your own number so real customers can hear from you.", s.meta.status !== "live" ? ["Open the checklist"] : []);
  }

  /* ---------- UI ---------- */
  function chips() {
    const s = S(); const nx = Guide.next();
    if (s.screen !== "app") return { signup: ["What is Relay?", "What will this cost?"], why: ["Which should I pick?", "Can I change this later?"], workspace: ["What's the spend limit?", "How do I use the key?"], first: ["What is the sandbox?", "Send me a message saying hello"], agent: ["What does the agent get?", "What is MCP?"], number: ["What does Meta need?", "How long is review?"], billing: ["Will I be charged?", "What's a conversation?"], done: ["What's next?"] }[s.screen] || ["What's next?"];
    return [nx ? "What's next?" : "What's left?", "Do it for me", "Create a template", "Send a test"];
  }
  function render(el) {
    R.el = el; const h = chat();
    const msgs = h.map((m, i) => `<div class="msg ${m.role}">${m.role === "assistant" ? `<span class="av">R</span>` : ""}<div class="bub">${esc(m.text) || (m.pending ? "" : "…")}${m.pending ? `<span class="cursor-dot"></span>` : ""}${m.chips && i === h.length - 1 ? `<div class="chips" style="margin-top:8px">${m.chips.map(c => `<button class="chip" data-as="chip">${esc(c)}</button>`).join("")}</div>` : ""}</div></div>`).join("");
    el.innerHTML = `
      <div class="as-head"><span class="row"><span class="brandmark">R</span><strong>Relay assistant</strong></span><span class="row"><span class="pill ${sample ? "accent" : ""}">${!ready ? "…" : sample ? "Claude" : "scripted"}</span>${h.length ? `<button class="btn ghost sm" data-as="clear" title="Clear chat">✕</button>` : ""}</span></div>
      <div class="as-msgs">${msgs || `<div class="msg assistant"><span class="av">R</span><div class="bub">Hi${S().profile.email ? " " + esc(S().profile.email.split("@")[0]) : ""}. Ask me anything about Relay, or tell me what to do — I can add contacts, write templates, send tests, invite your team, set up your bot…</div></div>`}</div>
      ${!h.length || !h[h.length - 1].chips ? `<div class="chips as-chips">${chips().map(c => `<button class="chip" data-as="chip">${esc(c)}</button>`).join("")}</div>` : ""}
      <form class="as-form"><input type="text" placeholder="${busy ? "Working…" : "Ask, or tell me what to do"}" value="${esc(R.draft)}" ${busy ? "disabled" : ""} autocomplete="off"><button class="btn primary sm" type="submit" ${busy ? "disabled" : ""}>${busy ? "…" : "Send"}</button>${busy && abort ? `<button class="btn ghost sm" type="button" data-as="stop">Stop</button>` : ""}</form>`;
    const list = el.querySelector(".as-msgs"); list.scrollTop = list.scrollHeight;
    el.querySelector("form").onsubmit = e => { e.preventDefault(); const v = e.target.querySelector("input").value.trim(); if (v) { R.draft = ""; send(v); } };
    el.querySelector("input").oninput = e => { R.draft = e.target.value; };
    el.onclick = e => { const b = e.target.closest("[data-as]"); if (!b) return; if (b.dataset.as === "chip") send(b.textContent); if (b.dataset.as === "stop" && abort) abort.abort(); if (b.dataset.as === "clear") { S().chat = []; R.pendingConfirm = null; App.save(); render(el); } };
  }
  const CHIP_MAP = { "Yes, send it": "yes", "No": "no", "Open the checklist": "open the checklist" };

  async function send(text) {
    if (busy) return;
    text = CHIP_MAP[text] || text;
    const h = chat(); h.push({ role: "user", text }); const reply = { role: "assistant", text: "", pending: true }; h.push(reply);
    busy = true; App.save(); if (R.el) render(R.el);
    const finish = () => { reply.pending = false; busy = false; abort = null; App.save(); if (R.el) render(R.el); };
    if (sample && !R.pendingConfirm) {
      abort = new AbortController();
      try {
        const { text: out } = await sample(prompt(h.slice(0, -1)), {
          tools: TOOLS, modelTier: "quick", signal: abort.signal,
          onText: ({ text: t }) => { reply.text = t; const b = R.el && R.el.querySelector(".msg:last-child .bub"); if (b && b.firstChild) b.firstChild.nodeValue = t; },
        });
        reply.text = out || reply.text || "Done.";
      } catch (e) {
        if (e && e.code === "cancelled") reply.text = reply.text || "Stopped.";
        else if (e && e.code === "not_granted") { sample = null; const f = scripted(text); reply.text = f.text; reply.chips = f.chips; }
        else { const f = scripted(text); reply.text = (e && e.text) || f.text; reply.chips = f.chips; }
      }
      finish(); return;
    }
    setTimeout(() => { const f = scripted(text); reply.text = f.text; if (f.chips && f.chips.length) reply.chips = f.chips; finish(); }, 350);
  }

  return { render, send, isBusy: () => busy, hasClaude: () => !!sample };
})();
