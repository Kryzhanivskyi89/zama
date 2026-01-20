  // Minimal, direct adaptation from your example logic
  import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
  import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

  // CONFIG: use your contract address
  const CONFIG = {
    RELAYER_URL: "https://relayer.testnet.zama.org",
    GATEWAY_URL: "https://gateway.testnet.zama.org",
    CONTRACT_ADDRESS: "0xC59708C6296F5EC797189aA11Bf6e82285870C0F"
  };

  // ABI matching the AgeGatedNFT contract
  const ABI = [
    "function submitAgeVerification(bytes32,bytes) external returns (bytes32)",
    "function makeAgeVerificationPublic() external",
    "function mintNFT(bool) external returns (uint256)",
    "function getVerificationHandle(address) external view returns (bytes32)",
    "function hasVerification(address) external view returns (bool)",
    "function hasMintedAlready(address) external view returns (bool)"
  ];

  let provider, signer, address, contract, relayer;
  const $ = s => document.querySelector(s);
const logs = [];
        const maxLogs = 200;

        function log(...args) {
            const timestamp = new Date().toLocaleTimeString();
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    return JSON.stringify(arg, null, 2);
                }
                return String(arg);
            }).join(' ');

            const logEntry = `[${timestamp}] ${message}`;
            logs.push(logEntry);

            if (logs.length > maxLogs) {
                logs.shift();
            }

            updateDevLog();
            console.log(...args);
        }

        function updateDevLog() {
            const devLogEl = document.getElementById('devLog');
            devLogEl.textContent = logs.join('\n');
            devLogEl.scrollTop = devLogEl.scrollHeight;
        }

        function logStatus(type, message) {
            log(`[${type.toUpperCase()}] ${message}`);
        }

        // ============ UI UTILITIES ============
        function showStatus(elementId, type, message) {
            const el = document.getElementById(elementId);
            el.className = `status ${type}`;
            el.textContent = message;
            el.classList.remove('hidden');
        }

        function hideStatus(elementId) {
            document.getElementById(elementId).classList.add('hidden');
        }

        function showResult(elementId, title, value) {
            const el = document.getElementById(elementId);
            el.innerHTML = `
                <div class="result-label">${title}</div>
                <div class="result-value">${value}</div>
            `;
            el.classList.remove('hidden');
        }

        function hideResult(elementId) {
            document.getElementById(elementId).classList.add('hidden');
        }

  // Simple logger in UI + console


function devLog(...args) {
    const timestamp = new Date().toLocaleTimeString();
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            return JSON.stringify(arg, null, 2);
        }
        return String(arg);
    }).join(' ');

    const logEntry = `[${timestamp}] ${message}`;
    logs.push(logEntry);

    if (logs.length > maxLogs) {
        logs.shift();
    }

    const pre = $("#devLog");
    pre.textContent = logs.join('\n');
    pre.scrollTop = pre.scrollHeight;
    console.log(...args);
}

  function setStatus(selector, text, kind='pending') {
    const el = $(selector);
    if (!el) return;
    el.style.display = 'inline-block';
    el.className = 'status ' + kind;
    el.textContent = text;
    devLog(`[STATUS ${selector}]`, text);
  }

  function clearStatus(selector) {
    const el = $(selector);
    if (!el) return;
    el.style.display = 'none';
  }

  // connect wallet + relayer
  async function connect() {
    try {
      devLog("connect: start");
      if (!window.ethereum) throw new Error("No wallet (window.ethereum) detected");
      provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      address = await signer.getAddress();
      devLog("connect: address", address);

      contract = new Contract(getAddress(CONFIG.CONTRACT_ADDRESS), ABI, signer);
      devLog("connect: contract instance", CONFIG.CONTRACT_ADDRESS);

      $("#btnConnect").textContent = address.slice(0,6) + "…" + address.slice(-4);

      if (!relayer) {
        devLog("connect: init relayer SDK");
        await initSDK();
        relayer = await createInstance({
          ...SepoliaConfig,
          relayerUrl: CONFIG.RELAYER_URL,
          gatewayUrl: CONFIG.GATEWAY_URL,
          network: window.ethereum,
          debug: true
        });
        devLog("connect: relayer instance ready");
      }

      // set default verify address input
      $("#verifyAddr").value = address;

      devLog("connect: done");
      return true;
    } catch (err) {
      console.error("Connect error:", err);
      setStatus("#ageStatus", "Wallet connect failed", "error");
      devLog("connect error", err.message || err);
      return false;
    }
  }

  $("#btnConnect").onclick = connect;

  // HELPER: convert Uint8Array -> hex
  function toHex(u8) {
    if (typeof u8 === 'string') return u8;
    if (u8 instanceof Uint8Array || Array.isArray(u8)) {
      return '0x' + Array.from(u8).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
    return String(u8);
  }

  // CLEAN handle (remove any "Match Handle:" prefix etc)
  function cleanHandle(raw) {
    if (!raw) return raw;
    return String(raw).trim().split("\n").pop().trim();
  }

  // Submit encrypted birth year -> submitAgeVerification(externalHandle, attestation)
  $("#btnSubmitAge").onclick = async () => {
    try {
      devLog("submitAge: start");
      setStatus("#ageStatus", "Preparing...", "pending");

      if (!await connect()) return;

      const birthYear = parseInt($("#birthYear").value);
      if (!birthYear || birthYear < 1900 || birthYear > 2100) {
        throw new Error("Invalid birth year");
      }

      setStatus("#ageStatus", "Encrypting birth year (Relayer)...", "pending");
      devLog("submitAge: creating encrypted input", { contract: CONFIG.CONTRACT_ADDRESS, user: address });

      const enc = relayer.createEncryptedInput(getAddress(CONFIG.CONTRACT_ADDRESS), getAddress(address));
      enc.add16(BigInt(birthYear));

      const { handles, inputProof } = await enc.encrypt();
      devLog("submitAge: encryption result", { handles, inputProof });

      // handles[0] should be bytes32 or Uint8Array; convert to hex string
      const handleRaw = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
      const handle = typeof handleRaw === 'string' ? handleRaw : toHex(handleRaw);

      const att = (typeof inputProof === 'string') ? (inputProof.startsWith('0x') ? inputProof : '0x' + inputProof) : toHex(inputProof);

      devLog("submitAge: extracted handle & attestation", { handle, att: att.slice(0,40) + '...' });

      setStatus("#ageStatus", "Submitting to chain...", "pending");
      const tx = await contract.submitAgeVerification(handle, att);
      devLog("submitAge: tx sent", tx.hash);
      const receipt = await tx.wait();
      devLog("submitAge: tx confirmed", { blockNumber: receipt.blockNumber, status: receipt.status });

      // The contract returns bytes32 handle as event emitted; but we also have direct handle we sent — display that
      $("#ageHandleOutput").textContent = cleanHandle(handle);
      $("#ageHandleBox").style.display = 'block';

      setStatus("#ageStatus", "✅ Age verification submitted", "success");
      devLog("submitAge: done");

    } catch (e) {
      console.error("submitAge error:", e);
      setStatus("#ageStatus", "❌ " + (e.message || e), "error");
      devLog("submitAge error", e.message || e);
    }
  };

  // Make public — call makeAgeVerificationPublic()
  $("#btnMakePublic").onclick = async () => {
    try {
      devLog("makePublic: start");
      setStatus("#decryptStatus", "Making verification public...", "pending");
      if (!await connect()) return;

      // The contract requires the caller to have a stored verification (msg.sender). So user must call from their wallet
      const tx = await contract.makeAgeVerificationPublic();
      devLog("makePublic: tx sent", tx.hash);
      const receipt = await tx.wait();
      devLog("makePublic: confirmed", receipt);
      setStatus("#decryptStatus", "✅ Verification is public (on-chain)", "success");
    } catch (e) {
      console.error("makePublic error:", e);
      setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      devLog("makePublic error", e.message || e);
    }
  };

  // Get handle for a given address via getVerificationHandle(address)
  $("#btnGetHandle").onclick = async () => {
    try {
      devLog("getHandle: start");
      if (!await connect()) return;
      const target = $("#verifyAddr").value || address;
      setStatus("#decryptStatus", "Fetching handle...", "pending");
      const handle = await contract.getVerificationHandle(target);
      devLog("getHandle: result", handle);
      $("#ageHandleOutput").textContent = cleanHandle(handle);
      $("#ageHandleBox").style.display = 'block';
      setStatus("#decryptStatus", "✅ Handle retrieved", "success");
    } catch (e) {
      console.error("getHandle error:", e);
      setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      devLog("getHandle error", e.message || e);
    }
  };

  // PUBLIC DECRYPT helper (robust for SDK 0.3.x)
  async function publicDecryptHandle(handleRaw) {
    if (!relayer) throw new Error("Relayer not initialized");
    const handle = cleanHandle(handleRaw);
    if (!handle || !handle.startsWith("0x") || handle.length !== 66) {
      throw new Error("Invalid handle format (must be bytes32 hex)");
    }

    devLog("publicDecrypt: requesting decrypt for", handle);
    const req = [ handle ];
    devLog("publicDecrypt: request array", req);

    const out = await relayer.publicDecrypt(req);
    devLog("publicDecrypt: raw output", out);

    // possible output shapes:
    // - object with clearValues mapping: { clearValues: { [handle]: "0" } }
    // - object values may be strings or number-strings
    // - older SDKs returned array-like responses
    if (!out) throw new Error("Empty decrypt response");

    // If out.clearValues exists (new format), use it
    if (out.clearValues && typeof out.clearValues === 'object') {
      const lower = handle.toLowerCase();
      const v = out.clearValues[handle] ?? out.clearValues[lower];
      if (v === undefined) {
        throw new Error("Decrypt produced no value for this handle");
      }
      devLog("publicDecrypt: clear value (from clearValues)", v);
      return String(v);
    }

    // If response is an array or single-value
    if (Array.isArray(out)) {
      // common case: ["1"] or [{ value: "1" }]
      const first = out[0];
      const val = (typeof first === 'string') ? first : (first?.value ?? first?.result ?? null);
      if (val === null || val === undefined) throw new Error("Invalid decrypt array response");
      devLog("publicDecrypt: clear value (from array)", val);
      return String(val);
    }

    // fallback: try properties
    const maybe = out[handle] ?? out[handle.toLowerCase()] ?? out.value ?? out.result;
    if (maybe === undefined) throw new Error("Unrecognized decrypt response format");
    devLog("publicDecrypt: clear value (fallback)", maybe);
    return String(maybe);
  }

  // Decrypt & Mint if allowed (decrypt + call mintNFT(true))
  $("#btnDecrypt").onclick = async () => {
    try {
      devLog("decryptAndMint: start");
      setStatus("#decryptStatus", "Connecting...", "pending");
      if (!await connect()) return;

      // get handle: from displayed area or fetch by address
      let raw = $("#ageHandleOutput").textContent || '';
      raw = raw.trim();
      if (!raw || raw === '—') {
        // try fetch by address
        const target = $("#verifyAddr").value || address;
        devLog("decryptAndMint: no local handle; fetching for", target);
        setStatus("#decryptStatus", "Fetching handle for address...", "pending");
        const handle = await contract.getVerificationHandle(target);
        raw = cleanHandle(handle);
        $("#ageHandleOutput").textContent = raw;
        $("#ageHandleBox").style.display = 'block';
      } else {
        raw = cleanHandle(raw);
      }

      setStatus("#decryptStatus", "Requesting public decrypt...", "pending");
      const clear = await publicDecryptHandle(raw);

const allowed =
  clear === true ||
  clear === "true" ||
  clear === "1" ||
  clear === 1;

$("#mintResult").style.display = 'block';

if (allowed) {
  $("#mintResult").className = 'result ok';
  $("#mintResult").innerHTML = `<strong>✅ Allowed</strong><div>Value: ${clear}</div>`;
  setStatus("#decryptStatus", "✅ Decrypted: allowed", "success");
} else {
  $("#mintResult").className = 'result fail';
  $("#mintResult").innerHTML = `<strong>❌ Not allowed</strong><div>Value: ${clear}</div>`;
  setStatus("#decryptStatus", "❌ Decrypted: not allowed", "error");
}

      // clear is string "0" or "1"
      // const allowed = (BigInt(clear) === 1n);
      // if (!allowed) {
      //   setStatus("#decryptStatus", "❌ Age verification failed (not allowed)", "error");
      //   $("#mintResult").style.display = 'block';
      //   $("#mintResult").className = 'result fail';
      //   $("#mintResult").innerHTML = `<strong>Not allowed:</strong> age check returned false`;
      //   devLog("decryptAndMint: not allowed -> stop");
      //   return;
      // }

      setStatus("#decryptStatus", "✅ Decrypted allowed. Minting NFT...", "success");
      devLog("decryptAndMint: calling mintNFT(true)");

      const tx = await contract.mintNFT(true);
      devLog("decryptAndMint: mint tx sent", tx.hash);
      const receipt = await tx.wait();
      devLog("decryptAndMint: mint confirmed", receipt);

      // try to extract tokenId from events or receipt (many ERC721s emit Transfer)
      let tokenId = null;
      try {
        // search logs for Transfer event topics[0] is Transfer signature
        const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        for (const l of receipt.logs) {
          if (l.topics && l.topics[0] && l.topics[0].toLowerCase() === transferTopic) {
            // tokenId is topics[3] (indexed tokenId) when Transfer(address,address,uint256)
            const rawId = l.topics[3];
            if (rawId) {
              tokenId = BigInt(rawId).toString();
              break;
            }
          }
        }
      } catch (e) { devLog("tokenId extraction failed", e); }

      $("#mintResult").style.display = 'block';
      $("#mintResult").className = 'result ok';
      $("#mintResult").innerHTML = `<strong>✅ NFT minted</strong><div style="margin-top:6px">Tx: <code>${tx.hash}</code>${tokenId?'<div>Token ID: '+tokenId+'</div>':''}</div>`;
      setStatus("#decryptStatus", "✅ NFT minted", "success");
      devLog("decryptAndMint: done", { txHash: tx.hash, tokenId });

    } catch (e) {
      console.error("decryptAndMint error:", e);
      setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      devLog("decryptAndMint error", e.message || e);
    }
  };

  // Decrypt only (no mint)
  $("#btnOnlyDecrypt").onclick = async () => {
    try {
      devLog("onlyDecrypt: start");
      setStatus("#decryptStatus", "Connecting...", "pending");
      if (!await connect()) return;

      let raw = $("#ageHandleOutput").textContent || '';
      raw = cleanHandle(raw);
      if (!raw || raw === '—') {
        const target = $("#verifyAddr").value || address;
        const handle = await contract.getVerificationHandle(target);
        raw = cleanHandle(handle);
        $("#ageHandleOutput").textContent = raw;
        $("#ageHandleBox").style.display = 'block';
      }

      setStatus("#decryptStatus", "Decrypting...", "pending");
      const clear = await publicDecryptHandle(raw);
devLog("decryptAndMint: clear value", clear);

// NEW FORMAT SUPPORT
const allowed =
  clear === true ||
  clear === "true" ||
  clear === "1" ||
  clear === 1;

if (!allowed) {
  setStatus("#decryptStatus", "❌ Age verification failed (not allowed)", "error");
  $("#mintResult").style.display = 'block';
  $("#mintResult").className = 'result fail';
  $("#mintResult").innerHTML =
    `<strong>Not allowed:</strong> age check returned false`;
  return;
}

      $("#mintResult").style.display = 'block';
      if (allowed) {
        $("#mintResult").className = 'result ok';
        $("#mintResult").innerHTML = `<strong>✅ Allowed</strong><div>Value: ${clear}</div>`;
        setStatus("#decryptStatus", "✅ Decrypted: allowed", "success");
      } else {
        $("#mintResult").className = 'result fail';
        $("#mintResult").innerHTML = `<strong>❌ Not allowed</strong><div>Value: ${clear}</div>`;
        setStatus("#decryptStatus", "❌ Decrypted: not allowed", "error");
      }
      devLog("onlyDecrypt: done", { clear });

    } catch (e) {
      console.error("onlyDecrypt error:", e);
      setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      devLog("onlyDecrypt error", e.message || e);
    }
  };

  // devLog("UI ready — handlers attached");
