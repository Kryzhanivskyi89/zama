import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0x338eD9b9cef3E9fb81866401797A9C0b8C212BCF"
    };

   const ABI = [
  "function submitTime(bytes32 userId, bytes32 encTime, bytes attestation) external",
  // "function computeFlag(bytes32 userId, bytes32 encTime, bytes attestation) external returns (bytes32)",
  "function makeFlagPublic(bytes32 userId) external",
  "function flagHandle(bytes32 userId) external view returns (bytes32)",
  "function hasBestTime(bytes32 userId) external view returns (bool)",
  "function flagExists(bytes32 userId) external view returns (bool)",

  "function computeFlag(bytes32 userId, bytes32 encTime, bytes attestation) external returns (bytes32)",

  "function runnerOwner(bytes32 userId) external view returns (address)"
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

    const toRunnerId = (text) => {
      const t = (text || "").trim();
      const h = keccak256(toUtf8Bytes(t));
      log("RunnerId derived", { key: t, runnerId: h });
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
        setStatus("#timeStatus", "Wallet/relayer connection failed", "error");
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

    // 1) SUBMIT TIME
    $("#btnSubmitTime").onclick = async () => {
      try {
        log("SubmitTime", "click");
        if (!(await connect())) return;

        clearStatus("#timeStatus");
        $("#timeLog").style.display = "none";

        const runnerKey = $("#runnerKey").value;
        const timeVal = parseInt($("#raceTime").value, 10) || 0;
        const runnerId = toRunnerId(runnerKey);

        setStatus("#timeStatus", "Encrypting race time…", "pending");
        const { handle, attestation } = await encryptEuint16(timeVal);

        log("submitTime args", { runnerId, handle, attLen: attestation.length });

        setStatus("#timeStatus", "Submitting submitTime tx…", "pending");
        const tx = await contract.submitTime(runnerId, handle, attestation);
        log("Tx submitTime sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx submitTime receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        $("#timeLog").textContent =
          `Time submitted
runnerKey: ${runnerKey}
runnerId: ${runnerId}
time: ${timeVal}
encHandle: ${handle}`;
        $("#timeLog").style.display = "block";

        setStatus("#timeStatus", "Encrypted time submitted", "success");
      } catch (e) {
        logError("SubmitTime", e);
        setStatus("#timeStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // 2) COMPUTE FLAG (personal best)
$("#btnComputeFlag").onclick = async () => {
  try {
    log("ComputeFlag", "click");
    if (!(await connect())) return;

    clearStatus("#flagStatus");
    $("#flagHandleOutput").style.display = "none";

    const runnerKey = $("#flagRunnerKey").value;
    const timeVal = parseInt($("#flagRaceTime").value, 10) || 0;
    const runnerId = toRunnerId(runnerKey);

    setStatus("#flagStatus", "Encrypting race time…", "pending");
    const { handle: encTime, attestation } = await encryptEuint16(timeVal);

    log("computeFlag args", { runnerId, encTime, attLen: attestation.length });

    setStatus("#flagStatus", "Submitting computeFlag tx…", "pending");
    const tx = await contract.computeFlag(runnerId, encTime, attestation);
    log("Tx computeFlag sent", tx.hash);
    const receipt = await tx.wait();
    log("Tx computeFlag receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

    setStatus("#flagStatus", "Flag computed, fetching handle…", "pending");
    const handle = await contract.flagHandle(runnerId);
    log("flagHandle()", handle);

    $("#flagHandleOutput").textContent = "Flag Handle:\n" + handle;
    $("#flagHandleOutput").style.display = "block";

    $("#decryptRunnerKey").value = runnerKey;
    $("#handleOutput").textContent = "Flag Handle:\n" + handle;
    $("#handleOutput").style.display = "block";

    setStatus("#flagStatus", "Flag handle stored", "success");
  } catch (e) {
    logError("ComputeFlag", e);
    setStatus("#flagStatus", "Error: " + (e.message || String(e)), "error");
  }
};

    // 3) MAKE FLAG PUBLIC
    $("#btnMakeFlagPublic").onclick = async () => {
      try {
        log("MakeFlagPublic", "click");
        if (!(await connect())) return;

        clearStatus("#decryptStatus");

        const runnerKey = $("#decryptRunnerKey").value;
        const runnerId = toRunnerId(runnerKey);

        setStatus("#decryptStatus", "Submitting makeFlagPublic tx…", "pending");
        const tx = await contract.makeFlagPublic(runnerId);
        log("Tx makeFlagPublic sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx makeFlagPublic receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        setStatus("#decryptStatus", "Flag is now public", "success");
      } catch (e) {
        logError("MakeFlagPublic", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // GET FLAG HANDLE
    $("#btnGetFlagHandle").onclick = async () => {
      try {
        log("GetFlagHandle", "click");
        if (!(await connect())) return;

        clearStatus("#decryptStatus");
        $("#handleOutput").style.display = "none";

        const runnerKey = $("#decryptRunnerKey").value;
        const runnerId = toRunnerId(runnerKey);

        setStatus("#decryptStatus", "Fetching flag handle…", "pending");
        const handle = await contract.flagHandle(runnerId);
        log("flagHandle()", handle);

        $("#handleOutput").textContent = "Flag Handle:\n" + handle;
        $("#handleOutput").style.display = "block";

        setStatus("#decryptStatus", "Handle retrieved", "success");
      } catch (e) {
        logError("GetFlagHandle", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // DECRYPT FLAG
    function cleanHandle(raw) {
      return String(raw).trim().split("\n").pop().trim();
    }

    async function decryptFlag(handleHex) {
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

      return Number(result); // 0/1
    }

    $("#btnDecryptFlag").onclick = async () => {
      try {
        await connect();
        clearStatus("#decryptStatus");

        const raw = $("#handleOutput").textContent || $("#flagHandleOutput").textContent;
        const handle = cleanHandle(raw);

        const code = await decryptFlag(handle);

        const resultDiv = $("#flagResult");
        resultDiv.style.display = "block";

        if (code === 1) {
          resultDiv.className = "result-box best";
          resultDiv.textContent = "Result: PERSONAL BEST (1). Congratulations!";
        } else if (code === 0) {
          resultDiv.className = "result-box not-best";
          resultDiv.textContent = "Result: Not a personal best (0). Try again!";
        } else {
          resultDiv.className = "result-box not-best";
          resultDiv.textContent = "Unexpected flag value: " + code;
        }

        setStatus("#decryptStatus", "✅ Flag decrypted", "success");
      } catch (e) {
        logError("DecryptFlag", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    log("Script", "✅ Race time handlers attached and ready");