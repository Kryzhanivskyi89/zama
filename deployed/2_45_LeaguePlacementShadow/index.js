  import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
  import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

  // ---------- SET CONTRACT ADDRESS ----------
  const CONTRACT_ADDRESS = "0x87B7DF0144269768A58A15A10Bb2c57e92DEcEDB"; 
  const RELAYER_URL = "https://relayer.testnet.zama.org";
  const GATEWAY_URL = "https://gateway.testnet.zama.org";

  const ABI = [
    "function submitScore(bytes32, bytes) external",
    "function computeLeague(address) external returns (bytes32)",
    "function makeMyLeaguePublic() external",
    "function leagueHandle(address) external view returns (bytes32)",
    "function hasLeague(address) external view returns (bool)"
  ];

  // STATE
  let provider, signer, userAddress, contract, relayer;
  const $ = s => document.querySelector(s);

  // LOG helpers
  const log = (t, ...d) => console.log(`%c[${t}]`, "color:#60a5fa;font-weight:700;", ...d);
  const logErr = (t,...d) => console.error(`%c[ERR:${t}]`, "color:#fb7185;font-weight:700;", ...d);
  const setStatus = (sel, txt) => { const el=$(sel); if(el) el.textContent = txt; };

  // Connect
  async function connect() {
    try {
      log("connect", "start");
      if (!window.ethereum) throw new Error("No wallet (window.ethereum)");
      provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      userAddress = await signer.getAddress();
      log("wallet", userAddress);

      contract = new Contract(getAddress(CONTRACT_ADDRESS), ABI, signer);
      log("contract connected", CONTRACT_ADDRESS);

      if (!relayer) {
        await initSDK();
        relayer = await createInstance({
          ...SepoliaConfig,
          relayerUrl: RELAYER_URL,
          gatewayUrl: GATEWAY_URL,
          network: window.ethereum,
          debug: true
        });
        log("relayer", "ready");
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

  // helper: convert Uint8Array -> hex
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

  // 1) Submit Score
  $("#btnSubmitScore").onclick = async () => {
    try {
      log("submitScore", "start");
      setStatus("#scoreStatus", "Preparing encryption...");
      if (!await connect()) throw new Error("Connect wallet first");

      const score = BigInt(parseInt($("#scoreValue").value || "0"));
      log("score", score.toString());

      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      enc.add16(score);

      setStatus("#scoreStatus", "Encrypting...");
      const { handles, inputProof } = await enc.encrypt();
      log("encrypt", { handles, inputProof });

      const hraw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const h = toHex(hraw);
      const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      if (!h) throw new Error("Invalid handle from encrypt()");

      setStatus("#scoreStatus", "Sending tx...");
      const tx = await contract.submitScore(h, att);
      log("tx sent", tx.hash);
      setStatus("#scoreStatus", `Tx sent: ${tx.hash} — waiting confirmation...`);
      const r = await tx.wait();
      log("tx confirmed", r);
      setStatus("#scoreStatus", `Score submitted (block ${r.blockNumber})`);

      $("#scoreHandleOut").textContent = "Score Input Handle (local):\n" + h;
      $("#scoreHandleOut").style.display = "block";
    } catch (e) {
      logErr("submitScore", e);
      setStatus("#scoreStatus", `Error: ${e.message || e}`);
    }
  };

  // 2) Compute League
  $("#btnComputeLeague").onclick = async () => {
    try {
      log("computeLeague", "start");
      setStatus("#computeStatus", "Preparing...");
      if (!await connect()) throw new Error("Connect wallet first");

      const addr = $("#computeAddr").value.trim();
      if (!addr) throw new Error("Enter player address");
      const player = getAddress(addr);

      setStatus("#computeStatus", `Calling computeLeague(${player})...`);
      const tx = await contract.computeLeague(player);
      log("tx sent", tx.hash);
      setStatus("#computeStatus", `Tx sent: ${tx.hash} — waiting confirmation...`);
      const r = await tx.wait();
      log("tx confirmed", r);
      setStatus("#computeStatus", `Compute done (block ${r.blockNumber})`);

      const handle = await contract.leagueHandle(player);
      log("leagueHandle", handle);
      const clean = cleanHandle(handle);
      $("#leagueHandleOut").textContent = "League Handle:\n" + clean;
      $("#leagueHandleOut").style.display = "block";
      setStatus("#computeStatus", "League computed and handle stored on-chain");
    } catch (e) {
      logErr("computeLeague", e);
      setStatus("#computeStatus", `Error: ${e.message || e}`);
    }
  };

  // 3) Make My League Public
  $("#btnMakePublic").onclick = async () => {
    try {
      if (!await connect()) throw new Error("Connect wallet first");
      setStatus("#makeStatus", "Sending tx to make league public...");
      const tx = await contract.makeMyLeaguePublic();
      log("tx sent", tx.hash);
      const r = await tx.wait();
      log("tx confirmed", r);
      setStatus("#makeStatus", "✅ Your league is now public (decryptable)");
    } catch (e) {
      logErr("makeMyLeaguePublic", e);
      setStatus("#makeStatus", `Error: ${e.message || e}`);
    }
  };

  // 4) Get handle
  $("#btnGetHandle").onclick = async () => {
    try {
      if (!await connect()) throw new Error("Connect wallet first");
      setStatus("#decryptStatus", "Fetching handle...");
      const addr = $("#fetchAddr").value.trim() || userAddress;
      const a = getAddress(addr);
      const has = await contract.hasLeague(a);
      log("hasLeague", has);
      if (!has) { setStatus("#decryptStatus", "No league exists for this address"); return; }
      const handle = await contract.leagueHandle(a);
      log("leagueHandle", handle);
      const clean = cleanHandle(handle);
      $("#leagueHandleOut").textContent = "League Handle:\n" + clean;
      $("#leagueHandleOut").style.display = "block";
      setStatus("#decryptStatus", "Handle retrieved");
    } catch (e) {
      logErr("getHandle", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  // public decrypt helper
  async function publicDecryptHandle(handle) {
    if (!relayer) throw new Error("Relayer not initialized");
    const cleaned = cleanHandle(handle);
    if (!cleaned.startsWith("0x") || cleaned.length !== 66) throw new Error("Invalid handle format (bytes32)");
    const request = [ cleaned ];
    log("publicDecrypt request", request);
    const out = await relayer.publicDecrypt(request);
    log("publicDecrypt out", out);
    if (!out || typeof out !== "object") throw new Error("Invalid decrypt response");
    if (!out.clearValues) throw new Error("Missing clearValues in decrypt response");
    const lower = cleaned.toLowerCase();
    const val = out.clearValues[cleaned] ?? out.clearValues[lower];
    if (val === undefined || val === null) throw new Error("Decrypt produced no value for this handle");
    return Number(val); // 0..3
  }

  // decrypt button
  $("#btnDecrypt").onclick = async () => {
    try {
      if (!await connect()) throw new Error("Connect wallet first");
      setStatus("#decryptStatus", "Starting decrypt...");
      let raw = $("#leagueHandleOut").textContent || "";
      if (!raw) {
        const addr = $("#fetchAddr").value.trim() || userAddress;
        raw = await contract.leagueHandle(getAddress(addr));
      }
      const handle = cleanHandle(raw);
      log("decrypt handle", handle);
      setStatus("#decryptStatus", "Calling relayer.publicDecrypt()");
      const code = await publicDecryptHandle(handle);
      let label = "Unknown";
      if (code === 0) label = "IRON";
      else if (code === 1) label = "BRONZE";
      else if (code === 2) label = "SILVER";
      else if (code === 3) label = "GOLD";
      const outDiv = $("#leagueResult");
      outDiv.style.display = "block";
      outDiv.innerHTML = `<div style="font-weight:700; font-size:16px;">League: ${label} (code: ${code})</div>
                          <div style="margin-top:6px; color:#9fb1d9;">Handle: ${handle}</div>`;
      setStatus("#decryptStatus", `Decrypted: ${label}`);
      log("decrypt result", { code, label });
    } catch (e) {
      logErr("decrypt", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };