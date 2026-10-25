import { DECIMALS } from "../config";

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
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? "." + frac.slice(0, 2) : ""}`;
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
  return new Date(Number(seconds) * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s} s`;
  return `${s} s`;
}
