const DEFAULT_COBALT_API = "https://co.wuk.sh";
const REQUEST_TIMEOUT_MS = 15000;

export const PLATFORM_LABELS = {
  tiktok: "TikTok",
  instagram: "Instagram",
  pinterest: "Pinterest"
};

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function parseBody(request) {
  return request.json().catch(() => ({}));
}

export function cleanUrl(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function detectPlatform(value) {
  const url = cleanUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "pin.it" || host === "pinterest.com" || host.endsWith(".pinterest.com")) return "pinterest";
  return null;
}

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/gi, "/");
}

export function stripHtml(value = "") {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function metaValue(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["']`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return null;
}

function findTitle(html) {
  const og = metaValue(html, "og:title");
  if (og) return og;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? stripHtml(title) : null;
}

function findDescription(html) {
  return metaValue(html, "og:description") || metaValue(html, "description") || null;
}

function findDurationSeconds(html) {
  const candidates = [
    metaValue(html, "video:duration"),
    metaValue(html, "og:video:duration"),
    metaValue(html, "duration")
  ].filter(Boolean);
  for (const raw of candidates) {
    const number = Number(raw);
    if (Number.isFinite(number) && number > 0) return Math.round(number);
    const match = String(raw).match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (match) {
      return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
  }

  // Best-effort JSON-LD lookup for media duration.
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1]);
      const nodes = Array.isArray(data) ? data : [data];
      const queue = [...nodes];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== "object") continue;
        if (typeof node.duration === "string") {
          const match = node.duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
          if (match) {
            const seconds = (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
            if (seconds > 0) return Math.round(seconds);
          }
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) queue.push(...value);
          else if (value && typeof value === "object") queue.push(value);
        }
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return null;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds == null) return "Tidak tersedia";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export function humanBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = index === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

export function estimateSize({ type, durationSeconds }) {
  if (type === "image") {
    const low = 250 * 1024;
    const high = 5 * 1024 * 1024;
    return { label: `≈ ${humanBytes(low)}–${humanBytes(high)}`, bytes: null, estimated: true };
  }
  const seconds = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 30;
  // Broad mobile-social range: roughly 3–10 Mbps.
  const low = Math.round(seconds * 0.375 * 1024 * 1024);
  const high = Math.round(seconds * 1.25 * 1024 * 1024);
  return { label: `≈ ${humanBytes(low)}–${humanBytes(high)}`, bytes: null, estimated: true };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPageMetadata(url) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9,id;q=0.8"
      },
      redirect: "follow"
    }, 10000);
    if (!response.ok) return { html: "", resolvedUrl: response.url || url };
    const html = await response.text();
    return { html, resolvedUrl: response.url || url };
  } catch {
    return { html: "", resolvedUrl: url };
  }
}

async function headSize(url) {
  try {
    const response = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" }, 8000);
    const length = Number(response.headers.get("content-length"));
    return Number.isFinite(length) && length > 0 ? length : null;
  } catch {
    return null;
  }
}

function decodeCobaltItem(item, index = 0) {
  if (!item?.url) return null;
  return {
    url: item.url,
    thumbnail: item.thumb || null,
    type: item.type === "image" ? "image" : "video",
    index
  };
}

async function callCobalt(sourceUrl) {
  const configured = (process.env.COBALT_API_URL || "").trim();
  const candidates = configured
    ? [configured.replace(/\/$/, "")]
    : ["https://co.wuk.sh/api/json", "https://co.wuk.sh"];

  let lastError = null;
  for (const endpoint of candidates) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "user-agent": "Z-downloder/1.1",
          "referer": "https://cobalt.tools/"
        },
        body: JSON.stringify({
          url: sourceUrl,
          vCodec: "h264",
          vQuality: "max",
          aFormat: "best",
          filenamePattern: "basic",
          isAudioOnly: false,
          isTTFullAudio: false,
          isAudioMuted: false,
          disableMetadata: false
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.text || data?.error?.code || `Provider HTTP ${response.status}`);
      if (["error", "rate-limit"].includes(data?.status)) throw new Error(data?.text || data?.error?.code || "Provider menolak request.");

      const assets = [];
      if (data.status === "picker" && Array.isArray(data.picker)) {
        for (let i = 0; i < data.picker.length; i++) {
          const item = decodeCobaltItem(data.picker[i], i);
          if (item) assets.push(item);
        }
      } else if (data?.url) {
        assets.push({ url: data.url, thumbnail: null, type: "video", index: 0 });
      }
      if (assets.length === 0) throw new Error("Media tidak ditemukan dari provider.");
      return { assets, status: data.status, provider: endpoint };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`API media tidak dapat dihubungi. ${lastError?.message || "Coba lagi."}`);
}

async function callTikTokFreeApi(sourceUrl) {
  const endpoint = `https://tdownv4.sl-bjs.workers.dev/?down=${encodeURIComponent(sourceUrl)}`;
  try {
    const response = await fetchWithTimeout(endpoint, {
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "Z-downloder/1.1"
      }
    }, 15000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message || `TikTok API HTTP ${response.status}`);
    const media = data.download_url || data.video?.[0] || data.video || data.url;
    if (!media || typeof media !== "string") throw new Error("API TikTok tidak mengembalikan file media.");
    return {
      assets: [{ url: media, thumbnail: data.author?.avatar || null, type: "video", index: 0 }],
      provider: "TikTok free API",
      title: data.title || null,
      description: data.title || null,
      durationSeconds: Number(data.author?.duration) || null
    };
  } catch (error) {
    throw new Error(`TikTok API gagal: ${error?.message || "fetch failed"}`);
  }
}

async function resolveInstagramPublic(sourceUrl) {
  const page = await fetchPageMetadata(sourceUrl);
  const html = page.html;
  if (!html) throw new Error("Instagram tidak mengizinkan halaman publik dibaca dari server. Coba link Reel/Post publik lain.");

  const video = metaValue(html, "og:video:secure_url") || metaValue(html, "og:video") || metaValue(html, "twitter:player:stream");
  if (video) return [{ url: video, thumbnail: metaValue(html, "og:image"), type: "video", index: 0 }];

  const image = metaValue(html, "og:image") || metaValue(html, "twitter:image");
  if (image) return [{ url: image, thumbnail: image, type: "image", index: 0 }];

  const candidates = [...html.matchAll(/https?:\/\/[^"'\s<>]+\.(?:mp4|jpg|jpeg|png)(?:\?[^"'\s<>]*)?/gi)]
    .map((m) => decodeHtml(m[0]).replace(/\\u0026/g, "&").replace(/\\\//g, "/"));
  const videoCandidate = candidates.find((u) => /\\.mp4(?:\\?|$)/i.test(u));
  if (videoCandidate) return [{ url: videoCandidate, thumbnail: metaValue(html, "og:image"), type: "video", index: 0 }];
  const imageCandidate = candidates.find((u) => /\\.(?:jpg|jpeg|png)(?:\\?|$)/i.test(u));
  if (imageCandidate) return [{ url: imageCandidate, thumbnail: imageCandidate, type: "image", index: 0 }];

  throw new Error("Instagram tidak memberikan URL media publik. Konten mungkin login-only, privat, atau URL sudah tidak aktif.");
}

async function resolvePinterest(sourceUrl) {
  const page = await fetchPageMetadata(sourceUrl);
  const html = page.html;
  if (!html) throw new Error("Halaman Pinterest tidak dapat dibaca. Coba lagi atau gunakan link pin publik.");
  const video = metaValue(html, "og:video:secure_url") || metaValue(html, "og:video");
  const videoCandidates = [...html.matchAll(/"url":"(https:[^"\\]+?\.mp4[^"\\]*)"/g)]
    .map((match) => match[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/"));
  const prioritized = ["V_HLSV4", "V_720P", "V_EXP7", "V_480P", "V_360P"];
  let mediaUrl = video;
  if (!mediaUrl && videoCandidates.length) {
    mediaUrl = prioritized.flatMap((tag) => videoCandidates.filter((u) => u.includes(tag)))[0] || videoCandidates[0];
  }
  if (mediaUrl) return [{ url: mediaUrl, thumbnail: metaValue(html, "og:image"), type: "video", index: 0 }];

  const image = metaValue(html, "og:image");
  if (image) {
    return [{ url: image.replace(/\/\d+x(?:\d+)?\//, "/originals/"), thumbnail: image, type: "image", index: 0 }];
  }
  throw new Error("Media Pinterest tidak ditemukan. Konten mungkin privat, terhapus, atau tidak didukung.");
}

export async function inspectUrl(sourceUrl) {
  const clean = cleanUrl(sourceUrl);
  if (!clean) throw new Error("URL tidak valid.");
  const platform = detectPlatform(clean);
  if (!platform) throw new Error("URL harus berasal dari TikTok, Instagram, atau Pinterest.");

  let result;
  let page = { html: "", resolvedUrl: clean };

  if (platform === "pinterest") {
    page = await fetchPageMetadata(clean);
    result = { assets: await resolvePinterest(clean), provider: "Pinterest HTML parser" };
  } else if (platform === "tiktok") {
    try {
      result = await callTikTokFreeApi(clean);
      page = await fetchPageMetadata(clean);
    } catch (primaryError) {
      result = await callCobalt(clean);
      page = await fetchPageMetadata(clean);
      if (!result) throw primaryError;
    }
  } else {
    try {
      result = { assets: await resolveInstagramPublic(clean), provider: "Instagram public HTML parser" };
      page = await fetchPageMetadata(clean);
    } catch (primaryError) {
      try {
        result = await callCobalt(clean);
        page = await fetchPageMetadata(clean);
      } catch (fallbackError) {
        throw new Error(`${primaryError?.message || "Instagram gagal"} Fallback API juga gagal: ${fallbackError?.message || "fetch failed"}`);
      }
    }
  }

  const title = page.html ? findTitle(page.html) : null;
  const description = page.html ? findDescription(page.html) : null;
  const durationSeconds = page.html ? findDurationSeconds(page.html) : null;

  const assets = [];
  for (const raw of result.assets) {
    const bytes = await headSize(raw.url);
    const type = raw.type || (page.html && /og:video|video\/mp4/i.test(page.html) ? "video" : "image");
    const estimate = bytes ? { label: humanBytes(bytes), bytes, estimated: false } : estimateSize({ type, durationSeconds });
    assets.push({
      ...raw,
      type,
      sizeBytes: estimate.bytes,
      sizeLabel: estimate.label
    });
  }

  const primary = assets[0];
  const fallbackDescription = platform === "tiktok"
    ? "Konten TikTok publik. Metadata lengkap bisa bergantung pada respons halaman sumber."
    : platform === "instagram"
      ? "Konten Instagram publik. Metadata lengkap bisa bergantung pada respons halaman sumber."
      : "Pin Pinterest publik yang ditemukan melalui parser HTML.";

  return {
    ok: true,
    platform,
    platformLabel: PLATFORM_LABELS[platform],
    originalUrl: clean,
    resolvedUrl: page.resolvedUrl || clean,
    title: title || `${PLATFORM_LABELS[platform]} media`,
    description: description || fallbackDescription,
    durationSeconds,
    durationLabel: formatDuration(durationSeconds),
    mediaType: primary.type,
    mediaTypeLabel: primary.type === "image" ? "Foto / gambar" : "Video",
    thumbnail: primary.thumbnail || metaValue(page.html, "og:image") || null,
    sizeLabel: primary.sizeLabel,
    estimated: primary.sizeBytes == null,
    assets,
    provider: result.provider,
    scannedAt: new Date().toISOString()
  };
}

export async function getDownloadAsset(sourceUrl, index = 0) {
  const data = await inspectUrl(sourceUrl);
  const selected = data.assets[Math.max(0, Math.min(Number(index) || 0, data.assets.length - 1))];
  return { ...data, selected };
}
