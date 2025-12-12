// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/* Zama FHEVM */
import { FHE, ebool, euint16, externalEuint16 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AgeGatedNFT is ERC721, Ownable, ZamaEthereumConfig {

    uint16 public minAge;
    uint256 public nextTokenId;

    // store encrypted age verification result per user
    mapping(address => ebool) private ageVerification;
    mapping(address => bool) private ageVerificationExists;
    mapping(address => bool) private hasMinted;

    event AgeVerificationComputed(address indexed user, bytes32 verificationHandle);
    event AgeVerificationMadePublic(address indexed user);
    event NFTMinted(address indexed to, uint256 indexed tokenId);

    constructor(
        string memory name_,
        string memory symbol_,
        uint16 _minAge,
        address initialOwner
    ) ERC721(name_, symbol_) Ownable(initialOwner) {
        minAge = _minAge;
        nextTokenId = 1;
    }

    /* ============== Submit encrypted age and compute verification ============== */

    /// @notice Submit encrypted birth year and compute age verification
    function submitAgeVerification(
        externalEuint16 encBirthYear,
        bytes calldata attestation
    ) external returns (bytes32) {
        // require(!ageVerificationExists[msg.sender], "already verified");

        // 1) Decrypt external encrypted birth year
        euint16 birthYear = FHE.fromExternal(encBirthYear, attestation);

        // 2) Compute current year from block.timestamp
        uint16 currentYearPlain = uint16(1970 + (block.timestamp / 31556952));
        euint16 currentYear = FHE.asEuint16(currentYearPlain);

        // 3) Compute age = currentYear - birthYear (encrypted)
        euint16 ageEncrypted = FHE.sub(currentYear, birthYear);

        // 4) Create encrypted minAge constant
        euint16 minAgeEncrypted = FHE.asEuint16(minAge);

        // 5) Compute age >= minAge (returns ebool - encrypted boolean)
        ebool isAdultEncrypted = FHE.ge(ageEncrypted, minAgeEncrypted);

        // 6) Allow user and contract to access the result
        FHE.allow(isAdultEncrypted, msg.sender);
        FHE.allowThis(isAdultEncrypted);

        // 7) Store encrypted verification result
        ageVerification[msg.sender] = isAdultEncrypted;
        ageVerificationExists[msg.sender] = true;

        emit AgeVerificationComputed(msg.sender, FHE.toBytes32(isAdultEncrypted));

        // Return handle to encrypted boolean for frontend
        return FHE.toBytes32(isAdultEncrypted);
    }

    /* ============== Make verification publicly decryptable ============== */

    /// @notice Make age verification result publicly decryptable
    function makeAgeVerificationPublic() external {
        require(ageVerificationExists[msg.sender], "no verification computed");

        FHE.makePubliclyDecryptable(ageVerification[msg.sender]);

        emit AgeVerificationMadePublic(msg.sender);
    }

    /* ============== Mint NFT after verification ============== */

    /// @notice Mint NFT if age verification is public and true
    /// @param isAdult plaintext boolean (decrypted from public verification)
    function mintNFT(bool isAdult) external returns (uint256) {
        require(ageVerificationExists[msg.sender], "no age verification");
        // require(!hasMinted[msg.sender], "already minted");
        require(isAdult, "age verification failed");

        uint256 tokenId = nextTokenId++;
        hasMinted[msg.sender] = true;

        _safeMint(msg.sender, tokenId);

        emit NFTMinted(msg.sender, tokenId);

        return tokenId;
    }

    /* ============== Admin functions ============== */

    function setMinAge(uint16 _minAge) external onlyOwner {
        minAge = _minAge;
    }

    function getVerificationHandle(address user) external view returns (bytes32) {
        require(ageVerificationExists[user], "no verification");
        return FHE.toBytes32(ageVerification[user]);
    }

    function hasVerification(address user) external view returns (bool) {
        return ageVerificationExists[user];
    }

    function hasMintedAlready(address user) external view returns (bool) {
        return hasMinted[user];
    }
}
