import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    // ------------ CONFIG ------------
    const CONTRACT_ADDRESS = "0xec062E4Ac7878E6556DB0b51306d7Cbe8eF70D44";

    const ABI = [
      "function submitFreelancer(bytes32,bytes32,bytes32,bytes) external returns (uint256)",
      "function submitJob(bytes32,bytes32,bytes32,bytes) external returns (uint256)",
      "function computeMatch(uint256,uint256) external returns (bytes32)",
      "function makeMatchPublic(uint256,uint256) external",
      "function matchHandle(uint256,uint256) external view returns (bytes32)",
      "function freelancerExists(uint256) external view returns (bool)",
      "function jobExists(uint256) external view returns (bool)",
      "function freelancerOwner(uint256) external view returns (address)",
      "function jobOwner(uint256) external view returns (address)"
    ];

    // ------------ STATE ------------
    let provider, signer, userAddress, contract, relayer;
    const $ = s => document.querySelector(s);

    // ------------ LOG HELPERS & CONSOLE ------------
    function ulog(tag, data) { 
      console.log(`%c[${tag}]`, "color:#60a5fa;font-weight:700;", data); 
    }
    function uerr(tag, data) { 
      console.error(`%c[ERROR ${tag}]`, "color:#f87171;font-weight:700;", data); 
    }
    function usuc(tag, data) { 
      console.log(`%c[OK ${tag}]`, "color:#34d399;font-weight:700;", data); 
    }

    function clearConsole() {
      $("#console").textContent = "";
    }

    // ------------ UTIL: compute bitmask from checkboxes ------------
    function computeBitmask(containerSelector) {
      const container = document.querySelector(containerSelector);
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      let mask = 0n;
      checkboxes.forEach((cb) => {
        if (cb.checked) {
          mask = mask | (1n << BigInt(parseInt(cb.value)));
        }
      });
      return mask;
    }

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
        ulog("CONNECT", "Starting connection...");

        if (!window.ethereum) throw new Error("MetaMask not found");
        provider = new BrowserProvider(window.ethereum);
        ulog("CONNECT", "BrowserProvider created");

        const accounts = await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        ulog("WALLET", `Address: ${userAddress}`);

        contract = new Contract(getAddress(CONTRACT_ADDRESS), ABI, signer);
        ulog("CONTRACT", `Contract initialized: ${CONTRACT_ADDRESS}`);

        if (!relayer) {
          ulog("RELAYER", "Initializing SDK...");
          await initSDK();
          relayer = await createInstance({
            ...SepoliaConfig,
            relayerUrl: "https://relayer.testnet.zama.org",
            gatewayUrl: "https://gateway.testnet.zama.org",
            network: window.ethereum,
            debug: true
          });
          usuc("RELAYER", "Relayer instance created");
        }

        $("#btnConnect").textContent = userAddress.slice(0,6) + "…" + userAddress.slice(-4);
        usuc("CONNECT", "Ready");
        return true;
      } catch (e) {
        uerr("CONNECT", e);
        alert("Connection failed: " + (e.message || e));
        return false;
      }
    }

    $("#btnConnect").onclick = connect;

    // ------------ SUBMIT FREELANCER ------------
    $("#btnSubmitFreelancer").onclick = async () => {
      try {
        ulog("SUBMIT FREELANCER", "Start...");
        if (!await connect()) return;

        const statusEl = $("#freelancerStatus");
        const infoEl = $("#freelancerInfo");
        statusEl.textContent = "Encrypting and submitting...";

        const skillsMask = computeBitmask("#freelancerSkills");
        const level = BigInt(parseInt($("#freelancerLevel").value || "0"));
        const rate = BigInt(parseInt($("#freelancerRate").value || "0"));

        ulog("FREELANCER VALUES", { skillsMask: skillsMask.toString(), level: level.toString(), rate: rate.toString() });

        const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
        enc.add256(skillsMask);
        enc.add8(level);
        enc.add16(rate);

        ulog("ENCRYPT", "Encrypting inputs...");
        const { handles, inputProof } = await enc.encrypt();
        ulog("ENCRYPT RESULT", { handles, inputProof });

        const h1 = toHex(handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0]);
        const h2 = toHex(handles[1]?.handle ?? handles[1]?.ciphertext ?? handles[1]);
        const h3 = toHex(handles[2]?.handle ?? handles[2]?.ciphertext ?? handles[2]);
        const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

        ulog("HANDLES EXTRACTED", { h1, h2, h3, attPreview: String(att).slice(0,60)+"..." });

        statusEl.textContent = "Submitting tx...";
        const tx = await contract.submitFreelancer(h1, h2, h3, att);
        ulog("TX SENT (submitFreelancer)", tx.hash);
        const receipt = await tx.wait();
        usuc("TX CONFIRMED", { blockNumber: receipt.blockNumber, status: receipt.status });

        let freelancerId = "1";
        try {
          if (receipt && receipt.logs && receipt.logs.length > 0) {
            freelancerId = receipt.logs[0]?.topics?.[2] ? BigInt(receipt.logs[0].topics[2]).toString() : "1";
          }
        } catch (e) {
          uerr("ID EXTRACT", e);
        }

        infoEl.style.display = "block";
        infoEl.textContent = `Freelancer ID: ${freelancerId}\nAddress: ${userAddress}\nHandles:\n${h1}\n${h2}\n${h3}`;
        statusEl.textContent = "Submitted ✓ (see console)";
        usuc("SUBMIT FREELANCER", `ID ${freelancerId}`);
      } catch (e) {
        uerr("SUBMIT FREELANCER", e);
        $("#freelancerStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ SUBMIT JOB ------------
    $("#btnSubmitJob").onclick = async () => {
      try {
        ulog("SUBMIT JOB", "Start...");
        if (!await connect()) return;

        const statusEl = $("#jobStatus");
        const infoEl = $("#jobInfo");
        statusEl.textContent = "Encrypting and submitting...";

        const skillsMask = computeBitmask("#jobSkills");
        const minLevel = BigInt(parseInt($("#jobMinLevel").value || "0"));
        const maxBudget = BigInt(parseInt($("#jobMaxBudget").value || "0"));

        ulog("JOB VALUES", { skillsMask: skillsMask.toString(), minLevel: minLevel.toString(), maxBudget: maxBudget.toString() });

        const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
        enc.add256(skillsMask);
        enc.add8(minLevel);
        enc.add16(maxBudget);

        ulog("ENCRYPT", "Encrypting job inputs...");
        const { handles, inputProof } = await enc.encrypt();
        ulog("ENCRYPT RESULT", { handles, inputProof });

        const h1 = toHex(handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0]);
        const h2 = toHex(handles[1]?.handle ?? handles[1]?.ciphertext ?? handles[1]);
        const h3 = toHex(handles[2]?.handle ?? handles[2]?.ciphertext ?? handles[2]);
        const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

        ulog("HANDLES EXTRACTED (job)", { h1, h2, h3, attPreview: String(att).slice(0,60)+"..." });

        statusEl.textContent = "Submitting tx...";
        const tx = await contract.submitJob(h1, h2, h3, att);
        ulog("TX SENT (submitJob)", tx.hash);
        const receipt = await tx.wait();
        usuc("TX CONFIRMED (job)", { blockNumber: receipt.blockNumber, status: receipt.status });

        let jobId = "1";
        try {
          if (receipt && receipt.logs && receipt.logs.length > 0) {
            jobId = receipt.logs[0]?.topics?.[2] ? BigInt(receipt.logs[0].topics[2]).toString() : "1";
          }
        } catch (e) {
          uerr("JOB ID EXTRACT", e);
        }

        infoEl.style.display = "block";
        infoEl.textContent = `Job ID: ${jobId}\nAddress: ${userAddress}\nHandles:\n${h1}\n${h2}\n${h3}`;
        statusEl.textContent = "Submitted ✓ (see console)";
        usuc("SUBMIT JOB", `ID ${jobId}`);
      } catch (e) {
        uerr("SUBMIT JOB", e);
        $("#jobStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ COMPUTE MATCH ------------
    $("#btnComputeMatch").onclick = async () => {
      try {
        ulog("COMPUTE MATCH", "Start...");
        if (!await connect()) return;

        const freelancerId = parseInt($("#computeFreelancerId").value || "0");
        const jobId = parseInt($("#computeJobId").value || "0");
        $("#computeStatus").textContent = "Calling computeMatch...";
        ulog("COMPUTE ARGS", { freelancerId, jobId });

        const tx = await contract.computeMatch(freelancerId, jobId);
        ulog("TX SENT (computeMatch)", tx.hash);
        const receipt = await tx.wait();
        usuc("TX CONFIRMED (computeMatch)", { blockNumber: receipt.blockNumber, status: receipt.status });

        const handle = await contract.matchHandle(freelancerId, jobId);
        ulog("MATCH HANDLE RETRIEVED", handle);

        $("#matchHandleOutput").style.display = "block";
        $("#matchHandleOutput").textContent = "Match Handle:\n" + handle;
        $("#computeStatus").textContent = "Match computed ✓";
      } catch (e) {
        uerr("COMPUTE MATCH", e);
        $("#computeStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ GET HANDLE ------------
    $("#btnGetHandle").onclick = async () => {
      try {
        ulog("GET HANDLE", "Start...");
        if (!await connect()) return;

        const freelancerId = parseInt($("#decryptFreelancerId").value || "0");
        const jobId = parseInt($("#decryptJobId").value || "0");
        $("#decryptStatus").textContent = "Retrieving handle...";
        const handle = await contract.matchHandle(freelancerId, jobId);
        ulog("HANDLE", handle);

        $("#matchHandleOutput").style.display = "block";
        $("#matchHandleOutput").textContent = "Match Handle:\n" + handle;
        $("#decryptStatus").textContent = "Handle retrieved ✓";
      } catch (e) {
        uerr("GET HANDLE", e);
        $("#decryptStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ MAKE PUBLIC ------------
    $("#btnMakePublic").onclick = async () => {
      try {
        ulog("MAKE PUBLIC", "Start...");
        if (!await connect()) return;

        const freelancerId = parseInt($("#decryptFreelancerId").value || "0");
        const jobId = parseInt($("#decryptJobId").value || "0");
        $("#decryptStatus").textContent = "Calling makeMatchPublic...";
        const tx = await contract.makeMatchPublic(freelancerId, jobId);
        ulog("TX SENT (makeMatchPublic)", tx.hash);
        const receipt = await tx.wait();
        usuc("TX CONFIRMED (makeMatchPublic)", { blockNumber: receipt.blockNumber, status: receipt.status });
        $("#decryptStatus").textContent = "Match made public ✓";
      } catch (e) {
        uerr("MAKE PUBLIC", e);
        $("#decryptStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // ------------ DECRYPT (publicDecrypt) ------------
    async function publicDecryptHandle(cleanHandle) {
      if (!relayer) throw new Error("Relayer not initialized");
      const h = String(cleanHandle).trim();
      if (!h.startsWith("0x") || h.length !== 66) throw new Error("Handle must be bytes32 hex (0x...)");

      ulog("DECRYPT", `Request decrypt for ${h}`);
      const req = [ h ];
      ulog("DECRYPT REQ", req);

      const out = await relayer.publicDecrypt(req);
      ulog("DECRYPT OUT RAW", out);

      if (!out || typeof out !== "object") throw new Error("Invalid decrypt response");
      if (!out.clearValues) throw new Error("Decrypt response missing clearValues");

      const lower = h.toLowerCase();
      const val = out.clearValues[h] ?? out.clearValues[lower];

      if (val === undefined || val === null) throw new Error("No clear value for handle");

      ulog("DECRYPT CLEAR VALUE", val);
      return BigInt(val) === 1n;
    }

    $("#btnDecrypt").onclick = async () => {
      try {
        ulog("DECRYPT BUTTON", "Start...");
        if (!await connect()) return;

        const raw = $("#matchHandleOutput").textContent || "";
        const handle = raw.split("\n").pop().trim();
        ulog("HANDLE TO DECRYPT", handle);

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
        usuc("DECRYPT RESULT", isMatch);
      } catch (e) {
        uerr("DECRYPT", e);
        $("#decryptStatus").textContent = "Error: " + (e.message || e);
      }
    };

    ulog("SCRIPT", "UI ready — handlers attached.");