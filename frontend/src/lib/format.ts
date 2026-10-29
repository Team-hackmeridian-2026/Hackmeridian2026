import { DECIMALS } from "../config";
import i18n, { currentLocale } from "../i18n";

const UNIT = 10n ** BigInt(DECIMALS);

/** "12.5" EURC -> 125000000n (on-chain units). */
export function toUnits(amount: string): bigint {
  const [whole, frac = ""] = amount.trim().split(".");
  if (!/^\d+$/.test(whole || "0") || !/^\d*$/.test(frac) || frac.length > DECIMALS) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  return BigInt(whole || "0") * UNIT + BigInt(frac.padEnd(DECIMALS, "0") || "0");
}

/** 125000000n -> "12.5" */
export function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  const locale = currentLocale();
  const decimal = (1.5).toLocaleString(locale).charAt(1);
  return `${negative ? "-" : ""}${whole.toLocaleString(locale)}${frac ? decimal + frac.slice(0, 2) : ""}`;
}

export function eurc(units: bigint): string {
  return `${fromUnits(units)} EURC`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(data: Blob | string): Promise<Uint8Array> {
  const buffer =
    typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(await data.arrayBuffer());
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
}

export function formatDate(seconds: bigint | number): string {
  return new Date(Number(seconds) * 1000).toLocaleString(currentLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A plain number in the current language's format (e.g. "1,234.5" or "1 234,5"). */
export function formatNumber(value: number | string): string {
  return Number(value).toLocaleString(currentLocale());
}

export function formatDuration(seconds: number): string {
  const u = (unit: "day" | "hour" | "minute" | "second") => i18n.t(`units.${unit}`);
  if (seconds <= 0) return `0 ${u("second")}`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d} ${u("day")} ${h} ${u("hour")}`;
  if (h) return `${h} ${u("hour")} ${m} ${u("minute")}`;
  if (m) return `${m} ${u("minute")} ${s} ${u("second")}`;
  return `${s} ${u("second")}`;
}

/**
 * Any verified institution writes the data room link, so it is untrusted: only
 * https: and ipfs: links become clickable, never javascript:, data: or http:.
 */
const SAFE_LINK_PROTOCOLS = ["https:", "ipfs:"];

export function safeLink(uri: string): URL | null {
  try {
    const url = new URL(uri.trim());
    return SAFE_LINK_PROTOCOLS.includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}
