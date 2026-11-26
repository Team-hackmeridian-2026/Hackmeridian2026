/**
 * True for errors that mean "the Stellar RPC / Horizon / anchor could not be reached".
 * Node-style codes (ECONNRESET, ERR_NETWORK) are matched as whole words, so translated
 * messages that merely contain "reconnect" or "error_" are not mistaken for outages.
 */
export function isNetworkError(message: string): boolean {
  return /failed to fetch|networkerror|network error|load failed|\btimed? ?out\b|\beconn[a-z]*\b|\berr_[a-z_]+\b|status code 50[234]|\b50[234]\b/i.test(
    message,
  );
}
