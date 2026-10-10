import { describe, expect, it } from "vitest";
import { describeTxError, initialTxState, txReducer, type TxAction, type TxState } from "@/lib/contracts/tx";

const HASH = `0x${"11".repeat(32)}` as const;

function run(actions: TxAction[], state: TxState = initialTxState) {
  return actions.reduce(txReducer, state);
}

describe("transaction state machine", () => {
  it("is confirmed only after a successful receipt", () => {
    const pending = run([{ type: "prepare", step: "Deposit" }, { type: "await-signature" }, { type: "submitted", hash: HASH }]);
    expect(pending).toMatchObject({ phase: "pending", hash: HASH, step: "Deposit" });
    expect(txReducer(pending, { type: "receipt", status: "success" }).phase).toBe("confirmed");
  });

  it("treats a reverted receipt as failed, never as success", () => {
    const state = run([{ type: "prepare" }, { type: "submitted", hash: HASH }, { type: "receipt", status: "reverted" }]);
    expect(state.phase).toBe("failed");
    expect(state.error?.kind).toBe("reverted");
  });

  it("ignores a receipt when no transaction is pending", () => {
    expect(txReducer(initialTxState, { type: "receipt", status: "success" })).toBe(initialTxState);
    const awaiting = run([{ type: "prepare" }, { type: "await-signature" }]);
    expect(txReducer(awaiting, { type: "receipt", status: "success" }).phase).toBe("awaiting-signature");
  });

  it("resets", () => {
    expect(run([{ type: "prepare" }, { type: "reset" }])).toEqual(initialTxState);
  });
});

describe("transaction error mapping", () => {
  it("detects wallet rejection anywhere in the error chain", () => {
    const error = { name: "TransactionExecutionError", cause: { name: "UserRejectedRequestError" } };
    expect(describeTxError(error).kind).toBe("rejected");
    expect(describeTxError({ name: "Error", cause: { code: 4001 } }).kind).toBe("rejected");
  });

  it("detects insufficient funds", () => {
    expect(describeTxError({ name: "EstimateGasExecutionError", cause: { name: "InsufficientFundsError" } }).kind).toBe(
      "insufficient-funds",
    );
  });

  it("detects the wrong network", () => {
    expect(describeTxError({ name: "ConnectorChainMismatchError" }).kind).toBe("wrong-network");
    expect(describeTxError({ name: "SwitchChainError" }).kind).toBe("wrong-network");
  });

  it("explains contract reverts by custom error name", () => {
    const error = {
      name: "ContractFunctionExecutionError",
      cause: { name: "ContractFunctionRevertedError", data: { errorName: "InsufficientAvailable" } },
    };
    expect(describeTxError(error)).toEqual({
      kind: "reverted",
      message: "The project does not have enough unallocated funds.",
    });
    expect(describeTxError({ name: "ContractFunctionRevertedError", data: { errorName: "ContributionExists" } }).message).toMatch(
      /already been approved/,
    );
  });

  it("reports missing wallet and missing contract configuration", () => {
    expect(describeTxError({ name: "ConnectorNotConnectedError" }).kind).toBe("no-wallet");
    expect(describeTxError({ name: "ContractNotConfiguredError" }).kind).toBe("not-configured");
  });

  it("falls back to the short message for unknown errors", () => {
    expect(describeTxError({ name: "HttpRequestError", shortMessage: "HTTP request failed." })).toEqual({
      kind: "unknown",
      message: "HTTP request failed.",
    });
  });
});
