/**
 * Servicio de PokéAPI con Caché Persistente en LocalStorage
 */

/**
 * Formatea nombres especiales de Pokémon para presentación atractiva
 * @param {string} rawName
 * @returns {string}
 */
function formatPokemonName(rawName) {
  if (!rawName) return "";
  const name = rawName.toLowerCase();

  // Nombres que no se arreglan solo con mayúsculas
  const specialNames = {
    "mr-mime": "Mr. Mime",
    "mime-jr": "Mime Jr.",
    "mr-rime": "Mr. Rime",
    "ho-oh": "Ho-Oh",
    "porygon-z": "Porygon-Z",
    "nidoran-m": "Nidoran ♂",
    "nidoran-f": "Nidoran ♀",
    "type-null": "Código Cero",
    "flabebe": "Flabébé",
    "tapu-koko": "Tapu Koko",
    "tapu-lele": "Tapu Lele",
    "tapu-bulu": "Tapu Bulu",
    "tapu-fini": "Tapu Fini",
    "ting-lu": "Ting-Lu",
    "chien-pao": "Chien-Pao",
    "wo-chien": "Wo-Chien",
    "chi-yu": "Chi-Yu",
    "iron-treads": "Ferrodada",
    "great-tusk": "Colmilargo"
  };

  if (specialNames[name]) {
    return specialNames[name];
  }

  return name
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Obtiene los datos de un Pokémon, consultando primero localStorage
 * @param {number} id
 * @returns {Promise<{ id: number, name: string, rawName: string, image: string, types: string[] }>}
 */
async function fetchPokemonData(id) {
  // Primero intenta leer del caché local
  const cacheKey = `poke_pixel_v3_${id}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (id === 843 || id === 844) {
        parsed.animatedImage = null;
        parsed.animatedShinyImage = null;
      }
      if (!parsed.cry) {
        parsed.cry = `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
      }
      if (!parsed.shinyImage) {
        parsed.shinyImage = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;
      }
      if (!parsed.animatedShinyImage && id !== 843 && id !== 844) {
        parsed.animatedShinyImage =
          id <= 649
            ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/shiny/${id}.gif`
            : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/shiny/${id}.gif`;
      }
      return parsed;
    }
    // Si existe v1 o v2 en caché, actualizar con la URL animada Pixel Art adecuada
    const cachedPrev = localStorage.getItem(`poke_pixel_v2_${id}`) || localStorage.getItem(`poke_pixel_v1_${id}`);
    if (cachedPrev) {
      const parsed = JSON.parse(cachedPrev);
      if (id === 843 || id === 844) {
        parsed.animatedImage = null;
        parsed.animatedShinyImage = null;
      } else {
        parsed.animatedImage =
          id <= 649
            ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`
            : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${id}.gif`;
        parsed.animatedShinyImage =
          parsed.animatedShinyImage ||
          (id <= 649
            ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/shiny/${id}.gif`
            : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/shiny/${id}.gif`);
      }
      parsed.cry = parsed.cry || `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
      parsed.shinyImage = parsed.shinyImage || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(parsed));
      } catch (e) {}
      return parsed;
    }
  } catch (err) {
    console.warn("No se pudo leer localStorage:", err);
  }

  // Pide a PokéAPI con límite de 12 segundos
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status} al cargar Pokémon #${id}`);
    }

    const data = await response.json();

    // Elige imagen estática, con respaldos
    const pixelSprite = data.sprites?.front_default;
    const artwork = data.sprites?.other?.["official-artwork"]?.front_default;
    const image =
      pixelSprite ||
      artwork ||
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

    const shinyPixelSprite = data.sprites?.front_shiny;
    const shinyArtwork = data.sprites?.other?.["official-artwork"]?.front_shiny;
    const shinyImage =
      shinyPixelSprite ||
      shinyArtwork ||
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;

    // Priorizar el sprite animado 2D Pixel Art oficial de Blanco y Negro (Gen V)
    const gen5Pixel = data.sprites?.versions?.["generation-v"]?.["black-white"]?.animated?.front_default;
    const showdown = data.sprites?.other?.showdown?.front_default;
    let animatedSprite =
      gen5Pixel ||
      (id <= 649
        ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`
        : (showdown || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${id}.gif`));

    const gen5ShinyPixel = data.sprites?.versions?.["generation-v"]?.["black-white"]?.animated?.front_shiny;
    const showdownShiny = data.sprites?.other?.showdown?.front_shiny;
    let animatedShinySprite =
      gen5ShinyPixel ||
      (id <= 649
        ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/shiny/${id}.gif`
        : (showdownShiny || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/shiny/${id}.gif`));

    // Excepciones: mantener siempre estáticos a Silicobra (#843) y Sandaconda (#844) para evitar confusiones visuales
    if (id === 843 || id === 844) {
      animatedSprite = null;
      animatedShinySprite = null;
    }

    // Tipos, gritos y registro final del Pokémon
    const types = data.types.map(t => t.type.name);

    const cry = data.cries?.latest || `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;
    const legacyCry = data.cries?.legacy || (id <= 649 ? `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/legacy/${id}.ogg` : null);

    const pokemonRecord = {
      id: data.id,
      name: formatPokemonName(data.name),
      rawName: data.name,
      image,
      animatedImage: animatedSprite,
      shinyImage,
      animatedShinyImage: animatedShinySprite,
      types,
      cry,
      legacyCry
    };

    try {
      localStorage.setItem(cacheKey, JSON.stringify(pokemonRecord));
      localStorage.setItem(`poke_v1_${id}`, JSON.stringify(pokemonRecord));
    } catch (err) {
      console.warn("No se pudo escribir en localStorage:", err);
    }

    return pokemonRecord;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
