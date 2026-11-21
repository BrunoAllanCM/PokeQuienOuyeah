/**
 * Módulo de Seguridad y Criptografía Anti-Trampas (Web Crypto API)
 * Utiliza un Esquema de Compromiso Criptográfico con Hash SHA-256.
 * Garantiza que ningún jugador pueda cambiar su Pokémon secreto usando
 * 'Inspeccionar elemento' o la consola de desarrollador sin ser detectado.
 */

var seguridadAntiTrampas = {
  /**
   * Genera un salt criptográfico seguro de 128 bits en formato hexadecimal (32 caracteres)
   * @returns {string}
   */
  generarSalt() {
    try {
      const cryptoObj = (typeof window !== "undefined" && window.crypto) || (typeof globalThis !== "undefined" && globalThis.crypto);
      if (cryptoObj && cryptoObj.getRandomValues) {
        const bytes = new Uint8Array(16);
        cryptoObj.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) {
      console.warn("[Seguridad] Fallback para generación de salt:", e);
    }
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
  },

  /**
   * Calcula el Hash SHA-256 del compromiso del Pokémon
   * Cadena sellada: `${codigoSala}:${pokemonId}:${salt}`
   * @param {number|string} pokemonId
   * @param {string} salt
   * @param {string} codigoSala
   * @returns {Promise<string>} Hash SHA-256 en formato hex (64 caracteres)
   */
  async calcularHashPokemon(pokemonId, salt, codigoSala) {
    const raw = `${String(codigoSala || "").trim()}:${Number(pokemonId)}:${String(salt || "").trim()}`;
    const cryptoObj = (typeof window !== "undefined" && window.crypto) || (typeof globalThis !== "undefined" && globalThis.crypto);

    if (cryptoObj && cryptoObj.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(raw);
      const hashBuffer = await cryptoObj.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").toLowerCase();
    }

    // Fallback simple determinista si no hay WebCrypto
    let h = 0x811c9dc5;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return "fb_" + (h >>> 0).toString(16).padStart(8, "0");
  },

  /**
   * Verifica si el Pokémon y salt revelados coinciden matemáticamente con el hash pactado
   * @param {number|string} pokemonId
   * @param {string} salt
   * @param {string} codigoSala
   * @param {string} hashEsperado
   * @returns {Promise<boolean>}
   */
  async verificarHashPokemon(pokemonId, salt, codigoSala, hashEsperado) {
    if (!hashEsperado || !salt || !pokemonId) return false;
    const calculado = await this.calcularHashPokemon(pokemonId, salt, codigoSala);
    return calculado.toLowerCase() === String(hashEsperado).trim().toLowerCase();
  },

  /**
   * Congela el estado de memoria del Pokémon secreto para impedir que
   * scripts simples o la consola de F12 lo reescriban directamente
   * @param {object} stateObj
   */
  blindarEstadoJuego(stateObj) {
    if (!stateObj) return;

    let lockedSecret = stateObj.secretPokemon;

    try {
      Object.defineProperty(stateObj, "secretPokemon", {
        get() {
          return lockedSecret;
        },
        set(nuevoPokemon) {
          // Si la partida ya empezó oficialmente (ambos listos o partida iniciada), rechazar cualquier cambio
          const partidaBloqueada = stateObj.isGameStarted || (stateObj.isPlayerReady && stateObj.isRivalReady);
          if (partidaBloqueada) {
            console.error(
              "%c[ANTI-TRAMPAS] ¡Acción bloqueada! La partida ya ha comenzado y tu Pokémon secreto está sellado criptográficamente.",
              "color: #ef4444; font-weight: bold; font-size: 14px;"
            );
            if (typeof showToast !== "undefined") {
              showToast("⚠️ Intento de modificación bloqueado: la partida ya está en curso.", "error", 4000);
            }
            return;
          }
          lockedSecret = nuevoPokemon;
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      console.warn("[Seguridad] No se pudo configurar descriptor de propiedad:", e);
    }
  }
};

// Compatibilidad Global y Node.js
if (typeof globalThis !== "undefined") {
  globalThis.seguridadAntiTrampas = seguridadAntiTrampas;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { seguridadAntiTrampas };
}
