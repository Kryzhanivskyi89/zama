import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0x4dC503617D7222F247962E144cEF8022a6c4d72D"
    };

    const ABI = [
      "function submitSteps(bytes32,bytes) external returns (bytes32)",
      "function makeMyFlagPublic() external",
      "function flagHandle(address) external view returns (bytes32)",
      "function hasRecord(address) external view returns (bool)"
    ];

    let provider, signer, address, contract, relayer;
    const $ = s => document.querySelector(s);

    const log = (t,d) => console.log(`%c[${t}]`,"color:#38bdf8;font-weight:bold;",d);
    const logError = (t,e) => console.error(`%c[ERROR: ${t}]`,"color:#ef4444;font-weight:bold;",e);
    const logSuccess = (t,d) => console.log(`%c[SUCCESS: ${t}]`,"color:#10b981;font-weight:bold;",d);

    const toHex = u8 => "0x" + Array.from(u8, b => b.toString(16).padStart(2,"0")).join("");

    const setStatus = (id,msg,type="pending") => {
      const el = $(id);
      if (!el) return;
      el.textContent = msg;
      el.className = `status ${type}`;
      el.style.display = "block";
      log(`Status ${id}`, msg);
    };

    const clearStatus = id => {
      const el = $(id);
      if (el) el.style.display = "none";
    };

    function cleanHandle(raw) {
      return String(raw).trim().split("\n").pop().trim();
    }

    async function connect() {
      try {
        log("Connect","Starting...");
        if (!window.ethereum) throw new Error("MetaMask not installed");

        provider = new BrowserProvider(window.ethereum);
        log("Provider","Created");

        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        address = await signer.getAddress();
        log("Address", address);

        contract = new Contract(getAddress(CONFIG.CONTRACT_ADDRESS), ABI, signer);
        log("Contract", CONFIG.CONTRACT_ADDRESS);

        $("#btnConnect").textContent = address.slice(0,6) + "…" + address.slice(-4);

        if (!relayer) {
          log("Relayer","initSDK...");
          await initSDK();
          relayer = await createInstance({
            ...SepoliaConfig,
            relayerUrl: CONFIG.RELAYER_URL,
            gatewayUrl: CONFIG.GATEWAY_URL,
            network: window.ethereum,
            debug: true
          });
          logSuccess("Relayer","Instance created");
        }

        logSuccess("Connect","Ready");
        return true;
      } catch (e) {
        logError("Connect", e);
        setStatus("#stepsStatus","❌ Wallet connection failed","error");
        return false;
      }
    }

    $("#btnConnect").onclick = connect;

    // ===== encrypt16 helper =====
    async function encrypt16(value) {
      if (!relayer) throw new Error("Relayer not initialized");

      const enc = relayer.createEncryptedInput(
        getAddress(CONFIG.CONTRACT_ADDRESS),
        getAddress(address)
      );
      log("Encrypt16", `add16=${value}`);
      enc.add16(BigInt(value));

      const { handles, inputProof } = await enc.encrypt();
      log("Encrypt16 Result", {
        handleCount: handles.length,
        proofLength: typeof inputProof === "string" ? inputProof.length : inputProof.length
      });

      const raw = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
      const handle =
        typeof raw === "string" ? raw : toHex(raw);

      const attestation =
        typeof inputProof === "string"
          ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof)
          : toHex(inputProof);

      return { handle, attestation };
    }

    // ===== SUBMIT STEPS =====
    $("#btnSubmitSteps").onclick = async () => {
      try {
        log("SubmitSteps","Starting...");
        if (!await connect()) return;

        clearStatus("#stepsStatus");
        setStatus("#stepsStatus","🧮 Encrypting steps…","pending");

        const steps = parseInt($("#stepsInput").value);
        log("Steps Value", steps);

        const { handle, attestation } = await encrypt16(steps);
        log("Submit Args", {
          handle: handle.slice(0,40) + "...",
          attLen: attestation.length
        });

        setStatus("#stepsStatus","⛓️ Sending tx…","pending");

        const tx = await contract.submitSteps(handle, attestation);
        log("SubmitSteps Tx", tx.hash);
        const receipt = await tx.wait();
        log("SubmitSteps Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        // читаємо handle через flagHandle(address)
        setStatus("#stepsStatus","📊 Fetching flag handle…","pending");
        const fh = await contract.flagHandle(address);
        log("FlagHandle", fh);

        $("#flagHandleOutput").textContent = "Flag Handle:\n" + fh;
        $("#flagHandleOutput").style.display = "block";

        setStatus("#stepsStatus","✅ Steps submitted & flag stored","success");
      } catch (e) {
        logError("SubmitSteps", e);
        setStatus("#stepsStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== GET HANDLE =====
    $("#btnGetHandle").onclick = async () => {
      try {
        log("GetHandle","Starting...");
        if (!await connect()) return;

        setStatus("#decryptStatus","📊 Retrieving handle…","pending");
        const fh = await contract.flagHandle(address);
        log("Handle", fh);

        $("#flagHandleOutput").textContent = "Flag Handle:\n" + fh;
        $("#flagHandleOutput").style.display = "block";

        setStatus("#decryptStatus","✅ Handle retrieved","success");
      } catch (e) {
        logError("GetHandle", e);
        setStatus("#decryptStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== MAKE PUBLIC =====
    $("#btnMakePublic").onclick = async () => {
      try {
        log("MakePublic","Starting...");
        if (!await connect()) return;

        setStatus("#decryptStatus","🔓 Making flag public…","pending");

        const tx = await contract.makeMyFlagPublic();
        log("MakePublic Tx", tx.hash);
        const receipt = await tx.wait();
        log("MakePublic Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#decryptStatus","✅ Flag is now public","success");
      } catch (e) {
        logError("MakePublic", e);
        setStatus("#decryptStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== PUBLIC DECRYPT (Relayer 0.3.x, через clearValues) =====
    async function decryptFlag(rawHandle) {
      if (!relayer) throw new Error("Relayer not initialized");

      const handle = cleanHandle(rawHandle);
      if (!handle.startsWith("0x") || handle.length !== 66)
        throw new Error("Invalid handle format (must be bytes32)");

      const request = [handle];
      console.log("🔎 publicDecrypt request:", request);

      const out = await relayer.publicDecrypt(request);
      console.log("🔍 publicDecrypt output:", out);

      if (!out || typeof out !== "object" || !out.clearValues)
        throw new Error("Invalid decrypt response (no clearValues)");

      const v =
        out.clearValues[handle] ??
        out.clearValues[handle.toLowerCase()];

      if (v === undefined) throw new Error("Decrypt produced no value");

      console.log("🔐 clear value:", v);
      return BigInt(v) === 1n; // true = new record
    }

    // ===== DECRYPT BUTTON =====
    $("#btnDecrypt").onclick = async () => {
      try {
        await connect();

        const raw = $("#flagHandleOutput").textContent.trim();
        const handle = cleanHandle(raw);
        console.log("Decrypting handle:", handle);

        setStatus("#decryptStatus","🔓 Decrypting via relayer…","pending");
        const isNew = await decryptFlag(handle);

        const resultDiv = $("#flagResult");
        if (isNew) {
          resultDiv.className = "match-result";
          resultDiv.innerHTML =
            `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">🏆 NEW RECORD!</div>
             <div style="color:#d1d5db;font-size:14px;">
               Your encrypted steps set a new personal record.
             </div>`;
        } else {
          resultDiv.className = "match-result no-match";
          resultDiv.innerHTML =
            `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">ℹ️ NO NEW RECORD</div>
             <div style="color:#d1d5db;font-size:14px;">
               Your encrypted steps did not beat your best record.
             </div>`;
        }
        resultDiv.style.display = "block";

        setStatus("#decryptStatus","✅ Flag decrypted","success");
      } catch (e) {
        console.error("Decrypt failed:", e);
        setStatus("#decryptStatus","❌ " + (e.message || e),"error");
      }
    };

    log("Script","✅ All handlers attached and ready");