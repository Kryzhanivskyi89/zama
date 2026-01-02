// import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
import {
  initSDK,
  createInstance,
  SepoliaConfig,
} from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";

import {
  BrowserProvider,
  Contract,
  getAddress,
  keccak256,
  toUtf8Bytes,
} from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

// const ORIGIN = window.location.origin;


const CONFIG = {
  RELAYER_URL: "https://relayer.testnet.zama.org",
  GATEWAY_URL: "https://gateway.testnet.zama.org",
  CONTRACT_ADDRESS: "0xedeFc33b81ff6002BB4827680A1b7613fB45Eb00",
};

const ABI = [
  // submit rating
  "function submitRating(bytes32 reviewId, bytes32 reviewerTag, bytes32 encRating, bytes attestation) external",

  // compute levels
  "function computeReviewLevel(bytes32 reviewId, bytes32 encHigh, bytes32 encMid, bytes attestation) external returns (bytes32)",
  "function computeTagLevel(bytes32 reviewerTag, bytes32 encHigh, bytes32 encMid, bytes attestation) external returns (bytes32)",
  "function computeTeamLevel(bytes32 encHigh, bytes32 encMid, bytes attestation) external returns (bytes32)",

  // make public
  "function makeReviewLevelPublic(bytes32 reviewId) external",
  "function makeTagLevelPublic(bytes32 reviewerTag) external",
  "function makeTeamLevelPublic() external",

  // handles
  "function reviewLevelHandle(bytes32 reviewId) external view returns (bytes32)",
  "function tagLevelHandle(bytes32 reviewerTag) external view returns (bytes32)",
  "function teamLevelHandle() external view returns (bytes32)",

  // exists helpers
  "function reviewAggregateExists(bytes32 reviewId) external view returns (bool)",
  "function tagAggregateExists(bytes32 reviewerTag) external view returns (bool)",
  "function teamAggregateExists() external view returns (bool)"
];


    let provider, signer, address, contract, relayer;
    const $ = s => document.querySelector(s);

    const log = (t,d) => console.log(`%c[${t}]`,"color:#38bdf8;font-weight:bold;",d);
    const logError = (t,e) => console.error(`%c[ERROR: ${t}]`,"color:#ef4444;font-weight:bold;",e);

    const toHex = u8 => "0x" + Array.from(u8, b => b.toString(16).padStart(2,"0")).join("");

    const setStatus = (id,msg,type="pending") => {
      const el = $(id);
      if (!el) return;
      el.textContent = msg;
      el.className = `status ${type}`;
      el.style.display = "inline-block";
      log(`Status ${id}`, msg);
    };

    const clearStatus = id => {
      const el = $(id);
      if (el) el.style.display = "none";
    };

    function cleanHandle(raw) {
      return String(raw).trim().split("\n").pop().trim();
    }

    function strToBytes32(str) {
      return keccak256(toUtf8Bytes(str));
    }

    async function connect() {
      try {
        log("Connect","Starting...");
        if (!window.ethereum) throw new Error("MetaMask not installed");

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
        }

      pushActivity(`Wallet connected: ${address.slice(0,6)}…${address.slice(-4)}`);
    return true;
  } catch (e) {
    logError("Connect", e);
    setStatus("#submitStatus","Wallet connection failed","error");
    pushActivity(`Wallet connection failed: ${e.message || e}`);
    return false;
  }
    }

    $("#btnConnect").onclick = connect;

    async function encrypt8(value) {
      if (!relayer) throw new Error("Relayer not initialized");

      const enc = relayer.createEncryptedInput(
        getAddress(CONFIG.CONTRACT_ADDRESS),
        getAddress(address)
      );
      enc.add8(BigInt(value));

      const { handles, inputProof } = await enc.encrypt();
      const raw = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
      const handle = typeof raw === "string" ? raw : toHex(raw);

      const attestation =
        typeof inputProof === "string"
          ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof)
          : toHex(inputProof);

      return { handle, attestation };
    }

    async function encrypt16Pair(v1, v2) {
      if (!relayer) throw new Error("Relayer not initialized");

      const enc = relayer.createEncryptedInput(
        getAddress(CONFIG.CONTRACT_ADDRESS),
        getAddress(address)
      );
      enc.add16(BigInt(v1));
      enc.add16(BigInt(v2));

      const { handles, inputProof } = await enc.encrypt();
      const raw1 = handles[0]?.handle || handles[0]?.ciphertext || handles[0];
      const raw2 = handles[1]?.handle || handles[1]?.ciphertext || handles[1];
      const h1 = typeof raw1 === "string" ? raw1 : toHex(raw1);
      const h2 = typeof raw2 === "string" ? raw2 : toHex(raw2);

      const attestation =
        typeof inputProof === "string"
          ? (inputProof.startsWith("0x") ? inputProof : "0x" + inputProof)
          : toHex(inputProof);

      return { h1, h2, attestation };
    }

    async function decryptLevel(rawHandle) {
      if (!relayer) throw new Error("Relayer not initialized");

      const handle = cleanHandle(rawHandle);
      const out = await relayer.publicDecrypt([handle]);
      const v =
        out.clearValues[handle] ??
        out.clearValues[handle.toLowerCase()];
      if (v === undefined) throw new Error("Decrypt produced no value");
      return Number(v); // 0,1,2
    }

    function renderLevelBadge(level, context) {
      let cls = "badge badge-2";
      let text = "2 · Needs attention";

      if (level === 0) {
        cls = "badge badge-0";
        text = "0 · Excellent";
      } else if (level === 1) {
        cls = "badge badge-1";
        text = "1 · OK";
      }

      return `
        <div class="pill" style="margin-bottom:8px;">
          <span style="opacity:.6;">${context}</span>
        </div>
        <div class="${cls}">${text}</div>
      `;
    }

    // ===== SUBMIT RATING =====
    $("#btnSubmitRating").onclick = async () => {
      try {
        if (!await connect()) return;

        clearStatus("#submitStatus");
        setStatus("#submitStatus","Encrypting rating…","pending");

        const reviewStr = $("#reviewIdInput").value || "PR-123";
        const tagStr = $("#reviewerTagInput").value || "anonymous";
        const rating = parseInt($("#ratingInput").value);

        if (rating < 1 || rating > 5) throw new Error("Rating must be in [1,5]");

        const reviewId = strToBytes32(reviewStr);
        const reviewerTag = strToBytes32(tagStr);

        const { handle, attestation } = await encrypt8(rating);

        setStatus("#submitStatus","Sending tx…","pending");
        const tx = await contract.submitRating(reviewId, reviewerTag, handle, attestation);
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#submitStatus","Encrypted rating submitted","success");
      incTotalRatings();
    pushActivity(`Encrypted rating ${rating}/5 for review "${reviewStr}" (tag "${tagStr}")`);
  } catch (e) {
    logError("SubmitRating", e);
    setStatus("#submitStatus","Error: " + (e.message || e),"error");
    pushActivity(`Submit rating failed: ${e.message || e}`);
  }
    };

    // ===== REVIEW LEVEL =====
    $("#btnComputeReviewLevel").onclick = async () => {
      try {
        if (!await connect()) return;

        clearStatus("#reviewLevelStatus");
        setStatus("#reviewLevelStatus","Preparing thresholds…","pending");

        const reviewStr = $("#reviewLevelIdInput").value || "PR-123";
        const reviewId = strToBytes32(reviewStr);

        const exists = await contract.reviewAggregateExists(reviewId);
        if (!exists) throw new Error("No aggregate for this review yet");

        const high = parseInt($("#reviewHighInput").value);
        const mid  = parseInt($("#reviewMidInput").value);

        const { h1, h2, attestation } = await encrypt16Pair(high, mid);

        setStatus("#reviewLevelStatus","Computing review level…","pending");
        const tx = await contract.computeReviewLevel(reviewId, h1, h2, attestation);
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("Transaction reverted");

        const handle = await contract.reviewLevelHandle(reviewId);
        $("#reviewLevelHandleOutput").textContent = "Review Level Handle:\n" + handle;
        $("#reviewLevelHandleOutput").style.display = "block";

        setStatus("#reviewLevelStatus","Review level computed","success");
      } catch (e) {
        logError("ComputeReviewLevel", e);
        setStatus("#reviewLevelStatus","Error: " + (e.message || e),"error");
      }
    };

    $("#btnMakeReviewLevelPublic").onclick = async () => {
      try {
        if (!await connect()) return;

        const reviewStr = $("#reviewLevelIdInput").value || "PR-123";
        const reviewId = strToBytes32(reviewStr);

        setStatus("#reviewLevelStatus","Making level public…","pending");
        const tx = await contract.makeReviewLevelPublic(reviewId);
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#reviewLevelStatus","Review level is public","success");
      } catch (e) {
        logError("MakeReviewLevelPublic", e);
        setStatus("#reviewLevelStatus","Error: " + (e.message || e),"error");
      }
    };

    $("#btnDecryptReviewLevel").onclick = async () => {
      try {
        if (!await connect()) return;

        const raw = $("#reviewLevelHandleOutput").textContent.trim();
        const handle = cleanHandle(raw);
        setStatus("#reviewLevelStatus","Decrypting…","pending");

        const lvl = await decryptLevel(handle);
        const reviewStr = $("#reviewLevelIdInput").value || "PR-123";

        const div = $("#reviewLevelResult");
        div.innerHTML = renderLevelBadge(lvl, `Review: "${reviewStr}"`);
        div.style.display = "block";

        setStatus("#reviewLevelStatus","Review level decrypted","success");
      updateSummary("review", lvl);
    pushHistory("review", reviewStr, lvl);
    pushActivity(`Decrypted review level ${lvl} for "${reviewStr}"`);
  } catch (e) {
    logError("DecryptReviewLevel", e);
    setStatus("#reviewLevelStatus","Error: " + (e.message || e),"error");
    pushActivity(`Decrypt review level failed: ${e.message || e}`);
  }
    };

    // ===== TAG LEVEL =====
    $("#btnComputeTagLevel").onclick = async () => {
      try {
        if (!await connect()) return;

        clearStatus("#tagLevelStatus");
        setStatus("#tagLevelStatus","Preparing thresholds…","pending");

        const tagStr = $("#tagLevelInput").value || "alice";
        const tagId = strToBytes32(tagStr);

        const exists = await contract.tagAggregateExists(tagId);
        if (!exists) throw new Error("No aggregate for this tag yet");

        const high = parseInt($("#tagHighInput").value);
        const mid  = parseInt($("#tagMidInput").value);

        const { h1, h2, attestation } = await encrypt16Pair(high, mid);

        setStatus("#tagLevelStatus","Computing tag level…","pending");
        const tx = await contract.computeTagLevel(tagId, h1, h2, attestation);
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("Transaction reverted");

        const handle = await contract.tagLevelHandle(tagId);
        $("#tagLevelHandleOutput").textContent = "Tag Level Handle:\n" + handle;
        $("#tagLevelHandleOutput").style.display = "block";

        setStatus("#tagLevelStatus","Tag level computed","success");
      } catch (e) {
        logError("ComputeTagLevel", e);
        setStatus("#tagLevelStatus","Error: " + (e.message || e),"error");
      }
    };

    $("#btnMakeTagLevelPublic").onclick = async () => {
      try {
        if (!await connect()) return;

        const tagStr = $("#tagLevelInput").value || "alice";
        const tagId = strToBytes32(tagStr);

        setStatus("#tagLevelStatus","Making tag level public…","pending");
        const tx = await contract.makeTagLevelPublic(tagId);
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#tagLevelStatus","Tag level is public","success");
      } catch (e) {
        logError("MakeTagLevelPublic", e);
        setStatus("#tagLevelStatus","Error: " + (e.message || e),"error");
      }
    };

    $("#btnDecryptTagLevel").onclick = async () => {
      try {
        if (!await connect()) return;

        const raw = $("#tagLevelHandleOutput").textContent.trim();
        const handle = cleanHandle(raw);
        setStatus("#tagLevelStatus","Decrypting…","pending");

        const lvl = await decryptLevel(handle);
        const tagStr = $("#tagLevelInput").value || "alice";

        const div = $("#tagLevelResult");
        div.innerHTML = renderLevelBadge(lvl, `Tag: "${tagStr}"`);
        div.style.display = "block";

        setStatus("#tagLevelStatus","Tag level decrypted","success");
      updateSummary("tag", lvl);
    pushHistory("tag", tagStr, lvl);
    pushActivity(`Decrypted tag level ${lvl} for tag "${tagStr}"`);
  } catch (e) {
    logError("DecryptTagLevel", e);
    setStatus("#tagLevelStatus","Error: " + (e.message || e),"error");
    pushActivity(`Decrypt tag level failed: ${e.message || e}`);
  }
    };

    // ===== TEAM LEVEL =====
    $("#btnComputeTeamLevel").onclick = async () => {
      try {
        if (!await connect()) return;

        clearStatus("#teamLevelStatus");
        setStatus("#teamLevelStatus","Preparing thresholds…","pending");

        const exists = await contract.teamAggregateExists();
        if (!exists) throw new Error("No team aggregate yet");

        const high = parseInt($("#teamHighInput").value);
        const mid  = parseInt($("#teamMidInput").value);

        const { h1, h2, attestation } = await encrypt16Pair(high, mid);

        setStatus("#teamLevelStatus","Computing team level…","pending");
        const tx = await contract.computeTeamLevel(h1, h2, attestation);
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("Transaction reverted");

        const handle = await contract.teamLevelHandle();
        $("#teamLevelHandleOutput").textContent = "Team Level Handle:\n" + handle;
        $("#teamLevelHandleOutput").style.display = "block";

        setStatus("#teamLevelStatus","Team level computed","success");
      } catch (e) {
        logError("ComputeTeamLevel", e);
        setStatus("#teamLevelStatus","Error: " + (e.message || e),"error");
      }
    };

    $("#btnMakeTeamLevelPublic").onclick = async () => {
      try {
        if (!await connect()) return;

        setStatus("#teamLevelStatus","Making team level public…","pending");
        const tx = await contract.makeTeamLevelPublic();
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("Transaction reverted");

        setStatus("#teamLevelStatus","Team level is public","success");
      } catch (e) {
        logError("MakeTeamLevelPublic", e);
        setStatus("#teamLevelStatus","Error: " + (e.message || e),"error");
      }
    };

    $("#btnDecryptTeamLevel").onclick = async () => {
      try {
        if (!await connect()) return;

        const raw = $("#teamLevelHandleOutput").textContent.trim();
        const handle = cleanHandle(raw);
        setStatus("#teamLevelStatus","Decrypting…","pending");

        const lvl = await decryptLevel(handle);

        const div = $("#teamLevelResult");
        div.innerHTML = renderLevelBadge(lvl, "Team health");
        div.style.display = "block";

        setStatus("#teamLevelStatus","Team level decrypted","success");
      updateSummary("team", lvl);
    pushHistory("team", "team", lvl);
    pushActivity(`Decrypted team level ${lvl}`);
  } catch (e) {
    logError("DecryptTeamLevel", e);
    setStatus("#teamLevelStatus","Error: " + (e.message || e),"error");
    pushActivity(`Decrypt team level failed: ${e.message || e}`);
  }
    };

    // ===== UI ENHANCEMENTS: SUMMARY + HISTORY + ACTIVITY LOG =====

// Local UI-only state (НЕ on-chain, тільки для UX)
const uiState = {
  totalRatings: 0,
  history: [],   // { type: "review" | "tag" | "team", id: string, level: number, ts: Date }
  maxHistory: 20
};

// DOM helpers
const $id = (id) => document.getElementById(id);

// Summary elements
const elSummaryTotal = $id("summaryTotalRatings");
const elSummaryReview = $id("summaryLastReviewLevel");
const elSummaryTag   = $id("summaryLastTagLevel");
const elSummaryTeam  = $id("summaryTeamLevel");

// History and activity log (додай у розмітку сам блок activityLog, див. далі)
const elHistoryBody = $id("historyBody");
const elActivityLog = $id("activityLog");

function formatLevelLabel(level) {
  if (level === 0) return "0 · Excellent";
  if (level === 1) return "1 · OK";
  if (level === 2) return "2 · Needs attention";
  return "—";
}

function levelClass(level) {
  if (level === 0) return "badge badge-0";
  if (level === 1) return "badge badge-1";
  if (level === 2) return "badge badge-2";
  return "badge";
}

// Update summary chips
function updateSummary(kind, level) {
  const label = formatLevelLabel(level);
  switch (kind) {
    case "review":
      if (elSummaryReview) elSummaryReview.textContent = label;
      break;
    case "tag":
      if (elSummaryTag) elSummaryTag.textContent = label;
      break;
    case "team":
      if (elSummaryTeam) elSummaryTeam.textContent = label;
      break;
  }
}

function incTotalRatings() {
  uiState.totalRatings += 1;
  if (elSummaryTotal) elSummaryTotal.textContent = String(uiState.totalRatings);
}

// Add new history row
function pushHistory(kind, id, level) {
  const now = new Date();
  uiState.history.unshift({
    type: kind,
    id,
    level,
    ts: now
  });
  if (uiState.history.length > uiState.maxHistory) {
    uiState.history.pop();
  }
  renderHistory();
}

// Render “chart” history
function renderHistory() {
  if (!elHistoryBody) return;
  elHistoryBody.innerHTML = "";

  uiState.history.forEach((item) => {
    const row = document.createElement("div");
    row.className = `history-row history-row-${item.level}`;

    const typeSpan = document.createElement("span");
    typeSpan.textContent =
      item.type === "review"
        ? "Review"
        : item.type === "tag"
        ? "Tag"
        : "Team";

    const idSpan = document.createElement("span");
    idSpan.textContent = item.id || "—";

    const levelSpan = document.createElement("span");
    levelSpan.className = levelClass(item.level);
    levelSpan.textContent = formatLevelLabel(item.level);

    const timeSpan = document.createElement("span");
    const hh = item.ts.getHours().toString().padStart(2, "0");
    const mm = item.ts.getMinutes().toString().padStart(2, "0");
    const ss = item.ts.getSeconds().toString().padStart(2, "0");
    timeSpan.textContent = `${hh}:${mm}:${ss}`;

    row.appendChild(typeSpan);
    row.appendChild(idSpan);
    row.appendChild(levelSpan);
    row.appendChild(timeSpan);

    elHistoryBody.appendChild(row);
  });
}

function pushActivity(message) {
  if (!elActivityLog) return;
  const row = document.createElement("div");
  row.className = "activity-entry";

  const time = new Date();
  const hh = time.getHours().toString().padStart(2, "0");
  const mm = time.getMinutes().toString().padStart(2, "0");
  const ss = time.getSeconds().toString().padStart(2, "0");

  const tsSpan = document.createElement("span");
  tsSpan.className = "activity-timestamp";
  tsSpan.textContent = `${hh}:${mm}:${ss}`;

  const msgSpan = document.createElement("span");
  msgSpan.className = "activity-message";
  msgSpan.textContent = message;

  row.appendChild(tsSpan);
  row.appendChild(msgSpan);

  // newest on top
  elActivityLog.prepend(row);

  // limit entries
  const max = 40;
  while (elActivityLog.children.length > max) {
    elActivityLog.removeChild(elActivityLog.lastChild);
  }
}
