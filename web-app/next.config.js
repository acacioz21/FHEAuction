/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_FHEVM_AUCTION_ADDRESS: process.env.NEXT_PUBLIC_FHEVM_AUCTION_ADDRESS,
    NEXT_PUBLIC_STABLECOIN_ADDRESS: process.env.NEXT_PUBLIC_STABLECOIN_ADDRESS,
  },
}

module.exports = nextConfig
