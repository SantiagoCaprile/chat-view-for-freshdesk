/* Chat View for Freshdesk - solo lectura (GET). Overlay en Shadow DOM para aislar estilos. */
(() => {
  'use strict';
  if (window.__fdcvLoaded) return;
  window.__fdcvLoaded = true;

  const I18N = globalThis.FDCV_I18N || { t: k => k, setPref: () => 'es', lang: 'es' };
  const T = (k, v) => I18N.t(k, v);
  const clean = (globalThis.FDCV && FDCV.cleanMessage) || (h => ({ cleanHtml: basicSanitize(h), quotedHtml: '', signatureHtml: '', hasQuote: false }));

  function basicSanitize(html) {
    try {
      const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form').forEach(n => n.remove());
      doc.querySelectorAll('*').forEach(el => {
        for (const a of [...el.attributes]) {
          const n = a.name.toLowerCase();
          if (n.startsWith('on') || (/^(href|src)$/.test(n) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
        }
      });
      return doc.body.innerHTML;
    } catch (e) { return ''; }
  }

  // ---------- estado ----------
  const st = {
    ticketId: null, enabled: false, loadToken: 0,
    agents: null,      // Map id -> {name, email}
    meId: null,
    host: null, root: null, overlay: null, scroll: null, toggle: null, fadeToken: 0,
  };

  const getTicketId = () => {
    const m = location.pathname.match(/\/a\/tickets\/(\d+)/);
    return m ? m[1] : null;
  };

  const store = {
    async get() {
      try { const r = await chrome.storage.local.get('fdcvEnabled'); return !!r.fdcvEnabled; } catch (e) { return false; }
    },
    async set(v) { try { await chrome.storage.local.set({ fdcvEnabled: !!v }); } catch (e) { /* ignore */ } },
    async getShowSigs() {
      // Por defecto se muestran: solo se ocultan si la persona lo eligio (valor guardado en false).
      try { const r = await chrome.storage.local.get('fdcvShowSignatures'); return r.fdcvShowSignatures !== false; } catch (e) { return true; }
    },
    async setShowSigs(v) { try { await chrome.storage.local.set({ fdcvShowSignatures: !!v }); } catch (e) { /* ignore */ } },
  };

  // ---------- red (solo GET) ----------
  async function getJson(url) {
    const r = await fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(url + ' -> ' + r.status);
    return r.json();
  }
  const asList = (j, key) => Array.isArray(j) ? j : (j && Array.isArray(j[key]) ? j[key] : (j && Array.isArray(j.data) ? j.data : []));

  async function fetchAllConversations(base, firstPage) {
    const out = []; const per = 100;
    if (firstPage) {
      out.push(...firstPage);
      if (firstPage.length < per) return out;
    }
    for (let page = firstPage ? 2 : 1; page <= 50; page++) {
      const j = await getJson(`${base}/conversations?page=${page}&per_page=${per}`);
      const list = asList(j, 'conversations');
      out.push(...list);
      if (list.length < per) break;
    }
    return out;
  }

  async function fetchApi(id) {
    const attempts = [
      { t: `/api/_/tickets/${id}?include=requester`, base: `/api/_/tickets/${id}` },
      { t: `/api/v2/tickets/${id}?include=requester`, base: `/api/v2/tickets/${id}` },
    ];
    let lastErr;
    for (const a of attempts) {
      try {
        // ticket y primera pagina de conversaciones en paralelo (antes iban en serie)
        const [tj, p1] = await Promise.all([
          getJson(a.t),
          getJson(`${a.base}/conversations?page=1&per_page=100`),
        ]);
        const ticket = tj && tj.ticket ? tj.ticket : tj;
        const convs = await fetchAllConversations(a.base, asList(p1, 'conversations'));
        return { ticket, convs };
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  // Cache en sessionStorage de la pestaña (se borra al cerrarla): agentes e id propio,
  // para no pedirlos en cada ticket. Si hay cache se usa al toque y se refresca por detras.
  const SS_TTL = 6 * 3600 * 1000;
  const ssGet = k => { try { const v = JSON.parse(sessionStorage.getItem(k) || 'null'); return v && (Date.now() - v.ts < SS_TTL) ? v.data : null; } catch (e) { return null; } };
  const ssSet = (k, data) => { try { sessionStorage.setItem(k, JSON.stringify({ ts: Date.now(), data })); } catch (e) { /* lleno o bloqueado */ } };

  async function loadAgents() {
    if (st.agents) return st.agents;
    const cached = ssGet('fdcv:agents:v1');
    if (cached && cached.length) {
      st.agents = new Map(cached);
      if (!st.agentsRefreshing) { st.agentsRefreshing = true; fetchAgents().finally(() => { st.agentsRefreshing = false; }); }
      return st.agents;
    }
    return fetchAgents();
  }

  async function fetchAgents() {
    const map = new Map();
    for (const u of ['/api/_/agents?per_page=100', '/api/v2/agents?per_page=100']) {
      try {
        const list = asList(await getJson(u), 'agents');
        for (const a of list) {
          const c = a.contact || a.user || a;
          map.set(String(a.id), { name: c.name || a.name || '', email: c.email || a.email || '' });
        }
        if (map.size) break;
      } catch (e) { /* best effort */ }
    }
    if (map.size || !st.agents) st.agents = map;
    if (map.size) ssSet('fdcv:agents:v1', [...map]);
    return st.agents;
  }

  async function loadMe() {
    if (st.meId) return st.meId;
    const cachedMe = ssGet('fdcv:me:v1');
    if (cachedMe) { st.meId = String(cachedMe); return st.meId; }
    for (const u of ['/api/_/bootstrap/me', '/api/_/bootstrap']) {
      try {
        const j = await getJson(u);
        const cand = [j.agent && j.agent.id, j.user && j.user.id, j.current_user && j.current_user.id,
          j.currentUser && j.currentUser.id, j.me && j.me.id, j.account && j.account.current_agent_id, j.id];
        const id = cand.find(x => x != null);
        if (id != null) { st.meId = String(id); ssSet('fdcv:me:v1', st.meId); return st.meId; }
      } catch (e) { /* best effort */ }
    }
    return null;
  }

  // ---------- modelo ----------
  function buildMessages(ticket, convs, agents, meId) {
    const msgs = [];
    const req = ticket.requester || {};
    const reqId = ticket.requester_id != null ? String(ticket.requester_id) : (req.id != null ? String(req.id) : null);
    const isAgent = id => id != null && agents.has(String(id));
    const agentName = id => (agents.get(String(id)) || {}).name || '';
    const agentMail = id => (agents.get(String(id)) || {}).email || '';

    // Mails de agentes -> id, para reconocer respuestas enviadas por fuera de Freshdesk
    // (Outlook/Gmail): llegan como "incoming" pero las escribio un agente.
    const byEmail = new Map();
    agents.forEach((a, id) => { if (a.email) byEmail.set(a.email.toLowerCase(), id); });
    const parseMail = v => { const m = String(v || '').match(/<([^>]+)>/); return (m ? m[1] : String(v || '')).trim().toLowerCase(); };
    // Dominios internos (opcion del popup): gente de la empresa sin usuario de agente va a la derecha.
    const domains = st.internalDomains || [];
    const isInternal = mail => {
      const d = (parseMail(mail).split('@')[1] || '');
      return !!d && domains.some(x => d === x || d.endsWith('.' + x));
    };

    const first = ticket.description_html || ticket.description || '';
    let reqAgentId = isAgent(reqId) ? reqId : (byEmail.has(parseMail(req.email)) ? String(byEmail.get(parseMail(req.email))) : null);
    const reqIsAgent = reqAgentId != null;
    msgs.push({
      id: 'd' + ticket.id, side: (reqIsAgent || isInternal(req.email)) ? 'right' : 'left',
      name: reqIsAgent ? agentName(reqAgentId) : (req.name || req.email || T('requester')),
      email: reqIsAgent ? agentMail(reqAgentId) : (req.email || ''),
      mine: reqIsAgent && meId != null && String(reqAgentId) === meId,
      time: ticket.created_at, html: first, attachments: ticket.attachments || [],
    });

    convs.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).forEach(c => {
      let uid = c.user_id != null ? String(c.user_id) : null;
      if (!isAgent(uid)) {
        const viaMail = byEmail.get(parseMail(c.from_email));
        if (viaMail != null) uid = String(viaMail);
      }
      const agent = isAgent(uid);
      let side = c.private ? 'note' : ((c.incoming && !agent && !isInternal(c.from_email)) ? 'left' : 'right');
      let name, email;
      if (agent) { name = agentName(uid); email = agentMail(uid); }
      else if (uid && uid === reqId) { name = req.name || ''; email = req.email || c.from_email || ''; }
      else { name = ''; email = c.from_email || ''; }
      if (!name) name = email ? email.split('@')[0] : (side === 'left' ? T('external') : T('agent'));
      msgs.push({
        id: String(c.id), side, name, email,
        mine: agent && meId != null && uid === meId,
        time: c.created_at, html: c.body_html || c.body || '', attachments: c.attachments || [],
      });
    });
    return msgs;
  }

  // ---------- DOM fallback ----------
  function scrapeDom() {
    const nodes = [...document.querySelectorAll('[data-test-conversation="conversation-text"] .ticket_note')];
    const msgs = nodes.map((n, i) => {
      const wrap = n.closest('[data-test-conversation]') || n.parentElement;
      const container = (wrap && (wrap.closest('article, .conversation, [class*="conversation"]') || wrap.parentElement)) || n;
      const who = container.querySelector('[data-test-conversation="conversation-author"], [class*="author"], [class*="requester"], a[href*="/contacts/"], a[href*="/agents/"]');
      const t = container.querySelector('time, [data-test-conversation="conversation-time"], [class*="time"]');
      const priv = /private|privad/i.test(container.className || '') || !!container.querySelector('[class*="private"]');
      return {
        id: 'dom' + i, side: priv ? 'note' : 'left', name: who ? who.textContent.trim() : T('message', { n: i + 1 }), email: '',
        mine: false, time: (t && (t.getAttribute('datetime') || t.getAttribute('title'))) || null,
        html: n.innerHTML, attachments: [],
      };
    });
    const subj = document.querySelector('[data-test-ticket-subject], .ticket-subject, h1, h2');
    return { ticket: { id: st.ticketId, subject: subj ? subj.textContent.trim() : '' }, msgs };
  }

  // ---------- helpers de UI ----------
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const initials = n => (String(n).trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('') || '?').toUpperCase();

  function relTime(d) {
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return T('justNow');
    const m = Math.round(s / 60); if (m < 60) return T('minAgo', { n: m });
    const h = Math.round(m / 60); if (h < 24) return T('hAgo', { n: h });
    const dd = Math.round(h / 24); if (dd < 30) return T('dAgo', { n: dd });
    const mo = Math.round(dd / 30); if (mo < 12) return mo > 1 ? T('moAgo', { n: mo }) : T('moAgo1');
    return T('yAgo', { n: Math.round(mo / 12) });
  }
  const dayKey = d => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  function dayLabel(d) {
    const now = new Date(); const y = new Date(); y.setDate(now.getDate() - 1);
    if (dayKey(d) === dayKey(now)) return T('today');
    if (dayKey(d) === dayKey(y)) return T('yesterday');
    const o = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== now.getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString(T('locale'), o).replace(/\./g, '');
  }
  function plainText(html) {
    const d = document.createElement('div'); d.innerHTML = html;
    return (d.innerText || d.textContent || '').trim();
  }
  async function copyText(t, btn) {
    try { await navigator.clipboard.writeText(t); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* ignore */ } ta.remove();
    }
    const old = btn.textContent; btn.textContent = T('copied'); setTimeout(() => { btn.textContent = old; }, 1200);
  }

  // ---------- shadow host ----------
  let cssText = null;
  async function loadCss() {
    if (cssText != null) return cssText;
    try { cssText = await (await fetch(chrome.runtime.getURL('chat.css'))).text(); }
    catch (e) { cssText = ''; }
    return cssText;
  }
  async function makeShadowHost(id) {
    const host = document.createElement('div');
    host.id = id;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = await loadCss();
    shadow.appendChild(style);
    const root = el('div', 'fdcv-root');
    shadow.appendChild(root);
    return { host, root };
  }

  // Estilo en la pagina (fuera del shadow): con el modo chat activo oculta la lista
  // original de mensajes, pero NO el editor de respuesta/nota ni las barras de Freshdesk.
  const PAGE_CSS = `
    html.fdcv-on .ticket-details-wrapper .__module-tickets__ticket-details__description,
    html.fdcv-on .ticket-details-wrapper .ticket-details__item--more,
    html.fdcv-on .ticket-details-wrapper .__module-tickets__ticket-details__conversation { display: none !important; }
    #fdcv-inline { display: block; margin: 0 0 12px; }

    /* Transicion al prender/apagar: la lista original se desvanece y el chat entra (y al reves). */
    html.fdcv-fading-out .ticket-details-wrapper .__module-tickets__ticket-details__description,
    html.fdcv-fading-out .ticket-details-wrapper .ticket-details__item--more,
    html.fdcv-fading-out .ticket-details-wrapper .__module-tickets__ticket-details__conversation { opacity: 0 !important; transition: opacity .18s ease !important; }
    #fdcv-inline.fdcv-enter { animation: fdcv-host-in .32s cubic-bezier(.2,.7,.3,1) both; }
    #fdcv-inline.fdcv-leave { animation: fdcv-host-out .16s ease-in both; pointer-events: none; }
    html.fdcv-native-in .ticket-details-wrapper .__module-tickets__ticket-details__description,
    html.fdcv-native-in .ticket-details-wrapper .ticket-details__item--more,
    html.fdcv-native-in .ticket-details-wrapper .__module-tickets__ticket-details__conversation { animation: fdcv-native-in .26s ease-out both; }
    @keyframes fdcv-host-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @keyframes fdcv-host-out { to { opacity: 0; transform: translateY(6px); } }
    @keyframes fdcv-native-in { from { opacity: 0; } to { opacity: 1; } }
    html.fdcv-noanim #fdcv-inline,
    html.fdcv-noanim .ticket-details-wrapper .__module-tickets__ticket-details__description,
    html.fdcv-noanim .ticket-details-wrapper .ticket-details__item--more,
    html.fdcv-noanim .ticket-details-wrapper .__module-tickets__ticket-details__conversation { animation: none !important; transition: none !important; }
    @media (prefers-reduced-motion: reduce) {
      #fdcv-inline.fdcv-enter, #fdcv-inline.fdcv-leave, html.fdcv-native-in .ticket-details-wrapper .__module-tickets__ticket-details__description,
    html.fdcv-native-in .ticket-details-wrapper .ticket-details__item--more,
    html.fdcv-native-in .ticket-details-wrapper .__module-tickets__ticket-details__conversation { animation: none !important; }
      html.fdcv-fading-out .ticket-details-wrapper .__module-tickets__ticket-details__description,
    html.fdcv-fading-out .ticket-details-wrapper .ticket-details__item--more,
    html.fdcv-fading-out .ticket-details-wrapper .__module-tickets__ticket-details__conversation { transition: none !important; }
    }
  `;
  function ensurePageStyle() {
    if (document.getElementById('fdcv-page-style')) return;
    const s = document.createElement('style');
    s.id = 'fdcv-page-style';
    s.textContent = PAGE_CSS;
    document.head.appendChild(s);
  }

  // Donde va el chat: arriba de la lista de mensajes de Freshdesk, dentro del mismo scroll.
  function inlineAnchor() {
    const w = document.querySelector('.ticket-details-wrapper');
    return w && (w.firstElementChild || w);
  }

  async function ensureHost() {
    if (st.host && st.host.isConnected) return;
    const { host, root } = await makeShadowHost('fdcv-host');
    if (st.host && st.host.isConnected) return; // carrera
    document.documentElement.appendChild(host);
    st.host = host; st.root = root; st.toggle = null;
    applyTheme();
    if (!st.themeObserver) {
      st.themeObserver = new MutationObserver(applyTheme);
      st.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      st.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    }
  }

  // Tema: sigue el de Freshdesk (body.dew-light-theme / dew-dark-theme).
  // Si no hay clase, decide por la luminancia del fondo de la página.
  function detectTheme() {
    const cls = (document.body.className || '') + ' ' + (document.documentElement.className || '');
    if (/\bdew-dark-theme\b|\bdark-theme\b|\btheme-dark\b/.test(cls)) return 'dark';
    if (/\bdew-light-theme\b|\blight-theme\b|\btheme-light\b/.test(cls)) return 'light';
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3) {
      const [r, g, b] = m.map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128 ? 'dark' : 'light';
    }
    return 'light';
  }
  function applyTheme() {
    if (st.noAnim) [st.root, st.inlineRoot].forEach(r => { if (r) r.setAttribute('data-noanim', ''); });
    const t = detectTheme();
    if (st.root) st.root.dataset.theme = t;
    if (st.inlineRoot) st.inlineRoot.dataset.theme = t;
  }

  function ensureToggle() {
    if (st.toggle && st.toggle.isConnected) return;
    const b = el('button', 'fdcv-toggle', T('toggle'));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(st.enabled));
    b.addEventListener('click', () => setEnabled(!st.enabled));
    b.hidden = !!st.hideButton;
    st.root.appendChild(b);
    st.toggle = b;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // animate=true solo cuando la persona apaga el chat (no al cambiar de ticket).
  function closeOverlay(animate) {
    st.renderedSig = null;
    detachScroll();
    clearTimeout(st.goLatestTmr);
    st.scroller = null;
    st.atLatest = true;
    closeLightbox();
    const html = document.documentElement;
    const host = st.inlineHost;
    st.inlineHost = st.inlineRoot = st.overlay = st.scroll = null;
    const tok = ++st.fadeToken;
    html.classList.remove('fdcv-fading-out');
    if (!animate || !host || !host.isConnected || reduceMotion()) {
      html.classList.remove('fdcv-on');
      if (host) host.remove();
      return;
    }
    host.classList.remove('fdcv-enter');
    host.classList.add('fdcv-leave');
    setTimeout(() => {
      host.remove();
      if (tok !== st.fadeToken) return; // se volvio a prender en el medio
      html.classList.remove('fdcv-on');
      html.classList.add('fdcv-native-in');
      setTimeout(() => { if (tok === st.fadeToken) html.classList.remove('fdcv-native-in'); }, 320);
    }, 160);
  }

  async function openOverlay() {
    const anchor = inlineAnchor();
    if (!anchor) return null; // Freshdesk todavia no pinto el ticket; el tick reintenta
    ensurePageStyle();
    if (!st.inlineHost) {
      const { host, root } = await makeShadowHost('fdcv-inline');
      st.inlineHost = host; st.inlineRoot = root;
      applyTheme();
    }
    const html = document.documentElement;
    const nativeVisible = !html.classList.contains('fdcv-on');
    if (nativeVisible && !reduceMotion()) {
      // 1) la lista original se desvanece  2) se oculta  3) el chat entra
      const tok = ++st.fadeToken;
      html.classList.remove('fdcv-native-in');
      html.classList.add('fdcv-fading-out');
      await sleep(180);
      if (tok !== st.fadeToken || !st.inlineHost) { html.classList.remove('fdcv-fading-out'); return null; }
      st.inlineHost.classList.add('fdcv-enter');
      const h = st.inlineHost;
      setTimeout(() => h.classList.remove('fdcv-enter'), 450);
    }
    if (!st.inlineHost.isConnected || st.inlineHost.parentElement !== anchor) anchor.prepend(st.inlineHost);
    html.classList.add('fdcv-on');
    html.classList.remove('fdcv-fading-out');
    st.stickyTop = null; syncStickyTop();
    if (!st.overlay) {
      st.overlay = el('div', 'fdcv-overlay');
      st.inlineRoot.appendChild(st.overlay);
    }
    return st.overlay;
  }

  // Ember puede re-renderizar la lista y sacar nuestro nodo: lo volvemos a enganchar.
  // La barra del chat se pega justo debajo del asunto fijo de Freshdesk (si lo hay), para que
  // "Firmas" y "Actualizar" no queden tapados al scrollear.
  function syncStickyTop() {
    if (!st.inlineHost) return;
    const subj = document.querySelector('.ticket-details-header.sticky-subject, .ticket-details-header');
    let top = 0;
    if (subj) {
      const cs = getComputedStyle(subj);
      if (cs.position === 'sticky' || cs.position === 'fixed') top = Math.round(subj.getBoundingClientRect().height);
    }
    if (st.stickyTop !== top) { st.stickyTop = top; st.inlineHost.style.setProperty('--fdcv-sticky-top', top + 'px'); }
  }

  function keepInline() {
    syncStickyTop();
    if (!st.enabled || !st.inlineHost || !st.overlay) return;
    const anchor = inlineAnchor();
    if (anchor && (!st.inlineHost.isConnected || st.inlineHost.parentElement !== anchor)) {
      anchor.prepend(st.inlineHost);
      document.documentElement.classList.add('fdcv-on');
    }
  }

  // Cantidad de mensajes que pinta Freshdesk: si sube (respondiste, entro algo nuevo), refrescamos.
  function nativeCount() {
    return document.querySelectorAll('.ticket-details-wrapper .__module-tickets__ticket-details__conversation').length;
  }

  function header(ov, title, count) {
    const h = el('div', 'fdcv-header');
    const t = el('div', 'fdcv-title');
    t.appendChild(document.createTextNode(title || 'Ticket'));
    const meta = el('span', 'fdcv-meta', `#${st.ticketId}${count != null ? ' · ' + T('messages', { n: count }) : ''}`);
    t.appendChild(meta);
    // Interruptor de firmas: algunos prefieren verlas siempre, por si la deteccion esconde de mas.
    const sigs = el('button', 'fdcv-btn fdcv-sigs-btn'); sigs.type = 'button';
    sigs.addEventListener('click', () => { applyShowSigs(!st.showSigs); store.setShowSigs(st.showSigs); });
    const upd = el('button', 'fdcv-btn', T('refresh')); upd.type = 'button';
    upd.addEventListener('click', () => render(true));
    const cls = el('button', 'fdcv-btn', '✕'); cls.type = 'button'; cls.title = T('closeChat');
    cls.addEventListener('click', () => setEnabled(false));
    h.append(t, sigs, upd, cls);
    ov.appendChild(h);
    applyShowSigs(st.showSigs);
  }

  // Skeleton mientras carga: imita burbujas reales (lado, nombre + mail, renglones, hora).
  // Se ubica abajo, donde va a aparecer lo ultimo, para que el cambio sea en el mismo lugar
  // (con "Mas nuevos arriba" se queda arriba, que es donde aparece lo ultimo).
  function showSkeleton(ov) {
    ov.textContent = '';
    header(ov, pageSubject(), null);
    const sc = el('div', 'fdcv-scroll fdcv-skeleton');
    sc.setAttribute('aria-busy', 'true');
    sc.setAttribute('aria-label', T('loading'));
    const day = el('div', 'fdcv-day'); day.appendChild(el('span', 'fdcv-sk fdcv-sk-pill')); sc.appendChild(day);
    // [lado, ancho de burbuja %, renglones (ancho %)]
    const rows = [
      ['left', 62, [96, 88, 54]],
      ['right', 54, [92, 70]],
      ['left', 48, [90, 40]],
      ['right', 66, [97, 93, 85, 46]],
      ['left', 40, [80]],
    ];
    rows.forEach(([side, bw, lines], i) => {
      const row = el('div', 'fdcv-row fdcv-' + side + ' fdcv-sk-row');
      row.style.setProperty('--i', i);
      row.appendChild(el('div', 'fdcv-avatar fdcv-sk'));
      const b = el('div', 'fdcv-bubble fdcv-sk-bubble');
      b.style.width = bw + '%';
      const who = el('div', 'fdcv-sk-whoRow');
      who.append(el('span', 'fdcv-sk fdcv-sk-name'), el('span', 'fdcv-sk fdcv-sk-mail'));
      b.appendChild(who);
      lines.forEach(w => { const l = el('div', 'fdcv-sk fdcv-sk-line'); l.style.width = w + '%'; b.appendChild(l); });
      const ft = el('div', 'fdcv-sk-foot'); ft.appendChild(el('span', 'fdcv-sk fdcv-sk-time')); b.appendChild(ft);
      row.appendChild(b);
      sc.appendChild(row);
    });
    ov.appendChild(sc);
    if (st.scrolledFor !== st.ticketId && !st.newestFirst) {
      requestAnimationFrame(() => { const l = sc.lastElementChild; if (l) l.scrollIntoView({ block: 'end' }); });
    }
  }
  // Asunto del ticket desde la pagina de Freshdesk, para el header del skeleton.
  function pageSubject() {
    const h = document.querySelector('.ticket-subject-heading, [data-test-id="ticket-subject"], .ticket-details-header h2, .ticket-details-header h1');
    return h ? h.textContent.trim() : null;
  }
  // Firma liviana de los datos: si no cambio nada, no re-renderizamos.
  const dataSig = d => {
    const c = d.convs || [];
    const last = c.length ? c[c.length - 1] : null;
    return [c.length, last && last.id, last && (last.updated_at || last.created_at), d.ticket && d.ticket.updated_at].join('|');
  };

  function showState(ov, text, isError) {
    ov.textContent = '';
    header(ov, null, null);
    ov.appendChild(el('div', 'fdcv-state' + (isError ? ' fdcv-error' : ''), text));
  }

  // ---------- burbuja ----------
  // Imagenes inline que no cargan (cid:, tokens vencidos): ocultarlas en vez de mostrar el alt roto.
  function hideBrokenImages(root) {
    root.querySelectorAll('img').forEach(img => {
      const hide = () => { img.style.display = 'none'; };
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) hide();
      else img.addEventListener('error', hide, { once: true });
      if (!img.getAttribute('src') || /^cid:/i.test(img.getAttribute('src'))) hide();
    });
  }

  function bubble(m, signatureHints) {
    const res = clean(m.html || '', { signatureHints, sender: { name: m.name, email: m.email } }) || {};
    const row = el('div', `fdcv-row fdcv-${m.side}${m.mine ? ' fdcv-mine' : ''}`);
    if (m.side !== 'note') row.appendChild(el('div', 'fdcv-avatar', initials(m.name)));
    const b = el('div', 'fdcv-bubble');

    const who = el('div', 'fdcv-who', (m.side === 'note' ? '🔒 ' : '') + m.name + (m.mine ? ' ' + T('me') : ''));
    if (m.email) who.appendChild(el('span', 'fdcv-email', m.email));
    b.appendChild(who);

    const body = el('div', 'fdcv-body');
    body.innerHTML = res.cleanHtml || '';
    hideBrokenImages(body);
    if (!body.textContent.trim() && !body.querySelector('img')) body.appendChild(el('em', '', T('noNewText')));
    b.appendChild(body);

    if (res.signatureHtml) {
      const sig = el('div', 'fdcv-sig');
      const tg = el('button', 'fdcv-link fdcv-sig-toggle', '· · ·'); tg.type = 'button'; tg.title = T('signature');
      const sb = el('div', 'fdcv-sig-body'); sb.hidden = true; sb.innerHTML = res.signatureHtml;
      hideBrokenImages(sb);
      tg.addEventListener('click', () => { sb.hidden = !sb.hidden; });
      sig.append(tg, sb); b.appendChild(sig);
    }

    if (m.attachments && m.attachments.length) {
      const at = el('div', 'fdcv-attachments');
      m.attachments.forEach(a => {
        const url = a.attachment_url || a.url || a.content_url;
        if (!url) return;
        const c = el('a', 'fdcv-chip', '📎 ' + (a.name || a.file_name || 'adjunto') + (a.size ? ` (${Math.max(1, Math.round(a.size / 1024))} KB)` : ''));
        c.href = url; c.target = '_blank'; c.rel = 'noopener noreferrer';
        at.appendChild(c);
      });
      if (at.childNodes.length) b.appendChild(at);
    }

    const foot = el('div', 'fdcv-foot');
    if (res.hasQuote && res.quotedHtml) {
      const q = el('button', 'fdcv-link', T('showQuote')); q.type = 'button';
      let box = null;
      q.addEventListener('click', () => {
        if (!box) { box = el('div', 'fdcv-quote-box'); box.innerHTML = res.quotedHtml; b.insertBefore(box, foot); q.textContent = T('hideQuote'); return; }
        box.hidden = !box.hidden; q.textContent = box.hidden ? T('showQuote') : T('hideQuote');
      });
      foot.appendChild(q);
    }
    const cp = el('button', 'fdcv-link', T('copy')); cp.type = 'button';
    cp.addEventListener('click', () => copyText(plainText(res.cleanHtml || ''), cp));
    foot.appendChild(cp);
    const d = m.time ? new Date(m.time) : null;
    if (d && !isNaN(d)) {
      const tm = el('span', 'fdcv-time', relTime(d));
      tm.title = d.toLocaleString(T('locale'));
      foot.appendChild(tm);
    }
    b.appendChild(foot);
    row.appendChild(b);
    return row;
  }

  // ---------- visor de imagenes (lightbox) ----------
  // Click en una imagen del chat: la abre grande. Click en la imagen alterna "ajustar" / tamaño real.
  // Flechas o botones ‹ › pasan entre las imagenes del ticket. Esc o click afuera cierra.
  function chatImages() {
    if (!st.overlay) return [];
    return [...st.overlay.querySelectorAll('.fdcv-body img, .fdcv-sig img, .fdcv-quote-box img')]
      .filter(img => img.style.display !== 'none' && img.getAttribute('src'))
      // salteamos logos/iconitos de firmas para que las flechas pasen por las capturas reales
      .filter(img => !img.complete || img.naturalWidth * img.naturalHeight >= 150000);
  }
  function openLightbox(img) {
    closeLightbox();
    const list = chatImages();
    if (!list.includes(img)) list.push(img), list.sort((x, y) => x.compareDocumentPosition(y) & 4 ? -1 : 1);
    let idx = Math.max(0, list.indexOf(img));
    const lb = el('div', 'fdcv-lightbox');
    lb.tabIndex = -1;
    const stage = el('div', 'fdcv-lb-stage');
    const big = document.createElement('img');
    big.className = 'fdcv-lb-img';
    big.alt = '';
    stage.appendChild(big);
    const bar = el('div', 'fdcv-lb-bar');
    const count = el('span', 'fdcv-lb-count');
    const open = el('a', 'fdcv-lb-btn', T('openOriginal'));
    open.target = '_blank'; open.rel = 'noopener noreferrer';
    const close = el('button', 'fdcv-lb-btn', '✕'); close.type = 'button'; close.title = T('closeEsc');
    bar.append(count, open, close);
    const prev = el('button', 'fdcv-lb-nav fdcv-lb-prev', '‹'); prev.type = 'button'; prev.title = T('prev');
    const next = el('button', 'fdcv-lb-nav fdcv-lb-next', '›'); next.type = 'button'; next.title = T('next');
    lb.append(stage, bar, prev, next);

    const show = i => {
      if (!list.length) return;
      idx = (i + list.length) % list.length;
      const src = list[idx].currentSrc || list[idx].src;
      big.src = src; open.href = src;
      big.classList.remove('fdcv-lb-actual');
      count.textContent = list.length > 1 ? `${idx + 1} / ${list.length}` : '';
      prev.hidden = next.hidden = list.length < 2;
    };
    big.addEventListener('click', e => { e.stopPropagation(); big.classList.toggle('fdcv-lb-actual'); });
    prev.addEventListener('click', e => { e.stopPropagation(); show(idx - 1); });
    next.addEventListener('click', e => { e.stopPropagation(); show(idx + 1); });
    close.addEventListener('click', e => { e.stopPropagation(); closeLightbox(); });
    bar.addEventListener('click', e => e.stopPropagation());
    lb.addEventListener('click', () => closeLightbox());
    // Teclas solo mientras el visor esta abierto; no las dejamos llegar a los atajos de Freshdesk.
    st.lbKeys = e => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'ArrowRight') show(idx + 1);
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    document.addEventListener('keydown', st.lbKeys, true);
    st.lightbox = lb;
    st.inlineRoot.appendChild(lb);
    show(idx);
    lb.focus();
  }
  function closeLightbox() {
    if (st.lbKeys) { document.removeEventListener('keydown', st.lbKeys, true); st.lbKeys = null; }
    if (st.lightbox) { st.lightbox.remove(); st.lightbox = null; }
  }
  function wireImageClicks(container) {
    container.addEventListener('click', e => {
      const img = e.target.closest && e.target.closest('img');
      if (!img || !container.contains(img) || img.closest('.fdcv-avatar')) return;
      if (!img.closest('.fdcv-body, .fdcv-sig, .fdcv-quote-box')) return;
      e.preventDefault(); e.stopPropagation(); // si la imagen esta dentro de un link, no navegar
      openLightbox(img);
    });
  }

  // ---------- scroll del chat ----------
  // El chat vive dentro del scroll de Freshdesk (.tickets-conversation-pane), no del de la pagina.
  // Todo se calcula con rects y scrollTop (sin rAF ni IntersectionObserver), asi funciona aunque
  // el navegador no este pintando frames (pestaña de fondo, ventana tapada).
  function findScroller(node) {
    let n = node && node.parentElement;
    while (n && n !== document.body) {
      const oy = getComputedStyle(n).overflowY;
      if (/(auto|scroll)/.test(oy) && n.scrollHeight > n.clientHeight + 4) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function scrollerRect(sc) {
    if (sc === document.scrollingElement || sc === document.documentElement) return { top: 0, bottom: innerHeight };
    return sc.getBoundingClientRect();
  }
  // "Lo mas reciente": la ultima burbuja (orden normal) o la primera (opcion "Mas nuevos arriba").
  const latestRow = () => {
    const rows = st.overlay ? [...st.overlay.querySelectorAll('.fdcv-scroll:not(.fdcv-skeleton) > .fdcv-row')] : [];
    return st.newestFirst ? rows[0] : rows.pop();
  };
  // Borde de arriba util: debajo de la barra del chat (sticky), que tapa lo que pasa por detras.
  function usableTop(sc) {
    const h = st.overlay && st.overlay.querySelector('.fdcv-header');
    const top = scrollerRect(sc).top + (st.stickyTop || 0);
    return h ? Math.max(top + h.offsetHeight, h.getBoundingClientRect().bottom) : top;
  }
  function latestIsVisible() {
    const row = latestRow(); const sc = st.scroller;
    if (!row || !sc) return true;
    const r = row.getBoundingClientRect(), b = scrollerRect(sc);
    if (st.newestFirst) return r.top >= usableTop(sc) - 40 && r.top < b.bottom; // se ve el principio del mas nuevo
    return r.bottom <= b.bottom + 40 && r.bottom > b.top; // el final del ultimo mensaje se ve (40 px de margen)
  }
  function goLatest(smooth) {
    const row = latestRow(); const sc = st.scroller || (st.inlineHost && findScroller(st.inlineHost));
    if (!row || !sc) return;
    st.pinned = true;                 // "pegado" a lo ultimo: si algo crece (imagenes), seguimos ahi
    st.autoScrollUntil = Date.now() + 900;
    st.scroller = sc;
    const r = row.getBoundingClientRect();
    const target = Math.min(Math.max(0, sc.scrollHeight - sc.clientHeight), Math.max(0, st.newestFirst
      ? sc.scrollTop + (r.top - usableTop(sc)) - 12
      : sc.scrollTop + (r.bottom - scrollerRect(sc).bottom) + 16));
    const behavior = smooth && !reduceMotion() ? 'smooth' : 'auto';
    try { sc.scrollTo({ top: target, behavior }); } catch (e) { sc.scrollTop = target; }
    if (behavior === 'auto') sc.scrollTop = target;
    clearTimeout(st.goLatestTmr);
    // Fallback: si el scroll suave no avanzo (sin frames), saltamos directo.
    st.goLatestTmr = setTimeout(() => {
      if (Math.abs(sc.scrollTop - target) > 4) sc.scrollTop = target;
      if (st.onScrollCheck) st.onScrollCheck();
    }, behavior === 'smooth' ? 700 : 0);
  }
  function detachScroll() {
    if (st.scroller && st.onScroll) st.scroller.removeEventListener('scroll', st.onScroll);
    if (st.onScroll) window.removeEventListener('resize', st.onScroll);
    st.onScroll = st.onScrollCheck = null;
  }

  // ---------- boton "ir al ultimo mensaje" ----------
  // Flota abajo a la derecha del chat (sticky). Se ve solo si el ultimo mensaje no esta a la vista.
  // Si entran mensajes nuevos: con la vista abajo, baja sola; si no, el boton muestra el contador.
  // Con "Mas nuevos arriba" todo se invierte: el boton flota arriba (debajo de la barra) y apunta ↑.
  function setupJump(ov, sc, rowsEls, newCount, wasAtLatest) {
    detachScroll();
    if (!rowsEls.length) return;
    const bar = el('div', 'fdcv-jump-bar' + (st.newestFirst ? ' fdcv-jump-top' : ''));
    const btn = el('button', 'fdcv-jump');
    btn.type = 'button';
    const label = T(st.newestFirst ? 'toTop' : 'toBottom');
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.appendChild(el('span', 'fdcv-jump-arrow', st.newestFirst ? '↑' : '↓'));
    const badge = el('span', 'fdcv-jump-badge');
    btn.appendChild(badge);
    bar.appendChild(btn);
    if (st.newestFirst) {
      // Arriba: va antes de la lista para que el sticky la acompañe desde el principio.
      const h = ov.querySelector('.fdcv-header');
      if (h) ov.style.setProperty('--fdcv-head-h', h.offsetHeight + 'px');
      sc.before(bar);
    } else ov.appendChild(bar);

    st.unseen = (st.unseenFor === st.ticketId ? st.unseen || 0 : 0);
    st.unseenFor = st.ticketId;
    const paintBadge = () => {
      badge.textContent = st.unseen ? T(st.unseen === 1 ? 'newOne' : 'newMany', { n: st.unseen }) : '';
      btn.classList.toggle('fdcv-jump-has-new', !!st.unseen);
    };
    btn.addEventListener('click', () => { st.unseen = 0; paintBadge(); goLatest(true); });

    st.scroller = findScroller(st.inlineHost);
    const check = () => {
      const vis = latestIsVisible();
      // Si la persona scrolleo lejos de lo ultimo (no fuimos nosotros), deja de estar "pegada".
      if (vis) st.pinned = true;
      else if (Date.now() > (st.autoScrollUntil || 0)) st.pinned = false;
      st.atLatest = vis;
      bar.classList.toggle('fdcv-jump-show', !vis);
      if (vis && st.unseen) { st.unseen = 0; paintBadge(); }
    };
    let tmr = null;
    st.onScroll = () => { if (!tmr) tmr = setTimeout(() => { tmr = null; check(); }, 80); };
    st.onScrollCheck = check;
    st.scroller.addEventListener('scroll', st.onScroll, { passive: true });
    window.addEventListener('resize', st.onScroll, { passive: true });

    if (newCount) {
      if (wasAtLatest) setTimeout(() => goLatest(true), 60);   // estabas en lo ultimo: seguimos la conversacion
      else st.unseen += newCount;                              // estabas leyendo mas atras: avisamos
    }
    paintBadge();
    setTimeout(check, 0);

    // Imagenes que terminan de cargar despues y agrandan la conversacion.
    sc.querySelectorAll('img').forEach(img => {
      if (img.complete) return;
      const onLoad = () => { if (st.pinned && st.scroller) goLatest(false); else check(); };
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onLoad, { once: true });
    });
  }

  // Sin animaciones: opcion del popup (equipos con pocos recursos) o preferencia del sistema.
  const reduceMotion = () => { if (st.noAnim) return true; try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function applyNoAnim(v) {
    st.noAnim = !!v;
    document.documentElement.classList.toggle('fdcv-noanim', st.noAnim);
    [st.root, st.inlineRoot].forEach(r => { if (r) r.toggleAttribute('data-noanim', st.noAnim); });
  }

  function renderMessages(ov, ticket, msgs, domMode) {
    // Transicion: si venimos del skeleton, lo dejamos encima (abajo de todo) y lo desvanecemos
    // mientras aparecen las burbujas. Si es un repintado, solo se animan los mensajes nuevos.
    const skel = ov.querySelector('.fdcv-skeleton');
    const fromSkeleton = !!skel;
    const prevIds = (st.shownFor === st.ticketId && st.shownIds) ? st.shownIds : null;
    ov.textContent = '';
    header(ov, ticket.subject, msgs.length);
    if (domMode) ov.appendChild(el('div', 'fdcv-banner', T('domMode')));
    const sc = el('div', 'fdcv-scroll');
    st.scroll = sc;
    wireImageClicks(sc);
    const hints = [];
    if (st.agents) st.agents.forEach(a => { if (a.name) hints.push(a.name); if (a.email) hints.push(a.email); });
    let last = null;
    // "Mas nuevos arriba": mismo armado, en orden inverso; el separador de dia queda arriba de su grupo.
    (st.newestFirst ? msgs.slice().reverse() : msgs).forEach(m => {
      const d = m.time ? new Date(m.time) : null;
      if (d && !isNaN(d) && dayKey(d) !== last) {
        last = dayKey(d);
        const dv = el('div', 'fdcv-day'); dv.appendChild(el('span', '', dayLabel(d))); sc.appendChild(dv);
      }
      try { const row = bubble(m, hints); row.dataset.mid = m.id; sc.appendChild(row); }
      catch (e) { sc.appendChild(el('div', 'fdcv-state fdcv-error', T('renderError', { err: e.message }))); }
    });
    ov.appendChild(sc);

    const rowsEls = [...sc.querySelectorAll(':scope > .fdcv-row')];
    if (!reduceMotion()) {
      if (fromSkeleton || !prevIds) {
        // primera pintada: fade escalonado de lo que se ve (los ultimos mensajes, o los primeros si van arriba)
        const tail = st.newestFirst ? rowsEls.slice(0, 6) : rowsEls.slice(-6);
        tail.forEach((r, i) => { r.style.setProperty('--i', i); r.classList.add('fdcv-in'); });
        sc.querySelectorAll(':scope > .fdcv-day').forEach(d => d.classList.add('fdcv-in-soft'));
      } else {
        // repintado: solo los mensajes que no estaban
        rowsEls.filter(r => !prevIds.has(r.dataset.mid)).forEach((r, i) => { r.style.setProperty('--i', i); r.classList.add('fdcv-in', 'fdcv-new'); });
      }
      if (skel) {
        skel.classList.add('fdcv-sk-leave');
        skel.removeAttribute('aria-busy');
        ov.appendChild(skel);
        const drop = () => skel.remove();
        skel.addEventListener('animationend', e => { if (e.target === skel) drop(); });
        setTimeout(drop, 600);
      }
    }
    // Red de seguridad: si el navegador no corre las animaciones (pestaña sin pintar, ventana tapada),
    // a los ~1,2 s se sacan las clases para que nada quede invisible ni el skeleton encima.
    setTimeout(() => {
      sc.querySelectorAll('.fdcv-in, .fdcv-in-soft').forEach(r => r.classList.remove('fdcv-in', 'fdcv-in-soft'));
      if (skel && skel.isConnected) skel.remove();
    }, 1200);
    const newRows = prevIds ? rowsEls.filter(r => !prevIds.has(r.dataset.mid)) : [];
    const wasAtLatest = st.atLatest !== false || st.pinned === true;
    setupJump(ov, sc, rowsEls, prevIds ? newRows.length : 0, wasAtLatest);
    st.shownFor = st.ticketId;
    st.shownIds = new Set(rowsEls.map(r => r.dataset.mid));

    if (!st.scrolledFor || st.scrolledFor !== st.ticketId) {
      st.scrolledFor = st.ticketId;
      goLatest(false);
      setTimeout(() => goLatest(false), 400); // imagenes que cargan tarde
    }
  }

  // ---------- render ----------
  async function render(force) {
    if (force === true) st.forceRender = true;
    if (!st.enabled || !st.ticketId) return;
    await ensureHost();
    ensureToggle();
    if (!inlineAnchor()) { st.pendingRender = true; return; } // Freshdesk todavia no pinto el ticket
    const token = ++st.loadToken;
    const id = st.ticketId;
    // Los pedidos arrancan ya; el fade de entrada corre mientras tanto.
    const dataP = Promise.all([
      fetchApi(id).catch(e => ({ err: e })),
      loadAgents(), loadMe(),
    ]);
    dataP.catch(() => {});
    const ov = await openOverlay();
    if (!ov) { st.pendingRender = true; return; }
    st.pendingRender = false;
    st.lastNative = nativeCount();
    // Ticket ya visto en esta pestaña: se muestra al instante y se actualiza por detras.
    st.cache = st.cache || new Map();
    const cached = st.cache.get(id);
    const paint = (d, agents, me) => renderMessages(st.overlay, { subject: d.ticket.subject }, buildMessages(d.ticket, d.convs, agents, me), false);
    if (cached && st.agents) {
      if (st.renderedSig !== id + '#' + dataSig(cached)) {
        paint(cached, st.agents, st.meId);
        st.renderedSig = id + '#' + dataSig(cached);
      }
    } else if (!st.overlay.childElementCount || st.overlay.querySelector('.fdcv-state')) {
      showSkeleton(ov);
    }
    try {
      const [data, agents, me] = await dataP;
      if (token !== st.loadToken || !st.enabled) return;
      if (data.err) throw data.err;
      st.cache.set(id, data);
      if (st.cache.size > 20) st.cache.delete(st.cache.keys().next().value);
      const sig = id + '#' + dataSig(data);
      if (sig !== st.renderedSig || st.forceRender) {
        paint(data, agents, me);
        st.renderedSig = sig;
      }
      st.forceRender = false;
    } catch (apiErr) {
      if (token !== st.loadToken || !st.enabled) return;
      const dom = scrapeDom();
      if (dom.msgs.length) renderMessages(st.overlay, dom.ticket, dom.msgs, true);
      else showState(st.overlay, T('loadError', { err: (apiErr && apiErr.message) || apiErr }), true);
    }
  }

  // "miempresa.com, @ejemplo.com" -> ['miempresa.com', 'ejemplo.com']
  function parseDomains(v) {
    const list = Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/);
    return list.map(x => String(x).trim().toLowerCase().replace(/^.*@/, '').replace(/^\.+|\.+$/g, ''))
      .filter(x => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x));
  }

  function applyEnabled(v) {
    if (st.enabled === !!v && (!v || st.overlay)) return;
    st.enabled = !!v;
    if (st.toggle) st.toggle.setAttribute('aria-pressed', String(st.enabled));
    if (st.enabled) render(); else { st.loadToken++; closeOverlay(true); }
  }
  async function setEnabled(v) {
    applyEnabled(v);
    await store.set(st.enabled);
  }

  // Firmas visibles/ocultas: lo usa el boton de la barra y el popup de la extension.
  function applyShowSigs(v) {
    st.showSigs = !!v;
    if (!st.overlay) return;
    st.overlay.classList.toggle('fdcv-show-sigs', st.showSigs);
    const b = st.overlay.querySelector('.fdcv-sigs-btn');
    if (b) {
      b.textContent = st.showSigs ? T('sigsShown') : T('sigsHidden');
      b.setAttribute('aria-pressed', String(st.showSigs));
      b.title = st.showSigs ? T('sigsShownTitle') : T('sigsHiddenTitle');
    }
  }

  // Cambios hechos desde el popup (u otra pestaña): se aplican en vivo.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.fdcvEnabled && st.ticketId) applyEnabled(changes.fdcvEnabled.newValue);
      if (changes.fdcvShowSignatures) applyShowSigs(changes.fdcvShowSignatures.newValue !== false);
      if (changes.fdcvLang) {
        I18N.setPref(changes.fdcvLang.newValue);
        if (st.toggle) st.toggle.textContent = T('toggle');
        st.renderedSig = null;
        if (st.enabled && st.overlay) render(); // re-pinta con el idioma nuevo
      }
      if (changes.fdcvInternalDomains) {
        st.internalDomains = parseDomains(changes.fdcvInternalDomains.newValue);
        st.renderedSig = null;
        if (st.enabled && st.overlay) render();
      }
      if (changes.fdcvNewestFirst) {
        st.newestFirst = !!changes.fdcvNewestFirst.newValue;
        st.renderedSig = null; st.scrolledFor = null; st.atLatest = true;
        if (st.enabled && st.overlay) render(); // re-pinta en el orden nuevo y va a lo ultimo
      }
      if (changes.fdcvNoAnimations) applyNoAnim(changes.fdcvNoAnimations.newValue);
      if (changes.fdcvHideButton) {
        st.hideButton = !!changes.fdcvHideButton.newValue;
        if (st.toggle) st.toggle.hidden = st.hideButton;
      }
    });
  } catch (e) { /* fuera de la extension (pruebas) */ }

  // ---------- ciclo de vida / SPA ----------
  function onTicketChange() {
    const id = getTicketId();
    st.loadToken++;
    st.ticketId = id;
    closeOverlay();
    if (!id) {
      if (st.host) { st.host.remove(); st.host = st.root = st.toggle = null; }
      st.scrolledFor = null;
      return;
    }
    ensureHost().then(() => {
      if (st.ticketId !== id) return;
      ensureToggle();
      st.toggle.setAttribute('aria-pressed', String(st.enabled));
      if (st.enabled) render();
    });
  }


  (async () => {
    st.enabled = await store.get();
    try { I18N.setPref((await chrome.storage.local.get('fdcvLang')).fdcvLang || 'auto'); } catch (e) { /* auto */ }
    st.showSigs = await store.getShowSigs();
    try { applyNoAnim((await chrome.storage.local.get('fdcvNoAnimations')).fdcvNoAnimations); } catch (e) { /* con animaciones */ }
    try { st.internalDomains = parseDomains((await chrome.storage.local.get('fdcvInternalDomains')).fdcvInternalDomains); } catch (e) { st.internalDomains = []; }
    try { st.newestFirst = !!(await chrome.storage.local.get('fdcvNewestFirst')).fdcvNewestFirst; } catch (e) { st.newestFirst = false; }
    try { st.hideButton = !!(await chrome.storage.local.get('fdcvHideButton')).fdcvHideButton; } catch (e) { st.hideButton = false; }
    let cur = null;
    const tick = () => {
      const id = getTicketId();
      if (id !== cur) { cur = id; onTicketChange(); }
      else if (st.enabled) {
        if (st.pendingRender) render();
        else {
          keepInline();
          const n = nativeCount();
          if (st.overlay && st.lastNative != null && n > st.lastNative) render();
        }
      }
    };
    tick();
    setInterval(tick, 500);
  })();
})();
