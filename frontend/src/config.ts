import deployment from "./deployment.json";

export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
export const RPC_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";

export const CONTRACTS = deployment.contracts;
export const ACCOUNTS = deployment.accounts;

const [EURC_CODE, EURC_ISSUER] = deployment.eurcAsset.split(":");
export { EURC_CODE, EURC_ISSUER };

/** EURC, like every Stellar asset, has 7 decimals. */
export const DECIMALS = 7;

export const CIRCLE_FAUCET_URL = "https://faucet.circle.com";

const EXPLORER = "https://stellar.expert/explorer/testnet";
export const explorer = {
  tx: (hash: string) => `${EXPLORER}/tx/${hash}`,
  contract: (id: string) => `${EXPLORER}/contract/${id}`,
  account: (id: string) => `${EXPLORER}/account/${id}`,
};
