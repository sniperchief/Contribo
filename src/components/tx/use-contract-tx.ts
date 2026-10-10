"use client";

import { useCallback, useReducer } from "react";
import type { Address, Hex, TransactionReceipt } from "viem";
import { useConfig, useAccount } from "wagmi";
import { switchChain, waitForTransactionReceipt } from "wagmi/actions";
import { contriboRewards } from "@/lib/contracts/config";
import { initialTxState, txReducer } from "@/lib/contracts/tx";
import { activeChain } from "@/lib/monad/chains";

class ContractNotConfiguredError extends Error {
  name = "ContractNotConfiguredError";
}

class WalletNotConnectedError extends Error {
  name = "ConnectorNotConnectedError";
}

/**
 * Runs wallet transactions through one state machine:
 * preparing → awaiting-signature → pending → confirmed | failed.
 * `run` resolves with the receipt only when the transaction succeeded onchain.
 */
export function useContractTx() {
  const config = useConfig();
  const { address, chainId } = useAccount();
  const [state, dispatch] = useReducer(txReducer, initialTxState);

  const run = useCallback(
    async (step: string, send: (account: Address) => Promise<Hex>): Promise<TransactionReceipt | null> => {
      try {
        dispatch({ type: "prepare", step });
        if (!contriboRewards) throw new ContractNotConfiguredError("Contract not configured");
        if (!address) throw new WalletNotConnectedError("Wallet not connected");
        if (chainId !== activeChain.id) await switchChain(config, { chainId: activeChain.id });

        dispatch({ type: "await-signature", step });
        const hash = await send(address);
        dispatch({ type: "submitted", hash });

        const receipt = await waitForTransactionReceipt(config, { hash, chainId: activeChain.id });
        dispatch({ type: "receipt", status: receipt.status });
        return receipt.status === "success" ? receipt : null;
      } catch (error) {
        dispatch({ type: "error", error });
        return null;
      }
    },
    [address, chainId, config],
  );

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return { state, run, reset, account: address, busy: ["preparing", "awaiting-signature", "pending"].includes(state.phase) };
}
