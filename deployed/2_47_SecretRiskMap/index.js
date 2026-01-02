import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
  import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

  // CONFIG
  const CONTRACT_ADDRESS = "0x45c95A9E1aC44eA30D8F7c6F8628f5e8a5f044CA";
  const RELAYER_URL = "https://relayer.testnet.zama.org";
  const GATEWAY_URL = "https://gateway.testnet.zama.org";

  const ABI = [
    "function submitCoordinates(bytes32, bytes32, bytes) external returns (bytes32)",
    "function makeZonePublic() external",
    "function zoneHandle(address) external view returns (bytes32)",
    "function hasZone(address) external view returns (bool)"
  ];

  // STATE
  let provider, signer, userAddress, contract, relayer;
  const $ = s => document.querySelector(s);

  // LOG HELPERS
  const log = (tag, ...args) => console.log(`%c[${tag}]`, "color:#7dd3fc;font-weight:700;", ...args);
  const logErr = (tag, ...args) => console.error(`%c[ERR:${tag}]`, "color:#fb7185;font-weight:700;", ...args);
  const setStatus = (sel, txt) => { const el=$(sel); if(el) el.textContent = txt; };

  // CONNECT
  async function connect() {
    try {
      log("connect", "starting");
      if (!window.ethereum) throw new Error("No wallet (window.ethereum) found");
      provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      userAddress = await signer.getAddress();
      log("wallet", userAddress);

      contract = new Contract(getAddress(CONTRACT_ADDRESS), ABI, signer);
      log("contract", CONTRACT_ADDRESS);

      if (!relayer) {
        log("relayer", "initSDK()");
        await initSDK();
        relayer = await createInstance({
          ...SepoliaConfig,
          relayerUrl: RELAYER_URL,
          gatewayUrl: GATEWAY_URL,
          network: window.ethereum,
          debug: true
        });
        log("relayer", "initialized");
      }

      $("#btnConnect").textContent = `${userAddress.slice(0,6)}…${userAddress.slice(-4)}`;
      setStatus("#connectStatus", `Connected: ${userAddress}`);
      return true;
    } catch (e) {
      logErr("connect", e);
      setStatus("#connectStatus", `Connect error: ${e.message || e}`);
      return false;
    }
  }

  $("#btnConnect").onclick = connect;

  // HELPERS
  function toHex(u8) {
    if (!u8) return "";
    if (typeof u8 === "string") return u8;
    if (u8 instanceof Uint8Array || Array.isArray(u8)) {
      return '0x' + Array.from(u8).map(b => b.toString(16).padStart(2,'0')).join('');
    }
    return String(u8);
  }

  function cleanHandle(raw) {
    if (!raw) throw new Error("empty handle");
    const s = String(raw).trim();
    return s.split("\n").pop().trim();
  }

  // 1) Submit Coordinates
  $("#btnSubmitCoords").onclick = async () => {
    try {
      log("submitCoords", "start");
      setStatus("#coordsStatus", "Preparing encryption...");
      if (!await connect()) throw new Error("Connect wallet first");

      const x = BigInt(parseInt($("#coordX").value || "0"));
      const y = BigInt(parseInt($("#coordY").value || "0"));

      log("coords", { x: x.toString(), y: y.toString() });

      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      enc.add16(x); // X as euint16
      enc.add16(y); // Y as euint16

      setStatus("#coordsStatus", "Encrypting coordinates...");
      const { handles, inputProof } = await enc.encrypt();
      log("encrypt result", { handles, inputProof });

      // extract handles and attestation
      const hxRaw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const hyRaw = handles[1]?.handle ?? handles[1]?.ciphertext ?? handles[1];
      const hx = toHex(hxRaw);
      const hy = toHex(hyRaw);
      const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      if (!hx || !hy) throw new Error("Invalid handles from encrypt()");

      setStatus("#coordsStatus", "Submitting to chain...");
      log("contract.submitCoordinates args (trimmed)", { hx: hx.slice(0,30)+"...", hy: hy.slice(0,30)+"...", att: att.slice(0,30)+"..." });

      const tx = await contract.submitCoordinates(hx, hy, att);
      log("tx sent", tx.hash);
      setStatus("#coordsStatus", `Tx sent: ${tx.hash} — waiting confirmation...`);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#coordsStatus", `Coordinates submitted (block ${receipt.blockNumber})`);

      // fetch zone handle
      const handle = await contract.zoneHandle(userAddress);
      log("zoneHandle", handle);
      const clean = cleanHandle(handle);
      $("#coordsHandleOut").textContent = "Zone Handle:\n" + clean;
      $("#coordsHandleOut").style.display = "block";

      setStatus("#coordsStatus", "✅ Zone computed and handle available");
    } catch (e) {
      logErr("submitCoords", e);
      setStatus("#coordsStatus", `Error: ${e.message || e}`);
    }
  };

  // 2) Make zone public
  $("#btnMakePublic").onclick = async () => {
    try {
      log("makeZonePublic", "start");
      setStatus("#makeStatus", "Preparing...");
      if (!await connect()) throw new Error("Connect wallet first");

      setStatus("#makeStatus", "Sending transaction to make zone public...");
      const tx = await contract.makeZonePublic();
      log("tx sent", tx.hash);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#makeStatus", "✅ Your zone is now public (decryptable)");
    } catch (e) {
      logErr("makeZonePublic", e);
      setStatus("#makeStatus", `Error: ${e.message || e}`);
    }
  };

  // 3) Get handle for address
  $("#btnGetHandle").onclick = async () => {
    try {
      log("getHandle", "start");
      setStatus("#decryptStatus", "Fetching handle...");
      if (!await connect()) throw new Error("Connect wallet first");

      const addr = $("#fetchAddr").value.trim() || userAddress;
      const a = getAddress(addr);
      log("fetch for", a);

      const has = await contract.hasZone(a);
      log("hasZone", has);
      if (!has) {
        setStatus("#decryptStatus", "No zone exists for this address");
        return;
      }

      const handle = await contract.zoneHandle(a);
      log("zoneHandle", handle);
      const clean = cleanHandle(handle);
      $("#coordsHandleOut").textContent = "Zone Handle:\n" + clean;
      $("#coordsHandleOut").style.display = "block";
      setStatus("#decryptStatus", "Handle retrieved (see output)");
    } catch (e) {
      logErr("getHandle", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  // publicDecrypt helper (SDK 0.3.x, expects array of bytes32)
  async function publicDecryptHandle(handle) {
    if (!relayer) throw new Error("Relayer not initialized");
    const cleaned = cleanHandle(handle);
    if (!cleaned.startsWith("0x") || cleaned.length !== 66) throw new Error("Invalid handle format (bytes32)");
    const request = [ cleaned ];
    log("publicDecrypt request", request);

    const out = await relayer.publicDecrypt(request);
    log("publicDecrypt raw out", out);

    if (!out || typeof out !== "object") throw new Error("Invalid decrypt response");
    if (!out.clearValues) throw new Error("Missing clearValues in decrypt response");

    const lower = cleaned.toLowerCase();
    const val = out.clearValues[cleaned] ?? out.clearValues[lower];
    if (val === undefined || val === null) throw new Error("Decrypt produced no value for this handle");

    log("clear value", val);
    return Number(val); // 0..2
  }

  // decrypt button
  $("#btnDecrypt").onclick = async () => {
    try {
      log("decrypt", "start");
      setStatus("#decryptStatus", "Starting decrypt...");
      if (!await connect()) throw new Error("Connect wallet first");

      let raw = $("#coordsHandleOut").textContent || "";
      if (!raw || raw.trim() === "") {
        const addr = $("#fetchAddr").value.trim() || userAddress;
        raw = await contract.zoneHandle(getAddress(addr));
      }
      const handle = cleanHandle(raw);
      log("decrypt handle", handle);

      setStatus("#decryptStatus", "Calling relayer.publicDecrypt([...])...");
      const code = await publicDecryptHandle(handle);

      let label = "UNKNOWN";
      if (code === 0) label = "SAFE";
      else if (code === 1) label = "RISKY";
      else if (code === 2) label = "DANGEROUS";

      const outDiv = $("#zoneResult");
      outDiv.style.display = "block";
      outDiv.innerHTML = `<div style="font-weight:700; font-size:16px;">${label} (code: ${code})</div>
                          <div style="margin-top:8px; color:#9fb1d9;">Handle: ${handle}</div>`;

      setStatus("#decryptStatus", `Decrypted: ${label}`);
      log("decrypt result", { code, label });
    } catch (e) {
      logErr("decrypt", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  console.log("Secret Risk Map UI loaded. All actions logged to console. Local whitepaper available at /mnt/data/fhevm_whitepaper_new.pdf");
