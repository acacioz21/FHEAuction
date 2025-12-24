"use client";

import { useState, useEffect } from "react";
import { Contract, BrowserProvider, formatEther, parseEther } from "ethers";
import toast from "react-hot-toast";

const FHEAuctionABI = [
  "function finalizePrices() external",
  "function getIndicativeClearingPrice() external view returns (uint256)",
  "function getPriceFinalized() external view returns (bool)",
  "function getTokenSupply() external view returns (uint256)",
  "function getAuctionEnd() external view returns (uint256)",
  "function indicativeClearingPrice() external view returns (uint256)",
  "function priceFinalized() external view returns (bool)",
  "function floorPrice() external view returns (uint256)",
  "function tokenSupply() external view returns (uint256)",
  "function auctionEnd() external view returns (uint256)",
];

export default function AdminPage() {
  const [auctionAddress, setAuctionAddress] = useState<string>("");
  const [clearingPrice, setClearingPrice] = useState<string>("0");
  const [priceFinalized, setPriceFinalized] = useState<boolean>(false);
  const [tokenSupply, setTokenSupply] = useState<string>("0");
  const [auctionEndTime, setAuctionEndTime] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const auctionAddressEnv = process.env.NEXT_PUBLIC_FHEVM_AUCTION_ADDRESS || "";

  useEffect(() => {
    setAuctionAddress(auctionAddressEnv);
    loadAuctionData();
  }, []);

  const getPublicProvider = async () => {
    const { JsonRpcProvider } = await import("ethers");
    return new JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  };

  const loadAuctionData = async () => {
    if (!auctionAddressEnv) {
      toast.error("Auction address not configured");
      return;
    }

    try {
      const provider = await getPublicProvider();
      const auctionContract = new Contract(auctionAddressEnv, FHEAuctionABI, provider);
      
      const [supply, finalized, floor, auctionEnd, indicative] = await Promise.all([
        auctionContract.tokenSupply(),
        auctionContract.priceFinalized(),
        auctionContract.floorPrice(),
        auctionContract.auctionEnd(),
        auctionContract.indicativeClearingPrice(),
      ]);

      setTokenSupply(formatEther(supply));
      setPriceFinalized(finalized);
      setAuctionEndTime(Number(auctionEnd));
      setClearingPrice(formatEther(indicative));
    } catch (error) {
      console.error("Error loading auction data:", error);
      toast.error("Failed to load auction data");
    }
  };

  const handleFinalizePrices = async () => {
    if (!window.ethereum) {
      toast.error("MetaMask not found");
      return;
    }

    setLoading(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const auctionContract = new Contract(auctionAddressEnv, FHEAuctionABI, signer);
      
      toast.loading("Finalizing prices...");
      const tx = await auctionContract.finalizePrices();
      await tx.wait();
      
      toast.dismiss();
      toast.success("Prices finalized!");
      loadAuctionData();
    } catch (error: any) {
      toast.dismiss();
      toast.error(error?.reason || "Error finalizing prices");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold text-white mb-12">Admin Dashboard</h1>

        <div className="grid grid-cols-2 gap-6 mb-12">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
            <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Token Supply for Sale</div>
            <div className="text-3xl font-bold text-white">{Number(tokenSupply).toLocaleString()}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
            <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Indicative Clearing Price</div>
            <div className="text-3xl font-bold text-white">${clearingPrice}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
            <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Auction End Time</div>
            <div className="text-xl font-bold text-white">{new Date(auctionEndTime * 1000).toLocaleString()}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
            <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Current Phase</div>
            <div className={`text-2xl font-bold ${priceFinalized ? 'text-green-400' : 'text-yellow-400'}`}>
              {priceFinalized ? '✓ Finalized' : 'Bidding'}
            </div>
          </div>
        </div>

        <button
          onClick={handleFinalizePrices}
          disabled={loading || priceFinalized}
          className="w-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 disabled:from-gray-500 disabled:to-gray-600 text-white font-semibold py-4 px-6 rounded-lg transition duration-300 transform hover:scale-105 shadow-lg disabled:cursor-not-allowed"
        >
          {loading ? "Processing..." : priceFinalized ? "Price Already Finalized" : "Finalize Prices"}
        </button>

        <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-blue-300 text-sm">
            <strong>Contract Address:</strong> {auctionAddress}
          </p>
        </div>
      </div>
    </main>
  );
}
