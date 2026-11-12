/*
 * Chat View for Freshdesk - quote / signature cleaning.
 *
 *   FDCV.cleanMessage(html, opts) -> { cleanHtml, quotedHtml, signatureHtml, hasQuote }
 *
 * opts: { signatureHints?: string[], doc?: Document, DOMParser?: typeof DOMParser }
 *
 * Plain JS, no dependencies. Works as a content script (attaches to globalThis.FDCV)
 * and in Node (module.exports = { cleanMessage }) given a DOMParser (jsdom).
 *
 * Philosophy: conservative. When unsure we KEEP content in cleanHtml.
 */
(function () {
  'use strict';

  // Frases que practicamente solo aparecen en firmas: alcanza con que esten en una linea corta.
  var STRONG_HINTS = [];
  var DEFAULT_SIGNATURE_HINTS = [];

  // ---------------------------------------------------------------- constants
  var NODE_ELEMENT = 1, NODE_TEXT = 3, NODE_COMMENT = 8;

  var BLOCK = {
    DIV: 1, P: 1, TABLE: 1, TBODY: 1, THEAD: 1, TFOOT: 1, TR: 1, TD: 1, TH: 1,
    UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, PRE: 1, HR: 1, BODY: 1, CENTER: 1,
    H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, SECTION: 1, ARTICLE: 1, HEADER: 1, FOOTER: 1,
  };

  // Elements removed together with their content.
  var DROP = {
    script: 1, style: 1, iframe: 1, frame: 1, frameset: 1, object: 1, embed: 1, applet: 1,
    head: 1, title: 1, meta: 1, link: 1, base: 1, form: 1, input: 1, button: 1, select: 1,
    textarea: 1, noscript: 1, template: 1, svg: 1, math: 1, audio: 1, video: 1, canvas: 1,
    xml: 1,
  };

  // Elements kept (everything else is unwrapped: children are kept, tag is dropped).
  var ALLOWED = {
    a: 1, br: 1, p: 1, div: 1, ul: 1, ol: 1, li: 1,
    table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, td: 1, th: 1,
    b: 1, i: 1, strong: 1, em: 1, img: 1,
    blockquote: 1, pre: 1, code: 1, hr: 1,
    h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1,
  };

  var QUOTE_SELECTOR = [
    '.gmail_quote_container', '.gmail_quote', 'blockquote[type="cite"]', '.freshdesk_quote',
    '#divRplyFwdMsg', '#appendonsend', '[id$="divRplyFwdMsg"]', '[id$="appendonsend"]',
    '.yahoo_quoted', '[id^="yahoo_quoted"]', '.moz-cite-prefix', '.OutlookMessageHeader',
    '.zmail_extra', '.protonmail_quote',
  ].join(',');

  var WROTE_END = /(?:wrote|escribió|escribio|escreveu|a écrit|schrieb|scrisse)\s*:\s*$/i;
  var ATTR_START = /^\s*(?:On|El|Em|Le|Am|Il|Op|Den)\b/;
  var ATTR_FULL = /(?:^|\n)[ \t]*((?:On|El|Em|Le|Am|Il|Op|Den)\s[\s\S]{3,400}?(?:wrote|escribió|escribio|escreveu|a écrit|schrieb|scrisse)\s*:)\s*$/i;
  var ORIGINAL_MSG = /(?:^|\n)[ \t]*-{3,}\s*(?:Original Message|Mensaje original|Mensagem original|Message d'origine|Ursprüngliche Nachricht|Messaggio originale)\s*-{3,}/i;
  var HEADER_FROM = /^\s*(?:From|De|Von|Da|Från)\s*:/i;
  var HEADER_DATE = /\b(?:Sent|Enviado(?: el)?|Enviada|Date|Fecha|Data|Datum|Gesendet)\s*:/i;
  var HEADER_TO = /\b(?:To|Para|Subject|Asunto|Assunto|Betreff|An|Objet|Oggetto)\s*:/i;
  var CLOSING = /^(?:saludos|saludo|un saludo|cordial saludo|atentamente|atte|cordialmente|regards|best regards|kind regards|warm regards|best|thanks|thank you|gracias|muchas gracias|abrazo|abrazos|sincerely|cheers|att|saludos cordiales|muchas gracias por todo)\b/i;
  var SENT_FROM = /^\s*(?:sent from my|enviado desde mi|enviado de mi|get outlook for|obtener outlook para|sent from outlook|sent from yahoo)/i;
  var DISCLAIMER = /(?:confidential|privileged|designated recipient|confidencial|aviso legal|disclaimer|destinatario|intended recipient)/i;
  var SIG_IMG_HINT = /logo|image00\d|firma|signature|footer|linkedin|facebook|twitter|instagram|banner/i;

  var TAIL_LIMIT = 1500;       // max chars of "signature" tail after a hint
  var DISCLAIMER_TAIL = 6000;  // max chars of tail after hr when it is a disclaimer

  // ---------------------------------------------------------------- DOM utils
  function isBlankText(n) {
    return n.nodeType === NODE_TEXT && !/[^\s​﻿]/.test(n.data);
  }
  function isBlock(n) { return n && n.nodeType === NODE_ELEMENT && BLOCK[n.nodeName] === 1; }
  function norm(s) { return String(s).replace(/[\s ​﻿]+/g, ' ').trim(); }

  function parse(html, opts) {
    var P = opts.DOMParser
      || (opts.doc && opts.doc.defaultView && opts.doc.defaultView.DOMParser)
      || (typeof DOMParser !== 'undefined' ? DOMParser : null)
      || (typeof globalThis !== 'undefined' && globalThis.DOMParser)
      || null;
    if (P) return new P().parseFromString(html, 'text/html');
    if (opts.doc && opts.doc.implementation) {
      var d = opts.doc.implementation.createHTMLDocument('');
      d.body.innerHTML = html;
      return d;
    }
    throw new Error('FDCV.cleanMessage: no DOMParser available (pass opts.DOMParser or opts.doc)');
  }

  function mkWalker(root, what) {
    return root.ownerDocument.createTreeWalker(root, what);
  }

  // Move `node` and everything after it (in document order, up to root) out of the tree.
  // Returns the removed markup as an HTML string.
  function cutFrom(node, root) {
    var box = root.ownerDocument.createElement('div');
    var n = node;
    var parent = node.parentNode;
    for (;;) {
      while (n) { var nx = n.nextSibling; box.appendChild(n); n = nx; }
      if (!parent || parent === root) break;
      n = parent.nextSibling;
      parent = parent.parentNode;
    }
    return box.innerHTML;
  }

  function prevMeaningful(n, skipBr) {
    var p = n.previousSibling;
    while (p && (isBlankText(p) || p.nodeType === NODE_COMMENT || (skipBr && p.nodeName === 'BR'))) p = p.previousSibling;
    return p;
  }

  // Text of `start` and everything following it (up to root), capped to ~max chars.
  function tailText(start, root, max) {
    var s = start.textContent || '';
    var cur = start;
    while (s.length < max) {
      while (cur && cur !== root && !cur.nextSibling) cur = cur.parentNode;
      if (!cur || cur === root) break;
      cur = cur.nextSibling;
      s += cur.textContent || '';
    }
    return s;
  }

  function textBefore(node, root) {
    var r = root.ownerDocument.createRange();
    r.setStart(root, 0);
    r.setEndBefore(node);
    var txt = r.toString();
    if (norm(txt)) return true;
    var frag = r.cloneContents();
    return !!(frag.querySelector && frag.querySelector('img,table'));
  }

  function hasContent(el) {
    if (norm(el.textContent || '')) return true;
    return !!el.querySelector('img,table');
  }

  // Walk back to the beginning of the visual line holding `node` (climbs out of inline wrappers).
  function lineStart(node, root) {
    var n = node;
    for (;;) {
      var prev = n.previousSibling;
      while (prev && (isBlankText(prev) || prev.nodeType === NODE_COMMENT)) prev = prev.previousSibling;
      if (prev) {
        if (prev.nodeName === 'BR' || isBlock(prev)) break;
        n = prev;
        continue;
      }
      var par = n.parentNode;
      if (!par || par === root || isBlock(par)) break;
      n = par;
    }
    return n;
  }

  function lineStartSameLevel(node) {
    var n = node;
    for (;;) {
      var prev = n.previousSibling;
      if (!prev) break;
      if (prev.nodeName === 'BR' || isBlock(prev)) break;
      n = prev;
    }
    return n;
  }

  // ------------------------------------------------------------- dimension utils
  function cssLen(v) {
    if (v == null) return null;
    var m = /^\s*([\d.]+)\s*(px|in|pt|cm|mm)?\s*$/i.exec(String(v));
    if (!m) return null;
    var x = parseFloat(m[1]);
    switch ((m[2] || 'px').toLowerCase()) {
      case 'in': return x * 96;
      case 'pt': return x * 1.333;
      case 'cm': return x * 37.8;
      case 'mm': return x * 3.78;
      default: return x;
    }
  }
  function styleProp(style, prop) {
    var m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'i').exec(style || '');
    return m ? m[1].trim() : null;
  }
  function isSigImage(img) {
    var w = cssLen(img.getAttribute('width')), h = cssLen(img.getAttribute('height'));
    var st = img.getAttribute('style') || '';
    var sw = cssLen(styleProp(st, 'width')), sh = cssLen(styleProp(st, 'height'));
    w = w != null ? w : sw; h = h != null ? h : sh;
    if (w != null && w <= 250) return true;
    if (h != null && h <= 100) return true;
    if (w != null || h != null) return false;
    return SIG_IMG_HINT.test((img.getAttribute('src') || '') + ' ' + (img.getAttribute('alt') || ''));
  }

  // ----------------------------------------------------------- pre-processing
  function isUnsafeUrl(v) {
    var s = String(v).replace(/[\u0000-  ​]/g, '').toLowerCase();
    return /^(?:javascript|vbscript|data|file|blob):/.test(s);
  }

  // Remove active content and hidden stuff, expand `white-space: pre` newlines into <br>.
  function preSanitize(body) {
    var doc = body.ownerDocument;
    var all = Array.prototype.slice.call(body.querySelectorAll('*'));
    all.forEach(function (el) {
      if (!el.parentNode) return;
      var tag = el.localName;
      if (DROP[tag]) { el.parentNode.removeChild(el); return; }
      var st = (el.getAttribute('style') || '').toLowerCase().replace(/\s+/g, '');
      if (st && (/display:none/.test(st) || /mso-hide:all/.test(st))) { el.parentNode.removeChild(el); return; }
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      });
    });
    // white-space:pre -> <br>
    var pres = Array.prototype.slice.call(body.querySelectorAll('[style*="white-space"]'));
    pres.forEach(function (el) {
      if (!/white-space\s*:\s*pre/i.test(el.getAttribute('style') || '')) return;
      var w = mkWalker(el, 4), texts = [], t;
      while ((t = w.nextNode())) { if (t.data.indexOf('\n') >= 0) texts.push(t); }
      texts.forEach(function (tn) {
        var parts = tn.data.split(/\r?\n/);
        var par = tn.parentNode;
        parts.forEach(function (part, i) {
          if (i > 0) par.insertBefore(doc.createElement('br'), tn);
          if (part) par.insertBefore(doc.createTextNode(part), tn);
        });
        par.removeChild(tn);
      });
    });
  }

  // ---------------------------------------------------------------- quote marker
  function attributionStart(t) {
    var data = t.data;
    var m = ATTR_FULL.exec(data);
    if (m) {
      var idx = m.index + m[0].indexOf(m[1]);
      return { node: t, offset: idx };
    }
    // attribution split over several nodes: "On Mon, X <" + <a>mail</a> + "> wrote:"
    if (/\n/.test(data.replace(/\s+$/, '')) && !ATTR_START.test(data)) return null;
    var acc = data, node = t, guard = 0;
    for (;;) {
      var prev = node.previousSibling;
      if (!prev) {
        var par = node.parentNode;
        if (!par || isBlock(par) || par.nodeName === 'BODY') break;
        node = par; continue;
      }
      if (prev.nodeName === 'BR' || isBlock(prev)) break;
      acc = (prev.textContent || '') + acc;
      node = prev;
      if (acc.length > 500 || ++guard > 40) return null;
    }
    if (!ATTR_START.test(acc) || acc.length > 500) return null;
    return { node: node, offset: 0 };
  }

  function headerBlockStart(t, body) {
    if (!HEADER_FROM.test(t.data)) return null;
    var top = t;
    for (;;) {
      var prev = prevMeaningful(top, false);
      if (prev) break;
      var par = top.parentNode;
      if (!par || par === body || isBlock(par)) break;
      top = par;
    }
    var before = prevMeaningful(top, false);
    if (before && before.nodeName !== 'BR' && !isBlock(before)) return null; // mid-line
    var snippet = tailText(top, body, 800).slice(0, 800);
    if (HEADER_DATE.test(snippet) && HEADER_TO.test(snippet)) return top;
    return null;
  }

  function styleMarker(el) {
    var st = (el.getAttribute('style') || '').toLowerCase().replace(/\s+/g, '');
    if (!st) return false;
    return /border-top:solid#(?:e1e1e1|b5c4df)/.test(st) || /border:none;border-top:solid#(?:e1e1e1|b5c4df)/.test(st);
  }

  function findQuoteMarker(body) {
    var w = mkWalker(body, 1 | 4);
    var n, found = null;
    while ((n = w.nextNode())) {
      if (n.nodeType === NODE_ELEMENT) {
        var hit = false;
        try { hit = n.matches(QUOTE_SELECTOR); } catch (e) { hit = false; }
        if (!hit && styleMarker(n) && HEADER_FROM.test(norm(n.textContent || '').slice(0, 40))) hit = true;
        if (hit) { found = n; break; }
        continue;
      }
      var d = n.data;
      if (!/\S/.test(d)) continue;
      var m = ORIGINAL_MSG.exec(d);
      if (m) {
        var at = m.index + m[0].search(/-/);
        found = at > 0 ? n.splitText(at) : n;
        break;
      }
      if (WROTE_END.test(d.replace(/\s+$/, ''))) {
        var a = attributionStart(n);
        if (a) {
          found = a.offset > 0 ? a.node.splitText(a.offset) : a.node;
          break;
        }
      }
      var hb = headerBlockStart(n, body);
      if (hb) { found = hb; break; }
    }
    if (!found) return null;
    // include a separator <hr> right before the marker (Outlook)
    var cur = found;
    for (;;) {
      var p = prevMeaningful(cur, true);
      if (p && p.nodeName === 'HR') { found = p; break; }
      if (!p && cur.parentNode && cur.parentNode !== body && !isBlankLine(cur.parentNode, cur)) {
        cur = cur.parentNode; continue;
      }
      break;
    }
    return found;
  }

  // true if `par` has real content before `child` (so we must not climb)
  function isBlankLine(par, child) {
    var n = par.firstChild;
    while (n && n !== child) {
      if (!(isBlankText(n) || n.nodeType === NODE_COMMENT || n.nodeName === 'BR')) return true;
      n = n.nextSibling;
    }
    return false;
  }

  // --------------------------------------------------------------- signature
  function extendBack(S, body) {
    var lines = 0;
    for (;;) {
      var p = S.previousSibling, gap = 0;
      while (p && (isBlankText(p) || p.nodeType === NODE_COMMENT || p.nodeName === 'BR')) {
        if (p.nodeName === 'BR') gap++;
        p = p.previousSibling;
      }
      if (!p) {
        var par = S.parentNode;
        if (!par || par === body) return S;
        S = par;
        continue;
      }
      if (gap >= 2 || lines >= 6) return S;
      var unit, text;
      if (isBlock(p)) {
        if (p.nodeName === 'HR') return S;
        unit = p; text = norm(p.textContent || '');
      } else if (p.nodeType === NODE_ELEMENT && p.nodeName === 'IMG') {
        if (!isSigImage(p)) return S;
        S = p; continue;
      } else {
        unit = lineStartSameLevel(p);
        text = '';
        for (var q = unit; q; q = q.nextSibling) {
          text += q.textContent || '';
          if (q === p) break;
        }
        text = norm(text);
      }
      if (!text) {
        if (unit.querySelector && unit.querySelector('img')) {
          var imgs = unit.querySelectorAll('img'), ok = true;
          for (var i = 0; i < imgs.length; i++) if (!isSigImage(imgs[i])) ok = false;
          if (!ok) return S;
        } else if (unit.querySelector && unit.querySelector('table')) {
          return S;
        }
        S = unit; continue;
      }
      if (text.length > 60 || CLOSING.test(text) || /[.,:;!?]$/.test(text)) return S;
      S = unit; lines++;
    }
  }

  var BLOCK_TAGS = /^(DIV|P|LI|TD|TH|TR|TABLE|BLOCKQUOTE|H[1-6]|SECTION|ARTICLE)$/;
  function blockOf(node, body) {
    var n = node.parentNode;
    while (n && n !== body && !BLOCK_TAGS.test(n.nodeName)) n = n.parentNode;
    return n || body;
  }
  function squash(s) { return String(s || '').replace(/[\s\u00a0]+/g, ' ').trim(); }

  // Una pista (nombre, mail, cargo...) solo marca firma si aparece
  // en una linea corta tipo firma, y no como mencion ("@Ana Pérez ...") ni en medio de prosa.
  function hintIsSigLine(lcData, hint, textNode, body) {
    var at = lcData.indexOf(hint);
    if (at < 0) return false;
    while (at >= 0) {
      var before = lcData.slice(0, at).replace(/\s+$/, '');
      if (before.slice(-1) !== '@') break;
      at = lcData.indexOf(hint, at + 1);
    }
    if (at < 0) return false;
    var line = squash(blockOf(textNode, body).textContent);
    if (line.length > 100) return false;
    if (/^@/.test(line)) return false;
    // Pistas debiles (nombres y mails, que tambien aparecen en prosa: "mandamela a x@miempresa.com"):
    // la linea tiene que ser casi solo la pista ("Ana Pérez", "Mail: x@...", "x@... | +1 555...").
    if (STRONG_HINTS.indexOf(hint) < 0 && line.length - hint.length > 30) return false;
    return true;
  }

  // Desde S hasta el final: si hay algun bloque de prosa larga, no es una firma.
  function hasProseTail(S, body) {
    var range = body.ownerDocument.createRange();
    range.setStartBefore(S);
    range.setEndAfter(body.lastChild || body);
    var frag = range.cloneContents();
    var blocks = frag.querySelectorAll ? frag.querySelectorAll('div, p, li, td') : [];
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].querySelector('div, p, li, td')) continue; // solo bloques hoja
      var txt = squash(blocks[i].textContent);
      if (!txt) continue;
      if (txt.length > 160 && /[.!?]\s/.test(txt)) return true;
      // Un cierre ("Saludos cordiales,", "Best regards") despues del supuesto inicio:
      // la firma empieza despues, no aca.
      if (txt.length <= 40 && CLOSING.test(txt)) return true;
      // Oracion completa ("En caso de problemas ... contacta a soporte en: x@...").
      if (txt.length > 60 && /[.:!?]/.test(txt) && /\s(de|en|a|con|para|por|el|la|los|las|the|to|for|with|and|y|o)\s/i.test(txt)) return true;
    }
    return false;
  }

  function detectSignature(body, hints) {
    var cands = [];
    var lcHints = hints.map(function (h) { return String(h).toLowerCase(); }).filter(Boolean);

    // text-node based candidates
    var w = mkWalker(body, 4), t;
    while ((t = w.nextNode())) {
      var data = t.data;
      if (!/\S/.test(data)) continue;
      var trimmed = data.trim();
      var lc = data.toLowerCase();
      var S = null, limit = TAIL_LIMIT;

      if (trimmed === '--' || trimmed === '-- ' || trimmed === '—') {
        S = lineStart(t, body);
      } else if (SENT_FROM.test(data) && trimmed.length <= 80) {
        S = lineStart(t, body); limit = 400;
      } else if (data.length <= 200 && lcHints.some(function (h) { return hintIsSigLine(lc, h, t, body); })) {
        S = extendBack(lineStart(t, body), body);
        if (S && hasProseTail(S, body)) S = null; // una firma no trae parrafos largos
      }
      if (!S) continue;
      if (tailText(S, body, limit + 1).length > limit) continue;       // too long to be a signature
      if (!textBefore(S, body)) continue;                               // would swallow everything
      cands.push(S);
      break; // earliest acceptable text candidate
    }

    // <hr> followed by a legal disclaimer
    var hrs = body.querySelectorAll('hr');
    for (var i = 0; i < hrs.length; i++) {
      var tail = tailText(hrs[i], body, DISCLAIMER_TAIL + 1);
      if (tail.length <= DISCLAIMER_TAIL && DISCLAIMER.test(tail) && textBefore(hrs[i], body)) {
        cands.push(hrs[i]);
        break;
      }
    }

    if (!cands.length) return null;
    cands.sort(function (a, b) {
      if (a === b) return 0;
      return (a.compareDocumentPosition(b) & 4) ? -1 : 1;
    });
    return cands[0];
  }

  // ---- firma del remitente (sirve para externos, sin pistas conocidas) ----
  // Despues del ULTIMO cierre ("¡Gracias!", "Saludos", "Best regards"), si la primera linea
  // nombra a quien envia y lo que sigue son lineas cortas (cargo, mail, direccion, logos), es firma.
  var GENERIC_LOCAL = /^(info|support|soporte|noreply|no-reply|admin|contact|contacto|team|equipo|mail|hola|hello|ventas|sales)$/;
  function deaccent(x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function senderTokens(sender) {
    if (!sender) return [];
    var out = [];
    String(sender.name || '').split(/[\s,]+/).forEach(function (w) { out.push(w); });
    var local = String(sender.email || '').split('@')[0];
    if (!GENERIC_LOCAL.test(local)) local.split(/[._+\-]+/).forEach(function (w) { out.push(w); });
    return out.map(deaccent).map(function (w) { return w.replace(/[^a-z]/g, ''); })
      .filter(function (w, i, a) { return w.length >= 3 && a.indexOf(w) === i; });
  }
  function closingLine(txt) {
    var t = squash(txt).replace(/^[¡¿\s]+/, '');
    return t.length > 0 && t.length <= 40 && CLOSING.test(t);
  }
  function detectSenderSignature(body, tokens) {
    if (!tokens.length) return null;
    var w = mkWalker(body, 4), t, lastClosing = null, texts = [];
    while ((t = w.nextNode())) {
      if (!/\S/.test(t.data)) continue;
      texts.push(t);
      var blk = blockOf(t, body);
      if (blk !== body && closingLine(blk.textContent)) lastClosing = blk;
    }
    if (!lastClosing) return null;
    var first = null;
    for (var i = 0; i < texts.length; i++) {
      if (lastClosing.contains(texts[i])) continue;
      if (lastClosing.compareDocumentPosition(texts[i]) & 4) { first = texts[i]; break; }
    }
    if (!first) return null;
    var line = deaccent(squash(blockOf(first, body).textContent));
    if (line.length > 80) return null;
    var words = line.split(/[^a-z]+/);
    if (!tokens.some(function (tk) { return words.indexOf(tk) >= 0; })) return null;
    var S = lineStart(first, body);
    // subir hasta el bloque de la linea, para no partir la linea del nombre
    var blk = blockOf(first, body);
    if (blk !== body && !blk.contains(lastClosing)) S = blk;
    // Firma en tabla (logo en una columna, texto en otra): subir al contenedor mas alto
    // que no tenga texto antes del nombre, para llevarnos tambien el logo.
    for (var up = S.parentNode; up && up !== body && !up.contains(lastClosing); up = up.parentNode) {
      var r = body.ownerDocument.createRange();
      r.setStart(up, 0); r.setEndBefore(S);
      if (norm(r.toString())) break;
      S = up;
    }
    if (tailText(S, body, 701).length > 700) return null;
    if (!textBefore(S, body)) return null;
    if (hasProseTail(S, body)) return null;
    return S;
  }

  function lastLeaf(root) {
    var n = root;
    for (;;) {
      var c = n.lastChild;
      while (c && (isBlankText(c) || c.nodeType === NODE_COMMENT || c.nodeName === 'BR')) c = c.previousSibling;
      if (!c) return n === root ? null : n;
      if (c.nodeType === NODE_TEXT) return c;
      if (c.nodeName === 'IMG' || c.nodeName === 'TABLE' || c.nodeName === 'HR') return c;
      n = c;
    }
  }

  // ------------------------------------------------------------- sanitize out
  function sanitizeInPlace(root) {
    var doc = root.ownerDocument;
    (function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      kids.forEach(function (c) {
        if (c.nodeType === NODE_TEXT) return;
        if (c.nodeType !== NODE_ELEMENT) { node.removeChild(c); return; }
        var tag = c.localName;
        if (DROP[tag]) { node.removeChild(c); return; }
        walk(c);
        if (!ALLOWED[tag]) {
          while (c.firstChild) node.insertBefore(c.firstChild, c);
          node.removeChild(c);
          return;
        }
        var keep = {};
        if (tag === 'a') {
          var href = c.getAttribute('href');
          if (href && !isUnsafeUrl(href)) keep.href = href;
        } else if (tag === 'img') {
          var src = c.getAttribute('src');
          if (src) {
            var s2 = src.replace(/[\u0000- ]/g, '').toLowerCase();
            if (!/^(?:javascript|vbscript|file|blob):/.test(s2) && !(/^data:/.test(s2) && !/^data:image\/(?:png|jpe?g|gif|webp|bmp);/.test(s2))) keep.src = src;
          }
          if (c.getAttribute('alt')) keep.alt = c.getAttribute('alt');
        } else if (tag === 'td' || tag === 'th') {
          if (/^\d+$/.test(c.getAttribute('colspan') || '')) keep.colspan = c.getAttribute('colspan');
          if (/^\d+$/.test(c.getAttribute('rowspan') || '')) keep.rowspan = c.getAttribute('rowspan');
        }
        Array.prototype.slice.call(c.attributes).forEach(function (a) { c.removeAttribute(a.name); });
        Object.keys(keep).forEach(function (k) { c.setAttribute(k, keep[k]); });
        if (tag === 'a' && keep.href) { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
        if (tag === 'img' && !keep.src) node.removeChild(c);
      });
    })(root);
    root.normalize();
    trimEdges(root);
    return root.innerHTML;
  }

  function isEmptyEl(el) {
    if (el.nodeName === 'BR' || el.nodeName === 'HR') return true;
    if (el.querySelector && el.querySelector('img,table,hr')) return false;
    return !norm(el.textContent || '');
  }

  function trimEnd(root) {
    for (;;) {
      var last = root.lastChild;
      if (!last) return;
      if (last.nodeType === NODE_TEXT) {
        if (isBlankText(last) || /^[\s \-_=]*$/.test(last.data) && /[-_=]{3,}/.test(last.data)) { root.removeChild(last); continue; }
        last.data = last.data.replace(/[\s ​]+$/, '');
        return;
      }
      if (last.nodeType !== NODE_ELEMENT) { root.removeChild(last); continue; }
      if (last.nodeName === 'BR' || last.nodeName === 'HR') { root.removeChild(last); continue; }
      if (last.nodeName === 'IMG' || last.nodeName === 'TABLE') return;
      trimEnd(last);
      if (isEmptyEl(last)) { root.removeChild(last); continue; }
      return;
    }
  }
  function trimStart(root) {
    for (;;) {
      var first = root.firstChild;
      if (!first) return;
      if (first.nodeType === NODE_TEXT) {
        if (isBlankText(first)) { root.removeChild(first); continue; }
        first.data = first.data.replace(/^[\s ​]+/, '');
        return;
      }
      if (first.nodeType !== NODE_ELEMENT) { root.removeChild(first); continue; }
      if (first.nodeName === 'BR') { root.removeChild(first); continue; }
      if (first.nodeName === 'IMG' || first.nodeName === 'TABLE' || first.nodeName === 'HR') return;
      trimStart(first);
      if (isEmptyEl(first)) { root.removeChild(first); continue; }
      return;
    }
  }
  function trimEdges(root) { trimEnd(root); trimStart(root); }

  function sanitizeString(html, doc) {
    if (!html) return '';
    var box = doc.createElement('div');
    box.innerHTML = html;
    var out = sanitizeInPlace(box);
    return hasContent(box) ? out : '';
  }

  // -------------------------------------------------------------------- main
  function cleanMessage(html, opts) {
    opts = opts || {};
    html = html == null ? '' : String(html);
    var hints = DEFAULT_SIGNATURE_HINTS.concat((opts.signatureHints || []).filter(function (h) { return h && String(h).length >= 4; }));

    var doc = parse(html, opts);
    var body = doc.body;
    if (!body) return { cleanHtml: '', quotedHtml: '', signatureHtml: '', hasQuote: false };

    preSanitize(body);
    var fullHtml = body.innerHTML;

    // 1) quote
    var quotedRaw = '';
    var marker = findQuoteMarker(body);
    if (marker) quotedRaw = cutFrom(marker, body);
    trimEdges(body);

    // 2) signature
    var sigRaw = '';
    var sigStart = detectSignature(body, hints) || detectSenderSignature(body, senderTokens(opts.sender));
    if (sigStart) sigRaw = cutFrom(sigStart, body);
    trimEdges(body);
    for (var k = 0; k < 5; k++) {
      var leaf = lastLeaf(body);
      if (leaf && leaf.nodeName === 'IMG' && isSigImage(leaf) && textBefore(leaf, body)) {
        sigRaw = cutFrom(leaf, body) + sigRaw;
        trimEdges(body);
      } else break;
    }

    // 3 + 4) strip / sanitize
    var cleanHtml = sanitizeInPlace(body);
    var cleanOk = hasContent(body);
    var quotedHtml = sanitizeString(quotedRaw, doc);
    var signatureHtml = sanitizeString(sigRaw, doc);

    // 5) fallback
    if (!cleanOk) {
      return { cleanHtml: sanitizeString(fullHtml, doc), quotedHtml: '', signatureHtml: '', hasQuote: false };
    }
    return { cleanHtml: cleanHtml, quotedHtml: quotedHtml, signatureHtml: signatureHtml, hasQuote: !!quotedHtml };
  }

  cleanMessage.DEFAULT_SIGNATURE_HINTS = DEFAULT_SIGNATURE_HINTS;

  globalThis.FDCV = globalThis.FDCV || {};
  globalThis.FDCV.cleanMessage = cleanMessage;
  if (typeof module !== 'undefined' && module.exports) module.exports = { cleanMessage: cleanMessage };
})();
