// BlogBhai-এর চ্যাট পেজ। কোনো বাইরের লাইব্রেরি নেই। কোনো চাবি বা পাসওয়ার্ড এখানে লেখা নেই।
const PAGE = `<!doctype html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>BlogBhai</title>
<style>
:root { --bg:#f5f6f8; --card:#ffffff; --text:#1c1f24; --muted:#6b7280; --accent:#2563eb; --user:#e6efff; --border:#e2e5ea; --danger:#dc2626; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0e1014; --card:#171a21; --text:#e9ebf0; --muted:#9aa3b2; --accent:#60a5fa; --user:#1d2a40; --border:#2a2f3a; --danger:#f87171; }
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { display: flex; flex-direction: column; min-height: 100vh; min-height: 100dvh; background: var(--bg); color: var(--text);
  font-family: system-ui, -apple-system, "Noto Sans Bengali", "Nirmala UI", sans-serif; font-size: 16px; line-height: 1.6; }
header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; background: var(--card); border-bottom: 1px solid var(--border); }
header h1 { margin: 0; font-size: 18px; }
.btn { font: inherit; min-height: 44px; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--card); color: var(--text); cursor: pointer; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.small { min-height: 34px; font-size: 14px; padding: 4px 10px; margin-top: 8px; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
#log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
.msg { max-width: 94%; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--card);
  white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.user { align-self: flex-end; background: var(--user); }
.who { font-size: 12px; color: var(--muted); margin-bottom: 4px; }
.msg img { display: block; max-width: 200px; max-height: 200px; border-radius: 10px; margin-bottom: 8px; }
.empty { color: var(--muted); text-align: center; margin-top: 36px; padding: 0 10px; }
.status { min-height: 22px; padding: 2px 14px; font-size: 14px; color: var(--muted); }
.status.err { color: var(--danger); }
footer { position: sticky; bottom: 0; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); background: var(--card); border-top: 1px solid var(--border); }
#preview { display: none; position: relative; width: fit-content; margin-bottom: 8px; }
#previewImg { display: none; max-height: 90px; border-radius: 10px; border: 1px solid var(--border); }
#prevName { font-size: 14px; color: var(--muted); }
#removeImg { position: absolute; top: -8px; right: -8px; width: 28px; height: 28px; border-radius: 50%; border: none;
  background: var(--danger); color: #fff; font-size: 18px; line-height: 28px; text-align: center; padding: 0; cursor: pointer; }
.row { display: flex; gap: 8px; align-items: flex-end; }
.attach { display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; font-size: 20px; }
textarea { flex: 1; min-height: 48px; max-height: 40vh; resize: vertical; font: inherit; font-size: 16px; padding: 10px 12px;
  border-radius: 12px; border: 1px solid var(--border); background: var(--bg); color: var(--text); }
</style>
</head>
<body>
<header>
  <h1>BlogBhai</h1>
  <button class="btn" id="newChat" type="button">নতুন চ্যাট</button>
</header>
<main id="log" aria-live="polite"></main>
<div class="status" id="status" role="status"></div>
<footer>
  <div id="preview">
    <img id="previewImg" alt="">
    <span id="prevName"></span>
    <button id="removeImg" type="button" aria-label="সরিয়ে দিন">×</button>
  </div>
  <div class="row">
    <label class="btn attach" for="file" title="ছবি বা PDF যোগ করুন">📎</label>
    <input id="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden>
    <textarea id="input" rows="2" placeholder="এখানে লিখুন"></textarea>
    <button class="btn primary" id="send" type="button">পাঠান</button>
  </div>
</footer>
<script nonce="__NONCE__">
(function () {
  var KEY_PW = "bb_pw";
  var KEY_CHAT = "bb_chat";
  var KEEP = 12;
  var ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

  var logEl = document.getElementById("log");
  var inputEl = document.getElementById("input");
  var sendEl = document.getElementById("send");
  var fileEl = document.getElementById("file");
  var newEl = document.getElementById("newChat");
  var prevBox = document.getElementById("preview");
  var prevImg = document.getElementById("previewImg");
  var prevName = document.getElementById("prevName");
  var removeEl = document.getElementById("removeImg");
  var statusEl = document.getElementById("status");

  var chat = [];
  var pending = null;
  var busy = false;

  function getItem(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function setItem(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { } }
  function delItem(k) { try { window.localStorage.removeItem(k); } catch (e) { } }

  function loadChat() {
    try {
      var arr = JSON.parse(getItem(KEY_CHAT) || "[]");
      return Array.isArray(arr) ? arr.slice(-KEEP) : [];
    } catch (e) { return []; }
  }
  function saveChat() { setItem(KEY_CHAT, JSON.stringify(chat.slice(-KEEP))); }

  function setStatus(text, isErr) {
    statusEl.textContent = text || "";
    statusEl.className = isErr ? "status err" : "status";
  }

  function copyText(text, btn) {
    function done() {
      btn.textContent = "কপি হয়েছে";
      setTimeout(function () { btn.textContent = "কপি করুন"; }, 1500);
    }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      btn.textContent = ok ? "কপি হয়েছে" : "কপি হয়নি";
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function addBubble(role, text, imgSrc) {
    var box = document.createElement("div");
    box.className = role === "user" ? "msg user" : "msg";
    var who = document.createElement("div");
    who.className = "who";
    who.textContent = role === "user" ? "আপনি" : "BlogBhai";
    box.appendChild(who);
    if (imgSrc) {
      var im = document.createElement("img");
      im.src = imgSrc;
      im.alt = "পাঠানো ছবি";
      box.appendChild(im);
    }
    var body = document.createElement("div");
    body.textContent = text;
    box.appendChild(body);
    if (role !== "user") {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn small";
      btn.textContent = "কপি করুন";
      btn.addEventListener("click", function () { copyText(text, btn); });
      box.appendChild(btn);
    }
    logEl.appendChild(box);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderAll() {
    logEl.textContent = "";
    if (!chat.length) {
      var intro = document.createElement("div");
      intro.className = "empty";
      intro.textContent = "স্বাগতম। নিচে লিখুন। ছবি বা PDF দিতে 📎 চাপুন। উদাহরণ: ফোনের স্টোরেজ নিয়ে ৩০ সেকেন্ডের একটা স্ক্রিপ্ট লেখো।";
      logEl.appendChild(intro);
      return;
    }
    for (var i = 0; i < chat.length; i++) {
      addBubble(chat[i].role === "user" ? "user" : "model", chat[i].text, "");
    }
  }

  function showPreview() {
    if (!pending) { prevBox.style.display = "none"; return; }
    var isImg = pending.kind === "image";
    prevImg.style.display = isImg ? "block" : "none";
    if (isImg) prevImg.src = pending.url;
    prevName.textContent = pending.name;
    prevBox.style.display = "block";
  }

  function shrinkImage(file, cb) {
    var objUrl = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || 1;
      var h = img.naturalHeight || 1;
      var scale = Math.min(1, 1280 / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      var url = canvas.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(objUrl);
      cb({ url: url, data: url.split(",")[1] });
    };
    img.onerror = function () { URL.revokeObjectURL(objUrl); cb(null); };
    img.src = objUrl;
  }

  fileEl.addEventListener("change", function () {
    var f = fileEl.files && fileEl.files[0];
    fileEl.value = "";
    if (!f) return;
    if (ALLOWED.indexOf(f.type) === -1) {
      setStatus("শুধু JPG, PNG, WEBP ছবি বা PDF দিন।", true);
      return;
    }
    if (f.type === "application/pdf") {
      if (f.size > 2 * 1024 * 1024) {
        setStatus("PDF ২ MB-এর বেশি হলে চলবে না।", true);
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result);
        pending = { kind: "pdf", mime: "application/pdf", data: s.split(",")[1], url: "", name: f.name };
        setStatus("");
        showPreview();
      };
      reader.onerror = function () { setStatus("PDF পড়া যায়নি।", true); };
      reader.readAsDataURL(f);
      return;
    }
    shrinkImage(f, function (res) {
      if (!res) { setStatus("ছবিটি পড়া যায়নি।", true); return; }
      pending = { kind: "image", mime: "image/jpeg", data: res.data, url: res.url, name: f.name };
      setStatus("");
      showPreview();
    });
  });

  removeEl.addEventListener("click", function () {
    pending = null;
    showPreview();
  });

  function getPassword() {
    var pw = getItem(KEY_PW);
    if (pw) return pw;
    pw = window.prompt("পাসওয়ার্ড দিন (একবার দিলেই হবে):");
    if (!pw) return null;
    setItem(KEY_PW, pw);
    return pw;
  }

  function send() {
    if (busy) return;
    var text = inputEl.value.trim();
    if (!text && !pending) return;
    var pw = getPassword();
    if (!pw) {
      setStatus("পাসওয়ার্ড ছাড়া চালানো যাবে না।", true);
      return;
    }

    var file = pending;
    var shown = text || "(ফাইল পাঠানো হয়েছে)";
    if (file && file.kind === "pdf") shown = shown + " [PDF: " + file.name + "]";

    addBubble("user", shown, file && file.kind === "image" ? file.url : "");
    chat.push({ role: "user", text: shown });
    saveChat();

    var wire = chat.slice(-KEEP).map(function (m) { return { role: m.role, text: m.text }; });
    while (wire.length > 1 && wire[0].role !== "user") wire.shift();
    if (file) wire[wire.length - 1].file = { mime: file.mime, data: file.data };

    inputEl.value = "";
    pending = null;
    showPreview();
    busy = true;
    sendEl.disabled = true;
    setStatus("BlogBhai লিখছে...");

    fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-app-password": pw },
      body: JSON.stringify({ messages: wire })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { status: res.status, data: data || {} };
        });
      })
      .then(function (r) {
        if (r.status === 401) {
          delItem(KEY_PW);
          throw new Error("পাসওয়ার্ড মেলেনি। আবার পাঠালে নতুন করে চাইবে।");
        }
        if (r.status !== 200 || !r.data.reply) {
          throw new Error(r.data.error || "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।");
        }
        chat.push({ role: "model", text: r.data.reply });
        saveChat();
        addBubble("model", r.data.reply, "");
        setStatus("");
      })
      .catch(function (err) {
        if (chat.length && chat[chat.length - 1].role === "user") {
          chat.pop();
          saveChat();
          renderAll();
        }
        inputEl.value = text;
        setStatus(err && err.message ? err.message : "নেটওয়ার্ক সমস্যা হয়েছে।", true);
      })
      .then(function () {
        busy = false;
        sendEl.disabled = false;
      });
  }

  sendEl.addEventListener("click", send);
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  });

  newEl.addEventListener("click", function () {
    if (busy) return;
    chat = [];
    saveChat();
    pending = null;
    showPreview();
    setStatus("");
    renderAll();
  });

  chat = loadChat();
  renderAll();
  showPreview();
})();
</script>
</body>
</html>`;

export default PAGE;
