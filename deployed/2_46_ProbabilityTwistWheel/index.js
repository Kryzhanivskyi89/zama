
import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
  import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

  // CONFIG: set your deployed contract address here
  const CONTRACT_ADDRESS = "0xAE5c3F08C2eB9597aEB0b1C88007f74F0dbc9B03";
  const RELAYER_URL = "https://relayer.testnet.zama.org";
  const GATEWAY_URL = "https://gateway.testnet.zama.org";

  const ABI = [
    "function submitStake(bytes32, bytes) external",
    "function computeOutcome(address, bytes32, bytes) external returns (bytes32)",
    "function makeOutcomePublic() external",
    "function outcomeHandle(address) external view returns (bytes32)",
    "function hasOutcome(address) external view returns (bool)"
  ];

  // STATE
  let provider, signer, userAddress, contract, relayer;
  let lastRandomPlain = null;
  let lastRandomHandle = null;

  const $ = s => document.querySelector(s);
  const log = (t, ...a) => console.log(`%c[${t}]`, "color:#7dd3fc;font-weight:700;", ...a);
  const logErr = (t,...a) => console.error(`%c[ERR:${t}]`, "color:#fb7185;font-weight:700;", ...a);
  const setStatus = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };

  // connect
  async function connect() {
    try {
      log("connect", "starting");
      if (!window.ethereum) throw new Error("No wallet (window.ethereum)");
      provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      userAddress = await signer.getAddress();
      log("wallet", userAddress);

      contract = new Contract(getAddress(CONTRACT_ADDRESS), ABI, signer);
      log("contract", CONTRACT_ADDRESS);

      if (!relayer) {
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

  // helpers
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

  // 1) submit stake
  $("#btnSubmitStake").onclick = async () => {
    try {
      log("submitStake", "start");
      setStatus("#stakeStatus", "Preparing...");
      if (!await connect()) throw new Error("Connect wallet first");

      const stake = BigInt(parseInt($("#stakeVal").value || "0"));
      if (stake < 0n || stake > 100n) throw new Error("Stake must be 0..100");
      log("stake", stake.toString());

      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      enc.add8(stake); // stake as uint8

      setStatus("#stakeStatus", "Encrypting stake...");
      const { handles, inputProof } = await enc.encrypt();
      log("encrypt result", { handles, inputProof });

      const stakeRaw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const stakeHandle = toHex(stakeRaw);
      const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      if (!stakeHandle) throw new Error("Invalid stake handle");

      setStatus("#stakeStatus", "Submitting to chain...");
      const tx = await contract.submitStake(stakeHandle, att);
      log("tx sent", tx.hash);
      setStatus("#stakeStatus", `Tx sent: ${tx.hash}`);
      const r = await tx.wait();
      log("tx confirmed", r);
      setStatus("#stakeStatus", `Stake submitted (block ${r.blockNumber})`);

      $("#stakeHandleOut").textContent = "Stake Input Handle (local):\n" + stakeHandle;
      $("#stakeHandleOut").style.display = "block";
    } catch (e) {
      logErr("submitStake", e);
      setStatus("#stakeStatus", `Error: ${e.message || e}`);
    }
  };

  // 2) generate random & encrypt (0..99)
  $("#btnGenRand").onclick = async () => {
    try {
      log("genRand", "start");
      setStatus("#randStatus", "Generating random...");
      if (!await connect()) throw new Error("Connect wallet first");

      // secure random 0..99
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      const r = arr[0] % 100;
      lastRandomPlain = r;
      log("random plain", r);

      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      enc.add16(BigInt(r)); // store as 16-bit
      setStatus("#randStatus", "Encrypting random...");
      const { handles, inputProof } = await enc.encrypt();
      log("rand encrypt", { handles, inputProof });

      const randRaw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const randHandle = toHex(randRaw);
      const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      if (!randHandle) throw new Error("Invalid rand handle");

      lastRandomHandle = { handle: randHandle, att: att };
      $("#randHandleOut").textContent = `Random: ${r}\nRand Handle:\n${randHandle}`;
      $("#randHandleOut").style.display = "block";
      setStatus("#randStatus", "Random generated and encrypted (local)");
      log("rand handle", randHandle, "att len", att.length);
    } catch (e) {
      logErr("genRand", e);
      setStatus("#randStatus", `Error: ${e.message || e}`);
    }
  };

  // 2b) compute outcome (uses lastRandomHandle)
  $("#btnComputeOutcome").onclick = async () => {
    try {
      log("computeOutcome", "start");
      setStatus("#randStatus", "Computing outcome...");
      if (!await connect()) throw new Error("Connect wallet first");

      if (!lastRandomHandle) throw new Error("Generate and encrypt random first (click Generate Random & Encrypt)");

      // player address: use user's own address
      const player = userAddress;

      // call computeOutcome(player, encRand, att)
      const encRand = lastRandomHandle.handle;
      const att = lastRandomHandle.att;

      log("compute args", { player, encRand, attSlice: att.slice(0,20)+"..." });

      const tx = await contract.computeOutcome(player, encRand, att);
      log("tx sent", tx.hash);
      setStatus("#randStatus", `Tx sent: ${tx.hash}`);
      const r = await tx.wait();
      log("tx confirmed", r);
      setStatus("#randStatus", `Outcome computed (block ${r.blockNumber})`);

      // fetch stored handle
      const handle = await contract.outcomeHandle(player);
      const clean = cleanHandle(handle);
      $("#outcomeResult").style.display = "block";
      $("#outcomeResult").innerHTML = `<div>Outcome Handle:\n<pre>${clean}</pre></div>`;
      setStatus("#randStatus", "Outcome stored on-chain, handle available");
      log("outcome handle", clean);
    } catch (e) {
      logErr("computeOutcome", e);
      setStatus("#randStatus", `Error: ${e.message || e}`);
    }
  };

  // 3) make outcome public
  $("#btnMakePublic").onclick = async () => {
    try {
      if (!await connect()) throw new Error("Connect wallet first");
      setStatus("#makeStatus", "Sending tx to make outcome public...");
      const tx = await contract.makeOutcomePublic();
      log("tx sent", tx.hash);
      const r = await tx.wait();
      log("tx confirmed", r);
      setStatus("#makeStatus", "Outcome is now public (decryptable)");
    } catch (e) {
      logErr("makePublic", e);
      setStatus("#makeStatus", `Error: ${e.message || e}`);
    }
  };

  // 4) get handle
  $("#btnGetHandle").onclick = async () => {
    try {
      if (!await connect()) throw new Error("Connect wallet first");
      setStatus("#decryptStatus", "Fetching handle...");
      const addr = $("#fetchAddr").value.trim() || userAddress;
      const tgt = getAddress(addr);
      const has = await contract.hasOutcome(tgt);
      log("hasOutcome", has);
      if (!has) { setStatus("#decryptStatus", "No outcome exists for this address"); return; }
      const handle = await contract.outcomeHandle(tgt);
      const clean = cleanHandle(handle);
      $("#outcomeResult").style.display = "block";
      $("#outcomeResult").innerHTML = `<div>Outcome Handle:\n<pre>${clean}</pre></div>`;
      setStatus("#decryptStatus", "Handle retrieved (see UI and console)");
      log("outcomeHandle", clean);
    } catch (e) {
      logErr("getHandle", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  // publicDecrypt helper (SDK 0.3.x)
  async function publicDecryptHandle(handle) {
    if (!relayer) throw new Error("Relayer not initialized");
    const cleaned = cleanHandle(handle);
    if (!cleaned.startsWith("0x") || cleaned.length !== 66) throw new Error("Invalid handle (bytes32)");
    const req = [ cleaned ];
    log("publicDecrypt req", req);
    const out = await relayer.publicDecrypt(req);
    log("publicDecrypt raw out", out);
    if (!out || typeof out !== "object") throw new Error("Invalid decrypt response");
    if (!out.clearValues) throw new Error("Missing clearValues");
    const lower = cleaned.toLowerCase();
    const val = out.clearValues[cleaned] ?? out.clearValues[lower];
    if (val === undefined || val === null) throw new Error("No clear value for this handle");
    return Number(val); // 0..2
  }

  // decrypt
  $("#btnDecrypt").onclick = async () => {
    try {
      if (!await connect()) throw new Error("Connect wallet first");
      setStatus("#decryptStatus", "Starting decrypt...");
      let raw = $("#outcomeResult").textContent || "";
      if (!raw || raw.trim() === "") {
        const addr = $("#fetchAddr").value.trim() || userAddress;
        raw = await contract.outcomeHandle(getAddress(addr));
      }
      const handle = cleanHandle(raw);
      log("decrypt handle", handle);
      setStatus("#decryptStatus", "Calling relayer.publicDecrypt([...])...");
      const code = await publicDecryptHandle(handle);
      let label = "UNKNOWN";
      if (code === 0) label = "LOSE";
      else if (code === 1) label = "SMALL WIN";
      else if (code === 2) label = "BIG WIN";
      const outDiv = $("#outcomeResult");
      outDiv.style.display = "block";
      outDiv.innerHTML = `<div style="font-weight:700; font-size:16px;">${label} (code: ${code})</div>
                          <div style="margin-top:6px; color:#9fb1d9;">Handle: ${handle}</div>
                          <div style="margin-top:8px; color:#9fb1d9;">(Local random used for compute: ${lastRandomPlain ?? 'N/A'})</div>`;
      setStatus("#decryptStatus", `Decrypted: ${label}`);
      log("decrypt result", { code, label, lastRandomPlain });
    } catch (e) {
      logErr("decrypt", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  console.log("Probability Twist Wheel UI loaded. Remember to set CONTRACT_ADDRESS in script and use Relayer SDK 0.3.x. Local whitepaper: /mnt/data/fhevm_whitepaper_new.pdf");
