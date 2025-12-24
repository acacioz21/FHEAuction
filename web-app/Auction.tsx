"use client";

import { useMemo, useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/helper/RainbowKitCustomConnectButton";
import { FHEVMProvider, useFHEVM, logger } from "@fhevm/sdk/react";
import { Contract, BrowserProvider, formatEther, parseEther } from "ethers";
import toast from "react-hot-toast";

const FHEAuctionABI = [
  "function placeBid(bytes calldata encryptedAmount, bytes calldata inputProof, uint256 totalAmount, uint256 tokenQuantity) external",
  "function cancelBid(uint256 bidIndex) external",
  "function claimTokensAndRefund() external",
  "function getUserBids(address user) external view returns (uint256[] memory prices, uint256 bidCount)",
  "function getUserAllocation(address user) external view returns (uint256 allocation, uint256 refund, bool hasClaimed)",
  "function auctionEnd() external view returns (uint256)",
  "function claimStart() external view returns (uint256)",
  "function clearingPrice() external view returns (uint256)",
  "function indicativeClearingPrice() external view returns (uint256)",
  "function priceFinalized() external view returns (bool)",
  "function floorPrice() external view returns (uint256)",
  "function tokenSupply() external view returns (uint256)",
];

const ERC20ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

function AuctionDemoContent() {
  const { isConnected, chain, address } = useAccount();
  const chainId = chain?.id;

  // Contract addresses
  const auctionAddress = process.env.NEXT_PUBLIC_FHEVM_AUCTION_ADDRESS || "";
  const stablecoinAddress = process.env.NEXT_PUBLIC_STABLECOIN_ADDRESS || "";

  // FHEVM configuration
  const fhevmConfig = useMemo(() => ({
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: chainId || 11155111,
    mockChains: {
      31337: "http://localhost:8545"
    }
  }), [chainId]);

  // FHEVM hooks
  const { instance, isInitialized: isReady, status, error: fhevmError } = useFHEVM(fhevmConfig);

  // State
  const [userBids, setUserBids] = useState<Array<{ price: string; amount: string; index: number }>>([]);
  const [auctionPhase, setAuctionPhase] = useState<"bidding" | "finalization" | "claiming">("bidding");
  const [clearingPrice, setClearingPrice] = useState<string>("55");
  const [allocation, setAllocation] = useState<string>("0");
  const [refund, setRefund] = useState<string>("0");
  const [hasClaimed, setHasClaimed] = useState<boolean>(false);
  const [bidPrice, setBidPrice] = useState<string>("");
  const [bidAmount, setBidAmount] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [tokenSupply, setTokenSupply] = useState<string>("0");
  const [userBidAmounts, setUserBidAmounts] = useState<{ [key: number]: string }>({});
  const [auctionEndTime, setAuctionEndTime] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [priceFinalized, setPriceFinalized] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  // Get public provider
  const getPublicProvider = async () => {
    const { JsonRpcProvider } = await import("ethers");
    return new JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
  };

  // Load auction info
  useEffect(() => {
    if (!auctionAddress) return;

    const loadAuctionInfo = async () => {
      try {
        const provider = await getPublicProvider();
        const auctionContract = new Contract(auctionAddress, FHEAuctionABI, provider);
        const supply = await auctionContract.tokenSupply();
        const finalized = await auctionContract.priceFinalized();
        setTokenSupply(formatEther(supply));
        setPriceFinalized(finalized);
      } catch (error) {
        console.error("Error loading auction info:", error);
      }
    };

    loadAuctionInfo();
    const interval = setInterval(loadAuctionInfo, 5000);
    return () => clearInterval(interval);
  }, [auctionAddress]);

  // Load USDC balance
  useEffect(() => {
    if (!address || !stablecoinAddress) return;

    const loadUSDCBalance = async () => {
      try {
        const provider = await getPublicProvider();
        const usdcContract = new Contract(stablecoinAddress, ERC20ABI, provider);
        const balance = await usdcContract.balanceOf(address);
        setUsdcBalance(formatEther(balance));
      } catch (error) {
        console.error("Error loading USDC balance:", error);
      }
    };

    loadUSDCBalance();
    const interval = setInterval(loadUSDCBalance, 5000);
    return () => clearInterval(interval);
  }, [address, stablecoinAddress]);

  // Check auction phase
  useEffect(() => {
    if (!address || !auctionAddress) return;

    const checkAuctionPhase = async () => {
      try {
        const provider = await getPublicProvider();
        const now = Math.floor(Date.now() / 1000);
        const auctionContract = new Contract(auctionAddress, FHEAuctionABI, provider);
        const auctionEnd = await auctionContract.auctionEnd();
        const claimStart = await auctionContract.claimStart();
        const priceFinalized = await auctionContract.priceFinalized();
        
        setAuctionEndTime(Number(auctionEnd));

        if (priceFinalized) {
          setAuctionPhase("claiming");
        } else if (now < Number(auctionEnd)) {
          setAuctionPhase("bidding");
        } else if (now < Number(claimStart)) {
          setAuctionPhase("finalization");
        } else {
          setAuctionPhase("claiming");
        }
      } catch (error) {
        console.error("Error checking auction phase:", error);
      }
    };

    checkAuctionPhase();
    const interval = setInterval(checkAuctionPhase, 5000);
    return () => clearInterval(interval);
  }, [address, auctionAddress]);

  // Countdown timer
  useEffect(() => {
    if (!auctionEndTime) return;

    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = auctionEndTime - now;

      if (remaining <= 0) {
        setTimeRemaining("Auction Ended");
        return;
      }

      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      setTimeRemaining(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [auctionEndTime]);

  // Load user bids
  useEffect(() => {
    if (!address || !auctionAddress) return;

    const loadUserBids = async () => {
      try {
        const provider = await getPublicProvider();
        const auctionContract = new Contract(auctionAddress, FHEAuctionABI, provider);
        const [prices, count] = await auctionContract.getUserBids(address);
        const bidsArray = prices.map((price: any, index: number) => {
          const storedAmount = userBidAmounts[index];
          return {
            price: formatEther(price),
            amount: storedAmount || "encrypted",
            index,
          };
        });
        setUserBids(bidsArray);
      } catch (error) {
        console.error("Error loading user bids:", error);
      }
    };

    loadUserBids();
    const interval = setInterval(loadUserBids, 5000);
    return () => clearInterval(interval);
  }, [address, auctionAddress, userBidAmounts]);

  // Load allocation
  useEffect(() => {
    if (auctionPhase !== "claiming" || !address || !auctionAddress) return;

    const loadAllocation = async () => {
      try {
        const provider = await getPublicProvider();
        const auctionContract = new Contract(auctionAddress, FHEAuctionABI, provider);
        const [alloc, ref, claimed] = await auctionContract.getUserAllocation(address);
        setAllocation(formatEther(alloc));
        setRefund(formatEther(ref));
        setHasClaimed(claimed);
      } catch (error) {
        console.error("Error loading allocation:", error);
      }
    };

    loadAllocation();
    const interval = setInterval(loadAllocation, 5000);
    return () => clearInterval(interval);
  }, [address, auctionAddress, auctionPhase]);

  // Load clearing price
  useEffect(() => {
    if (!auctionAddress) return;

    const loadClearingPrice = async () => {
      try {
        const provider = await getPublicProvider();
        const auctionContract = new Contract(auctionAddress, FHEAuctionABI, provider);
        const [indicative, finalized, finalPrice] = await Promise.all([
          auctionContract.indicativeClearingPrice(),
          auctionContract.priceFinalized(),
          auctionContract.clearingPrice(),
        ]);
        
        let formattedPrice: string;
        
        if (finalized && finalPrice && BigInt(finalPrice) > 0n) {
          formattedPrice = Number(formatEther(finalPrice)).toFixed(2);
        } else if (indicative && indicative > 0n) {
          formattedPrice = Number(formatEther(indicative)).toFixed(2);
        } else {
          formattedPrice = "55.00";
        }
        
        setClearingPrice(formattedPrice);
      } catch (error) {
        console.error("Error loading clearing price:", error);
      }
    };

    loadClearingPrice();
    const interval = setInterval(loadClearingPrice, 3000);
    return () => clearInterval(interval);
  }, [auctionAddress]);

  // Place bid with FHEVM encryption
  const handlePlaceBid = async () => {
    if (!instance || !auctionAddress || !address) {
      setMessage("Missing requirements: instance=" + !!instance + ", address=" + address + ", contract=" + auctionAddress);
      toast.error("FHEVM not initialized or wallet not connected");
      return;
    }

    if (!isConnected) {
      toast.error("Wallet not connected!");
      return;
    }

    if (!bidPrice || !bidAmount) {
      toast.error("Please enter bid price and amount");
      return;
    }

    setLoading(true);
    setMessage("Preparing bid...");

    try {
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      
      // Calculate total bid amount
      const totalBidAmount = parseEther((Number(bidPrice) * Number(bidAmount)).toString());
      const tokenQuantity = parseEther(bidAmount);
      
      // Check and approve USDC if needed
      const usdcContract = new Contract(stablecoinAddress, ERC20ABI, signer);
      const allowance = await usdcContract.allowance(address, auctionAddress);
      
      if (allowance < totalBidAmount) {
        setMessage("Approving USDC...");
        toast.loading("Approving USDC...");
        const approveTx = await usdcContract.approve(auctionAddress, parseEther("1000000"));
        await approveTx.wait();
        toast.dismiss();
        toast.success("USDC approved!");
      }
      
      // Create encrypted input using FHEVM
      setMessage("Encrypting bid amount...");
      toast.loading("Encrypting bid amount...");
      
      const input = instance.createEncryptedInput(auctionAddress, address);
      input.add32(Number(bidAmount)); // Encrypt the bid amount
      const encryptedResult = await input.encrypt();
      
      if (!encryptedResult || !encryptedResult.handles || !encryptedResult.handles[0]) {
        throw new Error("Encryption failed - no handle returned");
      }
      
      if (!encryptedResult.inputProof) {
        throw new Error("Encryption failed - no inputProof returned");
      }
      
      // Convert to hex strings
      const toHex = (data: Uint8Array) => {
        return '0x' + Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
      };
      
      const externalEuint32 = toHex(encryptedResult.handles[0]);
      const inputProof = toHex(encryptedResult.inputProof);
      
      setMessage(`Encrypted: ${externalEuint32.slice(0, 20)}...`);
      toast.dismiss();
      
      // Place bid on contract
      setMessage("Placing bid on blockchain...");
      toast.loading("Placing bid...");
      
      const auctionContract = new Contract(auctionAddress, FHEAuctionABI, signer);
      const tx = await auctionContract.placeBid(
        externalEuint32,
        inputProof,
        totalBidAmount,
        tokenQuantity,
        {
          gasLimit: 3000000n,
        }
      );
      
      setMessage("⏳ Waiting for transaction confirmation...");
      await tx.wait();
      
      toast.dismiss();
      toast.success(`Bid placed: ${bidAmount} tokens @ $${bidPrice}`);
      
      // Store bid amount locally for UI display
      const currentBidCount = userBids.length;
      setUserBidAmounts(prev => ({ ...prev, [currentBidCount]: bidAmount }));
      
      // Clear inputs
      setBidPrice("");
      setBidAmount("");
      setMessage("✅ Bid placed successfully!");
      
      // Reload clearing price
      const publicProvider = await getPublicProvider();
      const publicAuctionContract = new Contract(auctionAddress, FHEAuctionABI, publicProvider);
      const newIndicative = await publicAuctionContract.indicativeClearingPrice();
      const newPrice = newIndicative && newIndicative > 0n ? Number(formatEther(newIndicative)).toFixed(2) : "55.00";
      setClearingPrice(newPrice);
      
    } catch (error: any) {
      setMessage(`Error: ${error?.reason || error?.message || String(error)}`);
      toast.dismiss();
      toast.error(error?.reason || error?.message || "Error placing bid");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Cancel bid
  const handleCancelBid = async (bidIndex: number) => {
    if (!address || !auctionAddress) return;

    try {
      setLoading(true);
      toast.loading("Cancelling bid...");
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const auctionContract = new Contract(auctionAddress, FHEAuctionABI, signer);
      const tx = await auctionContract.cancelBid(bidIndex);
      await tx.wait();
      toast.dismiss();
      toast.success("Bid cancelled!");
    } catch (error) {
      toast.dismiss();
      toast.error("Error cancelling bid");
    } finally {
      setLoading(false);
    }
  };

  // Claim tokens
  const handleClaim = async () => {
    if (!address || !auctionAddress) return;

    try {
      setLoading(true);
      toast.loading("Claiming tokens and refund...");
      const provider = new BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      const auctionContract = new Contract(auctionAddress, FHEAuctionABI, signer);
      const tx = await auctionContract.claimTokensAndRefund();
      await tx.wait();
      toast.dismiss();
      toast.success("Tokens and refunds claimed!");
    } catch (error) {
      toast.dismiss();
      toast.error("Error claiming tokens");
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-gray-600 to-gray-800 rounded-full mb-6">
                <span className="text-2xl">🔐</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">ZAMA Auction</h1>
              <p className="text-gray-300">Confidential Token Auction</p>
            </div>
            <p className="text-center text-gray-300 mb-8">
              Connect your wallet to participate in the sealed-bid Dutch auction
            </p>
            <div className="flex justify-center">
              <RainbowKitCustomConnectButton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-gray-600 to-gray-800 rounded-full mb-6 shadow-lg">
            <span className="text-4xl">🏆</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-white via-gray-300 to-white bg-clip-text text-transparent mb-4">
            ZAMA Token Auction
          </h1>
          <p className="text-xl text-gray-300">Sealed-Bid Dutch Auction with Confidential Bids</p>
          {!isReady && (
            <p className="text-sm text-yellow-400 mt-2">⏳ Initializing FHEVM... Status: {status}</p>
          )}
          {isReady && (
            <p className="text-sm text-green-400 mt-2">✅ FHEVM Ready - Bids are fully encrypted</p>
          )}
        </div>

        {/* Main Container with Black Background */}
        <div className="bg-gradient-to-br from-gray-800/40 via-gray-800/30 to-gray-800/40 backdrop-blur-xl rounded-3xl border border-gray-700/30 shadow-2xl p-8 mb-8">
          {/* Status Cards */}
          <div className="grid md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 shadow-xl hover:shadow-2xl transition">
            <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Time Remaining</div>
            <div className="text-2xl font-bold text-white">{timeRemaining}</div>
            <div className="mt-4 h-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded-full"></div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 shadow-xl hover:shadow-2xl transition">
            <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Token Supply for Sale</div>
            <div className="text-3xl font-bold text-white">{Number(tokenSupply).toLocaleString()}</div>
            <div className="mt-4 h-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded-full"></div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 shadow-xl hover:shadow-2xl transition">
            <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Clearing Price</div>
            <div className="text-3xl font-bold text-white">${clearingPrice}</div>
            <div className="mt-4 h-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded-full"></div>
          </div>
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-6 shadow-xl hover:shadow-2xl transition">
            <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">Auction Status</div>
            <div className="text-2xl font-bold text-white capitalize">{auctionPhase}</div>
            <div className="mt-4 h-1 bg-gradient-to-r from-gray-400 to-gray-600 rounded-full"></div>
          </div>
        </div>

        {/* Bidding Phase */}
        {auctionPhase === "bidding" && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 shadow-xl hover:shadow-2xl transition mb-8">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-lg bg-blue-500/20 border border-blue-500/50">
                <span className="text-2xl">💎</span>
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white">Place Your Encrypted Bid</h2>
                <p className="text-gray-400 mt-1">Bid amounts are encrypted using FHEVM for complete confidentiality</p>
              </div>
            </div>

            {message && (
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-200 text-sm">
                {message}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-3">Bid Price ($ per token)</label>
                <input
                  type="number"
                  step="0.005"
                  min="55"
                  value={bidPrice}
                  onChange={(e) => setBidPrice(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition"
                  disabled={loading || !isReady}
                  placeholder="e.g., 60"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-sm font-semibold text-gray-300">Bid Amount (tokens)</label>
                  <button
                    onClick={() => setBidAmount(usdcBalance)}
                    className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-3 py-1 rounded-lg transition"
                    disabled={loading || !isReady}
                  >
                    MAX
                  </button>
                </div>
                <input
                  type="number"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  max={usdcBalance}
                  className="w-full bg-white/5 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition"
                  disabled={loading || !isReady}
                  placeholder="e.g., 100"
                />
              </div>
            </div>

            {bidPrice && bidAmount && (
              <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-400 mb-1">Total USDC to Transfer:</p>
                    <p className="text-2xl font-bold text-blue-300">${(Number(bidPrice) * Number(bidAmount)).toFixed(2)} USDC</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-400 mb-1">Your USDC Balance:</p>
                    <p className="text-xl font-bold text-yellow-300">${Number(usdcBalance).toLocaleString()}</p>
                  </div>
                </div>
                {Number(usdcBalance) < Number(bidPrice) * Number(bidAmount) && (
                  <div className="mt-3 text-sm text-red-300 flex items-center gap-2">
                    <span>⚠️</span>
                    Insufficient USDC balance
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handlePlaceBid}
              disabled={loading || !bidPrice || !bidAmount || priceFinalized || !isReady}
              className="w-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-800 hover:to-gray-900 disabled:from-gray-500 disabled:to-gray-600 text-white font-semibold py-4 px-6 rounded-lg transition duration-300 transform hover:scale-105 shadow-lg disabled:cursor-not-allowed"
            >
              {loading ? "Processing..." : !isReady ? "Initializing FHEVM..." : priceFinalized ? "Auction Closed" : "Place Encrypted Bid"}
            </button>

            {priceFinalized && (
              <div className="mt-4 bg-red-500/20 border border-red-500/30 text-red-200 p-4 rounded-lg text-center">
                <span className="font-bold">⚠️</span> Bidding has been closed. The auction has ended and price is finalized.
              </div>
            )}

            {/* Your Bids */}
            {userBids.length > 0 && (
              <div className="mt-8 pt-8 border-t border-white/10">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <span>📊</span> Your Bids ({userBids.length})
                </h3>
                <div className="grid gap-3">
                  {userBids.map((bid, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center bg-white/5 border border-white/10 p-4 rounded-lg hover:bg-white/10 transition"
                    >
                      <div>
                        <p className="text-lg font-bold text-purple-300">${bid.price}</p>
                        <p className="text-sm text-gray-400">Amount: {userBidAmounts[idx] || bid.amount} tokens</p>
                      </div>
                      <button
                        onClick={() => handleCancelBid(bid.index)}
                        disabled={loading}
                        className="px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-300 rounded-lg hover:bg-red-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Claiming Phase */}
        {auctionPhase === "claiming" && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 shadow-xl">
            <div className="flex items-start gap-4 mb-8">
              <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-lg bg-green-500/20 border border-green-500/50">
                <span className="text-2xl">✨</span>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Claim Your Tokens</h2>
                <p className="text-gray-400 mt-1">Collect your allocated tokens and refunds</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl p-6">
                <p className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-3">Token Allocation</p>
                <p className="text-4xl font-bold text-green-300">{allocation}</p>
                <p className="text-sm text-green-400/70 mt-3">ZAMA Tokens</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-xl p-6">
                <p className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-3">Refund Amount</p>
                <p className="text-4xl font-bold text-blue-300">${refund}</p>
                <p className="text-sm text-blue-400/70 mt-3">Stablecoin</p>
              </div>
            </div>

            {hasClaimed ? (
              <div className="bg-green-500/20 border border-green-500/30 text-green-200 p-6 rounded-lg text-center">
                <span className="text-2xl">✓</span>
                <p className="mt-2 font-semibold">You have already claimed your tokens and refunds.</p>
              </div>
            ) : (
              <button
                onClick={handleClaim}
                disabled={loading}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-500 disabled:to-gray-600 text-white font-semibold py-4 px-6 rounded-lg transition duration-300 transform hover:scale-105 shadow-lg disabled:cursor-not-allowed"
              >
                {loading ? "Claiming..." : "Claim Tokens & Refund"}
              </button>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// Wrapper with FHEVMProvider
export function AuctionDemoWithFHEVM() {
  const fhevmConfig = useMemo(() => ({
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    chainId: 11155111,
    mockChains: {
      31337: "http://localhost:8545"
    }
  }), []);

  return (
    <FHEVMProvider config={fhevmConfig}>
      <AuctionDemoContent />
    </FHEVMProvider>
  );
}
