Zama FHEVM dApps Collection

A curated monorepo of ~27 Fully Homomorphic Encryption (FHE)–powered dApps built on top of Zama’s FHEVM. Each mini‑project showcases a different privacy‑preserving on‑chain use case: health metrics, HR bonuses, gaming, rankings, DAO analytics, confidential matching, age‑gating, and more. All logic runs on encrypted data; smart contracts never see plaintext.

All dApps share a common structure:

FHE‑enabled Solidity contract (FHEVM, FHE.sol, euint* types)

Hardhat setup for compile/deploy/verify

Minimal frontend (HTML + JS) wired with @zama-fhe/relayer-sdk v0.3.x and ethers v6

Live Demo
The entire collection is deployed as static demos via GitHub Pages:

Gallery landing page:
https://kryzhanivskyi89.github.io/zama/

Each card in the gallery links to an individual dApp, for example:

https://kryzhanivskyi89.github.io/zama/deployed/2_43_HealthMetricZone/

https://kryzhanivskyi89.github.io/zama/deployed/2_50_EncryptedDiceArena/

https://kryzhanivskyi89.github.io/zama/deployed/78_AgeGatedNFT/

Every dApp page is a static build of the corresponding frontend, talking to its FHEVM smart contract on chain.

DApps Overview
High‑level categories and examples:

🧪 Health & metrics

Health Metric Zone – encrypted vital signs → homomorphic zone classification (normal / warning / danger) without ever exposing raw measurements.

Secret Health Metrics – encrypted health‑compatibility matching (age group, BMI, blood pressure indices), fully processed on chain.

💼 HR, productivity, loyalty

Hidden Performance Bonus – encrypted KPIs mapped to bonus tiers (0–3); HR only sees the tier, not the underlying metrics.

Private Cashback Tier – encrypted card turnover mapped to cashback tiers (1% / 2% / 3%) with no plaintext amounts on chain.

🧮 Ratings, thresholds, gates

League Placement Shadow – encrypted tournament points → league assignment (Iron / Bronze / Silver / Gold).

Private Chess Rating Gate – encrypted ELO rating checked against encrypted tournament thresholds (admitted / rejected).

FHE Jackpot Threshold – encrypted jackpot threshold with binary ready / not yet feedback to players.

🎮 Games, RNG, gamification

Probability Twist Wheel – roulette‑style game using encrypted stakes and randomness.

Encrypted Dice Arena – player vs bot dice rolls, both encrypted; only lose / draw / win is revealed.

Secret Memory Match, Encrypted Puzzle Steps, Hidden Door Code,
Private Coin Flipper vs House, Secret Weight Guess – various puzzle/guess/RNG mechanics with fully private state and attempts.

🧭 Geolocation & risk

Secret Risk Map – encrypted coordinates checked against encrypted risk regions (safe / risky / dangerous) with no map or coordinates revealed.

📚 Education

Hidden Grade Release – encrypted test scores → encrypted final grade and pass flag, with optional public/non‑public release policies.

🧾 Business logic, filters, DAO tooling

Confidential Client Filter – privacy‑preserving client screening (isCorporate AND turnover ≥ threshold) over encrypted profiles.

Encrypted Certification Filter – encrypted aggregation of qualification levels.

PrivateDAOReporting – encrypted DAO metrics with on‑chain aggregation and private analytics.

PrivateTrustChain – encrypted reputation and trust‑chain across participants.

🎟️ Age gating & identity

AgeGatedNFT – FHE‑based age verification for NFT minting; the contract only learns “age ≥ required?”, never the user’s actual age.

🤝 Marketplaces & matching

BlindFreelanceMatch – encrypted freelance marketplace: skills, experience, rates, and budgets stay fully encrypted.

Private Subscription Calibration – FHE‑based subscription plan calibration from encrypted user preferences.

TinderDAO Private Match – confidential matching for dating/DAO profiles using FHEVM.

PrivateOpenSourceRewards / PrivateContributionRewards / OpenSourceRewards – private reward systems for OSS contributors.

PrivateDonorMatch – donor–project matching on encrypted amounts and priorities.

Tech Stack
Common stack across all dApps:

Smart contracts

Solidity (≥ 0.8.27) with FHEVM support

@fhevm/solidity (FHE.sol, euint8, euint16, euint32, …)

Homomorphic operators: FHE.eq, FHE.gt, FHE.lt, FHE.and, FHE.or, etc.

FHE access control via FHE.allow / FHE.allowThis

Public decryptability via FHE.makePubliclyDecryptable(...) when needed

Dev tooling

Hardhat for compile, testing, and deployment (e.g. to FHEVM‑enabled Sepolia)

Deployment and verification scripts per dApp

Frontend

Pure HTML + CSS + vanilla JS

@zama-fhe/relayer-sdk v0.3.x for client‑side encryption, attestations, and decryption

ethers v6 for contract interaction

MetaMask / injected EVM wallet

Repository Structure
Simplified layout:

zama/
├── 2_43_HealthMetricZone/
│   └── fhevm-hardhat-template/
│       ├── contracts/
│       ├── deploy/
│       ├── frontend/
│       │   └── public/          # static frontend build
│       ├── hardhat.config.js
│       └── package.json
├── 2_44_HiddenPerformanceBonus/
│   └── fhevm-hardhat-template/
│       └── ...
├── ...
├── 98_PrivateDonorMatch/
│   └── fhevm-hardhat-template/
│       └── ...
├── deployed/
│   ├── 2_43_HealthMetricZone/   # copied frontend/public for GitHub Pages
│   ├── 2_44_HiddenPerformanceBonus/
│   ├── ...
│   └── 98_PrivateDonorMatch/
├── data.js                      # metadata for all dApps (slug, title, tag, chain, description)
└── index.html                   # gallery landing page (maps data.js → cards)
Each dApp folder is a self‑contained Hardhat project based on fhevm-hardhat-template.

Working With a Single dApp
Example: Health Metric Zone

bash
git clone https://github.com/Kryzhanivskyi89/zama.git
cd zama/2_43_HealthMetricZone/fhevm-hardhat-template
Install dependencies:

bash
npm install
# or
yarn install
Compile and deploy:

bash
npx hardhat clean
npx hardhat compile
npx hardhat deploy --network sepolia
Serve the frontend (with COOP/COEP headers for relayer web workers):

bash
npx serve frontend
# or any static server with correct headers
Update frontend config (e.g. frontend/index.html or a config file):

set CONFIG.CONTRACT_ADDRESS to the deployed contract address

ensure @zama-fhe/relayer-sdk v0.3.x is used on the frontend

Common FHE patterns:

Encrypt inputs on the frontend:

relayer.createEncryptedInput() → enc.add16() / enc.add8() … for encrypted payload

send encrypted handles + attestation to the contract

Only encrypted state is stored on chain (euint*, encrypted handles)

Decryption:

private: via relayer and wallet that owns the ciphertext

public: via relayer.publicDecrypt([handle]) if the contract enabled public decryption

Adding a New dApp to the Gallery
Create a new dApp folder with fhevm-hardhat-template and implement the contract + frontend.

After building the frontend (or if you already have frontend/public), export it to deployed/:

bash
mkdir -p deployed/<NewDappSlug>
cp -R <NewDappSlug>/fhevm-hardhat-template/frontend/public/* deployed/<NewDappSlug>/
Add a new entry to data.js:

js
{
  slug: "<NewDappSlug>",
  title: "NN · DApp Name",
  tag: "Category / domain",
  chain: "FHEVM · Domain",
  description: "Short one-paragraph description of what is encrypted and what the contract computes."
},
Commit and push:

bash
git add deployed/<NewDappSlug> data.js
git commit -m "Add <NewDappSlug> dApp to gallery"
git push origin main
The gallery (index.html) automatically maps DAPPS from data.js into cards; no extra HTML changes are needed.

Security & Privacy Principles
Across the collection, all dApps follow the same privacy model:

Sensitive values (health metrics, age, performance KPIs, budgets, ratings, etc.) never appear in plaintext on chain.

All comparisons and aggregations are done directly on encrypted types using FHEVM.

Decryption rights are explicitly controlled through FHE access control (FHE.allow, FHE.allowThis).

Public decryption is opt‑in, used only where transparent outcomes are desirable (e.g. game result verification, public badges).

License
Each individual dApp inherits the licensing terms of the base fhevm-hardhat-template and BSD‑3‑Clause‑Clear (as in the original Zama templates, unless specified otherwise in the dApp folder).

This monorepo is intended as a demo/portfolio collection for experimenting with FHEVM patterns and is not production‑hardened without additional security review.