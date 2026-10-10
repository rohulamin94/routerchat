// স্বয়ংক্রিয় পরীক্ষা। আসল মডেলে কোনো কল হয় না; মডেলের জায়গায় নকল উত্তর বসানো হয়।
import assert from "node:assert/strict";
import worker from "../worker.js";
import PAGE from "../page.js";

const ENV = { APP_PASSWORD: "pass-for-test-123", GEMINI_API_KEY: "SECRET-KEY-DO-NOT-LEAK" };
const realFetch = globalThis.fetch;

let upstreamCalls = [];
let nextUpstream = null;

globalThis.fetch = async (url, init) => {
  upstreamCalls.push({ url: String(url), init });
  if (nextUpstream) {
    const make = nextUpstream;
    nextUpstream = null;
    return make();
  }
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "পরীক্ষার উত্তর" }] }, finishReason: "STOP" }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

function chatRequest(body, { password = "pass-for-test-123", raw = null } = {}) {
  const headers = { "content-type": "application/json" };
  if (password !== null) headers["x-app-password"] = password;
  return new Request("https://blogbhai.example/api/chat", {
    method: "POST",
    headers,
    body: raw !== null ? raw : JSON.stringify(body),
  });
}

const OK_BODY = { messages: [{ role: "user", text: "একটা স্ক্রিপ্ট লেখো" }] };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("হোম পেজ খোলে, নন্স বসে, placeholder থাকে না", async () => {
  const res = await worker.fetch(new Request("https://blogbhai.example/"), ENV);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("BlogBhai"));
  assert.ok(!html.includes("__NONCE__"));
  const csp = res.headers.get("content-security-policy");
  assert.match(csp, /script-src 'nonce-[A-Za-z0-9+/=]+'/);
});

test("পেজের জাভাস্ক্রিপ্ট ঠিকভাবে পার্স হয়", async () => {
  const m = PAGE.match(/<script nonce="__NONCE__">([\s\S]*?)<\/script>/);
  assert.ok(m, "script block পাওয়া যায়নি");
  new Function(m[1]); // শুধু পার্স করে দেখা হচ্ছে; চালানো হচ্ছে না
});

test("পাসওয়ার্ড ছাড়া উত্তর পাওয়া যায় না (401), মডেল ডাকা হয় না", async () => {
  const res = await worker.fetch(chatRequest(OK_BODY, { password: null }), ENV);
  assert.equal(res.status, 401);
  assert.equal(upstreamCalls.length, 0);
});

test("ভুল পাসওয়ার্ডে 401, মডেল ডাকা হয় না", async () => {
  const res = await worker.fetch(chatRequest(OK_BODY, { password: "wrong" }), ENV);
  assert.equal(res.status, 401);
  assert.equal(upstreamCalls.length, 0);
});

test("সিক্রেট না থাকলে 500, মডেল ডাকা হয় না", async () => {
  const res = await worker.fetch(chatRequest(OK_BODY), { APP_PASSWORD: "pass-for-test-123" });
  assert.equal(res.status, 500);
  assert.equal(upstreamCalls.length, 0);
});

test("ভুল JSON হলে 400", async () => {
  const res = await worker.fetch(chatRequest(null, { raw: "{not json" }), ENV);
  assert.equal(res.status, 400);
});

test("খালি বার্তা তালিকা হলে 400", async () => {
  const res = await worker.fetch(chatRequest({ messages: [] }), ENV);
  assert.equal(res.status, 400);
});

test("শেষ বার্তা মডেলের হলে 400", async () => {
  const body = { messages: [{ role: "user", text: "হ্যালো" }, { role: "model", text: "উত্তর" }] };
  const res = await worker.fetch(chatRequest(body), ENV);
  assert.equal(res.status, 400);
});

test("সঠিক অনুরোধে উত্তর ফেরত আসে; কী হেডারে যায়, URL-এ নয়", async () => {
  const res = await worker.fetch(chatRequest(OK_BODY), ENV);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.reply, "পরীক্ষার উত্তর");
  assert.equal(upstreamCalls.length, 1);
  const call = upstreamCalls[0];
  assert.ok(call.url.includes("models/gemini-3.6-flash:generateContent"));
  assert.ok(!call.url.includes(ENV.GEMINI_API_KEY));
  assert.equal(call.init.headers["x-goog-api-key"], ENV.GEMINI_API_KEY);
  const sent = JSON.parse(call.init.body);
  assert.ok(sent.systemInstruction.parts[0].text.includes("BlogBhai"));
  assert.equal(sent.contents[sent.contents.length - 1].role, "user");
});

test("ইতিহাসের শুরুতে মডেলের বার্তা থাকলে বাদ যায়", async () => {
  const body = { messages: [{ role: "model", text: "আগের উত্তর" }, { role: "user", text: "নতুন প্রশ্ন" }] };
  const res = await worker.fetch(chatRequest(body), ENV);
  assert.equal(res.status, 200);
  const sent = JSON.parse(upstreamCalls[0].init.body);
  assert.equal(sent.contents[0].role, "user");
});

test("ছবি বা PDF সঠিকভাবে inlineData হিসেবে যায়", async () => {
  const body = { messages: [{ role: "user", text: "এই ছবিটা দেখো", file: { mime: "image/jpeg", data: "QUJD" } }] };
  const res = await worker.fetch(chatRequest(body), ENV);
  assert.equal(res.status, 200);
  const sent = JSON.parse(upstreamCalls[0].init.body);
  const parts = sent.contents[0].parts;
  assert.equal(parts[1].inlineData.mimeType, "image/jpeg");
  assert.equal(parts[1].inlineData.data, "QUJD");
});

test("অনুমোদিত নয় এমন ফাইল ধরন হলে 400, মডেল ডাকা হয় না", async () => {
  const body = { messages: [{ role: "user", text: "x", file: { mime: "text/html", data: "QQ==" } }] };
  const res = await worker.fetch(chatRequest(body), ENV);
  assert.equal(res.status, 400);
  assert.equal(upstreamCalls.length, 0);
});

test("খুব বড় ফাইল হলে 413", async () => {
  const body = { messages: [{ role: "user", text: "x", file: { mime: "image/png", data: "A".repeat(3000001) } }] };
  const res = await worker.fetch(chatRequest(body), ENV);
  assert.equal(res.status, 413);
});

test("মডেলের সীমা শেষ (429) হলে বাংলা বার্তা, চাবি ফাঁস হয় না", async () => {
  nextUpstream = () => new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
  const res = await worker.fetch(chatRequest(OK_BODY), ENV);
  assert.equal(res.status, 429);
  const text = await res.text();
  assert.ok(text.includes("সীমা"));
  assert.ok(!text.includes(ENV.GEMINI_API_KEY));
});

test("মডেল উত্তর না দিলে 422 ও কারণ দেখায়", async () => {
  nextUpstream = () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 });
  const res = await worker.fetch(chatRequest(OK_BODY), ENV);
  assert.equal(res.status, 422);
  const data = await res.json();
  assert.ok(data.error.includes("SAFETY"));
});

test("চাবি ভুল হলে (403) পরিষ্কার বাংলা বার্তা, চাবি দেখায় না", async () => {
  nextUpstream = () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 403 });
  const res = await worker.fetch(chatRequest(OK_BODY), ENV);
  assert.equal(res.status, 502);
  const data = await res.json();
  assert.ok(data.error.includes("GEMINI_API_KEY"));
  assert.ok(!JSON.stringify(data).includes(ENV.GEMINI_API_KEY));
});

test("ভুল পথে 404, GET /api/chat-এ 405", async () => {
  const r1 = await worker.fetch(new Request("https://blogbhai.example/nope"), ENV);
  assert.equal(r1.status, 404);
  const r2 = await worker.fetch(new Request("https://blogbhai.example/api/chat", { method: "GET" }), ENV);
  assert.equal(r2.status, 405);
});

test("মডেল ব্যস্ত (৫০৩) থাকলে একটু পরে আবার চেষ্টা করে, দ্বিতীয়বারে সফল হলে উত্তর দেয়", async () => {
  let calls = 0;
  const harnessFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response("{}", { status: 503 });
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "দ্বিতীয়বারের উত্তর" }] } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const res = await worker.fetch(chatRequest(OK_BODY), ENV);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.reply, "দ্বিতীয়বারের উত্তর");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = harnessFetch;
  }
});

test("মডেল বারবার ব্যস্ত থাকলে তিনবার চেষ্টার পর বাংলা বার্তা, চাবি দেখায় না", async () => {
  let calls = 0;
  const harnessFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    return new Response("{}", { status: 503 });
  };
  try {
    const res = await worker.fetch(chatRequest(OK_BODY), ENV);
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.ok(data.error.includes("503"));
    assert.ok(!JSON.stringify(data).includes(ENV.GEMINI_API_KEY));
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = harnessFetch;
  }
});

test("সীমা শেষ (৪২৯) হলে আবার চেষ্টা করে না", async () => {
  let calls = 0;
  const harnessFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    return new Response("{}", { status: 429 });
  };
  try {
    const res = await worker.fetch(chatRequest(OK_BODY), ENV);
    assert.equal(res.status, 429);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = harnessFetch;
  }
});

test("মডেলের নিয়মে নতুন নিয়ম ৭–১০ আছে", async () => {
  const res = await worker.fetch(chatRequest(OK_BODY), ENV);
  assert.equal(res.status, 200);
  const sent = JSON.parse(upstreamCalls[0].init.body);
  const rules = sent.systemInstruction.parts[0].text;
  assert.ok(rules.includes("7. লিংক নিশ্চিত না হলে"));
  assert.ok(rules.includes("8. উৎসে না থাকলে"));
  assert.ok(rules.includes("9. উৎস স্পষ্ট না বললে"));
  assert.ok(rules.includes("10. আর্কাইভ"));
});

let failed = 0;
for (const t of tests) {
  upstreamCalls = [];
  nextUpstream = null;
  try {
    await t.fn();
    console.log("ঠিক আছে  - " + t.name);
  } catch (err) {
    failed++;
    console.log("ব্যর্থ    - " + t.name + "\n           " + (err && err.message ? err.message : err));
  }
}
globalThis.fetch = realFetch;
console.log(failed === 0 ? "\nসব পরীক্ষা পাস করেছে (" + tests.length + "টি)" : "\n" + failed + "টি পরীক্ষা ব্যর্থ");
process.exit(failed === 0 ? 0 : 1);
