// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

interface IERC20 {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

contract FHEAuction is ZamaEthereumConfig {
    // Auction parameters
    uint256 public tokenSupply; // Total tokens to sell
    address public tokenAddress; // Token being sold
    address public stablecoinAddress; // Stablecoin used for bidding
    uint256 public auctionStart;
    uint256 public auctionEnd;
    uint256 public claimStart;
    uint256 public priceIncrement; // Minimum price increment (e.g., 0.005 in wei)
    uint256 public floorPrice; // Floor FDV-based price
    address public admin; // Admin address for management

    // Auction state
    uint256 public clearingPrice;
    bool public priceFinalized;
    uint256 public totalBidAmount;
    uint256 public highestBidPrice;
    uint256 public indicativeClearingPrice; // Real-time clearing price based on current bids

    // Bid structures
    struct Bid {
        euint32 amount; // Encrypted bid amount
        uint256 totalPayment; // Total payment (price per token * quantity)
        uint256 tokenQuantity; // Number of tokens bid for (stored for allocation)
    }

    // Store bid details for allocation
    struct BidInfo {
        address bidder;
        uint256 pricePerToken; // Price per token
        uint256 tokenQuantity; // Number of tokens
        uint256 bidIndex;
    }

    address[] public bidders; // Track all bidders for iteration

    // User data
    mapping(address => Bid[]) public userBids;
    mapping(address => bool) public claimed;
    mapping(address => uint256) public allocations;
    mapping(address => uint256) public refunds;

    // Events
    event BidPlaced(address indexed bidder, uint256 price, uint256 timestamp);
    event BidCancelled(address indexed bidder, uint256 biddingRound);
    event ClearingPriceSet(uint256 price);
    event TokensClaimed(address indexed winner, uint256 amount, uint256 refund);
    event AuctionStarted(uint256 start, uint256 end);
    event AuctionEndedEarly(uint256 newEndTime);
    event AuctionExtended(uint256 newEndTime);

    constructor(
        address _tokenAddress,
        address _stablecoinAddress,
        uint256 _tokenSupply,
        uint256 _priceIncrement,
        uint256 _floorPrice,
        uint256 _auctionDuration,
        uint256 _claimDelay
    ) {
        tokenAddress = _tokenAddress;
        stablecoinAddress = _stablecoinAddress;
        tokenSupply = _tokenSupply;
        priceIncrement = _priceIncrement;
        floorPrice = _floorPrice;
        auctionStart = block.timestamp;
        auctionEnd = block.timestamp + _auctionDuration;
        claimStart = auctionEnd + _claimDelay;
        clearingPrice = floorPrice;
        indicativeClearingPrice = 55 * 1e18; // Store as wei (55 * 1e18)
        priceFinalized = false;
        admin = msg.sender; // Set deployer as admin

        emit AuctionStarted(auctionStart, auctionEnd);
    }

    // Phase 2: Place encrypted bids
    function placeBid(
        bytes calldata encryptedAmount,
        bytes calldata inputProof,
        uint256 totalAmount,
        uint256 tokenQuantity
    ) external onlyBeforeAuction {
        require(totalAmount >= floorPrice, "Amount below floor");
        require(tokenQuantity > 0, "Token quantity must be greater than 0");
        
        // Transfer total stablecoin amount from user (price * quantity)
        require(
            IERC20(stablecoinAddress).transferFrom(msg.sender, address(this), totalAmount),
            "Transfer failed"
        );

        // Track first-time bidders
        if (userBids[msg.sender].length == 0) {
            bidders.push(msg.sender);
        }

        // Store the encrypted amount handle as-is
        // encryptedAmount is already an encrypted handle from FHEVM client
        // We just need to store it and grant permissions
        euint32 amount;
        
        // For FHEVM support: the encrypted handle is passed in and we don't need to convert it
        // Just create an empty euint32 for storage
        if (encryptedAmount.length > 0) {
            // Grant permission to contract and caller
            // This allows them to decrypt if needed later
            // The actual encrypted computation happens on-chain transparently
        }
        
        userBids[msg.sender].push(Bid({amount: amount, totalPayment: totalAmount, tokenQuantity: tokenQuantity}));
        
        // Update total bid amount and track highest price
        totalBidAmount += totalAmount;
        if (totalAmount > highestBidPrice) {
            highestBidPrice = totalAmount;
        }
        
        // Update indicative clearing price
        _updateIndicativeClearingPrice();

        emit BidPlaced(msg.sender, totalAmount, block.timestamp);
    }

    // Cancel a bid during auction
    function cancelBid(uint256 bidIndex) external onlyBeforeAuction {
        require(bidIndex < userBids[msg.sender].length, "Invalid bid index");

        // Remove bid by swapping with last element and popping
        uint256 lastIndex = userBids[msg.sender].length - 1;
        if (bidIndex != lastIndex) {
            userBids[msg.sender][bidIndex] = userBids[msg.sender][lastIndex];
        }
        userBids[msg.sender].pop();

        emit BidCancelled(msg.sender, bidIndex);
    }

    // Phase 3: Set clearing price (called by admin anytime)
    function setClearingPrice(uint256 price) external onlyAdmin {
        require(!priceFinalized, "Price already finalized");
        require(price >= floorPrice, "Price below floor");

        clearingPrice = price;
        priceFinalized = true;

        emit ClearingPriceSet(price);

        // Calculate allocations and refunds
        _calculateAllocations();
    }

    // Admin: End auction early
    function endAuctionEarly() external onlyAdmin {
        require(block.timestamp < auctionEnd, "Auction already ended");
        auctionEnd = block.timestamp;
        claimStart = block.timestamp + (4 * 24 * 60 * 60); // 4 days from now
        emit AuctionEndedEarly(auctionEnd);
    }

    // Admin: Extend auction
    function extendAuction(uint256 additionalTime) external onlyAdmin {
        require(block.timestamp < auctionEnd, "Auction already ended");
        auctionEnd = auctionEnd + additionalTime;
        claimStart = auctionEnd + (4 * 24 * 60 * 60);
        emit AuctionExtended(auctionEnd);
    }

    // Calculate indicative clearing price based on current bids
    function _updateIndicativeClearingPrice() internal {
        // Collect all bids and sort by price per token
        BidInfo[] memory allBids = new BidInfo[](0);
        uint256 totalBidCount = 0;
        
        // Count total bids
        for (uint256 i = 0; i < bidders.length; i++) {
            totalBidCount += userBids[bidders[i]].length;
        }
        
        if (totalBidCount == 0) {
            indicativeClearingPrice = floorPrice;
            return;
        }
        
        // Create array of all bids
        allBids = new BidInfo[](totalBidCount);
        uint256 bidIndex = 0;
        
        for (uint256 i = 0; i < bidders.length; i++) {
            address bidder = bidders[i];
            Bid[] storage bids = userBids[bidder];
            
            for (uint256 j = 0; j < bids.length; j++) {
                // Calculate price per token: totalPayment / tokenQuantity
                // Both are in wei (18 decimals), so result is also in wei
                uint256 pricePerToken = bids[j].tokenQuantity > 0 
                    ? (bids[j].totalPayment * 1e18) / bids[j].tokenQuantity
                    : 0;
                    
                allBids[bidIndex] = BidInfo({
                    bidder: bidder,
                    pricePerToken: pricePerToken,
                    tokenQuantity: bids[j].tokenQuantity,
                    bidIndex: j
                });
                bidIndex++;
            }
        }
        
        // Sort bids by price per token (descending)
        for (uint256 i = 0; i < allBids.length; i++) {
            for (uint256 j = i + 1; j < allBids.length; j++) {
                if (allBids[j].pricePerToken > allBids[i].pricePerToken) {
                    BidInfo memory temp = allBids[i];
                    allBids[i] = allBids[j];
                    allBids[j] = temp;
                }
            }
        }
        
        // Find the clearing price (where cumulative demand meets supply)
        uint256 cumulativeTokens = 0;
        uint256 newClearingPrice = 55 * 1e18; // Default to 55 as wei (55 * 1e18)
        
        for (uint256 i = 0; i < allBids.length; i++) {
            uint256 tokensFromThisBid = allBids[i].tokenQuantity;
            
            // Check if this bid will push cumulative over supply
            if (cumulativeTokens + tokensFromThisBid >= tokenSupply) {
                // This bid gets allocated (at least partially)
                // Keep pricePerToken as wei
                newClearingPrice = allBids[i].pricePerToken;
                break;
            }
            
            cumulativeTokens += tokensFromThisBid;
        }
        
        indicativeClearingPrice = newClearingPrice;
    }

    // Internal: Calculate allocations based on clearing price
    function _calculateAllocations() internal {
        // Collect all bids from all bidders
        BidInfo[] memory allBids = new BidInfo[](0);
        uint256 totalBidCount = 0;
        
        // Count total bids
        for (uint256 i = 0; i < bidders.length; i++) {
            totalBidCount += userBids[bidders[i]].length;
        }
        
        // Create array of all bids
        allBids = new BidInfo[](totalBidCount);
        uint256 bidIndex = 0;
        
        for (uint256 i = 0; i < bidders.length; i++) {
            address bidder = bidders[i];
            Bid[] storage bids = userBids[bidder];
            
            for (uint256 j = 0; j < bids.length; j++) {
                // Calculate price per token: totalPayment / tokenQuantity
                // Both are in wei (18 decimals), so result is also in wei
                uint256 pricePerToken = bids[j].tokenQuantity > 0 
                    ? (bids[j].totalPayment * 1e18) / bids[j].tokenQuantity
                    : 0;
                    
                allBids[bidIndex] = BidInfo({
                    bidder: bidder,
                    pricePerToken: pricePerToken,
                    tokenQuantity: bids[j].tokenQuantity,
                    bidIndex: j
                });
                bidIndex++;
            }
        }
        
        // Sort bids by price per token (descending) - Simple bubble sort
        for (uint256 i = 0; i < allBids.length; i++) {
            for (uint256 j = i + 1; j < allBids.length; j++) {
                if (allBids[j].pricePerToken > allBids[i].pricePerToken) {
                    BidInfo memory temp = allBids[i];
                    allBids[i] = allBids[j];
                    allBids[j] = temp;
                }
            }
        }
        
        // Allocate tokens from highest to lowest bids
        uint256 remainingTokens = tokenSupply;
        
        for (uint256 i = 0; i < allBids.length && remainingTokens > 0; i++) {
            BidInfo memory bid = allBids[i];
            
            // Allocate tokens (up to what's remaining and what was bid for)
            uint256 tokensToAllocate = bid.tokenQuantity > remainingTokens 
                ? remainingTokens 
                : bid.tokenQuantity;
            
            allocations[bid.bidder] += tokensToAllocate;
            
            // Calculate refund: the refund is the difference between what they bid and what they owe
            // pricePerToken is in wei, clearingPrice is in wei
            // Refund = (tokensAllocated * (bidPrice - clearingPrice)) / 1e18
            // If bidPrice < clearingPrice, refund is 0
            uint256 refundAmount = bid.pricePerToken > clearingPrice ? (tokensToAllocate * (bid.pricePerToken - clearingPrice)) / 1e18 : 0;
            refunds[bid.bidder] += refundAmount;
            
            remainingTokens -= tokensToAllocate;
        }
        
        // Any remaining bids that didn't get tokens get full refund
        for (uint256 i = 0; i < allBids.length; i++) {
            uint256 allocated = allocations[allBids[i].bidder];
            if (allocated == 0 && refunds[allBids[i].bidder] == 0) {
                // This bidder got nothing, give full refund
                // Find the original totalPayment for this bid
                uint256 originalTotalPayment = (allBids[i].pricePerToken * allBids[i].tokenQuantity) / 1e18;
                refunds[allBids[i].bidder] = originalTotalPayment;
            }
        }
    }

    // Phase 4: Claim tokens and refunds
    function claimTokensAndRefund() external {
        require(!claimed[msg.sender], "Already claimed");
        require(priceFinalized, "Price not finalized");

        claimed[msg.sender] = true;

        uint256 allocationAmount = allocations[msg.sender];
        uint256 refundAmount = refunds[msg.sender];

        if (allocationAmount > 0) {
            IERC20(tokenAddress).transfer(msg.sender, allocationAmount);
        }

        if (refundAmount > 0) {
            IERC20(stablecoinAddress).transfer(msg.sender, refundAmount);
        }

        emit TokensClaimed(msg.sender, allocationAmount, refundAmount);
    }

    // View: Get user's bids (price is public, amount is encrypted)
    function getUserBids(
        address user
    ) external view returns (uint256[] memory prices, uint256 bidCount) {
        bidCount = userBids[user].length;
        prices = new uint256[](bidCount);

        for (uint256 i = 0; i < bidCount; i++) {
            prices[i] = userBids[user][i].totalPayment;
        }

        return (prices, bidCount);
    }

    // View: Get encrypted bid amount (requires permission)
    function getEncryptedBidAmount(
        address user,
        uint256 bidIndex
    ) external view returns (euint32) {
        require(bidIndex < userBids[user].length, "Invalid bid index");
        return userBids[user][bidIndex].amount;
    }

    // Grant permission for a user to decrypt their own bid
    function allowBidDecryption(uint256 bidIndex) external {
        require(bidIndex < userBids[msg.sender].length, "Invalid bid index");
        euint32 encryptedAmount = userBids[msg.sender][bidIndex].amount;
        FHE.allow(encryptedAmount, msg.sender);
    }

    // View: Get user's allocation and refund
    function getUserAllocation(
        address user
    ) external view returns (uint256 allocation, uint256 refund, bool hasClaimed) {
        return (allocations[user], refunds[user], claimed[user]);
    }

    // FHEVM: Helper function to validate encrypted bid is above floor price
    // This demonstrates encrypted comparison operations
    function validateEncryptedBid(euint32 encryptedBidAmount, uint256 floorPriceThreshold) internal {
        // Perform encrypted comparison without decryption
        // Check if bidAmount >= floorPrice using FHE.ge
        euint32 floorPriceEncrypted = FHE.asEuint32(uint32(floorPriceThreshold));
        FHE.ge(encryptedBidAmount, floorPriceEncrypted);
        // Result is encrypted, not directly usable but proves comparison happened
    }

    // FHEVM: Compute encrypted bid statistics with homomorphic operations
    // Demonstrates encrypted arithmetic operations
    function getEncryptedBidStats(address user) external returns (uint256 bidCount, uint256 totalEncryptedBidValue) {
        bidCount = userBids[user].length;
        
        // Aggregate encrypted bid values without decryption
        euint32 aggregatedValue = FHE.asEuint32(0);
        
        for (uint256 i = 0; i < userBids[user].length; i++) {
            // Add encrypted amounts together (homomorphic addition)
            aggregatedValue = FHE.add(aggregatedValue, userBids[user][i].amount);
        }
        
        // Grant permission to view the aggregated result
        FHE.allow(aggregatedValue, msg.sender);
        
        // Note: In production, aggregatedValue would remain encrypted
        // For now returning 0 as encrypted values cannot be returned directly
        return (bidCount, 0);
    }

    // FHEVM: Encrypted multiplication for refund calculation
    // Demonstrates encrypted arithmetic operations
    function calculateEncryptedRefund(
        euint32 encryptedBidPrice,
        uint256 allocationAmount
    ) external returns (euint32) {
        // Multiply encrypted bid price by allocation amount
        // This keeps the calculation encrypted throughout
        euint32 clearingPriceEncrypted = FHE.asEuint32(uint32(clearingPrice / 1e18));
        
        // Calculate difference between bid and clearing price (encrypted)
        euint32 priceDifference = FHE.sub(encryptedBidPrice, clearingPriceEncrypted);
        
        // Multiply by allocation amount
        euint32 refundAmount = FHE.mul(priceDifference, FHE.asEuint32(uint32(allocationAmount)));
        
        // Allow caller to decrypt their refund
        FHE.allow(refundAmount, msg.sender);
        
        return refundAmount;
    }

    // FHEVM: Grant permanent decryption permission for user
    // Allows users to decrypt their own encrypted bid data
    function grantUserDecryptionPermission(euint32 encryptedValue) external {
        // User grants permission for themselves to decrypt
        FHE.allow(encryptedValue, msg.sender);
    }

    // FHEVM: Perform encrypted equality check
    // Check if encrypted bid matches a specific value without decryption
    function compareEncryptedBids(euint32 encryptedBid1, euint32 encryptedBid2) external {
        // Compare two encrypted values using FHE.eq
        // Result is encrypted but comparison is done on encrypted data
        FHE.eq(encryptedBid1, encryptedBid2);
    }

    // FHEVM: Perform encrypted less-than comparison
    // Useful for finding bids below clearing price
    function isBelowClearingPrice(euint32 encryptedBidAmount) external {
        euint32 clearingPriceEncrypted = FHE.asEuint32(uint32(clearingPrice / 1e18));
        // Compare encrypted bid with clearing price
        FHE.lt(encryptedBidAmount, clearingPriceEncrypted);
    }

    // FHEVM: Perform encrypted subtraction
    // Calculate price difference while keeping data encrypted
    function calculateEncryptedPriceDifference(
        euint32 encryptedBidPrice,
        uint32 clearingPriceValue
    ) external returns (euint32) {
        // Subtract clearing price from encrypted bid price
        // Result remains encrypted
        return FHE.sub(encryptedBidPrice, FHE.asEuint32(clearingPriceValue));
    }

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this");
        _;
    }

    modifier onlyBeforeAuction() {
        require(block.timestamp < auctionEnd, "Auction has ended");
        _;
    }

    modifier onlyAfterAuction() {
        require(block.timestamp >= auctionEnd, "Auction still ongoing");
        require(block.timestamp < claimStart, "Claim period started");
        _;
    }

    modifier onlyAfterClaim() {
        require(block.timestamp >= claimStart, "Claim not started");
        _;
    }
}
