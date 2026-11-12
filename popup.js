/* Popup de la extension: mismos ajustes que el boton 💬 y "Firmas" de la barra del chat, mas el idioma.
   Escribe en chrome.storage.local; el content script escucha onChanged y aplica en vivo. */
(async () => {
  'use strict';
  const I18N = globalThis.FDCV_I18N;
  const $ = id => document.getElementById(id);
  const enabled = $('enabled'), sigs = $('sigs'), button = $('button'), lang = $('lang'), domains = $('domains'), saved = $('saved'), noanim = $('noanim'), newest = $('newest');
  // Dos pantallas: principal y ajustes (idioma, orden, dominios internos, animaciones).
  const show = settings => {
    $('viewMain').hidden = settings; $('viewSettings').hidden = !settings;
    (settings ? $('closeSettings') : $('openSettings')).focus();
  };
  $('openSettings').addEventListener('click', () => show(true));
  $('closeSettings').addEventListener('click', () => show(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('viewSettings').hidden) { e.preventDefault(); show(false); } });

  function paint() {
    document.documentElement.lang = I18N.lang;
    document.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = I18N.t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach(n => { n.placeholder = I18N.t(n.dataset.i18nPh); });
    const browser = I18N.browserLang() === 'es' ? I18N.t('langEs') : I18N.t('langEn');
    $('langAuto').textContent = I18N.t('pLangAuto', { lang: browser });
  }

  let cur = {};
  try { cur = await chrome.storage.local.get(['fdcvEnabled', 'fdcvShowSignatures', 'fdcvHideButton', 'fdcvLang', 'fdcvInternalDomains', 'fdcvNoAnimations', 'fdcvNewestFirst']); } catch (e) { /* ignore */ }
  enabled.checked = !!cur.fdcvEnabled;
  sigs.checked = cur.fdcvShowSignatures !== false; // por defecto se muestran
  const warn = $('sigsWarn');
  const paintWarn = () => { warn.hidden = sigs.checked; }; // el aviso solo importa con firmas ocultas
  paintWarn();
  button.checked = !cur.fdcvHideButton; // por defecto el boton se ve
  lang.value = cur.fdcvLang || 'auto';
  domains.value = cur.fdcvInternalDomains || '';
  noanim.checked = !!cur.fdcvNoAnimations;
  newest.checked = !!cur.fdcvNewestFirst;
  I18N.setPref(lang.value);
  paint();

  const save = o => { try { chrome.storage.local.set(o); } catch (e) { /* ignore */ } };
  enabled.addEventListener('change', () => save({ fdcvEnabled: enabled.checked }));
  sigs.addEventListener('change', () => { paintWarn(); save({ fdcvShowSignatures: sigs.checked }); });
  button.addEventListener('change', () => save({ fdcvHideButton: !button.checked }));
  newest.addEventListener('change', () => save({ fdcvNewestFirst: newest.checked }));
  noanim.addEventListener('change', () => save({ fdcvNoAnimations: noanim.checked }));
  // Dominios: se guardan al dejar de tipear (o con Enter), normalizados.
  const normDomains = v => String(v || '').split(/[\s,;]+/)
    .map(x => x.trim().toLowerCase().replace(/^.*@/, '').replace(/^\.+|\.+$/g, ''))
    .filter(x => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x))
    .filter((x, i, a) => a.indexOf(x) === i).join(', ');
  let tmr = null;
  const saveDomains = () => {
    clearTimeout(tmr);
    const v = normDomains(domains.value);
    save({ fdcvInternalDomains: v });
    saved.hidden = false; setTimeout(() => { saved.hidden = true; }, 1200);
  };
  domains.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(saveDomains, 700); });
  domains.addEventListener('change', () => { saveDomains(); domains.value = normDomains(domains.value); });
  domains.addEventListener('keydown', e => { if (e.key === 'Enter') { saveDomains(); domains.value = normDomains(domains.value); } });
  lang.addEventListener('change', () => { I18N.setPref(lang.value); paint(); save({ fdcvLang: lang.value }); });
})();
