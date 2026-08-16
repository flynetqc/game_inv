'use client';

import { useState } from 'react';
import styles from './GameDetailModal.module.css';

export default function GameDetailModal({ game, allCustomTags = [], onClose, onUpdateGame }) {
  const [location, setLocation] = useState(game.location || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  const [customTags, setCustomTags] = useState(game.customTags || []);
  const [newTag, setNewTag] = useState('');
  const [tagError, setTagError] = useState(null);

  const handleAddTag = async (e) => {
    e.preventDefault();
    const cleanTag = newTag.trim();
    if (!cleanTag) return;
    if (customTags.includes(cleanTag)) {
      setNewTag('');
      return;
    }

    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, tagName: cleanTag })
      });

      if (!response.ok) throw new Error("Erreur");

      const updatedTags = [...customTags, cleanTag];
      setCustomTags(updatedTags);
      onUpdateGame(game.id, { location: location.trim(), customTags: updatedTags });
      setTagError(null);
    } catch (err) {
      setTagError("Impossible d'ajouter le mot-clé.");
    } finally {
      setNewTag('');
    }
  };

  const handleQuickAddTag = async (tagName) => {
    if (customTags.includes(tagName)) return;
    try {
      const response = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, tagName })
      });

      if (!response.ok) throw new Error("Erreur");

      const updatedTags = [...customTags, tagName];
      setCustomTags(updatedTags);
      onUpdateGame(game.id, { location: location.trim(), customTags: updatedTags });
      setTagError(null);
    } catch (err) {
      setTagError("Impossible d'ajouter le mot-clé.");
    }
  };

  const handleRemoveTag = async (tagName) => {
    try {
      const response = await fetch(`/api/tags?gameId=${game.id}&tagName=${encodeURIComponent(tagName)}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error("Erreur");

      const updatedTags = customTags.filter(t => t !== tagName);
      setCustomTags(updatedTags);
      onUpdateGame(game.id, { location: location.trim(), customTags: updatedTags });
      setTagError(null);
    } catch (err) {
      setTagError("Impossible de supprimer le mot-clé.");
    }
  };

  const handleRemoveBarcode = async () => {
    if (confirm(`Dissocier et supprimer le code-barres (${game.barcode}) de ce jeu ?`)) {
      try {
        fetch('/api/games/update', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: game.id, barcode: null })
        }).catch(e => console.warn(e));

        onUpdateGame(game.id, { barcode: null });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/games/update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: game.id,
          location: location.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Une erreur est survenue lors de l'enregistrement.");
      }

      onUpdateGame(game.id, { location: location.trim(), customTags });
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || "Erreur de connexion avec le serveur.");
    } finally {
      setSaving(false);
    }
  };

  // Convertir le texte de description en paragraphes
  const renderDescription = (text) => {
    if (!text) return <p>Aucune description disponible.</p>;
    
    // Remplacer les retours à la ligne répétés pour obtenir des paragraphes propres
    return text
      .split('\n')
      .filter(p => p.trim() !== '')
      .map((paragraph, index) => (
        <p key={index} className={styles.paragraph}>
          {paragraph}
        </p>
      ));
  };

  let playersStr = '';
  if (game.min_players && game.max_players) {
    playersStr = game.min_players === game.max_players 
      ? `${game.min_players} Joueurs` 
      : `${game.min_players}-${game.max_players} Joueurs`;
  } else if (game.min_players || game.max_players) {
    playersStr = `${game.min_players || game.max_players} Joueurs`;
  } else {
    playersStr = 'N/A';
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          &times;
        </button>

        <div className={styles.container}>
          {/* Section Pochette & Édition Localisation */}
          <div className={styles.sidebar}>
            <div className={styles.imageWrapper}>
              {game.image_url || game.thumbnail_url ? (
                <img 
                  src={game.image_url || game.thumbnail_url} 
                  alt={game.title} 
                  className={styles.image}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className={styles.imagePlaceholder}>
                  <span>🎲</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSave} className={styles.locationForm}>
              <label htmlFor="locationInput" className={styles.label}>
                📍 Localisation dans la bibliothèque
              </label>
              <input
                id="locationInput"
                type="text"
                placeholder="Ex: Étagère A, Niveau 2"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className={styles.input}
                disabled={saving}
              />
              {error && <div className={styles.error}>{error}</div>}
              
              <div className={styles.formActions}>
                <button
                  type="button"
                  onClick={onClose}
                  className={styles.cancelButton}
                  disabled={saving}
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={saving}
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>

            {/* Section Code-barres (UPC) */}
            {game.barcode && (
              <div className={styles.barcodeBox}>
                <div className={styles.barcodeHeader}>
                  <span>📷</span>
                  <span className={styles.barcodeLabel}>Code-barres (UPC/EAN)</span>
                </div>
                <div className={styles.barcodeRow}>
                  <code className={styles.barcodeCode}>{game.barcode}</code>
                  <button
                    type="button"
                    onClick={handleRemoveBarcode}
                    className={styles.barcodeDeleteBtn}
                    title="Supprimer ce code-barres"
                  >
                    🗑️ Dissocier
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section Détails & Métadonnées */}
          <div className={styles.mainContent}>
            <div className={styles.header}>
              <h1 className={styles.title}>{game.title}</h1>
              <div className={styles.metaRow}>
                {game.year_published && (
                  <span className={styles.year}>{game.year_published}</span>
                )}
                {game.rating && (
                  <span className={styles.ratingBadge}>⭐ {game.rating.toFixed(1)} / 10</span>
                )}
                {game.num_plays > 0 && (
                  <span className={styles.playsBadge}>🎲 {game.num_plays} {game.num_plays > 1 ? 'parties' : 'partie'}</span>
                )}
                {game.item_type === 'expansion' && (
                  <span className={styles.expansionBadge}>Extension</span>
                )}
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statIcon}>👤</span>
                <span className={styles.statLabel}>Joueurs</span>
                <span className={styles.statValue}>{playersStr}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statIcon}>⏳</span>
                <span className={styles.statLabel}>Durée</span>
                <span className={styles.statValue}>{game.playing_time ? `${game.playing_time} min` : 'N/A'}</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statIcon}>🆔</span>
                <span className={styles.statLabel}>BGG ID</span>
                <span className={styles.statValue}>
                  <a 
                    href={`https://boardgamegeek.com/boardgame/${game.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.bggLink}
                  >
                    #{game.id} ↗
                  </a>
                </span>
              </div>
            </div>

            {/* Thématiques */}
            {game.themes && game.themes.length > 0 && (
              <div className={styles.tagSection}>
                <h3 className={styles.sectionTitle}>Thématiques</h3>
                <div className={styles.tagsContainer}>
                  {game.themes.map((theme) => (
                    <span key={theme} className={`${styles.tag} ${styles.themeTag}`}>
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mécaniques */}
            {game.mechanics && game.mechanics.length > 0 && (
              <div className={styles.tagSection}>
                <h3 className={styles.sectionTitle}>Mécaniques</h3>
                <div className={styles.tagsContainer}>
                  {game.mechanics.map((mechanic) => (
                    <span key={mechanic} className={`${styles.tag} ${styles.mechanicTag}`}>
                      {mechanic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mots-clés personnalisés (Tags) */}
            <div className={styles.tagSection}>
              <h3 className={styles.sectionTitle}>Mes Mots-clés (Tags)</h3>
              <div className={styles.tagsContainer}>
                {customTags.length > 0 ? (
                  customTags.map((tag) => (
                    <span key={tag} className={`${styles.tag} ${styles.customTag}`}>
                      {tag}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveTag(tag)}
                        className={styles.removeTagBtn}
                        title="Supprimer ce tag"
                      >
                        &times;
                      </button>
                    </span>
                  ))
                ) : (
                  <span className={styles.noTags}>Aucun mot-clé personnalisé.</span>
                )}
              </div>
              
              <form onSubmit={handleAddTag} className={styles.addTagForm}>
                <input
                  type="text"
                  list={`existing-tags-${game.id}`}
                  placeholder="Ajouter ou choisir un tag (ex: Grèce antique...)"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  className={styles.tagInput}
                />
                <datalist id={`existing-tags-${game.id}`}>
                  {allCustomTags.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <button type="submit" className={styles.addTagBtn}>
                  + Ajouter
                </button>
              </form>

              {allCustomTags.filter(t => !customTags.includes(t)).length > 0 && (
                <div className={styles.existingTagsBar}>
                  <span className={styles.existingTagsLabel}>🏷️ Mots-clés existants (cliquer pour ajouter) :</span>
                  <div className={styles.existingTagsList}>
                    {allCustomTags
                      .filter(t => !customTags.includes(t))
                      .map((tag) => (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => handleQuickAddTag(tag)}
                          className={styles.existingTagBtn}
                          title={`Ajouter "${tag}"`}
                        >
                          + {tag}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {tagError && <div className={styles.error}>{tagError}</div>}
            </div>

            {/* Description */}
            <div className={styles.descriptionSection}>
              <h3 className={styles.sectionTitle}>Description</h3>
              <div className={styles.descriptionText}>
                {renderDescription(game.description)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
