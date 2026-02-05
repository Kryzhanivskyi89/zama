import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

const CONFIG = {
  RELAYER_URL: "https://relayer.testnet.zama.org",
  GATEWAY_URL: "https://gateway.testnet.zama.org",
  CONTRACT_ADDRESS: "0x0E35cBC96bF93fbE2399E26369a5920c7b2199e0"
};

const ABI = [
  { "inputs":[{"type":"bytes32","name":"daoId"}],"name":"initDAO","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"type":"bytes32","name":"daoId"},{"type":"bytes32","name":"extKPI"},{"type":"bytes","name":"att"}],"name":"submitKPI","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"type":"bytes32","name":"daoId"}],"name":"makePublic","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"type":"bytes32","name":"daoId"}],"name":"kpiHandle","outputs":[{"type":"bytes32"}],"stateMutability":"view","type":"function" }
];

const $ = (s)=>document.querySelector(s);
const log = (msg)=>{ $("#log").innerText += msg + "\n"; };

let provider, signer, relayer, contract;
let addr;

$("#connectBtn").onclick = async () => {
  provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  addr = await signer.getAddress();
  console.log('[WALLET] Connected:', addr);

  $("#connectBtn").innerText = addr.slice(0,6) + "..." + addr.slice(-4);

  log("Wallet connected: " + addr);

  contract = new Contract(getAddress(CONFIG.CONTRACT_ADDRESS), ABI, signer);

  await initSDK();
  relayer = await createInstance({
    ...SepoliaConfig,
    relayerUrl: CONFIG.RELAYER_URL,
    gatewayUrl: CONFIG.GATEWAY_URL,
    network: window.ethereum,
    debug: true
  });
  console.log('[RELAYER] Instance created:', relayer);
};

$("#submit").onclick = async () => {
  try{
    $("#status1").textContent = "Encrypting…";

    const daoId = keccak256(toUtf8Bytes($("#daoId").value));
    const kpiValue = parseInt($("#kpi").value);
    console.log('[SUBMIT] Project name:', $("#daoName").value, 'Project ID:', $("#daoId").value, 'Keccak:', daoId, 'Score:', kpiValue);

    const enc = relayer.createEncryptedInput(getAddress(CONFIG.CONTRACT_ADDRESS), addr);
    enc.add16(BigInt(kpiValue));

    const { handles, inputProof } = await enc.encrypt();
    console.log('[SUBMIT] handle:', handles[0], 'attestation:', inputProof);

    const tx = await contract.submitKPI(daoId, handles[0], inputProof);
    console.log('[SUBMIT] Tx sent:', tx.hash);
    await tx.wait();

    $("#status1").textContent = "Score submitted ✔";
    log("Score submitted");
  }catch(e){
    $("#status1").textContent = "Error: " + (e.message || e.reason);
    log("ERROR: " + e.message);
    console.error('[SUBMIT] ERROR:', e);
  }
};

$("#makePublic").onclick = async () => {
  try{
    const daoId = keccak256(toUtf8Bytes($("#daoReveal").value));
    console.log('[REVEAL] Revealing for Project:', $("#daoReveal").value, 'Keccak:', daoId);
    const tx = await contract.makePublic(daoId);
    console.log('[REVEAL] Tx sent:', tx.hash);
    await tx.wait();

    $("#status2").textContent = "Made public ✔";
    log("Score made public");
  }catch(e){
    $("#status2").textContent = "Error: " + (e.message || e.reason);
    log("ERROR: " + e.message);
    console.error('[REVEAL] ERROR:', e);
  }
};

$("#getHandle").onclick = async () => {
  const daoId = keccak256(toUtf8Bytes($("#daoReveal").value));
  const handle = await contract.kpiHandle(daoId);
  $("#hbox").textContent = handle;
  $("#status2").textContent = "Handle loaded ✔";
  log("Handle: " + handle);
  console.log('[GET HANDLE] Project:', $("#daoReveal").value, 'Keccak:', daoId, 'Handle:', handle);
};

$("#decrypt").onclick = async () => {
  try{
    $("#status2").textContent = "Decrypting…";

    const h = $("#hbox").textContent.trim();
    if (!h) throw new Error("No handle");

    console.log('[DECRYPT] Handle:', h);

    const r = await relayer.publicDecrypt([h]);
    console.log("[DECRYPT] full response:", r);

    const key = Object.keys(r.clearValues)[0];
    const raw = Number(r.clearValues[key]);

    $("#result").textContent = raw;
    $("#status2").textContent = "Decrypted ✔";

    log("Decrypted result: " + raw);
  }catch(e){
    $("#status2").textContent = "Error: " + (e.message || e.reason);
    log("ERROR: " + e.message);
    console.error('[DECRYPT] ERROR:', e);
  }
};
