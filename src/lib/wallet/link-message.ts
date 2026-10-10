import { getAddress, isAddress, type Address } from "viem";

/** How long a signed wallet-link message stays valid. */
export const WALLET_LINK_TTL_MS = 10 * 60 * 1000;

const HEADER = "Contribo wants you to link this wallet to your account.";

export type WalletLinkPayload = {
  userId: string;
  address: Address;
  chainId: number;
  issuedAt: string;
  nonce: string;
};

/**
 * Human-readable message the user signs. It binds the wallet to one Contribo
 * user ID and expires, so a leaked signature cannot link the wallet elsewhere.
 */
export function buildWalletLinkMessage(payload: WalletLinkPayload): string {
  return [
    HEADER,
    "",
    `Wallet: ${payload.address}`,
    `Contribo user: ${payload.userId}`,
    `Chain ID: ${payload.chainId}`,
    `Nonce: ${payload.nonce}`,
    `Issued at: ${payload.issuedAt}`,
  ].join("\n");
}

export function parseWalletLinkMessage(message: string): WalletLinkPayload | null {
  const lines = message.split("\n");
  if (lines[0] !== HEADER || lines[1] !== "") return null;

  const fields = new Map<string, string>();
  for (const line of lines.slice(2)) {
    const index = line.indexOf(": ");
    if (index < 0) return null;
    fields.set(line.slice(0, index), line.slice(index + 2));
  }

  const address = fields.get("Wallet");
  const userId = fields.get("Contribo user");
  const chainId = Number(fields.get("Chain ID"));
  const nonce = fields.get("Nonce");
  const issuedAt = fields.get("Issued at");
  if (!address || !isAddress(address) || !userId || !Number.isInteger(chainId) || !nonce || !issuedAt) {
    return null;
  }

  const payload = { userId, address: getAddress(address), chainId, nonce, issuedAt };
  // Reject anything that does not round-trip exactly (extra or reordered lines).
  return buildWalletLinkMessage(payload) === message ? payload : null;
}

export type WalletLinkCheck =
  | { ok: true; payload: WalletLinkPayload }
  | { ok: false; reason: string };

/** Validates message contents (not the signature) against the expected user and chain. */
export function checkWalletLinkMessage(
  message: string,
  expected: { userId: string; chainId: number; now: number },
): WalletLinkCheck {
  const payload = parseWalletLinkMessage(message);
  if (!payload) return { ok: false, reason: "Malformed wallet link message." };
  if (payload.userId !== expected.userId) return { ok: false, reason: "Message was signed for another account." };
  if (payload.chainId !== expected.chainId) return { ok: false, reason: "Message was signed for another network." };

  const issued = Date.parse(payload.issuedAt);
  if (Number.isNaN(issued)) return { ok: false, reason: "Invalid issue time." };
  if (issued > expected.now + 60_000 || expected.now - issued > WALLET_LINK_TTL_MS) {
    return { ok: false, reason: "Signature expired. Please sign again." };
  }
  return { ok: true, payload };
}
