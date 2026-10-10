// BlogBhai: একটাই Cloudflare Worker। এটা চ্যাট পেজ দেখায় এবং মডেলের সাথে কথা বলার একমাত্র পথ।
// চাবি বা পাসওয়ার্ড এই কোডে নেই; সেগুলো GitHub Secrets থেকে Cloudflare-এ যায়।
import RULES from "./rules.js";
import PAGE from "./page.js";

// একটাই মডেল, নির্দিষ্ট নামে আটকানো। অন্য মডেলে যেতে হলে শুধু এই লাইনটা বদলাতে হবে।
const MODEL = "gemini-3.6-flash";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent";

const MAX_MESSAGES = 12;
const MAX_TEXT_CHARS = 20000;
const MAX_FILE_B64_CHARS = 3000000; // প্রায় ২.২ MB-এর ফাইল
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" && (request.method === "GET" || request.method === "HEAD")) {
      return renderPage();
    }
    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return json({ error: "এই পথে শুধু POST পাঠানো যায়।" }, 405);
      }
      return handleChat(request, env);
    }
    return json({ error: "পাওয়া যায়নি।" }, 404);
  },
};

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function renderPage() {
  const nonce = makeNonce();
  const html = PAGE.split("__NONCE__").join(nonce);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'unsafe-inline'; " +
        "img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  });
}

async function handleChat(request, env) {
  if (!env.APP_PASSWORD || !env.GEMINI_API_KEY) {
    return json({ error: "সার্ভারের সেটআপ এখনো শেষ হয়নি। GitHub Secrets যোগ করা দরকার।" }, 500);
  }

  const given = request.headers.get("x-app-password") || "";
  if (!samePassword(given, env.APP_PASSWORD)) {
    return json({ error: "পাসওয়ার্ড মেলেনি।" }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return json({ error: "অনুরোধের ফরম্যাট ঠিক নেই।" }, 400);
  }

  const problem = validate(payload);
  if (problem) {
    return json({ error: problem.message }, problem.status);
  }

  // ইতিহাস যদি মডেলের বার্তা দিয়ে শুরু হয়, সেটা বাদ দিই; প্রথম বার্তা ব্যবহারকারীর হতে হয়।
  let messages = payload.messages;
  while (messages.length > 1 && messages[0].role !== "user") {
    messages = messages.slice(1);
  }

  const body = {
    systemInstruction: { parts: [{ text: RULES }] },
    contents: messages.map(toGeminiContent),
    generationConfig: { maxOutputTokens: 16384 },
  };

  let upstream;
  try {
    upstream = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return json({ error: "মডেল সার্ভারে পৌঁছানো যায়নি। একটু পরে আবার চেষ্টা করুন।" }, 502);
  }

  if (!upstream.ok) {
    return json({ error: upstreamMessage(upstream.status) }, upstream.status === 429 ? 429 : 502);
  }

  let data;
  try {
    data = await upstream.json();
  } catch (err) {
    return json({ error: "মডেলের উত্তর পড়া যায়নি। আবার চেষ্টা করুন।" }, 502);
  }

  const reply = extractText(data);
  if (!reply) {
    return json(
      { error: "মডেল এই বার্তায় উত্তর দেয়নি (কারণ: " + reasonOf(data) + ")। প্রশ্নটা একটু বদলে আবার চেষ্টা করুন।" },
      422,
    );
  }
  return json({ reply }, 200);
}

function validate(payload) {
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return { status: 400, message: "কোনো বার্তা পাওয়া যায়নি।" };
  }
  if (payload.messages.length > MAX_MESSAGES) {
    return { status: 400, message: "একবারে এত বার্তা পাঠানো যায় না।" };
  }
  for (const m of payload.messages) {
    if (!m || (m.role !== "user" && m.role !== "model")) {
      return { status: 400, message: "বার্তার ধরন ঠিক নেই।" };
    }
    if (typeof m.text !== "string" || m.text.length > MAX_TEXT_CHARS) {
      return { status: 400, message: "বার্তা খুব বড় বা ঠিকমতো পাওয়া যায়নি।" };
    }
    if (!m.text.trim() && !m.file) {
      return { status: 400, message: "খালি বার্তা পাঠানো যায় না।" };
    }
    if (m.file) {
      if (!ALLOWED_MIME.includes(m.file.mime) || typeof m.file.data !== "string") {
        return { status: 400, message: "শুধু JPG, PNG, WEBP ছবি বা PDF দেওয়া যাবে।" };
      }
      if (m.file.data.length > MAX_FILE_B64_CHARS) {
        return { status: 413, message: "ফাইল খুব বড়। ছোট করে আবার দিন।" };
      }
    }
  }
  if (payload.messages[payload.messages.length - 1].role !== "user") {
    return { status: 400, message: "শেষ বার্তাটি আপনার হতে হবে।" };
  }
  return null;
}

function toGeminiContent(m) {
  const parts = [];
  if (m.text.trim()) parts.push({ text: m.text });
  if (m.file) parts.push({ inlineData: { mimeType: m.file.mime, data: m.file.data } });
  return { role: m.role, parts };
}

function extractText(data) {
  const cand = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
  const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
  return parts
    .filter((p) => p && !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
}

function reasonOf(data) {
  const block = data && data.promptFeedback && data.promptFeedback.blockReason;
  const cand = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
  const finish = cand && cand.finishReason;
  return block || finish || "অজানা";
}

function upstreamMessage(status) {
  if (status === 429) {
    return "আজকের ফ্রি সীমা শেষ বা অনেক বেশি অনুরোধ হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
  }
  if (status === 400 || status === 401 || status === 403) {
    return "মডেলের চাবি (GEMINI_API_KEY) ঠিক নেই বা অনুমতি নেই। GitHub Secrets চেক করুন।";
  }
  if (status === 404) {
    return "মডেলের নাম পাওয়া যায়নি। কোডে মডেলের নাম আপডেট দরকার।";
  }
  return "মডেল সার্ভারে সমস্যা হয়েছে (কোড: " + status + ")। একটু পরে আবার চেষ্টা করুন।";
}

function samePassword(given, expected) {
  if (typeof given !== "string" || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
