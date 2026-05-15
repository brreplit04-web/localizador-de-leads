# Guerrilla Miner

Painel e workers para encontrar sinais publicos de intencao de compra, qualificar com Gemini, salvar no Supabase e avisar no Discord.

O dashboard foi mantido em Vite/React porque o projeto ja estava nessa stack. A Vercel faz deploy desse formato direto.

## O que existe agora

- Dashboard com leads, filtros, status, busca, drawer de detalhes, notas, historico e opener por Gemini.
- Botao `Minerar agora` no dashboard via Supabase Edge Function.
- Worker multi-fonte em `index.js`: Reddit, OpenStreetMap/Overpass, Google Places opcional e CSV manual.
- Verificador de presenca digital: testa site informado, detecta site ausente, fora do ar, sem HTTPS, sem mobile viewport, pagina fraca e sinais sociais.
- Historico de execucoes em `miner_runs`.
- Settings editaveis no painel em `miner_settings`: subreddits, keywords, locais OSM, categorias OSM e consultas Google opcionais.
- Dedupe por `source + source_id` e por `lead_hash`.
- Importador manual no dashboard: `Empresa | dor/contexto | telefone | url | nicho | cidade`.
- Runner local com Playwright para paginas publicas em `local_miners/public_intent_sampler.js`.

## Setup rapido

1. Crie o projeto no Supabase.
2. Rode `supabase/schema.sql` no SQL Editor.
3. Copie `.env.example` para `.env` e preencha as chaves.
4. Rode `npm run mine:check` para validar a configuracao local.
5. Rode `npm run mine:reddit` para minerar Reddit.
6. Rode `npm run dev` para abrir o dashboard.

## Scripts

```bash
npm run dev
npm run build
npm run mine:check
npm run mine:reddit
npm run mine:osm
npm run mine:maps
npm run mine:csv
npm run mine:verify
npm run mine:all
npm run local:public
npm run models
```

CSV manual pelo Node:

```bash
CSV_INPUT=./leads.csv npm run mine:csv
```

## Variaveis principais

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`: usadas no dashboard.
- `VITE_GEMINI_API_KEY`: usada no dashboard para gerar openers e qualificar importacoes.
- `VITE_RUN_MINER_URL`: URL da Edge Function chamada pelo botao `Minerar agora`.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: usadas pelos workers.
- `GEMINI_API_KEY` e `GEMINI_MODEL`: usadas para qualificar os candidatos.
- `DISCORD_WEBHOOK_URL`: opcional, envia leads aprovados para o Discord.
- `MINER_SOURCE`: `osm`, `reddit`, `maps`, `csv` ou `all`.
- `REDDIT_CLIENT_ID` e `REDDIT_CLIENT_SECRET`: opcionais, mas recomendados para o Reddit rodar no GitHub Actions via OAuth oficial.
- `REDDIT_USER_AGENT`: identificacao do app no Reddit, ex: `node:guerrilla-miner:1.0 (by /u/seu_usuario)`.
- `OSM_PLACES`: cidades/regioes para o miner gratuito, separadas por ponto e virgula.
- `OSM_CATEGORIES`: nichos locais buscados no OpenStreetMap.
- `OSM_LIMIT`: limite de elementos retornados pelo Overpass.
- `OVERPASS_URL`: endpoint Overpass; padrao `https://overpass-api.de/api/interpreter`.
- `GOOGLE_PLACES_API_KEY`: opcional, usada apenas no miner pago de Google Maps.
- `VERIFY_AFTER_MAPS`: verifica presenca digital dos candidatos do Maps antes do Gemini.
- `VERIFY_LIMIT`: quantidade de leads pendentes revalidados por `npm run mine:verify`.
- `USE_REMOTE_SETTINGS`: quando `true`, o worker le settings do Supabase se envs especificas nao foram setadas.

## GitHub Actions

O workflow em `.github/workflows/miner.yml` roda a cada 2 horas e tambem por disparo manual.

Crie estes secrets no repositorio:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `DISCORD_WEBHOOK_URL`
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `GOOGLE_PLACES_API_KEY` apenas se for usar Google Maps pago

Variables uteis:

- `MINER_SOURCE`: `all` por padrao no workflow; roda Reddit + OSM + verificacao.
- `GEMINI_MODEL`
- `USE_REMOTE_SETTINGS`
- `REDDIT_SUBREDDITS`
- `REDDIT_KEYWORDS`
- `REDDIT_USER_AGENT`
- `OSM_PLACES`
- `OSM_CATEGORIES`
- `MAPS_QUERIES` opcional
- `REDDIT_LIMIT_PER_QUERY`
- `MAPS_LIMIT_PER_QUERY`
- `MAPS_MAX_RATING`
- `GEMINI_BATCH_SIZE`

## Reddit OAuth

O Reddit e uma fonte valiosa, mas o endpoint publico `reddit.com/.../search.json` pode bloquear IPs de datacenter como os do GitHub Actions com HTTP 403. Para manter o Reddit no minerador, configure OAuth oficial:

1. Acesse `https://www.reddit.com/prefs/apps`.
2. Clique em `create another app`.
3. Escolha o tipo `script`.
4. Preencha nome e descricao.
5. Em `redirect uri`, use `http://localhost:8080`.
6. Salve.
7. Copie o `client id`, que aparece abaixo do nome do app.
8. Copie o `secret`.
9. No GitHub, crie os repository secrets `REDDIT_CLIENT_ID` e `REDDIT_CLIENT_SECRET`.
10. Em repository variables, crie `REDDIT_USER_AGENT`, por exemplo:

```txt
node:guerrilla-miner:1.0 (by /u/seu_usuario_reddit)
```

Com essas chaves, o worker chama `https://oauth.reddit.com/r/{subreddit}/search` com bearer token. Sem elas, ele ainda tenta o modo publico como fallback.

## Supabase

O schema cria:

- `leads`: leads qualificados.
- `miner_runs`: historico de execucoes.
- `miner_settings`: configuracao editavel pelo painel.
- `lead_events`: historico de status, notas e openers.

O MVP deixa o dashboard anonimo editar `status`, `notes`, `opener`, settings e importar leads `manual`. Antes de publicar aberto, troque as RLS policies por regras autenticadas.

## Botao Minerar Agora

O dashboard chama a Edge Function em `supabase/functions/run-miner`. Ela roda uma mineracao OpenStreetMap sob demanda usando os settings salvos no Supabase.

Deploy da function:

```bash
supabase functions deploy run-miner
```

Secrets necessarios na Supabase Edge Function:

```bash
supabase secrets set SUPABASE_URL=https://seu-projeto.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
supabase secrets set GEMINI_API_KEY=sua_gemini_key
supabase secrets set GEMINI_MODEL=gemini-2.5-flash
supabase secrets set DISCORD_WEBHOOK_URL=sua_webhook_url
```

No `.env` do front:

```env
VITE_RUN_MINER_URL=https://seu-projeto.supabase.co/functions/v1/run-miner
```

Sem deploy dessa function, o botao aparece, mas retorna erro ao clicar.

## OpenStreetMap Gratuito

O miner gratuito usa OpenStreetMap via Overpass API. Ele nao exige billing, cartao ou API key.

Exemplo:

```bash
npm run mine:osm
```

Configuracao:

```env
OSM_PLACES=Ponta Grossa, PR, Brazil
OSM_CATEGORIES=barbearia,clinica de estetica,restaurante,academia,pet shop,auto center,odontologia,imobiliaria
OSM_LIMIT=80
OVERPASS_URL=https://overpass-api.de/api/interpreter
```

Para mais cidades, use ponto e virgula:

```env
OSM_PLACES=Ponta Grossa, PR, Brazil;Castro, PR, Brazil
```

O OSM nao tem rating/reviews como Google Maps. Em troca, ele entrega dados abertos como nome, categoria, telefone, website e redes sociais quando alguem cadastrou essas tags.

Oportunidades detectadas:

- sem website cadastrado.
- sem telefone cadastrado.
- possui rede social mas nao site.
- site informado mas fraco ou fora do ar, pelo verificador.

## Google Maps Opcional

O miner pago/opcional usa Places API Text Search (New), endpoint:

```text
https://places.googleapis.com/v1/places:searchText
```

Ele busca empresas pelas consultas em `MAPS_QUERIES` ou `miner_settings.maps_queries`, pega campos essenciais por `X-Goog-FieldMask` e prioriza empresas sem website ou com rating baixo.

Depois da descoberta, o verificador confirma se o lead se enquadra:

- sem `website_url`: marca como oportunidade forte.
- site fora do ar, timeout ou HTTP 4xx/5xx: marca como falha confirmada.
- site sem HTTPS, sem viewport mobile, sem title, muito curto ou com texto de construcao: marca como fraco.
- redes sociais encontradas no HTML entram em `metadata.verification.social_links`.

Revalidar leads ja salvos:

```bash
npm run mine:verify
```

## Miner local

`local_miners/public_intent_sampler.js` le apenas paginas publicas com Playwright. Ele nao faz login nem tenta contornar bloqueios.

Instalacao opcional:

```bash
npm i -D playwright
```

Uso com output JSON:

```bash
LOCAL_INTENT_URLS=https://exemplo.com/forum,https://exemplo.com/comentarios npm run local:public
```

Uso enviando ao Supabase:

```bash
LOCAL_PUSH_TO_SUPABASE=true LOCAL_INTENT_URLS=https://exemplo.com/forum npm run local:public
```

## Deploy

Na Vercel:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`
- Para o botao de mineracao: `VITE_RUN_MINER_URL`
