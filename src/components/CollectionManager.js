'use client';

import { useState } from 'react';
import GameCard from './GameCard/GameCard';
import GameDetailModal from './GameDetailModal/GameDetailModal';
import ImportModal from './ImportModal/ImportModal';
import TravelTagModal from './TravelTagModal/TravelTagModal';
import InventorySyncModal from './InventorySyncModal/InventorySyncModal';
import ShelfView from './ShelfView/ShelfView';
import styles from './CollectionManager.module.css';

// Supprime les accents, trémas, macrons et signes diacritiques (ex: Gùgōng -> gugong, Château -> chateau)
function stripDiacritics(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function CollectionManager({ initialGames = [], allMechanics = [], allThemes = [] }) {
  const [games, setGames] = useState(initialGames);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMechanic, setSelectedMechanic] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('');
  const [selectedCustomTag, setSelectedCustomTag] = useState('');
  const [playerCount, setPlayerCount] = useState('');
  const [locationFilter, setLocationFilter] = useState('all'); // 'all', 'placed', 'unplaced'
  const [sortBy, setSortBy] = useState('title'); // 'title', 'rating', 'plays', 'year'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' ou 'list'
  const [itemTypeFilter, setItemTypeFilter] = useState('all'); // 'all', 'standalone', 'expansion'

  // États pour les modales
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isTravelOpen, setIsTravelOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  
  // Quick location edit states
  const [quickEditGame, setQuickEditGame] = useState(null);
  const [quickLocation, setQuickLocation] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState(null);

  // Mettre à jour un jeu dans l'état local
  const handleUpdateGame = (gameId, updatedFields) => {
    setGames(prevGames =>
      prevGames.map(game =>
        game.id === gameId ? { ...game, ...updatedFields } : game
      )
    );
  };

  // Traiter les mises à jour de synchronisation d'inventaire
  const handleSyncSuccess = (updates, gameIdsToClear = []) => {
    const updateMap = new Map(updates.map(u => [u.gameId, u.location]));
    const clearSet = new Set(gameIdsToClear);

    setGames(prevGames =>
      prevGames.map(game => {
        if (updateMap.has(game.id)) {
          return { ...game, location: updateMap.get(game.id) };
        }
        if (clearSet.has(game.id)) {
          return { ...game, location: null };
        }
        return game;
      })
    );
  };

  // Associer en lot un tag à plusieurs jeux
  const handleTagApplied = (tagName, gameIds) => {
    setGames(prevGames =>
      prevGames.map(game => {
        if (gameIds.includes(game.id)) {
          const currentTags = game.customTags || [];
          if (!currentTags.includes(tagName)) {
            return { ...game, customTags: [...currentTags, tagName] };
          }
        }
        return game;
      })
    );
    setSelectedCustomTag(tagName); // Filtrer automatiquement sur ce tag
  };

  // Lancer l'édition rapide de la localisation
  const handleStartQuickEdit = (game) => {
    setQuickEditGame(game);
    setQuickLocation(game.location || '');
    setQuickError(null);
  };

  // Enregistrer la localisation rapide
  const handleSaveQuickLocation = async (e) => {
    e.preventDefault();
    if (!quickEditGame) return;

    setQuickSaving(true);
    setQuickError(null);

    try {
      const response = await fetch('/api/games/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: quickEditGame.id,
          location: quickLocation.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Erreur de sauvegarde");
      }

      handleUpdateGame(quickEditGame.id, { location: quickLocation.trim() });
      setQuickEditGame(null);
    } catch (err) {
      setQuickError("Impossible de sauvegarder.");
    } finally {
      setQuickSaving(false);
    }
  };

  // Réinitialiser tous les filtres
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedMechanic('');
    setSelectedTheme('');
    setSelectedCustomTag('');
    setPlayerCount('');
    setLocationFilter('all');
    setItemTypeFilter('all');
  };

  // Appliquer les filtres
  const filteredGames = games.filter((game) => {
    // Recherche par texte (insensible à la casse, aux accents et aux signes diacritiques)
    if (searchQuery) {
      const query = stripDiacritics(searchQuery).trim();
      const matchTitle = stripDiacritics(game.title).includes(query);
      const matchDesc = game.description ? stripDiacritics(game.description).includes(query) : false;
      if (!matchTitle && !matchDesc) return false;
    }

    // Filtre par mécanique
    if (selectedMechanic && (!game.mechanics || !game.mechanics.includes(selectedMechanic))) {
      return false;
    }

    // Filtre par thématique
    if (selectedTheme && (!game.themes || !game.themes.includes(selectedTheme))) {
      return false;
    }

    // Filtre par mot-clé personnalisé (tag)
    if (selectedCustomTag && (!game.customTags || !game.customTags.includes(selectedCustomTag))) {
      return false;
    }

    // Filtre par nombre de joueurs
    if (playerCount) {
      const count = parseInt(playerCount, 10);
      if (!isNaN(count)) {
        if (game.min_players && game.min_players > count) return false;
        if (game.max_players && game.max_players < count) return false;
      }
    }

    // Filtre par statut de rangement (localisation)
    if (locationFilter === 'placed' && (!game.location || game.location.trim() === '')) {
      return false;
    }
    if (locationFilter === 'unplaced' && game.location && game.location.trim() !== '') {
      return false;
    }

    // Filtre par type de jeu (standalone / expansion)
    if (itemTypeFilter !== 'all') {
      if (itemTypeFilter === 'standalone' && game.item_type !== 'standalone') {
        return false;
      }
      if (itemTypeFilter === 'expansion' && game.item_type !== 'expansion') {
        return false;
      }
    }

    return true;
  });

  // Appliquer le tri
  const sortedGames = [...filteredGames].sort((a, b) => {
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    }
    if (sortBy === 'rating') {
      const ratingA = a.rating === null ? -1 : a.rating;
      const ratingB = b.rating === null ? -1 : b.rating;
      return ratingB - ratingA; // Ordre décroissant de note
    }
    if (sortBy === 'plays') {
      return b.num_plays - a.num_plays; // Plus joués en premier
    }
    if (sortBy === 'year') {
      const yearA = a.year_published === null ? -1 : a.year_published;
      const yearB = b.year_published === null ? -1 : b.year_published;
      return yearB - yearA; // Plus récents en premier
    }
    return 0;
  });

  // Nombre total de jeux rangés
  const placedCount = games.filter(g => g.location && g.location.trim() !== '').length;
  const standaloneCount = games.filter(g => g.item_type === 'standalone').length;
  const expansionCount = games.filter(g => g.item_type === 'expansion').length;
  const missingImagesCount = games.filter(g => !g.image_url && !g.thumbnail_url).length;

  // Extraire la liste dynamique de tous les tags personnalisés existants
  const allCustomTags = Array.from(new Set(games.flatMap(g => g.customTags || []))).sort();

  // Extraire la liste de tous les emplacements de rangement existants
  const allExistingLocations = Array.from(
    new Set(games.map(g => g.location ? g.location.trim() : '').filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  return (
    <div className={styles.dashboard}>
      {games.length === 0 ? (
        /* Écran d'accueil pour base vide (Onboarding) */
        <div className={styles.onboarding}>
          <div className={styles.onboardingIcon}>🎲</div>
          <h1>Bienvenue sur GeekShelf !</h1>
          <p>
            Votre bibliothèque locale de jeux de société est actuellement vide.
            Importez le fichier <strong>.csv</strong> exporté depuis votre profil BoardGameGeek pour afficher tous vos jeux avec leurs pochettes, thématiques et mécaniques.
          </p>
          <button 
            className={styles.onboardingButton}
            onClick={() => setIsImportOpen(true)}
          >
            📥 Importer ma collection BGG
          </button>
        </div>
      ) : (
        /* Layout principal du Dashboard */
        <div className={styles.layout}>
          
          {/* Panneau de filtres latéral */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarSection}>
              <h3>Recherche</h3>
              <input
                type="text"
                placeholder="Titre, description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchBar}
              />
            </div>

            <div className={styles.sidebarSection}>
              <h3>Nombre de joueurs</h3>
              <input
                type="number"
                min="1"
                placeholder="Ex: 3"
                value={playerCount}
                onChange={(e) => setPlayerCount(e.target.value)}
                className={styles.numberInput}
              />
            </div>

            <div className={styles.sidebarSection}>
              <h3>Thématique</h3>
              <select
                value={selectedTheme}
                onChange={(e) => setSelectedTheme(e.target.value)}
                className={styles.select}
              >
                <option value="">Toutes les thématiques</option>
                {allThemes.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.sidebarSection}>
              <h3>Mécanique</h3>
              <select
                value={selectedMechanic}
                onChange={(e) => setSelectedMechanic(e.target.value)}
                className={styles.select}
              >
                <option value="">Toutes les mécaniques</option>
                {allMechanics.map((mech) => (
                  <option key={mech} value={mech}>
                    {mech}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.sidebarSection}>
              <h3>Mot-clé (Tag)</h3>
              <select
                value={selectedCustomTag}
                onChange={(e) => setSelectedCustomTag(e.target.value)}
                className={styles.select}
              >
                <option value="">Tous les mots-clés</option>
                {allCustomTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.sidebarSection}>
              <h3>Statut de rangement</h3>
              <div className={styles.buttonGroup}>
                <button
                  className={`${styles.filterBtn} ${locationFilter === 'all' ? styles.active : ''}`}
                  onClick={() => setLocationFilter('all')}
                >
                  Tous ({games.length})
                </button>
                <button
                  className={`${styles.filterBtn} ${locationFilter === 'placed' ? styles.active : ''}`}
                  onClick={() => setLocationFilter('placed')}
                >
                  📍 Rangés ({placedCount})
                </button>
                <button
                  className={`${styles.filterBtn} ${locationFilter === 'unplaced' ? styles.active : ''}`}
                  onClick={() => setLocationFilter('unplaced')}
                >
                  ❓ À ranger ({games.length - placedCount})
                </button>
              </div>
            </div>

            <div className={styles.sidebarSection}>
              <h3>Type de jeu</h3>
              <div className={styles.buttonGroup}>
                <button
                  className={`${styles.filterBtn} ${itemTypeFilter === 'all' ? styles.active : ''}`}
                  onClick={() => setItemTypeFilter('all')}
                >
                  Tous ({games.length})
                </button>
                <button
                  className={`${styles.filterBtn} ${itemTypeFilter === 'standalone' ? styles.active : ''}`}
                  onClick={() => setItemTypeFilter('standalone')}
                >
                  📦 Jeux de base ({standaloneCount})
                </button>
                <button
                  className={`${styles.filterBtn} ${itemTypeFilter === 'expansion' ? styles.active : ''}`}
                  onClick={() => setItemTypeFilter('expansion')}
                >
                  🧩 Extensions ({expansionCount})
                </button>
              </div>
            </div>

            {(searchQuery || selectedTheme || selectedMechanic || selectedCustomTag || playerCount || locationFilter !== 'all' || itemTypeFilter !== 'all') && (
              <button 
                onClick={handleResetFilters} 
                className={styles.resetButton}
              >
                Réinitialiser les filtres
              </button>
            )}
          </aside>

          {/* Zone principale (Collection + Barre d'outils) */}
          <main className={styles.main}>
            {missingImagesCount > 0 && (
              <div className={styles.imageNotice}>
                <span>🖼️ <strong>{missingImagesCount} jeu{missingImagesCount > 1 ? 'x' : ''}</strong> dans votre collection n'ont pas d'image sur BGG (ex: promos/extensions non publiées).</span>
                <button onClick={() => setIsImportOpen(true)} className={styles.noticeBtn}>
                  🔄 Réimporter un CSV / Actualiser
                </button>
              </div>
            )}

            <div className={styles.toolbar}>
              <div className={styles.resultsInfo}>
                <h2>Ma Collection</h2>
                <span>
                  {filteredGames.length} jeu{filteredGames.length > 1 ? 'x' : ''} trouvé{filteredGames.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className={styles.actions}>
                <div className={styles.viewToggleGroup}>
                  <button
                    className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.activeToggle : ''}`}
                    onClick={() => setViewMode('grid')}
                    title="Mode Grille"
                    aria-label="Mode Grille"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                  </button>
                  <button
                    className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.activeToggle : ''}`}
                    onClick={() => setViewMode('list')}
                    title="Mode Liste"
                    aria-label="Mode Liste"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="8" y1="6" x2="21" y2="6"></line>
                      <line x1="8" y1="12" x2="21" y2="12"></line>
                      <line x1="8" y1="18" x2="21" y2="18"></line>
                      <line x1="3" y1="6" x2="3.01" y2="6"></line>
                      <line x1="3" y1="12" x2="3.01" y2="12"></line>
                      <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                  </button>
                  <button
                    className={`${styles.toggleBtn} ${viewMode === 'shelf' ? styles.activeToggle : ''}`}
                    onClick={() => setViewMode('shelf')}
                    title="Mode Bibliothèque (Tablettes physiques)"
                    aria-label="Mode Bibliothèque"
                  >
                    📚
                  </button>
                </div>

                <div className={styles.sortControl}>
                  <label htmlFor="sortBy">Trier par :</label>
                  <select
                    id="sortBy"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className={styles.selectSort}
                  >
                    <option value="title">Nom (A-Z)</option>
                    <option value="rating">Votre Note</option>
                    <option value="plays">Nombre de parties</option>
                    <option value="year">Année de sortie</option>
                  </select>
                </div>

                <button 
                  className={styles.syncBtn}
                  onClick={() => setIsSyncOpen(true)}
                  title="Synchroniser un inventaire physique (Google Sheet)"
                >
                  📋 Synchro Sheet
                </button>

                <button 
                  className={styles.travelBtn}
                  onClick={() => setIsTravelOpen(true)}
                  title="Rechercher des thèmes de voyage par mots-clés"
                >
                  🔍 Assistant Voyage
                </button>

                <button 
                  className={styles.importBtn}
                  onClick={() => setIsImportOpen(true)}
                >
                  📥 Réimporter un CSV
                </button>
              </div>
            </div>

            {/* Grille, Liste ou Mode Bibliothèque (Tablettes) */}
            {viewMode === 'shelf' ? (
              <ShelfView 
                games={filteredGames}
                onSelectGame={setSelectedGame}
              />
            ) : sortedGames.length > 0 ? (
              <div className={viewMode === 'grid' ? styles.grid : styles.listLayout}>
                {sortedGames.map((game) => (
                  <GameCard 
                    key={game.id} 
                    game={game} 
                    viewMode={viewMode}
                    onClick={setSelectedGame}
                    onEditLocation={handleStartQuickEdit}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <h3>Aucun jeu trouvé</h3>
                <p>Aucun de vos jeux ne correspond à vos filtres actuels. Modifiez vos critères ou réinitialisez les filtres.</p>
                <button onClick={handleResetFilters} className={styles.onboardingButton}>
                  Voir toute la collection
                </button>
              </div>
            )}
          </main>

        </div>
      )}

      {/* Modale d'importation */}
      {isImportOpen && (
        <ImportModal onClose={() => setIsImportOpen(false)} />
      )}

      {/* Modale de détails de jeu */}
      {selectedGame && (
        <GameDetailModal 
          game={selectedGame} 
          allCustomTags={allCustomTags}
          onClose={() => setSelectedGame(null)}
          onUpdateGame={(gameId, fields) => {
            handleUpdateGame(gameId, fields);
            setSelectedGame(prev => prev ? { ...prev, ...fields } : null);
          }}
        />
      )}

      {/* Modale d'assistant de voyage (auto-tagging) */}
      {isTravelOpen && (
        <TravelTagModal 
          onClose={() => setIsTravelOpen(false)}
          onTagApplied={handleTagApplied}
        />
      )}

      {/* Modale de synchronisation d'inventaire Google Sheet */}
      {isSyncOpen && (
        <InventorySyncModal 
          onClose={() => setIsSyncOpen(false)}
          onSyncSuccess={handleSyncSuccess}
        />
      )}

      {/* Modale d'édition rapide de la localisation */}
      {quickEditGame && (
        <div className="modal-backdrop" onClick={() => setQuickEditGame(null)}>
          <div className={styles.quickModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.quickHeader}>
              <div className={styles.quickTitleGroup}>
                <span className={styles.quickIcon}>📍</span>
                <div>
                  <h3 className={styles.quickTitle}>Emplacement physique</h3>
                  <span className={styles.quickSubtitle}>Organisation de votre bibliothèque</span>
                </div>
              </div>
              <button 
                className={styles.quickClose} 
                onClick={() => setQuickEditGame(null)}
                aria-label="Fermer"
              >
                &times;
              </button>
            </div>

            <div className={styles.quickGamePreview}>
              <div className={styles.quickThumbWrapper}>
                {quickEditGame.image_url || quickEditGame.thumbnail_url ? (
                  <img 
                    src={quickEditGame.image_url || quickEditGame.thumbnail_url} 
                    alt={quickEditGame.title}
                    className={styles.quickThumb}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className={styles.quickThumbPlaceholder}>🎲</div>
                )}
              </div>
              <div className={styles.quickGameInfo}>
                <span className={styles.quickGameTitle}>{quickEditGame.title}</span>
                <div className={styles.quickGameMeta}>
                  {quickEditGame.year_published && <span>({quickEditGame.year_published})</span>}
                  {quickEditGame.item_type === 'expansion' && (
                    <span className={styles.quickExpansionBadge}>Extension</span>
                  )}
                </div>
              </div>
            </div>
            
            <form onSubmit={handleSaveQuickLocation} className={styles.quickForm}>
              <label className={styles.quickLabel}>
                Tablette / Emplacement de rangement :
              </label>
              
              <input
                type="text"
                placeholder="Ex: A1, Tablette 3, Boîte Kallax..."
                value={quickLocation}
                onChange={(e) => setQuickLocation(e.target.value)}
                className={styles.quickInput}
                autoFocus
                disabled={quickSaving}
              />

              {allExistingLocations.length > 0 && (
                <div className={styles.quickSuggestions}>
                  <span className={styles.quickSuggestionsLabel}>Emplacements existants :</span>
                  <div className={styles.quickSuggestionsList}>
                    {allExistingLocations.map(loc => (
                      <button
                        type="button"
                        key={loc}
                        className={styles.quickSuggestionPill}
                        onClick={() => setQuickLocation(loc)}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {quickError && <div className={styles.quickError}>{quickError}</div>}
              
              <div className={styles.quickActions}>
                <button 
                  type="button" 
                  onClick={() => setQuickEditGame(null)}
                  className={styles.quickCancel}
                  disabled={quickSaving}
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  className={styles.quickSave}
                  disabled={quickSaving}
                >
                  {quickSaving ? 'Sauvegarde...' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
