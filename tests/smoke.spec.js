// @ts-check
const { test, expect } = require("@playwright/test");

// Helpers that talk to the app's public hooks (App, Guide, Assistant, WA) inside the page.
const act = (page, id, d) => page.evaluate(([id, d]) => window.App.act(id, d), [id, d || {}]);
const state = (page) => page.evaluate(() => window.App.state());
const errors = [];

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });
  page.on("requestfailed", (r) => console.log("[requestfailed]", r.url()));
  await page.goto("/index.html");
  await page.waitForFunction(() => window.App && document.getElementById("root").children.length > 0);
});
test.afterEach(() => { expect(errors, "no uncaught JS errors").toEqual([]); errors.length = 0; });

test("wizard golden path: sign-up → why → workspace → first message → done → plan", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Start sending on WhatsApp/ })).toBeVisible();
  await page.fill("input[name=email]", "meera@meeraboutique.in");
  await page.fill("input[name=website]", "meeraboutique.in");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { name: /What brought you here/ })).toBeVisible();
  const next = page.getByRole("button", { name: "Next", exact: true });
  await expect(next, "Next disabled until a job is picked").toBeDisabled();
  await page.locator("[data-action=toggleJtbd][data-key=broadcast]").click();
  await next.click();

  await expect(page.getByRole("heading", { name: /Your workspace is ready/ })).toBeVisible();
  await expect(page.locator(".keybox"), "no API key for a non-developer").toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByRole("heading", { name: /Send your first message/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /pretend I sent it/ }).click();
  await expect(page.getByText("Connected ✓")).toBeVisible({ timeout: 5000 });
  await page.locator("form[data-form=firstMsg] button[type=submit]").click();
  await expect(page.locator(".phone .bub").last()).toContainText("first message");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // optional screens are skippable
  await page.getByRole("button", { name: "Skip for now" }).click();               // agent
  await expect(page.getByRole("heading", { name: /Connect your own number/ })).toBeVisible();
  await page.getByRole("button", { name: /Keep using sandbox for now/ }).click(); // number
  await page.getByRole("button", { name: /I'll do this later/ }).click();         // billing
  await expect(page.getByRole("heading", { name: /You're all set/ })).toBeVisible();
  await page.getByRole("button", { name: /Go to your plan/ }).click();

  await expect(page.getByRole("heading", { name: /^Hi / })).toBeVisible();
  await expect(page.locator(".next-card h2")).toBeVisible();
  const s = await state(page);
  expect(s.jtbd).toEqual(["broadcast"]);
  expect(s.sandbox.status).toBe("connected");
});

test("state survives reload on a wizard screen", async ({ page }) => {
  await page.fill("input[name=email]", "k@acme.in"); await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("[data-action=toggleJtbd][data-key=api]").click(); await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".keybox")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Your workspace is ready/ })).toBeVisible();
  await expect(page.locator(".keybox")).toBeVisible();
});

test("Embedded Signup: display-name rules enforced live, finish creates WABA + number", async ({ page }) => {
  await act(page, "jumpApp"); await act(page, "openNumber");
  for (const k of ["notOnWa", "bm", "doc"]) await page.locator(`[data-action=checkItem][data-key=${k}]`).click();
  await page.getByRole("button", { name: "Start Embedded Signup" }).click();
  await page.getByRole("button", { name: /Continue as/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();            // portfolio (prefilled)
  await page.getByRole("button", { name: "Next", exact: true }).click();            // waba
  await page.fill("[data-es='phone.number']", "+91 98765 43210");
  await page.getByRole("button", { name: /Send code by SMS/ }).click();
  await page.fill("[data-es='otp.code']", "123456");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.fill("[data-es='displayName']", "ACME STORE");
  await expect(page.getByText(/all capitals/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.fill("[data-es='displayName']", "Acme Store");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.fill("[data-es='pin']", "246810");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByText(/is connected to Relay/)).toBeVisible();
  const s = await state(page);
  expect(s.waba).toBeTruthy(); expect(s.numbers).toHaveLength(1);
  expect(s.numbers[0].displayNameStatus).toBe("pending");
  expect(s.meta.status).toBe("live");
});

test("template builder: Meta rules block submit, review can reject with a fix", async ({ page }) => {
  await act(page, "jumpApp"); await page.evaluate(() => window.App.nav("templates"));
  await page.getByRole("button", { name: "New template" }).click();
  await expect(page.locator("#tplform")).toBeVisible();
  await page.fill("[data-tpl=body]", "Hi {{1}} {{2}}");
  await expect(page.locator("#tpl-errors")).toContainText("next to each other");
  await expect(page.locator("#tplform button[type=submit]")).toBeDisabled();
  await page.fill("[data-tpl=body]", "Hi {{1}}, your order #{{2}} from Acme has shipped and will arrive by {{3}}. Reply for help.");
  await expect(page.locator("[data-tpl^='samples.']")).toHaveCount(3);
  await expect(page.locator("#tplform button[type=submit]")).toBeEnabled();
  await page.locator("#tplform button[type=submit]").click();
  await expect(page.locator(".tplrow")).toContainText("Pending Meta review");
  await act(page, "demoRejectTemplate");
  await expect(page.locator(".tplrow")).toContainText("Rejected");
  await expect(page.locator(".tplrow")).toContainText("Fix:");
});

test("broadcasts page never crashes: no templates, only rejected template, only pending", async ({ page }) => {
  await act(page, "jumpApp");
  await page.evaluate(() => window.App.nav("broadcasts"));
  await expect(page.getByRole("heading", { name: "Broadcasts" })).toBeVisible();
  await act(page, "demoRejectTemplate");                          // only template is rejected — Meera's crash
  await page.evaluate(() => window.App.nav("home"));
  await page.evaluate(() => window.App.nav("broadcasts"));
  await expect(page.getByRole("heading", { name: "Broadcasts" })).toBeVisible();
  await expect(page.locator(".inline-banner")).toBeVisible();
});

test("calm budget: never more than one guidance element; nudge returns after a skipped tour", async ({ page }) => {
  await act(page, "jumpApp"); await act(page, "demoResetBudget"); await act(page, "demoLive");
  await page.evaluate(() => window.App.nav("numbers"));
  await page.waitForTimeout(3500); // toast clears, dwell (fast timers: 2s) passes
  const count = () => page.evaluate(() => [".tour-tip", ".nudge", ".beacon-pop", ".toast"].filter(s => document.querySelector(s)).length);
  expect(await count()).toBeLessThanOrEqual(1);
  const before = (await state(page)).nudgeCount;
  await page.evaluate(() => window.Guide.startTour("numbers", 0, true));
  await expect(page.locator(".tour-tip")).toBeVisible();
  expect(await count()).toBe(1);
  await page.locator(".tour-tip [data-t=skip]").click();
  await page.waitForTimeout(300);
  expect(await count()).toBeLessThanOrEqual(1);
  expect((await state(page)).nudgeCount, "displaced nudge refunded").toBeLessThanOrEqual(before);
});

test("assistant does work through the same tool surface, with confirmation for broadcasts", async ({ page }) => {
  await act(page, "jumpApp");
  await page.locator(".launcher").click();
  const ask = async (t) => { await page.fill(".as-form input", t); await page.locator(".as-form button[type=submit]").click(); await page.waitForTimeout(600); return (await state(page)).chat.at(-1).text; };
  expect(await ask("add contacts: Priya +91 91234 56789; Rahul +91 99887 76655")).toMatch(/Added 2/);
  expect(await ask("create a utility template that says Hi {{1}}, your order has shipped and will arrive on Tuesday. Reply for help.")).toMatch(/Submitted/);
  await act(page, "demoApprove");
  expect(await ask("send a broadcast")).toMatch(/Go ahead\?/);
  expect(await ask("yes")).toMatch(/Sent/);
  expect((await state(page)).broadcasts.length).toBe(1);
  const bubble = await page.locator(".msg.user .bub").last().innerHTML();
  await ask("<img src=x onerror=alert(1)>");
  expect(await page.locator(".msg.user .bub").last().innerHTML()).not.toContain("<img");
});

test("agent mode shares state and exposes onboarding JSON", async ({ page }) => {
  await act(page, "jumpApp"); await act(page, "mode", { v: "agent" });
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: /Run next command/ }).click();
  await expect(page.locator(".terminal")).toContainText("next_steps");
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  expect((await state(page)).agentConnected).toBe(true);
});
