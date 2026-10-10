import type { Hex } from "viem";

/**
 * Transaction lifecycle. A transaction is shown as successful only in the
 * `confirmed` phase, which is entered after a receipt with status "success".
 */
export type TxPhase = "idle" | "preparing" | "awaiting-signature" | "pending" | "confirmed" | "failed";

export type TxErrorKind =
  | "rejected"
  | "insufficient-funds"
  | "wrong-network"
  | "reverted"
  | "no-wallet"
  | "not-configured"
  | "unknown";

export type TxError = { kind: TxErrorKind; message: string };

export type TxState = {
  phase: TxPhase;
  /** Label of the current step in multi-step flows, e.g. "Approve token". */
  step?: string;
  hash?: Hex;
  error?: TxError;
};

export type TxAction =
  | { type: "prepare"; step?: string }
  | { type: "await-signature"; step?: string }
  | { type: "submitted"; hash: Hex }
  | { type: "receipt"; status: "success" | "reverted" }
  | { type: "error"; error: unknown }
  | { type: "reset" };

export const initialTxState: TxState = { phase: "idle" };

export function txReducer(state: TxState, action: TxAction): TxState {
  switch (action.type) {
    case "prepare":
      return { phase: "preparing", step: action.step ?? state.step };
    case "await-signature":
      return { phase: "awaiting-signature", step: action.step ?? state.step };
    case "submitted":
      return { phase: "pending", step: state.step, hash: action.hash };
    case "receipt":
      // A receipt can only be accepted for a transaction we are waiting on.
      if (state.phase !== "pending") return state;
      return action.status === "success"
        ? { ...state, phase: "confirmed" }
        : {
            ...state,
            phase: "failed",
            error: { kind: "reverted", message: "The transaction was mined but reverted. No state changed." },
          };
    case "error":
      return { ...state, phase: "failed", error: describeTxError(action.error) };
    case "reset":
      return initialTxState;
  }
}

/** Human-readable messages for ContriboRewards custom errors. */
const contractErrorMessages: Record<string, string> = {
  ZeroAddress: "An address is missing.",
  ZeroAmount: "The amount must be greater than zero.",
  InvalidAsset: "That asset is not a token contract.",
  ProjectNotFound: "This project is not registered onchain.",
  NotProjectOwner: "Only the onchain project owner can do this. Switch to the owner wallet.",
  NotPendingOwner: "This wallet is not the pending owner.",
  NotApprover: "This wallet is not an approver for the project.",
  InsufficientAvailable: "The project does not have enough unallocated funds.",
  IncorrectNativeValue: "The MON amount sent does not match.",
  UnsupportedToken: "This token charges a transfer fee, which the vault does not support.",
  NativeTransferFailed: "The recipient could not receive MON. Claim to a different address.",
  InvalidContributionRef: "Invalid contribution reference.",
  ContributionExists: "This contribution has already been approved onchain.",
  InvalidContributor:
    "The contributor address is not allowed: it cannot be empty or the project owner wallet. Ask the contributor to link a different payout wallet, then update the reward.",
  NotClaimable: "This reward is not claimable (not approved, or already claimed).",
  NotContributor: "Only the contributor wallet recorded on the approval can claim.",
  BountyNotFound: "Bounty not found.",
  BountyNotOpen: "This bounty is no longer open.",
  InvalidDeadline: "The bounty deadline must be in the future.",
  BountyNotExpired: "This bounty can only be cancelled after its deadline.",
  EnforcedPause: "Contribo is temporarily paused for new activity. Claims and withdrawals still work.",
  ERC20InsufficientBalance: "Your token balance is too low.",
  ERC20InsufficientAllowance: "The vault is not approved to spend enough tokens.",
};

type ErrorLike = {
  name?: string;
  code?: number;
  shortMessage?: string;
  message?: string;
  cause?: unknown;
  data?: { errorName?: string };
};

function chain(error: unknown): ErrorLike[] {
  const list: ErrorLike[] = [];
  let current: unknown = error;
  while (current && typeof current === "object" && list.length < 10) {
    list.push(current as ErrorLike);
    current = (current as ErrorLike).cause;
  }
  return list;
}

/** Maps wallet, RPC and contract errors (viem/wagmi error chains) to a user-facing category. */
export function describeTxError(error: unknown): TxError {
  const errors = chain(error);
  const has = (...names: string[]) => errors.some((e) => e.name && names.includes(e.name));

  if (has("ContractNotConfiguredError")) {
    return { kind: "not-configured", message: "The rewards contract is not configured for this network yet." };
  }
  if (has("UserRejectedRequestError") || errors.some((e) => e.code === 4001)) {
    return { kind: "rejected", message: "You rejected the request in your wallet." };
  }
  if (has("ConnectorNotConnectedError", "ConnectorAccountNotFoundError", "ProviderNotFoundError")) {
    return { kind: "no-wallet", message: "Connect a wallet to continue." };
  }
  if (has("ChainMismatchError", "ConnectorChainMismatchError", "SwitchChainError")) {
    return { kind: "wrong-network", message: "Your wallet is on the wrong network." };
  }
  if (has("InsufficientFundsError")) {
    return { kind: "insufficient-funds", message: "Your wallet balance cannot cover the amount plus gas." };
  }

  const reverted = errors.find((e) => e.name === "ContractFunctionRevertedError");
  if (reverted) {
    const name = reverted.data?.errorName;
    return {
      kind: "reverted",
      message: (name && contractErrorMessages[name]) ?? reverted.shortMessage ?? "The contract rejected this transaction.",
    };
  }

  const first = errors[0];
  return {
    kind: "unknown",
    message: first?.shortMessage ?? first?.message?.split("\n")[0] ?? "Something went wrong.",
  };
}
