// ═══════════════════════════════════════════════
// Anichin Web — app.js
// Supabase client + shared utilities
// ═══════════════════════════════════════════════

let supabase = null;

// ─── Init Supabase dari /api/config ───────────────
async function initSupabase() {
  if (supabase) return supabase;
  const res = await fetch("/api/config");
  const { supabaseUrl, supabaseKey } = await res.json();
  supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
  return supabase;
}

// ─── Query helpers ────────────────────────────────
async function db() { return await initSupabase(); }

async function getLatestEpisodes(limit = 24) {
  const s = await db();
  const { data } = await s.from("episodes")
    .select("*, series:series_id(title, thumb, genres, rating, status)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function getOngoingSeries(limit = 30) {
  const s = await db();
  const { data } = await s.from("series")
    .select("*")
    .eq("status", "Ongoing")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function getSeriesBySlug(slug) {
  const s = await db();
  const { data } = await s.from("series")
    .select("*").eq("slug", slug).single();
  return data;
}

async function getEpisodesBySeries(slug) {
  const s = await db();
  const { data } = await s.from("episodes")
    .select("*").eq("series_slug", slug)
    .order("created_at", { ascending: false });
  return data || [];
}

async function getEpisodeByUrl(url) {
  const s = await db();
  const { data } = await s.from("episodes")
    .select("*, series:series_id(*)")
    .eq("url", url).single();
  return data;
}

async function getServers(episodeId) {
  const s = await db();
  const { data } = await s.from("servers")
    .select("*").eq("episode_id", episodeId);
  return data || [];
}

async function getDownloads(episodeId) {
  const s = await db();
  const { data } = await s.from("downloads")
    .select("*").eq("episode_id", episodeId);
  return data || [];
}

async function getSchedule() {
  const s = await db();
  const { data } = await s.from("schedule")
    .select("*, series:series_id(slug)").order("title");
  return data || [];
}

async function searchSeries(keyword) {
  const s = await db();
  const { data } = await s.from("series")
    .select("*")
    .ilike("title", `%${keyword}%`)
    .limit(20);
  return data || [];
}

async function getSeriesByGenre(genre) {
  const s = await db();
  const { data } = await s.from("series")
    .select("*")
    .contains("genres", [genre])
    .order("updated_at", { ascending: false });
  return data || [];
}

async function getComments(episodeUrl) {
  const s = await db();
  const { data } = await s.from("comments")
    .select("*").eq("episode_url", episodeUrl)
    .order("created_at", { ascending: false });
  return data || [];
}

async function postComment(episodeUrl, name, body) {
  const s = await db();
  const { error } = await s.from("comments").insert({ episode_url: episodeUrl, name, body });
  return !error;
}

// ─── HTML Helpers ─────────────────────────────────
function cardHTML(series, ep = null) {
  const statusBadge = series.status === "Ongoing"
    ? `<span class="card-badge badge-ongoing">Ongoing</span>`
    : `<span class="card-badge badge-completed">Tamat</span>`;
  const epBadge = ep
    ? `<span class="card-badge badge-ep" style="top:8px;right:8px">Ep ${ep.ep_num}</span>`
    : "";
  return `
    <div class="card" onclick="goSeries('${series.slug}')">
      <div class="card-thumb">
        <img src="${series.thumb || ''}" alt="${series.title}" loading="lazy"
             onerror="this.src='https://via.placeholder.com/160x228/141428/666680?text=No+Image'">
        ${statusBadge}${epBadge}
      </div>
      <div class="card-info">
        <div class="card-title">${series.title || ''}</div>
        <div class="card-meta">
          <span>${(series.genres || []).slice(0, 2).join(', ')}</span>
          ${series.rating ? `<span class="card-rating">★ ${series.rating}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function epCardHTML(ep) {
  const s = ep.series || {};
  return `
    <div class="card" onclick="goEpisode('${encodeURIComponent(ep.url)}')">
      <div class="card-thumb">
        <img src="${s.thumb || ''}" alt="${ep.title}" loading="lazy"
             onerror="this.src='https://via.placeholder.com/160x228/141428/666680?text=No+Image'">
        ${ep.ep_num ? `<span class="card-badge badge-ep" style="top:8px;right:8px">Ep ${ep.ep_num}</span>` : ''}
      </div>
      <div class="card-info">
        <div class="card-title">${ep.title || s.title || ''}</div>
        <div class="card-meta">
          <span>${timeAgo(ep.created_at)}</span>
          ${s.rating ? `<span class="card-rating">★ ${s.rating}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// ─── Navigation ───────────────────────────────────
function goSeries(slug) {
  window.location.href = `/series.html?slug=${slug}`;
}
function goEpisode(encodedUrl) {
  window.location.href = `/episode.html?url=${encodedUrl}`;
}

// ─── Utils ────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}j lalu`;
  const d = Math.floor(h / 24);
  return `${d}h lalu`;
}

function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

function toast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.classList.add("show"); });
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, 3000);
}

function setLoading(id, show) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = show
    ? `<div class="loader"><div class="spinner"></div> Memuat...</div>`
    : "";
}

// ─── Search overlay ───────────────────────────────
function initSearch() {
  const btn   = document.getElementById("search-btn");
  const close = document.getElementById("search-close");
  const overlay = document.getElementById("search-overlay");
  const input   = document.getElementById("search-input");
  if (!btn || !overlay) return;

  btn.onclick   = () => { overlay.classList.add("open"); input.focus(); };
  close.onclick = () => overlay.classList.remove("open");
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove("open"); };

  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { document.getElementById("search-results").innerHTML = ""; return; }
    timer = setTimeout(() => runSearch(q), 400);
  });
}

async function runSearch(q) {
  const box = document.getElementById("search-results");
  box.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;
  const results = await searchSeries(q);
  if (!results.length) {
    box.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><p>Tidak ada hasil untuk "${q}"</p></div>`;
    return;
  }
  box.innerHTML = results.map((s) => `
    <div onclick="goSeries('${s.slug}')" style="display:flex;gap:10px;align-items:center;
         padding:10px;background:var(--card);border:1px solid var(--border);
         border-radius:var(--radius-sm);margin-bottom:8px;cursor:pointer;transition:all 0.2s;"
         onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">
      <img src="${s.thumb}" style="width:40px;height:56px;object-fit:cover;border-radius:4px" onerror="this.style.display='none'">
      <div>
        <div style="font-weight:700;font-size:0.9rem">${s.title}</div>
        <div style="font-size:0.75rem;color:var(--muted)">${(s.genres||[]).join(', ')} · ${s.status||''}</div>
      </div>
    </div>`).join("");
}

// Set active nav link
document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  document.querySelectorAll(".nav-links a").forEach((a) => {
    if (a.getAttribute("href") === path ||
        (path === "/" && a.getAttribute("href") === "/index.html")) {
      a.classList.add("active");
    }
  });
  initSearch();
});
    
