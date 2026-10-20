import { formatUnits } from "viem";

export function formatAmount(value: bigint | string | null | undefined, decimals: number, symbol: string): string {
  if (value === null || value === undefined) return "—";
  const formatted = formatUnits(BigInt(value), decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmed = fraction.slice(0, 6).replace(/0+$/, "");
  return `${Number(whole).toLocaleString("en-US")}${trimmed ? `.${trimmed}` : ""} ${symbol}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Date and time in UTC, e.g. "Oct 20, 2026, 14:03:12 UTC". Identical on server and client. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const formatted = new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  return `${formatted} UTC`;
}
