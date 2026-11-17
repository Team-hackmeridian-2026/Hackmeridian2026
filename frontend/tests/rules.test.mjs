import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

// i18n/index.ts sets <html lang> when it loads; Node has no DOM.
globalThis.document ??= { documentElement: {} };

// As in format.test.mjs: Vite loads the app's real modules.
const vite = await createServer({ configFile: false, appType: "custom", logLevel: "error", server: { middlewareMode: true, hmr: false } });
const { splitConfig, splitProblem, roundProblem } = await vite.ssrLoadModule("/src/components/listing.tsx");
const { explainError } = await vite.ssrLoadModule("/src/stellar/contracts.ts");
const { CONTRACTS } = await vite.ssrLoadModule("/src/config.ts");
const { default: i18n } = await vite.ssrLoadModule("/src/i18n/index.ts");
test.after(() => vite.close());

/** A well-formed Stellar address made of one repeated letter. */
const addr = (letter) => "G" + letter.repeat(55);
/** `n` distinct inventor addresses: B, C, D… */
const inventors = (n) => Array.from({ length: n }, (_, i) => addr(String.fromCharCode(66 + i)));
const SPLIT = { university: 40, inventors: 30, investors: 30 };

test("splitConfig sends a split that adds up to 10,000 bps, university first", () => {
  for (const n of [1, 3, 7]) {
    const config = splitConfig(addr("A"), inventors(n), SPLIT);
    const total = config.investors_bps + config.fixed.reduce((sum, b) => sum + b.bps, 0);
    assert.equal(total, 10_000, `${n} inventors`);
    assert.ok(config.fixed.every((b) => Number.isInteger(b.bps)), `${n} inventors: whole bps`);
    assert.equal(config.fixed[0].addr, addr("A"));
  }
});

test("splitProblem refuses more fixed beneficiaries than configure accepts (10)", () => {
  assert.equal(splitProblem(addr("A"), inventors(9), SPLIT), null);
  assert.equal(splitProblem(addr("A"), inventors(10), SPLIT)?.message, "newLicence.errors.splitTooMany");
  // With no share for the university, ten inventors fit.
  assert.equal(splitProblem(addr("A"), inventors(10), { university: 0, inventors: 70, investors: 30 }), null);
});

test("roundProblem refuses milestones create_project would refuse", async () => {
  await i18n.changeLanguage("en");
  const round = (milestones) => roundProblem(addr("A"), addr("B"), addr("C"), milestones);
  assert.equal(round(["2", "1.5", "0.25"]), null);
  for (const bad of [[], Array(11).fill("1"), [""], ["0"], ["-1"], ["1e3"], ["1.001"], ["abc"]]) {
    assert.equal(round(bad)?.field, "milestones", JSON.stringify(bad));
  }
});

test("explainError reads EURC token failures as balance and trustline problems", async () => {
  await i18n.changeLanguage("en");
  // The token fails with its own codes (#10, #13), which come back through the escrow's call.
  const noBalance = new Error('HostError: Error(Contract, #10)\n… "balance is not sufficient to spend: 0 < 20000000"');
  const noTrustline = new Error('HostError: Error(Contract, #13)\n… "trustline entry is missing for account"');
  assert.equal(explainError(CONTRACTS.escrow, noBalance), i18n.t("errors.balance"));
  assert.equal(explainError(CONTRACTS.escrow, noTrustline), i18n.t("errors.trustline"));
  // The escrow's own #10 still reads as the escrow's message.
  assert.equal(explainError(CONTRACTS.escrow, new Error("HostError: Error(Contract, #10)")), i18n.t("errors.escrow.10"));
});
