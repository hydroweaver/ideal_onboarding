/* whatsapp.js — the WhatsApp Business Platform domain: Embedded Signup, WABA, phone numbers,
   message templates. Models, Meta's validation rules, and a review simulator that behaves like Meta.
   No UI here. app.js renders it; assistant.js and the agent call it through App.work. */
window.WA = (function () {

  /* ---------- reference data ---------- */
  const TIERS = [
    { limit: 250,       label: "250 / 24h",       note: "Unverified business. Complete business verification to unlock 1,000." },
    { limit: 1000,      label: "1K / 24h",        note: "Verified. Send to ~500 unique customers in 7 days with good quality to move up." },
    { limit: 10000,     label: "10K / 24h",       note: "Keep quality green while sending at volume to move up." },
    { limit: 100000,    label: "100K / 24h",      note: "Keep quality green." },
    { limit: Infinity,  label: "Unlimited",       note: "Top tier." },
  ];
  const LANGUAGES = { en: "English", en_US: "English (US)", hi: "Hindi", ta: "Tamil", te: "Telugu", mr: "Marathi", bn: "Bengali", gu: "Gujarati", kn: "Kannada", ar: "Arabic", es: "Spanish", pt_BR: "Portuguese (BR)" };
  const CATEGORIES = {
    MARKETING:      { label: "Marketing",      price: 0.78,  note: "Offers, promotions, announcements. Needs prior opt-in. Customers can opt out." },
    UTILITY:        { label: "Utility",        price: 0.115, note: "Order updates, reminders, alerts about an existing transaction. No promotional content." },
    AUTHENTICATION: { label: "Authentication", price: 0.115, note: "One-time passcodes. Body text is fixed by Meta; you choose the button type." },
  };
  const PROMO_WORDS = /\b(offer|discount|sale|% ?off|free|deal|coupon|limited time|buy now|promo|new arrivals|festive|upgrade|save)\b/i;

  /* ---------- Embedded Signup: the step machine ---------- */
  // These are the screens Meta shows inside its popup. The prototype renders them in-page.
  const ES_STEPS = [
    { id: "preflight", title: "Before you start",        meta: false },
    { id: "fb",        title: "Log in with Facebook",    meta: true },
    { id: "portfolio", title: "Business portfolio",      meta: true },
    { id: "waba",      title: "WhatsApp Business Account", meta: true },
    { id: "phone",     title: "Phone number",            meta: true },
    { id: "otp",       title: "Verify the number",       meta: true },
    { id: "name",      title: "Display name",            meta: true },
    { id: "pin",       title: "Two-step verification",   meta: true },
    { id: "permit",    title: "Permissions",             meta: true },
    { id: "done",      title: "Connected",               meta: false },
  ];
  function emptySignup() {
    return { step: 0, fb: null, portfolio: { mode: "create", name: "", website: "", country: "IN", address: "" }, waba: { mode: "create", name: "", timezone: "Asia/Kolkata", category: "Retail" }, phone: { source: "new", number: "", method: "sms" }, otp: { sent: false, verified: false, attempts: 0 }, displayName: "", pin: "", permissions: false, result: null };
  }

  /* Display-name rules (Meta "display name guidelines"), checked live. */
  function validateDisplayName(name, businessName) {
    const n = String(name || "").trim(); const errs = [];
    if (n.length < 3) errs.push("At least 3 characters.");
    if (/^[^a-z]*$/i.test(n)) errs.push("Must contain letters.");
    if (n.length > 3 && n === n.toUpperCase() && /[A-Z]/.test(n)) errs.push("Can't be all capitals (unless it's an acronym).");
    if (/whatsapp|facebook|meta\b|instagram/i.test(n)) errs.push("Can't contain WhatsApp, Facebook, Meta or Instagram.");
    if (/^(test|demo|hello|sample)$/i.test(n)) errs.push("Generic names like “Test” are rejected.");
    if (/[!@#$%^&*(){}<>\[\]]/.test(n)) errs.push("No special characters or emoji.");
    if (/\b(official|verified|24x7|best|no\.?1)\b/i.test(n)) errs.push("No claims like “official”, “verified”, “best”.");
    if (businessName && !n.toLowerCase().includes(businessName.toLowerCase().split(/\s+/)[0]) ) errs.push(`Should reflect your business name (“${businessName}”) — Meta checks it against your website and documents.`);
    return { ok: errs.length === 0, errs };
  }

  /* ---------- Numbers ---------- */
  function newNumber(sig) {
    return {
      id: "phone_" + Math.random().toString(36).slice(2, 10),
      phone: sig.phone.number, source: sig.phone.source,
      displayName: sig.displayName, displayNameStatus: "pending", displayNameReason: null,
      status: "connected",                // pending | connected | flagged | restricted
      registered: true, twoStepPin: !!sig.pin, webhooks: true,
      quality: "unknown",                 // unknown | green | yellow | red
      tier: 0,                            // index into TIERS
      sent24h: 0,
      profile: { about: "", description: "", address: sig.portfolio.address || "", email: "", website: sig.portfolio.website || "", vertical: sig.waba.category || "Retail", logo: false },
    };
  }
  function newWaba(sig) {
    return {
      id: "waba_" + Math.floor(1e14 + Math.random() * 9e14),
      name: sig.waba.name, businessId: "biz_" + Math.floor(1e14 + Math.random() * 9e14), businessName: sig.portfolio.name,
      businessVerification: "unverified",  // unverified | pending | verified | rejected
      verificationDoc: null,
      accountReview: "approved",           // pending | approved | restricted
      oba: false, obaRequested: false,      // Official Business Account (green tick)
      paymentMethod: "BSP credit line",
      createdAt: Date.now(),
    };
  }
  function summarizeMeta(s) {
    // Keeps the older, simpler s.meta shape in sync so the rest of the app keeps working.
    const n = s.numbers[0];
    if (!n) return { status: "none", number: "" };
    if (n.status === "connected" && n.registered) return { status: "live", number: n.phone };
    return { status: "pending", number: n.phone };
  }
  function tierFor(s, n) {
    const w = s.waba; if (!w || w.businessVerification !== "verified") return 0;
    return Math.max(1, n.tier);
  }

  /* ---------- Templates ---------- */
  function emptyTemplate(draft) {
    return Object.assign({
      name: "", language: "en", category: "MARKETING",
      header: { type: "none", text: "", sample: "" },
      body: "", samples: [], footer: "",
      buttons: [],                    // {type: QUICK_REPLY|URL|PHONE_NUMBER|COPY_CODE|OTP, text, url, phone, otpType}
      auth: { addSecurity: true, expiryMinutes: 10, otpType: "COPY_CODE" },
      status: "draft", rejectionReason: null, quality: "unknown", categoryChangedFrom: null, submittedAt: null, reviewedAt: null,
    }, draft || {});
  }
  const AUTH_BODY = (t) => `{{1}} is your verification code.${t.auth && t.auth.addSecurity ? " For your security, do not share this code." : ""}`;
  const AUTH_FOOTER = (t) => t.auth && t.auth.expiryMinutes ? `This code expires in ${t.auth.expiryMinutes} minutes.` : "";

  function variables(text) { return [...String(text || "").matchAll(/\{\{(\d+)\}\}/g)].map(m => +m[1]); }

  /* Meta's template validation, the subset that actually bites people. Returns [{field, msg}]. */
  function validateTemplate(t) {
    const e = [];
    if (!/^[a-z0-9_]{1,512}$/.test(t.name)) e.push({ field: "name", msg: "Lowercase letters, numbers and underscores only (e.g. order_update)." });
    if (!LANGUAGES[t.language]) e.push({ field: "language", msg: "Pick a language." });
    if (!CATEGORIES[t.category]) e.push({ field: "category", msg: "Pick a category." });
    const body = t.category === "AUTHENTICATION" ? AUTH_BODY(t) : t.body;
    if (!body || !body.trim()) e.push({ field: "body", msg: "Body is required." });
    if (body && body.length > 1024) e.push({ field: "body", msg: "Body must be 1,024 characters or fewer." });
    if (t.category !== "AUTHENTICATION") {
      const v = variables(body);
      for (let i = 0; i < v.length; i++) if (v[i] !== i + 1) { e.push({ field: "body", msg: `Variables must be sequential with no gaps: {{1}}, {{2}}… (found {{${v[i]}}} at position ${i + 1}).` }); break; }
      if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body)) e.push({ field: "body", msg: "Body can't start or end with a variable." });
      if (/\}\}\s*\{\{/.test(body)) e.push({ field: "body", msg: "Two variables can't sit next to each other." });
      v.forEach((n, i) => { if (!(t.samples[i] || "").trim()) e.push({ field: "samples", msg: `Sample value for {{${n}}} is required — Meta reviews with the sample filled in.` }); });
      if (v.length && body.replace(/\{\{\d+\}\}/g, "").trim().length < 20) e.push({ field: "body", msg: "Too little fixed text around the variables — Meta rejects near-empty bodies." });
    }
    if (t.header.type === "text") { if (!t.header.text.trim()) e.push({ field: "header", msg: "Header text is required." }); if (t.header.text.length > 60) e.push({ field: "header", msg: "Header text ≤ 60 characters." }); if (variables(t.header.text).length > 1) e.push({ field: "header", msg: "Header allows at most one variable." }); }
    if (["image", "video", "document"].includes(t.header.type) && !t.header.sample) e.push({ field: "header", msg: `A sample ${t.header.type} is required for review.` });
    if (t.footer && t.footer.length > 60) e.push({ field: "footer", msg: "Footer ≤ 60 characters." });
    if (t.category === "AUTHENTICATION" && t.header.type !== "none") e.push({ field: "header", msg: "Authentication templates can't have a header." });
    const b = t.buttons || [];
    if (b.length > 10) e.push({ field: "buttons", msg: "At most 10 buttons." });
    if (b.filter(x => x.type === "URL").length > 2) e.push({ field: "buttons", msg: "At most 2 URL buttons." });
    if (b.filter(x => x.type === "PHONE_NUMBER").length > 1) e.push({ field: "buttons", msg: "At most 1 phone button." });
    b.forEach((x, i) => {
      if (!x.text || !x.text.trim()) e.push({ field: "buttons", msg: `Button ${i + 1} needs a label.` });
      if (x.text && x.text.length > 25) e.push({ field: "buttons", msg: `Button ${i + 1}: label ≤ 25 characters.` });
      if (x.type === "URL" && !/^https?:\/\/\S+/.test(x.url || "")) e.push({ field: "buttons", msg: `Button ${i + 1}: URL must start with http(s)://.` });
      if (x.type === "URL" && /\{\{1\}\}/.test(x.url || "") && !(x.sample || "").trim()) e.push({ field: "buttons", msg: `Button ${i + 1}: dynamic URL needs a sample value.` });
      if (x.type === "PHONE_NUMBER" && !/^\+?\d[\d\s-]{6,}$/.test(x.phone || "")) e.push({ field: "buttons", msg: `Button ${i + 1}: enter a phone number with country code.` });
    });
    // grouping rule: quick replies must be contiguous
    const types = b.map(x => x.type === "QUICK_REPLY" ? "Q" : "A").join("");
    if (/A+Q+A+|Q+A+Q+/.test(types)) e.push({ field: "buttons", msg: "Quick-reply buttons must be grouped together, not mixed with URL/phone buttons." });
    if (t.category === "MARKETING" && !/\b(stop|unsubscribe|opt.?out)\b/i.test(body + " " + t.footer + " " + b.map(x => x.text).join(" "))) e.push({ field: "footer", msg: "Recommended: give an opt-out (e.g. “Reply STOP to opt out”) — marketing templates without one get lower quality ratings.", warn: true });
    return e;
  }

  /* Meta review simulator. Deterministic on content so demos are repeatable. */
  function review(t) {
    const body = t.category === "AUTHENTICATION" ? AUTH_BODY(t) : (t.body || "");
    const all = body + " " + (t.header.text || "") + " " + (t.footer || "");
    if (/\b(gambling|casino|crypto|lottery|weapons?|adult)\b/i.test(all)) return { status: "REJECTED", reason: "POLICY_VIOLATION: content in a restricted category (see WhatsApp Commerce Policy)." };
    if (/https?:\/\/(bit\.ly|tinyurl|t\.co)/i.test(all)) return { status: "REJECTED", reason: "INVALID_FORMAT: shortened URLs aren't allowed in templates — use your full domain." };
    if (t.category !== "AUTHENTICATION" && variables(body).length >= 3 && body.replace(/\{\{\d+\}\}/g, "").trim().length < 40) return { status: "REJECTED", reason: "TAG_CONTENT_MISMATCH: too many variables for too little fixed content — the meaning of the message isn't clear from the template." };
    if (/\b(hi|hello|hey)\b\s*\{\{1\}\}\s*$/i.test(body.trim())) return { status: "REJECTED", reason: "INVALID_FORMAT: body is only a greeting and a variable." };
    if (t.category === "UTILITY" && PROMO_WORDS.test(all)) return { status: "APPROVED", categoryChangedTo: "MARKETING", reason: "Meta reclassified this template as MARKETING because it contains promotional content. It will be billed at the marketing rate." };
    if (t.category === "AUTHENTICATION" && t.body && t.body.trim() && t.body !== AUTH_BODY(t)) return { status: "REJECTED", reason: "INVALID_FORMAT: authentication templates use Meta's fixed body text." };
    return { status: "APPROVED" };
  }
  function renderPreviewText(t, useSamples) {
    let body = t.category === "AUTHENTICATION" ? AUTH_BODY(t) : (t.body || "");
    if (useSamples) body = body.replace(/\{\{(\d+)\}\}/g, (_, n) => t.samples[n - 1] || `{{${n}}}`);
    const footer = t.category === "AUTHENTICATION" ? AUTH_FOOTER(t) : (t.footer || "");
    return { header: t.header, body, footer, buttons: t.category === "AUTHENTICATION" ? [{ type: "OTP", text: t.auth.otpType === "ONE_TAP" ? "Autofill" : "Copy code" }] : (t.buttons || []) };
  }

  /* Rejection → what to do about it. The platform should never show a Meta error code without a fix. */
  function fixFor(reason) {
    if (!reason) return "";
    if (/TAG_CONTENT_MISMATCH/.test(reason)) return "Add more fixed wording so the message makes sense on its own, or reduce variables.";
    if (/shortened URLs/.test(reason)) return "Replace the short link with a full https://yourdomain.com/… link.";
    if (/greeting/.test(reason)) return "Say what the message is about — e.g. “Hi {{1}}, your order {{2}} has shipped.”";
    if (/POLICY/.test(reason)) return "This content can't be sent on WhatsApp. Remove the restricted terms.";
    if (/fixed body/.test(reason)) return "Leave the body empty for authentication templates — Meta fills it.";
    if (/reclassified/.test(reason)) return "Either accept the marketing rate, or remove the promotional words and resubmit as utility.";
    return "Edit the template and resubmit.";
  }

  /* Starter templates by industry — real components, not just a body. */
  function starter(industry, company) {
    const c = company || "your store";
    const base = { language: "en", samples: [], buttons: [] };
    if (industry === "retail") return Object.assign(emptyTemplate(), base, { name: "new_arrivals", category: "MARKETING", header: { type: "image", text: "", sample: "new-arrivals.jpg" }, body: `Hi {{1}}! New arrivals just landed at ${c}. Reply YES to see this week's picks.`, samples: ["Priya"], footer: "Reply STOP to opt out.", buttons: [{ type: "QUICK_REPLY", text: "Show me" }, { type: "QUICK_REPLY", text: "Not now" }] });
    if (industry === "food")   return Object.assign(emptyTemplate(), base, { name: "weekend_offer", category: "MARKETING", header: { type: "text", text: "This weekend at {{1}}", sample: c }, body: `Hi {{1}}! 20% off on orders above ₹499 this weekend at ${c}. Show this message to redeem.`, samples: ["Priya"], footer: "Reply STOP to opt out.", buttons: [{ type: "URL", text: "Order now", url: "https://example.com/menu" }] });
    return Object.assign(emptyTemplate(), base, { name: "order_update", category: "UTILITY", header: { type: "none", text: "", sample: "" }, body: `Hi {{1}}, your order #{{2}} from ${c} has been shipped and will arrive by {{3}}. Reply to this message if you need help.`, samples: ["Priya", "48213", "Tuesday"], footer: "", buttons: [{ type: "URL", text: "Track order", url: "https://example.com/track/{{1}}", sample: "48213" }] });
  }
  const OTP_STARTER = () => Object.assign(emptyTemplate(), { name: "login_otp", category: "AUTHENTICATION", language: "en", auth: { addSecurity: true, expiryMinutes: 10, otpType: "COPY_CODE" } });

  return { TIERS, LANGUAGES, CATEGORIES, ES_STEPS, emptySignup, validateDisplayName, newNumber, newWaba, summarizeMeta, tierFor, emptyTemplate, validateTemplate, review, renderPreviewText, fixFor, starter, OTP_STARTER, variables, AUTH_BODY, AUTH_FOOTER };
})();
