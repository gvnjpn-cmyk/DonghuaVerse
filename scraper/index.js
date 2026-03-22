/**
 * Anichin Puppeteer Scraper
 * Jalankan via GitHub Actions
 */

require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const { createClient } = require("@supabase/supabase-js");

const BASE = "https://anichin.cafe";
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const log  = (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`);
const ok   = (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`);
const err  = (msg) => console.log(`[${new Date().toISOString()}] ❌ ${msg}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function launchBrowser() {
  return puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--no-first-run","--no-zygote","--single-process"],
  });
}

async function scrapeHomepage(page) {
  log("Scraping homepage...");
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 30000 });
  const episodes = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll(".listupd article, .bsx").forEach(el => {
      const title = el.querySelector("h2, .tt, .ntitle")?.textContent?.trim();
      const url   = el.querySelector("a")?.href;
      const ep    = el.querySelector(".epx, .sb")?.textContent?.trim();
      const thumb = el.querySelector("img")?.src || el.querySelector("img")?.dataset?.src;
      if (title && url) items.push({ title, url, ep, thumb });
    });
    return items;
  });
  ok(`Homepage: ${episodes.length} episode`);
  return episodes;
}

async function scrapeSeries(page, slug) {
  const url = `${BASE}/seri/${slug}/`;
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const data = await page.evaluate(() => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || "";
      const title    = getText("h1.entry-title, .seriestitle, h1");
      const thumb    = document.querySelector(".thumb img, .seriesthumbnail img")?.src || "";
      const synopsis = getText(".entry-content p, .synops p");
      const rating   = getText(".numscore, .score");
      const status   = getText(".statd, .status");
      const type     = getText(".typez");
      const studio   = getText(".spe span a[href*='studio']");
      const network  = getText(".spe span a[href*='network']");
      const country  = getText(".spe span a[href*='country']");
      const duration = getText(".spe span:last-child");
      const genres   = [...document.querySelectorAll(".genxed a, .genre a")].map(g => g.textContent.trim()).filter(Boolean);
      const episodes = [...document.querySelectorAll(".eplister ul li, #episodelist ul li")].map(el => ({
        ep_num: el.querySelector(".epl-num")?.textContent?.trim() || "",
        title:  el.querySelector(".epl-title")?.textContent?.trim() || "",
        date:   el.querySelector(".epl-date")?.textContent?.trim() || "",
        url:    el.querySelector("a")?.href || "",
      })).filter(e => e.url);
      return { title, thumb, synopsis, rating, status, type, studio, network, country, duration, genres, episodes };
    });
    ok(`Series "${data.title}" — ${data.episodes.length} episode`);
    return { slug, url, ...data };
  } catch(e) {
    err(`Series ${slug}: ${e.message}`);
    return null;
  }
}

async function scrapeEpisode(browser, epUrl) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36");
    
    // Intercept untuk tangkap embed URLs
    const embedUrls = [];
    await page.setRequestInterception(true);
    page.on("request", req => {
      const u = req.url();
      const t = req.resourceType();
      if (["font","stylesheet"].includes(t)) { req.abort(); return; }
      if (u.includes("ok.ru") || u.includes("dailymotion") || u.includes("rumble") || u.includes("drive.google")) {
        embedUrls.push(u);
      }
      req.continue();
    });

    await page.goto(epUrl, { waitUntil: "networkidle2", timeout: 40000 });
    await sleep(4000); // tunggu JS load player

    // Klik semua server button untuk trigger load
    await page.evaluate(() => {
      document.querySelectorAll(".server-select a, [data-id], .mirrorlink a").forEach(btn => btn.click());
    });
    await sleep(2000);

    // Ambil iframe srcs
    const iframes = await page.evaluate(() => {
      return [...document.querySelectorAll("iframe")]
        .map(f => f.src || f.dataset?.src)
        .filter(s => s && !s.includes("recaptcha") && s.startsWith("http"));
    });

    // Ambil server buttons
    const serverBtns = await page.evaluate(() => {
      return [...document.querySelectorAll("[data-video], .mirrorlink a")]
        .map(el => ({ type: el.textContent.trim() || "Server", embed_url: el.dataset?.video || el.href }))
        .filter(s => s.embed_url?.startsWith("http"));
    });

    // Ambil download links
    const downloads = await page.evaluate(() => {
      const items = []; let curQual = "";
      document.querySelectorAll(".entry-content *").forEach(el => {
        const t = el.textContent.trim();
        if (/^(360|480|720|1080)p$|^4K$/i.test(t)) curQual = t;
        if (el.tagName === "A" && el.href && !el.href.includes("anichin") && el.href.startsWith("http")) {
          if (!items.find(i => i.url === el.href)) items.push({ quality: curQual, host: el.textContent.trim(), url: el.href });
        }
      });
      return items;
    });

    // Gabungkan semua server
    const servers = [];
    const addServer = (src) => {
      if (!src || servers.find(s => s.embed_url === src)) return;
      let type = "Embed";
      if (src.includes("ok.ru")) type = "OK.ru";
      else if (src.includes("dailymotion")) type = "Dailymotion";
      else if (src.includes("rumble")) type = "Rumble";
      else if (src.includes("drive.google")) type = "Google Drive";
      servers.push({ type, embed_url: src });
    };

    iframes.forEach(addServer);
    embedUrls.forEach(addServer);
    serverBtns.forEach(s => { if (s.embed_url) addServer(s.embed_url); });

    ok(`Episode: ${servers.length} server, ${downloads.length} download`);
    return { servers, downloads };
  } catch(e) {
    err(`Episode ${epUrl}: ${e.message}`);
    return { servers: [], downloads: [] };
  } finally {
    await page.close();
  }
}

async function upsertSeries(data) {
  const { error } = await supabase.from("series").upsert({
    slug: data.slug, title: data.title, thumb: data.thumb,
    status: data.status, type: data.type, rating: data.rating,
    genres: data.genres, synopsis: data.synopsis, studio: data.studio,
    network: data.network, country: data.country, duration: data.duration,
    url: data.url, updated_at: new Date().toISOString(),
  }, { onConflict: "slug" });
  if (error) { err(`Upsert series: ${error.message}`); return null; }
  const { data: row } = await supabase.from("series").select("id").eq("slug", data.slug).single();
  return row?.id;
}

async function upsertEpisode(seriesId, slug, ep) {
  const { data: existing } = await supabase.from("episodes").select("id").eq("url", ep.url).single();
  if (existing) return { id: existing.id, isNew: false };
  const { data: inserted, error } = await supabase.from("episodes").insert({
    series_id: seriesId, series_slug: slug,
    ep_num: ep.ep_num, title: ep.title, url: ep.url, release_date: ep.date,
  }).select("id").single();
  if (error) { err(`Insert episode: ${error.message}`); return null; }
  ok(`New episode: ${ep.title}`);
  return { id: inserted.id, isNew: true };
}

async function main() {
  log("=== Anichin Puppeteer Scraper Start ===");
  const browser = await launchBrowser();
  const mainPage = await browser.newPage();
  await mainPage.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36");
  await mainPage.setRequestInterception(true);
  mainPage.on("request", req => {
    if (["font","stylesheet","image"].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  try {
    const latestEps = await scrapeHomepage(mainPage);
    const slugSet = new Set();
    latestEps.forEach(ep => {
      const m = ep.url.match(/\/seri\/([^/]+)/);
      if (m) slugSet.add(m[1]);
      const m2 = ep.url.match(/\/([^/]+)-episode-/);
      if (m2) slugSet.add(m2[1]);
    });

    const slugs = [...slugSet];
    log(`Total series: ${slugs.length}`);

    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      log(`[${i+1}/${slugs.length}] ${slug}`);

      const seriesData = await scrapeSeries(mainPage, slug);
      if (!seriesData) { await sleep(2000); continue; }

      const seriesId = await upsertSeries(seriesData);
      if (!seriesId) { await sleep(2000); continue; }

      // Semua episode
      for (const ep of seriesData.episodes) {
        if (!ep.url) continue;
        const result = await upsertEpisode(seriesId, slug, ep);
        if (!result) continue;

        // Kalau episode baru, scrape embednya
        if (result.isNew) {
          await sleep(1500);
          const { servers, downloads } = await scrapeEpisode(browser, ep.url);
          if (servers.length) {
            await supabase.from("servers").insert(servers.map(s => ({ episode_id: result.id, episode_url: ep.url, ...s })));
          }
          if (downloads.length) {
            await supabase.from("downloads").insert(downloads.map(d => ({ episode_id: result.id, episode_url: ep.url, ...d })));
          }
          await sleep(2000);
        }
      }
      await sleep(2000);
    }
  } finally {
    await browser.close();
  }
  log("=== Scraper Selesai ===");
}

main().catch(e => { err(e.message); process.exit(1); });
