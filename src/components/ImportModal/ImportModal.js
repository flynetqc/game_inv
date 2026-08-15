'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './ImportModal.module.css';

export default function ImportModal({ onClose, onImportSuccess }) {
  const [file, setFile] = useState(null);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

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

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setStatusText("Lecture de votre fichier CSV...");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('bgg_api_token', token.trim());

    try {
      // Étape 1 : Lecture du CSV & Appel BGG API
      setStatusText("Enrichissement des données avec BoardGameGeek (images, thèmes, mécaniques)... Cela peut prendre une minute.");
      
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

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
      setError(err.message || "Impossible de contacter l'API locale.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={!loading ? onClose : undefined}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Importer votre collection</h2>
          {!loading && (
            <button className={styles.closeButton} onClick={onClose}>
              &times;
            </button>
          )}
        </div>

        <div className={styles.body}>
          {!result && !loading && (
            <>
              <div className={styles.tokenSection}>
                <label className={styles.tokenLabel}>
                  🔑 Jeton d'accès BGG API (Facultatif)
                  <a 
                    href="https://boardgamegeek.com/applications" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={styles.tokenLink}
                  >
                    Créer un jeton ↗
                  </a>
                </label>
                <input 
                  type="password"
                  placeholder="Laisser vide pour importer sans images ni thèmes..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className={styles.tokenInput}
                />
                <span className={styles.tokenHelper}>
                  Sans jeton, les jeux sont importés immédiatement avec les données du CSV, mais sans pochettes ni thématiques.
                </span>
              </div>

              <p className={styles.instructions}>
                Exportez votre collection sur BoardGameGeek au format <strong>.csv</strong>, puis glissez-déposez le fichier ci-dessous.
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
                <button 
                  className={styles.cancelButton} 
                  onClick={onClose}
                >
                  Annuler
                </button>
                <button 
                  className={styles.importButton} 
                  disabled={!file}
                  onClick={handleUpload}
                >
                  Démarrer l'importation
                </button>
              </div>
            </>
          )}

          {loading && (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner}></div>
              <h3>Importation en cours...</h3>
              <p className={styles.loadingStatus}>{statusText}</p>
              <div className={styles.loadingWarning}>
                Ne fermez pas cette fenêtre. BoardGameGeek limite le débit des requêtes, ce qui peut rallonger le temps de chargement pour les grandes collections.
              </div>
            </div>
          )}

          {result && (
            <div className={styles.successContainer}>
              <div className={styles.successIcon}>🎉</div>
              <h3>Importation réussie !</h3>
              <p className={styles.successMessage}>{result.message}</p>
              
              <div className={styles.summaryStats}>
                <div className={styles.statBox}>
                  <span className={styles.statVal}>{result.totalFound}</span>
                  <span className={styles.statLabel}>Trouvés dans le CSV</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statVal}>{result.totalImported}</span>
                  <span className={styles.statLabel}>Enregistrés en DB</span>
                </div>
              </div>

              <div className={styles.actionsSingle}>
                <button 
                  className={styles.closeSuccessButton}
                  onClick={() => {
                    onClose();
                    window.location.reload();
                  }}
                >
                  Voir ma collection
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
