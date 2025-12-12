// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHE */
import { FHE, ebool, euint8, euint16, externalEuint8, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ProbabilityTwistWheel (Zama FHEVM)
/// @notice Player submits encrypted "risk stake" (0..100). Off-chain relayer provides
///         an encrypted random number (0..99) via external input. Contract computes
///         win/lose + win type (0=lose,1=small win,2=big win) homomorphically and
///         stores encrypted result handle (bytes32) for player retrieval.
contract ProbabilityTwistWheel is ZamaEthereumConfig {

    struct EncStake {
        euint8 value;
        bool exists;
        address owner;
    }

    mapping(address => EncStake) private stakes;
    mapping(address => euint8) private outcomeCode; // 0..2
    mapping(address => bool) private outcomeExists;

    event StakeSubmitted(address indexed player);
    event OutcomeComputed(address indexed player, bytes32 handle);
    event OutcomeMadePublic(address indexed player, bytes32 handle);

    constructor() {}

    /// @notice Player submits encrypted stake (0..100) — externalEuint8 + attestation
    function submitStake(
        externalEuint8 encStake,
        bytes calldata attestation
    ) external {
        euint8 s = FHE.fromExternal(encStake, attestation);

        stakes[msg.sender] = EncStake({
            value: s,
            exists: true,
            owner: msg.sender
        });

        // allow player and contract to access stake
        FHE.allow(stakes[msg.sender].value, msg.sender);
        FHE.allowThis(stakes[msg.sender].value);

        emit StakeSubmitted(msg.sender);
    }

    /// @notice Compute outcome given an external encrypted random number (0..99).
    /// @param player - player address for whom we compute outcome (use msg.sender or other)
    /// @param encRand external encrypted random uint16 (0..99)
    /// @param attestation attestation for encRand
    /// @return bytes32 handle to encrypted outcome code (0..2)
    function computeOutcome(
        address player,
        externalEuint16 encRand,
        bytes calldata attestation
    ) external returns (bytes32) {
        require(stakes[player].exists, "no stake for player");

        euint8 s = stakes[player].value; // 0..100

        // Convert stake to a probability percentage (0..100)
        // euint8 → euint16 cast:
        euint16 prob = FHE.asEuint16(s);


        // read external random number (0..99) as euint16
        euint16 rand = FHE.fromExternal(encRand, attestation); // 0..99

        // Compare rand < prob  => win
        ebool isWin = FHE.lt(rand, prob); // true if random < probability%

        // Distinguish small win vs big win:
        // big win if rand < prob / 4  (i.e., top 25% of win region)
        // We'll compute quartile threshold: q = prob / 4
        // Note: integer division
        euint16 four = FHE.asEuint16(4);
        // Convert stake to probability (0..100)
// euint16 prob = FHE.asEuint16(s);

// Compute q = prob / 4 via right-shift
euint16 q = FHE.shr(prob, FHE.asEuint8(2));


        ebool isBig = FHE.lt(rand, q); // big if rand < q

        // Compose outcome code: 0 = lose, 1 = small win, 2 = big win
        euint8 zero = FHE.asEuint8(0);
        euint8 small = FHE.asEuint8(1);
        euint8 big = FHE.asEuint8(2);

        // if isWin then (if isBig then 2 else 1) else 0
        euint8 winIfBig = FHE.select(isBig, big, small);
        euint8 finalCode = FHE.select(isWin, winIfBig, zero);

        outcomeCode[player] = finalCode;
        outcomeExists[player] = true;

        // allow player and this contract to access the outcome
        FHE.allow(outcomeCode[player], player);
        FHE.allowThis(outcomeCode[player]);

        bytes32 handle = FHE.toBytes32(outcomeCode[player]);
        emit OutcomeComputed(player, handle);
        return handle;
    }

    /// @notice Player allows public decryption of their outcome
    function makeOutcomePublic() external {
        require(outcomeExists[msg.sender], "no outcome");
        FHE.makePubliclyDecryptable(outcomeCode[msg.sender]);
        emit OutcomeMadePublic(msg.sender, FHE.toBytes32(outcomeCode[msg.sender]));
    }

    /// @notice Return bytes32 handle for player's outcome
    function outcomeHandle(address player) external view returns (bytes32) {
        require(outcomeExists[player], "no outcome");
        return FHE.toBytes32(outcomeCode[player]);
    }

    function hasOutcome(address player) external view returns (bool) {
        return outcomeExists[player];
    }
}
