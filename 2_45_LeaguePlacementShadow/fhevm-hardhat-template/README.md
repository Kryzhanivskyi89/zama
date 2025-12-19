# 🏅 League Placement Shadow — Zama FHEVM DApp 

League Placement Shadow lets competitive players submit encrypted tournament points, while the contract assigns league placement homomorphically (Iron / Bronze / Silver / Gold). The system only reveals the league code; raw points are never exposed on-chain. Players can privately decrypt their placement to see the exact score if desired. This approach guarantees fair ranking without compromising player statistics or revealing sensitive ranking data publicly.

--
## Contract
- **Contract name:** `LeaguePlacementShadow`
- **Network:** Sepolia
- **Contract address:** `0x87B7DF0144269768A58A15A10Bb2c57e92DEcEDB` 
- **Relayer SDK:** `@zama-fhe/relayer-sdk` (v0.3.x required)

---

## Features
- Encrypted submission of tournament points.
- Homomorphic league classification:
  - Iron, Bronze, Silver, Gold (codes 0..3).
- Store encrypted league handle per player.
- Player-only decryption or public release for leaderboards.

Zero knowledge of inputs — full privacy preserved

Modern dual-column glassmorphic UI built with pure HTML + CSS

Powered by Zama Relayer SDK v0.3.0 and Ethers.js v6

🛠 Quick Start
Prerequisites

Node.js ≥ 20

npm / yarn / pnpm

MetaMask or any injected Ethereum-compatible wallet

## Installation (development)
1. Clone repo  
```bash
git clone <repo-url>
cd health-metric-zone
Install dependencies (example)

npm install
# or
yarn install

Install Zama Relayer SDK on frontend

npm install @zama-fhe/relayer-sdk @fhevm/solidity ethers

Build & deploy (Hardhat)

npx hardhat clean
npx hardhat compile
npx hardhat deploy --network sepolia
Make sure your hardhat.config.js includes the Zama config and the Solidity version ^0.8.27.

Frontend (Quickstart)
Open frontend/index.html.

Set CONFIG.CONTRACT_ADDRESS if needed.

Serve with a local static server (for correct COOP/COEP headers required by relayer web workers):

# Example using serve
npx serve frontend
Open in browser, connect MetaMask, encrypt inputs via relayer.createEncryptedInput(...), submit and test publicDecrypt([handle]).

Important Notes (Relayer SDK 0.3.x)
publicDecrypt() accepts only an array of bytes32 ciphertexts: await relayer.publicDecrypt([ "0x......" ]).

Always use FHE.toBytes32() from contract matchHandle()/zoneHandle() and clean the handle on the frontend:

function cleanHandle(raw) { return raw.trim().split("\n").pop().trim(); }
Extract clear value from out.clearValues[handle] or out.clearValues[handle.toLowerCase()].

Security & Privacy
The contract never stores plain health data.

FHE.allow and FHE.allowThis are used so only authorized parties (owner + contract) can decrypt.

Users must protect their wallets and local attestation proofs — if lost, privacy is still preserved (attestations are on inputs).

Common Commands:

Compile: npx hardhat compile
Deploy: npx hardhat deploy --network sepolia
Serve frontend: npx serve frontend or any static server

Troubleshooting
If publicDecrypt returns undefined: ensure you passed a clean bytes32 handle and that the contract used FHE.makePubliclyDecryptable(...).
If Relayer worker fails in browser: ensure server sends Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp headers.

📁 Project Structure
tinderdao-private-match/
├── contracts/
│   └── LeaguePlacementShadow.sol            # Main FHE-enabled matchmaking contract
├── deploy/                                  # Deployment scripts
├── frontend/                                # Web UI (FHE Relayer integration)
│   └── index.html
├── hardhat.config.js                        # Hardhat + FHEVM config
└── package.json                             # Dependencies and npm scripts

📜 Available Scripts
Command	Description
npm run compile	Compile all smart contracts
npm run test	Run unit tests
npm run clean	Clean build artifacts
npm run start	Launch frontend locally
npx hardhat deploy --network sepolia	Deploy to FHEVM Sepolia testnet
npx hardhat verify	Verify contract on Etherscan
🔗 Frontend Integration

The frontend (pure HTML + vanilla JS) uses:

@zama-fhe/relayer-sdk v0.3.0

ethers.js v6.13

Web3 wallet (MetaMask) connection

Workflow:

Connect wallet

Encrypt & Submit a preference query (desired criteria)

Compute match handle via computeMatchHandle()

Make public the result using makeMatchPublic()

Publicly decrypt → get final result (MATCH ✅ / NO MATCH ❌)

🧩 FHEVM Highlights

Encrypted types: euint8, euint16

Homomorphic operations: FHE.eq, FHE.and, FHE.or, FHE.gt, FHE.lt

Secure access control using FHE.allow & FHE.allowThis

Public decryption enabled with FHE.makePubliclyDecryptable

Frontend encryption/decryption handled via Relayer SDK proofs

📚 Documentation

Zama FHEVM Overview

Relayer SDK Guide

Solidity Library: FHE.sol

Ethers.js v6 Documentation

🆘 Support

🐛 GitHub Issues: Report bugs or feature requests

💬 Zama Discord: discord.gg/zama-ai
 — community help

📄 License

BSD-3-Clause-Clear License
See the LICENSE
 file for full details.