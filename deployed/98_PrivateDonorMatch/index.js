import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

const CONFIG = {
  RELAYER_URL: "https://relayer.testnet.zama.org",
  GATEWAY_URL: "https://gateway.testnet.zama.org",
  CONTRACT_ADDRESS: "0x2B9f07dA98989A42da53493f7fC19Ee549BfD4Cc"
};

const ABI = [
  "function submitDonor(bytes32,bytes32,bytes32,bytes) external returns (uint256)",
  "function submitRecipient(bytes32,bytes32,bytes32,bytes) external returns (uint256)",
  "function computeMatch(uint256,uint256,bytes32,bytes) external returns (bytes32)", 
  "function makeMatchPublic(uint256,uint256) external",
  "function matchHandle(uint256,uint256) external view returns (bytes32)",
  "function donorExists(uint256) external view returns (bool)",
  "function recipientExists(uint256) external view returns (bool)",
  "function donorOwner(uint256) external view returns (address)",
  "function recipientOwner(uint256) external view returns (address)"
];

let provider, signer, address, contract, relayer;
const $ = s => document.querySelector(s);

// ============ LOGS ============
const log = (title, data) => {
  console.log(`%c[${title}]`, "color: #38bdf8; font-weight: bold;", data);
};

const logError = (title, err) => {
  console.error(`%c[ERROR: ${title}]`, "color: #ef4444; font-weight: bold;", err);
};

const logSuccess = (title, data) => {
  console.log(`%c[SUCCESS: ${title}]`, "color: #10b981; font-weight: bold;", data);
};

// ============ HELPERS ============
const toHex = u8 => '0x' + Array.from(u8, b => b.toString(16).padStart(2,'0')).join('');

const setStatus = (id, msg, type = 'pending') => {
  const el = $(id);
  if (!el) {
    log("Status Element Not Found", `ID: ${id}`);
    return;
  }
  el.textContent = msg;
  el.className = `status ${type}`;
  el.style.display = 'block';
  log(`Status [${id}]`, msg);
};

const clearStatus = (id) => {
  const el = $(id);
  if (el) el.style.display = 'none';
};

// ============ WALLET CONNECTION ============
async function connect() {
  try {
    log("Connect Wallet", "Starting connection...");
    
    if (!window.ethereum) {
      throw new Error("MetaMask not installed");
    }
    log("Window.ethereum", "Found");

    provider = new BrowserProvider(window.ethereum);
    log("Provider", "Created");
    
    const accounts = await provider.send("eth_requestAccounts", []);
    log("Accounts Requested", accounts);
    
    signer = await provider.getSigner();
    log("Signer", "Got signer");
    
    address = await signer.getAddress();
    log("Address", address);
    
    contract = new Contract(getAddress(CONFIG.CONTRACT_ADDRESS), ABI, signer);
    log("Contract Instance", `Address: ${CONFIG.CONTRACT_ADDRESS}`);
    
    $("#btnConnect").textContent = address.slice(0, 6) + "…" + address.slice(-4);

    if (!relayer) {
      log("Relayer Init", "Initializing SDK...");
      await initSDK();
      log("SDK Initialized", "Creating instance...");
      
      relayer = await createInstance({
        ...SepoliaConfig,
        relayerUrl: CONFIG.RELAYER_URL,
        gatewayUrl: CONFIG.GATEWAY_URL,
        network: window.ethereum,
        debug: true
      });
      logSuccess("Relayer", "Instance created");
    }
    
    logSuccess("Connection", "Full setup complete");
    return true;
  } catch (e) {
    logError("Connect", e);
    setStatus("#donorStatus", "❌ Wallet connection failed", "error");
    return false;
  }
}

$("#btnConnect").onclick = connect;

// ============ SUBMIT DONOR ============
$("#btnSubmitDonor").onclick = async () => {
  try {
    log("Submit Donor", "Starting...");
    
    if (!await connect()) {
      logError("Submit Donor", "Connection failed");
      return;
    }

    setStatus("#donorStatus", "📝 Encrypting donor profile…", "pending");

    const bloodType = parseInt($("#donorBloodType").value);
    const rh = parseInt($("#donorRh").value);
    const hlaScore = parseInt($("#donorHlaScore").value);

    log("Donor Values", { bloodType, rh, hlaScore });

    const enc = relayer.createEncryptedInput(getAddress(CONFIG.CONTRACT_ADDRESS), getAddress(address));
    log("Encrypted Input Created", "Adding values...");
    
    enc.add8(BigInt(bloodType));
    log("Added Blood Type", bloodType);
    
    enc.add8(BigInt(rh));
    log("Added Rh", rh);
    
    enc.add16(BigInt(hlaScore));
    log("Added HLA Score", hlaScore);

    const { handles, inputProof } = await enc.encrypt();
    log("Encryption Result", { 
      handleCount: handles.length,
      proofLength: typeof inputProof === "string" ? inputProof.length : inputProof.length 
    });

    // ✅ FIX: Convert each Uint8Array to hex string (bytes32 format)
    const h1 = typeof handles[0] === "string" 
      ? handles[0] 
      : (handles[0]?.handle || handles[0]?.ciphertext || toHex(handles[0]));
    
    const h2 = typeof handles[1] === "string" 
      ? handles[1] 
      : (handles[1]?.handle || handles[1]?.ciphertext || toHex(handles[1]));
    
    const h3 = typeof handles[2] === "string" 
      ? handles[2] 
      : (handles[2]?.handle || handles[2]?.ciphertext || toHex(handles[2]));

    const att = typeof inputProof === "string" 
      ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof) 
      : toHex(inputProof);

    log("Handles Extracted (CONVERTED)", {
      h1: typeof h1 === "string" ? "✅ string (hex)" : "❌ NOT string",
      h2: typeof h2 === "string" ? "✅ string (hex)" : "❌ NOT string",
      h3: typeof h3 === "string" ? "✅ string (hex)" : "❌ NOT string",
      attLength: att.length,
      allHex: typeof h1 === "string" && typeof h2 === "string" && typeof h3 === "string"
    });

    console.log("🔹 Donor submit args (FIXED):", { 
      h1: h1.slice(0, 40) + "...", 
      h2: h2.slice(0, 40) + "...", 
      h3: h3.slice(0, 40) + "...", 
      att: att.slice(0, 50) + "..." 
    });

    setStatus("#donorStatus", "⛓️ Submitting to blockchain…", "pending");
    
    const tx = await contract.submitDonor(h1, h2, h3, att);
    log("Transaction Sent", tx.hash);
    
    const receipt = await tx.wait();
    log("Transaction Confirmed", { 
      blockNumber: receipt.blockNumber,
      logCount: receipt.logs.length 
    });

    // Extract donor ID from event logs
    let donorId = 1;
    if (receipt.logs && receipt.logs.length > 0) {
      try {
        donorId = BigInt(receipt.logs[0]?.topics[2] || 1).toString();
        log("Donor ID Extracted", donorId);
      } catch (e) {
        logError("ID Extraction", e);
        donorId = "1";
      }
    }

    $("#donorIdDisplay").textContent = donorId;
    $("#donorAddressDisplay").textContent = address.slice(0, 6) + "…" + address.slice(-4);
    $("#donorInfo").style.display = 'grid';

    logSuccess("Submit Donor", `ID: ${donorId}`);
    setStatus("#donorStatus", `✅ Donor registered! ID: ${donorId}`, "success");
    
    // Auto-populate match inputs
    $("#matchDonorId").value = donorId;
    $("#decryptDonorId").value = donorId;
    
  } catch (e) {
    logError("Submit Donor", e);
    setStatus("#donorStatus", "❌ Error: " + (e.message || e), "error");
  }
};

// ============ FIX FOR SUBMIT RECIPIENT ============
$("#btnSubmitRecipient").onclick = async () => {
  try {
    log("Submit Recipient", "Starting...");
    
    if (!await connect()) {
      logError("Submit Recipient", "Connection failed");
      return;
    }

    setStatus("#recipientStatus", "📝 Encrypting recipient profile…", "pending");

    const bloodType = parseInt($("#recipientBloodType").value);
    const rh = parseInt($("#recipientRh").value);
    const hlaScore = parseInt($("#recipientHlaScore").value);

    log("Recipient Values", { bloodType, rh, hlaScore });

    const enc = relayer.createEncryptedInput(getAddress(CONFIG.CONTRACT_ADDRESS), getAddress(address));
    log("Encrypted Input Created", "Adding values...");
    
    enc.add8(BigInt(bloodType));
    log("Added Blood Type", bloodType);
    
    enc.add8(BigInt(rh));
    log("Added Rh", rh);
    
    enc.add16(BigInt(hlaScore));
    log("Added HLA Score", hlaScore);

    const { handles, inputProof } = await enc.encrypt();
    log("Encryption Result", { 
      handleCount: handles.length,
      proofLength: typeof inputProof === "string" ? inputProof.length : inputProof.length 
    });

    // ✅ FIX: Convert each Uint8Array to hex string (bytes32 format)
    const h1 = typeof handles[0] === "string" 
      ? handles[0] 
      : (handles[0]?.handle || handles[0]?.ciphertext || toHex(handles[0]));
    
    const h2 = typeof handles[1] === "string" 
      ? handles[1] 
      : (handles[1]?.handle || handles[1]?.ciphertext || toHex(handles[1]));
    
    const h3 = typeof handles[2] === "string" 
      ? handles[2] 
      : (handles[2]?.handle || handles[2]?.ciphertext || toHex(handles[2]));

    const att = typeof inputProof === "string" 
      ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof) 
      : toHex(inputProof);

    log("Handles Extracted (CONVERTED)", {
      h1: typeof h1 === "string" ? "✅ string (hex)" : "❌ NOT string",
      h2: typeof h2 === "string" ? "✅ string (hex)" : "❌ NOT string",
      h3: typeof h3 === "string" ? "✅ string (hex)" : "❌ NOT string",
      attLength: att.length,
      allHex: typeof h1 === "string" && typeof h2 === "string" && typeof h3 === "string"
    });

    console.log("🔹 Recipient submit args (FIXED):", { 
      h1: h1.slice(0, 40) + "...", 
      h2: h2.slice(0, 40) + "...", 
      h3: h3.slice(0, 40) + "...", 
      att: att.slice(0, 50) + "..." 
    });

    setStatus("#recipientStatus", "⛓️ Submitting to blockchain…", "pending");
    
    const tx = await contract.submitRecipient(h1, h2, h3, att);
    log("Transaction Sent", tx.hash);
    
    const receipt = await tx.wait();
    log("Transaction Confirmed", { 
      blockNumber: receipt.blockNumber,
      logCount: receipt.logs.length 
    });

    let recipientId = 1;
    if (receipt.logs && receipt.logs.length > 0) {
      try {
        recipientId = BigInt(receipt.logs[0]?.topics[2] || 1).toString();
        log("Recipient ID Extracted", recipientId);
      } catch (e) {
        logError("ID Extraction", e);
        recipientId = "1";
      }
    }

    $("#recipientIdDisplay").textContent = recipientId;
    $("#recipientAddressDisplay").textContent = address.slice(0, 6) + "…" + address.slice(-4);
    $("#recipientInfo").style.display = 'grid';

    logSuccess("Submit Recipient", `ID: ${recipientId}`);
    setStatus("#recipientStatus", `✅ Recipient registered! ID: ${recipientId}`, "success");
    
    // Auto-populate match inputs
    $("#matchRecipientId").value = recipientId;
    $("#decryptRecipientId").value = recipientId;
    
  } catch (e) {
    logError("Submit Recipient", e);
    setStatus("#recipientStatus", "❌ Error: " + (e.message || e), "error");
  }
};
// ============ COMPUTE MATCH ============

$("#btnComputeMatch").onclick = async () => {
  try {
    log("Compute Match", "Starting...");
    
    if (!await connect()) {
      logError("Compute Match", "Connection failed");
      return;
    }

    setStatus("#matchStatus", "🔍 Verifying profiles…", "pending");

    const donorId = parseInt($("#matchDonorId").value);
    const recipientId = parseInt($("#matchRecipientId").value);
    const threshold = BigInt(parseInt($("#matchThreshold").value));

    log("Match IDs & Threshold", { donorId, recipientId, threshold: threshold.toString() });

    // ===== VERIFY EXISTENCE =====
    log("Verify Donor Exists", `ID: ${donorId}`);
    const donorExists = await contract.donorExists(donorId);
    log("Donor Exists Result", donorExists);
    
    if (!donorExists) {
      throw new Error(`❌ Donor ID ${donorId} does not exist!`);
    }

    log("Verify Recipient Exists", `ID: ${recipientId}`);
    const recipExists = await contract.recipientExists(recipientId);
    log("Recipient Exists Result", recipExists);
    
    if (!recipExists) {
      throw new Error(`❌ Recipient ID ${recipientId} does not exist!`);
    }

    logSuccess("Profiles Verified", "Both exist on contract");
    setStatus("#matchStatus", "🔐 Encrypting threshold…", "pending");

    // ===== ENCRYPT THRESHOLD ===== 
    const enc = relayer.createEncryptedInput(getAddress(CONFIG.CONTRACT_ADDRESS), getAddress(address));
    log("Encrypted Input Created", "Adding threshold...");
    
    enc.add16(threshold);
    log("Added Threshold", threshold.toString());

    const { handles, inputProof } = await enc.encrypt();
    log("Threshold Encryption Result", { 
      handleCount: handles.length,
      proofLength: typeof inputProof === "string" ? inputProof.length : inputProof.length 
    });

    // ✅ FIX: Get the encrypted threshold (handle)
    const encryptedThresholdRaw = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
    const encryptedThreshold = typeof encryptedThresholdRaw === "string" 
      ? encryptedThresholdRaw 
      : toHex(encryptedThresholdRaw);

    // ✅ FIX: Get the attestation
    const attestation = typeof inputProof === "string" 
      ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof) 
      : toHex(inputProof);

    log("Threshold Encryption Extracted", {
      encryptedThresholdType: typeof encryptedThreshold,
      encryptedThresholdLength: encryptedThreshold.length,
      attestationLength: attestation.length,
      bothAreHex: typeof encryptedThreshold === "string" && typeof attestation === "string"
    });

    console.log("🔹 Match compute args (FIXED WITH ATTESTATION):", { 
      donorId, 
      recipientId, 
      encryptedThreshold: encryptedThreshold.slice(0, 50) + "...",
      attestation: attestation.slice(0, 50) + "...",
      paramCount: 4
    });

    setStatus("#matchStatus", "⛓️ Computing match (homomorphic)…", "pending");
    
    log("Contract Call", `computeMatch(${donorId}, ${recipientId}, encryptedThreshold, attestation)`);
    
    // ✅ PASS BOTH encryptedThreshold AND attestation (4 parameters total!)
    const tx = await contract.computeMatch(donorId, recipientId, encryptedThreshold, attestation);
    log("Transaction Sent", tx.hash);
    
    const receipt = await tx.wait();
    log("Transaction Confirmed", { 
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? "SUCCESS" : "FAILED"
    });

    if (receipt.status !== 1) {
      throw new Error("Transaction reverted on chain!");
    }

    setStatus("#matchStatus", "📊 Retrieving match handle…", "pending");

    // ===== GET HANDLE =====
    log("Get Match Handle", `For pair (${donorId}, ${recipientId})`);
    const handle = await contract.matchHandle(donorId, recipientId);
    log("Match Handle Retrieved", handle);

    $("#matchHandleOutput").textContent = "Match Handle:\n" + handle;
    $("#matchHandleOutput").style.display = 'block';

    logSuccess("Compute Match", `Complete! Handle: ${handle.slice(0, 20)}...`);
    setStatus("#matchStatus", "✅ Match computed successfully!", "success");

    // Auto-populate decrypt inputs
    $("#decryptDonorId").value = donorId;
    $("#decryptRecipientId").value = recipientId;
    
  } catch (e) {
    logError("Compute Match", e);
    setStatus("#matchStatus", "❌ " + (e.message || e), "error");
  }
};

// ============ GET HANDLE ============
$("#btnGetHandle").onclick = async () => {
  try {
    log("Get Handle", "Starting...");
    
    if (!await connect()) return;

    const donorId = parseInt($("#decryptDonorId").value);
    const recipientId = parseInt($("#decryptRecipientId").value);

    log("Get Handle Params", { donorId, recipientId });
    
    setStatus("#decryptStatus", "📊 Retrieving handle…", "pending");
    
    const handle = await contract.matchHandle(donorId, recipientId);
    log("Handle Retrieved", handle);

    $("#matchHandleOutput").textContent = "Match Handle:\n" + handle;
    $("#matchHandleOutput").style.display = 'block';

    logSuccess("Get Handle", handle.slice(0, 30) + "...");
    setStatus("#decryptStatus", "✅ Handle retrieved", "success");
  } catch (e) {
    logError("Get Handle", e);
    setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
  }
};

// ============ MAKE PUBLIC ============

$("#btnMakePublic").onclick = async () => {
  try {
    log("Make Public", "Starting...");
    
    if (!await connect()) return;

    const donorId = parseInt($("#decryptDonorId").value);
    const recipientId = parseInt($("#decryptRecipientId").value);

    log("Make Public Params", { donorId, recipientId });
    
    setStatus("#decryptStatus", "🔓 Making match public…", "pending");
    
    const tx = await contract.makeMatchPublic(donorId, recipientId);
    log("Transaction Sent", tx.hash);
    
    const receipt = await tx.wait();
    log("Transaction Confirmed", { 
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? "SUCCESS" : "FAILED"
    });

    logSuccess("Make Public", "Match is now decryptable");
    setStatus("#decryptStatus", "✅ Match is now public", "success");
  } catch (e) {
    logError("Make Public", e);
    setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
  }
};



// ========== PUBLIC DECRYPT  ==========

// ===================================================
async function decryptMatch(handleHex) {
  if (!relayer) throw new Error("Relayer not initialized");

  const handle = String(handleHex).trim();

  if (!handle.startsWith("0x") || handle.length !== 66)
    throw new Error("Invalid ciphertext handle");

  const request = [handle];

  console.log("🔎 publicDecrypt request:", request);

  // NEW SDK OUTPUT FORMAT (object, not array)
  const out = await relayer.publicDecrypt(request);

  console.log("🔍 publicDecrypt output:", out);

  if (!out || typeof out !== "object")
    throw new Error("Invalid decrypt response");

  if (!out.clearValues)
    throw new Error("Missing clearValues in decrypt response");

  // normalize: handle can be mixed-case
  const lower = handle.toLowerCase();

  const result =
    out.clearValues[handle] ??
    out.clearValues[lower];

  if (result === undefined || result === null)
    throw new Error("Decrypt produced no value for this handle");

  console.log("🔐 clear value for handle:", result);

  // result is "0" or "1"
  return Number(result) === 1;
}


// ============ DECRYPT ============

$("#btnDecrypt").onclick = async () => {
  try {
    await connect();

    const raw = $("#matchHandleOutput").textContent.trim();
    const handle = raw.split("\n").pop().trim();

    console.log("Decrypting handle:", handle);

    const isMatch = await decryptMatch(handle);

    console.log("MATCH =", isMatch);

    const donorId = $("#decryptDonorId").value;
    const recipientId = $("#decryptRecipientId").value;

    const resultDiv = $("#matchResult");

    if (isMatch) {
      resultDiv.className = "match-result";
      resultDiv.innerHTML =
        `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">✅ MATCH FOUND!</div>
         <div style="color:#d1d5db;font-size:14px;">
            Donor #${donorId} and Recipient #${recipientId} are compatible!
         </div>`;
    } else {
      resultDiv.className = "match-result no-match";
      resultDiv.innerHTML =
        `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">❌ NO MATCH</div>
         <div style="color:#d1d5db;font-size:14px;">
            Donor #${donorId} and Recipient #${recipientId} are not compatible.
         </div>`;
    }

    resultDiv.style.display = "block";

    setStatus("#decryptStatus", "✅ Match result decrypted", "success");

  } catch (e) {
    console.error("Decrypt failed:", e);
    setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
  }
};


log("Script", "✅ All handlers attached and ready");