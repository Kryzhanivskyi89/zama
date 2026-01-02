import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0x488bA6625C8CE7Eb830105F97e98ECA4f64ee31B"
    };

    const ABI = [
      "function setSecretCode(bytes32,bytes) external",
      "function submitGuess(bytes32,bytes) external returns (bytes32)",
      "function makeMyResultPublic() external",
      "function resultHandle(address) external view returns (bytes32)",
      "function hasCode() external view returns (bool)",
      "function hasPlayerResult(address) external view returns (bool)"
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
        setStatus("#codeStatus","❌ Wallet connection failed","error");
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

    // ===== SET CODE (ADMIN) =====
    $("#btnSetCode").onclick = async () => {
      try {
        log("SetCode","Starting...");
        if (!await connect()) return;

        clearStatus("#codeStatus");
        setStatus("#codeStatus","🔐 Encrypting door code…","pending");

        const code = parseInt($("#codeInput").value);
        if (code < 1 || code > 9999) throw new Error("Code must be in [1,9999]");

        const { handle, attestation } = await encrypt16(code);
        log("SetCode Args", {
          handle: handle.slice(0,40) + "...",
          attLen: attestation.length
        });

        setStatus("#codeStatus","⛓️ Sending tx…","pending");

        const tx = await contract.setSecretCode(handle, attestation);
        log("SetCode Tx", tx.hash);
        const receipt = await tx.wait();
        log("SetCode Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#codeStatus","✅ Secret code stored (encrypted)","success");
      } catch (e) {
        logError("SetCode", e);
        setStatus("#codeStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== SUBMIT GUESS =====
    $("#btnSubmitGuess").onclick = async () => {
      try {
        log("SubmitGuess","Starting...");
        if (!await connect()) return;

        clearStatus("#guessStatus");
        setStatus("#guessStatus","🧮 Encrypting guess…","pending");

        const has = await contract.hasCode();
        if (!has) throw new Error("Door code not set yet");

        const guess = parseInt($("#guessInput").value);
        if (guess < 1 || guess > 9999) throw new Error("Guess must be in [1,9999]");

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

        setStatus("#guessStatus","📊 Fetching result handle…","pending");

        const fh = await contract.resultHandle(address);
        log("ResultHandle", fh);

        $("#resultHandleOutput").textContent = "Result Handle:\n" + fh;
        $("#resultHandleOutput").style.display = "block";

        setStatus("#guessStatus","✅ Result stored","success");
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
        const fh = await contract.resultHandle(address);
        log("Handle", fh);

        $("#resultHandleOutput").textContent = "Result Handle:\n" + fh;
        $("#resultHandleOutput").style.display = "block";

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

        setStatus("#decryptStatus","🔓 Making result public…","pending");

        const tx = await contract.makeMyResultPublic();
        log("MakePublic Tx", tx.hash);
        const receipt = await tx.wait();
        log("MakePublic Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#decryptStatus","✅ Result is now public","success");
      } catch (e) {
        logError("MakePublic", e);
        setStatus("#decryptStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== PUBLIC DECRYPT =====
    async function decryptResult(rawHandle) {
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

    // ===== DECRYPT BUTTON =====
    $("#btnDecrypt").onclick = async () => {
      try {
        await connect();

        const raw = $("#resultHandleOutput").textContent.trim();
        const handle = cleanHandle(raw);
        console.log("Decrypting handle:", handle);

        setStatus("#decryptStatus","🔓 Decrypting via relayer…","pending");
        const code = await decryptResult(handle);

        const resultDiv = $("#guessResult");
        let title, desc, cls="match-result";

        if (code === 0) {
          title = "✅ CORRECT CODE!";
          desc = "Your encrypted guess exactly matches the hidden door code.";
        } else if (code === 1) {
          title = "⬇️ TOO LOW";
          desc = "Your encrypted guess is lower than the hidden door code.";
        } else {
          title = "⬆️ TOO HIGH";
          desc = "Your encrypted guess is higher than the hidden door code.";
        }

        if (code !== 0) cls = "match-result no-match";

        resultDiv.className = cls;
        resultDiv.innerHTML =
          `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">${title}</div>
           <div style="color:#d1d5db;font-size:14px;">${desc}</div>`;
        resultDiv.style.display = "block";

        setStatus("#decryptStatus","✅ Result decrypted","success");
      } catch (e) {
        console.error("Decrypt failed:", e);
        setStatus("#decryptStatus","❌ " + (e.message || e),"error");
      }
    };

    log("Script","✅ All handlers attached and ready");
  