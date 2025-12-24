"use client";

import { FHEVMProvider } from "@fhevm/sdk/react";
import { Auction } from "./_components/Auction";
import { useMemo } from "react";

export default function Home() {
  const fhevmConfig = useMemo(() => ({
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
    mockChains: {
      31337: "http://localhost:8545"
    }
  }), []);

  return (
    <FHEVMProvider config={fhevmConfig}>
      <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
        <Auction />
      </main>
    </FHEVMProvider>
  );
}
