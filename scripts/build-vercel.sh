#!/bin/sh
# Build da Vercel: copia os arquivos do site para public/ e gera js/config.js
# a partir das variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY
# (cadastradas em Vercel > Project > Settings > Environment Variables).
set -e

: "${SUPABASE_URL:?Defina SUPABASE_URL nas Environment Variables da Vercel}"
: "${SUPABASE_ANON_KEY:?Defina SUPABASE_ANON_KEY nas Environment Variables da Vercel}"

rm -rf public
mkdir public
cp -r index.html app.html css js public/
rm -f public/js/config.js

printf "export const SUPABASE_URL = '%s';\nexport const SUPABASE_ANON_KEY = '%s';\n" \
  "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > public/js/config.js

echo "Build ok: public/ gerado com js/config.js"
