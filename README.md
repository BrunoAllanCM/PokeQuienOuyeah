# 🔴 PokéQuién - Arquitectura Modular en Español

Juego de **Adivina Quién** ambientado en el universo Pokémon para 2 jugadores en tiempo real mediante **códigos de sala deterministas** y comunicación P2P.

---

## 🏛️ Estructura del Proyecto (100% en Español)

Todos los archivos y carpetas del proyecto están organizados con nombres claros en español:

```text
PokeQuienOuyeah/
├── index.html                   # Página web principal
├── package.json                 # Configuración del proyecto y scripts
├── pruebas.js                   # Suite de pruebas unitarias en Node.js (npm test)
├── pruebas.html                 # Suite de pruebas visual en navegador
│
├── estilos/                     # Hojas de estilo CSS modulares
│   ├── base.css                 # Variables, reset, tipografía y HUD superior
│   ├── configuracion.css        # Pantalla 1: Formulario y selector de generaciones
│   ├── tablero.css              # Pantalla 2: Grid 3D de 30 cartas y widget secreto
│   ├── chat.css                 # Panel y mensajes del chat en tiempo real
│   ├── retro.css                # Tema visual Pokédex Clásica Kanto (8-bit)
│   └── responsivo.css           # Media queries y adaptación móvil
│
└── js/                          # Código JavaScript modular
    ├── principal.js             # Punto de entrada (inicialización y eventos)
    │
    ├── constantes/              # Datos estáticos inmutables
    │   └── datosPokemon.js      # Definición de 9 generaciones y traducciones de tipos
    │
    ├── logica/                  # Lógica pura de negocio (independiente del DOM)
    │   ├── aleatorio.js         # PRNG determinista (FNV-1a + Mulberry32 + Fisher-Yates)
    │   └── codigoSala.js        # Generación, validación y parseo de códigos de sala
    │
    ├── servicios/               # Servicios y APIs externas
    │   ├── conexionPeer.js      # Conexión P2P en tiempo real con PeerJS / WebRTC
    │   ├── apiPokemon.js        # Consulta con timeout y caché local en localStorage
    │   └── audio.js             # Sintetizador procedural de audio con Web Audio API
    │
    ├── estado/                  # Única fuente de verdad (Single Source of Truth)
    │   └── estadoJuego.js       # Estado centralizado y persistencia en sessionStorage
    │
    └── interfaz/                # Manipulación visual del DOM
        ├── notificaciones.js    # Sistema de notificaciones toast
        ├── tema.js              # Conmutador de temas (Retro vs Cyber HUD)
        ├── vistaConfiguracion.js# Renderizado y controles de la Pantalla 1
        ├── vistaTablero.js      # Renderizado de cartas, descartes y Pokémon secreto
        └── vistaChat.js         # Interfaz y renderizado del chat en vivo
```

---

## 🚀 Cómo ejecutar el proyecto

1. **Abrir en navegador:**
   - Puedes abrir `index.html` con doble clic, o
   - Clic derecho en `index.html` -> **"Open with Live Server"** en VS Code.

2. **Ejecutar pruebas unitarias:**
   ```bash
   npm test
   ```
