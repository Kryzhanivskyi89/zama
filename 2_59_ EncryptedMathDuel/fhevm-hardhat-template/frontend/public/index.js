import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress, keccak256, toUtf8Bytes } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    const CONFIG = {
      RELAYER_URL: "https://relayer.testnet.zama.org",
      GATEWAY_URL: "https://gateway.testnet.zama.org",
      CONTRACT_ADDRESS: "0xc0e38DD2fa617b8E189EB88BD80ACebE0588143C"
    };

const ABI = [
  "function submitCorrect(bytes32 duelId, bytes32 encCorrect, bytes attestation) external",
  "function submitGuess1(bytes32 duelId, bytes32 encGuess, bytes attestation) external",
  "function submitGuess2(bytes32 duelId, bytes32 encGuess, bytes attestation) external",
  "function computeWinner(bytes32 duelId, bytes32 encZero, bytes attestation) external returns (bytes32)",
  "function makeWinnerPublic(bytes32 duelId) external",
  "function winnerHandle(bytes32 duelId) external view returns (bytes32)",
  "function duelExists(bytes32 duelId) external view returns (bool)",
  "function winnerExists(bytes32 duelId) external view returns (bool)",
  "function duelOwner(bytes32 duelId) external view returns (address)"
];

    let provider, signer, address, contract, relayer;
    const $ = s => document.querySelector(s);

    const log = (title, data) => console.log(`%c[${title}]`, "color:#38bdf8;font-weight:bold;", data);
    const logError = (title, err) => console.error(`%c[ERROR:${title}]`, "color:#ef4444;font-weight:bold;", err);

    const toHex = u8 => "0x" + Array.from(u8, b => b.toString(16).padStart(2,"0")).join("");

    const setStatus = (id, msg, type="pending") => {
      const el = $(id);
      if (!el) return;
      el.textContent = msg;
      el.className = `status ${type}`;
      el.style.display = "block";
      log(`STATUS ${id}`, msg);
    };
    const clearStatus = id => {
      const el = $(id);
      if (el) el.style.display = "none";
    };

    const toDuelId = (text) => {
      const t = (text || "").trim();
      const h = keccak256(toUtf8Bytes(t));
      log("DuelId derived", { key: t, duelId: h });
      return h;
    };

    async function connect() {
      try {
        log("Connect", "start");
        if (!window.ethereum) throw new Error("MetaMask not installed");

        provider = provider || new BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        log("Accounts", accounts);

        signer = signer || await provider.getSigner();
        address = address || await signer.getAddress();
        log("Address", address);

        contract = contract || new Contract(getAddress(CONFIG.CONTRACT_ADDRESS), ABI, signer);
        log("Contract", CONFIG.CONTRACT_ADDRESS);

        $("#btnConnect").textContent = address.slice(0, 6) + "…" + address.slice(-4);

        if (!relayer) {
          await initSDK();
          relayer = await createInstance({
            ...SepoliaConfig,
            relayerUrl: CONFIG.RELAYER_URL,
            gatewayUrl: CONFIG.GATEWAY_URL,
            network: window.ethereum,
            debug: true
          });
          log("Relayer", "instance created");
        }

        log("Connect", "done");
        return true;
      } catch (e) {
        logError("Connect", e);
        setStatus("#createStatus", "Wallet/relayer connection failed", "error");
        return false;
      }
    }

    $("#btnConnect").onclick = connect;

    async function encryptEuint16(value) {
      if (!relayer) throw new Error("Relayer not initialized");
      if (!address) throw new Error("No wallet address");

      log("EncryptEuint16", { value });

      const enc = relayer.createEncryptedInput(
        getAddress(CONFIG.CONTRACT_ADDRESS),
        getAddress(address)
      );

      enc.add16(BigInt(value));

      const { handles, inputProof } = await enc.encrypt();
      log("Encrypt result", { handleCount: handles.length, type0: typeof handles[0] });

      const hRaw = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
      const handle = typeof hRaw === "string" ? hRaw : toHex(hRaw);

      const att = typeof inputProof === "string"
        ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof)
        : toHex(inputProof);

      log("EncryptEuint16 final", { handle, attLen: att.length });
      return { handle, attestation: att };
    }

    // 1) submitCorrect
    $("#btnCreateDuel").onclick = async () => {
      try {
        log("CreateDuel", "click");
        if (!(await connect())) return;

        clearStatus("#createStatus");
        $("#createLog").style.display = "none";

        const duelKey = $("#duelKey").value;
        const correct = parseInt($("#correctAnswer").value, 10) || 0;
        const duelId = toDuelId(duelKey);

        setStatus("#createStatus", "Encrypting correct answer…", "pending");
        const { handle, attestation } = await encryptEuint16(correct);

        log("submitCorrect args", { duelId, handle, attLen: attestation.length });

        setStatus("#createStatus", "Submitting submitCorrect tx…", "pending");
        const tx = await contract.submitCorrect(duelId, handle, attestation);
        log("Tx submitCorrect sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx submitCorrect receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        $("#createLog").textContent =
          `Duel created
duelKey: ${duelKey}
duelId: ${duelId}
correctAnswer: ${correct}
encHandle: ${handle}`;
        $("#createLog").style.display = "block";

        setStatus("#createStatus", "Duel created successfully", "success");
      } catch (e) {
        logError("CreateDuel", e);
        setStatus("#createStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // 2) guesses
    async function submitGuess(playerIndex) {
      const statusId = "#guessStatus";
      try {
        log(`SubmitGuess${playerIndex}`, "start");
        if (!(await connect())) return;

        clearStatus(statusId);
        $("#guessLog").style.display = "none";

        const duelKey = $("#guessDuelKey").value;
        const duelId = toDuelId(duelKey);
        const guessVal =
          playerIndex === 1
            ? parseInt($("#guess1").value, 10) || 0
            : parseInt($("#guess2").value, 10) || 0;

        setStatus(statusId, `Encrypting guess for player ${playerIndex}…`, "pending");
        const { handle, attestation } = await encryptEuint16(guessVal);

        const fn = playerIndex === 1 ? contract.submitGuess1 : contract.submitGuess2;

        log("SubmitGuess args", { duelId, playerIndex, guessVal, handle, attLen: attestation.length });

        setStatus(statusId, `Submitting submitGuess${playerIndex} tx…`, "pending");
        const tx = await fn(duelId, handle, attestation);
        log(`Tx submitGuess${playerIndex} sent`, tx.hash);
        const receipt = await tx.wait();
        log(`Tx submitGuess${playerIndex} receipt`, { blockNumber: receipt.blockNumber, status: receipt.status });

        $("#guessLog").textContent =
          `Guess submitted for player ${playerIndex}
duelKey: ${duelKey}
duelId: ${duelId}
guess: ${guessVal}
encHandle: ${handle}`;
        $("#guessLog").style.display = "block";

        setStatus(statusId, `Guess submitted for player ${playerIndex}`, "success");
      } catch (e) {
        logError(`SubmitGuess${playerIndex}`, e);
        setStatus(statusId, "Error: " + (e.message || String(e)), "error");
      }
    }

    $("#btnSubmitGuess1").onclick = () => submitGuess(1);
    $("#btnSubmitGuess2").onclick = () => submitGuess(2);

    // 3) computeWinner
    $("#btnComputeWinner").onclick = async () => {
      try {
        log("ComputeWinner", "click");
        if (!(await connect())) return;

        clearStatus("#winnerStatus");
        $("#winnerHandleOutput").style.display = "none";

        const duelKey = $("#winnerDuelKey").value;
        const duelId = toDuelId(duelKey);
        const zeroVal = 0;

        setStatus("#winnerStatus", "Encrypting zero value…", "pending");
        const { handle: encZero, attestation } = await encryptEuint16(zeroVal);

        log("ComputeWinner args", { duelId, encZero, attLen: attestation.length });

        setStatus("#winnerStatus", "Submitting computeWinner tx…", "pending");
        const tx = await contract.computeWinner(duelId, encZero, attestation);
        log("Tx computeWinner sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx computeWinner receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        setStatus("#winnerStatus", "Winner computed, fetching handle…", "pending");
        const handle = await contract.winnerHandle(duelId);
        log("winnerHandle()", handle);

        $("#winnerHandleOutput").textContent = "Winner Handle:\n" + handle;
        $("#winnerHandleOutput").style.display = "block";

        $("#decryptDuelKey").value = duelKey;
        $("#handleOutput").textContent = "Winner Handle:\n" + handle;
        $("#handleOutput").style.display = "block";

        setStatus("#winnerStatus", "Winner handle stored", "success");
      } catch (e) {
        logError("ComputeWinner", e);
        setStatus("#winnerStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // 4) make public + get handle
    $("#btnMakePublic").onclick = async () => {
      try {
        log("MakePublic", "click");
        if (!(await connect())) return;

        clearStatus("#decryptStatus");

        const duelKey = $("#decryptDuelKey").value;
        const duelId = toDuelId(duelKey);

        setStatus("#decryptStatus", "Submitting makeWinnerPublic tx…", "pending");
        const tx = await contract.makeWinnerPublic(duelId);
        log("Tx makeWinnerPublic sent", tx.hash);
        const receipt = await tx.wait();
        log("Tx makeWinnerPublic receipt", { blockNumber: receipt.blockNumber, status: receipt.status });

        setStatus("#decryptStatus", "Winner is now public", "success");
      } catch (e) {
        logError("MakePublic", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    $("#btnGetHandle").onclick = async () => {
      try {
        log("GetHandle", "click");
        if (!(await connect())) return;

        clearStatus("#decryptStatus");
        $("#handleOutput").style.display = "none";

        const duelKey = $("#decryptDuelKey").value;
        const duelId = toDuelId(duelKey);

        setStatus("#decryptStatus", "Fetching winner handle…", "pending");
        const handle = await contract.winnerHandle(duelId);
        log("winnerHandle()", handle);

        $("#handleOutput").textContent = "Winner Handle:\n" + handle;
        $("#handleOutput").style.display = "block";

        setStatus("#decryptStatus", "Handle retrieved", "success");
      } catch (e) {
        logError("GetHandle", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    // decrypt
    function cleanHandle(raw) {
      return String(raw).trim().split("\n").pop().trim();
    }

    async function decryptWinner(handleHex) {
      if (!relayer) throw new Error("Relayer not initialized");

      const handle = String(handleHex).trim();
      if (!handle.startsWith("0x") || handle.length !== 66)
        throw new Error("Invalid ciphertext handle");

      const request = [handle];
      const out = await relayer.publicDecrypt(request);

      if (!out || typeof out !== "object" || !out.clearValues)
        throw new Error("Invalid decrypt response");

      const lower = handle.toLowerCase();
      const result = out.clearValues[handle] ?? out.clearValues[lower];

      if (result === undefined || result === null)
        throw new Error("Decrypt produced no value");

      return Number(result); // 0/1/2
    }

    $("#btnDecryptWinner").onclick = async () => {
      try {
        await connect();
        clearStatus("#decryptStatus");

        const raw = $("#handleOutput").textContent || $("#winnerHandleOutput").textContent;
        const handle = cleanHandle(raw);

        const code = await decryptWinner(handle);

        const resultDiv = $("#winnerResult");
        resultDiv.style.display = "block";

        if (code === 0) {
          resultDiv.className = "result-box tie";
          resultDiv.textContent = "Result: Tie (0). Both players are equally close.";
        } else if (code === 1) {
          resultDiv.className = "result-box p1";
          resultDiv.textContent = "Result: Player 1 wins (1). Player 1 is closer to the correct answer.";
        } else if (code === 2) {
          resultDiv.className = "result-box p2";
          resultDiv.textContent = "Result: Player 2 wins (2). Player 2 is closer to the correct answer.";
        } else {
          resultDiv.className = "result-box";
          resultDiv.textContent = "Unexpected winner code: " + code;
        }

        setStatus("#decryptStatus", "✅ Winner decrypted", "success");
      } catch (e) {
        logError("DecryptWinner", e);
        setStatus("#decryptStatus", "Error: " + (e.message || String(e)), "error");
      }
    };

    log("Script", "✅ All handlers attached and ready");
  