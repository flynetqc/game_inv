'use client';

import { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import styles from './PhotoShelfModal.module.css';

// Compresse et redimensionne une photo côté client (navigateur) pour éviter les erreurs de taille de payload
async function compressImage(file, maxDimension = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export default function PhotoShelfModal({ existingLocations = [], onClose, onScanSuccess }) {
  const [targetLocation, setTargetLocation] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [detectedGames, setDetectedGames] = useState([]);
  const [selectedGames, setSelectedGames] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleSelectFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError("Veuillez sélectionner un fichier image valide (JPG, PNG, WebP).");
      return;
    }
    setError(null);

    try {
      // Redimensionner et compresser immédiatement pour accélérer l'analyse
      const compressed = await compressImage(file);
      setPhotoFile(compressed);
      setPhotoPreviewUrl(URL.createObjectURL(compressed));
      setDetectedGames([]);
      setSelectedGames({});
    } catch (e) {
      setPhotoFile(file);
      setPhotoPreviewUrl(URL.createObjectURL(file));
    }
  };

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
      handleSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemovePhoto = () => {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setDetectedGames([]);
    setSelectedGames({});
    setError(null);
  };

  const handleRunOcrScan = async () => {
    const loc = targetLocation.trim();
    if (!loc) {
      setError("Veuillez spécifier la tablette cible (ex: A1, B4) avant d'analyser la photo.");
      return;
    }
    if (!photoFile) {
      setError("Veuillez prendre ou téléverser une photo de votre tablette.");
      return;
    }

    setScanning(true);
    setScanProgress(5);
    setScanStatus("Initialisation du moteur de reconnaissance optique...");
    setError(null);

    let worker = null;
    try {
      // 1. Analyse OCR côté navigateur avec suivi de progression
      worker = await createWorker('eng', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            setScanProgress(Math.max(10, pct));
            setScanStatus(`Lecture des tranches de boîtes de jeux... (${pct}%)`);
          } else if (m.status === 'loading tesseract core') {
            setScanStatus("Chargement du moteur OCR...");
          }
        }
      });

      const ocrResult = await worker.recognize(photoFile);
      const recognizedText = ocrResult.data?.text || '';
      const recognizedLines = (ocrResult.data?.lines || []).map(l => l.text).filter(Boolean);

      setScanStatus("Rapprochement intelligent avec votre collection de jeux...");

      // 2. Rapprochement avec les 1 020 jeux via l'API
      const response = await fetch('/api/shelf/photo-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLocation: loc,
          text: recognizedText,
          lines: recognizedLines,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Erreur lors de l'analyse des textes.");
      }

      if (!data.games || data.games.length === 0) {
        setError("Aucun jeu n'a été reconnu avec certitude sur cette photo. Essayez de cadrer de plus près les tranches de boîtes bien éclairées.");
        setDetectedGames([]);
      } else {
        setDetectedGames(data.games);
        // Cocher par défaut tous les jeux détectés
        const initialSelected = {};
        data.games.forEach((item) => {
          initialSelected[item.game.id] = true;
        });
        setSelectedGames(initialSelected);
      }

    } catch (err) {
      console.error(err);
      setError(err.message || "Impossible d'analyser l'image.");
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (e) {
          // Ignorer
        }
      }
      setScanning(false);
    }
  };

  const handleToggleGame = (gameId) => {
    setSelectedGames(prev => ({
      ...prev,
      [gameId]: !prev[gameId]
    }));
  };

  const handleToggleAll = (select) => {
    const next = {};
    detectedGames.forEach(item => {
      next[item.game.id] = select;
    });
    setSelectedGames(next);
  };

  const handleConfirmSave = async () => {
    const loc = targetLocation.trim();
    const selectedIds = Object.keys(selectedGames).filter(id => selectedGames[id]).map(id => parseInt(id, 10));

    if (!loc) {
      setError("Emplacement manquant.");
      return;
    }

    if (selectedIds.length === 0) {
      setError("Veuillez cocher au moins un jeu à ranger sur cette tablette.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/shelf/photo-scan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLocation: loc,
          gameIds: selectedIds,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'enregistrement des emplacements.");
      }

      if (onScanSuccess) {
        onScanSuccess(selectedIds, loc);
      }
      onClose();

    } catch (err) {
      console.error(err);
      setError(err.message || "Une erreur est survenue lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = Object.values(selectedGames).filter(Boolean).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.headerIcon}>📸</span>
            <div>
              <h2 className={styles.title}>Scan Photo de Tablette</h2>
              <span className={styles.subtitle}>Reconnaissance visuelle et rangement automatique</span>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>

        {/* Corps */}
        <div className={styles.body}>
          {/* 1. Emplacement cible */}
          <div className={styles.locationSection}>
            <label className={styles.sectionLabel}>
              <span>📍</span> Tablette cible de rangement :
            </label>
            <input 
              type="text"
              placeholder="Ex: A1, B4, Tablette 3..."
              value={targetLocation}
              onChange={(e) => setTargetLocation(e.target.value)}
              className={styles.locationInput}
              disabled={scanning || saving}
            />

            {existingLocations.length > 0 && (
              <div className={styles.suggestionsList}>
                {existingLocations.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    className={styles.suggestionPill}
                    onClick={() => setTargetLocation(loc)}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Prise de photo ou téléversement */}
          {!photoPreviewUrl ? (
            <div 
              className={`${styles.dropZone} ${isDragOver ? styles.isDragOver : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div style={{ fontSize: '2.5rem' }}>📷</div>
              <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-main)' }}>
                Photographiez votre étagère de jeux
              </p>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Cadrez les tranches ou couvertures des boîtes bien droites
              </span>

              {/* Inputs masqués pour mobile & desktop */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => e.target.files && handleSelectFile(e.target.files[0])}
                style={{ display: 'none' }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files && handleSelectFile(e.target.files[0])}
                style={{ display: 'none' }}
              />

              <div className={styles.cameraButtonsRow}>
                <button
                  type="button"
                  className={styles.cameraBtn}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  📱 Prendre une photo (Caméra)
                </button>
                <button
                  type="button"
                  className={styles.uploadBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  📁 Téléverser une image
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.photoPreviewBox}>
              <img src={photoPreviewUrl} alt="Aperçu tablette" className={styles.photoPreviewImg} />
              <button 
                type="button" 
                className={styles.removePhotoBtn}
                onClick={handleRemovePhoto}
                disabled={scanning || saving}
              >
                Changer de photo
              </button>
            </div>
          )}

          {/* Bouton de lancement de l'analyse OCR */}
          {photoPreviewUrl && detectedGames.length === 0 && !scanning && (
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={handleRunOcrScan}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              🔍 Lancer la reconnaissance de la tablette
            </button>
          )}

          {/* Indicateur de chargement OCR avec pourcentage réel */}
          {scanning && (
            <div className={styles.scanningBox}>
              <div className={styles.spinner} />
              <span className={styles.scanStatus}>{scanStatus}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {scanProgress > 0 ? `Progression : ${scanProgress}%` : "Traitement de l'image..."}
              </span>
            </div>
          )}

          {/* 3. Résultats détectés dédupliqués */}
          {detectedGames.length > 0 && !scanning && (
            <>
              <div className={styles.resultsHeader}>
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                  🎲 {detectedGames.length} jeu{detectedGames.length > 1 ? 'x détectés' : ' détecté'}
                </span>
                
                <span className={styles.dedupeNotice}>
                  🛡️ Doublons éliminés (1 boîte par jeu)
                </span>

                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleAll(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Tout cocher
                  </button>
                  <span>|</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAll(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Tout décocher
                  </button>
                </div>
              </div>

              <div className={styles.gameList}>
                {detectedGames.map(({ game, detectedText, confidence, alreadyOnShelf, previousLocation }) => {
                  const isChecked = !!selectedGames[game.id];

                  return (
                    <div
                      key={game.id}
                      className={`${styles.gameRow} ${isChecked ? styles.selected : ''}`}
                      onClick={() => handleToggleGame(game.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className={styles.checkbox}
                      />

                      <div className={styles.gameThumb}>
                        {game.image_url || game.thumbnail_url ? (
                          <img
                            src={game.thumbnail_url || game.image_url}
                            alt=""
                            className={styles.thumbImg}
                          />
                        ) : (
                          <span>🎲</span>
                        )}
                      </div>

                      <div className={styles.gameInfo}>
                        <span className={styles.gameTitle}>{game.title}</span>
                        <div className={styles.gameMeta}>
                          {game.year_published && <span>({game.year_published})</span>}
                          {detectedText && <span className={styles.ocrTag}>Texte lu : "{detectedText}"</span>}
                          {previousLocation && !alreadyOnShelf && (
                            <span style={{ color: '#2563eb', fontWeight: '600' }}>Était sur : {previousLocation}</span>
                          )}
                        </div>
                      </div>

                      {alreadyOnShelf ? (
                        <span className={styles.alreadyBadge}>Déjà sur {targetLocation}</span>
                      ) : (
                        <span className={`${styles.confidenceBadge} ${confidence >= 80 ? styles.confHigh : styles.confMedium}`}>
                          {confidence}% match
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>

        {/* Footer Actions */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={saving}>
            Annuler
          </button>

          {detectedGames.length > 0 && (
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={handleConfirmSave}
              disabled={saving || selectedCount === 0}
            >
              {saving ? 'Enregistrement...' : `💾 Ranger ${selectedCount} jeu${selectedCount > 1 ? 'x' : ''} sur ${targetLocation}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
