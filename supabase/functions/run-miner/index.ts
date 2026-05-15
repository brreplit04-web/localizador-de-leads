const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SUBREDDITS = [
  "empreendedorismo",
  "marketingdigital",
  "brdev",
  "programacao",
  "PequenosNegocios",
];

const DEFAULT_KEYWORDS = [
  "preciso de um site",
  "quero um site",
  "landing page nao converte",
  "sistema travou",
  "automatizar atendimento",
  "organizar pedidos",
  "perdendo clientes",
  "agenda online",
  "crm simples",
  "whatsapp atendimento",
  "loja virtual",
];

const DEFAULT_OSM_PLACES = ["Ponta Grossa, PR, Brazil"];

const DEFAULT_OSM_CATEGORIES = [
  "barbearia",
  "clinica de estetica",
  "restaurante",
  "academia",
  "pet shop",
  "auto center",
  "odontologia",
  "imobiliaria",
];

const OSM_CATEGORY_FILTERS: Record<string, Array<[string, string]>> = {
  barbearia: [["shop", "hairdresser|beauty"]],
  "salao de beleza": [["shop", "hairdresser|beauty"]],
  "clinica de estetica": [["shop", "beauty"], ["amenity", "clinic"], ["healthcare", "clinic"]],
  restaurante: [["amenity", "restaurant|fast_food|cafe|bar|pub"]],
  academia: [["leisure", "fitness_centre|sports_centre"], ["sport", "fitness"]],
  "pet shop": [["shop", "pet"], ["amenity", "veterinary"]],
  "auto center": [["shop", "car_repair|tyres|car_parts"], ["amenity", "fuel"]],
  odontologia: [["amenity", "dentist"], ["healthcare", "dentist"]],
  imobiliaria: [["office", "estate_agent"]],
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

function truncate(value: unknown, max = 1800) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function normalizedHash(parts: unknown[]) {
  const text = parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return sha256(text);
}

function normalizeModelPath(model: string) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

function extractJsonArray(text: string) {
  const clean = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini nao retornou uma lista JSON valida.");
  }
  return JSON.parse(clean.slice(start, end + 1));
}

function supabaseHeaders(serviceRoleKey: string, prefer?: string) {
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function supabaseRequest(path: string, options: RequestInit = {}) {
  const supabaseUrl = env("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente na Edge Function.");
  }

  const prefer = (options as RequestInit & { prefer?: string }).prefer;
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...supabaseHeaders(serviceRoleKey, prefer),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${path} retornou HTTP ${response.status}: ${detail}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function readSetting(key: string, fallback: string[]) {
  try {
    const rows = await supabaseRequest(`miner_settings?select=value&key=eq.${encodeURIComponent(key)}&limit=1`);
    return rows?.[0]?.value || fallback;
  } catch {
    return fallback;
  }
}

async function createRun(source: string, metadata = {}) {
  const rows = await supabaseRequest("miner_runs", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify([{ source, metadata }]),
  } as RequestInit & { prefer: string });
  return rows?.[0];
}

async function finishRun(runId: string, patch: Record<string, unknown>) {
  if (!runId) return;
  await supabaseRequest(`miner_runs?id=eq.${runId}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ ...patch, finished_at: new Date().toISOString() }),
  } as RequestInit & { prefer: string });
}

async function fetchRedditPosts(subreddit: string, query: string, limit: number) {
  const params = new URLSearchParams({
    q: query,
    restrict_sr: "1",
    sort: "new",
    t: "month",
    limit: String(limit),
  });
  const response = await fetch(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json?${params}`, {
    headers: {
      "User-Agent": "guerrilla-miner-edge/1.0 lead-intent-research",
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`Reddit r/${subreddit} retornou HTTP ${response.status}`);
  const data = await response.json();
  return (data?.data?.children || []).map((child: { data: unknown }) => child.data).filter(Boolean);
}

async function collectRedditCandidates(subreddits: string[], keywords: string[], limit: number) {
  const seen = new Set<string>();
  const candidates = [];

  for (const subreddit of subreddits) {
    for (const keyword of keywords) {
      const posts = await fetchRedditPosts(subreddit, keyword, limit).catch(() => []);
      for (const rawPost of posts) {
        const post = rawPost as Record<string, unknown>;
        const sourceId = String(post.name || `reddit-${post.id}`);
        if (seen.has(sourceId)) continue;
        seen.add(sourceId);

        const title = truncate(post.title, 240);
        const content = truncate(post.selftext || post.title || "", 1800);
        candidates.push({
          source: "reddit",
          source_id: sourceId,
          lead_hash: await normalizedHash([post.author, title, content]),
          source_url: String(post.url || "").startsWith("http")
            ? String(post.url)
            : `https://www.reddit.com${post.permalink || ""}`,
          author: String(post.author || ""),
          title,
          content,
          subreddit,
          metadata: {
            reddit_id: post.id || "",
            permalink: post.permalink || "",
            reddit_score: post.score || 0,
            comments: post.num_comments || 0,
            matched_keyword: keyword,
            created_utc: post.created_utc || null,
          },
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return candidates;
}

function osmAreaName(place: string) {
  return String(place || "").split(",")[0].trim();
}

function osmEscape(value: unknown) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function osmFiltersForCategory(category: string) {
  const key = String(category || "").toLowerCase().trim();
  return OSM_CATEGORY_FILTERS[key] || [["name", osmEscape(category)]];
}

function buildOverpassQuery(place: string, categories: string[], limit: number) {
  const area = osmEscape(osmAreaName(place));
  const statements = [];
  for (const category of categories) {
    for (const [tagKey, pattern] of osmFiltersForCategory(category)) {
      if (tagKey === "name") statements.push(`nwr(area.searchArea)["name"~"${pattern}",i];`);
      else statements.push(`nwr(area.searchArea)["${tagKey}"~"^(${pattern})$"];`);
    }
  }
  return `
[out:json][timeout:35];
area["name"="${area}"]["boundary"="administrative"]->.searchArea;
(
  ${statements.join("\n  ")}
);
out center tags ${Math.max(1, Math.min(500, limit))};
`;
}

function osmTag(tags: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (tags?.[name]) return String(tags[name]);
  }
  return "";
}

function osmNiche(tags: Record<string, unknown>) {
  return [tags?.amenity, tags?.shop, tags?.office, tags?.leisure, tags?.healthcare]
    .filter(Boolean)
    .join(", ");
}

async function fetchOverpass(place: string, categories: string[], limit: number) {
  const endpoint = env("OVERPASS_URL", "https://overpass-api.de/api/interpreter");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "guerrilla-miner-edge/1.0 openstreetmap-lead-research",
    },
    body: new URLSearchParams({ data: buildOverpassQuery(place, categories, limit) }),
  });
  if (!response.ok) throw new Error(`Overpass retornou HTTP ${response.status}`);
  const data = await response.json();
  return data.elements || [];
}

async function collectOsmCandidates(places: string[], categories: string[], limit: number) {
  const seen = new Set<string>();
  const candidates = [];

  for (const place of places) {
    const elements = await fetchOverpass(place, categories, limit).catch(() => []);
    for (const element of elements) {
      const tags = element.tags || {};
      const name = tags.name || tags["name:pt"] || "";
      if (!name) continue;

      const sourceId = `osm-${element.type}-${element.id}`;
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);

      const phone = osmTag(tags, ["contact:phone", "phone", "mobile", "contact:mobile"]);
      const website = osmTag(tags, ["contact:website", "website", "url"]);
      const email = osmTag(tags, ["contact:email", "email"]);
      const social = osmTag(tags, ["contact:instagram", "instagram", "contact:facebook", "facebook", "contact:whatsapp"]);
      const missing = [
        !website ? "sem website cadastrado no OSM" : "",
        !phone ? "sem telefone cadastrado no OSM" : "",
        social && !website ? "possui rede social mas nao site" : "",
      ].filter(Boolean);

      candidates.push({
        source: "openstreetmap",
        source_id: sourceId,
        lead_hash: await normalizedHash([name, phone, website, place]),
        source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        company_name: String(name),
        title: String(name),
        city: place,
        contact_phone: phone,
        contact_email: email,
        website_url: website,
        niche: osmNiche(tags),
        content: `Empresa encontrada no OpenStreetMap em ${place}. Sinais: ${missing.join("; ") || "dados publicos disponiveis"}. Categoria: ${osmNiche(tags) || "local"}.`,
        verification_status: website ? "pending" : "weak",
        verification_score: website ? 0 : 88,
        verified_at: website ? null : new Date().toISOString(),
        metadata: {
          osm_id: element.id,
          osm_type: element.type,
          osm_place: place,
          lat: element.lat || element.center?.lat || null,
          lon: element.lon || element.center?.lon || null,
          tags,
          social,
          missing_signals: missing,
          verification: website ? undefined : {
            status: "weak",
            reason: "sem website cadastrado no OSM",
            checked_at: new Date().toISOString(),
          },
        },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return candidates;
}

async function analyzeBatch(candidates: Record<string, unknown>[]) {
  const geminiKey = env("GEMINI_API_KEY");
  const geminiModel = env("GEMINI_MODEL", "gemini-2.5-flash");
  if (!geminiKey) throw new Error("GEMINI_API_KEY ausente na Edge Function.");

  const prompt = `
Analise sinais publicos de possivel intencao de compra B2B no Brasil.

Retorne somente um array JSON. Cada item deve conter:
- source_id: copie exatamente o ID enviado
- approved: boolean
- urgency: inteiro de 1 a 5
- score: inteiro de 0 a 100
- niche: nicho provavel do lead
- intent: intencao comercial em uma frase curta
- pain_point: dor concreta
- offer_angle: angulo consultivo para abordagem
- contact_hint: como abordar sem parecer spam
- reason: justificativa curta

Regras:
- Aprove somente quando houver dor, pedido de ajuda, orcamento, compra, troca de ferramenta ou urgencia operacional.
- Reprove curiosidade generica, debate, meme, vaga de emprego e posts sem acao comercial clara.
- Nao invente telefone, email ou dados pessoais.
- Para OpenStreetMap, valorize empresas sem website, sem telefone ou com dados incompletos.

Itens:
${candidates
    .map(
      (item, index) => `
${index + 1}. source_id: ${item.source_id}
subreddit: ${item.subreddit}
empresa: ${item.company_name || "vazio"}
autor: ${item.author || "vazio"}
nicho: ${item.niche || "vazio"}
titulo: ${item.title}
texto: ${item.content || "vazio"}
telefone: ${item.contact_phone || "vazio"}
website: ${item.website_url || "vazio"}
url: ${item.source_url}
`,
    )
    .join("\n")}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${normalizeModelPath(geminiModel)}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "Voce e um analista criterioso de prospeccao B2B. Retorne apenas JSON valido." }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 6000,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini retornou HTTP ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
  return extractJsonArray(text);
}

async function analyzeCandidates(candidates: Record<string, unknown>[]) {
  const batchSize = Number(env("GEMINI_BATCH_SIZE", "10"));
  const byId = new Map(candidates.map((candidate) => [candidate.source_id, candidate]));
  const approved = [];

  for (let index = 0; index < candidates.length; index += batchSize) {
    const batch = candidates.slice(index, index + batchSize);
    const analysis = await analyzeBatch(batch);
    for (const item of analysis) {
      if (!item?.approved) continue;
      const original = byId.get(item.source_id);
      if (!original) continue;

      approved.push({
        ...original,
        niche: item.niche || original.niche || "",
        intent: item.intent || "",
        pain_point: item.pain_point || "",
        offer_angle: item.offer_angle || "",
        contact_hint: item.contact_hint || "",
        urgency: Math.max(1, Math.min(5, Number(item.urgency || 1))),
        score: Math.max(0, Math.min(100, Number(item.score || 0))),
        status: "pendente",
        last_seen_at: new Date().toISOString(),
        metadata: {
          ...(original.metadata as Record<string, unknown>),
          reason: item.reason || "",
          analyzed_at: new Date().toISOString(),
          model: env("GEMINI_MODEL", "gemini-2.5-flash"),
          triggered_by: "dashboard_edge_function",
        },
      });
    }
  }

  return approved;
}

async function upsertLeads(leads: Record<string, unknown>[]) {
  if (leads.length === 0) return [];
  const rows = await supabaseRequest("leads?on_conflict=source,source_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(leads),
  } as RequestInit & { prefer: string });
  return rows || [];
}

async function notifyDiscord(leads: Record<string, unknown>[]) {
  const webhook = env("DISCORD_WEBHOOK_URL");
  if (!webhook || leads.length === 0) return;
  for (const lead of leads.slice(0, 8)) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Guerrilla Miner",
        embeds: [
          {
            title: lead.title || "Lead qualificado",
            url: lead.source_url,
            color: Number(lead.urgency || 1) >= 4 ? 10029568 : 3032325,
            description: truncate(lead.pain_point || lead.content || "", 240),
            fields: [
              { name: "Score", value: String(lead.score || 0), inline: true },
              { name: "Urgencia", value: `${lead.urgency || 1}/5`, inline: true },
              { name: "Fonte", value: String(lead.source || "reddit"), inline: true },
            ],
          },
        ],
      }),
    }).catch(() => null);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  let runId = "";
  try {
    const body = await request.json().catch(() => ({}));
    const source = body.source === "reddit" ? "reddit" : "osm";
    const subreddits = Array.isArray(body.subreddits)
      ? body.subreddits
      : await readSetting("reddit_subreddits", DEFAULT_SUBREDDITS);
    const keywords = Array.isArray(body.keywords)
      ? body.keywords
      : await readSetting("reddit_keywords", DEFAULT_KEYWORDS);
    const osmPlaces = Array.isArray(body.osm_places)
      ? body.osm_places
      : await readSetting("osm_places", DEFAULT_OSM_PLACES);
    const osmCategories = Array.isArray(body.osm_categories)
      ? body.osm_categories
      : await readSetting("osm_categories", DEFAULT_OSM_CATEGORIES);
    const limit = Math.max(1, Math.min(20, Number(body.limit || env("REDDIT_LIMIT_PER_QUERY", "8"))));

    const run = await createRun(source === "reddit" ? "dashboard_reddit" : "dashboard_osm", {
      started_by: "dashboard_button",
      source,
      subreddits: source === "reddit" ? subreddits : undefined,
      keywords_count: source === "reddit" ? keywords.length : undefined,
      osm_places: source === "osm" ? osmPlaces : undefined,
      osm_categories: source === "osm" ? osmCategories : undefined,
      limit,
    });
    runId = run?.id || "";

    const candidates = source === "reddit"
      ? await collectRedditCandidates(subreddits, keywords, limit)
      : await collectOsmCandidates(osmPlaces, osmCategories, Math.max(limit, 80));
    const approved = await analyzeCandidates(candidates);
    const saved = await upsertLeads(approved);
    await notifyDiscord(saved);

    await finishRun(runId, {
      status: "success",
      collected: candidates.length,
      approved: approved.length,
      saved: saved.length,
    });

    return json({
      ok: true,
      collected: candidates.length,
      approved: approved.length,
      saved: saved.length,
      run_id: runId,
    });
  } catch (error) {
    if (runId) {
      await finishRun(runId, {
        status: "error",
        errors: [{ message: error instanceof Error ? error.message : String(error), at: new Date().toISOString() }],
      }).catch(() => null);
    }
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
