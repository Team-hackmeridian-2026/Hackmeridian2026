/** Wallet problems we can name before Freighter shows its popup (read by explainError). */
export class WalletError extends Error {
  constructor(public kind: "notConnected" | "network" | "account", public detail?: string) {
    super(kind);
  }
}
