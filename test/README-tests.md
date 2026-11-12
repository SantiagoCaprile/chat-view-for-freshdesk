# Tests de clean.js

Los tests usan Node + jsdom. jsdom NO se instala en la extension; se instala en un directorio temporal cualquiera:

```sh
S="$(mktemp -d)/fdcv-test" && mkdir -p "$S"
(cd "$S" && npm init -y >/dev/null && npm i jsdom)   # una sola vez
NODE_PATH="$S/node_modules" node test/clean.test.js  # desde la raiz de la extension
```

Fixtures en `test/fixtures/`: todos son sinteticos o anonimizados. Los que no tienen prefijo `synthetic-` conservan la estructura HTML de correos reales (citas de Gmail/Outlook, tablas de firma, disclaimers), pero nombres, mails, dominios, telefonos, direcciones, empresas, URLs e IDs son ficticios (dominios reservados `*.example` / `example.com`). Los `synthetic-*.html` estan armados a mano desde cero.
