import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDot,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Flame,
  Gauge,
  History,
  Inbox,
  Loader2,
  MapPin,
  MessageCircle,
  NotebookPen,
  Phone,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Upload,
  User,
  Wand2,
  X,
  XCircle,
} from "lucide-react";

const STATUS = {
  pendente: { label: "Pendente", Icon: CircleDot, tone: "amber" },
  abordado: { label: "Abordado", Icon: MessageCircle, tone: "blue" },
  fechado: { label: "Fechado", Icon: CheckCircle2, tone: "green" },
  descartado: { label: "Descartado", Icon: XCircle, tone: "red" },
};

const SETTING_KEYS = {
  reddit_subreddits: "Subreddits",
  reddit_keywords: "Keywords Reddit",
  osm_places: "Locais OSM",
  osm_categories: "Categorias OSM",
  maps_queries: "Consultas Google opcionais",
};

const SAMPLE_RUNS = [
  {
    id: "run-demo-1",
    started_at: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    finished_at: new Date(Date.now() - 1000 * 60 * 31).toISOString(),
    source: "reddit",
    status: "success",
    collected: 42,
    approved: 7,
    saved: 5,
  },
  {
    id: "run-demo-2",
    started_at: new Date(Date.now() - 1000 * 60 * 60 * 7).toISOString(),
    finished_at: new Date(Date.now() - 1000 * 60 * 60 * 7 + 1000 * 140).toISOString(),
    source: "google_maps",
    status: "success",
    collected: 23,
    approved: 9,
    saved: 8,
  },
];

const SAMPLE_SETTINGS = {
  reddit_subreddits: [
    "empreendedorismo",
    "marketingdigital",
    "brdev",
    "programacao",
    "PequenosNegocios",
  ],
  reddit_keywords: [
    "preciso de um site",
    "landing page nao converte",
    "sistema travou",
    "automatizar atendimento",
  ],
  maps_queries: [
    "barbearia sem site em Ponta Grossa PR",
    "clinica de estetica sem site em Ponta Grossa PR",
    "restaurante baixa avaliacao em Ponta Grossa PR",
  ],
  osm_places: ["Ponta Grossa, PR, Brazil"],
  osm_categories: [
    "barbearia",
    "clinica de estetica",
    "restaurante",
    "academia",
    "pet shop",
    "auto center",
    "odontologia",
    "imobiliaria",
  ],
};

const SAMPLE_LEADS = [
  {
    id: "demo-1",
    created_at: new Date().toISOString(),
    source: "reddit",
    source_id: "demo-empreendedor-01",
    source_url: "https://www.reddit.com/r/empreendedorismo/",
    author: "fundador_local",
    title: "Preciso organizar os pedidos antes de abrir a segunda unidade",
    content:
      "Tenho uma confeitaria pequena, os pedidos chegam por WhatsApp e Instagram e a equipe esta se perdendo nas entregas.",
    subreddit: "empreendedorismo",
    niche: "confeitaria",
    intent: "Organizar pedidos e reduzir perda operacional",
    pain_point: "Atendimento disperso em canais diferentes",
    offer_angle: "Fluxo simples para registrar pedidos, status e retorno ao cliente.",
    urgency: 5,
    score: 92,
    contact_hint: "Responder no topico e pedir permissao para enviar uma ideia objetiva.",
    opener:
      "Vi seu comentario sobre pedidos chegando por varios canais. Parece aquele ponto em que a demanda cresceu mais rapido que o controle interno. O que hoje mais toma tempo da equipe nesse fluxo?",
    notes: "Prioridade alta. Dor operacional clara.",
    verification_status: "skipped",
    verification_score: 0,
    status: "pendente",
    metadata: { reason: "dor operacional clara e prazo implicito" },
  },
  {
    id: "demo-2",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    source: "google_maps",
    source_id: "demo-maps-02",
    source_url: "https://maps.google.com/",
    company_name: "Clinica Exemplo",
    title: "Clinica Exemplo",
    content:
      "Empresa local encontrada no Google Maps. Sinais: sem website cadastrado; avaliacao 3.5; 41 reviews.",
    city: "Ponta Grossa PR",
    contact_phone: "(42) 99999-0000",
    rating: 3.5,
    review_count: 41,
    niche: "clinica de estetica",
    intent: "Melhorar captacao local e reputacao",
    pain_point: "Baixa avaliacao e ausencia de site proprio",
    offer_angle: "Diagnostico simples de presenca digital local e captura de contatos.",
    urgency: 4,
    score: 86,
    contact_hint: "Ligar em horario comercial citando melhoria de experiencia do cliente.",
    notes: "",
    verification_status: "weak",
    verification_score: 88,
    verified_at: new Date().toISOString(),
    status: "abordado",
    metadata: {
      reason: "sinal local forte",
      verification: {
        status: "weak",
        reason: "sem website cadastrado",
        weak_signals: ["sem website cadastrado"],
      },
    },
  },
];

function getRuntimeConfig() {
  const env = import.meta.env || {};
  const url = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  return {
    url,
    anonKey: env.VITE_SUPABASE_ANON_KEY || "",
    geminiKey: env.VITE_GEMINI_API_KEY || "",
    geminiModel: env.VITE_GEMINI_MODEL || "gemini-2.5-flash",
    minerFunctionUrl: env.VITE_RUN_MINER_URL || (url ? `${url}/functions/v1/run-miner` : ""),
  };
}

function buildHeaders(config, prefer) {
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function supabaseFetch(config, path, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...buildHeaders(config, options.prefer),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase retornou HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchLeads(config) {
  return supabaseFetch(
    config,
    "leads?select=*&order=urgency.desc,score.desc,created_at.desc&limit=250"
  );
}

async function fetchRuns(config) {
  return supabaseFetch(
    config,
    "miner_runs?select=*&order=started_at.desc&limit=10"
  );
}

async function fetchSettings(config) {
  const rows = await supabaseFetch(config, "miner_settings?select=key,value&order=key.asc");
  return Object.fromEntries((rows || []).map((row) => [row.key, row.value]));
}

async function upsertSetting(config, key, value) {
  return supabaseFetch(config, "miner_settings?on_conflict=key", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify([{ key, value }]),
  });
}

async function patchLead(config, id, fields) {
  return supabaseFetch(config, `leads?id=eq.${id}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify(fields),
  });
}

async function insertLeadEvent(config, event) {
  return supabaseFetch(config, "lead_events", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify([event]),
  });
}

async function fetchLeadEvents(config, leadId) {
  return supabaseFetch(
    config,
    `lead_events?select=*&lead_id=eq.${leadId}&order=created_at.desc&limit=30`
  );
}

async function insertManualLeads(config, leads) {
  return supabaseFetch(config, "leads?on_conflict=source,source_id", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=representation",
    body: JSON.stringify(leads),
  });
}

async function invokeMiner(config, settings) {
  if (!config.minerFunctionUrl) throw new Error("VITE_RUN_MINER_URL nao configurada.");
  const response = await fetch(config.minerFunctionUrl, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: "osm",
      subreddits: settings.reddit_subreddits || SAMPLE_SETTINGS.reddit_subreddits,
      keywords: settings.reddit_keywords || SAMPLE_SETTINGS.reddit_keywords,
      osm_places: settings.osm_places || SAMPLE_SETTINGS.osm_places,
      osm_categories: settings.osm_categories || SAMPLE_SETTINGS.osm_categories,
      limit: 8,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Edge Function retornou HTTP ${response.status}`);
  }
  return data;
}

function normalizeModelPath(model) {
  return model.startsWith("models/") ? model : `models/${model}`;
}

async function callGeminiText(config, systemText, userText, maxOutputTokens = 1200) {
  if (!config.geminiKey) throw new Error("VITE_GEMINI_API_KEY nao configurada.");

  const modelPath = normalizeModelPath(config.geminiModel);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${config.geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens,
        },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Gemini retornou HTTP ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
}

function extractJsonArray(text) {
  const clean = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("Resposta JSON invalida.");
  return JSON.parse(clean.slice(start, end + 1));
}

async function callGeminiJson(config, systemText, userText) {
  const text = await callGeminiText(config, systemText, userText, 5000);
  return extractJsonArray(text);
}

function relativeTime(value) {
  if (!value) return "sem data";
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (abs < 60_000) return "agora";
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

function scoreLabel(score) {
  if (score >= 85) return "Quente";
  if (score >= 70) return "Morno";
  return "Observar";
}

function verificationLabel(status) {
  const labels = {
    pending: "Nao verificado",
    verified: "Site ok",
    weak: "Oportunidade confirmada",
    failed: "Site falhou",
    skipped: "Sem teste",
  };
  return labels[status] || status || "Nao verificado";
}

function initials(name = "") {
  return (
    name
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "L"
  );
}

function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function leadCopy(lead) {
  return [
    `${lead.title || lead.company_name || "Lead sem titulo"} (${lead.source || "fonte"})`,
    lead.source_url,
    `Dor: ${lead.pain_point || lead.content || "nao informada"}`,
    `Angulo: ${lead.offer_angle || "diagnostico consultivo"}`,
    lead.opener ? `Opener: ${lead.opener}` : "",
    `Urgencia: ${lead.urgency || 1}/5 | Score: ${lead.score || 0}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseList(text) {
  return text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToText(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function parseImportText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      const company = parts[0] || `Lead manual ${index + 1}`;
      const content = parts[1] || parts[0] || "";
      const phone = parts[2] || "";
      const sourceUrl = parts[3] || "";
      const niche = parts[4] || "";
      const city = parts[5] || "";
      const seed = [company, content, phone, city].join("|");

      return {
        source: "manual",
        source_id: `manual-${simpleHash(seed)}-${index}`,
        lead_hash: simpleHash(seed),
        company_name: company,
        title: company,
        content: content || "Lead importado manualmente.",
        contact_phone: phone,
        source_url: sourceUrl,
        niche,
        city,
        status: "pendente",
        metadata: { imported_from: "dashboard", row_index: index + 1 },
      };
    });
}

function heuristicQualify(lead) {
  const text = `${lead.company_name} ${lead.content} ${lead.niche}`.toLowerCase();
  const hotTerms = ["preciso", "orcamento", "sem site", "travou", "perdendo", "urgente"];
  const score = hotTerms.reduce((sum, term) => sum + (text.includes(term) ? 12 : 0), 58);
  return {
    ...lead,
    score: Math.min(94, score),
    urgency: score >= 80 ? 4 : 3,
    intent: "Oportunidade importada manualmente",
    pain_point: lead.content,
    offer_angle: "Abrir conversa com diagnostico curto e uma melhoria objetiva.",
    contact_hint: lead.contact_phone ? "Chamar pelo telefone informado." : "Abordar pela origem informada.",
  };
}

function Metric({ label, value, Icon }) {
  return (
    <div className="metric-tile">
      <div className="metric-icon">
        <Icon size={18} strokeWidth={2.2} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function StatusButton({ status, active, count, onClick }) {
  const item = STATUS[status];
  const Icon = item.Icon;

  return (
    <button
      className={`status-chip ${active ? "is-active" : ""}`}
      onClick={onClick}
      type="button"
      title={`Filtrar por ${item.label}`}
    >
      <Icon size={15} />
      <span>{item.label}</span>
      <b>{count}</b>
    </button>
  );
}

function RunHistory({ runs }) {
  return (
    <section className="side-panel">
      <div className="panel-title">
        <History size={17} />
        <strong>Miner runs</strong>
      </div>
      <div className="run-list">
        {runs.map((run) => (
          <div className="run-item" key={run.id}>
            <div>
              <b>{run.source}</b>
              <span>{relativeTime(run.started_at)}</span>
            </div>
            <div className={`run-status ${run.status}`}>{run.status}</div>
            <p>
              {run.collected} coletados / {run.approved} aprovados / {run.saved} salvos
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsPanel({ settings, onSave, saving }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(Object.entries(SETTING_KEYS).map(([key]) => [key, listToText(settings[key])]))
  );

  useEffect(() => {
    setDraft(Object.fromEntries(Object.entries(SETTING_KEYS).map(([key]) => [key, listToText(settings[key])])));
  }, [settings]);

  return (
    <section className="side-panel settings-panel">
      <div className="panel-title">
        <Settings size={17} />
        <strong>Settings</strong>
      </div>

      {Object.entries(SETTING_KEYS).map(([key, label]) => (
        <label className="field-stack" key={key}>
          <span>{label}</span>
          <textarea
            value={draft[key] || ""}
            onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
            rows={5}
          />
        </label>
      ))}

      <button
        className="primary-action full"
        type="button"
        disabled={saving}
        onClick={() => onSave(Object.fromEntries(Object.keys(SETTING_KEYS).map((key) => [key, parseList(draft[key] || "")])))}
      >
        {saving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
        <span>{saving ? "Salvando" : "Salvar settings"}</span>
      </button>
    </section>
  );
}

function ImportPanel({ open, text, setText, onImport, busy, onClose }) {
  if (!open) return null;

  return (
    <section className="import-panel">
      <div className="modal-head">
        <div>
          <p className="eyebrow">Import manual</p>
          <h2>Colar leads</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} title="Fechar">
          <X size={18} />
        </button>
      </div>

      <p className="muted">
        Use uma linha por lead: Empresa | dor/contexto | telefone | url | nicho | cidade.
      </p>
      <textarea
        className="import-textarea"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Clinica Alfa | nao tem site e recebe tudo por WhatsApp | 42 99999-9999 | https://... | estetica | Ponta Grossa"
        rows={9}
      />
      <button className="primary-action full" type="button" disabled={busy || !text.trim()} onClick={onImport}>
        {busy ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
        <span>{busy ? "Importando" : "Qualificar e salvar"}</span>
      </button>
    </section>
  );
}

function LeadCard({ lead, configured, onStatus, onCopy, copiedId, onDetails, onOpener, openerBusy }) {
  const status = STATUS[lead.status] || STATUS.pendente;
  const StatusIcon = status.Icon;
  const score = Number(lead.score || 0);
  const urgency = Number(lead.urgency || 1);

  return (
    <article className="lead-card">
      <div className="lead-main">
        <div className="lead-avatar">{initials(lead.author || lead.company_name || lead.niche || lead.title)}</div>

        <div className="lead-content">
          <div className="lead-title-row">
            <div>
              <h2>{lead.title || lead.company_name || "Lead sem titulo"}</h2>
              <div className="lead-meta">
                <span>{lead.source || "fonte"}</span>
                {lead.subreddit && <span>r/{lead.subreddit}</span>}
                {lead.city && <span>{lead.city}</span>}
                {lead.author && <span>@{lead.author}</span>}
                <span>{relativeTime(lead.created_at)}</span>
              </div>
            </div>

            <span className={`status-badge tone-${status.tone}`}>
              <StatusIcon size={14} />
              {status.label}
            </span>
          </div>

          <p className="lead-excerpt">{lead.content || lead.pain_point || "Sem contexto salvo."}</p>

          <div className="signal-row">
            <div className="signal-item">
              <Gauge size={16} />
              <span>{scoreLabel(score)}</span>
              <strong>{score || 0}</strong>
            </div>
            <div className="signal-item">
              <Flame size={16} />
              <span>Urgencia</span>
              <strong>{urgency}/5</strong>
            </div>
            <div className="signal-item wide">
              <User size={16} />
              <span>{lead.niche || "nicho aberto"}</span>
            </div>
            {lead.rating && (
              <div className="signal-item">
                <MapPin size={16} />
                <span>Rating</span>
                <strong>{lead.rating}</strong>
              </div>
            )}
            {lead.verification_status && lead.verification_status !== "pending" && (
              <div className={`signal-item verify-${lead.verification_status}`}>
                <CheckCircle2 size={16} />
                <span>{verificationLabel(lead.verification_status)}</span>
                <strong>{lead.verification_score || 0}</strong>
              </div>
            )}
          </div>

          {(lead.intent || lead.pain_point || lead.offer_angle) && (
            <div className="lead-brief">
              {lead.intent && (
                <p>
                  <b>Intencao:</b> {lead.intent}
                </p>
              )}
              {lead.pain_point && (
                <p>
                  <b>Dor:</b> {lead.pain_point}
                </p>
              )}
              {lead.offer_angle && (
                <p>
                  <b>Angulo:</b> {lead.offer_angle}
                </p>
              )}
            </div>
          )}

          {lead.opener && (
            <div className="opener-box">
              <Wand2 size={16} />
              <span>{lead.opener}</span>
            </div>
          )}

          {(lead.contact_hint || lead.contact_phone) && (
            <div className="contact-hint">
              <Phone size={16} />
              <span>{lead.contact_phone || lead.contact_hint}</span>
            </div>
          )}
        </div>
      </div>

      <div className="lead-actions">
        <div className="status-actions" aria-label="Atualizar status">
          {Object.keys(STATUS).map((key) => {
            const item = STATUS[key];
            const Icon = item.Icon;
            return (
              <button
                key={key}
                type="button"
                className={lead.status === key ? "is-selected" : ""}
                onClick={() => onStatus(lead, key)}
                disabled={!configured && !lead.id.startsWith("demo-")}
                title={`Marcar como ${item.label}`}
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="quick-actions">
          <button type="button" onClick={() => onOpener(lead)} disabled={openerBusy === lead.id} title="Gerar opener">
            {openerBusy === lead.id ? <Loader2 className="spin" size={16} /> : <Bot size={16} />}
            <span>Opener</span>
          </button>
          <button type="button" onClick={() => onDetails(lead)} title="Detalhes">
            <FileText size={16} />
            <span>Detalhes</span>
          </button>
          <button type="button" onClick={() => onCopy(lead)} title="Copiar resumo">
            <Copy size={16} />
            <span>{copiedId === lead.id ? "Copiado" : "Copiar"}</span>
          </button>

          {lead.source_url && (
            <a href={lead.source_url} target="_blank" rel="noreferrer" title="Abrir origem">
              <ExternalLink size={16} />
              <span>Origem</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function LeadDrawer({ lead, events, notesDraft, setNotesDraft, onSaveNotes, onClose, savingNotes }) {
  if (!lead) return null;

  return (
    <aside className="drawer">
      <div className="drawer-card">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Lead detail</p>
            <h2>{lead.title || lead.company_name || "Lead"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="detail-grid">
          <div>
            <span>Fonte</span>
            <b>{lead.source || "vazio"}</b>
          </div>
          <div>
            <span>Score</span>
            <b>{lead.score || 0}</b>
          </div>
          <div>
            <span>Urgencia</span>
            <b>{lead.urgency || 1}/5</b>
          </div>
          <div>
            <span>Status</span>
            <b>{STATUS[lead.status]?.label || lead.status}</b>
          </div>
          <div>
            <span>Verificacao</span>
            <b>{verificationLabel(lead.verification_status)}</b>
          </div>
          <div>
            <span>Score tecnico</span>
            <b>{lead.verification_score || 0}</b>
          </div>
          <div>
            <span>Site</span>
            <b>{lead.website_url ? "informado" : "ausente"}</b>
          </div>
          <div>
            <span>Verificado</span>
            <b>{lead.verified_at ? relativeTime(lead.verified_at) : "pendente"}</b>
          </div>
        </div>

        <section className="drawer-section">
          <h3>Contexto</h3>
          <p>{lead.content || "Sem contexto salvo."}</p>
          {lead.metadata?.reason && <p><b>Motivo:</b> {lead.metadata.reason}</p>}
          {lead.metadata?.verification && (
            <div className="verification-detail">
              <b>Verificacao tecnica</b>
              {lead.metadata.verification.reason && <p>{lead.metadata.verification.reason}</p>}
              {lead.metadata.verification.http_status && (
                <p>HTTP {lead.metadata.verification.http_status}</p>
              )}
              {lead.metadata.verification.title && <p>Title: {lead.metadata.verification.title}</p>}
              {Array.isArray(lead.metadata.verification.weak_signals) &&
                lead.metadata.verification.weak_signals.length > 0 && (
                  <p>Sinais: {lead.metadata.verification.weak_signals.join(", ")}</p>
                )}
              {Array.isArray(lead.metadata.verification.social_links) &&
                lead.metadata.verification.social_links.length > 0 && (
                  <p>Redes: {lead.metadata.verification.social_links.join(", ")}</p>
                )}
            </div>
          )}
          {lead.source_url && (
            <a className="text-link" href={lead.source_url} target="_blank" rel="noreferrer">
              Abrir origem
            </a>
          )}
        </section>

        <section className="drawer-section">
          <h3>Notas internas</h3>
          <textarea value={notesDraft} onChange={(event) => setNotesDraft(event.target.value)} rows={5} />
          <button className="primary-action full" type="button" onClick={onSaveNotes} disabled={savingNotes}>
            {savingNotes ? <Loader2 className="spin" size={17} /> : <NotebookPen size={17} />}
            <span>{savingNotes ? "Salvando" : "Salvar notas"}</span>
          </button>
        </section>

        <section className="drawer-section">
          <h3>Historico</h3>
          <div className="event-list">
            {events.length === 0 ? (
              <p className="muted">Nenhum evento ainda.</p>
            ) : (
              events.map((event) => (
                <div className="event-item" key={event.id}>
                  <b>{event.event_type}</b>
                  <span>{relativeTime(event.created_at)}</span>
                  {event.note && <p>{event.note}</p>}
                  {event.to_status && <p>{event.from_status || "vazio"} {"->"} {event.to_status}</p>}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

export default function LeadMiner() {
  const config = useMemo(getRuntimeConfig, []);
  const configured = Boolean(config.url && config.anonKey);
  const [leads, setLeads] = useState(() => (configured ? [] : SAMPLE_LEADS));
  const [runs, setRuns] = useState(() => (configured ? [] : SAMPLE_RUNS));
  const [settings, setSettings] = useState(() => SAMPLE_SETTINGS);
  const [loading, setLoading] = useState(configured);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [copiedId, setCopiedId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [events, setEvents] = useState([]);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [openerBusy, setOpenerBusy] = useState("");
  const [miningNow, setMiningNow] = useState(false);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedId) || null,
    [leads, selectedId]
  );

  const load = useCallback(
    async (silent = false) => {
      if (!configured) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const [leadRows, runRows, settingRows] = await Promise.all([
          fetchLeads(config),
          fetchRuns(config),
          fetchSettings(config),
        ]);
        setLeads(leadRows || []);
        setRuns(runRows || []);
        setSettings({ ...SAMPLE_SETTINGS, ...settingRows });
      } catch (err) {
        setError(err.message || "Nao foi possivel carregar os dados.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [config, configured]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    if (!selectedLead) return;
    setNotesDraft(selectedLead.notes || "");
  }, [selectedLead]);

  const openDetails = async (lead) => {
    setSelectedId(lead.id);
    setNotesDraft(lead.notes || "");
    if (!configured || lead.id.startsWith("demo-")) {
      setEvents([]);
      return;
    }
    try {
      const rows = await fetchLeadEvents(config, lead.id);
      setEvents(rows || []);
    } catch (err) {
      setError(err.message || "Nao foi possivel carregar historico.");
    }
  };

  const filteredLeads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      const statusMatch = statusFilter === "todos" || lead.status === statusFilter;
      if (!statusMatch) return false;
      if (!needle) return true;

      return [
        lead.title,
        lead.content,
        lead.author,
        lead.company_name,
        lead.city,
        lead.niche,
        lead.intent,
        lead.pain_point,
        lead.offer_angle,
        lead.subreddit,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [leads, query, statusFilter]);

  const counts = useMemo(() => {
    const base = Object.fromEntries(Object.keys(STATUS).map((key) => [key, 0]));
    for (const lead of leads) {
      if (base[lead.status] !== undefined) base[lead.status] += 1;
    }
    return base;
  }, [leads]);

  const hotCount = leads.filter((lead) => Number(lead.score || 0) >= 85).length;
  const avgScore =
    leads.length === 0
      ? 0
      : Math.round(leads.reduce((sum, lead) => sum + Number(lead.score || 0), 0) / leads.length);

  const updateStatus = async (lead, status) => {
    const previous = leads;
    setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, status } : item)));

    if (!configured || lead.id.startsWith("demo-")) return;

    try {
      await patchLead(config, lead.id, { status });
      await insertLeadEvent(config, {
        lead_id: lead.id,
        event_type: "status_changed",
        from_status: lead.status,
        to_status: status,
      });
      if (selectedId === lead.id) setEvents(await fetchLeadEvents(config, lead.id));
    } catch (err) {
      setLeads(previous);
      setError(err.message || "Nao foi possivel atualizar o status.");
    }
  };

  const copy = async (lead) => {
    try {
      await navigator.clipboard.writeText(leadCopy(lead));
      setCopiedId(lead.id);
      window.setTimeout(() => setCopiedId(""), 1600);
    } catch {
      setError("O navegador bloqueou a copia para a area de transferencia.");
    }
  };

  const generateOpener = async (lead) => {
    setOpenerBusy(lead.id);
    setError("");
    try {
      const opener = await callGeminiText(
        config,
        "Voce escreve openers consultivos B2B em portugues. Maximo 4 linhas, sem soar como spam, sem prometer resultado e terminando com uma pergunta simples.",
        `Lead: ${lead.title || lead.company_name}\nFonte: ${lead.source}\nDor: ${lead.pain_point || lead.content}\nIntencao: ${lead.intent || "vazio"}\nAngulo: ${lead.offer_angle || "vazio"}`
      );
      const clean = opener.trim();
      setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, opener: clean } : item)));
      if (configured && !lead.id.startsWith("demo-")) {
        await patchLead(config, lead.id, { opener: clean });
        await insertLeadEvent(config, {
          lead_id: lead.id,
          event_type: "opener_generated",
          note: clean,
        });
      }
      setNotice("Opener gerado.");
    } catch (err) {
      setError(err.message || "Nao foi possivel gerar o opener.");
    } finally {
      setOpenerBusy("");
    }
  };

  const saveNotes = async () => {
    if (!selectedLead) return;
    setSavingNotes(true);
    const previous = leads;
    setLeads((current) =>
      current.map((lead) => (lead.id === selectedLead.id ? { ...lead, notes: notesDraft } : lead))
    );

    if (!configured || selectedLead.id.startsWith("demo-")) {
      setSavingNotes(false);
      return;
    }

    try {
      await patchLead(config, selectedLead.id, { notes: notesDraft });
      await insertLeadEvent(config, {
        lead_id: selectedLead.id,
        event_type: "note_saved",
        note: notesDraft,
      });
      setEvents(await fetchLeadEvents(config, selectedLead.id));
    } catch (err) {
      setLeads(previous);
      setError(err.message || "Nao foi possivel salvar notas.");
    } finally {
      setSavingNotes(false);
    }
  };

  const saveSettings = async (nextSettings) => {
    setSavingSettings(true);
    setError("");
    try {
      if (configured) {
        await Promise.all(
          Object.entries(nextSettings).map(([key, value]) => upsertSetting(config, key, value))
        );
      }
      setSettings((current) => ({ ...current, ...nextSettings }));
      setNotice("Settings salvos.");
    } catch (err) {
      setError(err.message || "Nao foi possivel salvar settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const qualifyManualLeads = async (rawLeads) => {
    if (!config.geminiKey) return rawLeads.map(heuristicQualify);

    const result = await callGeminiJson(
      config,
      "Voce qualifica leads B2B importados manualmente. Retorne apenas JSON valido.",
      `Analise os leads e retorne array JSON com source_id, approved, urgency, score, niche, intent, pain_point, offer_angle, contact_hint.\n${JSON.stringify(rawLeads, null, 2)}`
    );

    const byId = new Map(result.map((item) => [item.source_id, item]));
    return rawLeads
      .map((lead) => {
        const item = byId.get(lead.source_id);
        if (!item || item.approved === false) return null;
        return {
          ...lead,
          urgency: Math.max(1, Math.min(5, Number(item.urgency || 2))),
          score: Math.max(0, Math.min(100, Number(item.score || 60))),
          niche: item.niche || lead.niche,
          intent: item.intent || "",
          pain_point: item.pain_point || lead.content,
          offer_angle: item.offer_angle || "",
          contact_hint: item.contact_hint || "",
        };
      })
      .filter(Boolean);
  };

  const importLeads = async () => {
    setImportBusy(true);
    setError("");
    try {
      const raw = parseImportText(importText);
      const qualified = await qualifyManualLeads(raw);
      if (qualified.length === 0) throw new Error("Nenhum lead aprovado na importacao.");

      if (configured) {
        const saved = await insertManualLeads(config, qualified);
        setLeads((current) => [...(saved || []), ...current]);
        setNotice(`${saved?.length || 0} leads importados.`);
      } else {
        const local = qualified.map((lead) => ({
          ...lead,
          id: `demo-${lead.source_id}`,
          created_at: new Date().toISOString(),
        }));
        setLeads((current) => [...local, ...current]);
        setNotice(`${local.length} leads importados no modo demo.`);
      }
      setImportText("");
      setImportOpen(false);
    } catch (err) {
      setError(err.message || "Nao foi possivel importar.");
    } finally {
      setImportBusy(false);
    }
  };

  const runMinerNow = async () => {
    setMiningNow(true);
    setError("");
    try {
      const result = await invokeMiner(config, settings);
      setNotice(
        `Mineracao finalizada: ${result.collected || 0} coletados, ${result.approved || 0} aprovados, ${result.saved || 0} salvos.`
      );
      await load(true);
    } catch (err) {
      setError(
        `${err.message || "Nao foi possivel minerar agora."} Confira se a Edge Function run-miner foi publicada e se os secrets foram configurados no Supabase.`
      );
    } finally {
      setMiningNow(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Guerrilla Miner</p>
          <h1>QG de leads qualificados</h1>
        </div>

        <div className="top-actions">
          <button
            className="primary-action mine-action"
            type="button"
            onClick={runMinerNow}
            disabled={!configured || miningNow}
            title="Buscar leads agora"
          >
            {miningNow ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            <span>{miningNow ? "Minerando" : "Minerar agora"}</span>
          </button>
          <button className="secondary-action" type="button" onClick={() => setImportOpen(true)} title="Importar leads">
            <Upload size={18} />
            <span>Importar</span>
          </button>
          <button
            className="primary-action"
            type="button"
            onClick={() => load(true)}
            disabled={!configured || loading || refreshing}
            title="Atualizar leads"
          >
            {refreshing ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            <span>{refreshing ? "Atualizando" : "Atualizar"}</span>
          </button>
        </div>
      </section>

      {!configured && (
        <section className="setup-strip">
          <AlertTriangle size={18} />
          <span>
            Configure <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> no `.env` para
            trocar estes exemplos pelos leads reais.
          </span>
        </section>
      )}

      {!config.geminiKey && (
        <section className="setup-strip subtle">
          <Bot size={18} />
          <span>
            Configure <b>VITE_GEMINI_API_KEY</b> para gerar openers e qualificar importacoes pelo painel.
          </span>
        </section>
      )}

      {error && (
        <section className="error-strip">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </section>
      )}

      {notice && (
        <section className="notice-strip">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")}>ok</button>
        </section>
      )}

      <section className="metrics-grid" aria-label="Resumo">
        <Metric label="Total" value={leads.length} Icon={Database} />
        <Metric label="Quentes" value={hotCount} Icon={Flame} />
        <Metric label="Score medio" value={avgScore} Icon={Gauge} />
        <Metric label="Pendentes" value={counts.pendente} Icon={Inbox} />
      </section>

      <section className="controls-bar">
        <div className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por dor, nicho, autor, cidade ou origem"
          />
        </div>

        <div className="filter-group" aria-label="Filtros por status">
          <button
            className={`status-chip ${statusFilter === "todos" ? "is-active" : ""}`}
            type="button"
            onClick={() => setStatusFilter("todos")}
            title="Mostrar todos"
          >
            <Filter size={15} />
            <span>Todos</span>
            <b>{leads.length}</b>
          </button>
          {Object.keys(STATUS).map((status) => (
            <StatusButton
              key={status}
              status={status}
              count={counts[status]}
              active={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            />
          ))}
        </div>
      </section>

      <div className="workspace-grid">
        <section>
          {loading ? (
            <section className="empty-state">
              <Loader2 className="spin" size={22} />
              <strong>Carregando leads</strong>
            </section>
          ) : filteredLeads.length === 0 ? (
            <section className="empty-state">
              <Send size={22} />
              <strong>Nenhum lead neste recorte</strong>
            </section>
          ) : (
            <section className="leads-list" aria-label="Leads">
              {filteredLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  configured={configured}
                  onStatus={updateStatus}
                  onCopy={copy}
                  copiedId={copiedId}
                  onDetails={openDetails}
                  onOpener={generateOpener}
                  openerBusy={openerBusy}
                />
              ))}
            </section>
          )}
        </section>

        <aside className="sidebar-stack">
          <RunHistory runs={runs} />
          <SettingsPanel settings={settings} onSave={saveSettings} saving={savingSettings} />
        </aside>
      </div>

      <ImportPanel
        open={importOpen}
        text={importText}
        setText={setImportText}
        onImport={importLeads}
        busy={importBusy}
        onClose={() => setImportOpen(false)}
      />

      <LeadDrawer
        lead={selectedLead}
        events={events}
        notesDraft={notesDraft}
        setNotesDraft={setNotesDraft}
        onSaveNotes={saveNotes}
        savingNotes={savingNotes}
        onClose={() => setSelectedId("")}
      />
    </main>
  );
}
