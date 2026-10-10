"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { activeChain } from "@/lib/monad/chains";
import { wagmiConfig } from "@/lib/wallet/config";

/** RainbowKit modal themed to the Contribo design system (Ink accent, Manrope, generous radii, no glow). */
const rainbowTheme = (() => {
  const theme = lightTheme({
    accentColor: "#06040e",
    accentColorForeground: "#ffffff",
    borderRadius: "large",
    fontStack: "system",
    overlayBlur: "small",
  });
  return {
    ...theme,
    fonts: { body: "var(--font-manrope), ui-sans-serif, system-ui, sans-serif" },
    colors: {
      ...theme.colors,
      modalBackground: "#ffffff",
      modalBorder: "#e1edf2",
      modalText: "#06040e",
      modalTextSecondary: "#10242f",
      actionButtonSecondaryBackground: "#f5f5f5",
      closeButtonBackground: "#f5f5f5",
      generalBorder: "#e1edf2",
      menuItemBackground: "#f5f5f5",
      profileForeground: "#f5f5f5",
      selectedOptionBorder: "#cbb0eb",
    },
    shadows: { ...theme.shadows, dialog: "none", selectedWallet: "none", walletLogo: "none", profileDetailsAction: "none" },
  };
})();

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowTheme} initialChain={activeChain} modalSize="wide" appInfo={{ appName: "Contribo" }}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
