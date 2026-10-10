import { connectorsForWallets, type Wallet, type WalletList } from "@rainbow-me/rainbowkit";
import {
  backpackWallet,
  braveWallet,
  injectedWallet,
  metaMaskWallet,
  okxWallet,
  phantomWallet,
  rabbyWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, createConnector, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { env } from "@/lib/env";
import { activeChain } from "@/lib/monad/chains";

/**
 * Wallet connectivity: RainbowKit's connect modal on top of wagmi + viem.
 *
 * - Wallets installed in the browser are detected automatically (EIP-6963) and
 *   listed first; listed wallets that are not installed link to their download page.
 * - Phone wallets via QR (WalletConnect) need a free WalletConnect/Reown project ID
 *   (NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID). Without one, only browser wallets are
 *   offered, and no wallet in the list depends on WalletConnect.
 */
const projectId = env.wallet.walletConnectProjectId;

/**
 * MetaMask without the WalletConnect fallback: connects to the extension when
 * installed, otherwise the modal offers the extension download.
 */
const metaMaskExtensionWallet = (params: Parameters<typeof metaMaskWallet>[0]): Wallet => {
  const wallet = metaMaskWallet(params);
  return {
    ...wallet,
    qrCode: undefined,
    mobile: undefined,
    createConnector: (walletDetails) =>
      createConnector((config) => ({ ...injected({ target: "metaMask" })(config), ...walletDetails })),
  };
};

const walletGroups: WalletList = projectId
  ? [
      { groupName: "Recommended", wallets: [metaMaskWallet, rabbyWallet, phantomWallet, walletConnectWallet] },
      { groupName: "More wallets", wallets: [backpackWallet, trustWallet, okxWallet, braveWallet, injectedWallet] },
    ]
  : [
      { groupName: "Recommended", wallets: [metaMaskExtensionWallet, rabbyWallet, phantomWallet] },
      { groupName: "More wallets", wallets: [backpackWallet, braveWallet, injectedWallet] },
    ];

const connectors = connectorsForWallets(walletGroups, {
  appName: "Contribo",
  appDescription: "Contributor rewards for the Monad ecosystem",
  appUrl: env.siteUrl,
  // Only WalletConnect-based wallets use this, and they are listed only when it is set.
  projectId: projectId ?? "walletconnect-not-configured",
});

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors,
  transports: { [activeChain.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
