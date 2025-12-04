// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DigitalInheritanceVaultFHE is SepoliaConfig {
    struct EncryptedAsset {
        uint256 id;
        address owner;
        euint32 encryptedAssetType;    // Encrypted asset type identifier
        euint32 encryptedAssetValue;    // Encrypted asset value
        euint32 encryptedAccessKey;     // Encrypted access key
        uint256 timestamp;
        bool isActive;
    }
    
    struct InheritanceInstruction {
        euint32 encryptedBeneficiary;   // Encrypted beneficiary identifier
        euint32 encryptedShare;          // Encrypted share percentage
        euint32 encryptedReleaseCondition; // Encrypted release condition code
    }
    
    struct DecryptedAsset {
        uint32 assetType;
        uint32 assetValue;
        uint32 accessKey;
        bool isRevealed;
    }

    uint256 public vaultCount;
    mapping(uint256 => EncryptedAsset) public encryptedAssets;
    mapping(uint256 => InheritanceInstruction[]) public inheritanceInstructions;
    mapping(uint256 => DecryptedAsset) public decryptedAssets;
    
    mapping(address => uint256[]) private ownerVaults;
    mapping(address => bool) private authorizedExecutors;
    
    mapping(uint256 => uint256) private requestToVaultId;
    
    event VaultCreated(uint256 indexed id, address indexed owner);
    event AssetAdded(uint256 indexed vaultId);
    event InstructionAdded(uint256 indexed vaultId, uint256 instructionId);
    event InheritanceExecuted(uint256 indexed vaultId);
    event AssetDecrypted(uint256 indexed vaultId);
    
    address public notary;
    
    modifier onlyNotary() {
        require(msg.sender == notary, "Not notary");
        _;
    }
    
    modifier onlyOwner(uint256 vaultId) {
        require(encryptedAssets[vaultId].owner == msg.sender, "Not owner");
        _;
    }
    
    constructor() {
        notary = msg.sender;
    }
    
    /// @notice Create a new inheritance vault
    function createVault() public {
        vaultCount += 1;
        uint256 newId = vaultCount;
        
        encryptedAssets[newId] = EncryptedAsset({
            id: newId,
            owner: msg.sender,
            encryptedAssetType: FHE.asEuint32(0),
            encryptedAssetValue: FHE.asEuint32(0),
            encryptedAccessKey: FHE.asEuint32(0),
            timestamp: block.timestamp,
            isActive: true
        });
        
        decryptedAssets[newId] = DecryptedAsset({
            assetType: 0,
            assetValue: 0,
            accessKey: 0,
            isRevealed: false
        });
        
        ownerVaults[msg.sender].push(newId);
        emit VaultCreated(newId, msg.sender);
    }
    
    /// @notice Add encrypted asset to vault
    function addEncryptedAsset(
        uint256 vaultId,
        euint32 encryptedAssetType,
        euint32 encryptedAssetValue,
        euint32 encryptedAccessKey
    ) public onlyOwner(vaultId) {
        EncryptedAsset storage asset = encryptedAssets[vaultId];
        require(asset.isActive, "Vault inactive");
        
        asset.encryptedAssetType = encryptedAssetType;
        asset.encryptedAssetValue = encryptedAssetValue;
        asset.encryptedAccessKey = encryptedAccessKey;
        
        emit AssetAdded(vaultId);
    }
    
    /// @notice Add inheritance instruction
    function addInheritanceInstruction(
        uint256 vaultId,
        euint32 encryptedBeneficiary,
        euint32 encryptedShare,
        euint32 encryptedReleaseCondition
    ) public onlyOwner(vaultId) {
        InheritanceInstruction memory instruction = InheritanceInstruction({
            encryptedBeneficiary: encryptedBeneficiary,
            encryptedShare: encryptedShare,
            encryptedReleaseCondition: encryptedReleaseCondition
        });
        
        inheritanceInstructions[vaultId].push(instruction);
        emit InstructionAdded(vaultId, inheritanceInstructions[vaultId].length - 1);
    }
    
    /// @notice Authorize inheritance executor
    function authorizeExecutor(address executor) public onlyNotary {
        authorizedExecutors[executor] = true;
    }
    
    /// @notice Execute inheritance distribution
    function executeInheritance(uint256 vaultId) public {
        require(authorizedExecutors[msg.sender], "Unauthorized executor");
        EncryptedAsset storage asset = encryptedAssets[vaultId];
        require(asset.isActive, "Vault inactive");
        
        // Verify release conditions
        for (uint i = 0; i < inheritanceInstructions[vaultId].length; i++) {
            InheritanceInstruction storage instruction = inheritanceInstructions[vaultId][i];
            ebool conditionMet = verifyReleaseCondition(instruction.encryptedReleaseCondition);
            require(FHE.decrypt(conditionMet), "Condition not met");
        }
        
        // Perform encrypted asset distribution
        distributeAssets(vaultId);
        
        asset.isActive = false;
        emit InheritanceExecuted(vaultId);
    }
    
    /// @notice Request asset decryption
    function requestAssetDecryption(uint256 vaultId) public {
        require(encryptedAssets[vaultId].owner == msg.sender, "Not owner");
        require(!decryptedAssets[vaultId].isRevealed, "Already decrypted");
        
        EncryptedAsset storage asset = encryptedAssets[vaultId];
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(asset.encryptedAssetType);
        ciphertexts[1] = FHE.toBytes32(asset.encryptedAssetValue);
        ciphertexts[2] = FHE.toBytes32(asset.encryptedAccessKey);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAssetData.selector);
        requestToVaultId[reqId] = vaultId;
    }
    
    /// @notice Process decrypted asset data
    function decryptAssetData(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 vaultId = requestToVaultId[requestId];
        require(vaultId != 0, "Invalid request");
        
        DecryptedAsset storage dAsset = decryptedAssets[vaultId];
        require(!dAsset.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 assetType, uint32 assetValue, uint32 accessKey) = 
            abi.decode(cleartexts, (uint32, uint32, uint32));
        
        dAsset.assetType = assetType;
        dAsset.assetValue = assetValue;
        dAsset.accessKey = accessKey;
        dAsset.isRevealed = true;
        
        emit AssetDecrypted(vaultId);
    }
    
    /// @notice Verify release condition (FHE version)
    function verifyReleaseCondition(euint32 encryptedCondition) private view returns (ebool) {
        // Example condition: time-based (current timestamp > condition timestamp)
        euint32 currentTime = FHE.asEuint32(uint32(block.timestamp));
        return FHE.gt(currentTime, encryptedCondition);
    }
    
    /// @notice Distribute encrypted assets to beneficiaries
    function distributeAssets(uint256 vaultId) private {
        EncryptedAsset storage asset = encryptedAssets[vaultId];
        InheritanceInstruction[] storage instructions = inheritanceInstructions[vaultId];
        
        for (uint i = 0; i < instructions.length; i++) {
            InheritanceInstruction storage instruction = instructions[i];
            
            // Calculate beneficiary share
            euint32 shareValue = FHE.div(
                FHE.mul(asset.encryptedAssetValue, instruction.encryptedShare),
                FHE.asEuint32(100)
            );
            
            // Transfer encrypted asset share to beneficiary
            // (In real implementation, this would trigger actual asset transfer)
        }
    }
    
    /// @notice Calculate total inheritance value
    function calculateTotalValue(uint256 vaultId) public view returns (euint32) {
        EncryptedAsset storage asset = encryptedAssets[vaultId];
        return asset.encryptedAssetValue;
    }
    
    /// @notice Verify beneficiary share percentage
    function verifySharePercentage(uint256 vaultId) public view returns (ebool) {
        InheritanceInstruction[] storage instructions = inheritanceInstructions[vaultId];
        euint32 totalShare = FHE.asEuint32(0);
        
        for (uint i = 0; i < instructions.length; i++) {
            totalShare = FHE.add(totalShare, instructions[i].encryptedShare);
        }
        
        return FHE.eq(totalShare, FHE.asEuint32(100));
    }
    
    /// @notice Get owner vaults
    function getOwnerVaults(address owner) public view returns (uint256[] memory) {
        return ownerVaults[owner];
    }
    
    /// @notice Get encrypted asset details
    function getEncryptedAsset(uint256 vaultId) public view returns (
        address owner,
        euint32 encryptedAssetType,
        euint32 encryptedAssetValue,
        euint32 encryptedAccessKey,
        bool isActive
    ) {
        EncryptedAsset storage asset = encryptedAssets[vaultId];
        return (
            asset.owner,
            asset.encryptedAssetType,
            asset.encryptedAssetValue,
            asset.encryptedAccessKey,
            asset.isActive
        );
    }
    
    /// @notice Get inheritance instructions
    function getInheritanceInstructions(uint256 vaultId) public view returns (
        euint32[] memory encryptedBeneficiaries,
        euint32[] memory encryptedShares,
        euint32[] memory encryptedConditions
    ) {
        InheritanceInstruction[] storage instructions = inheritanceInstructions[vaultId];
        uint256 count = instructions.length;
        
        euint32[] memory beneficiaries = new euint32[](count);
        euint32[] memory shares = new euint32[](count);
        euint32[] memory conditions = new euint32[](count);
        
        for (uint i = 0; i < count; i++) {
            beneficiaries[i] = instructions[i].encryptedBeneficiary;
            shares[i] = instructions[i].encryptedShare;
            conditions[i] = instructions[i].encryptedReleaseCondition;
        }
        
        return (beneficiaries, shares, conditions);
    }
    
    /// @notice Get decrypted asset details
    function getDecryptedAsset(uint256 vaultId) public view returns (
        uint32 assetType,
        uint32 assetValue,
        uint32 accessKey,
        bool isRevealed
    ) {
        DecryptedAsset storage asset = decryptedAssets[vaultId];
        return (
            asset.assetType,
            asset.assetValue,
            asset.accessKey,
            asset.isRevealed
        );
    }
    
    /// @notice Update release condition
    function updateReleaseCondition(
        uint256 vaultId,
        uint256 instructionId,
        euint32 newCondition
    ) public onlyOwner(vaultId) {
        inheritanceInstructions[vaultId][instructionId].encryptedReleaseCondition = newCondition;
    }
    
    /// @notice Calculate inheritance tax
    function calculateInheritanceTax(uint256 vaultId) public view returns (euint32) {
        EncryptedAsset storage asset = encryptedAssets[vaultId];
        
        // Simplified tax calculation: 10% for values over 1000
        ebool taxable = FHE.gt(asset.encryptedAssetValue, FHE.asEuint32(1000));
        return FHE.cmux(
            taxable,
            FHE.div(asset.encryptedAssetValue, FHE.asEuint32(10)),
            FHE.asEuint32(0)
        );
    }
}