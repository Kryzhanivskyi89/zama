
import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0x6A4Bb15F54B76FA2ebCf506f3Bd86bb9b6F7978d"
    };

const ABI = [
  { "inputs":[{"type":"bytes32","name":"projectId"}],"name":"initProject","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"type":"bytes32","name":"projectId"},{"type":"bytes32","name":"extScore"},{"type":"bytes","name":"att"}],"name":"submitScore","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"type":"bytes32","name":"projectId"}],"name":"makePublic","outputs":[],"stateMutability":"nonpayable","type":"function" },
  { "inputs":[{"type":"bytes32","name":"projectId"}],"name":"scoreHandle","outputs":[{"type":"bytes32"}],"stateMutability":"view","type":"function" }
];

const $ = (s)=>document.querySelector(s);
const log = (msg)=>{ $("#log").innerText += msg + "\n"; };

let provider, signer, relayer, contract;
let addr;

// Connect Wallet
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


// Submit encrypted score
$("#send").onclick = async () => {
  try{
    $("#status1").textContent = "Encrypting…";

    const projectId = keccak256(toUtf8Bytes($("#projId").value));
    const score = parseInt($("#score").value);
    console.log('[SUBMIT] Project name:', $("#projName").value, 'Project ID:', $("#projId").value, 'Keccak:', projectId, 'Score:', score);

    const enc = relayer.createEncryptedInput(getAddress(CONFIG.CONTRACT_ADDRESS), addr);
    enc.add16(BigInt(score));

    const { handles, inputProof } = await enc.encrypt();
    console.log('[SUBMIT] handle:', handles[0], 'attestation:', inputProof);

    const tx = await contract.submitScore(projectId, handles[0], inputProof);
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


// Make public
$("#reveal").onclick = async () => {
  try{
    const projectId = keccak256(toUtf8Bytes($("#projReveal").value));
    console.log('[REVEAL] Revealing for Project:', $("#projReveal").value, 'Keccak:', projectId);
    const tx = await contract.makePublic(projectId);
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


// Get handle
$("#getHandle").onclick = async () => {
  const projectId = keccak256(toUtf8Bytes($("#projReveal").value));
  const handle = await contract.scoreHandle(projectId);
  $("#hbox").textContent = handle;
  $("#status2").textContent = "Handle loaded ✔";
  log("Handle: " + handle);
  console.log('[GET HANDLE] Project:', $("#projReveal").value, 'Keccak:', projectId, 'Handle:', handle);
};


$("#pubDec").onclick = async () => {
  try{
    $("#status2").textContent = "Decrypting…";

    const h = $("#hbox").textContent.trim();
    if (!h) throw new Error("No handle");

    console.log('[DECRYPT] Handle:', h);

    const r = await relayer.publicDecrypt([h]);
    console.log("[DECRYPT] full response:", r);

    // Extract canonical key
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
