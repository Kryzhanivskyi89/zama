 import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0xA47a51375f8F55d3174114EF4d9e7F9Ee7E6a6d4"
    };

    const ABI = [
  // setCard(uint256 cardId, externalEuint16 encryptedValue, bytes attestation)
  "function setCard(uint256 cardId, bytes32 encryptedValue, bytes attestation) external",

  // guess(externalEuint16 encGuess1, externalEuint16 encGuess2, bytes attestation) returns (bytes32)
  "function guess(bytes32 encGuess1, bytes32 encGuess2, bytes attestation) external returns (bytes32)",

  "function makePublic(address player) external",
  "function getHandle(address player) external view returns (bytes32)"
];


    let provider, signer, address, contract, relayer;
    const $ = s => document.querySelector(s);

    // ===== LOGS =====
    const log = (title, data) => {
      console.log(`%c[${title}]`, "color:#38bdf8;font-weight:bold;", data);
    };
    const logError = (title, err) => {
      console.error(`%c[ERROR: ${title}]`, "color:#ef4444;font-weight:bold;", err);
    };
    const logSuccess = (title, data) => {
      console.log(`%c[SUCCESS: ${title}]`, "color:#10b981;font-weight:bold;", data);
    };

    // ===== HELPERS =====
    const toHex = u8 =>
      "0x" + Array.from(u8, b => b.toString(16).padStart(2,"0")).join("");

    const setStatus = (selector, msg, type = "pending") => {
      const el = $(selector);
      if (!el) {
        log("Status Element Not Found", selector);
        return;
      }
      el.textContent = msg;
      el.className = `status ${type}`;
      el.style.display = "block";
      log(`Status ${selector}`, msg);
    };

    const clearStatus = selector => {
      const el = $(selector);
      if (el) el.style.display = "none";
    };

    function cleanHandle(raw) {
      return String(raw).trim().split("\n").pop().trim();
    }

    // ===== WALLET + RELAYER =====
    async function connect() {
      try {
        log("Connect", "Starting...");

        if (!window.ethereum) {
          throw new Error("MetaMask not installed");
        }

        provider = new BrowserProvider(window.ethereum);
        log("Provider", "Created");

        await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        address = await signer.getAddress();

        log("Address", address);

        contract = new Contract(
          getAddress(CONFIG.CONTRACT_ADDRESS),
          ABI,
          signer
        );
        log("Contract", CONFIG.CONTRACT_ADDRESS);

        $("#btnConnect").textContent =
          address.slice(0, 6) + "…" + address.slice(-4);

        if (!relayer) {
          log("Relayer", "initSDK...");
          await initSDK();
          relayer = await createInstance({
            ...SepoliaConfig,
            relayerUrl: CONFIG.RELAYER_URL,
            gatewayUrl: CONFIG.GATEWAY_URL,
            network: window.ethereum,
            debug: true
          });
          logSuccess("Relayer", "Instance created");
        }

        logSuccess("Connect", "Ready");
        return true;
      } catch (e) {
        logError("Connect", e);
        setStatus("#setStatus", "❌ Wallet connection failed", "error");
        return false;
      }
    }

    $("#btnConnect").onclick = connect;

    // ===== ADMIN: SET CARD (common encrypt helper) =====
    async function encryptUint16(value) {
      if (!relayer) throw new Error("Relayer not initialized");
      const enc = relayer.createEncryptedInput(
        getAddress(CONFIG.CONTRACT_ADDRESS),
        getAddress(address)
      );

      log("EncryptUint16", `adding value=${value}`);
      enc.add16(BigInt(value));

      const { handles, inputProof } = await enc.encrypt();
      log("Encrypt Result", {
        handleCount: handles.length,
        proofLength:
          typeof inputProof === "string"
            ? inputProof.length
            : inputProof.length
      });

      const rawHandle = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
      const handle =
        typeof rawHandle === "string" ? rawHandle : toHex(rawHandle);

      const attestation =
        typeof inputProof === "string"
          ? inputProof.startsWith("0x")
            ? inputProof
            : "0x" + inputProof
          : toHex(inputProof);

      log("Encrypt Extracted", {
        handleType: typeof handle,
        handleLength: handle.length,
        attestationLength: attestation.length
      });

      return { handle, attestation };
    }

    // ===== SET CARD 1 =====
    $("#btnSetCard1").onclick = async () => {
      try {
        log("SetCard1", "clicked");
        if (!(await connect())) return;

        clearStatus("#setStatus");
        setStatus("#setStatus", "🧮 Encrypting card #1…", "pending");

        const v = parseInt($("#card1Value").value || "0", 10);
        const { handle, attestation } = await encryptUint16(v);

        setStatus("#setStatus", "⛓️ Sending tx (card #1)…", "pending");
        log("SetCard1 Args", { cardId: 1, handle, attestation });

        const tx = await contract.setCard(1, handle, attestation);
        log("SetCard1 Tx", tx.hash);
        const receipt = await tx.wait();
        log("SetCard1 Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) {
          throw new Error("Transaction reverted");
        }

        logSuccess("SetCard1", "Done");
        setStatus("#setStatus", "✅ Card #1 set", "success");
      } catch (e) {
        logError("SetCard1", e);
        setStatus("#setStatus", "❌ " + (e.message || e), "error");
      }
    };

    // ===== SET CARD 2 =====
    $("#btnSetCard2").onclick = async () => {
      try {
        log("SetCard2", "clicked");
        if (!(await connect())) return;

        clearStatus("#setStatus");
        setStatus("#setStatus", "🧮 Encrypting card #2…", "pending");

        const v = parseInt($("#card2Value").value || "0", 10);
        const { handle, attestation } = await encryptUint16(v);

        setStatus("#setStatus", "⛓️ Sending tx (card #2)…", "pending");
        log("SetCard2 Args", { cardId: 2, handle, attestation });

        const tx = await contract.setCard(2, handle, attestation);
        log("SetCard2 Tx", tx.hash);
        const receipt = await tx.wait();
        log("SetCard2 Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) {
          throw new Error("Transaction reverted");
        }

        logSuccess("SetCard2", "Done");
        setStatus("#setStatus", "✅ Card #2 set", "success");
      } catch (e) {
        logError("SetCard2", e);
        setStatus("#setStatus", "❌ " + (e.message || e), "error");
      }
    };

    // ===== PLAYER GUESS =====
   // ЗАМІСТЬ encryptUint16 двічі у btnGuess:

$("#btnGuess").onclick = async () => {
  try {
    log("Guess", "clicked");
    if (!(await connect())) return;

    clearStatus("#guessStatus");
    setStatus("#guessStatus", "🧮 Encrypting guesses…", "pending");

    const g1 = parseInt($("#guess1").value || "1", 10);
    const g2 = parseInt($("#guess2").value || "2", 10);
    log("Guesses Raw", { g1, g2 });

    // ОДНЕ encrypt() для двох значень
    const enc = relayer.createEncryptedInput(
      getAddress(CONFIG.CONTRACT_ADDRESS),
      getAddress(address)
    );
    log("Guess EncryptInput", "created");

    enc.add16(BigInt(g1));
    enc.add16(BigInt(g2));
    log("Guess Added", { g1, g2 });

    const { handles, inputProof } = await enc.encrypt();
    log("Guess Encrypt Result", {
      handleCount: handles.length,
      proofLength: typeof inputProof === "string" ? inputProof.length : inputProof.length
    });

    const raw1 = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
    const raw2 = handles[1]?.handle || handles[1]?.ciphertext || handles[1];

    const encGuess1 = typeof raw1 === "string" ? raw1 : toHex(raw1);
    const encGuess2 = typeof raw2 === "string" ? raw2 : toHex(raw2);

    const attestation =
      typeof inputProof === "string"
        ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof)
        : toHex(inputProof);

    log("Guess Args", {
      encGuess1,
      encGuess2,
      attestation: attestation.slice(0, 50) + "..."
    });

    setStatus("#guessStatus", "⛓️ Sending guess tx…", "pending");

    const tx = await contract.guess(encGuess1, encGuess2, attestation);
    log("Guess Tx", tx.hash);
    const receipt = await tx.wait();
    log("Guess Receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

    if (receipt.status !== 1) throw new Error("Transaction reverted");

    // Далі як у тебе було – просто витягуємо handle з getHandle(address)
    setStatus("#guessStatus", "📊 Getting encrypted match handle…", "pending");
    const handle = await contract.getHandle(address);
    log("Guess Handle", handle);

    $("#matchHandleOutput").textContent = "Match Handle:\n" + handle;
    $("#matchHandleOutput").style.display = "block";

    logSuccess("Guess", `Handle: ${handle.slice(0, 20)}...`);
    setStatus("#guessStatus", "✅ Guess processed homomorphically", "success");
  } catch (e) {
    logError("Guess", e);
    setStatus("#guessStatus", "❌ " + (e.message || e), "error");
  }
};

    // ===== GET HANDLE (explicit) =====
    $("#btnGetHandle").onclick = async () => {
      try {
        log("GetHandle", "clicked");
        if (!(await connect())) return;

        setStatus("#decryptStatus", "📊 Reading match handle…", "pending");
        const handle = await contract.getHandle(address);
        log("GetHandle Value", handle);

        $("#matchHandleOutput").textContent = "Match Handle:\n" + handle;
        $("#matchHandleOutput").style.display = "block";

        logSuccess("GetHandle", handle.slice(0, 30) + "...");
        setStatus("#decryptStatus", "✅ Handle loaded", "success");
      } catch (e) {
        logError("GetHandle", e);
        setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      }
    };

    // ===== MAKE PUBLIC =====
    $("#btnMakePublic").onclick = async () => {
      try {
        log("MakePublic", "clicked");
        if (!(await connect())) return;

        setStatus("#decryptStatus", "🔓 Making your match public…", "pending");
        log("MakePublic Args", { player: address });

        const tx = await contract.makePublic(address);
        log("MakePublic Tx", tx.hash);
        const receipt = await tx.wait();
        log("MakePublic Receipt", {
          blockNumber: receipt.blockNumber,
          status: receipt.status
        });

        if (receipt.status !== 1) {
          throw new Error("Transaction reverted");
        }

        logSuccess("MakePublic", "Result is now publicly decryptable");
        setStatus("#decryptStatus", "✅ Match is now public", "success");
      } catch (e) {
        logError("MakePublic", e);
        setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      }
    };

    // ===== PUBLIC DECRYPT (Relayer SDK 0.3.x) =====
    async function decryptMatch(rawHandle) {
      if (!relayer) throw new Error("Relayer not initialized");

      const handle = cleanHandle(rawHandle);
      log("Decrypt Handle (clean)", handle);

      if (!handle.startsWith("0x") || handle.length !== 66) {
        throw new Error("Invalid handle format (must be bytes32)");
      }

      const request = [handle];
      console.log("🔎 publicDecrypt request:", request);

      const out = await relayer.publicDecrypt(request);
      console.log("🔍 publicDecrypt output:", out);

      if (!out || typeof out !== "object" || !out.clearValues) {
        throw new Error("Invalid decrypt response (no clearValues)");
      }

      const lower = handle.toLowerCase();
      const value = out.clearValues[handle] ?? out.clearValues[lower];

      if (value === undefined || value === null) {
        throw new Error("Decrypt produced no value for this handle");
      }

      console.log("🔐 clear value:", value);

      // lastMatch is euint8: 1 = match, 0 = no match
      return BigInt(value) === 1n;
    }

    // ===== DECRYPT BUTTON =====
    $("#btnDecrypt").onclick = async () => {
      try {
        log("DecryptBtn", "clicked");
        if (!(await connect())) return;

        const raw = $("#matchHandleOutput").textContent || "";
        const handle = cleanHandle(raw);
        console.log("Decrypting handle:", handle);

        setStatus("#decryptStatus", "🔓 Decrypting via relayer…", "pending");
        const isMatch = await decryptMatch(handle);

        console.log("MATCH =", isMatch);

        const resultDiv = $("#matchResult");
        if (isMatch) {
          resultDiv.className = "match-result";
          resultDiv.innerHTML =
            `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">✅ MATCH FOUND!</div>
             <div style="color:#d1d5db;font-size:14px;">
               The hidden values of card #1 and card #2 are equal.
             </div>`;
        } else {
          resultDiv.className = "match-result no-match";
          resultDiv.innerHTML =
            `<div style="font-size:1.2rem;font-weight:600;margin-bottom:8px;">❌ NO MATCH</div>
             <div style="color:#d1d5db;font-size:14px;">
               The hidden values of card #1 and card #2 are different.
             </div>`;
        }
        resultDiv.style.display = "block";

        setStatus("#decryptStatus", "✅ Match result decrypted", "success");
      } catch (e) {
        logError("Decrypt", e);
        setStatus("#decryptStatus", "❌ " + (e.message || e), "error");
      }
    };

    log("Script", "✅ All handlers attached and ready");
  