const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

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

const DEFAULT_MAPS_QUERIES = [
  "barbearia sem site em Ponta Grossa PR",
  "clinica de estetica sem site em Ponta Grossa PR",
  "restaurante baixa avaliacao em Ponta Grossa PR",
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

const OSM_CATEGORY_FILTERS = {
  barbearia: [
    ['shop', 'hairdresser|beauty'],
  ],
  "salao de beleza": [
    ['shop', 'hairdresser|beauty'],
  ],
  "clinica de estetica": [
    ['shop', 'beauty'],
    ['amenity', 'clinic'],
    ['healthcare', 'clinic'],
  ],
  restaurante: [
    ['amenity', 'restaurant|fast_food|cafe|bar|pub'],
  ],
  lanchonete: [
    ['amenity', 'fast_food|cafe|restaurant'],
  ],
  academia: [
    ['leisure', 'fitness_centre|sports_centre'],
    ['sport', 'fitness'],
  ],
  "pet shop": [
    ['shop', 'pet'],
    ['amenity', 'veterinary'],
  ],
  "auto center": [
    ['shop', 'car_repair|tyres|car_parts'],
    ['amenity', 'fuel'],
  ],
  mecanica: [
    ['shop', 'car_repair|tyres|car_parts'],
  ],
  odontologia: [
    ['amenity', 'dentist'],
    ['healthcare', 'dentist'],
  ],
  imobiliaria: [
    ['office', 'estate_agent'],
  ],
};

function loadEnv(file = ".env") {
  const envPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function envList(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function envPlaceList(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64(value) {
  return Buffer.from(value).toString("base64");
}

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
}

function getSourceArg() {
  if (process.argv.includes("--osm")) return "osm";
  if (process.argv.includes("--maps")) return "maps";
  if (process.argv.includes("--csv")) return "csv";
  if (process.argv.includes("--verify")) return "verify";
  if (process.argv.includes("--all")) return "all";
  return argValue("source", process.env.MINER_SOURCE || "reddit");
}

function getConfig() {
  return {
    supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    supabaseKey: getSupabaseKey(),
    geminiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "",
    source: getSourceArg(),
    csvInput: argValue("csv", process.env.CSV_INPUT || ""),
    subreddits: envList("REDDIT_SUBREDDITS", DEFAULT_SUBREDDITS),
    keywords: envList("REDDIT_KEYWORDS", DEFAULT_KEYWORDS),
    redditClientId: process.env.REDDIT_CLIENT_ID || "",
    redditClientSecret: process.env.REDDIT_CLIENT_SECRET || "",
    redditUserAgent:
      process.env.REDDIT_USER_AGENT ||
      "node:guerrilla-miner:1.0 (lead intent research)",
    osmPlaces: envPlaceList("OSM_PLACES", DEFAULT_OSM_PLACES),
    osmCategories: envList("OSM_CATEGORIES", DEFAULT_OSM_CATEGORIES),
    osmLimit: Number(process.env.OSM_LIMIT || 80),
    overpassUrl: process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter",
    mapsQueries: envList("MAPS_QUERIES", DEFAULT_MAPS_QUERIES),
    redditLimitPerQuery: Number(process.env.REDDIT_LIMIT_PER_QUERY || 8),
    mapsLimitPerQuery: Number(process.env.MAPS_LIMIT_PER_QUERY || 12),
    mapsMaxRating: Number(process.env.MAPS_MAX_RATING || 3.8),
    verifyAfterMaps: process.env.VERIFY_AFTER_MAPS !== "false",
    verifyAfterOsm: process.env.VERIFY_AFTER_OSM !== "false",
    verifyLimit: Number(process.env.VERIFY_LIMIT || 50),
    verifyTimeoutMs: Number(process.env.VERIFY_TIMEOUT_MS || 10_000),
    verifyUserAgent: process.env.VERIFY_USER_AGENT || "Mozilla/5.0 GuerrillaMiner/1.0",
    geminiBatchSize: Number(process.env.GEMINI_BATCH_SIZE || 10),
    dryRun: process.argv.includes("--dry-run"),
    checkOnly: process.argv.includes("--check"),
    useRemoteSettings: process.env.USE_REMOTE_SETTINGS !== "false",
  };
}

function requestedSources(config) {
  const sources = String(config.source || "reddit")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (sources.includes("all")) return ["reddit", "osm", "verify"];
  return [...new Set(sources)];
}

function hasRedditOAuth(config) {
  return Boolean(config.redditClientId && config.redditClientSecret);
}

function shouldSkipRedditInGithubActions(config) {
  return process.env.GITHUB_ACTIONS === "true" && !hasRedditOAuth(config);
}

function runtimeSources(config) {
  const sources = requestedSources(config);
  if (!sources.includes("reddit") || !shouldSkipRedditInGithubActions(config)) return sources;
  return sources.filter((source) => source !== "reddit");
}

function printConfigStatus(config) {
  const rows = [
    ["SUPABASE_URL", Boolean(config.supabaseUrl)],
    ["SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_KEY", Boolean(config.supabaseKey)],
    ["GEMINI_API_KEY", Boolean(config.geminiKey)],
    ["DISCORD_WEBHOOK_URL", Boolean(config.discordWebhookUrl)],
    ["GOOGLE_PLACES_API_KEY (opcional)", config.googlePlacesApiKey ? "ok" : "nao usado"],
    ["MINER_SOURCE", requestedSources(config).join(", ")],
    [
      "REDDIT_OAUTH",
      hasRedditOAuth(config) ? "ok" : "modo publico/fallback",
    ],
    ["ACTIVE_SOURCES", runtimeSources(config).join(", ") || "nenhuma"],
    ["GEMINI_MODEL", config.geminiModel],
    ["REDDIT_SUBREDDITS", config.subreddits.join(", ")],
    ["REDDIT_KEYWORDS", `${config.keywords.length} termos`],
    ["OSM_PLACES", config.osmPlaces.join(" | ")],
    ["OSM_CATEGORIES", config.osmCategories.join(", ")],
    ["OSM_LIMIT", config.osmLimit],
    ["MAPS_QUERIES", `${config.mapsQueries.length} consultas`],
    ["VERIFY_AFTER_MAPS", config.verifyAfterMaps ? "true" : "false"],
    ["VERIFY_LIMIT", config.verifyLimit],
    ["CSV_INPUT", config.csvInput || "vazio"],
  ];

  console.log("Guerrilla Miner - checagem de configuracao\n");
  for (const [name, value] of rows) {
    const printable = typeof value === "boolean" ? (value ? "ok" : "faltando") : value;
    console.log(`${name}: ${printable}`);
  }
}

function validateConfig(config) {
  const missing = [];
  const sources = requestedSources(config);

  if (!config.geminiKey) missing.push("GEMINI_API_KEY");
  if (!config.dryRun) {
    if (!config.supabaseUrl) missing.push("SUPABASE_URL");
    if (!config.supabaseKey) missing.push("SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_KEY");
  }
  if (sources.includes("maps") && !config.googlePlacesApiKey) {
    missing.push("GOOGLE_PLACES_API_KEY");
  }
  if (sources.includes("csv") && !config.csvInput) {
    missing.push("CSV_INPUT ou --csv=caminho/do/arquivo.csv");
  }

  if (missing.length) {
    throw new Error(`Variaveis ausentes: ${missing.join(", ")}.`);
  }
}

function truncate(text, max = 1800) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

function normalizeUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function abortSignal(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

function normalizedHash(parts) {
  const text = parts
    .filter(Boolean)
    .join("|")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return crypto.createHash("sha256").update(text).digest("hex");
}

function supabaseHeaders(config, prefer) {
  const headers = {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function supabaseRequest(config, pathName, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${pathName}`, {
    ...options,
    headers: {
      ...supabaseHeaders(config, options.prefer),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${pathName} retornou HTTP ${response.status}: ${detail}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function readSetting(config, key, fallback) {
  if (config.dryRun || !config.useRemoteSettings || !config.supabaseUrl || !config.supabaseKey) {
    return fallback;
  }

  try {
    const rows = await supabaseRequest(
      config,
      `miner_settings?select=value&key=eq.${encodeURIComponent(key)}&limit=1`
    );
    return rows?.[0]?.value ?? fallback;
  } catch (error) {
    console.warn(`[settings] ${key}: ${error.message}`);
    return fallback;
  }
}

async function applyRemoteSettings(config) {
  if (process.env.REDDIT_SUBREDDITS === undefined) {
    config.subreddits = await readSetting(config, "reddit_subreddits", config.subreddits);
  }
  if (process.env.REDDIT_KEYWORDS === undefined) {
    config.keywords = await readSetting(config, "reddit_keywords", config.keywords);
  }
  if (process.env.OSM_PLACES === undefined) {
    config.osmPlaces = await readSetting(config, "osm_places", config.osmPlaces);
  }
  if (process.env.OSM_CATEGORIES === undefined) {
    config.osmCategories = await readSetting(config, "osm_categories", config.osmCategories);
  }
  if (process.env.MAPS_QUERIES === undefined) {
    config.mapsQueries = await readSetting(config, "maps_queries", config.mapsQueries);
  }
  return config;
}

async function createRun(config, source, metadata = {}) {
  if (config.dryRun) return { id: `dry-${source}`, source };

  const rows = await supabaseRequest(config, "miner_runs", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify([{ source, metadata }]),
  });
  return rows?.[0];
}

async function finishRun(config, run, patch) {
  if (config.dryRun || !run?.id) return;

  await supabaseRequest(config, `miner_runs?id=eq.${run.id}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({
      ...patch,
      finished_at: new Date().toISOString(),
    }),
  });
}

function redditSourceUrl(post) {
  if (post.url?.startsWith("http")) return post.url;
  return `https://www.reddit.com${post.permalink || ""}`;
}

let redditTokenCache = null;

async function getRedditAccessToken(config) {
  if (!config.redditClientId || !config.redditClientSecret) return "";
  if (redditTokenCache?.accessToken && redditTokenCache.expiresAt > Date.now() + 60_000) {
    return redditTokenCache.accessToken;
  }

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${base64(`${config.redditClientId}:${config.redditClientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.redditUserAgent,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Reddit OAuth retornou HTTP ${response.status}: ${truncate(text, 220)}`);
  }

  const data = text ? JSON.parse(text) : {};
  if (!data.access_token) {
    throw new Error(`Reddit OAuth nao retornou access_token: ${truncate(text, 220)}`);
  }

  redditTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };

  return redditTokenCache.accessToken;
}

async function fetchRedditPostsWithOAuth(config, subreddit, query, limit) {
  const token = await getRedditAccessToken(config);
  if (!token) return null;

  const params = new URLSearchParams({
    q: query,
    restrict_sr: "true",
    sort: "new",
    t: "month",
    raw_json: "1",
    limit: String(limit),
  });

  const url = `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/search?${params}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": config.redditUserAgent,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Reddit OAuth r/${subreddit} retornou HTTP ${response.status}: ${truncate(detail, 180)}`);
  }

  const data = await response.json();
  return (data?.data?.children || []).map((child) => child.data).filter(Boolean);
}

async function fetchRedditPostsPublic(config, subreddit, query, limit) {
  const params = new URLSearchParams({
    q: query,
    restrict_sr: "1",
    sort: "new",
    t: "month",
    limit: String(limit),
  });

  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json?${params}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": config.redditUserAgent,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit r/${subreddit} retornou HTTP ${response.status}`);
  }

  const data = await response.json();
  return (data?.data?.children || []).map((child) => child.data).filter(Boolean);
}

async function fetchRedditPosts(config, subreddit, query, limit) {
  if (!config.redditClientId || !config.redditClientSecret) {
    console.warn("[reddit] OAuth nao configurado; usando fallback publico sujeito a HTTP 403 no GitHub Actions.");
    return fetchRedditPostsPublic(config, subreddit, query, limit);
  }

  try {
    const oauthPosts = await fetchRedditPostsWithOAuth(config, subreddit, query, limit);
    if (oauthPosts) return oauthPosts;
  } catch (error) {
    console.warn(`[reddit] ${error.message}. Tentando fallback publico...`);
  }

  return fetchRedditPostsPublic(config, subreddit, query, limit);
}

async function collectRedditCandidates(config) {
  const seen = new Set();
  const candidates = [];

  for (const subreddit of config.subreddits) {
    for (const keyword of config.keywords) {
      try {
        const posts = await fetchRedditPosts(config, subreddit, keyword, config.redditLimitPerQuery);
        for (const post of posts) {
          const sourceId = post.name || `reddit-${post.id}`;
          if (seen.has(sourceId)) continue;
          seen.add(sourceId);

          const title = truncate(post.title, 240);
          const content = truncate(post.selftext || post.title || "", 1800);
          candidates.push({
            source: "reddit",
            source_id: sourceId,
            lead_hash: normalizedHash([post.author, title, content]),
            source_url: redditSourceUrl(post),
            author: post.author || "",
            title,
            content,
            subreddit,
            metadata: {
              reddit_id: post.id,
              permalink: post.permalink,
              reddit_score: post.score,
              comments: post.num_comments,
              matched_keyword: keyword,
              created_utc: post.created_utc,
            },
          });
        }
      } catch (error) {
        console.warn(`[reddit] ${error.message}`);
        if (/HTTP (403|429)/.test(error.message)) {
          console.warn(`[reddit] Pulando r/${subreddit}; Reddit bloqueou ou limitou este ambiente.`);
          break;
        }
      }
      await sleep(650);
    }
  }

  return candidates;
}

function placeName(place) {
  return place.displayName?.text || place.displayName || "Empresa sem nome";
}

async function fetchGooglePlaces(config, query) {
  const endpoint = "https://places.googleapis.com/v1/places:searchText";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": config.googlePlacesApiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.rating",
        "places.userRatingCount",
        "places.googleMapsUri",
        "places.types",
        "places.businessStatus",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "pt-BR",
      regionCode: "BR",
      maxResultCount: config.mapsLimitPerQuery,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Places retornou HTTP ${response.status}: ${detail}`);
  }

  const data = await response.json();
  return data.places || [];
}

async function collectMapsCandidates(config) {
  const seen = new Set();
  const candidates = [];

  for (const query of config.mapsQueries) {
    try {
      const places = await fetchGooglePlaces(config, query);
      for (const place of places) {
        const name = placeName(place);
        const rating = Number(place.rating || 0);
        const hasWebsite = Boolean(place.websiteUri);
        const weakSignal = !hasWebsite || (rating > 0 && rating <= config.mapsMaxRating);

        if (!weakSignal) continue;
        if (seen.has(place.id)) continue;
        seen.add(place.id);

        const types = Array.isArray(place.types) ? place.types.join(", ") : "";
        const signal = [
          !hasWebsite ? "sem website cadastrado" : "",
          rating > 0 && rating <= config.mapsMaxRating ? `avaliacao ${rating}` : "",
          place.userRatingCount ? `${place.userRatingCount} reviews` : "",
        ]
          .filter(Boolean)
          .join("; ");

        candidates.push({
          source: "google_maps",
          source_id: place.id || `maps-${normalizedHash([name, place.formattedAddress])}`,
          lead_hash: normalizedHash([name, place.formattedAddress, place.nationalPhoneNumber]),
          source_url: place.googleMapsUri || "",
          company_name: name,
          city: place.formattedAddress || "",
          contact_phone: place.nationalPhoneNumber || "",
          website_url: place.websiteUri || "",
          rating: rating || null,
          review_count: Number(place.userRatingCount || 0) || null,
          title: name,
          content: `Empresa local encontrada no Google Maps. Sinais: ${signal || "dados incompletos"}. Endereco: ${place.formattedAddress || "vazio"}. Tipos: ${types || "vazio"}.`,
          niche: types,
          metadata: {
            query,
            business_status: place.businessStatus || "",
            types: place.types || [],
          },
        });
      }
    } catch (error) {
      console.warn(`[maps] ${query}: ${error.message}`);
    }
    await sleep(450);
  }

  return candidates;
}

function osmAreaName(place) {
  return String(place || "").split(",")[0].trim();
}

function osmEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function osmFiltersForCategory(category) {
  const key = String(category || "").toLowerCase().trim();
  return OSM_CATEGORY_FILTERS[key] || [
    ['name', osmEscape(category)],
  ];
}

function buildOverpassQuery(place, categories, limit) {
  const area = osmEscape(osmAreaName(place));
  const statements = [];

  for (const category of categories) {
    for (const [tagKey, pattern] of osmFiltersForCategory(category)) {
      if (tagKey === "name") {
        statements.push(`nwr(area.searchArea)["name"~"${pattern}",i];`);
      } else {
        statements.push(`nwr(area.searchArea)["${tagKey}"~"^(${pattern})$"];`);
      }
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

function osmTag(tags, names) {
  for (const name of names) {
    if (tags?.[name]) return String(tags[name]);
  }
  return "";
}

function osmNiche(tags, fallback) {
  return [
    tags?.amenity,
    tags?.shop,
    tags?.office,
    tags?.leisure,
    tags?.healthcare,
    fallback,
  ]
    .filter(Boolean)
    .join(", ");
}

function osmElementUrl(element) {
  return `https://www.openstreetmap.org/${element.type}/${element.id}`;
}

async function fetchOverpass(config, place, categories) {
  const query = buildOverpassQuery(place, categories, config.osmLimit);
  const body = new URLSearchParams({ data: query });
  const response = await fetch(config.overpassUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "guerrilla-miner/1.0 openstreetmap-lead-research",
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Overpass retornou HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.elements || [];
}

async function collectOsmCandidates(config) {
  const seen = new Set();
  const candidates = [];

  for (const place of config.osmPlaces) {
    try {
      const elements = await fetchOverpass(config, place, config.osmCategories);
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
        const social = osmTag(tags, [
          "contact:instagram",
          "instagram",
          "contact:facebook",
          "facebook",
          "contact:whatsapp",
        ]);
        const missing = [
          !website ? "sem website cadastrado no OSM" : "",
          !phone ? "sem telefone cadastrado no OSM" : "",
          social && !website ? "possui rede social mas nao site" : "",
        ].filter(Boolean);

        candidates.push({
          source: "openstreetmap",
          source_id: sourceId,
          lead_hash: normalizedHash([name, phone, website, place]),
          source_url: osmElementUrl(element),
          company_name: name,
          title: name,
          city: place,
          contact_phone: phone,
          contact_email: email,
          website_url: website,
          niche: osmNiche(tags, ""),
          content: `Empresa encontrada no OpenStreetMap em ${place}. Sinais: ${missing.join("; ") || "dados publicos disponiveis"}. Categoria: ${osmNiche(tags, "local")}.`,
          metadata: {
            osm_id: element.id,
            osm_type: element.type,
            osm_place: place,
            lat: element.lat || element.center?.lat || null,
            lon: element.lon || element.center?.lon || null,
            tags,
            social,
            missing_signals: missing,
          },
        });
      }
    } catch (error) {
      console.warn(`[osm] ${place}: ${error.message}`);
    }
    await sleep(800);
  }

  return candidates;
}

function analyzeWebsiteHtml(html, url, status) {
  const text = String(html || "");
  const lower = text.toLowerCase();
  const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || "";
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(text);
  const hasHttps = String(url || "").startsWith("https://");
  const socialLinks = [...text.matchAll(/https?:\/\/(?:www\.)?(instagram\.com|facebook\.com|wa\.me|api\.whatsapp\.com|linkedin\.com)[^"'\s<)]*/gi)]
    .map((match) => match[0])
    .slice(0, 8);
  const weakPhrases = [
    "em construcao",
    "em construção",
    "coming soon",
    "under construction",
    "pagina nao encontrada",
    "página não encontrada",
    "404",
    "erro 404",
    "site suspenso",
    "domain for sale",
    "dominio a venda",
  ];
  const weakSignals = [];
  if (!hasHttps) weakSignals.push("sem HTTPS");
  if (!title) weakSignals.push("sem title");
  if (!hasViewport) weakSignals.push("sem viewport mobile");
  if (status >= 400) weakSignals.push(`HTTP ${status}`);
  for (const phrase of weakPhrases) {
    if (lower.includes(phrase)) weakSignals.push(`texto: ${phrase}`);
  }
  if (text.length < 900) weakSignals.push("pagina muito curta");

  return {
    title,
    has_https: hasHttps,
    has_viewport: hasViewport,
    social_links: socialLinks,
    weak_signals: [...new Set(weakSignals)],
    byte_length: text.length,
  };
}

function verificationOutcome(lead, result) {
  if (!lead.website_url) {
    return {
      verification_status: "weak",
      verification_score: 88,
      verified_at: new Date().toISOString(),
      metadata: {
        ...lead.metadata,
        verification: {
          status: "weak",
          reason: "sem website cadastrado",
          checked_at: new Date().toISOString(),
        },
      },
      score: Math.min(100, Number(lead.score || 0) + 8),
      urgency: Math.max(Number(lead.urgency || 1), 3),
    };
  }

  if (!result.ok) {
    return {
      verification_status: "failed",
      verification_score: 82,
      verified_at: new Date().toISOString(),
      metadata: {
        ...lead.metadata,
        verification: {
          status: "failed",
          reason: result.error || `HTTP ${result.status || "erro"}`,
          checked_url: result.url,
          checked_at: new Date().toISOString(),
        },
      },
      score: Math.min(100, Number(lead.score || 0) + 6),
      urgency: Math.max(Number(lead.urgency || 1), 3),
    };
  }

  const weakSignals = result.analysis.weak_signals || [];
  const weakScore = Math.min(78, weakSignals.length * 16 + (result.analysis.social_links?.length ? 8 : 0));
  const status = weakSignals.length >= 2 ? "weak" : "verified";
  const scoreBump = status === "weak" ? 7 : 0;

  return {
    verification_status: status,
    verification_score: weakScore,
    verified_at: new Date().toISOString(),
    metadata: {
      ...lead.metadata,
      verification: {
        status,
        checked_url: result.url,
        http_status: result.status,
        final_url: result.final_url,
        title: result.analysis.title,
        weak_signals: weakSignals,
        social_links: result.analysis.social_links,
        byte_length: result.analysis.byte_length,
        checked_at: new Date().toISOString(),
      },
    },
    score: Math.min(100, Number(lead.score || 0) + scoreBump),
    urgency: weakSignals.length >= 2 ? Math.max(Number(lead.urgency || 1), 3) : Number(lead.urgency || 1),
  };
}

async function verifyWebsite(config, lead) {
  if (!lead.website_url) {
    return verificationOutcome(lead, { skipped: true });
  }

  const url = normalizeUrl(lead.website_url);
  const timer = abortSignal(config.verifyTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: timer.signal,
      headers: {
        "User-Agent": config.verifyUserAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const html = contentType.includes("text/html") ? await response.text() : "";
    return verificationOutcome(lead, {
      ok: response.ok,
      status: response.status,
      url,
      final_url: response.url,
      analysis: analyzeWebsiteHtml(html, response.url, response.status),
    });
  } catch (error) {
    return verificationOutcome(lead, {
      ok: false,
      url,
      error: error.name === "AbortError" ? "timeout" : error.message,
    });
  } finally {
    timer.cancel();
  }
}

async function verifyCandidates(config, candidates) {
  const verified = [];
  for (const candidate of candidates) {
    const patch = await verifyWebsite(config, candidate);
    verified.push({ ...candidate, ...patch });
    await sleep(250);
  }
  return verified;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function readCsvCandidates(filePath) {
  const absolute = path.resolve(process.cwd(), filePath);
  const rows = parseCsv(fs.readFileSync(absolute, "utf8"));
  if (rows.length === 0) return [];

  const header = rows[0].map((item) => item.trim().toLowerCase());
  const hasHeader = header.some((item) =>
    ["title", "titulo", "company_name", "empresa", "content", "conteudo", "source_url"].includes(item)
  );
  const dataRows = hasHeader ? rows.slice(1) : rows;

  function value(row, names, fallbackIndex) {
    if (hasHeader) {
      for (const name of names) {
        const index = header.indexOf(name);
        if (index >= 0 && row[index]) return row[index];
      }
    }
    return row[fallbackIndex] || "";
  }

  return dataRows.map((row, index) => {
    const company = value(row, ["company_name", "empresa", "nome", "name"], 0);
    const content = value(row, ["content", "conteudo", "dor", "pain"], 1);
    const sourceUrl = value(row, ["source_url", "url", "origem"], 2);
    const phone = value(row, ["contact_phone", "telefone", "phone", "whatsapp"], 3);
    const website = value(row, ["website_url", "site", "website"], 4);
    const niche = value(row, ["niche", "nicho", "categoria"], 5);
    const city = value(row, ["city", "cidade", "endereco"], 6);
    const notes = value(row, ["notes", "notas", "observacao"], 7);
    const hash = normalizedHash([company, content, phone, city]);

    return {
      source: "manual",
      source_id: value(row, ["source_id", "id"], -1) || `manual-${hash.slice(0, 16)}-${index}`,
      lead_hash: hash,
      source_url: sourceUrl,
      company_name: company,
      title: company || truncate(content, 120),
      content: content || notes || "Lead importado manualmente.",
      contact_phone: phone,
      website_url: website,
      niche,
      city,
      notes,
      metadata: {
        imported_from: filePath,
        row_index: index + 1,
      },
    };
  });
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeModelPath(model) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

function extractJsonArray(text) {
  const clean = String(text || "")
    .trim()
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed;
    for (const key of ["items", "leads", "results", "analysis", "analises"]) {
      if (Array.isArray(parsed?.[key])) return parsed[key];
    }
  } catch {
    // Continua tentando extrair o array de uma resposta com texto extra.
  }

  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Gemini nao retornou uma lista JSON valida. Trecho: ${truncate(clean, 260)}`);
  }

  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch (error) {
    throw new Error(`Gemini retornou JSON invalido: ${error.message}. Trecho: ${truncate(clean, 260)}`);
  }
}

function fallbackLeadAnalysis(candidate, reason = "") {
  const text = [
    candidate.title,
    candidate.content,
    candidate.company_name,
    candidate.niche,
    candidate.metadata?.missing?.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 30;
  if (candidate.source === "openstreetmap" || candidate.source === "google_maps") score += 15;
  if (!candidate.website_url) score += 25;
  if (["weak", "failed"].includes(candidate.verification_status)) score += 22;
  if (candidate.contact_phone) score += 8;
  if (candidate.contact_email) score += 5;
  if (/sem site|site ausente|website ausente|presenca digital fraca/.test(text)) score += 12;
  if (/preciso|quero|orcamento|orçamento|travou|automatizar|perdendo|agenda|crm|whatsapp|loja virtual/.test(text)) {
    score += 25;
  }
  if (/vaga|curriculo|currículo|contratando|emprego/.test(text)) score -= 35;

  score = Math.max(0, Math.min(100, score));
  const urgency = score >= 80 ? 5 : score >= 68 ? 4 : score >= 55 ? 3 : 2;
  const company = candidate.company_name || candidate.author || "lead";
  const noWebsite = !candidate.website_url || ["weak", "failed"].includes(candidate.verification_status);

  return {
    source_id: candidate.source_id,
    approved: score >= 55,
    urgency,
    score,
    niche: candidate.niche || "negocio local",
    intent: noWebsite
      ? "Melhorar presenca digital e captura de clientes."
      : "Avaliar oportunidade operacional indicada por sinais publicos.",
    pain_point: noWebsite
      ? "Presenca digital incompleta ou site com problemas tecnicos."
      : "Sinal publico indica possivel dor comercial ou operacional.",
    offer_angle: noWebsite
      ? `Abordar ${company} com uma auditoria simples de presenca digital e proposta objetiva de site/atendimento.`
      : `Abordar ${company} de forma consultiva a partir do sinal encontrado.`,
    contact_hint: candidate.contact_phone
      ? "Usar contato publico da empresa com mensagem curta e permissiva."
      : "Responder no canal de origem pedindo permissao para enviar uma ideia objetiva.",
    reason: reason
      ? `Fallback local porque a IA falhou: ${truncate(reason, 160)}`
      : "Fallback local baseado em sinais objetivos do lead.",
  };
}

function fallbackAnalyzeBatch(batch, error) {
  return batch.map((candidate) => fallbackLeadAnalysis(candidate, error?.message || ""));
}

function shouldRetryWithSmallerBatch(error) {
  return /JSON|lista JSON|invalido|inválido/i.test(error?.message || "");
}

async function analyzeBatch(config, batch) {
  const modelPath = normalizeModelPath(config.geminiModel);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${config.geminiKey}`;

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
- Aprove somente quando houver dor, pedido de ajuda, ausencia de presenca digital, baixa avaliacao, troca de ferramenta, compra, orcamento ou urgencia operacional.
- Reprove curiosidade generica, debate, meme, vaga de emprego e dados sem oportunidade comercial clara.
- Nao invente telefone, email, nome de pessoa ou dados pessoais.
- Para fontes locais como OpenStreetMap/Google Maps, valorize empresas sem website, com dados incompletos ou presenca digital fraca.
- Se houver verificacao tecnica, valorize verification_status "weak" ou "failed" como confirmacao de oportunidade.

Itens:
${batch
  .map(
    (item, index) => `
${index + 1}. source_id: ${item.source_id}
source: ${item.source}
empresa: ${item.company_name || "vazio"}
autor: ${item.author || "vazio"}
nicho: ${item.niche || "vazio"}
titulo: ${item.title || "vazio"}
texto: ${item.content || "vazio"}
cidade/endereco: ${item.city || "vazio"}
telefone: ${item.contact_phone || "vazio"}
website: ${item.website_url || "vazio"}
verification_status: ${item.verification_status || "pending"}
verification_score: ${item.verification_score || 0}
verification: ${JSON.stringify(item.metadata?.verification || {})}
rating: ${item.rating || "vazio"}
url: ${item.source_url || "vazio"}
`
  )
  .join("\n")}
`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: "Voce e um analista criterioso de prospeccao B2B. Retorne apenas JSON valido.",
          },
        ],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 6000,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini retornou HTTP ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return extractJsonArray(text);
}

async function analyzeBatchSafely(config, batch) {
  try {
    return await analyzeBatch(config, batch);
  } catch (error) {
    if (batch.length > 1 && shouldRetryWithSmallerBatch(error)) {
      console.warn(`[gemini] ${error.message}. Tentando lotes menores...`);
      const middle = Math.ceil(batch.length / 2);
      const left = await analyzeBatchSafely(config, batch.slice(0, middle));
      const right = await analyzeBatchSafely(config, batch.slice(middle));
      return [...left, ...right];
    }

    console.warn(`[gemini] ${error.message}. Usando fallback local para ${batch.length} candidato(s).`);
    return fallbackAnalyzeBatch(batch, error);
  }
}

async function analyzeCandidates(config, candidates) {
  const byId = new Map(candidates.map((candidate) => [candidate.source_id, candidate]));
  const approved = [];

  for (const batch of chunk(candidates, config.geminiBatchSize)) {
    const analysis = await analyzeBatchSafely(config, batch);
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
          ...original.metadata,
          reason: item.reason || "",
          analyzed_at: new Date().toISOString(),
          model: config.geminiModel,
        },
      });
    }
  }

  return approved.sort((a, b) => b.score - a.score || b.urgency - a.urgency);
}

async function fetchExistingHashes(config, hashes) {
  if (config.dryRun || hashes.length === 0) return new Set();
  const existing = new Set();

  for (const batch of chunk([...new Set(hashes)].filter(Boolean), 80)) {
    const filter = batch.join(",");
    const rows = await supabaseRequest(
      config,
      `leads?select=lead_hash&lead_hash=in.(${encodeURIComponent(filter)})`
    );
    for (const row of rows || []) existing.add(row.lead_hash);
  }

  return existing;
}

async function upsertLeads(config, leads) {
  if (leads.length === 0) return [];
  if (config.dryRun) return leads;

  const existingHashes = await fetchExistingHashes(
    config,
    leads.map((lead) => lead.lead_hash)
  );
  const filtered = leads.filter((lead) => !lead.lead_hash || !existingHashes.has(lead.lead_hash));

  if (filtered.length === 0) return [];

  const endpoint = "leads?on_conflict=source,source_id";
  const saved = await supabaseRequest(config, endpoint, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify(filtered),
  });

  return saved || [];
}

async function fetchLeadsForVerification(config) {
  const rows = await supabaseRequest(
    config,
    `leads?select=*&order=created_at.desc&limit=${config.verifyLimit}&or=(verification_status.eq.pending,verified_at.is.null)`
  );
  return rows || [];
}

async function updateVerifiedLeads(config, leads) {
  if (config.dryRun || leads.length === 0) return leads;
  const updated = [];

  for (const lead of leads) {
    const fields = {
      verification_status: lead.verification_status,
      verification_score: lead.verification_score,
      verified_at: lead.verified_at,
      score: lead.score,
      urgency: lead.urgency,
      metadata: lead.metadata,
    };
    const rows = await supabaseRequest(config, `leads?id=eq.${lead.id}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify(fields),
    });
    if (rows?.[0]) updated.push(rows[0]);
    await sleep(150);
  }

  return updated;
}

async function notifyDiscord(config, leads) {
  if (!config.discordWebhookUrl || config.dryRun || leads.length === 0) return;

  for (const lead of leads.slice(0, 8)) {
    const response = await fetch(config.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Guerrilla Miner",
        embeds: [
          {
            title: lead.title || lead.company_name || "Lead qualificado",
            url: lead.source_url,
            color: lead.urgency >= 4 ? 10_029_568 : 3_032_325,
            description: truncate(lead.pain_point || lead.content || "", 240),
            fields: [
              { name: "Score", value: String(lead.score), inline: true },
              { name: "Urgencia", value: `${lead.urgency}/5`, inline: true },
              { name: "Fonte", value: lead.source || "vazio", inline: true },
              { name: "Angulo", value: truncate(lead.offer_angle || "vazio", 180), inline: false },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(`[discord] webhook retornou HTTP ${response.status}`);
    }
    await sleep(400);
  }
}

async function collectBySource(config, source) {
  if (source === "reddit") return collectRedditCandidates(config);
  if (source === "osm") return collectOsmCandidates(config);
  if (source === "maps") return collectMapsCandidates(config);
  if (source === "csv") return readCsvCandidates(config.csvInput);
  if (source === "verify") return fetchLeadsForVerification(config);
  throw new Error(`Fonte desconhecida: ${source}`);
}

async function runSource(config, source) {
  const run = await createRun(config, source, {
    source,
    dry_run: config.dryRun,
    started_by: "node",
  });

  try {
    if (source === "verify") {
      console.log("\n[verify] Buscando leads pendentes de verificacao...");
      const leads = await fetchLeadsForVerification(config);
      console.log(`[verify] Leads para verificar: ${leads.length}`);
      const verified = await verifyCandidates(config, leads);
      const updated = await updateVerifiedLeads(config, verified);
      console.log(`[verify] Leads atualizados: ${updated.length}`);
      await finishRun(config, run, {
        status: "success",
        collected: leads.length,
        approved: verified.filter((lead) => ["weak", "failed"].includes(lead.verification_status)).length,
        saved: updated.length,
        metadata: { verification_only: true },
      });
      return updated;
    }

    console.log(`\n[${source}] Coletando candidatos...`);
    let candidates = await collectBySource(config, source);
    if (source === "osm" && config.verifyAfterOsm) {
      console.log(`[${source}] Verificando presenca digital dos candidatos...`);
      candidates = await verifyCandidates(config, candidates);
    }
    if (source === "maps" && config.verifyAfterMaps) {
      console.log(`[${source}] Verificando presenca digital dos candidatos...`);
      candidates = await verifyCandidates(config, candidates);
    }
    console.log(`[${source}] Candidatos coletados: ${candidates.length}`);

    if (candidates.length === 0) {
      await finishRun(config, run, {
        status: "success",
        collected: 0,
        approved: 0,
        saved: 0,
      });
      return [];
    }

    const approved = await analyzeCandidates(config, candidates);
    console.log(`[${source}] Leads aprovados pelo Gemini: ${approved.length}`);

    const saved = await upsertLeads(config, approved);
    console.log(`[${source}] Leads salvos no Supabase: ${saved.length}`);

    if (config.dryRun) {
      console.log(JSON.stringify(approved.slice(0, 10), null, 2));
    }

    await notifyDiscord(config, saved);
    await finishRun(config, run, {
      status: "success",
      collected: candidates.length,
      approved: approved.length,
      saved: saved.length,
      metadata: {
        dry_run: config.dryRun,
        skipped_by_hash: Math.max(0, approved.length - saved.length),
      },
    });

    return saved;
  } catch (error) {
    await finishRun(config, run, {
      status: "error",
      errors: [{ message: error.message, at: new Date().toISOString() }],
    }).catch((finishError) => console.warn(`[runs] ${finishError.message}`));
    throw error;
  }
}

async function main() {
  loadEnv();
  let config = getConfig();

  if (config.checkOnly) {
    printConfigStatus(config);
    return;
  }

  validateConfig(config);
  config = await applyRemoteSettings(config);

  const requested = requestedSources(config);
  const sources = runtimeSources(config);
  console.log("Guerrilla Miner iniciado.");
  console.log(`Fontes solicitadas: ${requested.join(", ")}`);
  console.log(`Fontes ativas: ${sources.join(", ") || "nenhuma"}`);
  if (requested.includes("reddit")) {
    console.log(
      `Reddit OAuth: ${
        hasRedditOAuth(config)
          ? "configurado"
          : "nao configurado; crie REDDIT_CLIENT_ID e REDDIT_CLIENT_SECRET nos GitHub Secrets"
      }`
    );
  }
  if (requested.includes("reddit") && !sources.includes("reddit")) {
    console.warn(
      "[reddit] Pulado no GitHub Actions ate REDDIT_CLIENT_ID e REDDIT_CLIENT_SECRET serem configurados."
    );
  }
  if (sources.length === 0) {
    console.log("Nenhuma fonte ativa para executar.");
    return;
  }

  const allSaved = [];
  for (const source of sources) {
    const saved = await runSource(config, source);
    allSaved.push(...saved);
  }

  console.log(`\nMineracao finalizada. Leads salvos: ${allSaved.length}`);
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
