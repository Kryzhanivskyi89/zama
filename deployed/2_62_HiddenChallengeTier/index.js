    import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0x3b2b61469d8a633d895f7F3b0e8ed94e1F30f187"
    };

    const ABI = [
      "function submitCompleted(bytes32 userId, bytes32 encCompleted, bytes attestation) external",
      "function computeTier(bytes32 userId, bytes32 encZero, bytes attestation) external returns (bytes32)",
      "function makeTierPublic(bytes32 userId) external",
      "function tierHandle(bytes32 userId) external view returns (bytes32)",
      "function entryExists(bytes32 userId) external view returns (bool)",
      "function tierExists(bytes32 userId) external view returns (bool)",
      "function entryOwner(bytes32 userId) external view returns (address)"
    ];

    let provider, signer, address, contract, relayer;
    const $ = s => document.querySelector(s);

    const log = (title, data) => console.log(`%c[${title}]`, "color:#38bdf8;font-weight:bold;", data);
    const logError = (title, err) => console.error(`%c[ERROR:${title}]`, "color:#ef4444;font-weight:bold;", err);

    const toHex = u8 => "0x" + Array.from(u8, b => b.toString(16).padStart(2,"0")).join("");

    const setStatus = (id, msg, type="pending") => {
      const el = $(id);
      if (!el) return;
      el.textContent = msg;
      el.className = `status ${type}`;
      el.style.display = "block";
      log(`STATUS ${id}`, msg);
    };
    const clearStatus = id => {
      const el = $(id);
      if (el) el.style.display = "none";
    };

    const toUserId = (text) => {
      const t = (text || "").trim();
      const h = keccak256(toUtf8Bytes(t));
      log("UserId derived", { key: t, userId: h });
      return h;
    };

    async function connect() {
      try {
        log("Connect", "start");
        if (!window.ethereum) throw new Error("MetaMask not installed");

        provider = provider || new BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        log("Accounts", accounts);

        signer = signer || await provider.getSigner();
        address = address || await signer.getAddress();
        log("Address", address);

        contract = contract || new Contract(getAddress(CONFIG.CONTRACT_ADDRESS), ABI, signer);
        log("Contract", CONFIG.CONTRACT_ADDRESS);

        $("#btnConnect").textContent = address.slice(0, 6) + "…" + address.slice(-4);

        if (!relayer) {
          await initSDK();
          relayer = await createInstance({
            ...SepoliaConfig,
            relayerUrl: CONFIG.RELAYER_URL,
            gatewayUrl: CONFIG.GATEWAY_URL,
            network: window.ethereum,
            debug: true
          });
          log("Relayer", "instance created");
        }

        log("Connect", "done");
        return true;
      } catch (e) {
        logError("Connect", e);
        setStatus("#submitStatus", "Wallet/relayer connection failed", "error");
        return false;
      }
    }

    $("#btnConnect").onclick = connect;

    async function encryptEuint16(value) {
      if (!relayer) throw new Error("Relayer not initialized");
      if (!address) throw new Error("No wallet address");

      log("EncryptEuint16", { value });

      const enc = relayer.createEncryptedInput(
        getAddress(CONFIG.CONTRACT_ADDRESS),
        getAddress(address)
      );

      enc.add16(BigInt(value));

      const { handles, inputProof } = await enc.encrypt();
      log("Encrypt result", { handleCount: handles.length, type0: typeof handles[0] });

      const hRaw = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
      const handle = typeof hRaw === "string" ? hRaw : toHex(hRaw);

      const att = typeof inputProof === "string"
        ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof)
        : toHex(inputProof);

      log("EncryptEuint16 final", { handle, attLen: att.length });
      return { handle, attestation: att };
    }

    // 1) SUBMIT COMPLETED
    $("#btnSubmitCompleted").onclick = async () => {
      try {
        log("SubmitCompleted", "click");
        if (!(await connect())) return;

        clearStatus("#submitStatus");
        $("#submitLog").style.display = "none";

        const playerKey = $("#playerKey").value;
        const completed = parseInt($("#completedCount").value, 10) || 0;
        const userId = toUserId(playerKey);

        setStatus("#submitStatus", "Encrypting completed challenges…", "pending");
        const { handle, attestation } = await encryptEuint16(completed);

        log("submitCompleted args", { userId, handle, attLen: attestation.length });

        setStatus("#submitStatus", "Submitting submitCompleted tx…", "pending");
        const tx = await contract.submitCompleted(userId, handle, attestation);
        log("Tx submitCompleted sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx submitCompleted receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        $("#submitLog").textContent =
          `Progress submitted
playerKey: ${playerKey}
userId: ${userId}
completed: ${completed}
encHandle: ${handle}`;
        $("#submitLog").style.display = "block";

        setStatus("#submitStatus", "Encrypted progress submitted", "success");
      } catch (e) {
        logError("SubmitCompleted", e);
        setStatus("#submitStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // 2) COMPUTE TIER
    $("#btnComputeTier").onclick = async () => {
      try {
        log("ComputeTier", "click");
        if (!(await connect())) return;

        clearStatus("#tierStatus");
        $("#tierHandleOutput").style.display = "none";

        const playerKey = $("#tierPlayerKey").value;
        const userId = toUserId(playerKey);
        const zeroVal = 0;

        setStatus("#tierStatus", "Encrypting zero value…", "pending");
        const { handle: encZero, attestation } = await encryptEuint16(zeroVal);

        log("computeTier args", { userId, encZero, attLen: attestation.length });

        setStatus("#tierStatus", "Submitting computeTier tx…", "pending");
        const tx = await contract.computeTier(userId, encZero, attestation);
        log("Tx computeTier sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx computeTier receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        setStatus("#tierStatus", "Tier computed, fetching handle…", "pending");
        const handle = await contract.tierHandle(userId);
        log("tierHandle()", handle);

        $("#tierHandleOutput").textContent = "Tier Handle:\n" + handle;
        $("#tierHandleOutput").style.display = "block";

        $("#decryptPlayerKey").value = playerKey;
        $("#handleOutput").textContent = "Tier Handle:\n" + handle;
        $("#handleOutput").style.display = "block";

        setStatus("#tierStatus", "Tier handle stored", "success");
      } catch (e) {
        logError("ComputeTier", e);
        setStatus("#tierStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // 3) MAKE PUBLIC & GET HANDLE
    $("#btnMakeTierPublic").onclick = async () => {
      try {
        log("MakeTierPublic", "click");
        if (!(await connect())) return;

        clearStatus("#decryptStatus");

        const playerKey = $("#decryptPlayerKey").value;
        const userId = toUserId(playerKey);

        setStatus("#decryptStatus", "Submitting makeTierPublic tx…", "pending");
        const tx = await contract.makeTierPublic(userId);
        log("Tx makeTierPublic sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx makeTierPublic receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        setStatus("#decryptStatus", "Tier is now public", "success");
      } catch (e) {
        logError("MakeTierPublic", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    $("#btnGetTierHandle").onclick = async () => {
      try {
        log("GetTierHandle", "click");
        if (!(await connect())) return;

        clearStatus("#decryptStatus");
        $("#handleOutput").style.display = "none";

        const playerKey = $("#decryptPlayerKey").value;
        const userId = toUserId(playerKey);

        setStatus("#decryptStatus", "Fetching tier handle…", "pending");
        const handle = await contract.tierHandle(userId);
        log("tierHandle()", handle);

        $("#handleOutput").textContent = "Tier Handle:\n" + handle;
        $("#handleOutput").style.display = "block";

        setStatus("#decryptStatus", "Handle retrieved", "success");
      } catch (e) {
        logError("GetTierHandle", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // DECRYPT TIER
    function cleanHandle(raw) {
      return String(raw).trim().split("\n").pop().trim();
    }

    async function decryptTier(handleHex) {
      if (!relayer) throw new Error("Relayer not initialized");

      const handle = String(handleHex).trim();
      if (!handle.startsWith("0x") || handle.length !== 66)
        throw new Error("Invalid ciphertext handle");

      const request = [handle];
      const out = await relayer.publicDecrypt(request);

      if (!out || typeof out !== "object" || !out.clearValues)
        throw new Error("Invalid decrypt response");

      const lower = handle.toLowerCase();
      const result = out.clearValues[handle] ?? out.clearValues[lower];

      if (result === undefined || result === null)
        throw new Error("Decrypt produced no value");

      return Number(result); // 0..3
    }

    $("#btnDecryptTier").onclick = async () => {
      try {
        await connect();
        clearStatus("#decryptStatus");

        const raw = $("#handleOutput").textContent || $("#tierHandleOutput").textContent;
        const handle = cleanHandle(raw);

        const code = await decryptTier(handle);

        const resultDiv = $("#tierResult");
        resultDiv.style.display = "block";

        if (code === 0) {
          resultDiv.className = "result-box none";
          resultDiv.textContent = "Tier: None (0). Keep climbing!";
        } else if (code === 1) {
          resultDiv.className = "result-box rookie";
          resultDiv.textContent = "Tier: Rookie (1). You’ve started your journey.";
        } else if (code === 2) {
          resultDiv.className = "result-box pro";
          resultDiv.textContent = "Tier: Pro (2). Strong challenger!";
        } else if (code === 3) {
          resultDiv.className = "result-box legend";
          resultDiv.textContent = "Tier: Legend (3). Top of the mountain!";
        } else {
          resultDiv.className = "result-box none";
          resultDiv.textContent = "Unexpected tier code: " + code;
        }

        setStatus("#decryptStatus", "✅ Tier decrypted", "success");
      } catch (e) {
        logError("DecryptTier", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    log("Script", "✅ Hidden Challenge handlers attached and ready");