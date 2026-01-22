    // Relayer SDK + ethers imports (CDN)
    import { initSDK, createInstance, SepoliaConfig } from "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js";
    import { BrowserProvider, Contract, getAddress } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

    // CONFIG
    const CONTRACT_ADDRESS = "0xF71aB6dCfC694F5620420BeFA837e182C202dD12";
    const RELAYER_URL = "https://relayer.testnet.zama.org"; // adjust if needed
    const GATEWAY_URL = "https://gateway.testnet.zama.org";

    // Minimal ABI for our contract (only used functions/events)
    const ABI = [
      "event ClientSubmitted(uint256 indexed clientId, address indexed owner)",
      "function submitClient(bytes32,bytes32,bytes) external returns (uint256)",
      "function computeFilter(uint256,bytes32,bytes) external returns (bytes32)",
      "function makeFilterPublic(uint256) external",
      "function filterHandle(uint256) external view returns (bytes32)",
      "function clientExists(uint256) external view returns (bool)",
      "function clientOwner(uint256) external view returns (address)"
    ];

    // DOM helpers
    const $ = (s) => document.querySelector(s);
    const log = (t, d) => console.log(`[${t}]`, d);
    const logErr = (t, d) => console.error(`[${t}]`, d);

    // Elements
    const btnConnect = $('#btnConnect');
    const btnSubmit = $('#btnSubmitClient');
    const btnClear = $('#btnClear');
    const submitStatus = $('#submitStatus');
    const clientInfo = $('#clientInfo');

    const btnCompute = $('#btnCompute');
    const computeStatus = $('#computeStatus');
    const handleOutput = $('#handleOutput');
    const btnGetHandle = $('#btnGetHandle');

    const btnMakePublic = $('#btnMakePublic');
    const btnDecrypt = $('#btnDecrypt');
    const decryptStatus = $('#decryptStatus');
    const decryptResult = $('#decryptResult');

    // State
    let provider, signer, address, contract, relayer;

    function setStatus(el, msg, ok=true){
      el.style.display = 'block';
      el.textContent = msg;
      el.className = 'status ' + (ok? 'ok' : 'err');
      log('Status', msg);
    }
    function clearStatus(el){ el.style.display='none'; }

    // Connect wallet & init relayer
    async function connect(){
      try{
        log('connect','starting');
        if (!window.ethereum) throw new Error('No Web3 provider found (MetaMask)');
        provider = new BrowserProvider(window.ethereum);
        await provider.send('eth_requestAccounts', []);
        signer = await provider.getSigner();
        address = await signer.getAddress();
        log('address', address);
        btnConnect.textContent = address.slice(0,6) + '…' + address.slice(-4);

        contract = new Contract(getAddress(CONTRACT_ADDRESS), ABI, signer);
        log('contract', CONTRACT_ADDRESS);

        if (!relayer){
          await initSDK();
          relayer = await createInstance({
            ...SepoliaConfig,
            relayerUrl: RELAYER_URL,
            gatewayUrl: GATEWAY_URL,
            network: window.ethereum,
            debug: true
          });
          log('relayer','initialized');
        }

        setStatus(submitStatus, 'Wallet connected', true);
        return true;
      }catch(e){
        logErr('connect', e);
        setStatus(submitStatus, 'Connection failed: '+ (e.message||e), false);
        return false;
      }
    }

    btnConnect.onclick = connect;

    // Submit encrypted client profile (single-user simple flow)
    btnSubmit.onclick = async () => {
      try{
        log('submitClient','start');
        if (!await connect()) return;
        setStatus(submitStatus, 'Encrypting inputs…');

        const isCorp = Number($('#isCorporate').value) === 1 ? true : false;
        const turnover = BigInt(Number($('#turnover').value || 0));

        log('values',{isCorp,turnover:turnover.toString()});

        // create encrypted input
        const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(address));
        // add bool and uint64
        enc.addBool(isCorp);
        enc.add64(turnover);

        const { handles, inputProof } = await enc.encrypt();
        log('encrypt result',{handles,inputProof});

        // Normalize handles and proof
        const h0 = typeof handles[0] === 'string' ? handles[0] : (handles[0]?.handle||handles[0]?.ciphertext||arrayToHex(handles[0]));
        const h1 = typeof handles[1] === 'string' ? handles[1] : (handles[1]?.handle||handles[1]?.ciphertext||arrayToHex(handles[1]));
        const proof = typeof inputProof === 'string' ? (inputProof.startsWith('0x')?inputProof:'0x'+inputProof) : arrayToHex(inputProof);

        log('normalized',{h0,h1,proof});
        setStatus(submitStatus,'Submitting transaction…');

        // call contract: submitClient(externalEbool, externalEuint64, bytes)
        const tx = await contract.submitClient(h0, h1, proof);
        log('txSent',tx.hash);
        const receipt = await tx.wait();
        log('txReceipt', receipt);

        // parse event to extract clientId
        let clientId = null;
        try{
          for(const logEntry of receipt.logs){
            try{
              const parsed = contract.interface.parseLog(logEntry);
              if (parsed && parsed.name === 'ClientSubmitted'){
                clientId = parsed.args.clientId.toString();
                break;
              }
            }catch(_){ /* ignore */ }
          }
        }catch(e){ logErr('parseEvent', e); }

        if (!clientId) clientId = '1';

        clientInfo.style.display = 'block';
        clientInfo.textContent = `Client ID: ${clientId}\nOwner: ${address}\nHandles:\n  isCorporate: ${h0}\n  turnover: ${h1}`;

        setStatus(submitStatus, 'Client submitted. ID: '+clientId, true);
        $('#clientIdCompute').value = clientId;
        $('#clientIdDecrypt').value = clientId;
        log('submitClient','done');
      }catch(e){
        logErr('submitClient', e);
        setStatus(submitStatus, 'Submit failed: '+(e.message||e), false);
      }
    };

    btnClear.onclick = () => {
      $('#isCorporate').value = '1';
      $('#turnover').value = '100000';
      clientInfo.style.display = 'none';
      clearStatus(submitStatus);
    };

    // Compute filter: encrypt threshold and call computeFilter
    btnCompute.onclick = async () => {
      try{
        log('compute','start');
        if (!await connect()) return;
        setStatus(computeStatus, 'Verifying client…');

        const clientId = Number($('#clientIdCompute').value);
        const threshold = BigInt(Number($('#threshold').value || 0));

        const exists = await contract.clientExists(clientId);
        if (!exists) throw new Error('Client does not exist onchain');

        setStatus(computeStatus, 'Encrypting threshold…');
        const enc = relayer.createEncryptedInput(getAddress(CONTRACT_ADDRESS), getAddress(address));
        enc.add64(threshold);
        const { handles, inputProof } = await enc.encrypt();

        const thrHandle = typeof handles[0] === 'string' ? handles[0] : (handles[0]?.handle||handles[0]?.ciphertext||arrayToHex(handles[0]));
        const proof = typeof inputProof === 'string' ? (inputProof.startsWith('0x')?inputProof:'0x'+inputProof) : arrayToHex(inputProof);

        log('thresholdNormalized',{thrHandle,proof});
        setStatus(computeStatus, 'Calling contract.computeFilter…');

        const tx = await contract.computeFilter(clientId, thrHandle, proof);
        log('txSent', tx.hash);
        const receipt = await tx.wait();
        log('txReceipt', receipt);

        // After compute, call filterHandle to get bytes32 handle
        const handle = await contract.filterHandle(clientId);
        log('filterHandle', handle);

        handleOutput.style.display = 'block';
        handleOutput.textContent = handle;
        setStatus(computeStatus, 'Filter computed. Handle retrieved.', true);
      }catch(e){
        logErr('compute', e);
        setStatus(computeStatus, 'Compute failed: '+(e.message||e), false);
      }
    };

    // Get existing handle
    btnGetHandle.onclick = async () => {
      try{
        if (!await connect()) return;
        const cid = Number($('#clientIdCompute').value);
        const hv = await contract.filterHandle(cid);
        handleOutput.style.display = 'block';
        handleOutput.textContent = hv;
        setStatus(computeStatus, 'Handle loaded', true);
        $('#manualHandle').value = hv;
      }catch(e){ logErr('getHandle', e); setStatus(computeStatus, 'Get handle failed: '+(e.message||e), false); }
    };

    // Make public (owner-only)
    btnMakePublic.onclick = async () => {
      try{
        if (!await connect()) return;
        const cid = Number($('#clientIdDecrypt').value);
        setStatus(decryptStatus, 'Sending makeFilterPublic tx…');
        const tx = await contract.makeFilterPublic(cid);
        log('makePublic tx', tx.hash);
        const receipt = await tx.wait();
        log('makePublic receipt', receipt);
        setStatus(decryptStatus, 'Filter marked public (decryptable)', true);
      }catch(e){ logErr('makePublic', e); setStatus(decryptStatus, 'Make public failed: '+(e.message||e), false); }
    };

    // Decrypt public handle using relayer.publicDecrypt([bytes32]) and new format
    btnDecrypt.onclick = async () => {
      try{
        if (!await connect()) return;
        let handle = $('#manualHandle').value.trim();
        if (!handle){
          handle = handleOutput.textContent.trim();
        }
        handle = handle.split('\n').pop().trim();
        log('decrypt','raw handle', handle);

        if (!handle.startsWith('0x') || handle.length !== 66) throw new Error('Handle must be bytes32');

        setStatus(decryptStatus, 'Requesting public decrypt…');
        // MUST send array of bytes32
        const out = await relayer.publicDecrypt([handle]);
        log('publicDecrypt out', out);

        if (!out || typeof out !== 'object' || !out.clearValues) {
          throw new Error('Unexpected decrypt response format');
        }

        const lower = handle.toLowerCase();
        const value = out.clearValues[handle] ?? out.clearValues[lower];
        if (value === undefined) throw new Error('No clear value returned for this handle');

        log('clearValue', value);
        decryptResult.style.display = 'block';
        decryptResult.textContent = `Clear value: ${value} — (${Number(value)===1? 'MATCH' : 'NO MATCH'})`;
        setStatus(decryptStatus, 'Decryption complete', true);
      }catch(e){ logErr('decrypt', e); setStatus(decryptStatus, 'Decrypt failed: '+(e.message||e), false); }
    };

    // helper to convert Uint8Array to 0x hex
    function arrayToHex(a){
      if (!a) return '0x';
      if (typeof a === 'string') return a;
      try{
        return '0x' + Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join('');
      }catch(e){ return String(a); }
    }

    log('script','ready');