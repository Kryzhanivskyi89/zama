import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
  import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

  // CONFIG
  const CONTRACT_ADDRESS = "0xbc2C6549c6Ac35875Dd5d8F2d106BEaE13fE914f";
  const RELAYER_URL = "https://relayer.testnet.zama.org";
  const GATEWAY_URL = "https://gateway.testnet.zama.org";

  const ABI = [
    "function submitScores(bytes32, bytes32, bytes32, bytes) external returns (bytes32, bytes32)",
    "function makePublic() external",
    "function getHandles(address) external view returns (bytes32, bytes32)",
    "function hasRecord(address) external view returns (bool)"
  ];

  // STATE
  let provider, signer, userAddress, contract, relayer;
  const $ = s => document.querySelector(s);

  // LOG HELPERS
  const log = (t, ...a) => console.log(`%c[${t}]`, "color:#7dd3fc;font-weight:700;", ...a);
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

  // 1) Submit Scores
  $("#btnSubmitScores").onclick = async () => {
    try {
      log("submitScores", "start");
      setStatus("#submitStatus", "Preparing encryption...");
      if (!await connect()) throw new Error("Connect wallet first");

      const s1 = BigInt(parseInt($("#score1").value || "0"));
      const s2 = BigInt(parseInt($("#score2").value || "0"));
      const s3 = BigInt(parseInt($("#score3").value || "0"));

      log("scores", { s1: s1.toString(), s2: s2.toString(), s3: s3.toString() });

      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      enc.add16(s1);
      enc.add16(s2);
      enc.add16(s3);

      setStatus("#submitStatus", "Encrypting scores...");
      const { handles, inputProof } = await enc.encrypt();
      log("encrypt result", { handles, inputProof });

      // extract handles & attestation
      const h1raw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const h2raw = handles[1]?.handle ?? handles[1]?.ciphertext ?? handles[1];
      const h3raw = handles[2]?.handle ?? handles[2]?.ciphertext ?? handles[2];

      const h1 = toHex(h1raw);
      const h2 = toHex(h2raw);
      const h3 = toHex(h3raw);

      const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      if (!h1 || !h2 || !h3) throw new Error("Invalid handles from encrypt()");

      setStatus("#submitStatus", "Submitting to chain...");
      log("contract.submitScores args (trimmed)", { h1: h1.slice(0,30)+"...", h2: h2.slice(0,30)+"...", h3: h3.slice(0,30)+"..." });

      const tx = await contract.submitScores(h1, h2, h3, att);
      log("tx sent", tx.hash);
      setStatus("#submitStatus", `Tx sent: ${tx.hash} — waiting confirmation...`);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#submitStatus", `Scores submitted (block ${receipt.blockNumber})`);

      // read handles from contract getHandles
      const [gradeH, passH] = await contract.getHandles(userAddress);
      log("handles on-chain", { gradeH, passH });

      const cleanGrade = cleanHandle(gradeH);
      const cleanPass = cleanHandle(passH);

      $("#handlesOut").textContent = `Grade Handle:\n${cleanGrade}\n\nPass Handle:\n${cleanPass}`;
      $("#handlesOut").style.display = "block";
      setStatus("#submitStatus", "✅ Grade computed and handles available");
    } catch (e) {
      logErr("submitScores", e);
      setStatus("#submitStatus", `Error: ${e.message || e}`);
    }
  };

  // 2) Make public
  $("#btnMakePublic").onclick = async () => {
    try {
      log("makePublic", "start");
      setStatus("#makeStatus", "Preparing...");
      if (!await connect()) throw new Error("Connect wallet first");

      setStatus("#makeStatus", "Sending transaction to make grade public...");
      const tx = await contract.makePublic();
      log("tx sent", tx.hash);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#makeStatus", "✅ Grade & pass flag are now public (decryptable)");
    } catch (e) {
      logErr("makePublic", e);
      setStatus("#makeStatus", `Error: ${e.message || e}`);
    }
  };

  // 3) get handles
  $("#btnGetHandles").onclick = async () => {
    try {
      log("getHandles", "start");
      setStatus("#decryptStatus", "Fetching handles...");
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

      const [gradeH, passH] = await contract.getHandles(a);
      log("getHandles result", { gradeH, passH });

      const cleanGrade = cleanHandle(gradeH);
      const cleanPass = cleanHandle(passH);

      $("#handlesOut").textContent = `Grade Handle:\n${cleanGrade}\n\nPass Handle:\n${cleanPass}`;
      $("#handlesOut").style.display = "block";
      setStatus("#decryptStatus", "Handles retrieved (see output)");
    } catch (e) {
      logErr("getHandles", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  // publicDecrypt helper (SDK 0.3.x) - expects array of bytes32
  async function publicDecryptHandles(gradeHandle, passHandle) {
    if (!relayer) throw new Error("Relayer not initialized");

    const g = cleanHandle(gradeHandle);
    const p = cleanHandle(passHandle);

    if (!g.startsWith("0x") || g.length !== 66) throw new Error("Invalid grade handle");
    if (!p.startsWith("0x") || p.length !== 66) throw new Error("Invalid pass handle");

    const request = [ g, p ];
    log("publicDecrypt request", request);

    const out = await relayer.publicDecrypt(request);
    log("publicDecrypt raw out", out);

    if (!out || typeof out !== "object") throw new Error("Invalid decrypt response");
    if (!out.clearValues) throw new Error("Missing clearValues in decrypt response");

    const lowerG = g.toLowerCase();
    const lowerP = p.toLowerCase();

    const gradeVal = out.clearValues[g] ?? out.clearValues[lowerG];
    const passVal = out.clearValues[p] ?? out.clearValues[lowerP];

    if (gradeVal === undefined || passVal === undefined) throw new Error("Decrypt produced no value for one of handles");

    log("clearValues extracted", { gradeVal, passVal });
    return { gradeVal: Number(gradeVal), passVal: Boolean(Number(passVal)) };
  }

  // decrypt
  $("#btnDecrypt").onclick = async () => {
    try {
      log("decrypt", "start");
      setStatus("#decryptStatus", "Starting decrypt...");
      if (!await connect()) throw new Error("Connect wallet first");

      // get handles from UI block
      const handlesText = $("#handlesOut").textContent || "";
      if (!handlesText || handlesText.trim() === "") {
        setStatus("#decryptStatus", "No handles found in UI. Click 'Get Grade Handles' first.");
        return;
      }

      // parse last two lines to get handles (robust)
      const lines = handlesText.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const last = lines.slice(-2);
      const gradeHandle = last[0].startsWith("0x") ? last[0] : lines.find(l => l.startsWith("0x")) || last[0];
      const passHandle = last[1] && last[1].startsWith("0x") ? last[1] : last[1] || null;

      log("handles parsed", { gradeHandle, passHandle });

      if (!gradeHandle || !passHandle) throw new Error("Could not parse handles from UI");

      setStatus("#decryptStatus", "Calling relayer.publicDecrypt([...])...");
      const { gradeVal, passVal } = await publicDecryptHandles(gradeHandle, passHandle);

      // grade mapping: 0=A,1=B,2=C,3=F
      let letter = "F";
      if (gradeVal === 0) letter = "A";
      else if (gradeVal === 1) letter = "B";
      else if (gradeVal === 2) letter = "C";
      else if (gradeVal === 3) letter = "F";

      const outDiv = $("#gradeResult");
      outDiv.style.display = "block";
      outDiv.innerHTML = `<div style="font-weight:700; font-size:16px;">Grade: ${letter} (code: ${gradeVal})</div>
                          <div style="margin-top:8px; color:#9fb1d9;">Passed: ${passVal ? "YES" : "NO"}</div>
                          <div style="margin-top:8px; color:#9fb1d9; font-size:8px;">Grade Handle: ${cleanHandle(gradeHandle)}</div>
                          <div style="margin-top:4px; color:#9fb1d9; font-size:8px;">Pass Handle: ${cleanHandle(passHandle)}</div>`;

      setStatus("#decryptStatus", `Decrypted: Grade ${letter}, Passed: ${passVal ? "YES" : "NO"}`);
      log("decrypt result", { gradeVal, passVal });
    } catch (e) {
      logErr("decrypt", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  console.log("Hidden Grade Release UI loaded. All actions log to console. Whitepaper: /mnt/data/fhevm_whitepaper_new.pdf");
