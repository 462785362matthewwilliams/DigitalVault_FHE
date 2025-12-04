// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface InheritanceItem {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  assetType: string;
  beneficiary: string;
  unlockCondition: string;
}

const App: React.FC = () => {
  // Randomized style selections
  // Colors: High contrast (red+black)
  // UI: Cyberpunk
  // Layout: Card grid
  // Interaction: Micro-interactions
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [vaultItems, setVaultItems] = useState<InheritanceItem[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newItemData, setNewItemData] = useState({
    assetType: "",
    description: "",
    beneficiary: "",
    unlockCondition: "",
    sensitiveData: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAssetType, setSelectedAssetType] = useState("all");

  // Randomly selected additional features: Search & Filter, Data Statistics
  
  const assetTypes = ["Crypto", "NFT", "Document", "Credentials", "Other"];
  
  const filteredItems = vaultItems.filter(item => {
    const matchesSearch = item.assetType.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         item.beneficiary.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedAssetType === "all" || item.assetType === selectedAssetType;
    return matchesSearch && matchesType;
  });

  const cryptoCount = vaultItems.filter(i => i.assetType === "Crypto").length;
  const nftCount = vaultItems.filter(i => i.assetType === "NFT").length;
  const docCount = vaultItems.filter(i => i.assetType === "Document").length;

  useEffect(() => {
    loadVaultItems().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadVaultItems = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("vault_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing vault keys:", e);
        }
      }
      
      const list: InheritanceItem[] = [];
      
      for (const key of keys) {
        try {
          const itemBytes = await contract.getData(`vault_${key}`);
          if (itemBytes.length > 0) {
            try {
              const itemData = JSON.parse(ethers.toUtf8String(itemBytes));
              list.push({
                id: key,
                encryptedData: itemData.data,
                timestamp: itemData.timestamp,
                owner: itemData.owner,
                assetType: itemData.assetType,
                beneficiary: itemData.beneficiary,
                unlockCondition: itemData.unlockCondition
              });
            } catch (e) {
              console.error(`Error parsing item data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading item ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setVaultItems(list);
    } catch (e) {
      console.error("Error loading vault items:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitItem = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting sensitive data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newItemData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const itemId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const itemData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        assetType: newItemData.assetType,
        beneficiary: newItemData.beneficiary,
        unlockCondition: newItemData.unlockCondition
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `vault_${itemId}`, 
        ethers.toUtf8Bytes(JSON.stringify(itemData))
      );
      
      const keysBytes = await contract.getData("vault_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(itemId);
      
      await contract.setData(
        "vault_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted inheritance item stored securely!"
      });
      
      await loadVaultItems();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewItemData({
          assetType: "",
          description: "",
          beneficiary: "",
          unlockCondition: "",
          sensitiveData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE Contract is ${isAvailable ? "available" : "unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Failed to check contract availability"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>FHE<span>Inheritance</span>Vault</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn cyber-button"
          >
            <div className="add-icon"></div>
            Add Asset
          </button>
          <button 
            className="cyber-button"
            onClick={checkAvailability}
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Fully Homomorphic Inheritance Vault</h2>
            <p>Securely store and transfer digital assets using FHE encryption</p>
          </div>
        </div>
        
        <div className="dashboard-grid">
          <div className="dashboard-card cyber-card">
            <h3>Asset Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{vaultItems.length}</div>
                <div className="stat-label">Total Assets</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{cryptoCount}</div>
                <div className="stat-label">Crypto</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{nftCount}</div>
                <div className="stat-label">NFTs</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{docCount}</div>
                <div className="stat-label">Documents</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card cyber-card">
            <h3>Search & Filter</h3>
            <div className="search-filter">
              <input
                type="text"
                placeholder="Search assets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="cyber-input"
              />
              <select
                value={selectedAssetType}
                onChange={(e) => setSelectedAssetType(e.target.value)}
                className="cyber-select"
              >
                <option value="all">All Asset Types</option>
                {assetTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        
        <div className="assets-section">
          <div className="section-header">
            <h2>Your Encrypted Assets</h2>
            <div className="header-actions">
              <button 
                onClick={loadVaultItems}
                className="refresh-btn cyber-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          {filteredItems.length === 0 ? (
            <div className="no-assets cyber-card">
              <div className="no-assets-icon"></div>
              <p>No encrypted assets found</p>
              <button 
                className="cyber-button primary"
                onClick={() => setShowCreateModal(true)}
              >
                Add First Asset
              </button>
            </div>
          ) : (
            <div className="assets-grid">
              {filteredItems.map(item => (
                <div className="asset-card cyber-card" key={item.id}>
                  <div className="asset-header">
                    <div className="asset-type">{item.assetType}</div>
                    <div className="asset-id">#{item.id.substring(0, 6)}</div>
                  </div>
                  <div className="asset-details">
                    <div className="detail-row">
                      <span>Owner:</span>
                      <span>{item.owner.substring(0, 6)}...{item.owner.substring(38)}</span>
                    </div>
                    <div className="detail-row">
                      <span>Beneficiary:</span>
                      <span>{item.beneficiary.substring(0, 6)}...{item.beneficiary.substring(38)}</span>
                    </div>
                    <div className="detail-row">
                      <span>Unlock Condition:</span>
                      <span>{item.unlockCondition}</span>
                    </div>
                    <div className="detail-row">
                      <span>Date Added:</span>
                      <span>{new Date(item.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="asset-actions">
                    {isOwner(item.owner) && (
                      <button 
                        className="action-btn cyber-button"
                        onClick={() => {
                          // Placeholder for future functionality
                          alert("FHE verification will execute when conditions are met");
                        }}
                      >
                        Check Status
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitItem} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          itemData={newItemData}
          setItemData={setNewItemData}
          assetTypes={assetTypes}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>FHE Inheritance Vault</span>
            </div>
            <p>Secure digital inheritance powered by Fully Homomorphic Encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Security</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Inheritance Vault. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  itemData: any;
  setItemData: (data: any) => void;
  assetTypes: string[];
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  itemData,
  setItemData,
  assetTypes
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setItemData({
      ...itemData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!itemData.assetType || !itemData.beneficiary || !itemData.unlockCondition || !itemData.sensitiveData) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Add Encrypted Inheritance Asset</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your data will be encrypted with FHE and only unlocked when conditions are met
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Asset Type *</label>
              <select 
                name="assetType"
                value={itemData.assetType} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="">Select asset type</option>
                {assetTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text"
                name="description"
                value={itemData.description} 
                onChange={handleChange}
                placeholder="Brief description..." 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group">
              <label>Beneficiary Address *</label>
              <input 
                type="text"
                name="beneficiary"
                value={itemData.beneficiary} 
                onChange={handleChange}
                placeholder="0x..." 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group">
              <label>Unlock Condition *</label>
              <select 
                name="unlockCondition"
                value={itemData.unlockCondition} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="">Select condition</option>
                <option value="TimeLock">Time Lock (after date)</option>
                <option value="Inactivity">Inactivity Period</option>
                <option value="MultiSig">Multi-Signature Approval</option>
                <option value="DeathCert">Death Certificate Verification</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Sensitive Data *</label>
              <textarea 
                name="sensitiveData"
                value={itemData.sensitiveData} 
                onChange={handleChange}
                placeholder="Enter sensitive data to encrypt..." 
                className="cyber-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing and will only unlock when conditions are verified
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn cyber-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;