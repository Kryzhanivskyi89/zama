import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

// конфіги
const RELAYER_URL = "https://relayer.testnet.zama.org";
const GATEWAY_URL  = "https://gateway.testnet.zama.org";
const CONTRACT = "0xa0198955D420Fa71100C23A2341D6D6446f90379";

const ABI = [
  { "inputs":[{"type":"bytes32","name":"chainId"}],"name":"initChain","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"type":"bytes32","name":"chainId"},{"type":"bytes32","name":"extTrust"},{"type":"bytes","name":"att"}],"name":"addTrust","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"type":"bytes32","name":"chainId"}],"name":"makePublic","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"type":"bytes32","name":"chainId"}],"name":"trustHandle","outputs":[{"type":"bytes32"}],"stateMutability":"view","type":"function" }
];

const $ = s => document.querySelector(s);
const appendLog = (t) => { $("#log").innerText += t + "\n"; console.log(t); };

// helper: convert proof (Array-like or Uint8Array or hex string) to hex
function toHex(input) {
  if (!input) return "";
  // if already hex string with 0x
  if (typeof input === "string") {
    return input.startsWith("0x") ? input.slice(2) : input;
  }
  // if Uint8Array or array
  if (input instanceof Uint8Array || Array.isArray(input)) {
    return Array.from(input).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  // Buffer-like (Node) -> fallback
  try {
    return Array.from(input).map(b => (b & 0xFF).toString(16).padStart(2,"0")).join("");
  } catch (e) {
    return "";
  }
}

// debug helper to inspect relayer instance
function inspectRelayer(r) {
  if (!r) return "relayer=null";
  const keys = Object.keys(r).join(", ");
  return `Relayer keys: ${keys}`;
}

let provider, signer, relayer, contract, addr;

// CONNECT WALLET + INIT relayer
$("#connectBtn").onclick = async () => {
  try {
    appendLog("▶ Connecting wallet...");
    provider = new BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    addr = await signer.getAddress();
    appendLog("✔ Wallet connected: " + addr);

    contract = new Contract(getAddress(CONTRACT), ABI, signer);
    appendLog("✔ Contract instance ready: " + CONTRACT);

    appendLog("▶ initSDK()");
    await initSDK();
    appendLog("✔ initSDK done");

    appendLog("▶ createInstance()");
    relayer = await createInstance({
      ...SepoliaConfig,
      relayerUrl: RELAYER_URL,
      gatewayUrl: GATEWAY_URL,
      network: window.ethereum,
      debug: true
    });
    appendLog("✔ Relayer instance created");
    appendLog("Relayer inspect: " + inspectRelayer(relayer));

    // quick checks
    appendLog("Relayer has createEncryptedInput?: " + (typeof (relayer && relayer.createEncryptedInput) === "function"));
    appendLog("Relayer has publicDecrypt?: " + (typeof (relayer && relayer.publicDecrypt) === "function"));
    // if relayer has config property - log it (may be undefined in some builds)
    try { appendLog("Relayer.config: " + JSON.stringify(relayer.config || "undefined")); } catch(e) { appendLog("Relayer.config: <unserializable>"); }

  } catch (e) {
    appendLog("ERROR connecting/initializing: " + (e && e.message ? e.message : e));
    console.error(e);
  }
};

// helper: try provider.call to get revert data (simulate)
async function simulateCall(populatedData) {
  try {
    const from = await signer.getAddress();
    const callRes = await contract.provider.call({ to: CONTRACT, data: populatedData, from });
    appendLog("simulate call succeeded: " + callRes);
    return { ok: true, result: callRes };
  } catch (err) {
    appendLog("simulate reverted (raw error): " + (err && err.message ? err.message : err));
    if (err && err.data) {
      appendLog("revert data hex: " + err.data);
    } else if (err && err.error && err.error.data) {
      appendLog("revert data (err.error.data): " + err.error.data);
    }
    return { ok: false, error: err };
  }
}

// ADD TRUST
$("#add").onclick = async () => {
  try {
    $("#status1").textContent = "Encrypting…";
    const chainIdStr = $("#chainId").value.trim();
    if (!chainIdStr) { $("#status1").textContent = "Enter chainId"; return; }
    const chainId = keccak256(toUtf8Bytes(chainIdStr));
    const score = parseInt($("#trustScore").value || "0");

    appendLog(`▶ ADD TRUST: chainId='${chainIdStr}' hash=${chainId} score=${score}`);
    appendLog("Encrypt target contract = " + getAddress(CONTRACT));

    if (!relayer || typeof relayer.createEncryptedInput !== "function") {
      appendLog("ERROR: relayer not initialized or createEncryptedInput missing");
      $("#status1").textContent = "Relayer not ready";
      return;
    }

    // create encrypted input
    appendLog("▶ createEncryptedInput()");
    const enc = relayer.createEncryptedInput(getAddress(CONTRACT), addr);
    if (!enc) { appendLog("ERROR: createEncryptedInput returned falsy"); return; }

    // add value (try add16; fallback add)
    if (typeof enc.add16 === "function") enc.add16(BigInt(score));
    else if (typeof enc.add === "function") enc.add(BigInt(score));
    else throw new Error("no add method on encrypted input");

    appendLog("▶ encrypt()");
    const { handles, inputProof } = await enc.encrypt();
    appendLog("✔ handles:", JSON.stringify(handles));
    appendLog("✔ proof length: " + (inputProof ? (inputProof.length || inputProof.byteLength || "unknown") : "null"));

    const proofHex = toHex(inputProof);
    appendLog("PROOF HEX (first 200 chars): " + proofHex.slice(0, 200));
    appendLog("FULL PROOF LENGTH (bytes): " + (proofHex.length/2));

    // ensure chain exists: call initChain once (idempotent on your contract if you change it later)
    try {
      appendLog("▶ calling initChain (idempotent attempt)");
      const tx0 = await contract.initChain(chainId);
      await tx0.wait();
      appendLog("✔ initChain tx executed");
    } catch (e) {
      appendLog("initChain tx reverted or already exists (ok): " + (e && e.message ? e.message : e));
    }

    // prepare populated tx data for simulation
    appendLog("▶ preparing populated transaction for simulation");
    const populated = await contract.populateTransaction.addTrust(chainId, handles[0], inputProof);
    // simulate via provider.call to capture revert data (no gas estimate)
    const sim = await simulateCall(populated.data);
    if (!sim.ok) {
      appendLog("⚠️ Simulation failed — aborting actual tx send. See logs above.");
      $("#status1").textContent = "Simulation failed (see logs)";
      return;
    }

    // send tx
    appendLog("▶ Sending addTrust tx");
    const tx = await contract.addTrust(chainId, handles[0], inputProof);
    appendLog("⏳ tx sent: " + tx.hash);
    await tx.wait();
    appendLog("✔ addTrust succeeded");
    $("#status1").textContent = "Trust added ✔";

  } catch (e) {
    // show detailed error info
    appendLog("❌ ERROR addTrust: " + (e && e.message ? e.message : e));
    // ethers v6 error may have error.data or error.error.data
    if (e && e.data) appendLog("error.data: " + JSON.stringify(e.data));
    if (e && e.error && e.error.data) appendLog("error.error.data: " + JSON.stringify(e.error.data));
    if (e && e.transaction) appendLog("error.transaction: " + JSON.stringify(e.transaction));
    console.error(e);
    $("#status1").textContent = "Error — see logs";
  }
};

// MAKE PUBLIC
$("#makePublic").onclick = async () => {
  try {
    const id = keccak256(toUtf8Bytes($("#chainReveal").value.trim()));
    const tx = await contract.makePublic(id);
    await tx.wait();
    appendLog("Made public");
    $("#status2").textContent = "Made public ✔";
  } catch (e) { appendLog("makePublic error: " + (e.message || e)); }
};

// GET HANDLE
$("#getHandle").onclick = async () => {
  try {
    const id = keccak256(toUtf8Bytes($("#chainReveal").value.trim()));
    const h = await contract.trustHandle(id);
    $("#hbox").textContent = h;
    appendLog("Handle: " + h);
    $("#status2").textContent = "Handle loaded ✔";
  } catch (e) { appendLog("getHandle error: " + (e.message || e)); }
};

// DECRYPT (public)
$("#decrypt").onclick = async () => {
  try {
    const h = $("#hbox").textContent.trim();
    if (!h) { appendLog("No handle"); return; }
    if (!relayer || typeof relayer.publicDecrypt !== "function") { appendLog("Relayer.publicDecrypt not available"); return; }
    const out = await relayer.publicDecrypt([h]);
    appendLog("publicDecrypt out: " + JSON.stringify(out));
    $("#result").textContent = out[h];
    $("#status2").textContent = "Decrypted ✔";
  } catch (e) { appendLog("decrypt error: " + (e.message || e)); }
};