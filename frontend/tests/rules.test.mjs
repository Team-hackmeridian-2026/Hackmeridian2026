import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";

// i18n/index.ts sets <html lang> when it loads; Node has no DOM.
globalThis.document ??= { documentElement: {} };

// As in format.test.mjs: Vite loads the app's real modules.
const vite = await createServer({ configFile: false, appType: "custom", logLevel: "error", server: { middlewareMode: true, hmr: false } });
// Loaded before the app's modules, so they share this copy, which the last test stubs.
const { contract, Keypair } = await vite.ssrLoadModule("@stellar/stellar-sdk");
const { splitConfig, splitProblem, roundProblem } = await vite.ssrLoadModule("/src/components/listing.tsx");
const { explainError, reclaimable, ARBITER_PERIOD, splitter } = await vite.ssrLoadModule("/src/stellar/contracts.ts");
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

test("anchor failures read as the anchor's own message, or a translated one", async () => {
  await i18n.changeLanguage("en");
  const { StellarToml } = await vite.ssrLoadModule("@stellar/stellar-sdk");
  const { ANCHOR_DOMAIN, anchorConfig, authenticate } = await vite.ssrLoadModule("/src/stellar/anchor.ts");
  const original = { resolve: StellarToml.Resolver.resolve, fetch: globalThis.fetch };
  StellarToml.Resolver.resolve = async () => ({
    WEB_AUTH_ENDPOINT: "https://anchor.test/auth",
    TRANSFER_SERVER_SEP0024: "https://anchor.test/sep24",
    SIGNING_KEY: Keypair.random().publicKey(),
  });
  let answer;
  globalThis.fetch = async (url) => ({ ok: false, json: async () => answer(String(url)) });
  try {
    // No withdraw section in /info: not an anchor the cash-out can use.
    answer = () => ({});
    await assert.rejects(anchorConfig(), { message: i18n.t("errors.anchor.unsupported", { domain: ANCHOR_DOMAIN }) });
    // The anchor refuses to send a challenge: its own message, not a crash inside the SDK.
    answer = (url) => (url.endsWith("/info") ? { withdraw: {} } : { error: "Invalid account" });
    await assert.rejects(authenticate({ address: Keypair.random().publicKey() }), { message: "Invalid account" });
  } finally {
    StellarToml.Resolver.resolve = original.resolve;
    globalThis.fetch = original.fetch;
  }
});

test("reclaimable lists the milestones the contract's reclaim refunds", () => {
  const round = (milestones, funded = true) => ({ funded, deadline: 1_000n, challenge_period: 60n, milestones });
  const pending = { status: "Pending", submitted_at: 0n };
  // Unproven milestones: from the deadline on.
  assert.deepEqual(reclaimable(round([pending]), 999), []);
  assert.deepEqual(reclaimable(round([{ status: "Released", submitted_at: 10n }, pending]), 1_000), [1]);
  // A dispute: once the challenge window and the arbiter's period are both over.
  const disputed = { status: "Disputed", submitted_at: 100n };
  const unsettledFrom = 100 + 60 + ARBITER_PERIOD;
  assert.deepEqual(reclaimable({ ...round([disputed]), deadline: 10n ** 12n }, unsettledFrom - 1), []);
  assert.deepEqual(reclaimable({ ...round([disputed]), deadline: 10n ** 12n }, unsettledFrom), [0]);
  // Never a submitted or settled milestone, and nothing before the round is funded.
  const late = 10 ** 10;
  assert.deepEqual(reclaimable(round(["Submitted", "Released", "Refunded", "Split"].map((status) => ({ status, submitted_at: 100n }))), late), []);
  assert.deepEqual(reclaimable(round([pending], false), late), []);
});

test("a transaction sent but not confirmed is not reported as a failure to retry", async () => {
  await i18n.changeLanguage("en");
  // No network: a fake contract spec, and fake transactions in place of the SDK's.
  const { Client, AssembledTransaction } = contract;
  const original = { from: Client.from, build: AssembledTransaction.build };
  const spec = { funcs: () => [{ name: "pay_royalty" }], getFunc: () => ({ inputs: [1, 2, 3] }), funcArgsToScVals: () => [], errorCases: () => [] };
  let signAndSend;
  Client.from = async () => ({ spec });
  AssembledTransaction.build = async () => ({ signAndSend: (options) => signAndSend(options) });
  const signer = { address: Keypair.random().publicKey(), sign: async () => ({ signedTxXdr: "" }), kind: "wallet" };
  const pay = () => splitter.payRoyalty(signer, 1n, "5");
  try {
    // The network accepted it, then a status check failed: retrying would pay the royalty twice.
    signAndSend = async ({ watcher }) => {
      watcher.onSubmitted({ status: "PENDING", hash: "abc123" });
      throw new Error("Failed to fetch");
    };
    await assert.rejects(pay(), (err) => err.hash === "abc123" && err.message === i18n.t("errors.unconfirmed"));
    // Confirmed but failed on-chain: an ordinary failure.
    signAndSend = async ({ watcher }) => {
      watcher.onSubmitted({ status: "PENDING", hash: "abc123" });
      return { sendTransactionResponse: { hash: "abc123" }, get result() { throw new Error("Transaction failed!"); } };
    };
    await assert.rejects(pay(), (err) => err.hash === undefined && err.message === "Transaction failed!");
  } finally {
    Client.from = original.from;
    AssembledTransaction.build = original.build;
  }
});
