import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0xcDBd6A1344f6bAA3f4b1AddF68d4621adDF831C6"
    };

    const ABI = [
      "function submitPreferences(bytes32,bytes32,bytes32,bytes) external returns (uint256)",
      "function planHandle(uint256) external view returns (bytes32)",
      "function makePlanPublic(uint256) external",
    ];

    let provider, signer, address, contract, relayer;
    const $ = s => document.querySelector(s);
    const toHex = u8 => '0x' + Array.from(u8, b => b.toString(16).padStart(2,'0')).join('');

    async function connect() {
      provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      address = await signer.getAddress();
      contract = new Contract(getAddress(CONFIG.CONTRACT_ADDRESS), ABI, signer);
      $("#btnConnect").textContent = address.slice(0,6)+"…"+address.slice(-4);
      if (!relayer) {
        await initSDK();
        relayer = await createInstance({
          ...SepoliaConfig,
          relayerUrl: CONFIG.RELAYER_URL,
          gatewayUrl: CONFIG.GATEWAY_URL,
          network: window.ethereum,
          debug: true
        });
      }
    }

    $("#btnConnect").onclick = connect;

    $("#btnSubmit").onclick = async () => {
      try {
        await connect();
        const duration = parseInt($("#inpDuration").value);
        const budget = parseInt($("#inpBudget").value);
        const content = parseInt($("#inpContent").value);
        $("#status").textContent = "Encrypting…";

        const enc = relayer.createEncryptedInput(getAddress(CONFIG.CONTRACT_ADDRESS), getAddress(address));
        enc.add8(BigInt(duration));
        enc.add16(BigInt(budget));
        enc.add8(BigInt(content));
        const { handles, inputProof } = await enc.encrypt();

        // Correctly extract handles and proof
        const h1 = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
        const h2 = handles[1]?.handle || handles[1]?.ciphertext || handles[1];
        const h3 = handles[2]?.handle || handles[2]?.ciphertext || handles[2];
        const att = typeof inputProof === "string" ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof) : toHex(inputProof);

        console.log("🔹 Submit args:", { h1, h2, h3, att });

        const tx = await contract.submitPreferences(h1, h2, h3, att);
        $("#status").textContent = "Tx sent…";
        await tx.wait();
        $("#status").textContent = "Submitted successfully ✅";
      } catch (e) {
        console.error(e);
        $("#status").textContent = "Error: " + (e.message || e);
      }
    };

    $("#btnHandle").onclick = async () => {
      try {
        const id = parseInt($("#inpId").value);
        const handle = await contract.planHandle(id);
        $("#output").textContent = "Encrypted Plan Handle:\n" + handle;
      } catch (e) {
        $("#output").textContent = "Error: " + e.message;
      }
    };

    $("#btnDecrypt").onclick = async () => {
  try {
    await connect();

    const id = parseInt($("#inpId").value);
    const handleText = $("#output").textContent.split("\n")[1]?.trim();
    if (!handleText || handleText === "—") throw new Error("Get handle first");

    // 1) Make public
    const tx = await contract.makePlanPublic(id);
    $("#output").textContent += "\nMaking plan public…";
    await tx.wait();

    // 2) Decrypt
    const result = await relayer.publicDecrypt([handleText]);
    console.log("🔹 decrypt raw:", result);

    // IMPORTANT: real key may differ in formatting → use first key
    const key = Object.keys(result.clearValues)[0];
    const raw = Number(result.clearValues[key]);  // now 0/1/2

    const planNames = ["Basic", "Standard", "Premium"];
    const plan = planNames[raw] ?? "Unknown";

    $("#output").textContent += `\nDecrypted Plan: ${plan}`;
  } catch (e) {
    console.error(e);
    $("#output").textContent = "Decrypt error: " + (e.message || e);
  }
};
