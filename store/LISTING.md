# Chat View for Freshdesk — Ficha para Chrome Web Store

Textos listos para copiar en el Developer Dashboard. La tienda permite una ficha por idioma: cargar **English** como idioma principal y **Español** como traducción.

---

## English

**Name:** Chat View for Freshdesk

**Summary** (max 132 characters):
> Read Freshdesk tickets as a chat: only the new text of each email, without the quoted history. Read-only.

**Description:**
```
Long email threads in Freshdesk are hard to read: every reply quotes the whole previous conversation, so the new text gets lost between old messages and signatures.

Chat View for Freshdesk shows the ticket as a chat conversation:

• Oldest messages on top, newest at the bottom.
• Customers and other external contacts on the left, agents on the right, private notes in yellow.
• Only the new text of each email. The quoted history is hidden behind "show quoted". Signatures are shown by default and can be collapsed behind "· · ·" with one click.
• Click an image to view it full size, and use the arrow keys to browse the ticket's images.
• Day separators, relative times, and a copy button on every message.
• A "jump to latest" button that also counts new messages while you read older ones.
• Freshdesk's own Reply, Note and menus keep working normally below the chat.
• Smooth loading with a placeholder skeleton, and an instant view when you go back to a ticket you already opened.
• Light and dark mode, following the Freshdesk theme.
• English and Spanish, following the browser language, with a language selector in the popup.

Settings in the popup: turn the chat view on or off, show or collapse signatures (shown by default; detection is automatic, so collapsing is optional), show or hide the floating button; and in Settings, disable animations for low-end computers, set internal email domains (colleagues who are not Freshdesk agents still show on your side), and choose the language.

Privacy: the extension is read-only. It uses your existing Freshdesk session to read the ticket you are viewing. Everything is processed locally in your browser and nothing is sent to any server. It has no analytics and no tracking.

Works on helpdesks hosted at *.freshdesk.com. Custom domains are not supported yet.

Chat View for Freshdesk is an independent project and is not affiliated with, endorsed or sponsored by Freshworks Inc.
```

**Category:** Productivity → Workflow & Planning (o "Tools")

---

## Español

**Nombre:** Chat View for Freshdesk

**Resumen** (máx. 132 caracteres):
> Leé los tickets de Freshdesk como un chat: solo el texto nuevo de cada mail, sin el historial citado. Solo lectura.

**Descripción:**
```
En Freshdesk, los hilos de mail largos se vuelven ilegibles: cada respuesta cita toda la conversación anterior y el texto nuevo queda perdido entre mensajes viejos y firmas.

Chat View for Freshdesk muestra el ticket como una conversación de chat:

• Lo más viejo arriba y lo más nuevo abajo.
• Clientes y contactos externos a la izquierda, agentes a la derecha y notas privadas en amarillo.
• Solo el texto nuevo de cada mail: el historial citado queda detrás de "ver citado". Las firmas se ven por defecto y se pueden plegar detrás de "· · ·" con un click.
• Click en una imagen para verla grande, y flechas para pasar entre las imágenes del ticket.
• Separadores por día, tiempo relativo y un botón "copiar" en cada mensaje.
• Botón "ir al último mensaje" que además cuenta los mensajes nuevos mientras leés los anteriores.
• Responder, Nota y los menús de Freshdesk siguen funcionando normalmente debajo del chat.
• Carga suave con un skeleton, y vista instantánea al volver a un ticket que ya abriste.
• Modo claro y oscuro, según el tema de Freshdesk.
• Español e inglés, según el idioma del navegador, con selector de idioma en el popup.

Ajustes en el popup: prender o apagar el modo chat, mostrar o plegar las firmas (se ven por defecto; la detección es automática, así que plegarlas es opcional), mostrar u ocultar el botón flotante; y en Ajustes, quitar animaciones para equipos con pocos recursos, definir dominios internos (compañeros sin usuario de agente igual aparecen de tu lado) y elegir el idioma.

Privacidad: la extensión solo lee. Usa tu sesión de Freshdesk para leer el ticket que estás viendo. Todo se procesa localmente en tu navegador y nada se envía a ningún servidor. No tiene analytics ni rastreo.

Funciona en helpdesks alojados en *.freshdesk.com. Por ahora no soporta dominios propios.

Chat View for Freshdesk es un proyecto independiente, sin afiliación, respaldo ni patrocinio de Freshworks Inc.
```

---

## Pestaña "Privacy practices" (respuestas sugeridas)

**Single purpose:**
> Display Freshdesk tickets as a readable chat conversation, showing only the new text of each message without the quoted history.

**Permission justification:**
- `storage`: Saves the user's preferences (chat view on/off, show signatures, show floating button, disable animations, internal domains, language) locally.
- Host access `https://*.freshdesk.com/*` (content script): Needed to render the chat view on Freshdesk ticket pages and to read the open ticket's conversation through the same helpdesk's API, using the user's existing session. Read-only (GET).

**Remote code:** No, I am not using remote code. (All JS is in the package; no eval and no external scripts.)

**Data usage:** marcar **"Website content"** (se lee el contenido de los tickets para mostrarlo) y, si lo pregunta aparte, **"Personally identifiable information"** (nombres y emails que aparecen en los tickets). Nada más.

Certificaciones, marcar las tres:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** la dirección pública donde se publique `store/privacy.html`.

---

## Notas para el revisor (si el formulario tiene el campo)

```
The extension only runs on Freshdesk agent pages (https://<company>.freshdesk.com/a/tickets/<id>) and requires a logged-in Freshdesk agent session to show data.
To test: log into any Freshdesk trial account (freshdesk.com offers free trials), open a ticket with a few email replies, and click the "💬 Chat" button at the bottom right (or enable "Show Chat" in the extension popup).
The extension is read-only: it only performs GET requests to the same helpdesk's API and never modifies tickets.
```

---

## Capturas (1280×800, datos 100% ficticios)
En `store/screenshots/`, en este orden:
1. `1-chat-light.png`: el chat dentro de Freshdesk, en modo claro, con burbujas, nota privada y adjunto.
2. `2-chat-dark.png`: modo oscuro, siguiendo el tema de Freshdesk.
3. `3-quoted-and-signatures.png`: firmas visibles e historial citado abierto.
4. `4-popup-main.png`: popup con modo chat, firmas, botón flotante y acceso a Ajustes.
5. `5-popup-settings.png`: popup en Ajustes, con quitar animaciones, dominios internos e idioma.

Hay dos juegos con los mismos 5 archivos: `store/screenshots-en/` (inglés: subir en la ficha en inglés) y `store/screenshots/` (español: subir en la traducción al español).

Las capturas 1 a 3 se tomaron dentro de Freshdesk real, con una conversación ficticia y todo lo demás anonimizado: lista de tickets, logo, número y asunto. Las 4 y 5 muestran el popup real sobre la captura 1. Los nombres y dominios son inventados (`.example`).

## Material pendiente
- [x] Capturas de 1280×800: ver arriba.
- [ ] Ícono de la tienda de 128×128: ya está en `icons/icon128.png`.
- [ ] Opcional: imagen promocional chica de 440×280.
- [x] Email de contacto en la política (extension@santiagocaprile.com).
- [ ] Publicar `privacy.html` en una URL pública.
