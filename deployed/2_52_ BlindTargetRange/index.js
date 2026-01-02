import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0xD3a7ba4dcA19a5D5324f8Bbab7AAa86e984e1D61"
    };

    const ABI = [
      "function submitInterval(bytes32,bytes32,bytes) external returns (uint256)",
      "function submitShot(bytes32,bytes) external returns (uint256)",
      "function computeHit(uint256,uint256,bytes32,bytes32,bytes) external returns (bytes32)",
      "function makeHitPublic(uint256,uint256) external",
      "function hitHandle(uint256,uint256) external view returns (bytes32)",
      "function intervalExists(uint256) external view returns (bool)",
      "function shotExists(uint256) external view returns (bool)",
      "function intervalOwner(uint256) external view returns (address)",
      "function shotOwner(uint256) external view returns (address)"
    ];

    let provider, signer, address, contract, relayer;
    const $ = s => document.querySelector(s);

    const log = (t, d) => console.log(`%c[${t}]`, "color:#38bdf8;font-weight:bold;", d);
    const logError = (t, e) => console.error(`%c[ERROR: ${t}]`, "color:#ef4444;font-weight:bold;", e);
    const logSuccess = (t, d) => console.log(`%c[SUCCESS: ${t}]`, "color:#10b981;font-weight:bold;", d);

    const toHex = u8 => "0x" + Array.from(u8, b => b.toString(16).padStart(2,"0")).join("");

    const setStatus = (id, msg, type="pending") => {
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
        log("Connect", "Starting...");
        if (!window.ethereum) throw new Error("MetaMask not installed");

        provider = new BrowserProvider(window.ethereum);
        log("Provider", "Created");

        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        address = await signer.getAddress();
        log("Address", address);

        contract = new Contract(getAddress(CONFIG.CONTRACT_ADDRESS), ABI, signer);
        log("Contract", CONFIG.CONTRACT_ADDRESS);

        $("#btnConnect").textContent = address.slice(0,6) + "…" + address.slice(-4);

        if (!relayer) {
          log("Relayer", "initSDK...");
          await initSDK();
          relayer = await createInstance({
            ...SepoliaConfig,
            relayerUrl: CONFIG.RELAYER_URL,
            gatewayUrl: CONFIG.GATEWAY_URL,
            network: window.ethereum,
            debug: true
          });
          logSuccess("Relayer", "Instance created");
        }

        logSuccess("Connect", "Ready");
        return true;
      } catch (e) {
        logError("Connect", e);
        setStatus("#intervalStatus", "❌ Wallet connection failed", "error");
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
      const handle = typeof raw === "string" ? raw : toHex(raw);
      const attestation =
        typeof inputProof === "string"
          ? inputProof.startsWith("0x") ? inputProof : "0x" + inputProof
          : toHex(inputProof);

      return { handle, attestation };
    }

    // ===== SUBMIT INTERVAL =====
$("#btnSubmitInterval").onclick = async () => {
  try {
    log("SubmitInterval", "Starting...");
    if (!await connect()) return;

    setStatus("#intervalStatus", "📝 Encrypting interval…", "pending");

    const L = parseInt($("#leftBound").value);
    const R = parseInt($("#rightBound").value);
    log("Interval Values", { L, R });

    // один encrypt із двома add16, як у PrivateDonorMatch
    const enc = relayer.createEncryptedInput(
      getAddress(CONFIG.CONTRACT_ADDRESS),
      getAddress(address)
    );
    enc.add16(BigInt(L));
    enc.add16(BigInt(R));

    const { handles, inputProof } = await enc.encrypt();
    log("Interval Encrypt", {
      handleCount: handles.length,
      proofLength: typeof inputProof === "string" ? inputProof.length : inputProof.length
    });

    const raw1 = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
    const raw2 = handles[1]?.handle || handles[1]?.ciphertext || handles[1];
    const h1 = typeof raw1 === "string" ? raw1 : toHex(raw1);
    const h2 = typeof raw2 === "string" ? raw2 : toHex(raw2);
    const att =
      typeof inputProof === "string"
        ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof)
        : toHex(inputProof);

    log("Interval Args", {
      h1: h1.slice(0,40) + "...",
      h2: h2.slice(0,40) + "...",
      attLen: att.length
    });

    setStatus("#intervalStatus", "⛓️ Submitting to blockchain…", "pending");

    const tx = await contract.submitInterval(h1, h2, att);
    log("Interval Tx", tx.hash);
    const receipt = await tx.wait();
    log("Interval Receipt", { blockNumber: receipt.blockNumber, logCount: receipt.logs.length });

  
let intervalId = "1";
try {
  if (typeof contract.nextIntervalId === "function") {
    const next = await contract.nextIntervalId();
    intervalId = (BigInt(next) - 1n).toString();
  }
} catch {}


    $("#intervalIdDisplay").textContent = intervalId;
    $("#intervalAddressDisplay").textContent = address.slice(0,6) + "…" + address.slice(-4);
    $("#intervalInfo").style.display = "grid";

    setStatus("#intervalStatus", `✅ Interval registered! ID: ${intervalId}`, "success");
    logSuccess("SubmitInterval", `ID=${intervalId}`);

    $("#hitIntervalId").value = intervalId;
    $("#decryptIntervalId").value = intervalId;
  } catch (e) {
    logError("SubmitInterval", e);
    setStatus("#intervalStatus", "❌ " + (e.message || e), "error");
  }
};

    // ===== SUBMIT SHOT =====
$("#btnSubmitShot").onclick = async () => {
  try {
    log("SubmitShot", "Starting...");
    if (!await connect()) return;

    setStatus("#shotStatus", "📝 Encrypting shot…", "pending");

    const X = parseInt($("#shotX").value);
    log("Shot X", X);

    const { handle, attestation } = await encrypt16(X);
    log("Shot Args", {
      handle: handle.slice(0,40) + "...",
      attLen: attestation.length
    });

    setStatus("#shotStatus", "⛓️ Submitting to blockchain…", "pending");

    const tx = await contract.submitShot(handle, attestation);
    log("Shot Tx", tx.hash);
    const receipt = await tx.wait();
    log("Shot Receipt", { blockNumber: receipt.blockNumber, logCount: receipt.logs.length });

let shotId = "1";
try {
  if (typeof contract.nextShotId === "function") {
    const next = await contract.nextShotId();
    shotId = (BigInt(next) - 1n).toString();
  }
} catch {}

    $("#shotIdDisplay").textContent = shotId;
    $("#shotAddressDisplay").textContent = address.slice(0,6) + "…" + address.slice(-4);
    $("#shotInfo").style.display = "grid";

    setStatus("#shotStatus", `✅ Shot registered! ID: ${shotId}`, "success");
    logSuccess("SubmitShot", `ID=${shotId}`);

    $("#hitShotId").value = shotId;
    $("#decryptShotId").value = shotId;
  } catch (e) {
    logError("SubmitShot", e);
    setStatus("#shotStatus", "❌ " + (e.message || e), "error");
  }
};

    // ===== COMPUTE HIT =====
    $("#btnComputeHit").onclick = async () => {
      try {
        log("ComputeHit", "Starting...");
        if (!await connect()) return;

        setStatus("#hitStatus", "🔍 Verifying entities…", "pending");

        const intervalId = parseInt($("#hitIntervalId").value);
        const shotId = parseInt($("#hitShotId").value);
        const nearR = BigInt(parseInt($("#nearRadius").value));
        const centerR = BigInt(parseInt($("#centerRadius").value));

        const intervalExists = await contract.intervalExists(intervalId);
        const shotExists = await contract.shotExists(shotId);
        if (!intervalExists) throw new Error(`❌ Interval ID ${intervalId} does not exist`);
        if (!shotExists) throw new Error(`❌ Shot ID ${shotId} does not exist`);

        logSuccess("Verify", "Interval & Shot exist");
        setStatus("#hitStatus", "🔐 Encrypting radii…", "pending");

        // один encrypt із двома add16 для nearR + centerR
        const enc = relayer.createEncryptedInput(
          getAddress(CONFIG.CONTRACT_ADDRESS),
          getAddress(address)
        );
        enc.add16(nearR);
        enc.add16(centerR);

        const { handles, inputProof } = await enc.encrypt();
        log("Hit Encrypt", {
          handleCount: handles.length,
          proofLength: typeof inputProof === "string" ? inputProof.length : inputProof.length
        });

        const rawN = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
        const rawC = handles[1]?.handle || handles[1]?.ciphertext || handles[1];
        const encNear = typeof rawN === "string" ? rawN : toHex(rawN);
        const encCenter = typeof rawC === "string" ? rawC : toHex(rawC);

        const attestation =
          typeof inputProof === "string"
            ? inputProof.startsWith("0x") ? inputProof : "0x" + inputProof
            : toHex(inputProof);

        log("Hit Args", {
          intervalId,
          shotId,
          encNear: encNear.slice(0,40) + "...",
          encCenter: encCenter.slice(0,40) + "...",
          attLen: attestation.length
        });

        setStatus("#hitStatus", "⛓️ Computing hit (homomorphic)…", "pending");

        const tx = await contract.computeHit(
          intervalId,
          shotId,
          encNear,
          encCenter,
          attestation
        );
        log("ComputeHit Tx", tx.hash);
        const receipt = await tx.wait();
        log("ComputeHit Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#hitStatus", "📊 Fetching hit handle…", "pending");

        const handle = await contract.hitHandle(intervalId, shotId);
        log("HitHandle", handle);

        $("#hitHandleOutput").textContent = "Hit Handle:\n" + handle;
        $("#hitHandleOutput").style.display = "block";

        setStatus("#hitStatus", "✅ Hit computed successfully", "success");
        logSuccess("ComputeHit", `Handle=${handle.slice(0,20)}...`);

        $("#decryptIntervalId").value = intervalId;
        $("#decryptShotId").value = shotId;
      } catch (e) {
        logError("ComputeHit", e);
        setStatus("#hitStatus", "❌ " + (e.message || e), "error");
      }
    };

    // ===== GET HANDLE =====
    $("#btnGetHandle").onclick = async () => {
      try {
        log("GetHandle", "Starting...");
        if (!await connect()) return;

        const intervalId = parseInt($("#decryptIntervalId").value);
        const shotId = parseInt($("#decryptShotId").value);

        setStatus("#decryptStatus", "📊 Retrieving handle…", "pending");

        const handle = await contract.hitHandle(intervalId, shotId);
        log("Handle", handle);

        $("#hitHandleOutput").textContent = "Hit Handle:\n" + handle;
        $("#hitHandleOutput").style.display = "block";

        setStatus("#decryptStatus", "✅ Handle retrieved", "success");
      } catch (e) {
        logError("GetHandle", e);
        setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      }
    };

    // ===== MAKE PUBLIC =====
    $("#btnMakePublic").onclick = async () => {
      try {
        log("MakePublic", "Starting...");
        if (!await connect()) return;

        const intervalId = parseInt($("#decryptIntervalId").value);
        const shotId = parseInt($("#decryptShotId").value);

        setStatus("#decryptStatus", "🔓 Making hit public…", "pending");

        const tx = await contract.makeHitPublic(intervalId, shotId);
        log("MakePublic Tx", tx.hash);
        const receipt = await tx.wait();
        log("MakePublic Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#decryptStatus", "✅ Hit is now public", "success");
      } catch (e) {
        logError("MakePublic", e);
        setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      }
    };

    // ===== PUBLIC DECRYPT (Relayer 0.3.x, як у еталоні) =====
    async function decryptHit(rawHandle) {
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

        const raw = $("#hitHandleOutput").textContent.trim();
        const handle = cleanHandle(raw);
        console.log("Decrypting handle:", handle);

        setStatus("#decryptStatus", "🔓 Decrypting via relayer…", "pending");
        const zone = await decryptHit(handle);

        const intervalId = $("#decryptIntervalId").value;
        const shotId = $("#decryptShotId").value;

        const resultDiv = $("#hitResult");
        let title, desc, cls="match-result";

        if (zone === 2) {
          title = "🎯 CENTER HIT";
          desc = `Shot #${shotId} is in the center of interval #${intervalId}.`;
        } else if (zone === 1) {
          title = "✅ NEAR HIT";
          desc = `Shot #${shotId} is near the hidden interval #${intervalId}.`;
        } else {
          title = "❌ FAR";
          desc = `Shot #${shotId} is far from interval #${intervalId}.`;
          cls = "match-result no-match";
        }

        resultDiv.className = cls;
        resultDiv.innerHTML =
          `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">${title}</div>
           <div style="color:#d1d5db;font-size:14px;">${desc}</div>`;
        resultDiv.style.display = "block";

        setStatus("#decryptStatus", "✅ Hit result decrypted", "success");
      } catch (e) {
        console.error("Decrypt failed:", e);
        setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      }
    };

    log("Script", "✅ All handlers attached and ready");