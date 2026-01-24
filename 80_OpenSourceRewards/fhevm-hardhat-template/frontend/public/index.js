import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0x5b30beD0BA9D796f1e58FA36130e513E3EBEEEe7"
    };

    const ABI = [
      "function initCertificate(bytes32 certId) public",
      "function submitCertificate(bytes32 certId, bytes encryptedData) external",
      "function submissions(bytes32 certId) external view returns (uint256)"
    ];

    let provider, signer, address, contract, relayer;
    const $ = s => document.querySelector(s);
    
    const toBytes = (u8) => u8 instanceof Uint8Array ? u8 : new Uint8Array(Object.values(u8));
    const concatBytes = (...arrs) => {
      const total = arrs.reduce((sum, arr) => sum + arr.length, 0);
      const result = new Uint8Array(total);
      let offset = 0;
      for (const arr of arrs) {
        result.set(arr, offset);
        offset += arr.length;
      }
      return result;
    };
    
    const log = (msg, data = null) => {
      const el = $("#debugLog");
      const line = `${msg} ${data ? JSON.stringify(data).substring(0, 150) : ''}`;
      console.log(line);
      el.innerHTML += line + '<br/>';
      el.scrollTop = el.scrollHeight;
    };
    
    const numberToBytes32 = (num) => '0x' + num.toString().padStart(64, '0');
    
    const setStatus = (id, msg, success = false) => {
      const el = $(id);
      el.textContent = msg;
      el.className = `status ${success ? 'success' : 'error'}`;
    };

    const generateRandomCertId = () => Math.floor(Math.random() * 1000000000) + 1;

    async function connect() {
      if (!window.ethereum) {
        alert("MetaMask not installed");
        return false;
      }
      try {
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
            network: window.ethereum
          });
          log("✅ Relayer ready");
        }
        return true;
      } catch (e) {
        log("❌ Error:", e.message);
        return false;
      }
    }

    $("#btnConnect").onclick = connect;
    $("#btnGenerate").onclick = () => {
      const id = generateRandomCertId();
      $("#inpCertId").value = id;
      $("#inpCertId2").value = id;
      $("#inpCertId3").value = id;
    };

    $("#btnInit").onclick = async () => {
      try {
        if (!await connect()) return;
        const certNum = parseInt($("#inpCertId").value);
        if (isNaN(certNum) || certNum < 1) throw new Error("Invalid ID");
        
        const certId = numberToBytes32(certNum);
        setStatus("#statusInit", "Sending…");
        const tx = await contract.initCertificate(certId);
        await tx.wait();
        setStatus("#statusInit", "✅ Initialized", true);
        log("✅ Init success");
      } catch (e) {
        setStatus("#statusInit", "❌ " + (e.reason || e.message));
        log("❌ Init failed:", e.message);
      }
    };

    $("#btnSubmit").onclick = async () => {
      try {
        if (!await connect()) return;
        
        const certNum = parseInt($("#inpCertId2").value);
        const level = parseInt($("#inpLevel").value);
        if (isNaN(certNum) || isNaN(level)) throw new Error("Invalid input");
        
        const certId = numberToBytes32(certNum);
        
        setStatus("#statusSubmit", "Encrypting…");
        log("🔐 Encrypting...");

        const input = relayer.createEncryptedInput(CONFIG.CONTRACT_ADDRESS, address);
        input.add16(BigInt(level));
        const { handles, inputProof } = await input.encrypt();
        
        log("✅ Encrypted, combining data...");
        
        // Convert to Uint8Array if needed
        const handle = toBytes(handles[0]);
        const proof = toBytes(inputProof);
        
        // Concatenate: handle (32 bytes) + proof (rest)
        const combined = concatBytes(handle, proof);
        
        log("📦 Data ready", { handleLen: handle.length, proofLen: proof.length, totalLen: combined.length });
        
        setStatus("#statusSubmit", "Sending tx…");
        const tx = await contract.submitCertificate(certId, combined);
        
        log("⏳ Waiting:", tx.hash);
        await tx.wait();
        
        setStatus("#statusSubmit", "✅ Submitted!", true);
        log("✅ TX SUCCESS");
      } catch (e) {
        setStatus("#statusSubmit", "❌ " + (e.reason || e.message));
        log("❌ Error:", e.message.substring(0, 100));
      }
    };

    $("#btnSubmissions").onclick = async () => {
      try {
        if (!await connect()) return;
        const certNum = parseInt($("#inpCertId3").value);
        if (isNaN(certNum)) throw new Error("Invalid ID");
        
        const certId = numberToBytes32(certNum);
        const count = await contract.submissions(certId);
        $("#output").textContent = "Submissions: " + count.toString();
      } catch (e) {
        $("#output").textContent = "❌ " + (e.reason || e.message);
      }
    };