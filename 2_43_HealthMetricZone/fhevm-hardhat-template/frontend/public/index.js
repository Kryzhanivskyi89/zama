  import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
  import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

  // ---------- CONFIG ----------
  const CONTRACT_ADDRESS = "0xf0afEC8379B933D05e5233937b99E30910996E28";
  const RELAYER_URL = "https://relayer.testnet.zama.org";
  const GATEWAY_URL = "https://gateway.testnet.zama.org";

  const ABI = [
    "function submitMetrics(bytes32,bytes32,bytes32,bytes) external returns (bytes32)",
    "function makeMyZonePublic() external",
    "function zoneHandle(address user) external view returns (bytes32)",
    "function hasZone(address user) external view returns (bool)"
  ];

  // ---------- STATE ----------
  let provider, signer, userAddress, contract, relayer;
  const $ = s => document.querySelector(s);

  // ---------- LOG HELPERS ----------
  const log = (title, ...data) => console.log(`%c[${title}]`, "color:#7dd3fc;font-weight:700;", ...data);
  const logErr = (title, err) => console.error(`%c[ERR:${title}]`, "color:#fb7185;font-weight:700;", err);
  const setStatus = (sel, text) => { const el=$(sel); if(el){ el.textContent = text; } }

  // ---------- CONNECT ----------
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

      // Init relayer SDK once
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
        log("relayer", "instance created", relayer ? true : false);
      }

      $("#btnConnect").textContent = `${userAddress.slice(0,6)}…${userAddress.slice(-4)}`;
      setStatus("#connectStatus", `Connected: ${userAddress}`);
      console.log("✅ Connected and ready");
      return true;
    } catch (e) {
      logErr("connect", e);
      setStatus("#connectStatus", `Connect error: ${e.message || e}`);
      return false;
    }
  }

  $("#btnConnect").onclick = connect;

  // ---------- HELP: convert Uint8Array -> 0xhex ----------
  function toHex(u8) {
    if (typeof u8 === "string") return u8;
    if (!u8) return "";
    if (u8 instanceof Uint8Array || Array.isArray(u8)) {
      return '0x' + Array.from(u8).map(b => b.toString(16).padStart(2,'0')).join('');
    }
    // fallback
    return String(u8);
  }

  // ---------- CLEAN HANDLE ----------
  function cleanHandle(raw) {
    if (!raw) throw new Error("empty handle");
    const str = String(raw).trim();
    // if the string contains newlines, take last line
    const last = str.split("\n").pop().trim();
    return last;
  }

  // ---------- SUBMIT METRICS ----------
  $("#btnSubmitMetrics").onclick = async () => {
    try {
      log("submitMetrics", "start");
      setStatus("#submitStatus", "Preparing encryption...");
      if (!await connect()) throw new Error("Connect wallet first");

      const hr = BigInt(parseInt($("#heartRate").value || "0"));
      const sys = BigInt(parseInt($("#systolic").value || "0"));
      const dia = BigInt(parseInt($("#diastolic").value || "0"));

      log("input values", { hr: hr.toString(), sys: sys.toString(), dia: dia.toString() });
      setStatus("#submitStatus", "Creating encrypted input (relayer)...");

      // create encrypted input for contract + owner
      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      enc.add16(hr);   // heart rate
      enc.add16(sys);  // systolic
      enc.add16(dia);  // diastolic

      log("enc", "added values - calling encrypt()");
      const { handles, inputProof } = await enc.encrypt();
      log("enc.encrypt result", { handles, inputProof });

      // extract 3 handles and attestation, convert to hex strings if needed
      const h0raw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const h1raw = handles[1]?.handle ?? handles[1]?.ciphertext ?? handles[1];
      const h2raw = handles[2]?.handle ?? handles[2]?.ciphertext ?? handles[2];

      const h0 = toHex(h0raw);
      const h1 = toHex(h1raw);
      const h2 = toHex(h2raw);

      const att = (typeof inputProof === "string") ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      log("handles hex", { h0, h1, h2, att });

      // Basic validation
      if (!h0 || !h1 || !h2) {
        throw new Error("Invalid handles from encrypt()");
      }

      setStatus("#submitStatus", "Sending transaction to contract...");
      log("contract.submitMetrics args (trimmed)", { h0: h0.slice(0,10)+"...", h1: h1.slice(0,10)+"...", h2: h2.slice(0,10)+"...", att: att.slice(0,20)+"..." });

      const tx = await contract.submitMetrics(h0, h1, h2, att);
      log("tx sent", tx.hash);
      setStatus("#submitStatus", `Transaction sent: ${tx.hash} — waiting confirmation...`);

      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#submitStatus", `Transaction confirmed (block ${receipt.blockNumber})`);

      // fetch handle from view function zoneHandle(msg.sender)
      const handle = await contract.zoneHandle(userAddress);
      log("zoneHandle (on-chain)", handle);

      const clean = cleanHandle(handle);
      $("#zoneHandleOut").textContent = "Zone Handle:\n" + clean;
      $("#zoneHandleOut").style.display = "block";

      setStatus("#submitStatus", "✅ Zone computed and handle saved on-chain");
      console.log("Submit completed, handle:", clean);
    } catch (e) {
      logErr("submitMetrics", e);
      setStatus("#submitStatus", `Error: ${e.message || e}`);
    }
  };

  // ---------- MAKE MY ZONE PUBLIC ----------
  $("#btnMakePublic").onclick = async () => {
    try {
      log("makeMyZonePublic", "start");
      setStatus("#publicStatus", "Preparing...");
      if (!await connect()) throw new Error("Connect wallet first");

      setStatus("#publicStatus", "Sending transaction to make zone public...");
      const tx = await contract.makeMyZonePublic();
      log("tx sent", tx.hash);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#publicStatus", "✅ Zone is now public (decryptable)");
    } catch (e) {
      logErr("makeMyZonePublic", e);
      setStatus("#publicStatus", `Error: ${e.message || e}`);
    }
  };

  // ---------- GET HANDLE FOR ADDRESS ----------
  $("#btnGetHandle").onclick = async () => {
    try {
      log("getHandle", "start");
      setStatus("#decryptStatus", "Fetching zone handle...");
      if (!await connect()) throw new Error("Connect wallet first");

      const user = $("#addressToFetch").value.trim() || userAddress;
      const addr = getAddress(user);
      log("fetch for", addr);

      // ensure user has a zone
      const has = await contract.hasZone(addr);
      log("hasZone", has);
      if (!has) {
        setStatus("#decryptStatus", "No zone exists for this address");
        return;
      }

      const handle = await contract.zoneHandle(addr);
      log("zoneHandle", handle);

      const clean = cleanHandle(handle);
      $("#zoneHandleOut").textContent = "Zone Handle:\n" + clean;
      $("#zoneHandleOut").style.display = "block";

      setStatus("#decryptStatus", "Handle retrieved (see output and console)");
    } catch (e) {
      logErr("getHandle", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  // ---------- PUBLIC DECRYPT ----------
  async function publicDecryptHandle(handle) {
    if (!relayer) throw new Error("Relayer not initialized");
    const cleaned = cleanHandle(handle);

    if (!cleaned.startsWith("0x") || cleaned.length !== 66) {
      throw new Error("Handle must be bytes32 (0x + 64 hex chars)");
    }

    const request = [ cleaned ];
    log("publicDecrypt request", request);

    const out = await relayer.publicDecrypt(request);
    log("publicDecrypt raw output", out);

    // new SDK: expect object with clearValues map
    if (!out || typeof out !== "object") throw new Error("Invalid decrypt response");
    if (!out.clearValues) throw new Error("Missing clearValues in decrypt response");

    const lower = cleaned.toLowerCase();
    const value = out.clearValues[cleaned] ?? out.clearValues[lower];
    if (value === undefined || value === null) {
      throw new Error("Decrypt produced no value for this handle");
    }

    log("clear value", value);
    // value expected "0", "1", or "2" (but our contract returns zone 0/1/2)
    return Number(value); // returns numeric zone
  }

  $("#btnDecrypt").onclick = async () => {
    try {
      log("decrypt flow", "start");
      setStatus("#decryptStatus", "Starting decrypt...");
      if (!await connect()) throw new Error("Connect wallet first");

      // Get handle from UI or the last fetched output
      let raw = $("#zoneHandleOut").textContent || "";
      if (!raw) {
        // try to get from input address
        const user = $("#addressToFetch").value.trim() || userAddress;
        const handleOnChain = await contract.zoneHandle(getAddress(user));
        raw = handleOnChain;
      }
      const handle = cleanHandle(raw);
      log("decrypt handle clean", handle);

      setStatus("#decryptStatus", "Calling relayer.publicDecrypt([...])...");
      const zoneValue = await publicDecryptHandle(handle);

      // Interpret zone
      let label = "unknown";
      if (zoneValue === 0) label = "NORMAL";
      else if (zoneValue === 1) label = "WARNING";
      else if (zoneValue === 2) label = "DANGER";

      const display = $("#zoneResult");
      display.style.display = "block";
      display.innerHTML = `<div style="font-weight:700; font-size:16px;">Zone: ${label} (code: ${zoneValue})</div>
                           <div style="margin-top:6px; color:#9fb1d9;">Handle: ${handle}</div>`;

      setStatus("#decryptStatus", `Decrypted: ${label}`);
      log("decrypt result", { zoneValue, label });
    } catch (e) {
      logErr("decrypt", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  // initial log
  console.log("Health Metric Zone UI loaded. All actions log to console.");
