'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import styles from './BarcodeScanModal.module.css';

function stripDiacritics(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function BarcodeScanModal({ allGames = [], existingLocations = [], onClose, onGamePlaced }) {
  const [targetLocation, setTargetLocation] = useState('');
  const [continuousMode, setContinuousMode] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [matchedGame, setMatchedGame] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const [saving, setSaving] = useState(false);

  // Saisie manuelle de code-barres ou de titre
  const [manualCode, setManualCode] = useState('');
  const [manualSearchQuery, setManualSearchQuery] = useState('');

  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const isHandlingScanRef = useRef(false);

  // Démarrer la caméra
  const startCameraScanner = async () => {
    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (e) {
          // Ignorer
        }
      }

      const qrCodeScanner = new Html5Qrcode("barcode-reader-viewport");
      html5QrCodeRef.current = qrCodeScanner;

      await qrCodeScanner.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 280, height: 160 },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ]
        },
        (decodedText) => {
          handleBarcodeDetected(decodedText);
        },
        () => {
          // Frame scanner silencieux
        }
      );

      setScanning(true);
      setError(null);
    } catch (err) {
      console.error("Erreur démarrage caméra scanner:", err);
      setError("Impossible d'accéder à la caméra. Vérifiez les autorisations de votre navigateur.");
      setScanning(false);
    }
  };

  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (e) {
        // Ignorer
      }
    }
    setScanning(false);
  };

  useEffect(() => {
    startCameraScanner();

    return () => {
      stopCameraScanner();
    };
  }, []);

  const playSuccessHaptic = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(180);
      }
    } catch (e) {
      // Ignorer
    }
  };

  // Traitement d'un code-barres détecté par la caméra ou saisi manuellement
  const handleBarcodeDetected = async (code) => {
    const cleanCode = code ? code.trim() : '';
    if (!cleanCode || isHandlingScanRef.current) return;

    isHandlingScanRef.current = true;
    playSuccessHaptic();

    setScannedBarcode(cleanCode);
    setLookupLoading(true);
    setError(null);
    setSuccessToast(null);

    try {
      const response = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(cleanCode)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur de recherche du code-barres.");
      }

      if (data.game) {
        setMatchedGame(data.game);
        setCandidates(data.candidates || []);
      } else {
        setMatchedGame(null);
        setCandidates(data.candidates || []);
        setError(`Code-barres "${cleanCode}" non associé. Sélectionnez le jeu correspondant ci-dessous pour le mémoriser.`);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Impossible de résoudre ce code-barres.");
    } finally {
      setLookupLoading(false);
      // Réactiver le déclenchement après délai
      setTimeout(() => {
        isHandlingScanRef.current = false;
      }, 1200);
    }
  };

  // Associer et ranger le jeu sélectionné
  const handleConfirmPlacement = async (gameToPlace = matchedGame) => {
    if (!gameToPlace) {
      setError("Veuillez sélectionner un jeu à ranger.");
      return;
    }

    const loc = targetLocation.trim();
    if (!loc) {
      setError("Veuillez choisir ou saisir la tablette cible (ex: B4).");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/barcode/lookup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameToPlace.id,
          barcode: scannedBarcode,
          location: loc,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erreur d'enregistrement.");
      }

      // Notifier le composant parent
      if (onGamePlaced) {
        onGamePlaced(gameToPlace.id, loc, scannedBarcode);
      }

      setSuccessToast(`✅ "${gameToPlace.title}" a été rangé sur ${loc} !`);
      setMatchedGame(null);
      setScannedBarcode(null);
      setCandidates([]);
      setManualSearchQuery('');
      setManualCode('');

      if (!continuousMode) {
        onClose();
      }

    } catch (err) {
      console.error(err);
      setError(err.message || "Impossible d'enregistrer.");
    } finally {
      setSaving(false);
    }
  };

  // Suggestions pour la recherche manuelle
  const normalizedQuery = stripDiacritics(manualSearchQuery.trim());
  const searchResults = normalizedQuery.length >= 2
    ? allGames
        .filter(g => stripDiacritics(g.title).includes(normalizedQuery))
        .slice(0, 4)
    : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* En-tête */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.headerIcon}>📷</span>
            <div>
              <h2 className={styles.title}>Scanner de Code-Barres</h2>
              <span className={styles.subtitle}>Viser le code au dos de la boîte pour ranger sur l'étagère</span>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>

        {/* Corps */}
        <div className={styles.body}>
          {/* 1. Emplacement cible & Mode continu */}
          <div className={styles.locationSection}>
            <div className={styles.sectionHeader}>
              <label className={styles.sectionLabel}>
                <span>📍</span> Tablette de rangement :
              </label>

              <label className={styles.continuousToggle}>
                <input
                  type="checkbox"
                  checked={continuousMode}
                  onChange={(e) => setContinuousMode(e.target.checked)}
                />
                🔁 Mode Scan Continu (boîtes à la suite)
              </label>
            </div>

            <input
              type="text"
              placeholder="Ex: B4, A1, Tablette 3..."
              value={targetLocation}
              onChange={(e) => setTargetLocation(e.target.value)}
              className={styles.locationInput}
              disabled={saving}
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

          {/* Toast de succès */}
          {successToast && (
            <div className={styles.successToast}>
              <span>{successToast}</span>
            </div>
          )}

          {/* 2. Viseur Caméra Scanner */}
          <div className={styles.cameraCard}>
            <div id="barcode-reader-viewport" className={styles.scannerContainer} />
            <div className={styles.cameraOverlayHelp}>
              <span>🔍</span> Cadrez le code-barres (UPC/EAN) dans le viseur
            </div>
          </div>

          {/* Saisie manuelle de code-barres en alternative */}
          <div className={styles.manualInputRow}>
            <input
              type="text"
              placeholder="Ou tapez un code-barres (ex: 850026848039)..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className={styles.manualBarcodeInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualCode) {
                  handleBarcodeDetected(manualCode);
                }
              }}
            />
            <button
              type="button"
              className={styles.manualLookupBtn}
              onClick={() => manualCode && handleBarcodeDetected(manualCode)}
              disabled={!manualCode || lookupLoading}
            >
              Vérifier
            </button>
          </div>

          {/* Indicateur de recherche */}
          {lookupLoading && (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontWeight: 700 }}>
              ⏳ Recherche du jeu correspondant...
            </div>
          )}

          {/* 3. Résultat du jeu reconnu */}
          {matchedGame && !lookupLoading && (
            <div className={styles.resultCard}>
              <div className={styles.resultHeader}>
                <span className={styles.barcodeBadge}>UPC : {scannedBarcode}</span>
                <span className={styles.matchBadge}>🎯 Jeu identifié</span>
              </div>

              <div className={styles.gameRow}>
                <div className={styles.gameThumb}>
                  {matchedGame.image_url || matchedGame.thumbnail_url ? (
                    <img
                      src={matchedGame.thumbnail_url || matchedGame.image_url}
                      alt=""
                      className={styles.thumbImg}
                    />
                  ) : (
                    <span style={{ fontSize: '1.8rem' }}>🎲</span>
                  )}
                </div>

                <div className={styles.gameInfo}>
                  <span className={styles.gameTitle}>{matchedGame.title}</span>
                  <div className={styles.gameMeta}>
                    {matchedGame.year_published && <span>Année : {matchedGame.year_published}</span>}
                    {matchedGame.location && (
                      <span className={styles.currentLocation}>Emplacement actuel : {matchedGame.location}</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={() => handleConfirmPlacement(matchedGame)}
                  disabled={saving || !targetLocation.trim()}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {saving ? 'Enregistrement...' : `✅ Ranger sur ${targetLocation || 'la tablette'}`}
                </button>

                <button
                  type="button"
                  onClick={() => setMatchedGame(null)}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    padding: '0.55rem 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                  title="Changer de jeu"
                >
                  🔄 Modifier
                </button>
              </div>
            </div>
          )}

          {/* 4. Si non reconnu ou alternatives proposées */}
          {scannedBarcode && !matchedGame && !lookupLoading && (
            <div className={styles.manualMatchBox}>
              <span className={styles.manualMatchTitle}>
                🔗 Associer ce code-barres ({scannedBarcode}) à un jeu de votre collection :
              </span>

              {/* Suggestions proches */}
              {candidates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {candidates.map((cand) => (
                    <div
                      key={cand.id}
                      className={styles.candidateItem}
                      onClick={() => handleConfirmPlacement(cand)}
                    >
                      <span>🎲 {cand.title} ({cand.year_published || 'N/A'})</span>
                      <span style={{ color: '#2563eb', fontWeight: 800 }}>Associer & Ranger</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recherche rapide par nom */}
              <input
                type="text"
                placeholder="Rechercher par titre (ex: Cascadia, Boop, 3 Ring Circus...)"
                value={manualSearchQuery}
                onChange={(e) => setManualSearchQuery(e.target.value)}
                className={styles.manualBarcodeInput}
                style={{ marginTop: '0.25rem' }}
              />

              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
                  {searchResults.map((game) => (
                    <div
                      key={game.id}
                      className={styles.candidateItem}
                      onClick={() => handleConfirmPlacement(game)}
                    >
                      <span>{game.title} {game.year_published ? `(${game.year_published})` : ''}</span>
                      <span style={{ color: '#16a34a', fontWeight: 800 }}>Ranger sur {targetLocation || '...'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
