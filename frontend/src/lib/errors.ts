/** True for errors that mean "the Stellar RPC / Horizon / anchor could not be reached". */
export function isNetworkError(message: string): boolean {
  return /failed to fetch|networkerror|network error|load failed|timed? ?out|econn|err_|status code 50[234]|\b50[234]\b/i.test(message);
}
