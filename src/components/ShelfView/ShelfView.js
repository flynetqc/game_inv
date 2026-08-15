'use client';

import { useState } from 'react';
import styles from './ShelfView.module.css';

// Palettes de couleurs réalistes pour les tranches de boîtes de jeux
const SPINE_GRADIENTS = [
  'linear-gradient(180deg, #ea580c 0%, #9a3412 100%)', // BGG Orange
  'linear-gradient(180deg, #2563eb 0%, #1e3a8a 100%)', // Bleu Royal
  'linear-gradient(180deg, #059669 0%, #064e3b 100%)', // Vert Émeraude
  'linear-gradient(180deg, #b45309 0%, #78350f 100%)', // Ambre / Cuivre
  'linear-gradient(180deg, #7c3aed 0%, #4c1d95 100%)', // Violet Réglisse
  'linear-gradient(180deg, #dc2626 0%, #991b1b 100%)', // Rouge Carmin
  'linear-gradient(180deg, #0d9488 0%, #115e59 100%)', // Teal / Turquoise
  'linear-gradient(180deg, #475569 0%, #1e293b 100%)', // Ardoise Anthracite
  'linear-gradient(180deg, #e11d48 0%, #881337 100%)', // Magenta / Rose
];

export default function ShelfView({ games = [], onSelectGame }) {
  const [hoveredGame, setHoveredGame] = useState(null);
  const [popupPos, setPopupPos] = useState(null);

  // Filtrer uniquement les JEUX DE BASE (standalone) qui ont un EMPLACEMENT de rangement
  const placedBaseGames = games.filter(
    g => g.item_type === 'standalone' && g.location && g.location.trim() !== ''
  );

  // Grouper les jeux par tablette / localisation (ex: "A1", "A2", "B1"...)
  const shelfGroups = placedBaseGames.reduce((acc, game) => {
    const loc = game.location.trim();
    if (!acc[loc]) {
      acc[loc] = [];
    }
    acc[loc].push(game);
    return acc;
  }, {});

  // Trier les étagères par ordre alphabétique de localisation (A1, A2, B1...)
  const sortedShelfLocations = Object.keys(shelfGroups).sort((a, b) => 
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );

  // Générer des propriétés visuelles déterministes basées sur l'ID du jeu
  const getSpineStyle = (game) => {
    const id = game.id || 0;
    const gradientIndex = id % SPINE_GRADIENTS.length;
    const height = 185 + (id % 36); // Hauteur entre 185px et 221px
    const width = 36 + (id % 20);   // Epaisseur de boîte entre 36px et 56px

    return {
      background: SPINE_GRADIENTS[gradientIndex],
      height: `${height}px`,
      width: `${width}px`,
    };
  };

  const handleMouseEnter = (e, game) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isNearTop = rect.top < 230;

    setPopupPos({
      top: isNearTop ? rect.bottom + 10 : rect.top - 10,
      left: rect.left + rect.width / 2,
      isFlipped: isNearTop
    });
    setHoveredGame(game);
  };

  const handleMouseLeave = () => {
    setHoveredGame(null);
    setPopupPos(null);
  };

  if (placedBaseGames.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📚</div>
        <h3>Aucun jeu de base rangé sur les tablettes</h3>
        <p>
          Pour voir apparaître vos jeux sur les étagères physiques de la bibliothèque, attribuez un emplacement de rangement (ex: <em>A1</em>, <em>Étagère B2</em>) à vos <strong>Jeux de base</strong> dans leur fiche ou via le bouton <strong>📋 Synchro Sheet</strong>.
        </p>
      </div>
    );
  }

  let playersStr = '';
  if (hoveredGame) {
    if (hoveredGame.min_players && hoveredGame.max_players) {
      playersStr = hoveredGame.min_players === hoveredGame.max_players ? `${hoveredGame.min_players} j.` : `${hoveredGame.min_players}-${hoveredGame.max_players} j.`;
    }
  }

  return (
    <div className={styles.container}>
      {/* En-tête résumé */}
      <div className={styles.summaryHeader}>
        <div className={styles.summaryTitle}>
          <span>📚 Mode Bibliothèque Physique</span>
        </div>
        <span className={styles.summaryCount}>
          {placedBaseGames.length} jeu{placedBaseGames.length > 1 ? 'x' : ''} de base rangé{placedBaseGames.length > 1 ? 's' : ''} sur {sortedShelfLocations.length} tablette{sortedShelfLocations.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Rendu des tablettes physiques */}
      {sortedShelfLocations.map((location) => {
        const shelfGames = shelfGroups[location];

        return (
          <div key={location} className={styles.shelfGroup}>
            {/* Titre de la tablette */}
            <div className={styles.shelfLabelRow}>
              <span className={styles.shelfBadge}>
                <span>📍 Tablette</span> <strong>{location}</strong>
              </span>
              <span className={styles.shelfGameCount}>
                {shelfGames.length} boîte{shelfGames.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Alignement des tranches verticales de boîtes de jeux */}
            <div className={styles.spineRack}>
              {shelfGames.map((game) => {
                const spineStyle = getSpineStyle(game);

                return (
                  <div
                    key={game.id}
                    className={styles.spine}
                    style={spineStyle}
                    onMouseEnter={(e) => handleMouseEnter(e, game)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => onSelectGame(game)}
                  >
                    {/* Note BGG en haut de la tranche */}
                    <div className={styles.spineTopRating}>
                      {game.rating ? `★${game.rating.toFixed(1)}` : '🎲'}
                    </div>

                    {/* Titre écrit verticalement le long de la tranche */}
                    <div className={styles.spineTitleWrapper}>
                      {game.title}
                    </div>

                    {/* Année de publication en bas de la tranche */}
                    <div className={styles.spineBottomYear}>
                      {game.year_published || ''}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Planche de bois de la tablette */}
            <div className={styles.shelfPlank} />
          </div>
        );
      })}

      {/* Floating Fixed Overlay Popup (Z-Index 99999) */}
      {hoveredGame && popupPos && (
        <div 
          className={`${styles.fixedPopup} ${popupPos.isFlipped ? styles.popupFlipped : ''}`}
          style={{
            top: `${popupPos.top}px`,
            left: `${popupPos.left}px`,
          }}
          onMouseEnter={() => {}} 
          onMouseLeave={handleMouseLeave}
          onClick={(e) => {
            e.stopPropagation();
            onSelectGame(hoveredGame);
            handleMouseLeave();
          }}
        >
          <div className={styles.popupImageWrapper}>
            {hoveredGame.image_url || hoveredGame.thumbnail_url ? (
              <img 
                src={hoveredGame.image_url || hoveredGame.thumbnail_url} 
                alt={hoveredGame.title} 
                className={styles.popupImage}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={styles.popupPlaceholder}>🎲</div>
            )}
          </div>

          <div className={styles.popupContent}>
            <span className={styles.popupTitle}>{hoveredGame.title}</span>
            
            <div className={styles.popupMeta}>
              {hoveredGame.year_published && <span>({hoveredGame.year_published})</span>}
              {hoveredGame.rating && (
                <span className={styles.popupRating}>⭐ {hoveredGame.rating.toFixed(1)}</span>
              )}
              {playersStr && <span>👤 {playersStr}</span>}
              {hoveredGame.location && (
                <span style={{ color: '#2563eb', fontWeight: '700' }}>📍 {hoveredGame.location}</span>
              )}
            </div>
          </div>

          <button 
            className={styles.popupBtn}
            onClick={(e) => {
              e.stopPropagation();
              onSelectGame(hoveredGame);
              handleMouseLeave();
            }}
          >
            🔍 Ouvrir la fiche détaillée
          </button>
        </div>
      )}
    </div>
  );
}
