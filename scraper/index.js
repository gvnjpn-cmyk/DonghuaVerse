/**
 * Anichin → Supabase Scraper
 * Dijalankan oleh GitHub Actions tiap 4 jam
 * atau manual: node scraper/index.js
 */

require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");

const BASE = "https://anichin.cafe";

// Gunakan service key agar bisa bypass RLS saat insert
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const http = axios.create({
  timeout: 20000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
    Referer: BASE,
    "Accept-Language": "id-ID,id;q=0.9",
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetch$(url) {
  const res = await http.get(url.startsWith("http") ? url : `${BASE}${url}`);
  return cheerio.load(res.data);
}

// ─── Log helpers ─────────────────────────────────────────────────────────────
const log = (tag, msg) => console.log(`[${new Date().toISOString()}] [${tag}] ${msg}`);
const ok  = (msg) => log("✅ OK", msg);
const err = (msg) => log("❌ ERR", msg);
const inf = (msg) => log("ℹ INFO", msg);

// ─── 1. Homepage → latest episodes ───────────────────────────────────────────
async function scrapeHomepage() {
  inf("Scraping homepage...");
  const $ = await fetch$("/");

  const latestEpisodes = [];

  // Latest release cards
  $(".listupd article, .bsx").each((_, el) => {
    const title = $(el).find("h2, .tt, .ntitle").first().text().trim();
    const url   = $(el).find("a").first().attr("href");
    const ep    = $(el).find(".epx, .sb").first().text().trim();
    const thumb = $(el).find("img").first().attr("src") || $(el).find("img").first().attr("data-src");
    if (title && url) latestEpisodes.push({ title, url, ep, thumb });
  });

  // Ongoing sidebar
  const ongoingSeries = [];
  $(".serieslist li, .bixbox.sidebar .series-list li").each((_, el) => {
    const title = $(el).find("a").first().text().trim();
    const url   = $(el).find("a").first().attr("href");
    const ep    = $(el).find(".ep, .numinf, span").last().text().trim();
    if (title && url && url.includes("/seri/")) {
      ongoingSeries.push({ title, url, ep });
    }
  });

  ok(`Homepage: ${latestEpisodes.length} episode terbaru, ${ongoingSeries.length} ongoing`);
  return { latestEpisodes, ongoingSeries };
}

// ─── 2. Series page ───────────────────────────────────────────────────────────
async function scrapeSeries(slugOrUrl) {
  const url = slugOrUrl.startsWith("http") ? slugOrUrl : `${BASE}/seri/${slugOrUrl}/`;
  const slug = url.replace(/\/$/, "").split("/").pop();

  try {
    const $ = await fetch$(url);

    const title    = $("h1.entry-title, .seriestitle, h1").first().text().trim();
    const thumb    = $(".thumb img, .seriesthumbnail img").first().attr("src") ||
                     $(".thumb img").first().attr("data-src");
    const synopsis = $(".entry-content p, .synops p").first().text().trim();
    const rating   = $(".numscore, .score, .rating strong").first().text().trim();
    const status   = $(".statd, .status, .spe span:contains('Status')").first().text().replace("Status:", "").trim();
    const type     = $(".typez, .spe span:contains('Type')").first().text().replace("Type:", "").trim();
    const studio   = $(".spe span:contains('Studio') a").first().text().trim();
    const network  = $(".spe span:contains('Network') a").first().text().trim();
    const season   = $(".spe span:contains('Season') a").first().text().trim();
    const country  = $(".spe span:contains('Country') a").first().text().trim();
    const duration = $(".spe span:contains('Duration')").first().text().replace("Duration:", "").trim();

    const genres = $(".genxed a, .genre a, .genres a")
      .map((_, g) => $(g).text().trim()).get()
      .filter(Boolean);

    // Episode list
    const episodes = [];
    $(".eplister ul li, #episodelist ul li").each((_, el) => {
      const epTitle = $(el).find(".epl-title").text().trim();
      const epNum   = $(el).find(".epl-num").text().trim();
      const epDate  = $(el).find(".epl-date").text().trim();
      const epUrl   = $(el).find("a").attr("href");
      if (epUrl) episodes.push({ ep_num: epNum, title: epTitle, release_date: epDate, url: epUrl });
    });

    // Schedule day dari class atau teks
    let scheduleDay = null;
    $(".spe span, .infox span").each((_, el) => {
      const t = $(el).text();
      if (t.includes("Airs on") || t.includes("Tayang")) {
        scheduleDay = t.split(":").pop().trim();
      }
    });

    ok(`Series "${title}" — ${episodes.length} episode`);
    return { slug, title, thumb, synopsis, rating, status, type, studio, network,
             season, country, duration, genres, url, episodes, scheduleDay };

  } catch (e) {
    err(`Series ${slug}: ${e.message}`);
    return null;
  }
}

// ─── 3. Episode page ──────────────────────────────────────────────────────────
async function scrapeEpisode(epUrl) {
  try {
    const $ = await fetch$(epUrl);
    const html = $.html();

    // Embed servers dari iframe / data-video
    const servers = [];

    $("iframe").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src && !src.includes("recaptcha")) {
        let type = "Embed";
        if (src.includes("ok.ru"))         type = "OK.ru";
        else if (src.includes("dailymotion")) type = "Dailymotion";
        else if (src.includes("rumble"))   type = "Rumble";
        else if (src.includes("drive.google")) type = "Google Drive";
        servers.push({ type, embed_url: src });
      }
    });

    // Dari script inline / data-video button
    $("[data-video], .mirrorlink a").each((_, el) => {
      const src   = $(el).attr("data-video") || $(el).attr("href");
      const label = $(el).text().trim() || "Server";
      if (src && src.startsWith("http")) servers.push({ type: label, embed_url: src });
    });

    // Regex fallback untuk URL embed umum
    const embedRe = /(https?:\/\/[^\s"']+(?:ok\.ru|dailymotion\.com|rumble\.com|drive\.google)[^\s"']*)/gi;
    for (const m of html.matchAll(embedRe)) {
      if (!servers.find((s) => s.embed_url === m[1])) {
        let type = "Embed";
        if (m[1].includes("ok.ru")) type = "OK.ru";
        else if (m[1].includes("dailymotion")) type = "Dailymotion";
        else if (m[1].includes("rumble")) type = "Rumble";
        servers.push({ type, embed_url: m[1] });
      }
    }

    // Download links
    const downloads = [];
    let currentQual = "";

    $(".entry-content").find("p, h3, strong, b").each((_, el) => {
      const t = $(el).text().trim();
      if (/^(360|480|720|1080)p$|^4K$/i.test(t)) currentQual = t;
      $(el).closest("p").find("a").each((_, a) => {
        const href = $(a).attr("href");
        const host = $(a).text().trim();
        if (href && href.startsWith("http") && !href.includes("anichin.cafe")) {
          if (!downloads.find((d) => d.url === href)) {
            downloads.push({ quality: currentQual, host, url: href });
          }
        }
      });
    });

    return { servers, downloads };
  } catch (e) {
    err(`Episode ${epUrl}: ${e.message}`);
    return { servers: [], downloads: [] };
  }
}

// ─── 4. Upsert ke Supabase ────────────────────────────────────────────────────
async function upsertSeries(data) {
  const { error } = await supabase.from("series").upsert({
    slug:     data.slug,
    title:    data.title,
    thumb:    data.thumb,
    status:   data.status,
    type:     data.type,
    rating:   data.rating,
    genres:   data.genres,
    synopsis: data.synopsis,
    studio:   data.studio,
    network:  data.network,
    season:   data.season,
    country:  data.country,
    duration: data.duration,
    url:      data.url,
    updated_at: new Date().toISOString(),
  }, { onConflict: "slug" });

  if (error) err(`Upsert series ${data.slug}: ${error.message}`);
  else ok(`Upsert series: ${data.title}`);

  // Ambil ID series
  const { data: row } = await supabase.from("series").select("id").eq("slug", data.slug).single();
  return row?.id;
}

async function upsertEpisodes(seriesId, slug, episodes) {
  for (const ep of episodes) {
    // Cek sudah ada?
    const { data: existing } = await supabase
      .from("episodes").select("id").eq("url", ep.url).single();

    if (existing) continue; // skip duplikat

    const { data: inserted, error } = await supabase.from("episodes").insert({
      series_id:    seriesId,
      series_slug:  slug,
      ep_num:       ep.ep_num,
      title:        ep.title,
      url:          ep.url,
      release_date: ep.release_date,
    }).select("id").single();

    if (error) { err(`Insert episode ${ep.url}: ${error.message}`); continue; }
    ok(`New episode: ${ep.title}`);

    // Scrape servers + downloads untuk episode baru
    await sleep(1500);
    const { servers, downloads } = await scrapeEpisode(ep.url);

    if (servers.length) {
      await supabase.from("servers").insert(
        servers.map((s) => ({ episode_id: inserted.id, episode_url: ep.url, ...s }))
      );
    }
    if (downloads.length) {
      await supabase.from("downloads").insert(
        downloads.map((d) => ({ episode_id: inserted.id, episode_url: ep.url, ...d }))
      );
    }
  }
}

async function upsertSchedule(seriesId, slug, title, thumb, day, status) {
  if (!day) return;
  await supabase.from("schedule").upsert({
    series_id:   seriesId,
    series_slug: slug,
    title,
    thumb,
    day,
    status,
  }, { onConflict: "series_id" });
}

// ─── 5. Main ──────────────────────────────────────────────────────────────────
async function main() {
  inf("=== Anichin Scraper Start ===");

  // A. Ambil daftar ongoing dari homepage
  const { latestEpisodes, ongoingSeries } = await scrapeHomepage();

  // Kumpulkan semua slug unik
  const slugSet = new Set();
  for (const ep of latestEpisodes) {
    // Derive series slug dari URL episode (misal: /seri/perfect-world/)
    const match = ep.url.match(/\/seri\/([^/]+)/);
    if (match) slugSet.add(match[1]);
  }
  for (const s of ongoingSeries) {
    const match = s.url.match(/\/seri\/([^/]+)/);
    if (match) slugSet.add(match[1]);
  }

  // B. Scrape + upsert tiap series
  const slugs = [...slugSet];
  inf(`Total series yang akan di-scrape: ${slugs.length}`);

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    inf(`[${i + 1}/${slugs.length}] ${slug}`);

    const data = await scrapeSeries(slug);
    if (!data) { await sleep(2000); continue; }

    const seriesId = await upsertSeries(data);
    if (!seriesId) { await sleep(2000); continue; }

    await upsertEpisodes(seriesId, slug, data.episodes);
    await upsertSchedule(seriesId, slug, data.title, data.thumb, data.scheduleDay, data.status);

    await sleep(2000); // jangan terlalu agresif
  }

  inf("=== Scraper Selesai ===");
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
