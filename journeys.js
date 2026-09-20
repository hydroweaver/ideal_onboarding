/* journeys.js — DATA ONLY. Journeys per job-to-be-done, page tours, beacons, nudge rules.
   Edit this file to change what the platform guides people towards. */

window.JTBD = {
  broadcast: { icon: "📣", title: "Send broadcasts",   sub: "Offers, updates and announcements to many customers at once.", module: "broadcasts" },
  bot:       { icon: "🤖", title: "Automate replies",  sub: "A no-code bot that answers FAQs and captures leads 24×7.",      module: "bots" },
  inbox:     { icon: "💬", title: "Run a team inbox",  sub: "Your team replies to customers from one shared WhatsApp.",      module: "inbox" },
  api:       { icon: "⚙️", title: "Send from my app",  sub: "OTPs, order updates and alerts via the API.",                  module: "api" },
};

/* Modules: which nav entries exist, and when they become visible.
   Progressive disclosure — a module shows only when it is relevant to the person. */
window.MODULES = [
  { id: "home",       icon: "◎",  label: "Your plan",  show: () => true },
  { id: "inbox",      icon: "💬", label: "Inbox",      show: s => s.jtbd.includes("inbox") || s.jtbd.includes("bot") },
  { id: "broadcasts", icon: "📣", label: "Broadcasts", show: s => s.jtbd.includes("broadcast") },
  { id: "bots",       icon: "🤖", label: "Bots",       show: s => s.jtbd.includes("bot") },
  { id: "contacts",   icon: "👥", label: "Contacts",   show: s => s.jtbd.includes("broadcast") || s.jtbd.includes("inbox") || s.contacts.length > 0 },
  { id: "templates",  icon: "📄", label: "Templates",  show: s => s.jtbd.includes("broadcast") || s.jtbd.includes("api") || s.templates.length > 0 || s.meta.status === "live" },
  { id: "api",        icon: "⚙️", label: "API",        show: s => s.jtbd.includes("api") || s.agentConnected },
  { id: "numbers",    icon: "📱", label: "Numbers & WABA", show: s => s.numbers.length > 0 },
];
window.MORE_MODULES = [
  { id: "numbers",  icon: "📱", label: "Numbers & WABA" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

/* Journeys. Each step: id, title, page it happens on, why it matters, done(state),
   optional doForMe (action id in app.js), optional tourStep (index in that page's tour). */
window.JOURNEYS = {
  broadcast: {
    label: "Broadcasts",
    steps: [
      { id: "contacts",  page: "contacts",   title: "Add 3 contacts",
        why: "A broadcast needs somewhere to go. Start with your own number so you can see what customers will see.",
        done: s => s.contacts.length >= 1, doForMe: "seedContacts", tourStep: 0 },
      { id: "template",  page: "templates",  title: "Create your first template",
        why: "WhatsApp only lets businesses start conversations with a pre-approved template. We've drafted one for you.",
        done: s => s.templates.length >= 1, doForMe: "seedTemplate", tourStep: 0 },
      { id: "test",      page: "broadcasts", title: "Send a test to yourself",
        why: "See it on your own phone before anyone else does.",
        done: s => s.broadcasts.some(b => b.test), tourStep: 2 },
      { id: "broadcast", page: "broadcasts", title: "Send your first broadcast",
        why: "This is the moment you signed up for.",
        done: s => s.broadcasts.some(b => !b.test), tourStep: 3 },
    ],
  },
  bot: {
    label: "Automation",
    steps: [
      { id: "pickbot", page: "bots", title: "Pick a starter bot",
        why: "Start from a working bot and change the words — don't build from a blank canvas.",
        done: s => !!s.bot, doForMe: "seedBot", tourStep: 0 },
      { id: "testbot", page: "bots", title: "Test it in the sandbox",
        why: "Talk to your bot from your own phone before customers do.",
        done: s => !!s.bot && s.bot.tested, tourStep: 1 },
      { id: "publish", page: "bots", title: "Publish the bot",
        why: "Once published, it answers every new conversation automatically.",
        done: s => !!s.bot && s.bot.published, tourStep: 2 },
    ],
  },
  inbox: {
    label: "Team inbox",
    steps: [
      { id: "invite", page: "inbox", title: "Invite a teammate",
        why: "An inbox for one person is just your phone. Invite someone who replies to customers.",
        done: s => s.team.length >= 1, doForMe: "seedTeam", tourStep: 1 },
      { id: "assign", page: "inbox", title: "Assign a conversation",
        why: "Assignment is how nothing falls through the cracks.",
        done: s => s.conversations.some(c => c.assignee), tourStep: 0 },
      { id: "hours",  page: "inbox", title: "Set business hours & away message",
        why: "Customers message at 11pm. Tell them when you'll be back.",
        done: s => !!s.hours, doForMe: "seedHours", tourStep: 2 },
    ],
  },
  api: {
    label: "API",
    steps: [
      { id: "send",    page: "api", title: "Send a message from code",
        why: "One request, one message on your phone. Everything else builds on this.",
        done: s => s.apiSent, tourStep: 0 },
      { id: "webhook", page: "api", title: "Set a webhook and verify it",
        why: "Replies and delivery receipts arrive here. Verify it with a test ping so you're never guessing.",
        done: s => s.webhook.pinged, tourStep: 1 },
      { id: "otp",     page: "templates", title: "Create an OTP template",
        why: "Authentication templates are approved fast and are the cheapest message type.",
        done: s => s.templates.some(t => t.category === "AUTHENTICATION"), doForMe: "seedOtpTemplate", tourStep: 0 },
    ],
  },
};

/* Page tours: ≤ 4 steps each. `sel` targets a [data-tour] anchor on that page. */
window.TOURS = {
  contacts: [
    { sel: "[data-tour='paste']",  title: "Add contacts here",  body: "Paste numbers one per line. Your own number is a great first contact." },
    { sel: "[data-tour='import']", title: "Or import a CSV",    body: "When you have a list, import it here. Name and phone are the only required columns." },
  ],
  templates: [
    { sel: "[data-tour='new']",    title: "Templates are the message", body: "WhatsApp requires a Meta-approved template to start a conversation, or to message after 24h of silence. Start from a draft — it's already written for your industry." },
    { sel: "[data-tour='status']", title: "Meta reviews every template", body: "Minutes to a few hours. If it's rejected you'll see the reason and the fix right here — and you can resubmit." },
  ],
  numbers: [
    { sel: "[data-tour='waba']",   title: "Your WhatsApp Business Account", body: "Meta's container for your numbers, templates and limits. Business verification lives here." },
    { sel: "[data-tour='verify']", title: "Verify to lift the 250/day cap", body: "One legal document. Until Meta verifies you, you can start 250 customer conversations a day." },
    { sel: "[data-tour='limits']", title: "Limits grow with quality",      body: "Send at volume with a green quality rating and Meta raises the tier automatically." },
    { sel: "[data-tour='number']", title: "Each number has its own status", body: "Display-name review, quality rating, two-step PIN and the business profile customers see." },
  ],
  broadcasts: [
    { sel: "[data-tour='audience']", title: "Pick your audience",            body: "Everyone, or a saved segment. Start small." },
    { sel: "[data-tour='template']", title: "Choose an approved template",   body: "Only approved templates can be sent. Pending ones appear here greyed out." },
    { sel: "[data-tour='test']",     title: "Send a test to yourself first", body: "It lands on your phone exactly as customers will see it." },
    { sel: "[data-tour='send']",     title: "Then send or schedule",         body: "That's it. Delivery and read counts show up here as they happen." },
  ],
  bots: [
    { sel: "[data-tour='starters']", title: "Start from a working bot",    body: "Pick the closest one. You can change every word later." },
    { sel: "[data-tour='testchat']", title: "Test it right here",          body: "This chat uses your sandbox number, so you can also test from your phone." },
    { sel: "[data-tour='publish']",  title: "Publish when it feels right", body: "Published bots answer new conversations and hand over to a human when asked." },
  ],
  inbox: [
    { sel: "[data-tour='convo']",  title: "Every conversation lives here", body: "Your own sandbox chat is already in. Real customers appear the same way." },
    { sel: "[data-tour='invite']", title: "Invite your team",              body: "Teammates get their own login and see the same inbox." },
    { sel: "[data-tour='hours']",  title: "Set hours and an away message", body: "So customers know when to expect a reply." },
  ],
  api: [
    { sel: "[data-tour='snippet']", title: "This request sends a real message", body: "Your key is already in it. Copy, run, and watch your phone." },
    { sel: "[data-tour='webhook']", title: "Set a webhook",                     body: "Replies and delivery events arrive here. Verify it with a test ping." },
  ],
};

/* Beacons: max ONE per page is ever shown — the first not-yet-seen entry. */
window.BEACONS = {
  home:       [{ id: "home-number", sel: "[data-beacon='number']", text: "When you're ready to message real customers, connect your own number here." }],
  broadcasts: [{ id: "bc-test",     sel: "[data-tour='test']",     text: "Send yourself a test before the real thing." }],
  templates:  [{ id: "tp-new",      sel: "[data-tour='new']",      text: "Start here — the draft is already written." }],
  numbers:    [{ id: "nm-verify",   sel: "[data-tour='verify']",   text: "Verify your business to lift the 250/day limit." }],
  api:        [{ id: "api-webhook", sel: "[data-tour='webhook']",  text: "Set a webhook to receive replies." }],
  inbox:      [{ id: "in-invite",   sel: "[data-tour='invite']",   text: "Invite a teammate." }],
  bots:       [{ id: "bot-publish", sel: "[data-tour='publish']",  text: "Publish when you've tested it." }],
  contacts:   [{ id: "ct-import",   sel: "[data-tour='import']",   text: "Import a CSV when you have a list." }],
};

/* Nudge rules. Evaluated on every state change / page load.
   priority: lower = more important. once: fire only once ever. page: only on this page (optional).
   cta.action is an app.js action id. */
window.NUDGES = [
  { id: "name-rejected", priority: 1, once: false,
    when: s => s.numbers.some(n => n.displayNameStatus === "rejected"),
    title: "Meta rejected your display name",
    body: s => `${(s.numbers.find(n => n.displayNameStatus === "rejected") || {}).displayNameReason || "It doesn't match your business."} Pick a new one — messages still send meanwhile.`,
    cta: { label: "Change name", action: "nav", page: "numbers" } },

  { id: "template-rejected", priority: 1, once: false,
    when: s => s.templates.some(t => t.status === "rejected"),
    title: "A template was rejected",
    body: s => { const t = s.templates.find(x => x.status === "rejected"); return `“${t.name}”: ${(t.rejectionReason || "").split(":")[0]}. Fix: ${WA.fixFor(t.rejectionReason)}`; },
    cta: { label: "Edit & resubmit", action: "nav", page: "templates" } },

  { id: "template-recategorised", priority: 3, once: true,
    when: s => s.templates.some(t => t.categoryChangedFrom),
    title: "Meta changed a template's category",
    body: s => { const t = s.templates.find(x => x.categoryChangedFrom); return `“${t.name}” was submitted as ${t.categoryChangedFrom} but approved as ${t.category} — it'll be billed at the ${t.category.toLowerCase()} rate.`; },
    cta: { label: "See template", action: "nav", page: "templates" } },

  { id: "verify-business", priority: 3, once: false,
    when: s => !!s.waba && s.waba.businessVerification === "unverified" && s.meta.status === "live",
    title: "You're capped at 250 conversations/day",
    body: () => "Business verification lifts it to 1,000 and unlocks the green tick. One document, 1–3 days.",
    cta: { label: "Verify business", action: "nav", page: "numbers" }, alt: { label: "Later" } },

  { id: "quality-drop", priority: 1, once: false,
    when: s => s.numbers.some(n => n.quality === "yellow" || n.quality === "red"),
    title: "Quality rating dropped",
    body: () => "Customers are blocking or reporting messages. Pause marketing sends, check opt-ins, add an opt-out. 7 days of low quality lowers your limit.",
    cta: { label: "See number", action: "nav", page: "numbers" } },

  { id: "number-live", priority: 1, once: true,
    when: s => s.meta.status === "live" && !s.broadcasts.some(b => !b.test),
    title: "🎉 Your number is live",
    body: s => `Messages now go out from ${s.meta.number || "your number"}. ${s.contacts.length ? `Your ${s.contacts.length} contact${s.contacts.length > 1 ? "s are" : " is"} ready — ` : ""}send your first real broadcast?`,
    cta: { label: "Send broadcast", action: "nav", page: "broadcasts" } },

  { id: "template-approved", priority: 2, once: true,
    when: s => s.templates.some(t => t.status === "approved") && !s.broadcasts.length,
    title: "Template approved",
    body: s => `“${(s.templates.find(t => t.status === "approved") || {}).name}” is approved by Meta. Send a test to yourself?`,
    cta: { label: "Send test", action: "nav", page: "broadcasts" } },

  { id: "webhook-unverified", priority: 3, once: false,
    when: s => !!s.webhook.url && !s.webhook.pinged, page: "api",
    title: "Verify your webhook",
    body: () => "You've set a URL but it hasn't received anything yet. Send a test ping so you're not guessing.",
    cta: { label: "Send test ping", action: "pingWebhook" } },

  { id: "go-live", priority: 4, once: false,
    when: s => s.sandbox.status === "connected" && s.meta.status === "none" && s.sessions >= 2,
    title: "Ready to go live?",
    body: () => "You've been using the sandbox. Connecting your own number takes about 3 minutes if you have the paperwork.",
    cta: { label: "See the checklist", action: "openNumber" }, alt: { label: "Remind me later" } },

  { id: "low-credits", priority: 2, once: false,
    when: s => s.billing.credits / s.billing.creditsTotal < 0.2 && !s.billing.added,
    title: "Credits running low",
    body: s => `₹${s.billing.credits} left. Add a payment method so messages don't stop mid-campaign.`,
    cta: { label: "Add payment method", action: "nav", page: "settings" } },
];

/* Starter content used by “Do it for me” and empty states. */
window.STARTERS = {
  templateFor(industry, company) {
    const c = company || "your store";
    const map = {
      retail:  { name: "new_arrivals",  category: "MARKETING", body: `Hi {{1}}! New arrivals just landed at ${c}. Reply YES to see this week's picks. Reply STOP to opt out.` },
      food:    { name: "weekend_offer", category: "MARKETING", body: `Hi {{1}}! This weekend at ${c}: 20% off on orders above ₹499. Show this message to redeem.` },
      default: { name: "order_update",  category: "UTILITY",   body: `Hi {{1}}, your order #{{2}} from ${c} has been shipped and will arrive by {{3}}. Reply to this message for help.` },
    };
    return map[industry] || map.default;
  },
  otpTemplate: { name: "login_otp", category: "AUTHENTICATION", body: "{{1}} is your verification code. For your security, do not share this code." },
  bots: [
    { id: "faq",   title: "FAQ answerer", sub: "Answers hours, location, pricing. Hands over when it doesn't know." },
    { id: "lead",  title: "Lead capture", sub: "Asks name, need and budget, then tags the contact." },
    { id: "order", title: "Order status", sub: "Asks for an order number and replies with status via your API." },
  ],
};
