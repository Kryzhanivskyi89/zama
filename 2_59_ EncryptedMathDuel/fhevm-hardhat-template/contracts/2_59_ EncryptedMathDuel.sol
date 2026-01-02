// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import {
    FHE,
    ebool,
    euint8,
    euint16,
    externalEuint16
} from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title EncryptedMathDuel
/// @notice Two players encrypt their results; the contract decides who is closer
///         to the encrypted correct answer and stores only an encrypted winner code:
///         0 = tie, 1 = player 1 wins, 2 = player 2 wins.
contract EncryptedMathDuel is ZamaEthereumConfig {

    struct Duel {
        // encrypted correct answer
        euint16 correctAnswer;
        bool hasCorrectAnswer;

        // encrypted guesses
        euint16 guess1;
        bool hasGuess1;
        euint16 guess2;
        bool hasGuess2;

        // encrypted winner code (0,1,2)
        euint8 winnerCode;
        bool winnerComputed;
        bool winnerMadePublic;

        address owner;
    }

    // duelId -> duel
    mapping(bytes32 => Duel) private duels;

    // duelId -> winner handle (bytes32)
    mapping(bytes32 => bytes32) private winnerHandles;

    event DuelCreated(bytes32 indexed duelId, address indexed owner);
    event GuessSubmitted(bytes32 indexed duelId, uint8 indexed player);
    event WinnerComputed(bytes32 indexed duelId, bytes32 winnerHandle);
    event WinnerMadePublic(bytes32 indexed duelId, bytes32 winnerHandle);

    constructor() {}

    /// @notice Submit encrypted correct answer for a duel (creates duel).
    /// @param duelId keccak256("duel-1") or similar
    /// @param encCorrect encrypted correct answer as externalEuint16
    /// @param attestation relayer attestation for encCorrect
    function submitCorrect(
        bytes32 duelId,
        externalEuint16 encCorrect,
        bytes calldata attestation
    ) external {
        Duel storage d = duels[duelId];
        require(!d.hasCorrectAnswer, "duel already exists");

        euint16 corr = FHE.fromExternal(encCorrect, attestation);

        d.correctAnswer = corr;
        d.hasCorrectAnswer = true;
        d.owner = msg.sender;

        // Allow the owner and this contract to use the value
        FHE.allow(d.correctAnswer, msg.sender);
        FHE.allowThis(d.correctAnswer);

        emit DuelCreated(duelId, msg.sender);
    }

    /// @notice Submit encrypted guess for player 1.
    function submitGuess1(
        bytes32 duelId,
        externalEuint16 encGuess,
        bytes calldata attestation
    ) external {
        Duel storage d = duels[duelId];
        require(d.hasCorrectAnswer, "duel not created");
        require(!d.hasGuess1, "guess1 already set");
        require(!d.winnerComputed, "winner already computed");

        euint16 g1 = FHE.fromExternal(encGuess, attestation);
        d.guess1 = g1;
        d.hasGuess1 = true;

        FHE.allow(d.guess1, msg.sender);
        FHE.allowThis(d.guess1);

        emit GuessSubmitted(duelId, 1);
    }

    /// @notice Submit encrypted guess for player 2.
    function submitGuess2(
        bytes32 duelId,
        externalEuint16 encGuess,
        bytes calldata attestation
    ) external {
        Duel storage d = duels[duelId];
        require(d.hasCorrectAnswer, "duel not created");
        require(!d.hasGuess2, "guess2 already set");
        require(!d.winnerComputed, "winner already computed");

        euint16 g2 = FHE.fromExternal(encGuess, attestation);
        d.guess2 = g2;
        d.hasGuess2 = true;

        FHE.allow(d.guess2, msg.sender);
        FHE.allowThis(d.guess2);

        emit GuessSubmitted(duelId, 2);
    }

    /// @notice Compute encrypted winner code:
    ///         0 = tie, 1 = player1 closer, 2 = player2 closer.
    /// @param duelId duel identifier
    /// @param encZero encrypted 0 as externalEuint16 (used as base for euint8)
    /// @param attestation relayer attestation for encZero
    function computeWinner(
        bytes32 duelId,
        externalEuint16 encZero,
        bytes calldata attestation
    ) external returns (bytes32) {
        Duel storage d = duels[duelId];
        require(d.hasCorrectAnswer, "duel not created");
        require(d.hasGuess1 && d.hasGuess2, "both guesses required");
        require(!d.winnerComputed, "winner already computed");

        // encrypted 0 as euint16
        euint16 zero16 = FHE.fromExternal(encZero, attestation);

        // diff1 = |guess1 - correct|
        ebool g1_ge = FHE.ge(d.guess1, d.correctAnswer);
        euint16 g1_minus_corr = FHE.sub(d.guess1, d.correctAnswer);
        euint16 corr_minus_g1 = FHE.sub(d.correctAnswer, d.guess1);
        euint16 diff1 = FHE.select(g1_ge, g1_minus_corr, corr_minus_g1);

        // diff2 = |guess2 - correct|
        ebool g2_ge = FHE.ge(d.guess2, d.correctAnswer);
        euint16 g2_minus_corr = FHE.sub(d.guess2, d.correctAnswer);
        euint16 corr_minus_g2 = FHE.sub(d.correctAnswer, d.guess2);
        euint16 diff2 = FHE.select(g2_ge, g2_minus_corr, corr_minus_g2);

        // compare diffs
        ebool p1_better = FHE.lt(diff1, diff2);
        ebool p2_better = FHE.lt(diff2, diff1);

        // winner = 0 (tie) by default
        euint8 zero8 = FHE.asEuint8(zero16);
        euint8 one8 = FHE.add(zero8, FHE.asEuint8(1));
        euint8 two8 = FHE.add(zero8, FHE.asEuint8(2));

        euint8 winner = zero8;                         // 0
        winner = FHE.select(p1_better, one8, winner);  // if p1 closer -> 1
        winner = FHE.select(p2_better, two8, winner);  // if p2 closer -> 2

        d.winnerCode = winner;
        d.winnerComputed = true;

        // allow owner and this contract to decrypt / make public
        if (d.owner != address(0)) {
            FHE.allow(d.winnerCode, d.owner);
        }
        FHE.allowThis(d.winnerCode);

        bytes32 handle = FHE.toBytes32(d.winnerCode);
        winnerHandles[duelId] = handle;

        emit WinnerComputed(duelId, handle);
        return handle;
    }

    /// @notice Mark encrypted winner code as publicly decryptable.
    function makeWinnerPublic(bytes32 duelId) external {
        Duel storage d = duels[duelId];
        require(d.winnerComputed, "winner not computed");
        require(!d.winnerMadePublic, "already public");
        require(msg.sender == d.owner, "not authorized");

        FHE.makePubliclyDecryptable(d.winnerCode);
        d.winnerMadePublic = true;

        bytes32 handle = FHE.toBytes32(d.winnerCode);
        emit WinnerMadePublic(duelId, handle);
    }

    /// @notice Return bytes32 handle for encrypted winner code.
    function winnerHandle(bytes32 duelId) external view returns (bytes32) {
        require(duels[duelId].winnerComputed, "winner not computed");
        return FHE.toBytes32(duels[duelId].winnerCode);
    }

    function duelExists(bytes32 duelId) external view returns (bool) {
        return duels[duelId].hasCorrectAnswer;
    }

    function winnerExists(bytes32 duelId) external view returns (bool) {
        return duels[duelId].winnerComputed;
    }

    function duelOwner(bytes32 duelId) external view returns (address) {
        return duels[duelId].owner;
    }
}
