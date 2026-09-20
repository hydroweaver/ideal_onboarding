// @ts-check
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: true,
  workers: 2, // python http.server is single-process; keep it gentle
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:8766", // tests run their own server so they never disturb a dev server on 8765
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /smoke\.spec\.js/ },
  ],
  webServer: {
    command: "python -m http.server 8766 --bind 127.0.0.1",
    url: "http://127.0.0.1:8766/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
