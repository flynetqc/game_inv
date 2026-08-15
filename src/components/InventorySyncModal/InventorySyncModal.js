'use client';

import { useState, useRef } from 'react';
import styles from './InventorySyncModal.module.css';

export default function InventorySyncModal({ onClose, onSyncSuccess }) {
  const [step, setStep] = useState('upload'); // 'upload' ou 'preview'
  const [file, setFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [useTextMode, setUseTextMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [syncReport, setSyncReport] = useState(null);

  // Étape 2 : États d'aperçu et de sélection
  const [activeTab, setActiveTab] = useState('matched'); // 'matched', 'unmatched', 'missing'
  const [selectedUpdates, setSelectedUpdates] = useState({});
  const [clearMissingLocations, setClearMissingLocations] = useState(false);
  
  const fileInputRef = useRef(null);

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
      const dropped = e.dataTransfer.files[0];
      setFile(dropped);
      setError(null);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  // 1. Analyser le fichier / texte
  const handleAnalyze = async () => {
    if (!file && !rawText.trim()) {
      setError("Veuillez téléverser un fichier CSV/TSV ou coller les lignes d'inventaire.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let response;
      if (file && !useTextMode) {
        const formData = new FormData();
        formData.append('file', file);
        response = await fetch('/api/inventory/sync', {
          method: 'POST',
          body: formData
        });
      } else {
        response = await fetch('/api/inventory/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawText: rawText.trim() })
        });
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'analyse du fichier.");
      }

      setSyncReport(data);

      // Initialiser la sélection de mise à jour (cochés par défaut)
      const initialSelections = {};
      (data.matched || []).forEach(m => {
        initialSelections[m.matchedGame.id] = true;
      });
      setSelectedUpdates(initialSelections);

      setStep('preview');
    } catch (err) {
      console.error(err);
      setError(err.message || "Impossible d'analyser l'inventaire.");
    } finally {
      setLoading(false);
    }
  };

  // Cocher / Décocher une mise à jour spécifique
  const handleToggleUpdate = (gameId) => {
    setSelectedUpdates(prev => ({
      ...prev,
      [gameId]: !prev[gameId]
    }));
  };

  // Tout cocher / décocher
  const handleToggleAll = (value) => {
    if (!syncReport || !syncReport.matched) return;
    const newSel = {};
    syncReport.matched.forEach(m => {
      newSel[m.matchedGame.id] = value;
    });
    setSelectedUpdates(newSel);
  };

  // 2. Enregistrer la synchronisation
  const handleApplySync = async () => {
    if (!syncReport) return;

    setSaving(true);
    setError(null);

    try {
      const updates = syncReport.matched
        .filter(m => selectedUpdates[m.matchedGame.id])
        .map(m => ({
          gameId: m.matchedGame.id,
          location: m.newLocation
        }));

      const gameIdsToClear = clearMissingLocations 
        ? syncReport.missingCatalogGames.map(g => g.id) 
        : [];

      const response = await fetch('/api/inventory/sync', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, gameIdsToClear })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'application de la synchronisation.");
      }

      if (onSyncSuccess) {
        onSyncSuccess(updates, gameIdsToClear);
      }

      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || "Impossible d'appliquer la synchronisation.");
    } finally {
      setSaving(false);
    }
  };

  const selectedUpdatesCount = Object.values(selectedUpdates).filter(Boolean).length;

  return (
    <div className="modal-backdrop" onClick={!loading && !saving ? onClose : undefined}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className={styles.header}>
          <h2>📋 Synchronisation d'Inventaire Google Sheet</h2>
          {!loading && !saving && (
            <button className={styles.closeButton} onClick={onClose}>
              &times;
            </button>
          )}
        </div>

        {/* Étape 1 : Upload */}
        {step === 'upload' && (
          <div className={styles.body}>
            <p className={styles.instructions}>
              Téléversez le fichier <strong>.csv</strong> ou <strong>.tsv</strong> exporté depuis votre Google Sheet d'inventaire (comportant les colonnes <em>Nom du jeu</em> et <em>Tablette</em>). Notre algorithme intelligent rapprochera automatiquement vos titres même s'ils comportent des variantes ou des traductions.
            </p>

            {!useTextMode ? (
              <div 
                className={`${styles.dropZone} ${isDragOver ? styles.dragOver : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className={styles.hiddenInput}
                  accept=".csv,.tsv,.txt"
                  onChange={handleFileChange}
                />
                <span className={styles.uploadIcon}>{file ? '📄' : '📤'}</span>
                <div>
                  {file ? (
                    <strong>{file.name} ({(file.size / 1024).toFixed(1)} Ko)</strong>
                  ) : (
                    <strong>Glissez-déposez votre CSV / TSV ici ou cliquez pour parcourir</strong>
                  )}
                </div>
                <button 
                  type="button" 
                  className={styles.pasteToggleBtn}
                  onClick={(e) => { e.stopPropagation(); setUseTextMode(true); }}
                >
                  Ou coller directement le texte de la feuille ➔
                </button>
              </div>
            ) : (
              <div>
                <textarea 
                  placeholder="Collez ici les lignes sélectionnées dans votre Google Sheet (avec les en-têtes Nom du jeu \t Tablette)..."
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className={styles.textarea}
                />
                <button 
                  type="button" 
                  className={styles.pasteToggleBtn}
                  onClick={() => setUseTextMode(false)}
                >
                  ← Préférer le téléversement de fichier
                </button>
              </div>
            )}

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button 
                className={styles.cancelBtn} 
                onClick={onClose}
                disabled={loading}
              >
                Annuler
              </button>
              <button 
                className={styles.submitBtn} 
                disabled={loading || (!file && !rawText.trim())}
                onClick={handleAnalyze}
              >
                {loading ? 'Analyse & Rapprochement...' : '⚡ Comparer & Prévisualiser'}
              </button>
            </div>
          </div>
        )}

        {/* Étape 2 : Prévisualisation & Rapprochement */}
        {step === 'preview' && syncReport && (
          <div className={styles.body}>
            {/* Barre d'onglets de résultats */}
            <div className={styles.tabsNav}>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'matched' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('matched')}
              >
                📍 Localisations à jour
                <span className={styles.badgeCount}>{syncReport.matched.length}</span>
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'unmatched' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('unmatched')}
              >
                ➕ Non trouvés
                <span className={styles.badgeCount}>{syncReport.unmatchedInventory.length}</span>
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'missing' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('missing')}
              >
                ❓ Absents du Sheet
                <span className={styles.badgeCount}>{syncReport.missingCatalogGames.length}</span>
              </button>
            </div>

            {/* Onglet 1 : Correspondances détectées */}
            {activeTab === 'matched' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                  <span>Sélectionnés : <strong>{selectedUpdatesCount} / {syncReport.matched.length}</strong></span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => handleToggleAll(true)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>Tout cocher</button>
                    <span>|</span>
                    <button type="button" onClick={() => handleToggleAll(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Tout décocher</button>
                  </div>
                </div>

                <div className={styles.matrixList}>
                  {syncReport.matched.map((item, idx) => (
                    <div 
                      key={`matched-${item.matchedGame.id}-${idx}`} 
                      className={styles.matrixRow}
                      onClick={() => handleToggleUpdate(item.matchedGame.id)}
                    >
                      <input 
                        type="checkbox" 
                        checked={!!selectedUpdates[item.matchedGame.id]}
                        onChange={() => {}}
                        className={styles.checkbox}
                      />
                      {item.matchedGame.thumbnail_url || item.matchedGame.image_url ? (
                        <img 
                          src={item.matchedGame.thumbnail_url || item.matchedGame.image_url} 
                          alt="" 
                          className={styles.rowThumb}
                        />
                      ) : (
                        <div className={styles.thumbPlaceholder}>🎲</div>
                      )}
                      
                      <div className={styles.titleInfo}>
                        <span className={styles.matchedTitle}>{item.matchedGame.title}</span>
                        <span className={styles.sheetTitle}>Trouvé pour : "{item.inventoryTitle}"</span>
                      </div>

                      <span className={`${styles.confidenceBadge} ${
                        item.confidence >= 90 ? styles.confHigh : item.confidence >= 70 ? styles.confMedium : styles.confLow
                      }`}>
                        {item.confidence}% match
                      </span>

                      <span className={styles.locationTag}>
                        📍 {item.newLocation}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Onglet 2 : Titres non trouvés */}
            {activeTab === 'unmatched' && (
              <div className={styles.matrixList}>
                {syncReport.unmatchedInventory.length > 0 ? (
                  syncReport.unmatchedInventory.map((item, idx) => (
                    <div key={idx} className={styles.matrixRow}>
                      <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                      <div className={styles.titleInfo}>
                        <span className={styles.matchedTitle}>{item.rawTitle}</span>
                        <span className={styles.sheetTitle}>Emplacement sur le Sheet : {item.location || 'N/A'}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
                    Tous les titres de votre feuille d'inventaire ont été associés à des jeux de votre bibliothèque !
                  </p>
                )}
              </div>
            )}

            {/* Onglet 3 : Jeux du catalogue absents de l'inventaire */}
            {activeTab === 'missing' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.08)', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <input 
                    type="checkbox"
                    id="clearMissingCheck"
                    checked={clearMissingLocations}
                    onChange={(e) => setClearMissingLocations(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <label htmlFor="clearMissingCheck" style={{ fontSize: '0.85rem', color: '#f87171', cursor: 'pointer' }}>
                    Vider la localisation des {syncReport.missingCatalogGames.length} jeux absents du Sheet (marquer comme "À ranger")
                  </label>
                </div>

                <div className={styles.matrixList}>
                  {syncReport.missingCatalogGames.map((game, idx) => (
                    <div key={`missing-${game.id}-${idx}`} className={styles.matrixRow}>
                      <span style={{ fontSize: '1.2rem' }}>❓</span>
                      <div className={styles.titleInfo}>
                        <span className={styles.matchedTitle}>{game.title}</span>
                        <span className={styles.sheetTitle}>Emplacement actuel : {game.location || 'Aucun'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.actions}>
              <button 
                className={styles.cancelBtn} 
                onClick={() => setStep('upload')}
                disabled={saving}
              >
                ← Changer de fichier
              </button>
              <button 
                className={styles.submitBtn} 
                disabled={saving || selectedUpdatesCount === 0}
                onClick={handleApplySync}
              >
                {saving ? 'Enregistrement...' : `🚀 Appliquer (${selectedUpdatesCount} localisations)`}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
