import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

// i18n/index.ts sets <html lang> when it loads; Node has no DOM.
globalThis.document ??= { documentElement: {} };

// Vite resolves the app's extensionless imports and JSON, so the test runs the real format.ts.
const vite = await createServer({ configFile: false, appType: "custom", logLevel: "error", server: { middlewareMode: true, hmr: false } });
const { toUnits, fromUnits } = await vite.ssrLoadModule("/src/lib/format.ts");
const { default: i18n } = await vite.ssrLoadModule("/src/i18n/index.ts");
test.after(() => vite.close());

test("toUnits reads EURC with 7 decimals", async () => {
  await i18n.changeLanguage("en");
  assert.equal(toUnits("12.5"), 125_000_000n);
  assert.equal(toUnits(" 3 "), 30_000_000n);
  assert.equal(toUnits("0.0000001"), 1n);
});

test("toUnits refuses anything it cannot read exactly", async () => {
  await i18n.changeLanguage("en");
  for (const bad of ["1.2.3", "1,000", "-1", "1e3", "abc", "0.00000001"]) {
    assert.throws(() => toUnits(bad), /Invalid amount/, bad);
  }
});

test("toUnits accepts the decimal comma only where it is the decimal mark", async () => {
  await i18n.changeLanguage("fr");
  assert.equal(toUnits("5,5"), 55_000_000n);
  assert.equal(toUnits("5.5"), 55_000_000n);
  assert.throws(() => toUnits("1,2,3"), /Montant invalide/);
  await i18n.changeLanguage("en");
  assert.throws(() => toUnits("5,5"), /Invalid amount/);
});

test("fromUnits shows at most 2 decimals in the current language", async () => {
  await i18n.changeLanguage("en");
  assert.equal(fromUnits(125_000_000n), "12.5");
  assert.equal(fromUnits(-19_990_000n), "-1.99");
  await i18n.changeLanguage("fr");
  assert.equal(fromUnits(125_000_000n), "12,5");
});
