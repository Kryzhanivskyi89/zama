  import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
  import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

  // CONFIG
  const CONTRACT_ADDRESS = "0xa863BA651FF504dB9C8Dc7182Af66E4943ca4cCc";
  const RELAYER_URL = "https://relayer.testnet.zama.org";
  const GATEWAY_URL = "https://gateway.testnet.zama.org";

  const ABI = [
    "function submitKPI(bytes32,bytes) external",
    "function submitTarget(address, bytes32, bytes) external",
    "function computeBonus(address) external returns (bytes32)",
    "function makeBonusPublic() external",
    "function bonusHandle(address) external view returns (bytes32)",
    "function hasBonus(address) external view returns (bool)"
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
      if (!window.ethereum) throw new Error("No wallet (window.ethereum)");
      provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      userAddress = await signer.getAddress();
      log("wallet", userAddress);

      contract = new Contract(getAddress(CONTRACT_ADDRESS), ABI, signer);
      log("contract", CONTRACT_ADDRESS);

      if (!relayer) {
        log("relayer", "initSDK");
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
    const last = s.split("\n").pop().trim();
    return last;
  }

  // 1) Employee: submitKPI
  $("#btnSubmitKPI").onclick = async () => {
    try {
      log("submitKPI", "start");
      setStatus("#kpiStatus", "Preparing encryption...");
      if (!await connect()) throw new Error("Connect wallet first");

      const kpi = BigInt(parseInt($("#kpiValue").value || "0"));
      log("kpi value", kpi.toString());

      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      enc.add16(kpi);

      setStatus("#kpiStatus", "Encrypting...");
      const { handles, inputProof } = await enc.encrypt();
      log("encrypt result", { handles, inputProof });

      const h0raw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const h0 = toHex(h0raw);
      const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      if (!h0) throw new Error("Invalid handle from encrypt()");

      setStatus("#kpiStatus", "Sending tx...");
      log("contract.submitKPI args", { h0: h0.slice(0,20)+"...", att: att.slice(0,20)+"..." });

      const tx = await contract.submitKPI(h0, att);
      log("tx sent", tx.hash);
      setStatus("#kpiStatus", `Tx sent: ${tx.hash} — waiting confirmation...`);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#kpiStatus", `KPI submitted (block ${receipt.blockNumber})`);

      // read back handle via bonusHandle? KPI doesn't have its own handle exposed — but we can show encrypted input handle we just sent
      $("#kpiHandleOut").textContent = "KPI Input Handle (local):\n" + h0;
      $("#kpiHandleOut").style.display = "block";
      log("submitKPI done", { h0, att });
    } catch (e) {
      logErr("submitKPI", e);
      setStatus("#kpiStatus", `Error: ${e.message || e}`);
    }
  };

  // 2) HR: submitTarget(employee, encTarget, attestation)
  $("#btnSubmitTarget").onclick = async () => {
    try {
      log("submitTarget", "start");
      setStatus("#targetStatus", "Preparing encryption...");
      if (!await connect()) throw new Error("Connect wallet first");

      const employee = $("#hrEmployeeAddr").value.trim();
      if (!employee) throw new Error("Enter employee address");
      const employeeAddr = getAddress(employee);

      const target = BigInt(parseInt($("#targetValue").value || "0"));
      log("target value", target.toString(), "for", employeeAddr);

      const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(userAddress));
      enc.add16(target);

      setStatus("#targetStatus", "Encrypting...");
      const { handles, inputProof } = await enc.encrypt();
      log("encrypt result", { handles, inputProof });

      const tretRaw = handles[0]?.handle ?? handles[0]?.ciphertext ?? handles[0];
      const tret = toHex(tretRaw);
      const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x"+inputProof) : toHex(inputProof);

      if (!tret) throw new Error("Invalid handle from encrypt()");

      setStatus("#targetStatus", "Sending tx...");
      log("contract.submitTarget args", { employee: employeeAddr, tret: tret.slice(0,20)+"...", att: att.slice(0,20)+"..." });

      const tx = await contract.submitTarget(employeeAddr, tret, att);
      log("tx sent", tx.hash);
      setStatus("#targetStatus", `Tx sent: ${tx.hash} — waiting confirmation...`);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#targetStatus", `Target submitted for ${employeeAddr} (block ${receipt.blockNumber})`);

      $("#targetHandleOut").textContent = "Target Input Handle (local):\n" + tret;
      $("#targetHandleOut").style.display = "block";
    } catch (e) {
      logErr("submitTarget", e);
      setStatus("#targetStatus", `Error: ${e.message || e}`);
    }
  };

  // 3) Compute Bonus (anyone can call)
  $("#btnComputeBonus").onclick = async () => {
    try {
      log("computeBonus", "start");
      setStatus("#computeStatus", "Preparing...");
      if (!await connect()) throw new Error("Connect wallet first");

      const emp = $("#computeEmployeeAddr").value.trim();
      if (!emp) throw new Error("Enter employee address to compute for");
      const empAddr = getAddress(emp);

      setStatus("#computeStatus", `Calling computeBonus(${empAddr})...`);
      log("contract.computeBonus", empAddr);

      const tx = await contract.computeBonus(empAddr);
      log("tx sent", tx.hash);
      setStatus("#computeStatus", `Tx sent: ${tx.hash} — waiting confirmation...`);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#computeStatus", `Compute complete (block ${receipt.blockNumber})`);

      // read handle from contract
      const handle = await contract.bonusHandle(empAddr);
      log("bonusHandle", handle);
      const clean = cleanHandle(handle);
      $("#bonusHandleOut").textContent = "Bonus Handle:\n" + clean;
      $("#bonusHandleOut").style.display = "block";

      setStatus("#computeStatus", "Bonus computed and handle stored on-chain");
    } catch (e) {
      logErr("computeBonus", e);
      setStatus("#computeStatus", `Error: ${e.message || e}`);
    }
  };

  // 4) Make My Bonus Public (employee)
  $("#btnMakePublic").onclick = async () => {
    try {
      log("makeBonusPublic", "start");
      setStatus("#makePublicStatus", "Preparing...");
      if (!await connect()) throw new Error("Connect wallet first");

      setStatus("#makePublicStatus", "Sending tx to make bonus public...");
      const tx = await contract.makeBonusPublic();
      log("tx sent", tx.hash);
      const receipt = await tx.wait();
      log("tx confirmed", receipt);
      setStatus("#makePublicStatus", "✅ Your bonus is now public (decryptable)");
    } catch (e) {
      logErr("makeBonusPublic", e);
      setStatus("#makePublicStatus", `Error: ${e.message || e}`);
    }
  };

  // 5) Get Handle & Decrypt
  $("#btnGetHandle").onclick = async () => {
    try {
      log("getHandle", "start");
      setStatus("#decryptStatus", "Fetching handle...");
      if (!await connect()) throw new Error("Connect wallet first");

      const addr = $("#fetchAddr").value.trim() || userAddress;
      const a = getAddress(addr);

      const has = await contract.hasBonus(a);
      log("hasBonus", has);
      if (!has) {
        setStatus("#decryptStatus", "No bonus exists for this address");
        return;
      }

      const handle = await contract.bonusHandle(a);
      log("bonusHandle", handle);
      const clean = cleanHandle(handle);
      $("#bonusHandleOut").textContent = "Bonus Handle:\n" + clean;
      $("#bonusHandleOut").style.display = "block";
      setStatus("#decryptStatus", "Handle retrieved (see output)");
    } catch (e) {
      logErr("getHandle", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  // publicDecrypt helper (SDK 0.3.x) — expects array of bytes32, returns object with clearValues
  async function publicDecryptHandle(handle) {
    if (!relayer) throw new Error("Relayer not initialized");
    const cleaned = cleanHandle(handle);
    if (!cleaned.startsWith("0x") || cleaned.length !== 66) {
      throw new Error("Invalid handle format (must be bytes32)");
    }
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
    return Number(val); // 0..3
  }

  $("#btnDecrypt").onclick = async () => {
    try {
      log("decrypt flow", "start");
      setStatus("#decryptStatus", "Starting decrypt...");
      if (!await connect()) throw new Error("Connect wallet first");

      let raw = $("#bonusHandleOut").textContent || "";
      if (!raw) {
        // try to fetch on-chain
        const addr = $("#fetchAddr").value.trim() || userAddress;
        const h = await contract.bonusHandle(getAddress(addr));
        raw = h;
      }
      const handle = cleanHandle(raw);
      log("decrypt handle", handle);

      setStatus("#decryptStatus", "Calling relayer.publicDecrypt([...])...");
      const code = await publicDecryptHandle(handle);

      let label = "Unknown";
      if (code === 0) label = "NO BONUS";
      else if (code === 1) label = "BONUS LEVEL 1";
      else if (code === 2) label = "BONUS LEVEL 2";
      else if (code === 3) label = "BONUS LEVEL 3";

      const outDiv = $("#bonusResult");
      outDiv.style.display = "block";
      outDiv.innerHTML = `<div style="font-weight:700; font-size:16px;">${label} (code: ${code})</div>
                          <div style="margin-top:6px; color:#9fb1d9;">Handle: ${handle}</div>`;

      setStatus("#decryptStatus", `Decrypted: ${label}`);
      log("decrypt result", { code, label });
    } catch (e) {
      logErr("decrypt", e);
      setStatus("#decryptStatus", `Error: ${e.message || e}`);
    }
  };

  console.log("Hidden Performance Bonus UI loaded. All actions log to console.");
