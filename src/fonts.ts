// Fuentes incrustadas (Vite las empaqueta: no se descargan de Google ni de ningún servidor).
// Se usa solo el subconjunto "latin", que incluye ñ, tildes, ¿ y ¡.
// — Interfaz —
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/fredoka/latin-500.css';
// — Letras de los pines —
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '@fontsource/pacifico/latin-400.css';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/lobster/latin-400.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/dancing-script/latin-700.css';
import '@fontsource/luckiest-guy/latin-400.css';
import '@fontsource/chewy/latin-400.css';
import '@fontsource/permanent-marker/latin-400.css';
import '@fontsource/great-vibes/latin-400.css';
import '@fontsource/bungee/latin-400.css';
import '@fontsource/comfortaa/latin-700.css';
import '@fontsource/kaushan-script/latin-400.css';
import '@fontsource/yellowtail/latin-400.css';
import '@fontsource/rubik-bubbles/latin-400.css';
import '@fontsource/londrina-outline/latin-400.css';
import '@fontsource/rock-salt/latin-400.css';
import '@fontsource/fredericka-the-great/latin-400.css';
import '@fontsource/cabin-sketch/latin-700.css';
import '@fontsource/alex-brush/latin-400.css';
import '@fontsource/andika/latin-700.css';
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/bangers/latin-400.css';
import '@fontsource/monoton/latin-400.css';
import '@fontsource/cinzel-decorative/latin-700.css';
import '@fontsource/sedgwick-ave-display/latin-400.css';
import '@fontsource/titan-one/latin-400.css';
import '@fontsource/bowlby-one/latin-400.css';
import '@fontsource/sniglet/latin-800.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/archivo-black/latin-400.css';
import '@fontsource/cinzel/latin-700.css';
import { FONTS, fontCss } from './model/design';

/** Espera a que todas las fuentes estén listas para dibujarlas en canvas. */
export async function loadFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  await Promise.allSettled(FONTS.map((f) => document.fonts.load(fontCss(f.family, 20), 'AaÑñáé')));
}
