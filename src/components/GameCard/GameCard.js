'use client';

import styles from './GameCard.module.css';

export default function GameCard({ game, viewMode = 'grid', onClick, onEditLocation }) {
  // Déterminer la chaîne de caractères pour le nombre de joueurs
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

  // Gérer le clic sur le badge de localisation pour éviter d'ouvrir les détails
  const handleLocationClick = (e) => {
    e.stopPropagation();
    onEditLocation(game);
  };

  if (viewMode === 'list') {
    return (
      <div className={`${styles.listCard} animate-fade-in`} onClick={() => onClick(game)}>
        <div className={styles.listImageWrapper}>
          {game.thumbnail_url || game.image_url ? (
            <img 
              src={game.thumbnail_url || game.image_url} 
              alt={game.title} 
              className={styles.listImage} 
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={styles.listImagePlaceholder}>🎲</div>
          )}
        </div>
        
        <div className={styles.listContent}>
          <div className={styles.listMainInfo}>
            <span className={styles.listTitle} title={game.title}>{game.title}</span>
            {game.year_published && <span className={styles.listYear}>({game.year_published})</span>}
            {game.item_type === 'expansion' && (
              <span className={styles.expansionBadge}>Extension</span>
            )}
          </div>
          
          <div className={styles.listMetaInfo}>
            {game.rating && (
              <span className={styles.listRatingBadge} title="Votre note">
                ⭐ {game.rating.toFixed(1)}
              </span>
            )}
            {game.num_plays > 0 && (
              <span className={styles.listPlaysBadge}>
                🎲 {game.num_plays} {game.num_plays > 1 ? 'part.' : 'part.'}
              </span>
            )}
            <span className={styles.listStatItem}>
              👤 {playersStr}
            </span>
            {game.playing_time && (
              <span className={styles.listStatItem}>
                ⏳ {game.playing_time} min
              </span>
            )}
          </div>
          
          <div className={styles.listLocationWrapper}>
            {game.location ? (
              <div 
                className={`${styles.listLocationBadge} ${styles.listHasLocation}`}
                onClick={handleLocationClick}
                title="Modifier l'emplacement"
              >
                <span className={styles.listLocationIcon}>📍</span>
                <span className={styles.listLocationText}>{game.location}</span>
                <span className={styles.listEditIcon}>✏️</span>
              </div>
            ) : (
              <button 
                className={`${styles.listLocationBadge} ${styles.listNoLocation}`}
                onClick={handleLocationClick}
              >
                <span className={styles.listLocationIcon}>➕</span>
                <span className={styles.listLocationText}>Ranger</span>
              </button>
            )}

            {Array.isArray(game.customTags) && game.customTags.length > 0 && (
              <div className={styles.listTagsContainer}>
                {game.customTags.map((tag) => (
                  <span key={tag} className={styles.tagPill}>
                    🏷️ {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.card} animate-fade-in`} onClick={() => onClick(game)}>
      <div className={styles.imageContainer}>
        {game.image_url || game.thumbnail_url ? (
          <img 
            src={game.image_url || game.thumbnail_url} 
            alt={game.title} 
            className={styles.image} 
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={styles.imagePlaceholder}>
            <span>🎲</span>
            <span>Image indisponible</span>
          </div>
        )}
        
        {/* Afficher la note personnelle si présente */}
        {game.rating && (
          <div className={styles.ratingBadge} title="Votre note">
            ⭐ {game.rating.toFixed(1)}
          </div>
        )}

        {/* Afficher le nombre de parties si supérieur à 0 */}
        {game.num_plays > 0 && (
          <div className={styles.playsBadge}>
            🎲 {game.num_plays} {game.num_plays > 1 ? 'parties' : 'partie'}
          </div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.headerInfo}>
          <h3 className={styles.title} title={game.title}>
            {game.title}
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {game.year_published && (
              <span className={styles.year}>({game.year_published})</span>
            )}
            {game.item_type === 'expansion' && (
              <span className={styles.expansionBadge}>Extension</span>
            )}
          </div>
        </div>

        <div className={styles.details}>
          <span className={styles.detailItem}>
            👤 {playersStr}
          </span>
          {game.playing_time && (
            <span className={styles.detailItem}>
              ⏳ {game.playing_time} min
            </span>
          )}
        </div>

        <div className={styles.locationContainer}>
          {game.location ? (
            <div 
              className={`${styles.locationBadge} ${styles.hasLocation}`}
              onClick={handleLocationClick}
              title="Modifier l'emplacement"
            >
              <span className={styles.locationIcon}>📍</span>
              <span className={styles.locationText}>{game.location}</span>
              <span className={styles.editIcon}>✏️</span>
            </div>
          ) : (
            <button 
              className={`${styles.locationBadge} ${styles.noLocation}`}
              onClick={handleLocationClick}
            >
              <span className={styles.locationIcon}>➕</span>
              <span className={styles.locationText}>Emplacement</span>
            </button>
          )}
        </div>

        {Array.isArray(game.customTags) && game.customTags.length > 0 && (
          <div className={styles.tagsContainer}>
            {game.customTags.map((tag) => (
              <span key={tag} className={styles.tagPill}>
                🏷️ {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
