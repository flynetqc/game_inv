'use client';

import { useState, useEffect, useRef } from 'react';
import GameCard from './GameCard/GameCard';
import GameDetailModal from './GameDetailModal/GameDetailModal';
import ImportModal from './ImportModal/ImportModal';
import TravelTagModal from './TravelTagModal/TravelTagModal';
import InventorySyncModal from './InventorySyncModal/InventorySyncModal';
import ShelfView from './ShelfView/ShelfView';
import BarcodeScanModal from './BarcodeScanModal/BarcodeScanModal';
import AdminManagerModal from './AdminManagerModal/AdminManagerModal';
import { supabase } from '@/lib/supabase';
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
  const [sortBy, setSortBy] = useState('title'); // 'title', 'rating', 'plays', 'year'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' ou 'list'
  const [itemTypeFilter, setItemTypeFilter] = useState('all'); // 'all', 'standalone', 'expansion'

  // États pour les modales et le menu
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isTravelOpen, setIsTravelOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isBarcodeScanOpen, setIsBarcodeScanOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [customLocations, setCustomLocations] = useState([]);
  const [customDefinedTags, setCustomDefinedTags] = useState([]);
  
  const menuRef = useRef(null);
  
  // Quick location edit states
  const [quickEditGame, setQuickEditGame] = useState(null);
  const [quickLocation, setQuickLocation] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState(null);

  // Charger les modifications depuis Supabase Cloud et localStorage
  useEffect(() => {
    // 1. Chargement instantané depuis le stockage local du navigateur
    try {
      const savedCustomLocs = localStorage.getItem('geekshelf_custom_locations');
      if (savedCustomLocs) {
        const parsedLocs = JSON.parse(savedCustomLocs);
        if (Array.isArray(parsedLocs)) {
          setCustomLocations(parsedLocs.filter(Boolean));
        }
      }

      const savedCustomTags = localStorage.getItem('geekshelf_defined_tags');
      if (savedCustomTags) {
        const parsedTags = JSON.parse(savedCustomTags);
        if (Array.isArray(parsedTags)) {
          setCustomDefinedTags(parsedTags.filter(Boolean));
        }
      }

      const savedOverrides = localStorage.getItem('geekshelf_game_overrides');
      if (savedOverrides) {
        const overrides = JSON.parse(savedOverrides);
        if (overrides && typeof overrides === 'object') {
          setGames(prevGames =>
            prevGames.map(game => {
              if (overrides[game.id] && typeof overrides[game.id] === 'object') {
                return { ...game, ...overrides[game.id] };
              }
              return game;
            })
          );
        }
      }
    } catch (e) {
      console.error("Erreur lecture localStorage:", e);
    }

    // 2. Synchronisation Cloud Supabase (temps réel multi-appareils)
    const syncWithCloud = async () => {
      try {
        // a. Pousser d'abord les modifications du navigateur vers Supabase pour ne rien perdre
        const savedOverrides = localStorage.getItem('geekshelf_game_overrides');
        if (savedOverrides) {
          const localObj = JSON.parse(savedOverrides);
          if (localObj && typeof localObj === 'object') {
            const entries = Object.entries(localObj).filter(([id, val]) => {
              const numId = parseInt(id, 10);
              return !isNaN(numId) && numId > 0 && val && typeof val === 'object';
            });
            if (entries.length > 0) {
              const uploadBatch = entries.map(([id, val]) => ({
                game_id: parseInt(id, 10),
                location: val.location !== undefined ? val.location : undefined,
                barcode: val.barcode !== undefined ? val.barcode : undefined,
                custom_tags: val.customTags || undefined,
                updated_at: new Date().toISOString()
              }));
              await supabase.from('game_overrides').upsert(uploadBatch);
            }
          }
        }

        // b. Récupérer l'état complet depuis Supabase Cloud
        const { data, error } = await supabase.from('game_overrides').select('*');
        if (!error && data && data.length > 0) {
          const metaRow = data.find(item => item.game_id === -1);
          if (metaRow && Array.isArray(metaRow.custom_tags)) {
            setCustomLocations(prev => {
              const merged = Array.from(new Set([...prev, ...metaRow.custom_tags])).filter(Boolean);
              localStorage.setItem('geekshelf_custom_locations', JSON.stringify(merged));
              return merged;
            });
          }

          const metaTagsRow = data.find(item => item.game_id === -2);
          if (metaTagsRow && Array.isArray(metaTagsRow.custom_tags)) {
            setCustomDefinedTags(prev => {
              const merged = Array.from(new Set([...prev, ...metaTagsRow.custom_tags])).filter(Boolean);
              localStorage.setItem('geekshelf_defined_tags', JSON.stringify(merged));
              return merged;
            });
          }

          const cloudMap = new Map(
            data.filter(item => item.game_id && item.game_id > 0).map(item => [item.game_id, item])
          );
          
          setGames(prevGames =>
            prevGames.map(game => {
              if (cloudMap.has(game.id)) {
                const cloudItem = cloudMap.get(game.id);
                return {
                  ...game,
                  location: cloudItem.location !== undefined ? cloudItem.location : game.location,
                  barcode: cloudItem.barcode !== undefined ? cloudItem.barcode : game.barcode,
                  customTags: cloudItem.custom_tags || game.customTags
                };
              }
              return game;
            })
          );

          // Mettre à jour le cache local avec le cloud
          const updatedLocal = {};
          data.filter(item => item.game_id && item.game_id > 0).forEach(item => {
            updatedLocal[item.game_id] = {
              location: item.location,
              barcode: item.barcode,
              customTags: item.custom_tags
            };
          });
          localStorage.setItem('geekshelf_game_overrides', JSON.stringify(updatedLocal));
        }
      } catch (err) {
        console.warn("Supabase non accessible ou table en attente:", err);
      }
    };

    syncWithCloud();

    // 3. Écouteur en temps réel (si vous scannez sur votre cell, votre PC se met à jour en direct !)
    const channel = supabase
      .channel('realtime_game_overrides')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_overrides' }, (payload) => {
        const row = payload.new;
        if (row) {
          if (row.game_id === -1 && Array.isArray(row.custom_tags)) {
            setCustomLocations(row.custom_tags);
            localStorage.setItem('geekshelf_custom_locations', JSON.stringify(row.custom_tags));
          } else if (row.game_id === -2 && Array.isArray(row.custom_tags)) {
            setCustomDefinedTags(row.custom_tags);
            localStorage.setItem('geekshelf_defined_tags', JSON.stringify(row.custom_tags));
          } else if (row.game_id > 0) {
            setGames(prevGames =>
              prevGames.map(game => {
                if (game.id === row.game_id) {
                  return {
                    ...game,
                    location: row.location !== undefined ? row.location : game.location,
                    barcode: row.barcode !== undefined ? row.barcode : game.barcode,
                    customTags: row.custom_tags || game.customTags
                  };
                }
                return game;
              })
            );
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fermer le menu déroulant si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Mettre à jour un jeu dans l'état local, localStorage et Supabase Cloud
  const handleUpdateGame = async (gameId, updatedFields) => {
    setGames(prevGames =>
      prevGames.map(game =>
        game.id === gameId ? { ...game, ...updatedFields } : game
      )
    );

    try {
      const savedOverrides = JSON.parse(localStorage.getItem('geekshelf_game_overrides') || '{}');
      savedOverrides[gameId] = { ...(savedOverrides[gameId] || {}), ...updatedFields };
      localStorage.setItem('geekshelf_game_overrides', JSON.stringify(savedOverrides));
    } catch (e) {
      console.error("Erreur sauvegarde localStorage:", e);
    }

    // Sauvegarde Cloud Supabase
    try {
      await supabase.from('game_overrides').upsert({
        game_id: gameId,
        location: updatedFields.location !== undefined ? updatedFields.location : undefined,
        barcode: updatedFields.barcode !== undefined ? updatedFields.barcode : undefined,
        custom_tags: updatedFields.customTags || undefined,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      // Ignorer si hors-ligne
    }
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

    try {
      const savedOverrides = JSON.parse(localStorage.getItem('geekshelf_game_overrides') || '{}');
      updates.forEach(u => {
        savedOverrides[u.gameId] = { ...(savedOverrides[u.gameId] || {}), location: u.location };
      });
      gameIdsToClear.forEach(id => {
        if (savedOverrides[id]) {
          savedOverrides[id].location = null;
        }
      });
      localStorage.setItem('geekshelf_game_overrides', JSON.stringify(savedOverrides));
    } catch (e) {
      console.error("Erreur sauvegarde localStorage:", e);
    }
  };

  // Traiter la mise à jour après un scan de code-barres (synchronisé avec Supabase)
  const handleBarcodeGamePlaced = async (gameId, targetLocation, barcode) => {
    setGames(prevGames =>
      prevGames.map(game => {
        if (game.id === gameId) {
          return { ...game, location: targetLocation, barcode: barcode || game.barcode };
        }
        return game;
      })
    );

    try {
      const savedOverrides = JSON.parse(localStorage.getItem('geekshelf_game_overrides') || '{}');
      savedOverrides[gameId] = { 
        ...(savedOverrides[gameId] || {}), 
        location: targetLocation,
        ...(barcode ? { barcode } : {})
      };
      localStorage.setItem('geekshelf_game_overrides', JSON.stringify(savedOverrides));
    } catch (e) {
      console.error("Erreur sauvegarde localStorage:", e);
    }

    // Synchronisation immédiate vers Supabase Cloud
    try {
      await supabase.from('game_overrides').upsert({
        game_id: gameId,
        location: targetLocation,
        barcode: barcode || undefined,
        updated_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn("Erreur sync Supabase:", e);
    }
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

    try {
      const savedOverrides = JSON.parse(localStorage.getItem('geekshelf_game_overrides') || '{}');
      gameIds.forEach(id => {
        const current = savedOverrides[id]?.customTags || [];
        if (!current.includes(tagName)) {
          savedOverrides[id] = { ...(savedOverrides[id] || {}), customTags: [...current, tagName] };
        }
      });
      localStorage.setItem('geekshelf_game_overrides', JSON.stringify(savedOverrides));
    } catch (e) {
      console.error("Erreur sauvegarde localStorage:", e);
    }

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

    const gameId = quickEditGame.id;
    const loc = quickLocation.trim();

    setQuickSaving(true);
    setQuickError(null);

    try {
      // 1. Mise à jour immédiate locale, localStorage et Supabase Cloud
      handleUpdateGame(gameId, { location: loc });
      setQuickEditGame(null);

      // 2. Notification de l'API locale en arrière-plan
      fetch('/api/games/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gameId, location: loc }),
      }).catch(err => console.warn(err));
    } catch (err) {
      setQuickError("Impossible de sauvegarder.");
    } finally {
      setQuickSaving(false);
    }
  };

  // Actions d'administration globale (synchronisées avec Supabase Cloud)
  const handleAdminLocationCreated = async (newLoc) => {
    if (!newLoc) return;
    const items = newLoc.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    if (items.length === 0) return;

    let updatedList = [];
    setCustomLocations(prev => {
      updatedList = Array.from(new Set([...prev, ...items])).filter(Boolean);
      return updatedList;
    });

    try {
      localStorage.setItem('geekshelf_custom_locations', JSON.stringify(updatedList));
    } catch (e) {}

    try {
      await supabase.from('game_overrides').upsert({
        game_id: -1,
        custom_tags: updatedList,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn("Erreur sauvegarde location créée:", err);
    }
  };

  const handleAdminLocationRenamed = async (oldName, newName) => {
    const affectedGames = games.filter(g => g.location === oldName);
    const updatedCustom = Array.from(new Set(customLocations.map(l => l === oldName ? newName : l))).filter(Boolean);

    setCustomLocations(updatedCustom);
    try {
      localStorage.setItem('geekshelf_custom_locations', JSON.stringify(updatedCustom));
    } catch (e) {}

    setGames(prevGames =>
      prevGames.map(game =>
        game.location === oldName ? { ...game, location: newName } : game
      )
    );

    try {
      const savedOverrides = JSON.parse(localStorage.getItem('geekshelf_game_overrides') || '{}');
      if (savedOverrides && typeof savedOverrides === 'object') {
        Object.keys(savedOverrides).forEach(id => {
          if (savedOverrides[id] && savedOverrides[id].location === oldName) {
            savedOverrides[id].location = newName;
          }
        });
        localStorage.setItem('geekshelf_game_overrides', JSON.stringify(savedOverrides));
      }
    } catch (e) {
      console.error(e);
    }

    // Synchroniser vers Supabase Cloud
    try {
      await supabase.from('game_overrides').upsert({
        game_id: -1,
        custom_tags: updatedCustom,
        updated_at: new Date().toISOString()
      });

      await supabase
        .from('game_overrides')
        .update({ location: newName, updated_at: new Date().toISOString() })
        .eq('location', oldName);

      if (affectedGames.length > 0) {
        const batch = affectedGames.map(g => ({
          game_id: g.id,
          location: newName,
          barcode: g.barcode || undefined,
          custom_tags: g.customTags || undefined,
          updated_at: new Date().toISOString()
        }));
        await supabase.from('game_overrides').upsert(batch);
      }
    } catch (err) {
      console.warn("Erreur sync Supabase rename location:", err);
    }
  };

  const handleAdminLocationDeleted = async (locationName) => {
    const affectedGames = games.filter(g => g.location === locationName);
    const updatedCustom = Array.from(new Set(customLocations.filter(l => l !== locationName))).filter(Boolean);

    setCustomLocations(updatedCustom);
    try {
      localStorage.setItem('geekshelf_custom_locations', JSON.stringify(updatedCustom));
    } catch (e) {}

    setGames(prevGames =>
      prevGames.map(game =>
        game.location === locationName ? { ...game, location: null } : game
      )
    );

    try {
      const savedOverrides = JSON.parse(localStorage.getItem('geekshelf_game_overrides') || '{}');
      if (savedOverrides && typeof savedOverrides === 'object') {
        Object.keys(savedOverrides).forEach(id => {
          if (savedOverrides[id] && savedOverrides[id].location === locationName) {
            savedOverrides[id].location = null;
          }
        });
        localStorage.setItem('geekshelf_game_overrides', JSON.stringify(savedOverrides));
      }
    } catch (e) {
      console.error(e);
    }

    // Synchroniser la suppression vers Supabase Cloud
    try {
      await supabase.from('game_overrides').upsert({
        game_id: -1,
        custom_tags: updatedCustom,
        updated_at: new Date().toISOString()
      });

      await supabase
        .from('game_overrides')
        .update({ location: null, updated_at: new Date().toISOString() })
        .eq('location', locationName);

      if (affectedGames.length > 0) {
        const batch = affectedGames.map(g => ({
          game_id: g.id,
          location: null,
          barcode: g.barcode || undefined,
          custom_tags: g.customTags || undefined,
          updated_at: new Date().toISOString()
        }));
        await supabase.from('game_overrides').upsert(batch);
      }
    } catch (err) {
      console.warn("Erreur sync Supabase delete location:", err);
    }
  };

  const handleAdminTagCreated = async (newTag) => {
    if (!newTag) return;
    const items = newTag.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    if (items.length === 0) return;

    let updatedList = [];
    setCustomDefinedTags(prev => {
      updatedList = Array.from(new Set([...prev, ...items])).filter(Boolean);
      return updatedList;
    });

    try {
      localStorage.setItem('geekshelf_defined_tags', JSON.stringify(updatedList));
    } catch (e) {}

    try {
      await supabase.from('game_overrides').upsert({
        game_id: -2,
        custom_tags: updatedList,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.warn("Erreur sauvegarde tag créé:", err);
    }
  };

  const handleAdminTagRenamed = async (oldName, newName) => {
    const affectedGames = games.filter(g => Array.isArray(g.customTags) && g.customTags.includes(oldName));
    const updatedCustomTags = Array.from(new Set(customDefinedTags.map(t => t === oldName ? newName : t))).filter(Boolean);

    setCustomDefinedTags(updatedCustomTags);
    try {
      localStorage.setItem('geekshelf_defined_tags', JSON.stringify(updatedCustomTags));
    } catch (e) {}

    try {
      await supabase.from('game_overrides').upsert({
        game_id: -2,
        custom_tags: updatedCustomTags,
        updated_at: new Date().toISOString()
      });
    } catch (err) {}

    setGames(prevGames =>
      prevGames.map(game => {
        if (Array.isArray(game.customTags) && game.customTags.includes(oldName)) {
          const newTags = game.customTags.map(t => (t === oldName ? newName : t));
          return { ...game, customTags: newTags };
        }
        return game;
      })
    );

    try {
      const savedOverrides = JSON.parse(localStorage.getItem('geekshelf_game_overrides') || '{}');
      if (savedOverrides && typeof savedOverrides === 'object') {
        Object.keys(savedOverrides).forEach(id => {
          if (savedOverrides[id] && Array.isArray(savedOverrides[id].customTags)) {
            savedOverrides[id].customTags = savedOverrides[id].customTags.map(t => (t === oldName ? newName : t));
          }
        });
        localStorage.setItem('geekshelf_game_overrides', JSON.stringify(savedOverrides));
      }
    } catch (e) {
      console.error(e);
    }

    try {
      if (affectedGames.length > 0) {
        const batch = affectedGames.map(g => {
          const newTags = (g.customTags || []).map(t => (t === oldName ? newName : t));
          return {
            game_id: g.id,
            location: g.location || undefined,
            barcode: g.barcode || undefined,
            custom_tags: newTags,
            updated_at: new Date().toISOString()
          };
        });
        await supabase.from('game_overrides').upsert(batch);
      }
    } catch (err) {
      console.warn("Erreur sync Supabase rename tag:", err);
    }
  };

  const handleAdminTagDeleted = async (tagName) => {
    const affectedGames = games.filter(g => Array.isArray(g.customTags) && g.customTags.includes(tagName));
    const updatedCustomTags = Array.from(new Set(customDefinedTags.filter(t => t !== tagName))).filter(Boolean);

    setCustomDefinedTags(updatedCustomTags);
    try {
      localStorage.setItem('geekshelf_defined_tags', JSON.stringify(updatedCustomTags));
    } catch (e) {}

    try {
      await supabase.from('game_overrides').upsert({
        game_id: -2,
        custom_tags: updatedCustomTags,
        updated_at: new Date().toISOString()
      });
    } catch (err) {}

    setGames(prevGames =>
      prevGames.map(game => {
        if (Array.isArray(game.customTags) && game.customTags.includes(tagName)) {
          return { ...game, customTags: game.customTags.filter(t => t !== tagName) };
        }
        return game;
      })
    );

    if (selectedCustomTag === tagName) {
      setSelectedCustomTag('');
    }

    try {
      const savedOverrides = JSON.parse(localStorage.getItem('geekshelf_game_overrides') || '{}');
      if (savedOverrides && typeof savedOverrides === 'object') {
        Object.keys(savedOverrides).forEach(id => {
          if (savedOverrides[id] && Array.isArray(savedOverrides[id].customTags)) {
            savedOverrides[id].customTags = savedOverrides[id].customTags.filter(t => t !== tagName);
          }
        });
        localStorage.setItem('geekshelf_game_overrides', JSON.stringify(savedOverrides));
      }
    } catch (e) {
      console.error(e);
    }

    try {
      if (affectedGames.length > 0) {
        const batch = affectedGames.map(g => {
          const newTags = (g.customTags || []).filter(t => t !== tagName);
          return {
            game_id: g.id,
            location: g.location || undefined,
            barcode: g.barcode || undefined,
            custom_tags: newTags,
            updated_at: new Date().toISOString()
          };
        });
        await supabase.from('game_overrides').upsert(batch);
      }
    } catch (err) {
      console.warn("Erreur sync Supabase delete tag:", err);
    }
  };

  // Réinitialiser tous les filtres
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedMechanic('');
    setSelectedTheme('');
    setSelectedCustomTag('');
    setPlayerCount('');
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

    // Filtre par type d'élément (jeu de base ou extension)
    if (itemTypeFilter === 'standalone' && game.item_type === 'expansion') {
      return false;
    }
    if (itemTypeFilter === 'expansion' && game.item_type !== 'expansion') {
      return false;
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
  const allCustomTags = Array.from(
    new Set([
      ...customDefinedTags,
      ...games.flatMap(g => g.customTags || [])
    ].filter(Boolean))
  ).sort();

  // Extraire la liste de tous les emplacements de rangement existants
  const allExistingLocations = Array.from(
    new Set([
      ...customLocations,
      ...games.map(g => g.location ? g.location.trim() : '')
    ].filter(Boolean))
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

            {(searchQuery || selectedTheme || selectedMechanic || selectedCustomTag || playerCount || itemTypeFilter !== 'all') && (
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

                {/* Menu déroulant compact pour les outils et actions */}
                <div className={styles.menuDropdownContainer} ref={menuRef}>
                  <button 
                    className={styles.menuTriggerBtn}
                    onClick={() => setIsMenuOpen(prev => !prev)}
                    title="Menu des outils et actions"
                    aria-expanded={isMenuOpen}
                  >
                    <span>⚡ Outils & Actions</span>
                    <span style={{ fontSize: '0.72rem', transition: 'transform 0.2s', transform: isMenuOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
                  </button>

                  {isMenuOpen && (
                    <div className={styles.menuDropdown}>
                      <button 
                        type="button"
                        className={styles.menuItem}
                        onClick={() => { setIsBarcodeScanOpen(true); setIsMenuOpen(false); }}
                      >
                        <span className={styles.menuItemIcon}>📷</span>
                        <span>Scanner Code-Barres</span>
                      </button>

                      <button 
                        type="button"
                        className={styles.menuItem}
                        onClick={() => { setIsSyncOpen(true); setIsMenuOpen(false); }}
                      >
                        <span className={styles.menuItemIcon}>📋</span>
                        <span>Synchro Sheet</span>
                      </button>

                      <button 
                        type="button"
                        className={styles.menuItem}
                        onClick={() => { setIsTravelOpen(true); setIsMenuOpen(false); }}
                      >
                        <span className={styles.menuItemIcon}>🔍</span>
                        <span>Assistant Voyage</span>
                      </button>

                      <button 
                        type="button"
                        className={styles.menuItem}
                        onClick={() => { setIsAdminOpen(true); setIsMenuOpen(false); }}
                      >
                        <span className={styles.menuItemIcon}>⚙️</span>
                        <span>Organisation & Admin</span>
                      </button>

                      <div className={styles.menuDivider} />

                      <button 
                        type="button"
                        className={styles.menuItem}
                        onClick={() => { setIsImportOpen(true); setIsMenuOpen(false); }}
                      >
                        <span className={styles.menuItemIcon}>📥</span>
                        <span>Réimporter un CSV</span>
                      </button>
                    </div>
                  )}
                </div>
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

      {/* Modale de Scanner de Code-Barres */}
      {isBarcodeScanOpen && (
        <BarcodeScanModal
          allGames={games}
          existingLocations={allExistingLocations}
          onClose={() => setIsBarcodeScanOpen(false)}
          onGamePlaced={handleBarcodeGamePlaced}
        />
      )}

      {/* Modale d'Administration des Emplacements et Mots-Clés */}
      {isAdminOpen && (
        <AdminManagerModal
          games={games}
          existingLocations={allExistingLocations}
          allCustomTags={allCustomTags}
          onClose={() => setIsAdminOpen(false)}
          onLocationRenamed={handleAdminLocationRenamed}
          onLocationDeleted={handleAdminLocationDeleted}
          onLocationCreated={handleAdminLocationCreated}
          onTagRenamed={handleAdminTagRenamed}
          onTagDeleted={handleAdminTagDeleted}
          onTagCreated={handleAdminTagCreated}
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
