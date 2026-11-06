import { buildCalibrationPdf, buildPdf, expandCopies } from '../export/pdf';
import { canvasToBlob } from '../image/store';
import { dateStamp, downloadBlob } from '../export/download';
import { ensureAll } from '../image/processor';
import { currentLayout, sheetCopies } from '../layout/current';
import { paperShortName, paperSize } from '../model/paper';
import { renderSheetCanvas } from '../render/sheet';
import { state } from '../state';
import { h } from './dom';
import { sheetContext } from './sheetView';
import { toast } from './toast';

/** Sección "Imprimir / Exportar": PDF a 300 ppp y PNG/JPG por hoja a 300 o 600 ppp. */
export function createExportPanel(): HTMLElement {
  const chk = (label: string, key: 'cut' | 'center' | 'ruler') => {
    const inp = h('input', { type: 'checkbox', checked: state.guides[key] });
    inp.addEventListener('change', () => (state.guides[key] = inp.checked));
    return h('label', { class: 'check' }, inp, ' ', label);
  };
  const ppi = h('select', { 'aria-label': 'Resolución de la imagen' }, h('option', { value: '300' }, '300 ppp (alta)'), h('option', { value: '600' }, '600 ppp (muy alta, archivos grandes)'));
  const progress = h('progress', { max: 1, value: 0, hidden: true });
  const status = h('p', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  let busy = false;

  const run = async (label: string, job: () => Promise<void>) => {
    if (busy) return;
    if (!currentLayout().total) return toast('Primero agrega pines a la hoja');
    busy = true;
    buttons.forEach((b) => (b.disabled = true));
    progress.hidden = false;
    progress.value = 0;
    status.textContent = `${label}…`;
    try {
      // Esperar a que todas las fotos estén procesadas (quitar fondo, colores…).
      await ensureAll(state.designs);
      await job();
      status.textContent = '✅ Listo. Al imprimir usa “Tamaño real / 100 %”, sin “sin márgenes”.';
    } catch (e) {
      status.textContent = `No se pudo generar: ${(e as Error).message}`;
    } finally {
      busy = false;
      buttons.forEach((b) => (b.disabled = false));
      progress.hidden = true;
    }
  };

  const pdfBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      onclick: () =>
        run('Generando PDF a 300 ppp', async () => {
          const L = currentLayout();
          const blob = await buildPdf({
            pages: L.pages,
            copies: sheetCopies(L.pages.length),
            sc: sheetContext(),
            onProgress: (d, t) => {
              progress.value = d / t;
              status.textContent = `Generando PDF: hoja ${d} de ${t}…`;
            },
          });
          downloadBlob(blob, `pines-rebeca-${paperShortName(state.paper).toLowerCase().replace(/\s+/g, '')}-${dateStamp()}.pdf`);
        }),
    },
    '📄 Guardar PDF (300 ppp)',
  );

  const imageExport = (type: 'image/png' | 'image/jpeg', ext: string) =>
    run(`Generando ${ext.toUpperCase()}`, async () => {
      const L = currentLayout();
      const list = expandCopies(L.pages, sheetCopies(L.pages.length));
      const res = Number(ppi.value);
      const ppm = res / 25.4;
      const sc = sheetContext();
      // Una imagen por hoja distinta (las repeticiones se imprimen varias veces).
      const unique = [...new Set(list.map((x) => x.index))];
      for (let i = 0; i < unique.length; i++) {
        const idx = unique[i];
        status.textContent = `Hoja ${idx + 1} de ${L.pages.length} a ${res} ppp…`;
        progress.value = i / unique.length;
        await new Promise((r) => setTimeout(r, 0));
        const c = renderSheetCanvas(L.pages[idx], sc, ppm, { guides: true, pageNumber: idx + 1, pageCount: L.pages.length });
        const blob = await canvasToBlob(c, type, type === 'image/jpeg' ? 0.95 : undefined);
        c.width = c.height = 0;
        downloadBlob(blob, `pines-rebeca-hoja${idx + 1}-${res}ppp.${ext}`);
        await new Promise((r) => setTimeout(r, 400)); // el navegador descarga una por una
      }
      progress.value = 1;
    });

  const pngBtn = h('button', { type: 'button', class: 'btn ghost', onclick: () => imageExport('image/png', 'png') }, '🖼 PNG por hoja');
  const jpgBtn = h('button', { type: 'button', class: 'btn ghost', onclick: () => imageExport('image/jpeg', 'jpg') }, '🖼 JPG por hoja');
  const calBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn ghost small',
      onclick: () => {
        const { w, h: hh } = paperSize(state.paper);
        downloadBlob(buildCalibrationPdf(state.sizes, 10, w, hh), `hoja-calibracion-${dateStamp()}.pdf`);
        toast('Hoja de calibración descargada: imprímela al 100 % y compárala con tus moldes');
      },
    },
    '📏 Hoja de calibración (PDF)',
  );
  const buttons = [pdfBtn, pngBtn, jpgBtn, calBtn];

  return h(
    'div',
    { class: 'side-fields' },
    pdfBtn,
    h('div', { class: 'row wrap' }, pngBtn, jpgBtn),
    h('label', { class: 'mini' }, h('span', {}, 'Resolución de PNG / JPG'), ppi),
    h('div', { class: 'side-fields tight' }, chk('Líneas de corte', 'cut'), chk('Marca de centro', 'center'), chk('Regla de calibración de 5 cm', 'ruler')),
    progress,
    status,
    calBtn,
    h(
      'details',
      { class: 'tips' },
      h('summary', {}, '🖨 Consejos para la Epson L8050'),
      h(
        'ul',
        { class: 'small' },
        h('li', {}, 'Imprime al 100 % / “Tamaño real”. NO uses “sin márgenes”: amplía la imagen y los pines salen más grandes.'),
        h('li', {}, 'Papel fotográfico o couché delgado (≈115–150 g). Calidad “Alta”.'),
        h('li', {}, 'Si usaste “Optimizar para L8050” o “Mejorar colores”, desactiva PhotoEnhance en el controlador.'),
        h('li', {}, 'Mide la regla de 5 cm con una regla real: si no mide 5 cm, revisa la escala.'),
        h('li', {}, 'Deja secar la tinta unos minutos antes de recortar y prensar.'),
      ),
    ),
  );
}
