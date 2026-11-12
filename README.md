# Chat View for Freshdesk

Extensión de Chrome (MV3) que agrega un modo "chat" a los tickets de Freshdesk (cualquier `*.freshdesk.com`). Muestra la conversación como burbujas (lo más viejo arriba, lo más nuevo abajo) con **solo el texto nuevo** de cada mensaje; el historial citado queda plegado.

- Externos (clientes/partners) a la izquierda, nuestros agentes a la derecha (los tuyos con otro tono).
- Notas privadas al centro, en amarillo.
- Por mensaje: firma (visible por defecto, se puede plegar en `· · ·`), "ver citado", "copiar" y adjuntos.

## Cómo cargarla

1. Abrí `chrome://extensions`.
2. Activá **Developer mode**.
3. **Load unpacked** y elegí esta carpeta (`freshdesk-chat-view`).
4. Recargá la pestaña de Freshdesk.

## Uso

- En un ticket aparece el botón flotante **💬 Chat** (abajo a la derecha). Un click abre/cierra la vista; el estado se recuerda.
- El chat reemplaza la lista de mensajes dentro de la página: el editor de **Responder** / **Nota** y los menús de Freshdesk siguen funcionando normal debajo/encima.
- **Firmas: visibles / ocultas** (barra del chat): por defecto se ven; si las ocultás quedan plegadas en "· · ·". Se recuerda entre tickets.
- **Popup de la extensión** (click en el ícono en la barra de Chrome): *Modo chat*, *Mostrar firmas* y *Botón 💬 en la página*. En **⚙ Ajustes**: *Más nuevos arriba* (invierte el chat; el botón para ir a lo último pasa a estar arriba y apunta ↑), *Quitar animaciones* (para equipos con pocos recursos), *Dominios internos* (ej. `miempresa.com`: esos mensajes van a la derecha aunque no sean agentes) e *Idioma* (Automático / Español / English). Los cambios se aplican en vivo.
- **✕** o el botón 💬 cierran la vista. **Actualizar** vuelve a pedir los datos; si entra un mensaje nuevo (o respondés), se refresca solo.

## Limitaciones

- Usa endpoints internos de Freshdesk (`/api/_/...`) y, si fallan, la API v2; si ambos fallan, lee el DOM (banner "modo DOM", datos parciales).
- La limpieza del texto citado es heurística (`clean.js`): puede dejar o cortar de más en hilos raros. "ver citado" siempre muestra el original.
- No se puede resolver el nombre de agentes si la API de agentes no responde (se usa el email).

## Solo lectura

Solo hace requests `GET` a Freshdesk. No escribe, responde ni modifica nada.


---

## English

Read-only chat view for Freshdesk tickets (any `*.freshdesk.com` helpdesk): oldest on top, newest at the bottom, external messages on the left and agents on the right, private notes in yellow. Each bubble shows only the new text: quoted history goes behind **show quoted** and signatures behind **· · ·**.

**Install:** unzip to a permanent folder → `chrome://extensions` → enable *Developer mode* → *Load unpacked* → pick the `freshdesk-chat-view` folder. Pin the icon from the 🧩 menu.

**Use:** open a ticket and click **💬 Chat** (bottom right), or use the extension popup:
- **Show Chat** – turn the chat view on/off.
- **Show signatures** – on by default; turn it off to collapse signatures behind "· · ·".
- **Bubble on screen** – show/hide the floating 💬 button.
- **⚙ Settings → Newest first** – reverse the chat: latest on top, oldest at the bottom (the jump button moves to the top and points ↑).
- **⚙ Settings → Disable animations** – lighter on low-end computers (no fades, shimmer or smooth scrolling).
- **⚙ Settings → Internal domains** – e.g. `mycompany.com`: messages from these domains go on the right even if the sender is not a Freshdesk agent.
- **⚙ Settings → Language** – Automatic (browser language) / Español / English.

Click an image to view it full size (← → to browse, Esc to close). Changes apply live; settings are saved per person. It only reads data with your own Freshdesk session and never modifies anything.
