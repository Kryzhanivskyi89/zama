import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
  import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

  // CONFIG
  const CONTRACT_ADDRESS = "0x6f21FBA7E57A3766057bAfC8CAA855257D9426C2";
  const RELAYER_URL = "https://relayer.testnet.zama.org";
  const GATEWAY_URL = "https://gateway.testnet.zama.org";

  const ABI = [
    "function submitTurnover(bytes32, bytes) external returns (bytes32)",
    "function makeTierPublic() external",
    "function getTierHandle(address) external view returns (bytes32)",
    "function hasRecord(address) external view returns (bool)"
  ];

  // STATE
  let provider, signer, userAddress, contract, relayer;
  const $ = s => document.querySelector(s);

  // LOG HELPERS
  const log = (t, ...a) => console.log(`%c[${t}]`, "color:#ffd580;font-weight:700;", ...a);
  const logErr = (t, ...a) => console.error(`%c[ERR:${t}]`, "color:#fb7185;font-weight:700;", ...a);
  const setStatus = (sel, txt) => { const el=$(sel); if (el) el.textContent = txt; };

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

  // 1) Submit Turnover
  $("#btnSubmitTurnover").onclick = async () => {
    try {
      log("submitTurnover", "start");
      setStatus("#submitStatus", "Preparing encryption...");
      if (!await connect()) throw new Error("Connect wallet first");

      const turnover = BigInt(parseInt($("#turnover").value || "0"));
      if (turnover < 0n) throw new Error("Turnover must be >= 0");

      log("turnover", turnover.toString());

      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      // turnover stored as 32-bit (contract expects externalEuint32)
      enc.add32(turnover);

      setStatus("#submitStatus", "Encrypting turnover...");
      const { handles, inputProof } = await enc.encrypt();
      log("encrypt result", { handles, inputProof });

      const raw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const handle = toHex(raw);
      const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      if (!handle) throw new Error("Invalid handle from encrypt()");

      setStatus("#submitStatus", "Submitting to chain...");
      log("contract.submitTurnover args (trimmed)", { handle: handle.slice(0,30)+"...", att: att.slice(0,30)+"..." });

      const tx = await contract.submitTurnover(handle, att);
      log("tx sent", tx.hash);
      setStatus("#submitStatus", `Tx sent: ${tx.hash} — waiting confirmation...`);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#submitStatus", `Turnover submitted (block ${receipt.blockNumber})`);

      // fetch tier handle
      const tierHandle = await contract.getTierHandle(userAddress);
      log("tierHandle", tierHandle);
      const clean = cleanHandle(tierHandle);
      $("#tierHandleOut").textContent = "Tier Handle:\n" + clean;
      $("#tierHandleOut").style.display = "block";
      setStatus("#submitStatus", "✅ Tier computed and handle available");
    } catch (e) {
      logErr("submitTurnover", e);
      setStatus("#submitStatus", `Error: ${e.message || e}`);
    }
  };

  // 2) Make tier public
  $("#btnMakePublic").onclick = async () => {
    try {
      log("makeTierPublic", "start");
      setStatus("#makeStatus", "Preparing...");
      if (!await connect()) throw new Error("Connect wallet first");

      setStatus("#makeStatus", "Sending transaction to make tier public...");
      const tx = await contract.makeTierPublic();
      log("tx sent", tx.hash);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#makeStatus", "✅ Tier is now public (decryptable)");
    } catch (e) {
      logErr("makeTierPublic", e);
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

      const has = await contract.hasRecord(a);
      log("hasRecord", has);
      if (!has) {
        setStatus("#decryptStatus", "No record exists for this address");
        return;
      }

      const handle = await contract.getTierHandle(a);
      log("getTierHandle", handle);
      const clean = cleanHandle(handle);
      $("#tierHandleOut").textContent = "Tier Handle:\n" + clean;
      $("#tierHandleOut").style.display = "block";
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

      let raw = $("#tierHandleOut").textContent || "";
      if (!raw || raw.trim() === "") {
        const addr = $("#fetchAddr").value.trim() || userAddress;
        raw = await contract.getTierHandle(getAddress(addr));
      }
      const handle = cleanHandle(raw);
      log("decrypt handle", handle);

      setStatus("#decryptStatus", "Calling relayer.publicDecrypt([...])...");
      const code = await publicDecryptHandle(handle);

      let label = "UNKNOWN";
      if (code === 0) label = "1% (Tier 0)";
      else if (code === 1) label = "2% (Tier 1)";
      else if (code === 2) label = "3% (Tier 2)";

      const outDiv = $("#tierResult");
      outDiv.style.display = "block";
      outDiv.innerHTML = `<div style="font-weight:700; color:#9fb1d9;font-size:16px;">Cashback: ${label} (code: ${code})</div>
                          <div style="margin-top:8px; color:#9fb1d9;">Handle: ${handle}</div>`;

      setStatus("#decryptStatus", `Decrypted: ${label}`);
      log("decrypt result", { code, label });
    } catch (e) {
      logErr("decrypt", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  console.log("Private Cashback Tier UI loaded. All actions log to console. Whitepaper: /mnt/data/fhevm_whitepaper_new.pdf");
