'use client';

import { useState } from 'react';
import styles from './AdminManagerModal.module.css';

export default function AdminManagerModal({
  games = [],
  existingLocations = [],
  allCustomTags = [],
  onClose,
  onLocationRenamed,
  onLocationDeleted,
  onLocationCreated,
  onTagRenamed,
  onTagDeleted,
  onTagCreated,
}) {
  const [activeTab, setActiveTab] = useState('locations'); // 'locations' ou 'tags'
  const [searchQuery, setSearchQuery] = useState('');
  const [newLocationInput, setNewLocationInput] = useState('');
  const [newTagInput, setNewTagInput] = useState('');

  // États pour l'édition en cours
  const [editingItem, setEditingItem] = useState(null); // { type: 'location'|'tag', oldName: string }
  const [editValue, setEditValue] = useState('');

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Calcul du nombre de jeux par emplacement
  const locationGameCounts = {};
  games.forEach(g => {
    if (g.location && g.location.trim()) {
      const loc = g.location.trim();
      locationGameCounts[loc] = (locationGameCounts[loc] || 0) + 1;
    }
  });

  // Liste de tous les emplacements (ceux avec jeux + ceux pré-créés)
  const allLocationsList = Array.from(
    new Set([...existingLocations, ...Object.keys(locationGameCounts)])
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  // Calcul du nombre de jeux par tag
  const tagGameCounts = {};
  games.forEach(g => {
    if (Array.isArray(g.customTags)) {
      g.customTags.forEach(t => {
        if (t && t.trim()) {
          const cleanT = t.trim();
          tagGameCounts[cleanT] = (tagGameCounts[cleanT] || 0) + 1;
        }
      });
    }
  });

  const allTagsList = Array.from(
    new Set([...allCustomTags, ...Object.keys(tagGameCounts)])
  ).sort((a, b) => a.localeCompare(b));

  // Filtrage par recherche
  const filteredLocations = allLocationsList.filter(l =>
    l.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const filteredTags = allTagsList.filter(t =>
    t.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // --- ACTIONS EMPLACEMENTS ---
  const handleAddLocation = (e) => {
    e.preventDefault();
    const loc = newLocationInput.trim();
    if (!loc) return;

    if (allLocationsList.includes(loc)) {
      setFeedback({ type: 'error', message: `L'emplacement "${loc}" existe déjà.` });
      return;
    }

    if (onLocationCreated) {
      onLocationCreated(loc);
    }
    setNewLocationInput('');
    setFeedback({ type: 'success', message: `Emplacement "${loc}" ajouté avec succès.` });
  };

  const handleSaveRenameLocation = async (oldName) => {
    const newName = editValue.trim();
    if (!newName || newName === oldName) {
      setEditingItem(null);
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/admin/locations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', oldName, newName })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors du renommage.");

      if (onLocationRenamed) {
        onLocationRenamed(oldName, newName);
      }

      setEditingItem(null);
      setFeedback({ type: 'success', message: `"${oldName}" a été renommé en "${newName}" sur tous les jeux.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLocation = async (locationName) => {
    const count = locationGameCounts[locationName] || 0;
    const confirmMsg = count > 0
      ? `Êtes-vous sûr de vouloir supprimer l'emplacement "${locationName}" ? ${count} jeu(x) ne seront plus assignés à cette tablette.`
      : `Supprimer l'emplacement "${locationName}" ?`;

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/admin/locations?name=${encodeURIComponent(locationName)}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la suppression.");

      if (onLocationDeleted) {
        onLocationDeleted(locationName);
      }

      setFeedback({ type: 'success', message: `L'emplacement "${locationName}" a été supprimé.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // --- ACTIONS TAGS ---
  const handleAddTag = async (e) => {
    e.preventDefault();
    const tag = newTagInput.trim();
    if (!tag) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagName: tag })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la création du mot-clé.");

      if (onTagCreated) {
        onTagCreated(tag);
      }
      setNewTagInput('');
      setFeedback({ type: 'success', message: `Mot-clé "${tag}" créé avec succès.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRenameTag = async (oldName) => {
    const newName = editValue.trim();
    if (!newName || newName === oldName) {
      setEditingItem(null);
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename', oldName, newName })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors du renommage.");

      if (onTagRenamed) {
        onTagRenamed(oldName, newName);
      }

      setEditingItem(null);
      setFeedback({ type: 'success', message: `Mot-clé "${oldName}" renommé en "${newName}".` });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (tagName) => {
    const count = tagGameCounts[tagName] || 0;
    const confirmMsg = count > 0
      ? `Supprimer définitivement le mot-clé "${tagName}" ? Il sera retiré de ${count} jeu(x).`
      : `Supprimer le mot-clé "${tagName}" ?`;

    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/tags?tagName=${encodeURIComponent(tagName)}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la suppression.");

      if (onTagDeleted) {
        onTagDeleted(tagName);
      }

      setFeedback({ type: 'success', message: `Le mot-clé "${tagName}" a été supprimé.` });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* En-tête */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.headerIcon}>⚙️</span>
            <div>
              <h2 className={styles.title}>Gestion de l'Organisation</h2>
              <span className={styles.subtitle}>Gérer et modifier vos emplacements et vos mots-clés</span>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>

        {/* Navigation par Onglets */}
        <div className={styles.tabsNav}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'locations' ? styles.activeTab : ''}`}
            onClick={() => { setActiveTab('locations'); setFeedback(null); setEditingItem(null); }}
          >
            <span>📍</span> Emplacements (Tablettes)
            <span className={styles.tabBadge}>{allLocationsList.length}</span>
          </button>

          <button
            className={`${styles.tabBtn} ${activeTab === 'tags' ? styles.activeTab : ''}`}
            onClick={() => { setActiveTab('tags'); setFeedback(null); setEditingItem(null); }}
          >
            <span>🏷️</span> Mots-Clés (Tags)
            <span className={styles.tabBadge}>{allTagsList.length}</span>
          </button>
        </div>

        {/* Corps */}
        <div className={styles.body}>
          {/* Message de confirmation ou d'erreur */}
          {feedback && (
            <div className={`${styles.feedbackMsg} ${styles[feedback.type]}`}>
              {feedback.message}
            </div>
          )}

          {/* SECTION 1 : EMPLACEMENTS */}
          {activeTab === 'locations' && (
            <>
              {/* Formulaire d'ajout */}
              <form className={styles.addForm} onSubmit={handleAddLocation}>
                <input
                  type="text"
                  placeholder="Nouvel emplacement (ex: C1, Kallax 2, Bureau...)"
                  value={newLocationInput}
                  onChange={(e) => setNewLocationInput(e.target.value)}
                  className={styles.addInput}
                />
                <button type="submit" className={styles.addBtn} disabled={!newLocationInput.trim() || loading}>
                  ➕ Ajouter
                </button>
              </form>

              {/* Barre de filtre recherche */}
              {allLocationsList.length > 5 && (
                <div className={styles.searchBar}>
                  <span className={styles.searchIcon}>🔍</span>
                  <input
                    type="text"
                    placeholder="Filtrer les emplacements..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
              )}

              {/* Liste des emplacements */}
              <div className={styles.itemList}>
                {filteredLocations.map((loc) => {
                  const isEditing = editingItem?.type === 'location' && editingItem?.oldName === loc;
                  const count = locationGameCounts[loc] || 0;

                  return (
                    <div key={loc} className={styles.itemCard}>
                      {isEditing ? (
                        <div className={styles.editRow}>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className={styles.editInput}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRenameLocation(loc);
                              if (e.key === 'Escape') setEditingItem(null);
                            }}
                          />
                          <button
                            type="button"
                            className={styles.saveBtn}
                            onClick={() => handleSaveRenameLocation(loc)}
                            disabled={loading}
                          >
                            💾 Valider
                          </button>
                          <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={() => setEditingItem(null)}
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className={styles.itemLeft}>
                            <span className={styles.itemPill}>📍 {loc}</span>
                            <span className={styles.itemMeta}>
                              {count} jeu{count > 1 ? 'x' : ''} rangé{count > 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.actionBtn}
                              onClick={() => {
                                setEditingItem({ type: 'location', oldName: loc });
                                setEditValue(loc);
                              }}
                              disabled={loading}
                              title="Renommer l'emplacement"
                            >
                              ✏️ Renommer
                            </button>

                            <button
                              type="button"
                              className={`${styles.actionBtn} ${styles.deleteBtn}`}
                              onClick={() => handleDeleteLocation(loc)}
                              disabled={loading}
                              title="Supprimer l'emplacement"
                            >
                              🗑️ Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {filteredLocations.length === 0 && (
                  <div className={styles.emptyMsg}>
                    Aucun emplacement correspondant trouvé.
                  </div>
                )}
              </div>
            </>
          )}

          {/* SECTION 2 : MOTS-CLÉS (TAGS) */}
          {activeTab === 'tags' && (
            <>
              {/* Formulaire d'ajout */}
              <form className={styles.addForm} onSubmit={handleAddTag}>
                <input
                  type="text"
                  placeholder="Nouveau mot-clé (ex: Voyage, Solo, Favori...)"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  className={styles.addInput}
                />
                <button type="submit" className={styles.addBtn} disabled={!newTagInput.trim() || loading}>
                  ➕ Créer Tag
                </button>
              </form>

              {/* Barre de filtre recherche */}
              {allTagsList.length > 5 && (
                <div className={styles.searchBar}>
                  <span className={styles.searchIcon}>🔍</span>
                  <input
                    type="text"
                    placeholder="Filtrer les mots-clés..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
              )}

              {/* Liste des tags */}
              <div className={styles.itemList}>
                {filteredTags.map((tag) => {
                  const isEditing = editingItem?.type === 'tag' && editingItem?.oldName === tag;
                  const count = tagGameCounts[tag] || 0;

                  return (
                    <div key={tag} className={styles.itemCard}>
                      {isEditing ? (
                        <div className={styles.editRow}>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className={styles.editInput}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRenameTag(tag);
                              if (e.key === 'Escape') setEditingItem(null);
                            }}
                          />
                          <button
                            type="button"
                            className={styles.saveBtn}
                            onClick={() => handleSaveRenameTag(tag)}
                            disabled={loading}
                          >
                            💾 Valider
                          </button>
                          <button
                            type="button"
                            className={styles.cancelBtn}
                            onClick={() => setEditingItem(null)}
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className={styles.itemLeft}>
                            <span className={`${styles.itemPill} ${styles.tagPill}`}>🏷️ {tag}</span>
                            <span className={styles.itemMeta}>
                              {count} jeu{count > 1 ? 'x' : ''} associé{count > 1 ? 's' : ''}
                            </span>
                          </div>

                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.actionBtn}
                              onClick={() => {
                                setEditingItem({ type: 'tag', oldName: tag });
                                setEditValue(tag);
                              }}
                              disabled={loading}
                              title="Renommer le mot-clé"
                            >
                              ✏️ Renommer
                            </button>

                            <button
                              type="button"
                              className={`${styles.actionBtn} ${styles.deleteBtn}`}
                              onClick={() => handleDeleteTag(tag)}
                              disabled={loading}
                              title="Supprimer le mot-clé"
                            >
                              🗑️ Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                {filteredTags.length === 0 && (
                  <div className={styles.emptyMsg}>
                    Aucun mot-clé trouvé.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Pied de page */}
        <div className={styles.footer}>
          <button type="button" className={styles.closeFooterBtn} onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
