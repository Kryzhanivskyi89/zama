import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0x409f8a50e5d64CadE057Eb48a917E40C8320B404"
    };

    const ABI = [
      "function setHouseBias(bytes32,bytes) external",
      "function playFlip(bytes32,bytes) external returns (bytes32)",
      "function makeMyResultPublic() external",
      "function makeMyWinsPublic() external",
      "function resultHandle(address) external view returns (bytes32)",
      "function winsHandle(address) external view returns (bytes32)",
      "function hasBias() external view returns (bool)",
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
        setStatus("#biasStatus","❌ Wallet connection failed","error");
        return false;
      }
    }

    $("#btnConnect").onclick = connect;

    // encrypt euint8
    async function encrypt8(value) {
      if (!relayer) throw new Error("Relayer not initialized");

      const enc = relayer.createEncryptedInput(
        getAddress(CONFIG.CONTRACT_ADDRESS),
        getAddress(address)
      );
      log("Encrypt8", `add8=${value}`);
      enc.add8(BigInt(value));

      const { handles, inputProof } = await enc.encrypt();
      log("Encrypt8 Result", {
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

    // ===== SET BIAS (HOUSE) =====
    $("#btnSetBias").onclick = async () => {
      try {
        log("SetBias","Starting...");
        if (!await connect()) return;

        clearStatus("#biasStatus");
        setStatus("#biasStatus","🔐 Encrypting house bias…","pending");

        const bias = parseInt($("#biasInput").value);
        if (bias !== 0 && bias !== 1) throw new Error("Bias must be 0 or 1");

        const { handle, attestation } = await encrypt8(bias);
        log("SetBias Args", {
          handle: handle.slice(0,40) + "...",
          attLen: attestation.length
        });

        setStatus("#biasStatus","⛓️ Sending tx…","pending");

        const tx = await contract.setHouseBias(handle, attestation);
        log("SetBias Tx", tx.hash);
        const receipt = await tx.wait();
        log("SetBias Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#biasStatus","✅ House bias stored (encrypted)","success");
      } catch (e) {
        logError("SetBias", e);
        setStatus("#biasStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== PLAYER: PLAY FLIP =====
    $("#btnPlayFlip").onclick = async () => {
      try {
        log("PlayFlip","Starting...");
        if (!await connect()) return;

        clearStatus("#flipStatus");
        setStatus("#flipStatus","🧮 Encrypting choice…","pending");

        const has = await contract.hasBias();
        if (!has) throw new Error("House bias not set yet");

        const choice = parseInt($("#choiceInput").value);
        if (choice !== 0 && choice !== 1) throw new Error("Choice must be 0 or 1");

        const { handle, attestation } = await encrypt8(choice);
        log("PlayFlip Args", {
          handle: handle.slice(0,40) + "...",
          attLen: attestation.length
        });

        setStatus("#flipStatus","⛓️ Sending tx…","pending");

        const tx = await contract.playFlip(handle, attestation);
        log("PlayFlip Tx", tx.hash);
        const receipt = await tx.wait();
        log("PlayFlip Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#flipStatus","📊 Fetching result handle…","pending");

        const fh = await contract.resultHandle(address);
        log("ResultHandle", fh);

        $("#resultHandleOutput").textContent = "Result Handle:\n" + fh;
        $("#resultHandleOutput").style.display = "block";

        setStatus("#flipStatus","✅ Result stored","success");
      } catch (e) {
        logError("PlayFlip", e);
        setStatus("#flipStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== GET RESULT HANDLE =====
    $("#btnGetResultHandle").onclick = async () => {
      try {
        log("GetResultHandle","Starting...");
        if (!await connect()) return;

        setStatus("#decryptResultStatus","📊 Retrieving handle…","pending");
        const fh = await contract.resultHandle(address);
        log("Handle", fh);

        $("#resultHandleOutput").textContent = "Result Handle:\n" + fh;
        $("#resultHandleOutput").style.display = "block";

        setStatus("#decryptResultStatus","✅ Handle retrieved","success");
      } catch (e) {
        logError("GetResultHandle", e);
        setStatus("#decryptResultStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== MAKE RESULT PUBLIC =====
    $("#btnMakeResultPublic").onclick = async () => {
      try {
        log("MakeResultPublic","Starting...");
        if (!await connect()) return;

        setStatus("#decryptResultStatus","🔓 Making result public…","pending");

        const tx = await contract.makeMyResultPublic();
        log("MakeResultPublic Tx", tx.hash);
        const receipt = await tx.wait();
        log("MakeResultPublic Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#decryptResultStatus","✅ Result is now public","success");
      } catch (e) {
        logError("MakeResultPublic", e);
        setStatus("#decryptResultStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== PUBLIC DECRYPT RESULT =====
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

    $("#btnDecryptResult").onclick = async () => {
      try {
        await connect();

        const raw = $("#resultHandleOutput").textContent.trim();
        const handle = cleanHandle(raw);
        console.log("Decrypting handle:", handle);

        setStatus("#decryptResultStatus","🔓 Decrypting via relayer…","pending");
        const code = await decryptResult(handle);

        const resultDiv = $("#flipResult");
        let title, desc, cls="match-result";

        if (code === 1) {
          title = "✅ YOU WIN!";
          desc = "Your encrypted choice matches the biased coin outcome.";
        } else if (code === 2) {
          title = "🤝 PUSH";
          desc = "Special push result: no win, no loss.";
        } else {
          title = "❌ YOU LOSE";
          desc = "Your encrypted choice does not match the coin outcome.";
          cls = "match-result no-match";
        }

        resultDiv.className = cls;
        resultDiv.innerHTML =
          `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">${title}</div>
           <div style="color:#d1d5db;font-size:14px;">${desc}</div>`;
        resultDiv.style.display = "block";

        setStatus("#decryptResultStatus","✅ Result decrypted","success");
      } catch (e) {
        console.error("Decrypt failed:", e);
        setStatus("#decryptResultStatus","❌ " + (e.message || e),"error");
      }
    };

    // ===== WINS: GET HANDLE / MAKE PUBLIC / DECRYPT =====
    $("#btnGetWinsHandle").onclick = async () => {
      try {
        log("GetWinsHandle","Starting...");
        if (!await connect()) return;

        setStatus("#winsStatus","📊 Retrieving wins handle…","pending");
        const fh = await contract.winsHandle(address);
        log("WinsHandle", fh);

        $("#winsHandleOutput").textContent = "Wins Handle:\n" + fh;
        $("#winsHandleOutput").style.display = "block";

        setStatus("#winsStatus","✅ Wins handle retrieved","success");
      } catch (e) {
        logError("GetWinsHandle", e);
        setStatus("#winsStatus","❌ " + (e.message || e),"error");
      }
    };

    $("#btnMakeWinsPublic").onclick = async () => {
      try {
        log("MakeWinsPublic","Starting...");
        if (!await connect()) return;

        setStatus("#winsStatus","🔓 Making wins public…","pending");

        const tx = await contract.makeMyWinsPublic();
        log("MakeWinsPublic Tx", tx.hash);
        const receipt = await tx.wait();
        log("MakeWinsPublic Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#winsStatus","✅ Wins are now public","success");
      } catch (e) {
        logError("MakeWinsPublic", e);
        setStatus("#winsStatus","❌ " + (e.message || e),"error");
      }
    };

    async function decryptWins(rawHandle) {
      if (!relayer) throw new Error("Relayer not initialized");

      const handle = cleanHandle(rawHandle);
      if (!handle.startsWith("0x") || handle.length !== 66)
        throw new Error("Invalid handle format (must be bytes32)");

      const request = [handle];
      console.log("🔎 publicDecrypt wins request:", request);

      const out = await relayer.publicDecrypt(request);
      console.log("🔍 publicDecrypt wins output:", out);

      if (!out || typeof out !== "object" || !out.clearValues)
        throw new Error("Invalid decrypt response (no clearValues)");

      const v =
        out.clearValues[handle] ??
        out.clearValues[handle.toLowerCase()];

      if (v === undefined) throw new Error("Decrypt produced no value");

      console.log("🔐 wins clear value:", v);
      return BigInt(v); // uint16
    }

    $("#btnDecryptWins").onclick = async () => {
      try {
        await connect();

        const raw = $("#winsHandleOutput").textContent.trim();
        const handle = cleanHandle(raw);
        console.log("Decrypting wins handle:", handle);

        setStatus("#winsStatus","🔓 Decrypting wins via relayer…","pending");
        const wins = await decryptWins(handle);

        const div = $("#winsResult");
        div.className = "match-result";
        div.innerHTML =
          `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">🏆 TOTAL WINS</div>
           <div style="color:#d1d5db;font-size:14px;">
             You have <strong>${wins.toString()}</strong> encrypted wins against the house.
           </div>`;
        div.style.display = "block";

        setStatus("#winsStatus","✅ Wins decrypted","success");
      } catch (e) {
        console.error("Decrypt wins failed:", e);
        setStatus("#winsStatus","❌ " + (e.message || e),"error");
      }
    };

    log("Script","✅ All handlers attached and ready");
  