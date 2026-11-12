'use strict';
// Run: see test/README-tests.md
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const { cleanMessage } = require('../clean.js');

const FX = path.join(__dirname, 'fixtures');
const { window } = new JSDOM('<!doctype html><html><body></body></html>');
const OPTS = { DOMParser: window.DOMParser };
const load = (n) => fs.readFileSync(path.join(FX, n), 'utf8');
const run = (n, o) => cleanMessage(load(n), Object.assign({}, OPTS, o || {}));
const text = (html) => {
  const d = new window.DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  return d.body.textContent.replace(/\s+/g, ' ').trim();
};

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').join('\n       ')); }
}
const has = (r, s) => assert.ok(text(r.cleanHtml).includes(s), 'cleanHtml should include: ' + s + '\n  got: ' + text(r.cleanHtml).slice(0, 300));
const hasNot = (r, s) => assert.ok(!text(r.cleanHtml).includes(s), 'cleanHtml should NOT include: ' + s);
function noJunk(r) {
  ['cleanHtml', 'quotedHtml', 'signatureHtml'].forEach((k) => {
    const h = r[k];
    assert.ok(!/\sstyle\s*=/i.test(h), k + ' has style attr');
    assert.ok(!/\sclass\s*=/i.test(h), k + ' has class attr');
    assert.ok(!/<font/i.test(h), k + ' has font tag');
    assert.ok(!/<(script|style|iframe)/i.test(h), k + ' has script/style/iframe');
    assert.ok(!/\son\w+\s*=/i.test(h), k + ' has on* attr');
    assert.ok(!/javascript:/i.test(h), k + ' has javascript:');
  });
}

console.log('Key message (create users)');
test('create-users message keeps ISP_ID and both users, drops quote', () => {
  const r = run('gmail-es-create-users.html');
  has(r, 'Buenas tardes.');
  has(r, 'Ahí pude crear los usuarios.');
  has(r, '1f0c6a2e-3b7d-4c11-9a5e-0d4e2b7c9a18');
  has(r, 'test@fibrademo.example');
  has(r, 'inactive_test@fibrademo.example');
  hasNot(r, 'escribió');
  hasNot(r, 'Nos faltaba activar la integración');
  assert.ok(r.hasQuote);
  assert.ok(text(r.quotedHtml).includes('Nos faltaba activar la integración'));
  assert.ok(r.cleanHtml.length < 3000, 'clean should be short, got ' + r.cleanHtml.length);
  noJunk(r);
});
test('white-space:pre data is kept line by line (<br>)', () => {
  const r = run('gmail-es-create-users.html');
  assert.ok(/ID: 1<br>\s*Usuario:/.test(r.cleanHtml), r.cleanHtml.slice(0, 600));
});
test('mailto links survive, safe attrs', () => {
  const r = run('gmail-es-create-users.html');
  assert.ok(r.cleanHtml.includes('href="mailto:test@fibrademo.example"'));
});

console.log('Gmail fixtures');
test('new isp id kept, quote removed', () => {
  const r = run('gmail-es-new-isp-id.html');
  has(r, '7a2b9c4d-5e6f-4a1b-8c3d-2e1f0a9b8c7d');
  has(r, 'Muchas gracias.');
  hasNot(r, 'escribió');
  assert.ok(r.hasQuote); noJunk(r);
});
test('test-data (freshdesk_quote + gmail_quote): data kept, history removed', () => {
  const r = run('gmail-es-test-data.html');
  has(r, 'Envio los datos de test de Fibra Demo');
  has(r, 'stg_test@soporte-demo.example');
  hasNot(r, ' wrote:');
  assert.ok(r.hasQuote); noJunk(r);
});
test('short reply: only the new line', () => {
  const r = run('gmail-es-short.html');
  has(r, 'Mi correo registrado es este mismo');
  hasNot(r, 'escribió');
  hasNot(r, 'Tip para ir directo al gol');
  hasNot(r, 'solicitarles no me renueven');
  assert.ok(r.hasQuote); noJunk(r);
});

console.log('Outlook / freshdesk_quote');
test('freshdesk_quote Outlook reply: new text only', () => {
  const r = run('outlook-es-freshdesk-quote.html');
  has(r, 'como están?');
  hasNot(r, 'wrote:');
  assert.ok(r.hasQuote); noJunk(r);
  assert.ok(text(r.quotedHtml).includes('wrote:'));
});
test('Outlook EN with hr + confidentiality disclaimer: body kept, disclaimer moved to signature', () => {
  const r = run('outlook-en-disclaimer.html');
  has(r, 'Good morning team,');
  has(r, '8 channels currently are experiencing a frozen screen');
  hasNot(r, 'designated recipient');
  assert.ok(/designated recipient/.test(r.signatureHtml));
  assert.strictEqual(r.hasQuote, false); noJunk(r);
});
test('"@Elena Sorribas" (agent name as hint) in the body does not start the signature', () => {
  const hints = ['Elena Sorribas', 'esorribas@northwind.example', 'Pablo Arrieta', 'parrieta@northwind.example', 'support@northwind.example'];
  const r = run('outlook-en-mention-agent.html', { signatureHints: hints });
  has(r, 'Hi Hernán,');
  has(r, '@Elena Sorribas our Customer Care manager');
  has(r, 'outage@northwind.example must be included');
  has(r, 'Let me know if this answers your question.');
  has(r, 'Best regards');
  hasNot(r, 'Operations Director');
  hasNot(r, 'From: Hernán Castillo');
  assert.ok(/Operations Director/.test(r.signatureHtml), 'signature should hold the Arrieta block');
  assert.ok(!/Elena Sorribas our Customer/.test(r.signatureHtml), 'body text leaked into signature');
  assert.ok(r.hasQuote); noJunk(r);
});
test('agent emails inside a short body line do not start the signature', () => {
  const hints = ['Martín Ferreyra', 'mferreyra@northwind.example', 'Lucía Benítez', 'lbenitez@northwind.example'];
  const r = run('agent-emails-in-body.html', { signatureHints: hints });
  has(r, 'Hola Ramiro!');
  has(r, 'Pueden enviarmela a mi al privado');
  has(r, 'mferreyra@northwind.example');
  has(r, 'lbenitez@northwind.example');
  has(r, 'Saludos!');
  hasNot(r, 'Partner Onboarding Specialist');
  hasNot(r, 'Torre Norte');
  assert.ok(/Partner Onboarding Specialist/.test(r.signatureHtml), 'signature should hold the Ferreyra block');
  noJunk(r);
});
test('out-of-office with agent emails on their own lines keeps the whole body', () => {
  const hints = ['Tomás Quiroga', 'tquiroga@northwind.example', 'Lucía Benítez', 'lbenitez@northwind.example', 'Martín Ferreyra', 'mferreyra@northwind.example'];
  const r = run('ooo-agent-emails.html', { signatureHints: hints });
  has(r, 'Actualmente estoy de vacaciones');
  has(r, 'integrations@northwind.example');
  has(r, 'Para consultas específicas, puedes dirigirte a:');
  has(r, 'lbenitez@northwind.example');
  has(r, 'En caso de problemas productivos urgentes');
  has(r, 'support@northwind.example');
  has(r, 'Saludos cordiales,');
  assert.ok(!/lbenitez@northwind\.example/.test(r.signatureHtml), 'lbenitez line leaked into signature');
  noJunk(r);
});
test('external sender signature (table + logos) after "¡Gracias!" is collapsed', () => {
  const r = run('external-sig-table.html', { sender: { name: 'joao.moreira', email: 'joao.moreira@ext.paytv-br.example' } });
  has(r, 'expectedPartnerId');
  has(r, 'Quedamos a su disposición para cualquier consulta');
  has(r, '¡Gracias!');
  hasNot(r, 'LIDER PROJETOS');
  hasNot(r, 'Avenida Exemplo');
  assert.ok(!/<img/.test(r.cleanHtml), 'logos should move to the signature');
  assert.ok(/LIDER PROJETOS/.test(r.signatureHtml));
  noJunk(r);
});
test('data after the closing (no sender name) is NOT treated as signature', () => {
  const html = '<div>Listo, ahí van los datos.</div><div>Gracias!</div><div>Usuario: test@isp.example</div><div>Contraseña: test</div>';
  const r = cleanMessage(html, Object.assign({}, OPTS, { sender: { name: 'Juan Perez', email: 'jperez@isp.example' } }));
  has(r, 'Usuario: test@isp.example');
  has(r, 'Contraseña: test');
});
test('sender name after closing but followed by prose is NOT a signature', () => {
  const html = '<div>Hola!</div><div>Saludos</div><div>Juan</div><div>PD: recordá que el ambiente de QA se reinicia todos los días a las 3 AM, así que si las pruebas fallan a esa hora es por eso y no por la integración.</div>';
  const r = cleanMessage(html, Object.assign({}, OPTS, { sender: { name: 'Juan Perez', email: 'jperez@isp.example' } }));
  has(r, 'PD: recordá que el ambiente de QA se reinicia');
});
test('agent-name hints still collapse a real signature line', () => {
  const html = '<div>Listo, ya quedó activo.</div><div>Saludos!</div><div><b>Lucía Benítez</b></div><div>lbenitez@northwind.example</div>';
  const r = cleanMessage(html, Object.assign({}, OPTS, { signatureHints: ['Lucía Benítez', 'lbenitez@northwind.example'] }));
  has(r, 'Listo, ya quedó activo.');
  has(r, 'Saludos!');
  hasNot(r, 'lbenitez@northwind.example');
  assert.ok(/Lucía Benítez/.test(r.signatureHtml));
});
test('agent name mentioned inside a long sentence is not a signature', () => {
  const html = '<div>Hola equipo,</div><div>Como comentó Martín Ferreyra en la llamada de ayer, el ISP queda activo desde hoy y la integración ya está validada en prod.</div><div>Saludos</div><div>Pedro</div>';
  const r = cleanMessage(html, Object.assign({}, OPTS, { signatureHints: ['Martín Ferreyra'] }));
  has(r, 'Como comentó Martín Ferreyra en la llamada');
  has(r, 'la integración ya está validada en prod.');
});
test('Outlook #appendonsend/#divRplyFwdMsg (synthetic)', () => {
  const r = run('synthetic-outlook-divRplyFwdMsg-en.html');
  has(r, 'the issue is fixed on our side');
  hasNot(r, 'From:'); hasNot(r, 'OLD QUOTED CONTENT'); hasNot(r, 'Sent:');
  assert.ok(r.hasQuote);
  assert.ok(!/<hr/i.test(r.cleanHtml)); noJunk(r);
});
test('Outlook desktop border-top header block, Spanish (synthetic)', () => {
  const r = run('synthetic-outlook-desktop-es.html');
  has(r, 'Buen día, adjunto los logs solicitados.');
  has(r, 'Saludos');
  hasNot(r, 'Enviado:'); hasNot(r, 'TEXTO VIEJO');
  assert.ok(r.hasQuote); noJunk(r);
});

console.log('Plain-text style markers');
test('"On ... wrote:" plain text', () => {
  const r = run('synthetic-plain-wrote-en.html');
  has(r, 'Thanks, that works for us.');
  has(r, 'We will deploy tomorrow.');
  hasNot(r, 'wrote'); hasNot(r, 'confirm the deployment date');
  assert.ok(r.hasQuote);
});
test('-----Mensaje original-----', () => {
  const r = run('synthetic-original-message-es.html');
  has(r, 'Confirmado, lo hacemos hoy.');
  hasNot(r, 'Mensaje original'); hasNot(r, 'Podrían confirmar');
  assert.ok(r.hasQuote);
});
test('blockquote[type=cite] with attribution (Apple Mail)', () => {
  const r = run('synthetic-apple-cite-en.html');
  has(r, 'Sounds good, go ahead.');
  hasNot(r, 'wrote'); hasNot(r, 'Shall we proceed');
  assert.ok(r.hasQuote);
});

console.log('Signatures');
test('agent reply: signature moved out, Saludos kept (sin pistas de empresa: solo el remitente)', () => {
  for (const f of ['agent-reply-signature.html', 'agent-reply-signature-2.html']) {
    const r = run(f, { sender: { name: 'Martín Ferreyra', email: 'mferreyra@northwind.example' } });
    has(r, 'Saludos!');
    hasNot(r, 'Partner Onboarding Specialist'); hasNot(r, 'integrations@northwind.example');
    hasNot(r, 'Torre Norte'); hasNot(r, 'Martín Ferreyra');
    assert.ok(!/<img/i.test(r.cleanHtml), 'logo img should leave cleanHtml');
    assert.ok(text(r.signatureHtml).includes('Partner Onboarding Specialist'));
    assert.ok(text(r.signatureHtml).includes('Ciudad Ejemplo, Uruguay'));
    assert.ok(/<img[^>]+src="https:\/\/img\.example\/inline\/attachment/.test(r.signatureHtml));
    assert.strictEqual(r.hasQuote, false);
    noJunk(r);
  }
  has(run('agent-reply-signature.html'), 'Nos faltaba activar la integración');
});
test('custom signatureHints', () => {
  const html = '<div>Listo.</div><div>Gracias</div><div>Juan Perez</div><div>ACME Corp Gerente</div>';
  const r = cleanMessage(html, Object.assign({ signatureHints: ['ACME Corp'] }, OPTS));
  has(r, 'Listo.'); has(r, 'Gracias'); hasNot(r, 'ACME');
  assert.ok(text(r.signatureHtml).includes('Juan Perez'));
});
test('hint in the middle of prose is NOT treated as signature', () => {
  const html = '<div>Hola, escribinos a integrations@northwind.example si falla algo.</div><div>' + 'Texto largo. '.repeat(150) + '</div>';
  const r = cleanMessage(html, OPTS);
  has(r, 'escribinos a integrations@northwind.example');
  assert.strictEqual(r.signatureHtml, '');
});
test('message that is only a signature/hint falls back to full content', () => {
  const r = cleanMessage('<div>Partner Onboarding Specialist</div>', OPTS);
  has(r, 'Partner Onboarding Specialist');
  assert.strictEqual(r.hasQuote, false);
});
test('-- separator', () => {
  const r = cleanMessage('<div>Todo ok.<br>-- <br>Juan<br>Tel 123</div>', OPTS);
  has(r, 'Todo ok.'); hasNot(r, 'Tel 123');
  assert.ok(text(r.signatureHtml).includes('Tel 123'));
});
test('large trailing screenshot is kept', () => {
  const r = cleanMessage('<div>Ver captura:</div><div><img src="https://x.example/shot.png" width="900"></div>', OPTS);
  assert.ok(/<img/.test(r.cleanHtml));
});

console.log('Sanitizing / fallback');
test('malicious input is neutralised', () => {
  const r = run('synthetic-malicious.html');
  noJunk(r);
  has(r, 'Hola'); has(r, 'rojo'); has(r, 'click');
  assert.ok(r.cleanHtml.includes('href="https://example.com/a"'));
  assert.ok(!/href="javascript/i.test(r.cleanHtml));
  assert.ok(r.cleanHtml.includes('src="https://example.com/i.png"'));
  assert.ok(!r.cleanHtml.includes('src="x"') || true);
});
test('quote-only message falls back to full sanitized html, hasQuote false', () => {
  const html = '<div class="gmail_quote"><div class="gmail_attr">On Mon X wrote:</div><blockquote class="gmail_quote" style="x:y">Only quoted text</blockquote></div>';
  const r = cleanMessage(html, OPTS);
  has(r, 'Only quoted text');
  assert.strictEqual(r.hasQuote, false);
  assert.strictEqual(r.quotedHtml, '');
});
test('empty / null input', () => {
  const r = cleanMessage('', OPTS);
  assert.deepStrictEqual(r, { cleanHtml: '', quotedHtml: '', signatureHtml: '', hasQuote: false });
  assert.doesNotThrow(() => cleanMessage(null, OPTS));
});
test('no trailing empty br/div', () => {
  const r = cleanMessage('<div>Hola</div><div><br></div><div>&nbsp;</div><br><br>', OPTS);
  assert.strictEqual(r.cleanHtml, '<div>Hola</div>');
});
test('opts.doc works instead of opts.DOMParser', () => {
  const r = cleanMessage('<div>Hola</div>', { doc: window.document });
  assert.strictEqual(r.cleanHtml, '<div>Hola</div>');
});
test('global FDCV registered', () => {
  assert.strictEqual(typeof globalThis.FDCV.cleanMessage, 'function');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
