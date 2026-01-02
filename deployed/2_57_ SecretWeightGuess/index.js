import {initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-6/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const ORIGIN = window.location.origin;


const CONFIG = {
  RELAYER_URL: `${ORIGIN}/relayer`,
  GATEWAY_URL: `${ORIGIN}/gateway`,
      CONTRACT_ADDRESS: "0xb71149246863D63f93C62B95E0831623D17a8EA1"
    };
console.log("Config:", CONFIG.RELAYER_URL);
    const ABI = [
      "function setSecretWeight(bytes32,bytes) external",
      "function submitGuess(bytes32,bytes) external returns (bytes32)",
      "function makeMyFeedbackPublic() external",
      "function feedbackHandle(address) external view returns (bytes32)",
      "function hasWeight() external view returns (bool)",
      "function hasPlayerFeedback(address) external view returns (bool)"
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
        setStatus("#weightStatus","❌ Wallet connection failed","error");
        return false;
      }
    }

    $("#btnConnect").onclick = connect;

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
      const handle = typeof raw === "string" ? raw : toHex(raw);

      const attestation =
        typeof inputProof === "string"
          ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof)
          : toHex(inputProof);

      return { handle, attestation };
    }

    // ===== SET WEIGHT =====
    $("#btnSetWeight").onclick = async () => {
      try {
        log("SetWeight","Starting...");
        if (!await connect()) return;

        clearStatus("#weightStatus");
        setStatus("#weightStatus","🔐 Encrypting secret weight…","pending");

        const weight = parseInt($("#weightInput").value);
        if (weight < 0 || weight > 65535) throw new Error("Weight must be in [0,65535]");

        const { handle, attestation } = await encrypt16(weight);
        log("SetWeight Args", {
          handle: handle.slice(0,40) + "...",
          attLen: attestation.length
        });

        setStatus("#weightStatus","⛓️ Sending tx…","pending");

        const tx = await contract.setSecretWeight(handle, attestation);
        log("SetWeight Tx", tx.hash);
        const receipt = await tx.wait();
        log("SetWeight Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#weightStatus","✅ Secret weight stored (encrypted)","success");
      } catch (e) {
        logError("SetWeight", e);
        setStatus("#weightStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== SUBMIT GUESS =====
    $("#btnSubmitGuess").onclick = async () => {
      try {
        log("SubmitGuess","Starting...");
        if (!await connect()) return;

        clearStatus("#guessStatus");
        setStatus("#guessStatus","🧮 Encrypting guess…","pending");

        const has = await contract.hasWeight();
        if (!has) throw new Error("Secret weight not set yet");

        const guess = parseInt($("#guessInput").value);
        if (guess < 0 || guess > 65535) throw new Error("Guess must be in [0,65535]");

        const { handle, attestation } = await encrypt16(guess);
        log("SubmitGuess Args", {
          handle: handle.slice(0,40) + "...",
          attLen: attestation.length
        });

        setStatus("#guessStatus","⛓️ Sending tx…","pending");

        const tx = await contract.submitGuess(handle, attestation);
        log("SubmitGuess Tx", tx.hash);
        const receipt = await tx.wait();
        log("SubmitGuess Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#guessStatus","📊 Fetching feedback handle…","pending");

        const fh = await contract.feedbackHandle(address);
        log("FeedbackHandle", fh);

        $("#feedbackHandleOutput").textContent = "Feedback Handle:\n" + fh;
        $("#feedbackHandleOutput").style.display = "block";

        setStatus("#guessStatus","✅ Feedback stored","success");
      } catch (e) {
        logError("SubmitGuess", e);
        setStatus("#guessStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== GET HANDLE =====
    $("#btnGetHandle").onclick = async () => {
      try {
        log("GetHandle","Starting...");
        if (!await connect()) return;

        setStatus("#decryptStatus","📊 Retrieving handle…","pending");
        const fh = await contract.feedbackHandle(address);
        log("Handle", fh);

        $("#feedbackHandleOutput").textContent = "Feedback Handle:\n" + fh;
        $("#feedbackHandleOutput").style.display = "block";

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

        setStatus("#decryptStatus","🔓 Making feedback public…","pending");

        const tx = await contract.makeMyFeedbackPublic();
        log("MakePublic Tx", tx.hash);
        const receipt = await tx.wait();
        log("MakePublic Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#decryptStatus","✅ Feedback is now public","success");
      } catch (e) {
        logError("MakePublic", e);
        setStatus("#decryptStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== PUBLIC DECRYPT =====
    async function decryptFeedback(rawHandle) {
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
      return Number(v); // 0,1,2
    }

    $("#btnDecrypt").onclick = async () => {
      try {
        await connect();

        const raw = $("#feedbackHandleOutput").textContent.trim();
        const handle = cleanHandle(raw);
        console.log("Decrypting handle:", handle);

        setStatus("#decryptStatus","🔓 Decrypting via relayer…","pending");
        const level = await decryptFeedback(handle);

        const resultDiv = $("#feedbackResult");
        let title, desc, cls="match-result";

        if (level === 0) {
          title = "🎯 VERY CLOSE";
          desc = "Your encrypted guess is very close to the secret weight.";
        } else if (level === 1) {
          title = "✅ CLOSE";
          desc = "Your encrypted guess is close to the secret weight.";
        } else {
          title = "📏 FAR";
          desc = "Your encrypted guess is far from the secret weight.";
          cls = "match-result no-match";
        }

        resultDiv.className = cls;
        resultDiv.innerHTML =
          `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">${title}</div>
           <div style="color:#d1d5db;font-size:14px;">${desc}</div>`;
        resultDiv.style.display = "block";

        setStatus("#decryptStatus","✅ Feedback decrypted","success");
      } catch (e) {
        console.error("Decrypt failed:", e);
        setStatus("#decryptStatus","❌ " + (e.message || e),"error");
      }
    };

    log("Script","✅ All handlers attached and ready");
  