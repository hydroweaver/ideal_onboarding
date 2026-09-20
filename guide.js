/* guide.js — the in-app guidance engine (WalkMe-style, but calm).
   Four mechanisms: launcher/journeys, spotlight tours, one beacon per page, state-triggered nudges.
   HARD RULE: at most ONE guidance element is visible at any time. Everything else waits. */

window.Guide = (function () {
  const layer = () => document.getElementById("guide-layer");

  // Calm budget. "fast" flips timings so the demo doesn't have to wait.
  const BUDGET = {
    maxNudgesPerSession: 2,
    cooldownMs: () => (S.demo.fast ? 5_000 : 5 * 60_000),
    pageDwellMs: () => (S.demo.fast ? 2_000 : 20_000),
    idleMs: () => (S.demo.fast ? 4_000 : 20_000),
    toastMs: 3200,
  };

  // Runtime (not persisted): what's on screen right now.
  const R = { tour: null, nudge: null, toast: null, beaconPop: null, panelOpen: false, idleTimer: null, lastActivity: Date.now(), held: [] };
  let S = null;

  /* ---------- public ---------- */
  function tick(state) {
    S = state;
    if (!layer()) return;
    // Agent mode: no guidance layer. Wizard: only the launcher (assistant), no tours/nudges/beacons.
    if (S.mode !== "human") { clearAll(); return; }
    if (S.screen !== "app" || S.tipsOff) { clearAll(true); renderLauncher(); return; }

    renderLauncher();
    if (R.tour) { positionTour(); return; }          // one thing at a time
    if (R.toast || R.nudge || R.beaconPop) return;

    // 1. First-visit tour on an empty page.
    const tour = window.TOURS[S.page];
    if (tour && !S.toursDone.includes(S.page) && pageIsEmpty(S.page)) { startTour(S.page, 0); return; }

    // 2. Nudges — filtered, prioritised, budgeted.
    const due = window.NUDGES
      .filter(n => (!n.page || n.page === S.page) && !S.dismissed.includes(n.id) && !(n.once && S.fired.includes(n.id)) && n.when(S))
      .sort((a, b) => a.priority - b.priority);
    R.held = due;
    if (due.length && budgetOK() && dwellOK() && !typing()) { showNudge(due[0]); return; }

    // 3. Beacon (max one per page).
    renderBeacon();
    scheduleIdle();
  }

  function budgetOK() {
    return S.nudgeCount < BUDGET.maxNudgesPerSession && (Date.now() - (S.lastNudgeAt || 0)) > BUDGET.cooldownMs();
  }
  function dwellOK() { return (Date.now() - (S.pageEnteredAt || 0)) > BUDGET.pageDwellMs(); }
  function typing() {
    const a = document.activeElement;
    return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
  }
  function pageIsEmpty(page) {
    switch (page) {
      case "contacts":   return S.contacts.length === 0;
      case "templates":  return S.templates.length === 0;
      case "broadcasts": return S.broadcasts.length === 0;
      case "bots":       return !S.bot;
      case "inbox":      return S.team.length === 0 && !S.conversations.some(c => c.assignee);
      case "api":        return !S.apiSent && !S.webhook.url;
      default:           return false;
    }
  }
  function status() {
    return { held: R.held.length, budget: `${S ? S.nudgeCount : 0}/${BUDGET.maxNudgesPerSession}`, showing: R.tour ? "tour" : R.nudge ? "nudge" : R.toast ? "toast" : R.beaconPop ? "beacon" : "—" };
  }

  /* ---------- journeys / launcher ---------- */
  function plan() {
    const out = [];
    for (const key of S.jtbd) {
      const j = window.JOURNEYS[key]; if (!j) continue;
      j.steps.forEach(st => out.push({ ...st, journey: key, jlabel: j.label, isDone: st.done(S) }));
    }
    return out;
  }
  function next() { return plan().find(p => !p.isDone) || null; }

  function renderLauncher() {
    let el = layer().querySelector(".launcher");
    const p = plan(); const done = p.filter(x => x.isDone).length;
    const pct = p.length ? Math.round(done / p.length * 100) : 0;
    if (!el) {
      el = document.createElement("button");
      el.className = "launcher"; el.setAttribute("aria-label", "Your plan and help");
      el.addEventListener("click", togglePanel);
      layer().appendChild(el);
    }
    const inApp = S.screen === "app";
    el.innerHTML = inApp ? `<span class="ring" style="--p:${pct}%"><span>${done}/${p.length}</span></span><span>${S.tipsOff ? "Assistant" : "Your plan"}</span>` : `<span class="ring" style="--p:0%"><span>R</span></span><span>Need a hand?</span>`;
    el.classList.toggle("idle", !!R.idle && !S.tipsOff);
    if (R.panelOpen) renderPanel();
  }
  function togglePanel() {
    R.panelOpen = !R.panelOpen;
    const old = layer().querySelector(".launcher-panel"); if (old) old.remove();
    if (R.panelOpen) { R.idle = false; if (!R.tab) R.tab = "assistant"; renderLauncher(); renderPanel(); }
  }
  function renderPanel() {
    let el = layer().querySelector(".launcher-panel");
    if (!el) { el = document.createElement("div"); el.className = "launcher-panel"; layer().appendChild(el); }
    const inApp = S.screen === "app"; if (!inApp) R.tab = "assistant";
    const p = plan(); const nx = next(); const done = p.filter(x => x.isDone).length;
    const tabs = inApp ? `<div class="lp-tabs"><button class="${R.tab === "assistant" ? "on" : ""}" data-guide="tab" data-tab="assistant">Assistant</button><button class="${R.tab === "plan" ? "on" : ""}" data-guide="tab" data-tab="plan">Plan <span class="tabular">${done}/${p.length}</span></button><button class="btn ghost sm" data-guide="close" style="margin-left:auto">✕</button></div>` : `<div class="lp-tabs"><span class="eyebrow" style="align-self:center">Help</span><button class="btn ghost sm" data-guide="close" style="margin-left:auto">✕</button></div>`;
    const items = p.map(st => `
      <div class="lp-item ${st.isDone ? "done" : ""} ${nx && nx.id === st.id && nx.journey === st.journey ? "cur" : ""}">
        <span class="st">${st.isDone ? "✓" : ""}</span>
        <span>${st.title}</span>
        ${st.isDone ? "" : `<button class="btn ghost sm" data-guide="show" data-journey="${st.journey}" data-step="${st.id}">Show me</button>`}
      </div>`).join("");
    const planTab = `
      <div class="progress"><i style="width:${p.length ? Math.round(done / p.length * 100) : 0}%"></i></div>
      <div>${items || `<p class="hint">Pick what you want to do in Settings to get a plan.</p>`}</div>
      <div class="row wrap">
        ${window.TOURS[S.page] ? `<button class="btn secondary sm" data-guide="replay">Replay this page's tour</button>` : ""}
        <button class="btn secondary sm" data-guide="tips">${S.tipsOff ? "Turn tips on" : "Turn tips off"}</button>
      </div>`;
    el.innerHTML = `${tabs}${R.tab === "plan" ? planTab : `<div class="as-root"></div>`}`;
    if (R.tab !== "plan") window.Assistant.render(el.querySelector(".as-root"));
    el.onclick = e => {
      const b = e.target.closest("[data-guide]"); if (!b) return;
      const k = b.dataset.guide;
      if (k === "close") togglePanel();
      if (k === "tab") { R.tab = b.dataset.tab; renderPanel(); }
      if (k === "replay") { togglePanel(); startTour(S.page, 0, true); }
      if (k === "tips") { App.act("toggleTips"); }
      if (k === "show") { togglePanel(); showMe(b.dataset.journey, b.dataset.step); }
    };
  }
  function showMe(journey, stepId) {
    const st = window.JOURNEYS[journey].steps.find(s => s.id === stepId); if (!st) return;
    App.nav(st.page);
    requestAnimationFrame(() => startTour(st.page, st.tourStep || 0, true));
  }

  /* ---------- tours ---------- */
  function startTour(page, idx, force) {
    const steps = window.TOURS[page]; if (!steps) return;
    dismissNudge(false); clearToast(); clearBeacon();
    R.tour = { page, idx: Math.min(idx, steps.length - 1), steps, force };
    renderTour();
  }
  function renderTour() {
    let spot = layer().querySelector(".tour-spot"), tip = layer().querySelector(".tour-tip");
    if (!spot) { spot = document.createElement("div"); spot.className = "tour-spot"; layer().appendChild(spot); }
    if (!tip) { tip = document.createElement("div"); tip.className = "tour-tip"; tip.setAttribute("role", "dialog"); layer().appendChild(tip); }
    const t = R.tour; const st = t.steps[t.idx]; const last = t.idx === t.steps.length - 1;
    tip.innerHTML = `
      <div class="eyebrow">Step ${t.idx + 1} of ${t.steps.length}</div>
      <h3>${st.title}</h3>
      <p class="small" style="color:var(--ink-2)">${st.body}</p>
      <div class="acts">
        <button class="btn link skip" data-t="skip">${last ? "Don't show again" : "Skip tour"}</button>
        ${t.idx > 0 ? `<button class="btn secondary sm" data-t="back">Back</button>` : ""}
        <button class="btn primary sm" data-t="next">${last ? "Got it" : "Next"}</button>
      </div>`;
    tip.onclick = e => {
      const b = e.target.closest("[data-t]"); if (!b) return;
      if (b.dataset.t === "skip") endTour();
      if (b.dataset.t === "back") { t.idx--; renderTour(); }
      if (b.dataset.t === "next") { if (last) endTour(); else { t.idx++; renderTour(); } }
    };
    positionTour();
    tip.querySelector("[data-t='next']").focus();
  }
  function positionTour() {
    const spot = layer().querySelector(".tour-spot"), tip = layer().querySelector(".tour-tip");
    if (!R.tour || !spot || !tip) return;
    const el = document.querySelector(R.tour.steps[R.tour.idx].sel);
    if (!el) { endTour(); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const r = el.getBoundingClientRect(); const pad = 6;
    Object.assign(spot.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
    const tw = 300, th = tip.offsetHeight || 150;
    let top = r.bottom + 14; if (top + th > innerHeight - 20) top = Math.max(20, r.top - th - 14);
    let left = Math.min(Math.max(16, r.left), innerWidth - tw - 16);
    Object.assign(tip.style, { left: left + "px", top: top + "px" });
  }
  function endTour() {
    if (R.tour && !S.toursDone.includes(R.tour.page)) { S.toursDone.push(R.tour.page); App.save(); }
    R.tour = null;
    layer().querySelectorAll(".tour-spot,.tour-tip").forEach(n => n.remove());
    tick(S);
  }

  /* ---------- beacons ---------- */
  function renderBeacon() {
    clearBeacon();
    const list = window.BEACONS[S.page] || [];
    const b = list.find(x => !S.seen.includes(x.id)); if (!b) return;
    const el = document.querySelector(b.sel); if (!el) return;
    const r = el.getBoundingClientRect();
    const dot = document.createElement("button"); dot.className = "beacon"; dot.setAttribute("aria-label", "Tip");
    Object.assign(dot.style, { left: r.right - 8 + "px", top: r.top - 6 + "px" });
    dot.onclick = () => {
      const pop = document.createElement("div"); pop.className = "beacon-pop";
      Object.assign(pop.style, { left: Math.min(r.right - 8, innerWidth - 276) + "px", top: r.top + 14 + "px" });
      const tourIdx = (window.TOURS[S.page] || []).findIndex(t => t.sel === b.sel);
      pop.innerHTML = `<div>${b.text}</div><div class="row">${tourIdx >= 0 ? `<button class="btn guide sm" data-b="show">Show me</button>` : ""}<button class="btn ghost sm" data-b="ok">Got it</button></div>`;
      pop.onclick = e => {
        const k = (e.target.closest("[data-b]") || {}).dataset; if (!k) return;
        markSeen(b.id); R.beaconPop = null; pop.remove();
        if (k.b === "show") startTour(S.page, tourIdx, true); else tick(S);
      };
      dot.remove(); R.beaconPop = pop; layer().appendChild(pop);
    };
    layer().appendChild(dot);
  }
  function clearBeacon() { layer().querySelectorAll(".beacon,.beacon-pop").forEach(n => n.remove()); R.beaconPop = null; }
  function markSeen(id) { if (!S.seen.includes(id)) { S.seen.push(id); App.save(); } }

  /* ---------- nudges ---------- */
  function showNudge(n) {
    clearBeacon();
    R.nudge = n;
    S.nudgeCount++; S.lastNudgeAt = Date.now(); if (n.once) S.fired.push(n.id); App.save();
    const el = document.createElement("div"); el.className = "nudge"; el.setAttribute("role", "status");
    el.innerHTML = `
      <div class="ttl"><span>${n.title}</span><button class="x" aria-label="Dismiss" data-n="x">×</button></div>
      <div class="body">${typeof n.body === "function" ? n.body(S) : n.body}</div>
      <div class="acts"><button class="btn primary sm" data-n="cta">${n.cta.label}</button>${n.alt ? `<button class="btn ghost sm" data-n="x">${n.alt.label}</button>` : ""}</div>`;
    el.onclick = e => {
      const b = e.target.closest("[data-n]"); if (!b) return;
      if (b.dataset.n === "x") { dismissNudge(true); return; }
      dismissNudge(false);
      App.act(n.cta.action, n.cta);
    };
    layer().appendChild(el);
  }
  function dismissNudge(remember) {
    if (!R.nudge) return;
    if (remember && !S.dismissed.includes(R.nudge.id)) { S.dismissed.push(R.nudge.id); App.save(); }
    R.nudge = null; layer().querySelectorAll(".nudge").forEach(n => n.remove());
    tick(S);
  }

  /* ---------- toasts ---------- */
  function toast(msg) {
    if (!layer() || S.tipsOff) return;
    clearToast();
    const el = document.createElement("div"); el.className = "toast"; el.innerHTML = msg;
    layer().appendChild(el); R.toast = el;
    setTimeout(() => { if (R.toast === el) { clearToast(); tick(S); } }, BUDGET.toastMs);
  }
  function clearToast() { layer().querySelectorAll(".toast").forEach(n => n.remove()); R.toast = null; }

  /* ---------- idle beacon on launcher ---------- */
  function scheduleIdle() {
    clearTimeout(R.idleTimer);
    if (!pageIsEmpty(S.page)) { R.idle = false; renderLauncher(); return; }
    R.idleTimer = setTimeout(() => { if (!R.tour && !R.nudge && !R.panelOpen) { R.idle = true; renderLauncher(); } }, BUDGET.idleMs());
  }
  ["click", "keydown", "scroll", "mousemove"].forEach(ev => document.addEventListener(ev, () => {
    if (R.idle && ev !== "mousemove") { R.idle = false; renderLauncher(); }
    if (S && S.screen === "app" && ev !== "mousemove") scheduleIdle();
  }, { passive: true }));
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (R.tour) endTour(); else if (R.nudge) dismissNudge(true); else if (R.panelOpen) togglePanel(); } });
  addEventListener("resize", () => { if (R.tour) positionTour(); });

  function clearAll(keepLauncher) {
    R.tour = null; R.nudge = null; R.beaconPop = null; R.panelOpen = keepLauncher ? R.panelOpen : false;
    layer().querySelectorAll(keepLauncher ? ".tour-spot,.tour-tip,.nudge,.beacon,.beacon-pop,.toast" : "*").forEach(n => n.remove());
  }

  return { tick, toast, startTour, plan, next, status, held: () => R.held, resetRuntime: () => clearAll(false) };
})();
