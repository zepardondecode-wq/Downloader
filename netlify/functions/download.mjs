import { getDownloadAsset, jsonResponse, parseBody } from "../lib/media.mjs";

function safeFilename(platform, type, index = 0) {
  const ext = type === "image" ? "jpg" : "mp4";
  const suffix = index ? `-${index + 1}` : "";
  return `z-downloder-${platform}${suffix}.${ext}`;
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  const body = await parseBody(request);
  try {
    const data = await getDownloadAsset(body?.url, body?.index);
    return jsonResponse({
      ok: true,
      url: data.selected.url,
      filename: safeFilename(data.platform, data.selected.type, data.selected.index),
      type: data.selected.type,
      sizeLabel: data.selected.sizeLabel
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error?.message || "Download gagal." }, 400);
  }
};
