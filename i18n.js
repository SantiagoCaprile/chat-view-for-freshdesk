/* Chat View for Freshdesk - textos en español e inglés.
   Preferencia en chrome.storage.local.fdcvLang: 'auto' (idioma del navegador) | 'es' | 'en'.
   Lo usan el content script y el popup. */
(() => {
  'use strict';
  const DICT = {
    es: {
      locale: 'es-AR',
      toggle: '💬 Chat',
      loading: 'Cargando conversación…',
      loadError: 'No se pudo cargar el ticket ({err}).',
      renderError: 'Error mostrando un mensaje: {err}',
      domMode: 'modo DOM (datos parciales)',
      messages: '{n} mensajes',
      refresh: 'Actualizar',
      closeChat: 'Cerrar modo chat',
      sigsShown: 'Firmas: visibles',
      sigsHidden: 'Firmas: ocultas',
      sigsShownTitle: 'Ocultar las firmas detrás de "· · ·"',
      sigsHiddenTitle: 'Mostrar las firmas completas en todos los mensajes',
      signature: 'Firma',
      me: '(vos)',
      requester: 'Solicitante',
      external: 'Externo',
      publicNote: 'nota pública',
      publicNoteTitle: 'Nota pública: visible para el cliente',
      publicNoteTo: 'Nota pública: salió por mail a {list}',
      recTo: 'Para',
      agent: 'Agente',
      message: 'Mensaje {n}',
      noNewText: '(sin texto nuevo)',
      showQuote: 'ver citado',
      hideQuote: 'ocultar citado',
      copy: 'copiar',
      copied: 'copiado',
      openOriginal: 'Abrir original ↗',
      closeEsc: 'Cerrar (Esc)',
      prev: 'Anterior (←)',
      next: 'Siguiente (→)',
      justNow: 'hace instantes',
      minAgo: 'hace {n} min',
      hAgo: 'hace {n} h',
      dAgo: 'hace {n} d',
      moAgo1: 'hace 1 mes',
      moAgo: 'hace {n} meses',
      yAgo: 'hace {n} a',
      toBottom: 'Ir al último mensaje',
      toTop: 'Ir al mensaje más reciente',
      newOne: '1 nuevo',
      newMany: '{n} nuevos',
      today: 'Hoy',
      yesterday: 'Ayer',
      // popup
      pChat: 'Modo chat',
      pChatSub: 'Muestra los tickets como conversación',
      pSigs: 'Mostrar firmas',
      pSigsSub: 'Firmas completas en vez de "· · ·"',
      pSigsWarn: 'La detección de firmas es automática y puede ocultar texto por error. Si te parece que falta algo, tocá "· · ·" en el mensaje o activá esta opción.',
      pButton: 'Botón 💬 en la página',
      pButtonSub: 'Botón flotante para prender/apagar el chat',
      pDomains: 'Dominios internos',
      pDomainsSub: 'Mensajes de estos dominios van a la derecha aunque no sean agentes. Separados por coma.',
      pDomainsPh: 'ej: miempresa.com',
      pSaved: 'Guardado',
      pSettings: 'Ajustes',
      pSettingsSub: 'Idioma, orden, fechas, dominios internos y animaciones',
      pNewest: 'Más nuevos arriba',
      pNewestSub: 'Invierte el chat: lo último arriba y lo más viejo abajo',
      pDateFmt: 'Formato de fecha',
      pDateRelative: 'Relativa (hace 2 días)',
      pTimeFmt: 'Formato de hora',
      pTimeAuto: 'Automático (según idioma)',
      pTime24: '24 horas (15:30)',
      pTime12: '12 horas (3:30 p. m.)',
      pBack: 'Volver',
      pNoAnim: 'Quitar animaciones',
      pNoAnimSub: 'Más liviano en equipos con pocos recursos: sin fundidos, brillos ni scroll suave',
      pLang: 'Idioma',
      pLangAuto: 'Automático ({lang})',
      pReadOnly: 'Solo lectura: no modifica nada en Freshdesk.',
      langEs: 'Español',
      langEn: 'English',
    },
    en: {
      locale: 'en-US',
      toggle: '💬 Chat',
      loading: 'Loading conversation…',
      loadError: 'Could not load the ticket ({err}).',
      renderError: 'Error rendering a message: {err}',
      domMode: 'DOM mode (partial data)',
      messages: '{n} messages',
      refresh: 'Refresh',
      closeChat: 'Close chat view',
      sigsShown: 'Signatures: shown',
      sigsHidden: 'Signatures: hidden',
      sigsShownTitle: 'Hide signatures behind "· · ·"',
      sigsHiddenTitle: 'Show full signatures on every message',
      signature: 'Signature',
      me: '(you)',
      requester: 'Requester',
      external: 'External',
      publicNote: 'public note',
      publicNoteTitle: 'Public note: visible to the customer',
      publicNoteTo: 'Public note: emailed to {list}',
      recTo: 'To',
      agent: 'Agent',
      message: 'Message {n}',
      noNewText: '(no new text)',
      showQuote: 'show quoted',
      hideQuote: 'hide quoted',
      copy: 'copy',
      copied: 'copied',
      openOriginal: 'Open original ↗',
      closeEsc: 'Close (Esc)',
      prev: 'Previous (←)',
      next: 'Next (→)',
      justNow: 'just now',
      minAgo: '{n} min ago',
      hAgo: '{n} h ago',
      dAgo: '{n} d ago',
      moAgo1: '1 month ago',
      moAgo: '{n} months ago',
      yAgo: '{n} y ago',
      toBottom: 'Jump to latest message',
      toTop: 'Jump to newest message',
      newOne: '1 new',
      newMany: '{n} new',
      today: 'Today',
      yesterday: 'Yesterday',
      // popup
      pChat: 'Show Chat',
      pChatSub: 'Display tickets as a conversation',
      pSigs: 'Show signatures',
      pSigsSub: 'Full signatures instead of "· · ·"',
      pSigsWarn: 'Signature detection is automatic and may hide text by mistake. If something seems missing, click "· · ·" on the message or turn this option on.',
      pButton: 'Bubble on screen',
      pButtonSub: 'Floating button to turn the chat on/off',
      pDomains: 'Internal domains',
      pDomainsSub: 'Messages from these domains go on the right even if the sender is not an agent. Comma-separated.',
      pDomainsPh: 'e.g. mycompany.com',
      pSaved: 'Saved',
      pSettings: 'Settings',
      pSettingsSub: 'Language, order, dates, internal domains and animations',
      pNewest: 'Newest first',
      pNewestSub: 'Reverse the chat: latest on top, oldest at the bottom',
      pDateFmt: 'Date format',
      pDateRelative: 'Relative (2 days ago)',
      pTimeFmt: 'Time format',
      pTimeAuto: 'Automatic (by language)',
      pTime24: '24-hour (15:30)',
      pTime12: '12-hour (3:30 PM)',
      pBack: 'Back',
      pNoAnim: 'Disable animations',
      pNoAnimSub: 'Lighter on low-end computers: no fades, shimmer or smooth scrolling',
      pLang: 'Language',
      pLangAuto: 'Automatic ({lang})',
      pReadOnly: 'Read-only: never changes anything in Freshdesk.',
      langEs: 'Español',
      langEn: 'English',
    },
  };

  const browserLang = () => {
    const l = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
    return l.startsWith('es') ? 'es' : 'en';
  };
  const resolve = pref => (pref === 'es' || pref === 'en') ? pref : browserLang();

  let lang = browserLang();
  const t = (key, vars) => {
    let s = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
    return s;
  };

  // Formatos de fecha absolutos (opcion "Formato de fecha"; 'relative' lo resuelve content.js).
  //   text:  26 ago, 12:00 / Aug 26, 12:00 PM (con año si no es el actual)
  //   slash: 26/08/2026 12:00 / 08/26/2026 12:00 PM (orden dia/mes segun idioma)
  //   iso:   2026-08-26 12:00 (igual en todos los idiomas)
  // Formato de hora (opcion "Formato de hora"): 'auto' (24 h en español, 12 h en inglés) | '24' | '12'.
  const DATE_FORMATS = ['relative', 'text', 'slash', 'iso'];
  const TIME_FORMATS = ['auto', '24', '12'];
  const pad = n => String(n).padStart(2, '0');
  const is12 = hourFmt => hourFmt === '12' || (hourFmt !== '24' && /^en/i.test(t('locale')));
  // Hora armada a mano para que sea igual en todos los formatos: 15:30 | 3:30 p. m. | 3:30 PM.
  const timeStr = (d, hourFmt) => {
    const h = d.getHours(), m = pad(d.getMinutes());
    if (!is12(hourFmt)) return `${pad(h)}:${m}`;
    const es = /^es/i.test(t('locale'));
    return `${h % 12 || 12}:${m} ` + (h < 12 ? (es ? 'a. m.' : 'AM') : (es ? 'p. m.' : 'PM'));
  };
  const formatDate = (d, fmt, hourFmt) => {
    const loc = t('locale');
    const time = timeStr(d, hourFmt);
    if (fmt === 'iso') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
    if (fmt === 'slash') return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + time;
    const o = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString(loc, o).replace(/\./g, '') + ', ' + time;
  };
  // Fecha y hora completas para el tooltip de la fecha relativa.
  const formatFull = (d, hourFmt) => d.toLocaleDateString(t('locale'), { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + timeStr(d, hourFmt);

  globalThis.FDCV_I18N = {
    DATE_FORMATS,
    TIME_FORMATS,
    formatDate,
    formatFull,
    t,
    resolve,
    browserLang,
    get lang() { return lang; },
    setPref(pref) { lang = resolve(pref); return lang; },
  };
})();
