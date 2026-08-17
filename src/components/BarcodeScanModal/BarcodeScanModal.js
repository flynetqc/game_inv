'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import styles from './BarcodeScanModal.module.css';

/**
 * Extrait intelligemment le nom de l'emplacement depuis le texte scanné
 * (Prend en charge les URLs, formats QR Code, 'LOC B2', 'C1', 'TABLETTE A3', etc.)
 */
function extractLocationFromScan(decodedText, existingLocations = []) {
  if (!decodedText) return null;
  let text = decodedText.trim();

  // 1. Si le QR code est une URL (ex: https://monsite.com/?location=LOC%20B2 ou /shelf/C1)
  if (text.startsWith('http://') || text.startsWith('https://')) {
    try {
      const url = new URL(text);
      const locParam = url.searchParams.get('location') || url.searchParams.get('loc') || url.searchParams.get('shelf') || url.searchParams.get('tablette');
      if (locParam) return locParam.trim();

      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        text = decodeURIComponent(pathParts[pathParts.length - 1]);
      }
    } catch (e) {
      // Ignorer l'erreur d'URL
    }
  }

  // 2. Si préfixé par LOCATION, LOC, TABLETTE, SHELF, EMPLACEMENT
  const prefixMatch = text.match(/^(LOCATION|LOC|SHELF|TABLETTE|EMPLACEMENT)[\s:_\-]*\s*(.+)$/i);
  if (prefixMatch) {
    const rawVal = prefixMatch[2].trim();
    // Chercher une correspondance exacte dans existingLocations
    const match = existingLocations.find(l => 
      l.toLowerCase() === text.toLowerCase() || 
      l.toLowerCase() === rawVal.toLowerCase() ||
      l.toLowerCase() === `loc ${rawVal}`.toLowerCase() ||
      l.toLowerCase() === `loc-${rawVal}`.toLowerCase()
    );
    if (match) return match;
    return text;
  }

  // 3. Chercher correspondance exacte (insensible à la casse) dans la liste des emplacements
  const exactMatch = existingLocations.find(l => l.toLowerCase() === text.toLowerCase());
  if (exactMatch) return exactMatch;

  // 4. Correspondance alphanumérique simplifiée (ex: 'c1' match 'C1')
  const shortMatch = existingLocations.find(l => 
    l.toLowerCase().replace(/[^a-z0-9]/g, '') === text.toLowerCase().replace(/[^a-z0-9]/g, '')
  );
  if (shortMatch) return shortMatch;

  return text;
}

export default function BarcodeScanModal({ allGames = [], existingLocations = [], onClose, onSelectGame }) {
  const [selectedLocation, setSelectedLocation] = useState('');
  const [shelfFilter, setShelfFilter] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [error, setError] = useState(null);

  const html5QrCodeRef = useRef(null);
  const isHandlingScanRef = useRef(false);
  const inventorySectionRef = useRef(null);

  // Démarrer le scanner caméra (QR Code et Code-barres de tablette)
  const startCameraScanner = async () => {
    try {
      if (html5QrCodeRef.current) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (e) {}
      }

      const qrCodeScanner = new Html5Qrcode("shelf-reader-viewport");
      html5QrCodeRef.current = qrCodeScanner;

      await qrCodeScanner.start(
        { facingMode: "environment" },
        {
          fps: 20,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const w = Math.floor(Math.min(viewfinderWidth * 0.9, 320));
            const h = Math.floor(Math.min(viewfinderHeight * 0.9, 320));
            return { width: Math.max(w, 200), height: Math.max(h, 200) };
          },
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.DATA_MATRIX
          ]
        },
        (decodedText) => {
          handleShelfDetected(decodedText);
        },
        () => {}
      );

      setScanning(true);
      setError(null);
    } catch (err) {
      console.error("Erreur démarrage caméra:", err);
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
      } catch (e) {}
    }
    setScanning(false);
  };

  useEffect(() => {
    if (cameraActive) {
      const timer = setTimeout(() => {
        startCameraScanner();
      }, 250);
      return () => {
        clearTimeout(timer);
        stopCameraScanner();
      };
    } else {
      stopCameraScanner();
    }
  }, [cameraActive]);

  // Traitement d'un QR code ou code-barres de tablette détecté
  const handleShelfDetected = (decodedText) => {
    if (isHandlingScanRef.current) return;
    isHandlingScanRef.current = true;

    try {
      const matchedLoc = extractLocationFromScan(decodedText, existingLocations);
      if (matchedLoc) {
        // Retour haptique si mobile
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([40, 30, 40]);
        }

        setSelectedLocation(matchedLoc);
        setScanFeedback(`✅ Tablette "${matchedLoc}" détectée avec succès !`);

        setTimeout(() => {
          setScanFeedback(null);
        }, 3500);

        // Faire défiler doucement vers la liste des jeux
        setTimeout(() => {
          if (inventorySectionRef.current) {
            inventorySectionRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 300);
      }
    } catch (err) {
      console.error("Erreur traitement scan tablette:", err);
    } finally {
      setTimeout(() => {
        isHandlingScanRef.current = false;
      }, 1500);
    }
  };

  // Liste des jeux situés sur la tablette sélectionnée
  const shelfGames = selectedLocation
    ? allGames.filter(g => (g.location || '').trim().toLowerCase() === selectedLocation.trim().toLowerCase())
    : [];

  const filteredShelfGames = shelfGames.filter(g => {
    if (!shelfFilter.trim()) return true;
    return (g.title || '').toLowerCase().includes(shelfFilter.toLowerCase().trim());
  });

  const baseGamesCount = shelfGames.filter(g => g.item_type !== 'expansion').length;
  const expansionCount = shelfGames.filter(g => g.item_type === 'expansion').length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* En-tête */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.headerIcon}>📷</span>
            <div>
              <h2 className={styles.title}>Scanner de Tablette & Étagère</h2>
              <p className={styles.subtitle}>
                Visez le QR Code ou code-barres d'une tablette pour voir immédiatement son contenu
              </p>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} title="Fermer">
            &times;
          </button>
        </div>

        <div className={styles.body}>
          {/* Section Caméra */}
          <div className={styles.cameraCard}>
            <div className={styles.cameraHeader}>
              <div className={styles.cameraStatus}>
                <span className={`${styles.statusDot} ${scanning ? styles.statusActive : ''}`} />
                <span>{scanning ? 'Caméra active - Prêt à scanner' : 'Caméra en pause'}</span>
              </div>
              <button 
                type="button" 
                className={styles.cameraToggleBtn}
                onClick={() => setCameraActive(!cameraActive)}
              >
                {cameraActive ? '⏸️ Mettre en pause' : '▶️ Réactiver la caméra'}
              </button>
            </div>

            {cameraActive && (
              <div className={styles.viewportContainer}>
                <div id="shelf-reader-viewport" className={styles.scannerViewport} />
                <div className={styles.scannerOverlay}>
                  <div className={styles.targetFrame} />
                  <span className={styles.overlayHint}>
                    Cadrez le QR Code ou le code-barres de la tablette
                  </span>
                </div>
              </div>
            )}

            {scanFeedback && (
              <div className={styles.scanSuccessToast}>
                {scanFeedback}
              </div>
            )}

            {error && (
              <div className={styles.errorBanner}>
                <span>⚠️ {error}</span>
              </div>
            )}
          </div>

          {/* Sélecteur & Recherche Rapide de Tablette */}
          <div className={styles.selectionSection}>
            <div className={styles.sectionHeaderRow}>
              <label className={styles.sectionLabel}>
                📍 Ou sélectionnez / cherchez une tablette manuellement :
              </label>
            </div>

            {existingLocations.length > 0 && (
              <div className={styles.locationPillsList}>
                {existingLocations.map(loc => {
                  const count = allGames.filter(g => (g.location || '').trim().toLowerCase() === loc.trim().toLowerCase()).length;
                  const isSelected = selectedLocation.toLowerCase() === loc.toLowerCase();
                  return (
                    <button
                      key={loc}
                      type="button"
                      className={`${styles.locationPill} ${isSelected ? styles.locationPillActive : ''}`}
                      onClick={() => setSelectedLocation(loc)}
                    >
                      <span className={styles.pillIcon}>📍</span>
                      <span className={styles.pillName}>{loc}</span>
                      <span className={styles.pillCount}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section Inventaire de la Tablette Détectée */}
          {selectedLocation && (
            <div ref={inventorySectionRef} className={styles.inventorySection}>
              <div className={styles.inventoryHeader}>
                <div className={styles.shelfTitleGroup}>
                  <span className={styles.shelfIcon}>📦</span>
                  <div>
                    <h3 className={styles.shelfTitle}>
                      Tablette : <strong>{selectedLocation}</strong>
                    </h3>
                    <p className={styles.shelfSubtitle}>
                      {shelfGames.length} boîte{shelfGames.length > 1 ? 's' : ''} au total ({baseGamesCount} jeu{baseGamesCount > 1 ? 'x' : ''} de base · {expansionCount} extension{expansionCount > 1 ? 's' : ''})
                    </p>
                  </div>
                </div>

                {shelfGames.length > 3 && (
                  <input
                    type="text"
                    placeholder="Filtrer les jeux de cette tablette..."
                    value={shelfFilter}
                    onChange={(e) => setShelfFilter(e.target.value)}
                    className={styles.shelfFilterInput}
                  />
                )}
              </div>

              {filteredShelfGames.length > 0 ? (
                <div className={styles.gamesList}>
                  {filteredShelfGames.map((game) => (
                    <div 
                      key={game.id} 
                      className={styles.gameRow}
                      onClick={() => {
                        if (onSelectGame) {
                          onSelectGame(game);
                          onClose();
                        }
                      }}
                      title="Cliquer pour voir la fiche détaillée"
                    >
                      <div className={styles.gameThumbnailWrapper}>
                        {game.thumbnail_url || game.image_url ? (
                          <img
                            src={game.thumbnail_url || game.image_url}
                            alt={game.title}
                            className={styles.gameThumbnail}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className={styles.gamePlaceholder}>🎲</div>
                        )}
                      </div>

                      <div className={styles.gameInfo}>
                        <div className={styles.gameTitleLine}>
                          <h4 className={styles.gameTitle}>{game.title}</h4>
                          {game.year_published && (
                            <span className={styles.gameYear}>({game.year_published})</span>
                          )}
                          {game.item_type === 'expansion' && (
                            <span className={styles.expansionBadge}>Extension</span>
                          )}
                        </div>

                        <div className={styles.gameMetaLine}>
                          {game.rating && (
                            <span className={styles.ratingBadge}>
                              ⭐ {game.rating.toFixed(1)}
                            </span>
                          )}
                          {game.num_plays > 0 && (
                            <span className={styles.playsBadge}>
                              🎲 {game.num_plays} {game.num_plays > 1 ? 'parties' : 'partie'}
                            </span>
                          )}
                          {game.min_players && (
                            <span className={styles.metaItem}>
                              👤 {game.min_players === game.max_players ? `${game.min_players}J` : `${game.min_players}-${game.max_players}J`}
                            </span>
                          )}
                          {game.playing_time && (
                            <span className={styles.metaItem}>
                              ⏳ {game.playing_time} min
                            </span>
                          )}
                        </div>

                        {Array.isArray(game.customTags) && game.customTags.length > 0 && (
                          <div className={styles.tagsContainer}>
                            {game.customTags.map(tag => (
                              <span key={tag} className={styles.tagPill}>
                                🏷️ {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className={styles.rowAction}>
                        <span className={styles.viewDetailsBtn}>Voir la fiche ↗</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyShelf}>
                  <span>📭</span>
                  <p>
                    {shelfGames.length === 0
                      ? `Aucun jeu n'est actuellement assigné à l'emplacement "${selectedLocation}".`
                      : `Aucun jeu ne correspond au filtre "${shelfFilter}".`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pied de page */}
        <div className={styles.footer}>
          <button type="button" className={styles.closeBtnFooter} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
