// Fuentes incrustadas (Vite las empaqueta: no se descargan de Google ni de ningún servidor).
// Se usa solo el subconjunto "latin", que incluye ñ, tildes, ¿ y ¡.
import '@fontsource/fredoka/latin-600.css';
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
import { FONTS } from './model/design';

/** Espera a que todas las fuentes estén listas para dibujarlas en canvas. */
export async function loadFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  await Promise.allSettled(FONTS.map((f) => document.fonts.load(`${f.weight} 20px "${f.family}"`, 'AaÑñáé')));
}
