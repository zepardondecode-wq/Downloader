import { inspectUrl, jsonResponse, parseBody } from "../lib/media.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  const body = await parseBody(request);
  try {
    const data = await inspectUrl(body?.url);
    return jsonResponse(data);
  } catch (error) {
    return jsonResponse({ ok: false, error: error?.message || "Scan gagal." }, 400);
  }
};
