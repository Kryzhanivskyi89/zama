import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    // ------------ CONFIG ------------
    const CONTRACT_ADDRESS = "0x3A32DDCDA724d8329E139ad60b98432D9C4A0cf2";

    // Minimal ABI tailored to contract functions
    const ABI = [
      "function submitCitizen(bytes32,bytes32,bytes32,bytes) external returns (uint256)",
      "function submitRegion(bytes32,bytes32,bytes32,bytes) external returns (uint256)",
      "function computeHealthMatch(uint256,uint256) external returns (bytes32)",
      "function makeMatchPublic(uint256,uint256) external",
      "function matchHandle(uint256,uint256) external view returns (bytes32)",
      "function citizenExists(uint256) external view returns (bool)",
      "function regionExists(uint256) external view returns (bool)",
      "function citizenOwner(uint256) external view returns (address)",
      "function regionOwner(uint256) external view returns (address)"
    ];

    // ------------ STATE ------------
    let provider, signer, userAddress, contract, relayer;
    const $ = s => document.querySelector(s);

    // ------------ LOG HELPERS (English) ------------
    function logInfo(tag, data){ console.log(`%c[${tag}]`, "color:#60a5fa;font-weight:700;", data); }
    function logError(tag, data){ console.error(`%c[ERROR ${tag}]`, "color:#f87171;font-weight:700;", data); }
    function logOk(tag, data){ console.log(`%c[OK ${tag}]`, "color:#34d399;font-weight:700;", data); }

    // ------------ UTIL: hex conversion for Uint8Array -> 0x...
    function toHex(u8) {
      if (typeof u8 === "string") return u8;
      if (u8 instanceof Uint8Array || Array.isArray(u8)) {
        return "0x" + Array.from(u8).map(b => b.toString(16).padStart(2,"0")).join("");
      }
      return String(u8);
    }

    // ------------ CONNECT WALLET & RELAYER ------------
    async function connect() {
      try {
        logInfo("CONNECT", "Starting connection...");

        if (!window.ethereum) throw new Error("MetaMask not found");
        provider = new BrowserProvider(window.ethereum);
        logInfo("CONNECT", "BrowserProvider created");

        const accounts = await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        logInfo("WALLET", `Address: ${userAddress}`);

        contract = new Contract(getAddress(CONTRACT_ADDRESS), ABI, signer);
        logInfo("CONTRACT", `Contract initialized: ${CONTRACT_ADDRESS}`);

        if (!relayer) {
          logInfo("RELAYER", "Initializing SDK...");
          await initSDK();
          relayer = await createInstance({
            ...SepoliaConfig,
            relayerUrl: "https://relayer.testnet.zama.org",
            gatewayUrl: "https://gateway.testnet.zama.org",
            network: window.ethereum,
            debug: true
          });
          logOk("RELAYER", "Relayer instance created");
        }

        $("#btnConnect").textContent = userAddress.slice(0,6) + "…" + userAddress.slice(-4);
        logOk("CONNECT", "Ready");
        return true;
      } catch (e) {
        logError("CONNECT", e);
        alert("Connection failed: " + (e.message || e));
        return false;
      }
    }

    $("#btnConnect").onclick = connect;

    // ------------ SUBMIT CITIZEN ------------
    $("#btnSubmitCitizen").onclick = async () => {
      try {
        logInfo("SUBMIT CITIZEN", "Start");
        if (!await connect()) return;

        $("#citizenStatus").textContent = "Encrypting and submitting...";
        const ageGroup = BigInt(parseInt($("#citizenAgeGroup").value || "1"));
        const bmiCategory = BigInt(parseInt($("#citizenBmiCategory").value || "0"));
        const bpIndex = BigInt(parseInt($("#citizenBpIndex").value || "0"));

        logInfo("CITIZEN VALUES", { ageGroup: ageGroup.toString(), bmiCategory: bmiCategory.toString(), bpIndex: bpIndex.toString() });

        const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
        // add8, add8, add16
        enc.add8(ageGroup);
        enc.add8(bmiCategory);
        enc.add16(bpIndex);

        logInfo("ENCRYPT", "Encrypting inputs...");
        const { handles, inputProof } = await enc.encrypt();
        logInfo("ENCRYPT RESULT", { handles, inputProof });

        const h1 = toHex(handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0]);
        const h2 = toHex(handles[1]?.handle ?? handles[1]?.ciphertext ?? handles[1]);
        const h3 = toHex(handles[2]?.handle ?? handles[2]?.ciphertext ?? handles[2]);
        const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

        logInfo("HANDLES EXTRACTED", { h1, h2, h3, attPreview: String(att).slice(0,60)+"..." });

        $("#citizenStatus").textContent = "Submitting tx...";
        const tx = await contract.submitCitizen(h1, h2, h3, att);
        logInfo("TX SENT (submitCitizen)", tx.hash);
        const receipt = await tx.wait();
        logOk("TX CONFIRMED", { blockNumber: receipt.blockNumber, status: receipt.status });

        // best-effort id extraction
        let citizenId = "1";
        try {
          if (receipt && receipt.logs && receipt.logs.length > 0) {
            citizenId = receipt.logs[0]?.topics?.[2] ? BigInt(receipt.logs[0].topics[2]).toString() : citizenId;
          }
        } catch (e) {
          logError("ID_EXTRACT", e);
        }

        $("#citizenInfo").style.display = "block";
        $("#citizenInfo").textContent = `Citizen ID: ${citizenId}\nAddress: ${userAddress}\nHandles:\n${h1}\n${h2}\n${h3}`;
        $("#citizenStatus").textContent = "Submitted ✓ (see console)";
        logOk("SUBMIT CITIZEN", `ID: ${citizenId}`);
      } catch (e) {
        logError("SUBMIT CITIZEN", e);
        $("#citizenStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ SUBMIT REGION ------------
    $("#btnSubmitRegion").onclick = async () => {
      try {
        logInfo("SUBMIT REGION", "Start");
        if (!await connect()) return;

        $("#regionStatus").textContent = "Encrypting and submitting...";
        const minAge = BigInt(parseInt($("#regionMinAge").value || "1"));
        const maxBmi = BigInt(parseInt($("#regionMaxBmi").value || "1"));
        const maxBp = BigInt(parseInt($("#regionMaxBp").value || "0"));

        logInfo("REGION VALUES", { minAge: minAge.toString(), maxBmi: maxBmi.toString(), maxBp: maxBp.toString() });

        const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
        enc.add8(minAge);
        enc.add8(maxBmi);
        enc.add16(maxBp);

        logInfo("ENCRYPT", "Encrypting region inputs...");
        const { handles, inputProof } = await enc.encrypt();
        logInfo("ENCRYPT RESULT", { handles, inputProof });

        const h1 = toHex(handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0]);
        const h2 = toHex(handles[1]?.handle ?? handles[1]?.ciphertext ?? handles[1]);
        const h3 = toHex(handles[2]?.handle ?? handles[2]?.ciphertext ?? handles[2]);
        const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

        logInfo("HANDLES EXTRACTED (region)", { h1, h2, h3, attPreview: String(att).slice(0,60)+"..." });

        $("#regionStatus").textContent = "Submitting tx...";
        const tx = await contract.submitRegion(h1, h2, h3, att);
        logInfo("TX SENT (submitRegion)", tx.hash);
        const receipt = await tx.wait();
        logOk("TX CONFIRMED (region)", { blockNumber: receipt.blockNumber, status: receipt.status });

        let regionId = "1";
        try {
          if (receipt && receipt.logs && receipt.logs.length > 0) {
            regionId = receipt.logs[0]?.topics?.[2] ? BigInt(receipt.logs[0].topics[2]).toString() : regionId;
          }
        } catch (e) {
          logError("REGION_ID_EXTRACT", e);
        }

        $("#regionInfo").style.display = "block";
        $("#regionInfo").textContent = `Region ID: ${regionId}\nAddress: ${userAddress}\nHandles:\n${h1}\n${h2}\n${h3}`;
        $("#regionStatus").textContent = "Submitted ✓ (see console)";
        logOk("SUBMIT REGION", `ID: ${regionId}`);
      } catch (e) {
        logError("SUBMIT REGION", e);
        $("#regionStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ COMPUTE MATCH ------------
    $("#btnComputeMatch").onclick = async () => {
      try {
        logInfo("COMPUTE MATCH", "Start");
        if (!await connect()) return;

        const citizenId = parseInt($("#computeCitizenId").value || "0");
        const regionId = parseInt($("#computeRegionId").value || "0");
        $("#computeStatus").textContent = "Calling computeHealthMatch...";
        logInfo("COMPUTE ARGS", { citizenId, regionId });

        const tx = await contract.computeHealthMatch(citizenId, regionId);
        logInfo("TX SENT (computeHealthMatch)", tx.hash);
        const receipt = await tx.wait();
        logOk("TX CONFIRMED (computeHealthMatch)", { blockNumber: receipt.blockNumber, status: receipt.status });

        const handle = await contract.matchHandle(citizenId, regionId);
        logInfo("MATCH HANDLE RETRIEVED", handle);

        $("#matchHandleOutput").style.display = "block";
        $("#matchHandleOutput").textContent = "Match Handle:\n" + handle;
        $("#computeStatus").textContent = "Match computed ✓";
      } catch (e) {
        logError("COMPUTE MATCH", e);
        $("#computeStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ GET HANDLE ------------
    $("#btnGetHandle").onclick = async () => {
      try {
        logInfo("GET HANDLE", "Start");
        if (!await connect()) return;

        const citizenId = parseInt($("#decryptCitizenId").value || "0");
        const regionId = parseInt($("#decryptRegionId").value || "0");
        $("#decryptStatus").textContent = "Retrieving handle...";
        const handle = await contract.matchHandle(citizenId, regionId);
        logInfo("HANDLE", handle);

        $("#matchHandleOutput").style.display = "block";
        $("#matchHandleOutput").textContent = "Match Handle:\n" + handle;
        $("#decryptStatus").textContent = "Handle retrieved ✓";
      } catch (e) {
        logError("GET HANDLE", e);
        $("#decryptStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ MAKE PUBLIC ------------
    $("#btnMakePublic").onclick = async () => {
      try {
        logInfo("MAKE PUBLIC", "Start");
        if (!await connect()) return;

        const citizenId = parseInt($("#decryptCitizenId").value || "0");
        const regionId = parseInt($("#decryptRegionId").value || "0");
        $("#decryptStatus").textContent = "Calling makeMatchPublic...";
        const tx = await contract.makeMatchPublic(citizenId, regionId);
        logInfo("TX SENT (makeMatchPublic)", tx.hash);
        const receipt = await tx.wait();
        logOk("TX CONFIRMED (makeMatchPublic)", { blockNumber: receipt.blockNumber, status: receipt.status });
        $("#decryptStatus").textContent = "Match made public ✓";
      } catch (e) {
        logError("MAKE PUBLIC", e);
        $("#decryptStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ PUBLIC DECRYPT ------------
    async function publicDecryptHandle(cleanHandle) {
      if (!relayer) throw new Error("Relayer not initialized");
      const h = String(cleanHandle).trim();
      if (!h.startsWith("0x") || h.length !== 66) throw new Error("Handle must be bytes32 hex (0x...)");

      logInfo("DECRYPT", `Requesting publicDecrypt for ${h}`);
      const req = [ h ];
      logInfo("DECRYPT REQ", req);

      const out = await relayer.publicDecrypt(req);
      logInfo("DECRYPT OUT RAW", out);

      if (!out || typeof out !== "object") throw new Error("Invalid decrypt response");
      if (!out.clearValues) throw new Error("Decrypt response missing clearValues");

      const lower = h.toLowerCase();
      const val = out.clearValues[h] ?? out.clearValues[lower];

      if (val === undefined || val === null) throw new Error("No clear value for handle");

      logInfo("DECRYPT CLEAR VALUE", val);
      return BigInt(val) === 1n;
    }

    $("#btnDecrypt").onclick = async () => {
      try {
        logInfo("DECRYPT BUTTON", "Start");
        if (!await connect()) return;

        const raw = $("#matchHandleOutput").textContent || "";
        const handle = raw.split("\n").pop().trim();
        logInfo("HANDLE TO DECRYPT", handle);

        $("#decryptStatus").textContent = "Decrypting...";
        const isMatch = await publicDecryptHandle(handle);

        $("#decryptResult").style.display = "block";
        if (isMatch) {
          $("#decryptResult").textContent = "✅ MATCH = true";
          $("#decryptResult").style.background = "rgba(16,185,129,0.06)";
        } else {
          $("#decryptResult").textContent = "❌ MATCH = false";
          $("#decryptResult").style.background = "rgba(239,68,68,0.06)";
        }
        $("#decryptStatus").textContent = "Decrypt finished ✓";
        logOk("DECRYPT RESULT", isMatch);
      } catch (e) {
        logError("DECRYPT", e);
        $("#decryptStatus").textContent = "Error: " + (e.message || e);
      }
    };

    logInfo("SCRIPT", "UI ready — handlers attached. All logs in English.");