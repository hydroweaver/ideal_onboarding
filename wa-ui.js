/* wa-ui.js — WhatsApp screens: Embedded Signup (as Meta actually sequences it), Numbers & WABA
   management, and the template builder. Installed into App by app.js. */
window.WAUI = (function () {
  let H; // helpers handed over by app.js: S(), esc, wizardShell, foot, appShell, save, render, nav, go, afterStep, submitTemplate, pillFor, toast
  const S = () => H.S();
  const esc = s => H.esc(s);
  const pill = (cls, txt) => `<span class="pill ${cls}"><span class="dot"></span>${txt}</span>`;

  /* ======================= EMBEDDED SIGNUP ======================= */
  function metaFrame(stepIdx, inner, opts = {}) {
    const total = WA.ES_STEPS.filter(s => s.meta).length; const st = WA.ES_STEPS[stepIdx];
    const n = WA.ES_STEPS.slice(0, stepIdx + 1).filter(s => s.meta).length;
    return `<div class="meta-sim es">
      <div class="es-bar"><span class="fb">f</span><span>Meta · Embedded Signup for <strong>Relay</strong></span><span class="muted small" style="margin-left:auto">${st.meta ? `Step ${n} of ${total}` : ""}</span></div>
      <div class="es-body"><h3>${st.title}</h3>${inner}</div>
      <div class="es-foot">${opts.back !== false ? `<button class="btn ghost sm" data-action="esBack">← Back</button>` : "<span></span>"}<span class="muted small">Simulated — in production this runs inside Meta's popup</span>${opts.next ? `<button class="btn primary" data-action="${opts.next.action || "esNext"}" ${opts.next.disabled ? "disabled" : ""}>${opts.next.label}</button>` : ""}</div>
    </div>`;
  }
  const SOURCES = [
    ["new", "A new number", "Not on WhatsApp or WhatsApp Business. Landline or mobile; it just needs to receive an SMS or call."],
    ["migrate", "Migrate from another provider", "Already on the WhatsApp API elsewhere (Twilio, Gupshup, Interakt…). Turn off two-step verification there first. Templates and quality rating come with you; chat history doesn't."],
    ["coexist", "Keep using the WhatsApp Business app too", "Coexistence: connect the number you use in the app, keep the app, and also send from Relay. Requires the current app version and a QR scan."],
  ];

  function screenNumber() {
    const s = S(); const sg = s.signup; const c = s.meta.checklist; const ready = c.notOnWa && c.bm && c.doc;
    let body, footer;
    switch (WA.ES_STEPS[sg.step].id) {
      case "preflight": {
        const items = [
          ["notOnWa", "A phone number to connect", "New, migrating from another provider, or the one in your WhatsApp Business app — pick below."],
          ["bm", "A Facebook login that's an admin of your business", "If you have no Business Portfolio yet, Meta creates one during signup."],
          ["doc", "One legal document, for later", "GST, MSME or Certificate of Incorporation. Not needed to connect — needed to lift the 250-conversations/day limit."],
        ].map(([k, t, d]) => `<button type="button" class="check ${c[k] ? "on" : ""}" data-action="checkItem" data-key="${k}"><span class="box"></span><span><div class="t">${t}</div><div class="d">${d}</div></span></button>`).join("");
        const src = SOURCES.map(([k, t, d]) => `<button type="button" class="choice ${sg.phone.source === k ? "on" : ""}" data-action="esSource" data-v="${k}"><span class="row between"><span class="ttl">${t}</span><span class="tick"></span></span><span class="sub">${d}</span></button>`).join("");
        body = `<div class="check-list">${items}</div><div class="eyebrow" style="margin:18px 0 8px">Which number?</div><div class="stack" style="gap:8px">${src}</div>`;
        footer = H.foot(true, ready ? `<button class="btn primary" data-action="esStart">Start Embedded Signup</button>` : `<button class="btn primary" data-action="remindNumber">Keep using sandbox for now</button>`, ready ? { label: "Not now — keep using sandbox", action: "remindNumber" } : null);
        break;
      }
      case "fb":
        body = metaFrame(sg.step, `<p class="small">Log in with the Facebook account that manages your business. Meta uses it to create or find your Business Portfolio.</p>
          <button class="btn primary block" data-action="esFb" style="background:#1877f2;margin-top:12px">Continue as ${esc(H.firstName())}</button>
          <p class="hint" style="margin-top:8px">Relay never sees your Facebook password. It receives a token scoped to WhatsApp assets only.</p>`, { next: null, back: true });
        break;
      case "portfolio": {
        const p = sg.portfolio;
        body = metaFrame(sg.step, `<p class="small">A Business Portfolio (formerly Business Manager) owns your WhatsApp account, ad accounts and pages.</p>
          <div class="seg-toggle" style="margin:10px 0"><button data-action="esPortfolioMode" data-v="create" class="${p.mode === "create" ? "on" : ""}">Create new</button><button data-action="esPortfolioMode" data-v="existing" class="${p.mode === "existing" ? "on" : ""}">Use existing</button></div>
          ${p.mode === "create" ? `<div class="form-grid">
            <div class="field"><label>Legal business name</label><input type="text" data-es="portfolio.name" value="${esc(p.name || s.profile.company)}"></div>
            <div class="field"><label>Website</label><input type="text" data-es="portfolio.website" value="${esc(p.website || s.profile.website)}"></div>
            <div class="field"><label>Country</label><select data-es="portfolio.country">${["IN", "US", "GB", "AE", "SG"].map(x => `<option ${p.country === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
            <div class="field"><label>Business address</label><input type="text" data-es="portfolio.address" value="${esc(p.address)}" placeholder="Street, city, PIN"></div></div>`
          : `<div class="field"><label>Portfolio</label><select data-es="portfolio.name"><option>${esc(s.profile.company || "My business")} (biz_20481…)</option></select></div>`}`, { next: { label: "Next", disabled: !(p.name || s.profile.company) } });
        break;
      }
      case "waba": {
        const w = sg.waba;
        body = metaFrame(sg.step, `<p class="small">The WhatsApp Business Account (WABA) holds your phone numbers, templates and messaging limits.</p>
          <div class="seg-toggle" style="margin:10px 0"><button data-action="esWabaMode" data-v="create" class="${w.mode === "create" ? "on" : ""}">Create new WABA</button><button data-action="esWabaMode" data-v="existing" class="${w.mode === "existing" ? "on" : ""}">Use existing</button></div>
          <div class="form-grid">
            <div class="field"><label>WABA name</label><input type="text" data-es="waba.name" value="${esc(w.name || s.profile.company)}"></div>
            <div class="field"><label>Time zone</label><select data-es="waba.timezone">${["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York"].map(x => `<option ${w.timezone === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
            <div class="field full"><label>Business category</label><select data-es="waba.category">${["Retail", "Food & grocery", "Education", "Finance", "Health", "Travel", "Professional services", "Other"].map(x => `<option ${w.category === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
          </div>`, { next: { label: "Next", disabled: !(w.name || s.profile.company) } });
        break;
      }
      case "phone": {
        const p = sg.phone; const srcNote = { new: "", migrate: `<div class="callout guide">Before continuing: in your current provider's dashboard, <strong>turn off two-step verification</strong> for this number. Meta can't migrate a number with 2FA on.</div>`, coexist: `<div class="callout guide">On your phone: WhatsApp Business app → Settings → Business tools → <strong>Connect to a platform</strong> → scan the QR Meta shows next. Chats stay in the app; Relay gets a copy of the last 6 months.</div>` }[p.source];
        body = metaFrame(sg.step, `${srcNote}<div class="form-grid" style="margin-top:10px">
            <div class="field"><label>Phone number (with country code)</label><input type="tel" data-es="phone.number" value="${esc(p.number)}" placeholder="+91 98765 43210"></div>
            <div class="field"><label>Verify by</label><select data-es="phone.method"><option value="sms" ${p.method === "sms" ? "selected" : ""}>SMS</option><option value="voice" ${p.method === "voice" ? "selected" : ""}>Voice call</option></select></div></div>
          <p class="hint" style="margin-top:8px">${p.source === "new" ? "If this number is currently in the WhatsApp or WhatsApp Business app, delete the account in the app first (Settings → Account → Delete). Otherwise Meta will refuse it." : ""}</p>`, { next: { label: p.method === "sms" ? "Send code by SMS" : "Call me with the code", action: "esSendOtp", disabled: !/^\+?\d[\d\s-]{8,}\d$/.test(p.number) } });
        break;
      }
      case "otp":
        body = metaFrame(sg.step, `<p class="small">We ${sg.phone.method === "sms" ? "sent a 6-digit code by SMS to" : "are calling"} <strong>${esc(sg.phone.number)}</strong>.</p>
          <div class="field" style="margin-top:10px"><label>6-digit code</label><input type="text" data-es="otp.code" inputmode="numeric" maxlength="6" placeholder="••••••" value="${esc(sg.otp.code || "")}" style="font-family:var(--font-mono);letter-spacing:.3em;font-size:18px"></div>
          <div class="row" style="margin-top:8px"><button class="btn link sm" data-action="esSendOtp">Resend code</button><span class="hint">Prototype: any 6 digits work.</span></div>`, { next: { label: "Verify", action: "esVerifyOtp", disabled: !/^\d{6}$/.test(sg.otp.code || "") } });
        break;
      case "name": {
        const v = WA.validateDisplayName(sg.displayName, sg.portfolio.name || s.profile.company);
        body = metaFrame(sg.step, `<p class="small">The name customers see at the top of the chat. Meta reviews it after signup — a name that breaks the rules gets rejected and you'll have to change it.</p>
          <div class="field" style="margin-top:10px"><label>Display name</label><input type="text" data-es="displayName" value="${esc(sg.displayName)}" placeholder="${esc(s.profile.company || "Your business")}"></div>
          ${sg.displayName ? (v.ok ? `<div class="callout ok" style="margin-top:8px">Looks good. Meta will still review it against your website and documents.</div>` : `<div class="callout guide" style="margin-top:8px"><strong>Fix before continuing:</strong><ul style="margin:6px 0 0;padding-left:18px">${v.errs.map(e => `<li>${e}</li>`).join("")}</ul></div>`) : ""}
          <details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">Display name rules</summary><ul class="small muted" style="padding-left:18px;margin:6px 0 0"><li>Must reflect your business name (as on your website / documents)</li><li>No all-caps, no “WhatsApp/Meta/Facebook”, no “official/verified/best”</li><li>No emoji or special characters; at least 3 letters</li><li>Generic words (“Support”, “Test”) are rejected</li></ul></details>`, { next: { label: "Next", disabled: !v.ok } });
        break;
      }
      case "pin":
        body = metaFrame(sg.step, `<p class="small">Two-step verification locks this number to your account. You'll need the PIN to migrate the number in future, and it stops anyone else registering it.</p>
          <div class="field" style="margin-top:10px"><label>6-digit PIN</label><input type="text" data-es="pin" inputmode="numeric" maxlength="6" placeholder="••••••" value="${esc(sg.pin)}" style="font-family:var(--font-mono);letter-spacing:.3em;font-size:18px"></div>
          <p class="hint" style="margin-top:8px">Store it somewhere safe. Relay can't recover it; Meta's recovery takes 7 days.</p>`, { next: { label: "Next", disabled: !/^\d{6}$/.test(sg.pin) } });
        break;
      case "permit":
        body = metaFrame(sg.step, `<p class="small">Relay is asking for permission to manage WhatsApp on your behalf.</p>
          <div class="check-list" style="margin-top:10px">${[["Manage your WhatsApp Business Account", "whatsapp_business_management — create templates, read quality and limits"], ["Send and receive messages", "whatsapp_business_messaging — via your phone number"], ["Read your business portfolio", "business_management — to link the WABA to your business"]].map(([t, d]) => `<div class="check on"><span class="box"></span><span><div class="t">${t}</div><div class="d mono" style="font-size:11px">${d}</div></span></div>`).join("")}</div>
          <p class="hint" style="margin-top:8px">You can revoke this any time from Business Settings → Integrations → Connected apps.</p>`, { next: { label: "Finish", action: "esFinish" } });
        break;
      case "done": {
        const r = sg.result || {}; const w = s.waba; const n = s.numbers.find(x => x.id === r.phone_number_id) || s.numbers[0];
        body = `<div class="callout ok"><strong>${esc(n ? n.phone : "")}</strong> is connected to Relay.</div>
          <div class="eyebrow" style="margin:16px 0 8px">What just happened</div>
          <div class="summary">
            ${["Meta returned <code>waba_id</code> and <code>phone_number_id</code> to Relay", "Relay registered the number with your PIN (<code>/register</code>)", "Relay subscribed to webhooks for messages and status updates", "Display name <strong>sent to Meta for review</strong> — usually a few hours", w && w.businessVerification !== "verified" ? "Business <strong>unverified</strong> → you can start <strong>250</strong> customer conversations per day until it's verified" : "Business verified → 1,000 conversations/day to start"].map((t, i) => `<div class="li ${i < 3 ? "ok" : "no"}"><span class="st">${i < 3 ? "✓" : "…"}</span><span>${t}</span></div>`).join("")}
          </div>
          <details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">Callback payload</summary><pre class="callout mono" style="white-space:pre-wrap;margin-top:6px">${esc(JSON.stringify(r, null, 2))}</pre></details>`;
        footer = H.foot(false, `<button class="btn primary" data-action="esContinue">Continue</button>`, { label: "Open Numbers & WABA", action: "openNumbers" });
        break;
      }
    }
    if (!footer) footer = H.foot(false, "", null);
    return H.wizardShell(`
      <div class="head"><h1>${sg.step === 0 ? "Connect your own number" : "Connecting your number"}</h1><p>${sg.step === 0 ? "The sandbox is for you. Real customers need messages from <em>your</em> number, on a WhatsApp Business Account Meta approves. About 5 minutes." : "Meta's flow, step by step. Nothing here is skippable, so we explain each one."}</p></div>
      ${body}${footer}`, { optional: true });
  }

  const esActions = {
    esSource(d) { S().signup.phone.source = d.v; H.save(); H.render(); },
    esStart() { const sg = S().signup; sg.step = 1; H.save(); H.render(); },
    esBack() { const sg = S().signup; if (sg.step > 0) sg.step--; H.save(); H.render(); scrollTo(0, 0); },
    esNext() { const sg = S().signup; sg.step = Math.min(sg.step + 1, WA.ES_STEPS.length - 1); H.save(); H.render(); scrollTo(0, 0); },
    esFb() { const sg = S().signup; sg.fb = { name: H.firstName(), at: Date.now() }; esActions.esNext(); },
    esPortfolioMode(d) { S().signup.portfolio.mode = d.v; H.save(); H.render(); },
    esWabaMode(d) { S().signup.waba.mode = d.v; H.save(); H.render(); },
    esSendOtp() { const sg = S().signup; sg.otp.sent = true; sg.otp.code = ""; if (WA.ES_STEPS[sg.step].id === "phone") sg.step++; H.save(); H.render(); H.toast(`Code ${sg.phone.method === "sms" ? "sent to" : "call placed to"} ${sg.phone.number}`); },
    esVerifyOtp() { const sg = S().signup; sg.otp.verified = true; esActions.esNext(); },
    esFinish() {
      const s = S(); const sg = s.signup;
      sg.portfolio.name = sg.portfolio.name || s.profile.company; sg.waba.name = sg.waba.name || s.profile.company;
      if (!s.waba) s.waba = WA.newWaba(sg);
      const n = WA.newNumber(sg); s.numbers.push(n);
      sg.result = { waba_id: s.waba.id, phone_number_id: n.id, business_id: s.waba.businessId, event: "FINISH", version: 3 };
      sg.permissions = true; sg.step = WA.ES_STEPS.length - 1; s.meta.remind = false;
      H.save(); H.render(); scrollTo(0, 0);
      // Display-name review, simulated: deterministic on the name.
      setTimeout(() => { const x = S().numbers.find(y => y.id === n.id); if (!x || x.displayNameStatus !== "pending") return; const bad = /support|help desk|team$/i.test(x.displayName); x.displayNameStatus = bad ? "rejected" : "approved"; x.displayNameReason = bad ? "Name doesn't reflect the business name on your website. Generic terms like “Support” aren't allowed on their own." : null; H.save(); H.render(); }, S().demo.fast ? 12000 : 120000);
    },
    esContinue() { const s = S(); s.signup = Object.assign(WA.emptySignup(), { step: 0, phone: { source: "new", number: "", method: "sms" } }); H.save(); H.go(s.screen === "number" && s.jtbd.length && s.page === "home" && s.numbers.length > 1 ? "app" : "billing"); if (S().screen === "app") H.nav("numbers"); },
    openNumbers() { const s = S(); s.signup = WA.emptySignup(); s.screen = "app"; H.save(); H.nav("numbers"); },
    checkItem(d) { const c = S().meta.checklist; c[d.key] = !c[d.key]; H.save(); H.render(); },
    // Quick connect used by the assistant / demo controls: runs the whole signup with sensible values.
    quickConnect({ number, displayName }) {
      const s = S(); const sg = Object.assign(WA.emptySignup(), { step: 8, fb: { name: H.firstName() }, phone: { source: "new", number: number || "+91 98765 43210", method: "sms" }, otp: { sent: true, verified: true }, displayName: displayName || s.profile.company || "Relay Store", pin: "000000", permissions: true });
      sg.portfolio.name = s.profile.company; sg.portfolio.website = s.profile.website; sg.waba.name = s.profile.company;
      s.signup = sg; esActions.esFinish(); s.signup = WA.emptySignup(); H.save();
      return s.numbers[s.numbers.length - 1];
    },
  };
  // Field binding for the signup form: data-es="a.b" writes S.signup.a.b
  document.addEventListener("input", e => { const el = e.target.closest("[data-es]"); if (!el) return; setPath(S().signup, el.dataset.es, el.value); H.save(); if (/displayName|otp.code|pin|phone.number|portfolio.name|waba.name/.test(el.dataset.es)) refreshSoft(); });
  document.addEventListener("change", e => { const el = e.target.closest("select[data-es]"); if (!el) return; setPath(S().signup, el.dataset.es, el.value); H.save(); H.render(); });
  function setPath(o, p, v) { const ks = p.split("."); for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] || {}; o[ks[ks.length - 1]] = v; }
  function refreshSoft() {
    // Re-render without losing focus: swap only the validation callout + next button state.
    const active = document.activeElement; const key = active && active.dataset && active.dataset.es; const pos = active && active.selectionStart;
    H.render();
    if (key) { const el = document.querySelector(`[data-es="${key}"]`); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(pos, pos); } catch {} } }
  }

  /* ======================= NUMBERS & WABA ======================= */
  function pageNumbers() {
    const s = S(); const w = s.waba;
    if (!w || !s.numbers.length) return H.appShell(`
      <div class="ph"><div><h1>Numbers & WABA</h1><p>Your WhatsApp Business Account, phone numbers, limits and quality.</p></div></div>
      <div class="panel empty"><div class="big">📱</div><h3>Only the sandbox so far</h3><p>The sandbox number can message people who joined it. To reach real customers you need your own number on a WhatsApp Business Account that Meta has approved. It takes about 5 minutes.</p><button class="btn primary" data-action="openNumber">Connect your number</button></div>
      ${limitsPanel(null)}`);
    const bv = w.businessVerification;
    const bvPill = { unverified: pill("", "Not verified"), pending: pill("warn", "Under review"), verified: pill("ok", "Verified"), rejected: pill("bad", "Rejected") }[bv];
    const verifyBlock = bv === "unverified" || bv === "rejected" ? (s.ui.verifyOpen ? `
        <form data-form="verifyBusiness" class="form-grid" style="margin-top:10px">
          <div class="field"><label>Legal business name</label><input type="text" name="legal" value="${esc(w.businessName || s.profile.company)}" required></div>
          <div class="field"><label>Document</label><select name="doc"><option>GST certificate</option><option>MSME / Udyam certificate</option><option>Certificate of Incorporation</option><option>Shop & Establishment licence</option></select></div>
          <div class="field full"><label>Upload</label><input type="text" name="file" placeholder="gst-certificate.pdf (prototype: any name)" required></div>
          <div class="full row"><button class="btn primary" type="submit">Submit to Meta</button><button type="button" class="btn ghost" data-action="toggleVerify">Cancel</button><span class="hint">Meta reviews in 1–3 business days. The name must match your website and document exactly.</span></div>
        </form>` : `<div class="row" style="margin-top:10px"><button class="btn primary sm" data-action="toggleVerify">Start business verification</button><span class="hint">Lifts the 250/day limit to 1,000 and unlocks the green tick request.</span></div>${bv === "rejected" ? `<div class="callout guide" style="margin-top:8px">Rejected: ${esc(w.verificationReason || "document didn't match the business name")}. Fix and resubmit.</div>` : ""}`)
      : bv === "pending" ? `<div class="callout" style="margin-top:10px">Meta is reviewing <strong>${esc(w.verificationDoc)}</strong>. Meanwhile you can message up to 250 customers/day and everything else works. <button class="btn ghost sm" data-action="demoVerify">Prototype: approve</button></div>` : "";
    const numbers = s.numbers.map(n => numberCard(n)).join("");
    return H.appShell(`
      <div class="ph"><div><h1>Numbers & WABA</h1><p>${s.numbers.length} number${s.numbers.length > 1 ? "s" : ""} on <strong>${esc(w.name)}</strong>.</p></div><div class="row">${H.tourBtn()}<button class="btn secondary" data-action="addNumber">Add a number</button><button class="btn secondary" data-action="migrateNumber">Migrate a number</button></div></div>
      <div class="panel" data-tour="waba"><div class="row between"><h3 style="margin:0">WhatsApp Business Account</h3><span class="mono muted small">${esc(w.id)}</span></div>
        <dl class="kv" style="margin-top:12px">
          <dt>Business</dt><dd>${esc(w.businessName)} <span class="mono muted small">${esc(w.businessId)}</span></dd>
          <dt>Business verification</dt><dd data-tour="verify">${bvPill}${verifyBlock}</dd>
          <dt>Account review</dt><dd>${w.accountReview === "approved" ? pill("ok", "Approved") : pill("warn", w.accountReview)}</dd>
          <dt>Official account</dt><dd>${w.oba ? pill("ok", "Green tick") : w.obaRequested ? pill("warn", "Requested") : `<span class="muted small">Not requested.</span> <button class="btn link sm" data-action="requestOba" ${bv === "verified" ? "" : "disabled"}>Request green tick</button>${bv !== "verified" ? `<span class="hint"> — needs business verification first</span>` : ""}`}</dd>
          <dt>Billing</dt><dd>${esc(w.paymentMethod)} <span class="hint">— conversations are charged to your Relay credits; no card on Meta</span></dd>
        </dl></div>
      ${limitsPanel(s.numbers[0])}
      <div class="stack" style="margin-top:16px">${numbers}</div>`);
  }
  function limitsPanel(n) {
    const s = S(); const idx = n ? WA.tierFor(s, n) : 0;
    return `<div class="panel" data-tour="limits"><h3>Messaging limit</h3><p class="small muted" style="margin-bottom:10px">How many <em>customers</em> you can start conversations with in a rolling 24 hours. Replies to customers who message you first don't count.</p>
      <div class="tiers">${WA.TIERS.map((t, i) => `<div class="tier ${i === idx ? "cur" : i < idx ? "done" : ""}"><div class="tl">${t.label}</div><div class="tn">${i === idx ? t.note : ""}</div></div>`).join("")}</div>
      ${!n ? `<p class="hint" style="margin-top:8px">You start at 250/day after connecting; business verification moves you to 1K; quality + volume moves you up from there.</p>` : ""}</div>`;
  }
  function numberCard(n) {
    const s = S(); const idx = WA.tierFor(s, n);
    const dn = { pending: pill("warn", "Name under review"), approved: pill("ok", "Name approved"), rejected: pill("bad", "Name rejected") }[n.displayNameStatus];
    const q = { unknown: pill("", "Quality: not rated yet"), green: pill("ok", "Quality: high"), yellow: pill("warn", "Quality: medium"), red: pill("bad", "Quality: low") }[n.quality];
    const st = { connected: pill("ok", "Connected"), pending: pill("warn", "Pending"), flagged: pill("warn", "Flagged"), restricted: pill("bad", "Restricted") }[n.status];
    const rename = n.displayNameStatus === "rejected" || s.ui.renameId === n.id ? `<form data-form="rename" class="row" style="margin-top:8px"><input type="hidden" name="id" value="${n.id}"><input type="text" name="name" value="${esc(n.displayName)}" placeholder="New display name"><button class="btn primary sm" type="submit">Submit new name</button></form>${n.displayNameReason ? `<div class="callout guide" style="margin-top:6px"><strong>Why:</strong> ${esc(n.displayNameReason)}</div>` : ""}` : "";
    const profile = s.ui.profileId === n.id ? `<form data-form="profile" class="form-grid" style="margin-top:10px"><input type="hidden" name="id" value="${n.id}">
        <div class="field"><label>About (short status)</label><input type="text" name="about" value="${esc(n.profile.about)}" placeholder="e.g. Open 10–7, Mon–Sat" maxlength="139"></div>
        <div class="field"><label>Industry</label><select name="vertical">${["Retail", "Food & grocery", "Education", "Finance", "Health", "Travel", "Professional services", "Other"].map(x => `<option ${n.profile.vertical === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="field full"><label>Description</label><textarea name="description" rows="2" maxlength="512">${esc(n.profile.description)}</textarea></div>
        <div class="field"><label>Address</label><input type="text" name="address" value="${esc(n.profile.address)}"></div>
        <div class="field"><label>Email</label><input type="email" name="email" value="${esc(n.profile.email)}"></div>
        <div class="field"><label>Website</label><input type="text" name="website" value="${esc(n.profile.website)}"></div>
        <div class="field"><label>Logo</label><button type="button" class="btn secondary sm" data-action="setLogo" data-id="${n.id}">${n.profile.logo ? "Logo uploaded ✓" : "Upload logo (640×640)"}</button></div>
        <div class="full row"><button class="btn primary sm" type="submit">Save profile</button><button type="button" class="btn ghost sm" data-action="editProfile" data-id="">Cancel</button></div></form>` : "";
    return `<div class="panel numcard" data-tour="number">
      <div class="row between wrap"><div><div class="row"><strong class="mono" style="font-size:16px">${esc(n.phone)}</strong>${st}</div><div class="small muted">Display name: <strong>${esc(n.displayName)}</strong> · ${n.source === "migrate" ? "migrated" : n.source === "coexist" ? "coexistence with app" : "new number"}</div></div><div class="row wrap">${dn}${q}${pill("accent", `Limit: ${WA.TIERS[idx].label}`)}</div></div>
      ${rename}
      <div class="row wrap small" style="margin-top:12px;gap:14px">
        <span>${n.twoStepPin ? "🔒 Two-step PIN set" : "⚠️ No two-step PIN"} <button class="btn link sm" data-action="setPin" data-id="${n.id}">${n.twoStepPin ? "Change" : "Set PIN"}</button></span>
        <span>${n.webhooks ? "✓ Webhooks subscribed" : "✗ Webhooks off"}</span>
        <span>✓ Registered</span>
        <span class="muted">Sent today: ${n.sent24h} / ${WA.TIERS[idx].label.split(" ")[0]}</span>
        <span style="margin-left:auto" class="row"><button class="btn secondary sm" data-action="editProfile" data-id="${n.id}">Business profile</button>${n.displayNameStatus !== "rejected" ? `<button class="btn ghost sm" data-action="rename" data-id="${n.id}">Change name</button>` : ""}</span>
      </div>
      ${n.quality === "yellow" || n.quality === "red" ? `<div class="callout guide" style="margin-top:10px"><strong>Quality dropped.</strong> Customers are blocking or reporting your messages. Slow down marketing sends, make sure everyone opted in, and add an opt-out. If it stays low for 7 days Meta lowers your limit.</div>` : ""}
      ${profile}
    </div>`;
  }
  const numActions = {
    toggleVerify() { S().ui.verifyOpen = !S().ui.verifyOpen; H.save(); H.render(); },
    requestOba() { const w = S().waba; if (w) { w.obaRequested = true; H.save(); H.render(); H.toast("Green tick requested — Meta decides based on notability (press coverage, Wikipedia, etc.)"); } },
    addNumber() { const s = S(); s.signup = Object.assign(WA.emptySignup(), { step: 4, fb: { name: H.firstName() }, portfolio: { mode: "existing", name: s.waba.businessName }, waba: { mode: "existing", name: s.waba.name, timezone: "Asia/Kolkata", category: s.numbers[0].profile.vertical } }); s.screen = "number"; H.save(); H.render(); },
    migrateNumber() { numActions.addNumber(); S().signup.phone.source = "migrate"; H.save(); H.render(); },
    rename(d) { S().ui.renameId = d.id; H.save(); H.render(); },
    editProfile(d) { S().ui.profileId = d.id || null; H.save(); H.render(); },
    setLogo(d) { const n = S().numbers.find(x => x.id === d.id); if (n) { n.profile.logo = true; H.save(); H.render(); } },
    setPin(d) { const n = S().numbers.find(x => x.id === d.id); if (n) { n.twoStepPin = true; H.save(); H.render(); H.toast("Two-step PIN set"); } },
    demoVerify() { const w = S().waba; if (!w) return; w.businessVerification = "verified"; S().numbers.forEach(n => { n.tier = Math.max(n.tier, 1); }); H.save(); H.render(); },
    demoRejectName() { const n = S().numbers[0]; if (!n) return; n.displayNameStatus = "rejected"; n.displayNameReason = "Name doesn't match the business name on your website (“" + (S().profile.company || "your company") + "”)."; H.save(); H.render(); },
    demoQualityYellow() { const n = S().numbers[0]; if (!n) return; n.quality = "yellow"; H.save(); H.render(); },
    demoTierUp() { const n = S().numbers[0]; if (!n) return; n.tier = Math.min(n.tier + 1, WA.TIERS.length - 1); n.quality = "green"; H.save(); H.render(); },
  };
  const numForms = {
    verifyBusiness(f) { const w = S().waba; w.businessVerification = "pending"; w.businessName = f.legal.value.trim(); w.verificationDoc = f.doc.value + " · " + f.file.value.trim(); S().ui.verifyOpen = false; H.save(); H.afterStep("Verification submitted to Meta"); setTimeout(() => { const x = S().waba; if (x && x.businessVerification === "pending") { x.businessVerification = "verified"; S().numbers.forEach(n => n.tier = Math.max(n.tier, 1)); H.save(); H.render(); } }, S().demo.fast ? 15000 : 3 * 60000); },
    rename(f) { const n = S().numbers.find(x => x.id === f.id.value); if (!n) return; const v = WA.validateDisplayName(f.name.value, S().waba.businessName); if (!v.ok) { H.toast(v.errs[0]); return; } n.displayName = f.name.value.trim(); n.displayNameStatus = "pending"; n.displayNameReason = null; S().ui.renameId = null; H.save(); H.render(); H.toast("New name sent to Meta for review"); setTimeout(() => { if (n.displayNameStatus === "pending") { n.displayNameStatus = "approved"; H.save(); H.render(); } }, S().demo.fast ? 8000 : 60000); },
    profile(f) { const n = S().numbers.find(x => x.id === f.id.value); if (!n) return; ["about", "description", "address", "email", "website", "vertical"].forEach(k => n.profile[k] = f[k].value); S().ui.profileId = null; H.save(); H.render(); H.toast("Business profile updated"); },
  };

  /* ======================= TEMPLATE BUILDER ======================= */
  function pageTemplates() {
    const s = S(); const d = s.tplDraft;
    const starters = [["order", "Order update", "UTILITY"], ["promo", "Promotion", "MARKETING"], ["otp", "Login OTP", "AUTHENTICATION"], ["blank", "Blank", "—"]].map(([k, t, c]) => `<button class="choice" data-action="tplStart" data-v="${k}"><span class="ttl">${t}</span><span class="sub">${c}</span></button>`).join("");
    const list = s.templates.length ? `<div class="panel"><h3>Your templates</h3><div class="stack">${s.templates.map(tplRow).join("")}</div></div>` : "";
    return H.appShell(`
      <div class="ph"><div><h1>Templates</h1><p>Meta-approved messages you can send to start a conversation. Each language is its own template.</p></div><div class="row">${H.tourBtn()}${d ? "" : `<button class="btn primary" data-action="tplStart" data-v="order" data-tour="new">New template</button>`}</div></div>
      ${d ? builder(d) : `<div class="panel" data-tour="new"><h3>Start from</h3><div class="starter-grid" style="grid-template-columns:repeat(4,1fr)">${starters}</div></div>`}
      ${list}`);
  }
  function tplRow(t) {
    const st = { draft: pill("", "Draft"), pending: pill("warn", "Pending Meta review"), approved: pill("ok", "Approved"), rejected: pill("bad", "Rejected"), paused: pill("warn", "Paused") }[t.status] || pill("", t.status);
    const q = t.status === "approved" ? { unknown: "", green: pill("ok", "Quality high"), yellow: pill("warn", "Quality medium"), red: pill("bad", "Quality low") }[t.quality || "unknown"] : "";
    return `<div class="tplrow" data-tour="status">
      <div class="row between wrap"><div class="row"><strong class="mono">${esc(t.name)}</strong><span class="pill">${WA.LANGUAGES[t.language] || t.language}</span><span class="pill accent">${t.category}${t.categoryChangedFrom ? ` <span class="muted">(was ${t.categoryChangedFrom})</span>` : ""}</span></div><div class="row">${st}${q}</div></div>
      <div class="small muted" style="margin-top:4px">${esc((t.category === "AUTHENTICATION" ? WA.AUTH_BODY(t) : t.body || "").slice(0, 140))}${(t.body || "").length > 140 ? "…" : ""}</div>
      ${t.rejectionReason ? `<div class="callout ${t.status === "rejected" ? "guide" : ""}" style="margin-top:8px"><strong>${t.status === "rejected" ? "Rejected" : "Note from Meta"}:</strong> ${esc(t.rejectionReason)}<br><strong>Fix:</strong> ${esc(WA.fixFor(t.rejectionReason))}</div>` : ""}
      <div class="row wrap" style="margin-top:8px">
        ${t.status === "rejected" || t.status === "draft" ? `<button class="btn primary sm" data-action="tplEdit" data-name="${esc(t.name)}">Edit & resubmit</button>` : `<button class="btn secondary sm" data-action="tplEdit" data-name="${esc(t.name)}">Edit as new</button>`}
        <button class="btn ghost sm" data-action="tplDuplicate" data-name="${esc(t.name)}">Duplicate in another language</button>
        ${t.status === "pending" ? `<button class="btn ghost sm" data-action="tplReviewNow" data-name="${esc(t.name)}">Prototype: review now</button>` : ""}
        <button class="btn link sm" data-action="tplDelete" data-name="${esc(t.name)}">Delete</button>
      </div></div>`;
  }
  function builder(d) {
    const errs = WA.validateTemplate(d); const hard = errs.filter(e => !e.warn); const vars = d.category === "AUTHENTICATION" ? [] : WA.variables(d.body);
    const isAuth = d.category === "AUTHENTICATION";
    return `<div class="panel builder"><div class="row between"><h3 style="margin:0">${d.editingName ? `Editing ${esc(d.editingName)}` : "New template"}</h3><button class="btn ghost sm" data-action="tplCancel">Cancel</button></div>
      <div class="builder-grid">
        <form data-form="tplbuilder" class="stack" id="tplform">
          <div class="form-grid">
            <div class="field"><label>Name <span class="muted">— lowercase_with_underscores</span></label><input type="text" data-tpl="name" value="${esc(d.name)}" placeholder="order_update"></div>
            <div class="field"><label>Language</label><select data-tpl="language">${Object.entries(WA.LANGUAGES).map(([k, v]) => `<option value="${k}" ${d.language === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
            <div class="field full"><label>Category</label><div class="seg-toggle">${Object.entries(WA.CATEGORIES).map(([k, v]) => `<button type="button" data-action="tplCategory" data-v="${k}" class="${d.category === k ? "on" : ""}" title="${esc(v.note)}">${v.label} · ₹${v.price}</button>`).join("")}</div><p class="hint" style="margin-top:4px">${WA.CATEGORIES[d.category].note}</p></div>
          </div>
          ${isAuth ? `<div class="callout">Meta fixes the wording of authentication templates. You choose the options:</div>
            <div class="form-grid">
              <div class="field"><label>Code delivery</label><select data-tpl="auth.otpType"><option value="COPY_CODE" ${d.auth.otpType === "COPY_CODE" ? "selected" : ""}>Copy-code button</option><option value="ONE_TAP" ${d.auth.otpType === "ONE_TAP" ? "selected" : ""}>One-tap autofill (Android)</option></select></div>
              <div class="field"><label>Code expires in (minutes, ≤ 90)</label><input type="number" min="1" max="90" data-tpl="auth.expiryMinutes" value="${d.auth.expiryMinutes}"></div>
              <div class="field full"><label class="toggle ${d.auth.addSecurity ? "on" : ""}" data-action="tplToggleSecurity"><span class="sw"></span><span>Add “For your security, do not share this code.”</span></label></div>
            </div>`
          : `<div class="form-grid">
              <div class="field"><label>Header</label><select data-tpl="header.type">${[["none", "None"], ["text", "Text"], ["image", "Image"], ["video", "Video"], ["document", "Document (PDF)"]].map(([k, v]) => `<option value="${k}" ${d.header.type === k ? "selected" : ""}>${v}</option>`).join("")}</select></div>
              <div class="field">${d.header.type === "text" ? `<label>Header text <span class="muted">≤ 60, one {{1}} allowed</span></label><input type="text" data-tpl="header.text" value="${esc(d.header.text)}" maxlength="60">` : d.header.type !== "none" ? `<label>Sample ${d.header.type} for review</label><input type="text" data-tpl="header.sample" value="${esc(d.header.sample)}" placeholder="${d.header.type === "image" ? "banner.jpg" : d.header.type === "video" ? "intro.mp4" : "invoice.pdf"} (prototype: any name)">` : ""}</div>
              <div class="field full"><label>Body <span class="muted">≤ 1,024 · use {{1}}, {{2}}… for per-customer values</span></label><textarea data-tpl="body" rows="4">${esc(d.body)}</textarea></div>
              ${vars.length ? `<div class="field full"><label>Sample values <span class="muted">— Meta reviews the message with these filled in</span></label><div class="form-grid">${vars.map((n, i) => `<div class="field"><input type="text" data-tpl="samples.${i}" value="${esc(d.samples[i] || "")}" placeholder="Sample for {{${n}}}"></div>`).join("")}</div></div>` : ""}
              <div class="field full"><label>Footer <span class="muted">≤ 60 · good place for “Reply STOP to opt out”</span></label><input type="text" data-tpl="footer" value="${esc(d.footer)}" maxlength="60"></div>
            </div>
            <div><label>Buttons <span class="muted">— up to 10; quick replies grouped together</span></label>
              <div class="stack" style="gap:6px">${(d.buttons || []).map((b, i) => `<div class="row btnrow">
                <select data-tpl="buttons.${i}.type" style="width:150px">${[["QUICK_REPLY", "Quick reply"], ["URL", "Visit website"], ["PHONE_NUMBER", "Call"], ["COPY_CODE", "Copy offer code"]].map(([k, v]) => `<option value="${k}" ${b.type === k ? "selected" : ""}>${v}</option>`).join("")}</select>
                <input type="text" data-tpl="buttons.${i}.text" value="${esc(b.text || "")}" placeholder="Label ≤ 25" maxlength="25" style="width:160px">
                ${b.type === "URL" ? `<input type="text" data-tpl="buttons.${i}.url" value="${esc(b.url || "")}" placeholder="https://… (add {{1}} for a dynamic part)">` : b.type === "PHONE_NUMBER" ? `<input type="tel" data-tpl="buttons.${i}.phone" value="${esc(b.phone || "")}" placeholder="+91 …">` : b.type === "COPY_CODE" ? `<input type="text" data-tpl="buttons.${i}.sample" value="${esc(b.sample || "")}" placeholder="Sample code e.g. SAVE20">` : `<span class="grow"></span>`}
                ${b.type === "URL" && /\{\{1\}\}/.test(b.url || "") ? `<input type="text" data-tpl="buttons.${i}.sample" value="${esc(b.sample || "")}" placeholder="Sample for {{1}}" style="width:140px">` : ""}
                <button type="button" class="btn ghost sm" data-action="tplRemoveButton" data-i="${i}" aria-label="Remove">✕</button></div>`).join("")}</div>
              <button type="button" class="btn secondary sm" data-action="tplAddButton" style="margin-top:6px" ${(d.buttons || []).length >= 10 ? "disabled" : ""}>+ Add button</button></div>`}
          <div id="tpl-errors">${errorsBlock(errs)}</div>
          <div class="row"><button class="btn primary" type="submit" ${hard.length ? "disabled" : ""}>Submit to Meta</button><button type="button" class="btn secondary" data-action="tplSaveDraft">Save draft</button><span class="hint">${hard.length ? `${hard.length} thing${hard.length > 1 ? "s" : ""} to fix first` : "Review usually takes minutes to a few hours."}</span></div>
        </form>
        <div><div class="eyebrow" style="margin-bottom:8px">Preview</div><div id="tpl-preview">${preview(d)}</div><p class="hint" style="margin-top:8px">Shown with your sample values — exactly what Meta's reviewer sees.</p></div>
      </div></div>`;
  }
  function errorsBlock(errs) {
    if (!errs.length) return `<div class="callout ok">Passes Meta's format rules.</div>`;
    return `<div class="callout ${errs.some(e => !e.warn) ? "guide" : ""}"><ul style="margin:0;padding-left:18px">${errs.map(e => `<li>${e.warn ? "💡 " : ""}${esc(e.msg)}</li>`).join("")}</ul></div>`;
  }
  function preview(d) {
    const p = WA.renderPreviewText(d, true); const h = p.header;
    const head = h.type === "text" ? `<div style="font-weight:600;margin-bottom:4px">${esc(h.text.replace(/\{\{1\}\}/, h.sample || "{{1}}"))}</div>` : h.type === "image" ? `<div class="pv-media">🖼 ${esc(h.sample || "image")}</div>` : h.type === "video" ? `<div class="pv-media">🎬 ${esc(h.sample || "video")}</div>` : h.type === "document" ? `<div class="pv-media">📄 ${esc(h.sample || "document.pdf")}</div>` : "";
    const btns = (p.buttons || []).map(b => `<div class="pv-btn">${b.type === "URL" ? "🔗 " : b.type === "PHONE_NUMBER" ? "📞 " : b.type === "COPY_CODE" || b.type === "OTP" ? "⧉ " : ""}${esc(b.text || "Button")}</div>`).join("");
    return `<div class="phone" style="width:100%"><div class="screen" style="min-height:0"><div class="bar"><span class="av">R</span><div><div>${esc(S().numbers[0] ? S().numbers[0].displayName : S().profile.company || "Relay")}</div><div style="font-size:10px;opacity:.8">Business account</div></div></div>
      <div class="chat" style="padding:14px 10px 18px"><div class="bub" style="max-width:100%">${head}<div style="white-space:pre-wrap">${esc(p.body)}</div>${p.footer ? `<div style="font-size:11px;opacity:.6;margin-top:4px">${esc(p.footer)}</div>` : ""}<span class="tm">10:24</span></div>${btns ? `<div class="pv-btns">${btns}</div>` : ""}</div></div></div>`;
  }
  function refreshBuilder() {
    const d = S().tplDraft; if (!d) return;
    const pv = document.getElementById("tpl-preview"); if (pv) pv.innerHTML = preview(d);
    const errs = WA.validateTemplate(d); const eb = document.getElementById("tpl-errors"); if (eb) eb.innerHTML = errorsBlock(errs);
    const sub = document.querySelector("#tplform button[type=submit]"); if (sub) sub.disabled = errs.some(e => !e.warn);
  }
  const tplActions = {
    tplStart(d) { const s = S(); s.tplDraft = d.v === "otp" ? WA.OTP_STARTER() : d.v === "blank" ? WA.emptyTemplate() : d.v === "promo" ? WA.starter(s.profile.industry === "default" ? "retail" : s.profile.industry, s.profile.company) : WA.starter("default", s.profile.company); if (s.templates.some(t => t.name === s.tplDraft.name)) s.tplDraft.name += "_v2"; H.save(); H.render(); },
    tplEdit(d) { const s = S(); const t = s.templates.find(x => x.name === d.name); if (!t) return; s.tplDraft = Object.assign(WA.emptyTemplate(), JSON.parse(JSON.stringify(t)), { status: "draft", rejectionReason: null, editingName: t.status === "rejected" || t.status === "draft" ? t.name : null }); if (!s.tplDraft.editingName) s.tplDraft.name = t.name + "_v2"; H.save(); H.render(); scrollTo(0, 0); },
    tplDuplicate(d) { const s = S(); const t = s.templates.find(x => x.name === d.name); if (!t) return; s.tplDraft = Object.assign(WA.emptyTemplate(), JSON.parse(JSON.stringify(t)), { status: "draft", rejectionReason: null, editingName: null, language: t.language === "en" ? "hi" : "en", categoryChangedFrom: null }); H.save(); H.render(); H.toast("Translate the body, then submit — each language is reviewed separately"); },
    tplDelete(d) { const s = S(); s.templates = s.templates.filter(x => x.name !== d.name); H.save(); H.render(); },
    tplCancel() { S().tplDraft = null; H.save(); H.render(); },
    tplCategory(d) { const t = S().tplDraft; t.category = d.v; if (d.v === "AUTHENTICATION") { t.header = { type: "none", text: "", sample: "" }; t.buttons = []; } H.save(); H.render(); },
    tplToggleSecurity() { const t = S().tplDraft; t.auth.addSecurity = !t.auth.addSecurity; H.save(); H.render(); },
    tplAddButton() { const t = S().tplDraft; t.buttons = t.buttons || []; t.buttons.push({ type: t.buttons.length && t.buttons[t.buttons.length - 1].type === "QUICK_REPLY" ? "QUICK_REPLY" : "QUICK_REPLY", text: "" }); H.save(); H.render(); },
    tplRemoveButton(d) { const t = S().tplDraft; t.buttons.splice(+d.i, 1); H.save(); H.render(); },
    tplSaveDraft() { const s = S(); const t = s.tplDraft; if (!t.name) { H.toast("Give it a name first"); return; } const i = s.templates.findIndex(x => x.name === (t.editingName || t.name)); const saved = Object.assign({}, t, { status: "draft" }); delete saved.editingName; if (i >= 0) s.templates[i] = saved; else s.templates.push(saved); s.tplDraft = null; H.save(); H.render(); H.toast("Draft saved"); },
    tplReviewNow(d) { const t = S().templates.find(x => x.name === d.name); if (t) applyReview(t); },
  };
  const tplForms = {
    tplbuilder() { const s = S(); const t = s.tplDraft; const errs = WA.validateTemplate(t).filter(e => !e.warn); if (errs.length) { H.toast(errs[0].msg); return; } if (t.editingName) s.templates = s.templates.filter(x => x.name !== t.editingName); delete t.editingName; s.tplDraft = null; H.submitTemplate(t); },
  };
  function applyReview(t) {
    const r = WA.review(t); t.status = r.status.toLowerCase(); t.reviewedAt = Date.now(); t.rejectionReason = r.reason || null;
    if (r.categoryChangedTo) { t.categoryChangedFrom = t.category; t.category = r.categoryChangedTo; }
    if (t.status === "approved") t.quality = "green";
    H.save(); H.render();
  }
  // Builder field binding: data-tpl="a.b.c" → S.tplDraft.a.b.c, then refresh preview + errors only.
  document.addEventListener("input", e => { const el = e.target.closest("[data-tpl]"); if (!el || !S().tplDraft) return; setPath(S().tplDraft, el.dataset.tpl, el.type === "number" ? +el.value : el.value); H.save(); if (el.dataset.tpl === "body") { const before = document.querySelectorAll("[data-tpl^='samples.']").length; const now = WA.variables(el.value).length; if (before !== now) { const pos = el.selectionStart; H.render(); const b = document.querySelector("[data-tpl='body']"); if (b) { b.focus({ preventScroll: true }); try { b.setSelectionRange(pos, pos); } catch {} } return; } } refreshBuilder(); });
  document.addEventListener("change", e => { const el = e.target.closest("select[data-tpl]"); if (!el || !S().tplDraft) return; setPath(S().tplDraft, el.dataset.tpl, el.value); H.save(); H.render(); });

  /* ======================= INSTALL ======================= */
  function install(helpers) {
    H = helpers;
    H.screens.number = screenNumber;
    H.pages.templates = pageTemplates;
    H.pages.numbers = pageNumbers;
    Object.assign(H.act, esActions, numActions, tplActions);
    Object.assign(H.forms, numForms, tplForms);
  }
  return { install, applyReview, quickConnect: (o) => esActions.quickConnect(o), preview };
})();
