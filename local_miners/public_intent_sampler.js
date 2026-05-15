const crypto = require("node:crypto");
const fs = require("node:fs");

const TERMS = (process.env.LOCAL_INTENT_TERMS || "preciso,orcamento,site,agenda,automatizar")
  .split(",")
  .map((term) => term.trim().toLowerCase())
  .filter(Boolean);

const URLS = (process.env.LOCAL_INTENT_URLS || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const OUTPUT_FILE = process.env.LOCAL_INTENT_OUTPUT || "local-miner-results.json";
const PUSH_TO_SUPABASE = process.env.LOCAL_PUSH_TO_SUPABASE === "true";
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";

function delay(min = 1400, max = 4200) {
  const wait = Math.floor(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, wait));
}

function hash(parts) {
  return crypto
    .createHash("sha256")
    .update(parts.filter(Boolean).join("|").toLowerCase().replace(/\s+/g, " ").trim())
    .digest("hex");
}

function findSignals(text) {
  const lower = text.toLowerCase();
  return TERMS.filter((term) => lower.includes(term));
}

function toLead(result) {
  const leadHash = hash([result.url, result.title, result.excerpt]);
  return {
    source: "public_page",
    source_id: `public-${leadHash.slice(0, 20)}`,
    lead_hash: leadHash,
    source_url: result.url,
    title: result.title || result.url,
    content: result.excerpt,
    intent: "Sinal publico capturado por Playwright local",
    pain_point: `Termos encontrados: ${result.matches.join(", ")}`,
    offer_angle: "Validar o contexto e abrir conversa com uma observacao especifica.",
    contact_hint: "Usar apenas canais publicos e abordagem contextual.",
    urgency: Math.min(5, 2 + result.matches.length),
    score: Math.min(88, 58 + result.matches.length * 8),
    status: "pendente",
    metadata: {
      found_at: result.found_at,
      matches: result.matches,
      local_runner: "public_intent_sampler",
    },
  };
}

async function pushLeads(leads) {
  if (!PUSH_TO_SUPABASE || leads.length === 0) return [];
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Para LOCAL_PUSH_TO_SUPABASE=true, defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/leads?on_conflict=source,source_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(leads),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase retornou HTTP ${response.status}: ${detail}`);
  }
  return response.json();
}

async function main() {
  if (URLS.length === 0) {
    console.log("Defina LOCAL_INTENT_URLS com paginas publicas separadas por virgula.");
    return;
  }

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.log("Instale Playwright para usar este miner local: npm i -D playwright");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 GuerrillaMiner/1.0",
  });

  const results = [];
  for (const url of URLS) {
    try {
      console.log(`[local] lendo ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await delay();

      const title = await page.title();
      const body = await page.locator("body").innerText({ timeout: 10_000 });
      const matches = findSignals(body);

      if (matches.length) {
        results.push({
          url,
          title,
          matches,
          excerpt: body.replace(/\s+/g, " ").slice(0, 900),
          found_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.warn(`[local] ${url}: ${error.message}`);
    }
  }

  await browser.close();

  const leads = results.map(toLead);
  const saved = await pushLeads(leads);

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        results,
        leads,
        saved_count: saved.length || 0,
      },
      null,
      2
    )
  );

  console.log(`Sinais salvos em ${OUTPUT_FILE}: ${results.length}`);
  if (PUSH_TO_SUPABASE) console.log(`Leads enviados ao Supabase: ${saved.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
