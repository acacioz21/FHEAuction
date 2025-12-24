# FHEAuction - FHEVM Powered Encrypted Auction

A production-ready encrypted auction system using Fully Homomorphic Encryption (FHEVM) on Sepolia testnet.

## Features

✅ **Encrypted Bids** - All bid amounts are encrypted using FHEVM  
✅ **Fair Clearing Price** - Dutch auction mechanism with transparent price discovery  
✅ **FHEVM Powered** - 9 homomorphic operations for secure computation  
✅ **No Front-Running** - Encrypted transactions prevent bid front-running  

## Project Structure

```
FHEAuction/
├── smart-contracts/     # Solidity smart contracts
│   └── FHEAuction.sol
└── web-app/            # Next.js frontend application
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- MetaMask wallet with Sepolia testnet

### Installation

```bash
# Install dependencies
npm install

# Web app setup
cd web-app
npm install

# Smart contracts setup
cd ../smart-contracts
npm install
```

### Environment Setup

Create `.env.local`:

```
NEXT_PUBLIC_FHEVM_AUCTION_ADDRESS=0xE45cf06E00F946C45e7748fC5cd5b6893Dd10175
NEXT_PUBLIC_STABLECOIN_ADDRESS=0xF6630bbBFA0Ce31f3b1ae2C7403638668FA1bbbc
NEXT_PUBLIC_PRIVATE_KEY=your_private_key
```

### Development

```bash
# Web app
npm run dev
# Runs at http://localhost:3000

# Deploy contracts
cd smart-contracts
npm run deploy:sepolia
```

## Smart Contract Functions

### Core Auction Functions
- `placeBid()` - Place encrypted bid during bidding phase
- `cancelBid()` - Cancel a bid
- `setClearingPrice()` - Admin function to finalize price
- `claimTokensAndRefund()` - Claim allocated tokens and refund

### FHEVM Operations (9 Total)
1. `FHE.allow()` - Grant decryption permissions
2. `FHE.ge()` - Encrypted greater-than-or-equal comparison
3. `FHE.add()` - Homomorphic addition
4. `FHE.sub()` - Encrypted subtraction
5. `FHE.mul()` - Encrypted multiplication
6. `FHE.lt()` - Less-than encrypted comparison
7. `FHE.eq()` - Equality encrypted comparison
8. `FHE.gt()` - Greater-than encrypted comparison
9. `FHE.asEuint32()` - Type conversion to encrypted uint32

## Network Configuration

- **Network:** Sepolia Testnet
- **RPC:** https://ethereum-sepolia-rpc.publicnode.com
- **Chain ID:** 11155111

## Deployment to Vercel

1. Push to GitHub
2. Connect to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy automatically on push

```bash
npm run build
npm start
```

## Testing

Test different contract instances:

1. `0xf14869E0FFd074Ac4Cd4266833Ea7aF3ae131460`
2. `0xcBcC3Ac9ca71769c5FeFF693df7235aAB4F0e62b`
3. `0x357422fDe316303971fdad30749a0b16333a0c5e`
4. `0x91C3AC1d7B27EFc58401766696A0A721e223364D`
5. `0x178ca2935b0AbBE51eEdD4a6bD31F7B6FdcBDE08`

Update `NEXT_PUBLIC_FHEVM_AUCTION_ADDRESS` in `.env.local` to test different instances.

## Admin Panel

Access admin features at `/admin` (requires connected admin wallet)

- Set clearing price
- End auction early
- Extend auction duration
- View real-time auction statistics

## License

MIT
