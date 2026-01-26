 import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    // CONFIG: change CONTRACT_ADDRESS if you deployed to another address on FHEVM
    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0x89b7aDe7a0135fac8E809fDF1d7C30547AD16d51" 
    };

    // ABI - ensure bytes32 for handles and correct signatures
    const ABI = [
      "function publishProfile(bytes32,bytes32,bytes32,bytes32,bytes) external returns (uint256)",
      "function submitPreference(bytes32,bytes32,bytes32,bytes32,bytes32,bytes) external returns (uint256)",
      "function computeMatchHandle(uint256,uint256) external returns (bytes32)",
      "function makeMatchPublic(uint256,uint256) external",
      // view helpers
      "function ownerOfProfile(uint256) external view returns (address)",
      "function getMatchHandle(uint256,uint256) external view returns (bytes32)",
      "function ownerOfPref(uint256) external view returns (address)"
    ];

    const $ = s => document.querySelector(s);
    const log = (t) => {
  const time = new Date().toLocaleTimeString();
  const message = `${time}  ${t}`;
  const l = $("#log");
  l.textContent = message + "\n" + l.textContent;
  console.log(`[TinderDAO Log] ${message}`); // 🔹 дублюємо у консоль браузера
};
const toHex = u8 => '0x' + Array.from(u8, b => b.toString(16).padStart(2,'0')).join('');

    let provider, signer, address, contract, relayer;

    async function connect() {
      if (!window.ethereum) throw new Error("Install MetaMask / compatible wallet");
      provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      address = await signer.getAddress();
      contract = new Contract(getAddress(CONFIG.CONTRACT_ADDRESS), ABI, signer);
      $("#btnConnect").textContent = address.slice(0,6) + "…" + address.slice(-4);

      if (!relayer) {
        await initSDK();
        relayer = await createInstance({
          ...SepoliaConfig,
          relayerUrl: CONFIG.RELAYER_URL,
          gatewayUrl: CONFIG.GATEWAY_URL,
          network: window.ethereum,
          debug: true
        });
        console.info("Relayer ready");
      }
    }

    $("#btnConnect").onclick = async () => {
      try { await connect(); log("Wallet connected: " + address); } catch(e){ alert(e.message || e); }
    };

    // Helper: create encrypted input and return handles array + proof hex
    async function makeEncryptedForContract(typesValues) {
      // typesValues: array of { addMethod: 'add8'|'add16', value: BigInt }
      const enc = relayer.createEncryptedInput(getAddress(CONFIG.CONTRACT_ADDRESS), getAddress(address));
      for (const tv of typesValues) {
        if (tv.addMethod === "add8") enc.add8(BigInt(tv.value));
        else if (tv.addMethod === "add16") enc.add16(BigInt(tv.value));
        else throw new Error("Unsupported addMethod");
      }
      const { handles, inputProof } = await enc.encrypt();
      // handles elements: may be string or object with .handle/.ciphertext
      const extracted = handles.map(h => (typeof h === "string" ? h : (h.handle || h.ciphertext || h)));
      const proof = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof) : toHex(inputProof);
      return { handles: extracted, proof };
    }

    // Publish Profile
    $("#btnPublish").onclick = async () => {
      try {
        await connect();
        const age = parseInt($("#profileAge").value);
        const gender = parseInt($("#profileGender").value);
        const interests = parseInt($("#profileInterests").value);
        const region = parseInt($("#profileRegion").value);
        $("#pubStatus").textContent = "Encrypting…";

        const { handles, proof } = await makeEncryptedForContract([
          { addMethod: "add8", value: age },
          { addMethod: "add8", value: gender },
          { addMethod: "add16", value: interests },
          { addMethod: "add16", value: region }
        ]);

        log("Profile encrypted, handles: " + handles.map(h=>h.slice(0,10)).join(", "));
        $("#pubStatus").textContent = "Sending tx…";
        const tx = await contract.publishProfile(handles[0], handles[1], handles[2], handles[3], proof);
        log("publish tx: " + tx.hash);
        await tx.wait();
        $("#pubStatus").textContent = "Profile published ✅";
      } catch (e) {
        console.error(e);
        $("#pubStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // Submit Preference
    $("#btnSubmitPref").onclick = async () => {
      try {
        await connect();
        const minAge = parseInt($("#prefMinAge").value);
        const maxAge = parseInt($("#prefMaxAge").value);
        const gender = parseInt($("#prefGender").value); // 255 = any
        const interests = parseInt($("#prefInterests").value);
        const region = parseInt($("#prefRegion").value);
        $("#prefStatus").textContent = "Encrypting…";

        const { handles, proof } = await makeEncryptedForContract([
          { addMethod: "add8", value: minAge },
          { addMethod: "add8", value: maxAge },
          { addMethod: "add8", value: gender },
          { addMethod: "add16", value: interests },
          { addMethod: "add16", value: region }
        ]);

        log("Pref encrypted, handles: " + handles.map(h=>h.slice(0,10)).join(", "));
        $("#prefStatus").textContent = "Sending tx…";
        const tx = await contract.submitPreference(handles[0], handles[1], handles[2], handles[3], handles[4], proof);
        log("submitPref tx: " + tx.hash);
        await tx.wait();
        $("#prefStatus").textContent = "Preference submitted ✅";
      } catch (e) {
        console.error(e);
        $("#prefStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // Compute Match Handle (calls computeMatchHandle and shows handle from event in logs)
    $("#btnGetHandle").onclick = async () => {
      try {
        await connect();
        const pid = parseInt($("#profileId").value);
        const qid = parseInt($("#prefId").value);

        const tx = await contract.computeMatchHandle(pid, qid);
        const rec = await tx.wait();

        log("Match computed");

        const handle = await contract.getMatchHandle(pid, qid);
        $("#log").textContent = `Encrypted Match Handle:\n${handle}\n\n` + $("#log").textContent;
       
      } catch (e) {
        console.error(e);
        log("Error computing match: " + (e.message || e));
      }
    };

    // Make match public (call by owner or requester)
    $("#btnMakePublic").onclick = async () => {
      try {
        await connect();
        const pid = parseInt($("#profileId").value);
        const qid = parseInt($("#prefId").value);
        $("#decStatus").textContent = "Sending make public tx…";
        const tx = await contract.makeMatchPublic(pid, qid);
        const handle = await contract.getMatchHandle(pid, qid);
const dec = await relayer.publicDecrypt([handle]);

        log("makeMatchPublic tx: " + tx.hash);
        await tx.wait();
        $("#decStatus").textContent = "Match made public ✅";
      } catch (e) {
        console.error(e);
        $("#decStatus").textContent = "Error: " + (e.message || e);
      }
    };

    // Public decrypt (uses latest handle shown in log area)
   $("#btnPublicDecrypt").onclick = async () => {
  try {
    await connect();
    const pid = parseInt($("#profileId").value);
    const qid = parseInt($("#prefId").value);

    // Handle напряму з контракту
    const handle = await contract.getMatchHandle(pid, qid);

    $("#decStatus").textContent = "Decrypting…";

    const result = await relayer.publicDecrypt([handle]);
    console.log("publicDecrypt response:", result);

    // ВАЖЛИВО: беремо ключ як є
    const key = Object.keys(result)[0];
    // const raw = Number(result[key]);
    const raw = Number(result.clearValues[key]); // або BigInt()

    const out = (raw === 1 ? "MATCH" : "NO MATCH");

    // $("#decryptOut").textContent =
    //   `Handle: ${handle}\nResult raw: ${raw}\nStatus: ${out}`;

    $("#decStatus").textContent = "Done";
  } catch (e) {
    console.error(e);
    $("#decStatus").textContent = "Error: " + (e.message || e);
  }
};

