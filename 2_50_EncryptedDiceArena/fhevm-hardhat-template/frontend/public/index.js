import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
  import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

  // CONTRACT: змінюй якщо треба
  const CONTRACT_ADDRESS = "0x2b4F93309bBE9F8dfa8EA7b89Ed649beB5E4898B";
  // (постав адресу контракту після деплою)
  const RELAYER_URL = "https://relayer.testnet.zama.org";
  const GATEWAY_URL = "https://gateway.testnet.zama.org";

  const ABI = [
    "function playRound(bytes32, bytes32, bytes) external returns (bytes32)",
    "function makeResultPublic() external",
    "function roundHandle(address) external view returns (bytes32)",
    "function hasResult(address) external view returns (bool)"
  ];

  // STATE
  let provider, signer, userAddress, contract, relayer;
  const $ = s => document.querySelector(s);

  // LOG helpers
  const log = (t, ...a) => console.log(`%c[${t}]`, "color:#93c5fd;font-weight:700;", ...a);
  const logErr = (t, ...a) => console.error(`%c[ERR:${t}]`, "color:#fb7185;font-weight:700;", ...a);
  const setStatus = (sel, txt) => { const el=$(sel); if (el) el.textContent = txt; };

  // Connect
  async function connect() {
    try {
      log("connect", "starting");
      if (!window.ethereum) throw new Error("No wallet (window.ethereum)");
      provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      userAddress = await signer.getAddress();
      log("wallet", userAddress);

      if (!contract) contract = new Contract(getAddress(CONTRACT_ADDRESS), ABI, signer);
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

  // 1) Generate bot & play
  $("#btnGenBotPlay").onclick = async () => {
    try {
      log("playRound", "start");
      setStatus("#playStatus", "Preparing...");
      if (!await connect()) throw new Error("Connect wallet first");

      const playerRoll = parseInt($("#playerRoll").value, 10);
      if (!(playerRoll >=1 && playerRoll <=6)) throw new Error("Player roll must be 1..6");

      // secure random 1..6
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      const botRoll = (arr[0] % 6) + 1;
      log("playerRoll", playerRoll, "botRoll (local)", botRoll);

      // create encrypted input with both values (same attestation)
      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      enc.add8(BigInt(playerRoll));
      enc.add8(BigInt(botRoll));

      setStatus("#playStatus", "Encrypting rolls...");
      const { handles, inputProof } = await enc.encrypt();
      log("encrypt result", { handles, inputProof });

      // extract handles & attestation
      const hPlayerRaw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const hBotRaw = handles[1]?.handle ?? handles[1]?.ciphertext ?? handles[1];

      const hPlayer = toHex(hPlayerRaw);
      const hBot = toHex(hBotRaw);
      const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      if (!hPlayer || !hBot) throw new Error("Invalid handles from encrypt()");

      setStatus("#playStatus", "Submitting to chain...");
      log("contract.playRound args (trimmed)", { hPlayer: hPlayer.slice(0,30)+"...", hBot: hBot.slice(0,30)+"...", att: att.slice(0,30)+"..." });

      const tx = await contract.playRound(hPlayer, hBot, att);
      log("tx sent", tx.hash);
      setStatus("#playStatus", `Tx sent: ${tx.hash} — waiting confirmation...`);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#playStatus", `Round played (block ${receipt.blockNumber})`);

      // read handle from contract
      const handle = await contract.roundHandle(userAddress);
      log("roundHandle", handle);
      const clean = cleanHandle(handle);
      $("#roundHandleOut").textContent = "Result Handle:\n" + clean;
      $("#roundHandleOut").style.display = "block";
      setStatus("#playStatus", "✅ Result stored on-chain and handle available");

      // show local rolls (for debugging only) — actual winner must be decrypted from handle
      console.log("Local debug — playerRoll:", playerRoll, "botRoll:", botRoll);
    } catch (e) {
      logErr("playRound", e);
      setStatus("#playStatus", `Error: ${e.message || e}`);
    }
  };

  // 2) make public
  $("#btnMakePublic").onclick = async () => {
    try {
      if (!await connect()) throw new Error("Connect wallet first");
      setStatus("#makeStatus", "Sending tx to make result public...");
      const tx = await contract.makeResultPublic();
      log("tx sent", tx.hash);
      const r = await tx.wait();
      log("tx confirmed", r);
      setStatus("#makeStatus", "✅ Your result is now public (decryptable)");
    } catch (e) {
      logErr("makeResultPublic", e);
      setStatus("#makeStatus", `Error: ${e.message || e}`);
    }
  };

  // 3) get handle
  $("#btnGetHandle").onclick = async () => {
    try {
      if (!await connect()) throw new Error("Connect wallet first");
      setStatus("#decryptStatus", "Fetching handle...");
      const addr = $("#fetchAddr").value.trim() || userAddress;
      const a = getAddress(addr);

      const has = await contract.hasResult(a);
      log("hasResult", has);
      if (!has) {
        setStatus("#decryptStatus", "No result exists for this address");
        return;
      }

      const handle = await contract.roundHandle(a);
      log("roundHandle", handle);
      const clean = cleanHandle(handle);
      $("#roundHandleOut").textContent = "Result Handle:\n" + clean;
      $("#roundHandleOut").style.display = "block";
      setStatus("#decryptStatus", "Handle retrieved (see output)");
    } catch (e) {
      logErr("getHandle", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  // publicDecrypt helper (SDK 0.3.x)
  async function publicDecryptHandle(handle) {
    if (!relayer) throw new Error("Relayer not initialized");
    const cleaned = cleanHandle(handle);
    if (!cleaned.startsWith("0x") || cleaned.length !== 66) throw new Error("Invalid handle format (bytes32)");
    const req = [ cleaned ];
    log("publicDecrypt request", req);
    const out = await relayer.publicDecrypt(req);
    log("publicDecrypt raw out", out);
    if (!out || typeof out !== "object") throw new Error("Invalid decrypt response");
    if (!out.clearValues) throw new Error("Missing clearValues in decrypt response");
    const lower = cleaned.toLowerCase();
    const v = out.clearValues[cleaned] ?? out.clearValues[lower];
    if (v === undefined || v === null) throw new Error("Decrypt produced no value for this handle");
    return Number(v); // 0..2
  }

  // decrypt
  $("#btnDecrypt").onclick = async () => {
    try {
      if (!await connect()) throw new Error("Connect wallet first");
      setStatus("#decryptStatus", "Starting decrypt...");
      let raw = $("#roundHandleOut").textContent || "";
      if (!raw || raw.trim() === "") {
        const addr = $("#fetchAddr").value.trim() || userAddress;
        raw = await contract.roundHandle(getAddress(addr));
      }
      const handle = cleanHandle(raw);
      log("decrypt handle", handle);

      setStatus("#decryptStatus", "Calling relayer.publicDecrypt([...])...");
      const code = await publicDecryptHandle(handle);

      let label = "UNKNOWN";
      if (code === 0) label = "LOSE";
      else if (code === 1) label = "DRAW";
      else if (code === 2) label = "WIN";

      const outDiv = $("#resultBox");
      outDiv.style.display = "block";
      outDiv.innerHTML = `<div style="font-weight:700; font-size:8px;">${label} (code: ${code})</div>
                          <div style="margin-top:8px; font-size:7px; color:#9fb1d9;">Handle: ${handle}</div>`;

      setStatus("#decryptStatus", `Decrypted: ${label}`);
      log("decrypt result", { code, label });
    } catch (e) {
      logErr("decrypt", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  console.log("Encrypted Dice Arena UI loaded. Replace CONTRACT_ADDRESS in script with deployed address. Logs in console. Whitepaper: /mnt/data/fhevm_whitepaper_new.pdf");
