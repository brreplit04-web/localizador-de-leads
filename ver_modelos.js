const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file = ".env") {
  const envPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    if (!process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

async function descobrirModelos() {
  loadEnv();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("Defina GEMINI_API_KEY no .env antes de consultar os modelos.");
    return;
  }

  console.log("Consultando modelos disponiveis para generateContent...\n");

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();

    if (!res.ok) {
      console.error("Erro retornado pelo Google:");
      console.error(data?.error?.message || JSON.stringify(data));
      return;
    }

    const models = (data.models || []).filter((model) =>
      model.supportedGenerationMethods?.includes("generateContent")
    );

    if (models.length === 0) {
      console.log("Nenhum modelo de geracao de texto foi encontrado para essa chave.");
      return;
    }

    for (const model of models) {
      console.log(`Nome: ${model.name.replace("models/", "")}`);
      console.log(`Display: ${model.displayName || "sem nome"}`);
      console.log(`Versao: ${model.version || "sem versao"}`);
      console.log("--------------------------------------------------");
    }
  } catch (erro) {
    console.error("Falha ao conectar com a API:", erro.message);
  }
}

descobrirModelos();
