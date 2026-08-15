'use client';

import { useState } from 'react';
import styles from './TravelTagModal.module.css';

export default function TravelTagModal({ onClose, onTagApplied }) {
  const [tagName, setTagName] = useState('');
  const [keywords, setKeywords] = useState('');
  const [scanning, setScanning] = useState(false);
  const [gamesFound, setGamesFound] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleScan = async (e) => {
    e.preventDefault();
    if (!tagName.trim() || !keywords.trim()) {
      setError("Le nom du tag et les mots-clés de recherche sont requis.");
      return;
    }

    setScanning(true);
    setError(null);
    setGamesFound(null);

    try {
      const response = await fetch(`/api/tags?keywords=${encodeURIComponent(keywords.trim())}`);
      if (!response.ok) throw new Error("Erreur lors de la recherche.");
      
      const data = await response.json();
      
      // Initialiser chaque jeu trouvé avec selected = true
      const gamesWithSelection = (data.games || []).map(g => ({
        ...g,
        selected: true
      }));
      
      setGamesFound(gamesWithSelection);
    } catch (err) {
      console.error(err);
      setError("Impossible de scanner la collection.");
    } finally {
      setScanning(false);
    }
  };

  const handleToggleGame = (id) => {
    setGamesFound(prev => 
      prev.map(g => g.id === id ? { ...g, selected: !g.selected } : g)
    );
  };

  const handleToggleAll = (value) => {
    setGamesFound(prev => prev.map(g => ({ ...g, selected: value })));
  };

  const handleApplyTag = async () => {
    const selectedIds = gamesFound.filter(g => g.selected).map(g => g.id);
    
    if (selectedIds.length === 0) {
      setError("Veuillez sélectionner au moins un jeu.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const cleanTagName = tagName.trim();
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tagName: cleanTagName,
          gameIds: selectedIds,
        }),
      });

      if (!response.ok) throw new Error("Erreur d'enregistrement.");

      // Notifier le composant parent de l'association
      onTagApplied(cleanTagName, selectedIds);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Impossible d'associer le mot-clé.");
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = gamesFound ? gamesFound.filter(g => g.selected).length : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>🔍 Assistant Voyage & Thématique</h2>
          <button className={styles.closeButton} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.instructions}>
            Créez un mot-clé pour votre voyage et scannez les descriptions de vos jeux pour détecter des indices (ex: nom de pays, divinités, lieux historiques).
          </p>

          {!gamesFound ? (
            /* Étape 1 : Formulaire de scan */
            <form onSubmit={handleScan} className={styles.scanForm}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="tagNameInput">
                  🏷️ Nom du mot-clé à créer (tag)
                </label>
                <input
                  id="tagNameInput"
                  type="text"
                  placeholder="Ex: Voyage Grèce, Voyage Japon"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  className={styles.input}
                  disabled={scanning}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="keywordsInput">
                  🔑 Mots-clés de détection (séparés par des virgules)
                </label>
                <input
                  id="keywordsInput"
                  type="text"
                  placeholder="Ex: grece, grec, zeus, athenes, sparte, cyclades"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  className={styles.input}
                  disabled={scanning}
                  required
                />
                <span className={styles.helper}>
                  L'application cherchera ces termes dans les titres et les descriptions de vos jeux.
                </span>
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.actions}>
                <button 
                  type="button" 
                  onClick={onClose} 
                  className={styles.cancelButton}
                  disabled={scanning}
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className={styles.submitButton}
                  disabled={scanning}
                >
                  {scanning ? 'Scan en cours...' : 'Scanner ma collection'}
                </button>
              </div>
            </form>
          ) : (
            /* Étape 2 : Liste des résultats et application */
            <div className={styles.resultsContainer}>
              <div className={styles.resultsHeader}>
                <h3>Jeux détectés pour le mot-clé : <span className={styles.tagHighlight}>{tagName}</span></h3>
                <span className={styles.resultCount}>
                  {gamesFound.length} jeu{gamesFound.length > 1 ? 'x' : ''} détecté{gamesFound.length > 1 ? 's' : ''}
                </span>
              </div>

              {gamesFound.length > 0 ? (
                <>
                  <div className={styles.selectionControls}>
                    <button 
                      type="button" 
                      onClick={() => handleToggleAll(true)}
                      className={styles.textButton}
                    >
                      Tout cocher
                    </button>
                    <span className={styles.separator}>|</span>
                    <button 
                      type="button" 
                      onClick={() => handleToggleAll(false)}
                      className={styles.textButton}
                    >
                      Tout décocher
                    </button>
                  </div>

                  <div className={styles.gamesList}>
                    {gamesFound.map((game) => (
                      <div 
                        key={game.id} 
                        className={`${styles.gameRow} ${game.selected ? styles.selectedRow : ''}`}
                        onClick={() => handleToggleGame(game.id)}
                      >
                        <input
                          type="checkbox"
                          checked={game.selected}
                          onChange={() => {}} // géré par le clic sur la ligne
                          className={styles.checkbox}
                        />
                        <div className={styles.thumbnailWrapper}>
                          {game.thumbnail_url ? (
                            <img 
                              src={game.thumbnail_url} 
                              alt={game.title} 
                              className={styles.thumbnail}
                            />
                          ) : (
                            <div className={styles.thumbnailPlaceholder}>🎲</div>
                          )}
                        </div>
                        <div className={styles.gameInfo}>
                          <span className={styles.gameTitle}>{game.title}</span>
                          {game.year_published && (
                            <span className={styles.gameYear}>({game.year_published})</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {error && <div className={styles.error}>{error}</div>}

                  <div className={styles.actions}>
                    <button 
                      type="button" 
                      onClick={() => setGamesFound(null)} 
                      className={styles.cancelButton}
                      disabled={saving}
                    >
                      Modifier la recherche
                    </button>
                    <button 
                      type="button" 
                      onClick={handleApplyTag} 
                      className={styles.submitButton}
                      disabled={saving || selectedCount === 0}
                    >
                      {saving ? 'Enregistrement...' : `Appliquer à ${selectedCount} jeu${selectedCount > 1 ? 'x' : ''}`}
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.noResults}>
                  <p>Aucun jeu ne contient les mots-clés recherchés.</p>
                  <div className={styles.actionsSingle}>
                    <button 
                      type="button" 
                      onClick={() => setGamesFound(null)} 
                      className={styles.cancelButton}
                    >
                      Recommencer la recherche
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
