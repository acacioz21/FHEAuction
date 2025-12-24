"use client";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-4">
          FHEAuction
        </h1>
        <p className="text-xl text-gray-400 mb-8">
          FHEVM Powered Encrypted Auction System
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <span className="flex items-center space-x-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            <span style={{color: '#10b981', fontWeight: '700'}}>Encrypted Bids</span>
          </span>
          <span className="flex items-center space-x-2">
            <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
            <span style={{color: '#3b82f6', fontWeight: '700'}}>Fair Clearing Price</span>
          </span>
          <span className="flex items-center space-x-2">
            <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
            <span style={{color: '#a855f7', fontWeight: '700'}}>FHEVM Powered</span>
          </span>
          <span className="flex items-center space-x-2">
            <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
            <span style={{color: '#f97316', fontWeight: '700'}}>No Front-Running</span>
          </span>
        </div>
      </div>
    </main>
  );
}
