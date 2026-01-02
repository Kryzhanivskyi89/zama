# 💼 Hidden Performance Bonus — Zama FHEVM DApp

Hidden Performance Bonus lets employees submit encrypted KPI metrics to determine performance bonuses without exposing raw data. 
The smart contract compares encrypted KPI inputs against encrypted thresholds or targets and outputs only a bonus tier code (0–3). 
Employees keep full control over their encrypted inputs and can privately decrypt the final tier; 
HR sees only the assigned tier code for payroll decisions. 
This provides provable privacy and auditable outcomes while removing the need to share sensitive performance metrics.


## Contract
- **Contract name:** `HiddenPerformanceBonus`
- **Network:** Sepolia
- **Contract address:** `0xa863BA651FF504dB9C8Dc7182Af66E4943ca4cCc` 
- **Relayer SDK:** `@zama-fhe/relayer-sdk` (v0.3.x required)

---

## Features
- Encrypted KPI submission (example metrics: productivity, quality, timeliness).
- Homomorphic comparison with encrypted targets and thresholds.
- Final bonus tier codes (0..3) stored as encrypted handles (bytes32).
- Employee-only decryption or optional public release for audit.

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


# Example using serve

Frontend Usage

Open frontend/index.html.
Ensure CONFIG.CONTRACT_ADDRESS is set.

Connect MetaMask, then:
Create encrypted inputs with relayer.createEncryptedInput(contractAddress, userAddress).
Add values (enc.add8(), enc.add16() etc. depending on metric size).
await enc.encrypt() → send handles + attestation to submit...() contract method.
To decrypt public handles: await relayer.publicDecrypt([handle]).

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
│   └── HiddenPerformanceBonus.sol                 # Main FHE-enabled matchmaking contract
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