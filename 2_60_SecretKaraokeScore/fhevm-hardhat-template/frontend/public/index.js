import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0x81551aaE3390D72D2B7D8aD016c25EFc9fFBdD0d"
    };

    const ABI = [
      "function submitScore(bytes32 userId, bytes32 encScore, bytes attestation) external",
      "function computeLevel(bytes32 userId, bytes32 encZero, bytes attestation) external returns (bytes32)",
      "function makeLevelPublic(bytes32 userId) external",
      "function levelHandle(bytes32 userId) external view returns (bytes32)",
      "function entryExists(bytes32 userId) external view returns (bool)",
      "function levelExists(bytes32 userId) external view returns (bool)",
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
        setStatus("#scoreStatus", "Wallet/relayer connection failed", "error");
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

    // 1) SUBMIT SCORE
    $("#btnSubmitScore").onclick = async () => {
      try {
        log("SubmitScore", "click");
        if (!(await connect())) return;

        clearStatus("#scoreStatus");
        $("#scoreLog").style.display = "none";

        const userKey = $("#userKey").value;
        const score = parseInt($("#userScore").value, 10) || 0;
        const userId = toUserId(userKey);

        setStatus("#scoreStatus", "Encrypting karaoke score…", "pending");
        const { handle, attestation } = await encryptEuint16(score);

        log("submitScore args", { userId, handle, attLen: attestation.length });

        setStatus("#scoreStatus", "Submitting submitScore tx…", "pending");
        const tx = await contract.submitScore(userId, handle, attestation);
        log("Tx submitScore sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx submitScore receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        $("#scoreLog").textContent =
          `Score submitted
userKey: ${userKey}
userId: ${userId}
score: ${score}
encHandle: ${handle}`;
        $("#scoreLog").style.display = "block";

        setStatus("#scoreStatus", "Secret score submitted", "success");
      } catch (e) {
        logError("SubmitScore", e);
        setStatus("#scoreStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // 2) COMPUTE LEVEL
    $("#btnComputeLevel").onclick = async () => {
      try {
        log("ComputeLevel", "click");
        if (!(await connect())) return;

        clearStatus("#levelStatus");
        $("#levelHandleOutput").style.display = "none";

        const userKey = $("#levelUserKey").value;
        const userId = toUserId(userKey);
        const zeroVal = 0;

        setStatus("#levelStatus", "Encrypting zero value…", "pending");
        const { handle: encZero, attestation } = await encryptEuint16(zeroVal);

        log("computeLevel args", { userId, encZero, attLen: attestation.length });

        setStatus("#levelStatus", "Submitting computeLevel tx…", "pending");
        const tx = await contract.computeLevel(userId, encZero, attestation);
        log("Tx computeLevel sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx computeLevel receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        setStatus("#levelStatus", "Level computed, fetching handle…", "pending");
        const handle = await contract.levelHandle(userId);
        log("levelHandle()", handle);

        $("#levelHandleOutput").textContent = "Level Handle:\n" + handle;
        $("#levelHandleOutput").style.display = "block";

        $("#decryptUserKey").value = userKey;
        $("#handleOutput").textContent = "Level Handle:\n" + handle;
        $("#handleOutput").style.display = "block";

        setStatus("#levelStatus", "Level handle stored", "success");
      } catch (e) {
        logError("ComputeLevel", e);
        setStatus("#levelStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // 3) MAKE LEVEL PUBLIC
    $("#btnMakeLevelPublic").onclick = async () => {
      try {
        log("MakeLevelPublic", "click");
        if (!(await connect())) return;

        clearStatus("#decryptStatus");

        const userKey = $("#decryptUserKey").value;
        const userId = toUserId(userKey);

        setStatus("#decryptStatus", "Submitting makeLevelPublic tx…", "pending");
        const tx = await contract.makeLevelPublic(userId);
        log("Tx makeLevelPublic sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx makeLevelPublic receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        setStatus("#decryptStatus", "Level is now public", "success");
      } catch (e) {
        logError("MakeLevelPublic", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // GET LEVEL HANDLE
    $("#btnGetLevelHandle").onclick = async () => {
      try {
        log("GetLevelHandle", "click");
        if (!(await connect())) return;

        clearStatus("#decryptStatus");
        $("#handleOutput").style.display = "none";

        const userKey = $("#decryptUserKey").value;
        const userId = toUserId(userKey);

        setStatus("#decryptStatus", "Fetching level handle…", "pending");
        const handle = await contract.levelHandle(userId);
        log("levelHandle()", handle);

        $("#handleOutput").textContent = "Level Handle:\n" + handle;
        $("#handleOutput").style.display = "block";

        setStatus("#decryptStatus", "Handle retrieved", "success");
      } catch (e) {
        logError("GetLevelHandle", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // DECRYPT
    function cleanHandle(raw) {
      return String(raw).trim().split("\n").pop().trim();
    }

    async function decryptLevel(handleHex) {
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

    $("#btnDecryptLevel").onclick = async () => {
      try {
        await connect();
        clearStatus("#decryptStatus");

        const raw = $("#handleOutput").textContent || $("#levelHandleOutput").textContent;
        const handle = cleanHandle(raw);

        const code = await decryptLevel(handle);

        const resultDiv = $("#levelResult");
        resultDiv.style.display = "block";

        if (code === 0) {
          resultDiv.className = "result-box none";
          resultDiv.textContent = "Level: None (0). Keep practicing!";
        } else if (code === 1) {
          resultDiv.className = "result-box bronze";
          resultDiv.textContent = "Level: Bronze (1). Nice start!";
        } else if (code === 2) {
          resultDiv.className = "result-box silver";
          resultDiv.textContent = "Level: Silver (2). Great singing!";
        } else if (code === 3) {
          resultDiv.className = "result-box gold";
          resultDiv.textContent = "Level: Gold (3). Karaoke legend!";
        } else {
          resultDiv.className = "result-box none";
          resultDiv.textContent = "Unexpected level code: " + code;
        }

        setStatus("#decryptStatus", "✅ Level decrypted", "success");
      } catch (e) {
        logError("DecryptLevel", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    log("Script", "✅ Karaoke handlers attached and ready");
  