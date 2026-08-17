'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './ImportModal.module.css';

export default function ImportModal({ onClose, onImportSuccess }) {
  const [activeTab, setActiveTab] = useState('bgg'); // 'bgg' ou 'csv'
  
  // États BGG API
  const [username, setUsername] = useState('flynetqc');
  const [token, setToken] = useState('');
  
  // États CSV
  const [file, setFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // États génériques
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/import')
      .then(res => res.json())
      .then(data => {
        if (data.token) {
          setToken(data.token);
        }
      })
      .catch(err => console.error("Erreur de chargement du token:", err));
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError("Veuillez sélectionner uniquement un fichier au format .csv.");
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError("Veuillez sélectionner uniquement un fichier au format .csv.");
      }
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  // 1. Synchronisation directe via l'API BGG XML2
  const handleBggSync = async () => {
    if (!username.trim()) {
      setError("Veuillez entrer votre nom d'utilisateur BoardGameGeek.");
      return;
    }

    setLoading(true);
    setError(null);
    setStatusText(`Interrogation de l'API BGG pour "${username.trim()}"...`);

    try {
      const response = await fetch('/api/bgg/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          bgg_api_token: token.trim()
        })
      });

      let data = {};
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const rawText = await response.text();
        throw new Error(`Le serveur a renvoyé une erreur (Code HTTP ${response.status}). Vérifiez que la mise à jour Vercel est terminée.`);
      }

      if (!response.ok) {
        throw new Error(data.error || "Une erreur est survenue lors de la synchronisation BGG.");
      }

      setResult(data);
      setStatusText(data.message || "Synchronisation BGG terminée avec succès !");
      if (onImportSuccess) {
        onImportSuccess(data.games);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Impossible de contacter l'API BGG.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Importation manuelle via fichier CSV
  const handleCsvUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setStatusText("Lecture et analyse de votre fichier CSV...");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('bgg_api_token', token.trim());

    try {
      setStatusText("Enrichissement des jeux avec les métadonnées BGG...");
      
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      let data = {};
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        throw new Error(`Le serveur a renvoyé une erreur (Code HTTP ${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(data.error || "Une erreur est survenue lors de l'importation.");
      }

      setResult(data);
      setStatusText("Importation terminée avec succès !");
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Impossible d'importer le fichier.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={!loading ? onClose : undefined}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Synchroniser votre collection</h2>
          {!loading && (
            <button className={styles.closeButton} onClick={onClose}>
              &times;
            </button>
          )}
        </div>

        {/* Sélecteur d'onglets */}
        {!result && !loading && (
          <div className={styles.tabNav}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'bgg' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('bgg')}
            >
              <span>🔄 API BGG Direct</span>
              <span className={styles.recommendedBadge}>Recommandé</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'csv' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('csv')}
            >
              <span>📄 Fichier CSV</span>
            </button>
          </div>
        )}

        <div className={styles.body}>
          {/* Écran de chargement */}
          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <h3 className={styles.loadingTitle}>Synchronisation en cours</h3>
              <p className={styles.loadingText}>{statusText}</p>
              <span className={styles.loadingSub}>
                Note : BGG peut mettre quelques secondes à générer le flux de votre collection (code HTTP 202).
              </span>
            </div>
          )}

          {/* Écran de résultat / succès */}
          {result && !loading && (
            <div className={styles.resultState}>
              <div className={styles.successIcon}>🎉</div>
              <h3>Collection synchronisée !</h3>
              <p className={styles.resultSummary}>
                {result.message || `${result.total || result.importedCount || 0} jeux traités avec succès.`}
              </p>
              <div className={styles.actions}>
                <button className={styles.submitBtn} onClick={onClose}>
                  Voir ma collection
                </button>
              </div>
            </div>
          )}

          {/* Formulaire API BGG Direct */}
          {!result && !loading && activeTab === 'bgg' && (
            <>
              <p className={styles.instructions}>
                Synchronisez instantanément tous vos jeux possédés depuis <strong>BoardGameGeek</strong> via leur API officielle en un seul clic. Vos emplacements de tablettes et codes-barres sont conservés.
              </p>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  👤 Nom d'utilisateur BGG :
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex: flynetqc"
                  className={styles.textInput}
                />
              </div>

              <div className={styles.tokenSection}>
                <label className={styles.tokenLabel}>
                  🔑 Clé d'API BGG (Bearer Token) :
                  <a 
                    href="https://boardgamegeek.com/geekaccount/api" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={styles.tokenLink}
                  >
                    Obtenir ma clé BGG ↗
                  </a>
                </label>
                <input 
                  type="password"
                  placeholder="Collez votre clé API BGG ici..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className={styles.tokenInput}
                />
                <span className={styles.tokenHelper}>
                  La clé est mémorisée dans votre environnement pour que vos futures synchronisations se fassent en 1 clic.
                </span>
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.actions}>
                <button className={styles.cancelBtn} onClick={onClose}>
                  Annuler
                </button>
                <button 
                  className={styles.submitBtn} 
                  disabled={!username.trim()}
                  onClick={handleBggSync}
                >
                  🚀 Lancer la synchro BGG
                </button>
              </div>
            </>
          )}

          {/* Formulaire Import CSV Manuel */}
          {!result && !loading && activeTab === 'csv' && (
            <>
              <p className={styles.instructions}>
                Si vous préférez un import hors-ligne, exportez votre collection sur BoardGameGeek au format <strong>.csv</strong>, puis glissez-déposez le fichier ci-dessous.
              </p>
              
              <div 
                className={`${styles.dropZone} ${isDragOver ? styles.dragOver : ''} ${file ? styles.hasFile : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={triggerFileSelect}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className={styles.hiddenInput} 
                  accept=".csv"
                  onChange={handleFileChange}
                />
                
                <div className={styles.dropZoneContent}>
                  <span className={styles.uploadIcon}>{file ? '📄' : '📤'}</span>
                  {file ? (
                    <div className={styles.fileInfo}>
                      <span className={styles.fileName}>{file.name}</span>
                      <span className={styles.fileSize}>
                        ({(file.size / 1024).toFixed(1)} Ko)
                      </span>
                    </div>
                  ) : (
                    <div className={styles.prompt}>
                      <strong>Glissez-déposez votre CSV</strong>
                      <span>ou cliquez pour parcourir vos dossiers</span>
                    </div>
                  )}
                </div>
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.actions}>
                <button className={styles.cancelBtn} onClick={onClose}>
                  Annuler
                </button>
                <button 
                  className={styles.submitBtn} 
                  disabled={!file}
                  onClick={handleCsvUpload}
                >
                  📥 Importer le CSV
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
