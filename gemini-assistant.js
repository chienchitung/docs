(function () {
  "use strict";

  var STORAGE_KEY = "dm_gemini_api_key";
  var MODEL = "gemini-3.6-flash";
  var BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL;
  var MAX_CONTEXT_CHARS = 6000;
  var SYSTEM_PREFIX =
    "你是 Data Machi 文件網站的問答助手，使用繁體中文回答。以下是使用者目前所在頁面的內容，" +
    "請優先根據這些內容回答使用者的問題；如果頁面內容沒有涵蓋，也可以根據你自己的知識回答，" +
    "並清楚說明這部分是額外補充而非頁面原文。回答請簡潔、有條理，適時使用 Markdown（如清單、粗體、程式碼）。\n\n頁面內容：\n";

  if (document.getElementById("dm-gm-panel")) return;

  var history = [];
  var busy = false;

  function getPageContext() {
    var selectors = ["article", "main", "#content-area", "body"];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.innerText && el.innerText.trim().length > 40) {
        return el.innerText.trim().slice(0, MAX_CONTEXT_CHARS);
      }
    }
    return "";
  }

  function getApiKey() {
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setApiKey(key) {
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch (e) {}
  }

  function clearApiKey() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  // ---- Minimal, safe Markdown -> HTML ----------------------------------
  // All raw text is HTML-escaped first; our own tags are the only markup
  // ever inserted, so a reply can never smuggle in executable HTML/JS.

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeUrl(url) {
    var trimmed = (url || "").trim();
    if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
    return "#";
  }

  function inlineMd(text) {
    text = text.replace(/`([^`]+)`/g, function (m, code) {
      return "<code>" + code + "</code>";
    });
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, label, url) {
      return (
        '<a href="' +
        sanitizeUrl(url) +
        '" target="_blank" rel="noopener noreferrer">' +
        label +
        "</a>"
      );
    });
    return text;
  }

  function markdownToHtml(md) {
    var escaped = escapeHtml(md || "");
    var lines = escaped.split("\n");
    var out = [];
    var inCode = false;
    var codeBuf = [];
    var listType = null;
    var listBuf = [];

    function flushList() {
      if (listType) {
        out.push("<" + listType + ">" + listBuf.join("") + "</" + listType + ">");
        listType = null;
        listBuf = [];
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (/^```/.test(line)) {
        if (inCode) {
          out.push("<pre><code>" + codeBuf.join("\n") + "</code></pre>");
          codeBuf = [];
          inCode = false;
        } else {
          flushList();
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        codeBuf.push(line);
        continue;
      }

      var heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushList();
        var level = heading[1].length;
        out.push("<h" + level + ">" + inlineMd(heading[2]) + "</h" + level + ">");
        continue;
      }

      var ul = line.match(/^[-*]\s+(.*)$/);
      var ol = line.match(/^\d+\.\s+(.*)$/);
      if (ul) {
        if (listType !== "ul") {
          flushList();
          listType = "ul";
        }
        listBuf.push("<li>" + inlineMd(ul[1]) + "</li>");
        continue;
      }
      if (ol) {
        if (listType !== "ol") {
          flushList();
          listType = "ol";
        }
        listBuf.push("<li>" + inlineMd(ol[1]) + "</li>");
        continue;
      }
      flushList();

      if (line.trim() === "") continue;
      out.push("<p>" + inlineMd(line) + "</p>");
    }
    flushList();
    if (inCode && codeBuf.length) {
      out.push("<pre><code>" + codeBuf.join("\n") + "</code></pre>");
    }
    return out.join("");
  }

  function injectStyles() {
    var css =
      "#dm-gm-mobile-toggle{position:fixed;right:20px;bottom:20px;z-index:999998;" +
      "width:52px;height:52px;border-radius:50%;border:none;background:#16A34A;color:#fff;" +
      "cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);align-items:center;justify-content:center;" +
      "display:none;}" +
      "#dm-gm-mobile-toggle:hover{background:#15803D;}" +
      "#dm-gm-panel{position:fixed;top:0;right:0;z-index:999999;" +
      "width:min(420px,100vw);height:100vh;height:100dvh;" +
      "background:#fff;color:#0f172a;box-shadow:-8px 0 30px rgba(0,0,0,.18);" +
      "display:flex;flex-direction:column;overflow:hidden;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "border-left:1px solid #e2e8f0;" +
      "transform:translateX(100%);transition:transform .25s ease;visibility:hidden;}" +
      "#dm-gm-panel.dm-gm-open{transform:translateX(0);visibility:visible;}" +
      "@media (prefers-color-scheme: dark){#dm-gm-panel{background:#0f172a;color:#e2e8f0;border-color:#1e293b;}}" +
      ".dm-gm-header{display:flex;align-items:center;justify-content:space-between;" +
      "padding:14px 16px;flex:0 0 auto;border-bottom:1px solid #e2e8f0;}" +
      "@media (prefers-color-scheme: dark){.dm-gm-header{border-color:#1e293b;}}" +
      ".dm-gm-header strong{font-size:14px;}" +
      ".dm-gm-header-actions button{background:transparent;border:none;color:inherit;cursor:pointer;" +
      "font-size:15px;padding:4px 6px;opacity:.6;}" +
      ".dm-gm-header-actions button:hover{opacity:1;}" +
      ".dm-gm-disclaimer{flex:0 0 auto;text-align:center;font-size:11.5px;font-style:italic;opacity:.55;" +
      "padding:8px 16px;}" +
      "#dm-gm-content{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}" +
      ".dm-gm-body{flex:1 1 auto;overflow-y:auto;padding:12px 14px;}" +
      ".dm-gm-msg{margin-bottom:10px;font-size:13.5px;line-height:1.55;}" +
      ".dm-gm-msg.user{text-align:right;white-space:pre-wrap;}" +
      ".dm-gm-msg.user .dm-gm-bubble{background:#16A34A;color:#fff;}" +
      ".dm-gm-msg.model .dm-gm-bubble{background:#f1f5f9;color:#0f172a;text-align:left;}" +
      "@media (prefers-color-scheme: dark){.dm-gm-msg.model .dm-gm-bubble{background:#1e293b;color:#e2e8f0;}}" +
      ".dm-gm-msg.error .dm-gm-bubble{background:#fee2e2;color:#991b1b;white-space:pre-wrap;}" +
      ".dm-gm-bubble{display:inline-block;padding:8px 12px;border-radius:12px;max-width:90%;}" +
      ".dm-gm-bubble p{margin:0 0 8px;}" +
      ".dm-gm-bubble p:last-child{margin-bottom:0;}" +
      ".dm-gm-bubble h1,.dm-gm-bubble h2,.dm-gm-bubble h3,.dm-gm-bubble h4,.dm-gm-bubble h5,.dm-gm-bubble h6{" +
      "margin:10px 0 6px;font-size:1em;font-weight:700;}" +
      ".dm-gm-bubble ul,.dm-gm-bubble ol{margin:0 0 8px;padding-left:1.3em;}" +
      ".dm-gm-bubble li{margin:2px 0;}" +
      ".dm-gm-bubble code{background:rgba(0,0,0,.08);border-radius:4px;padding:1px 4px;font-size:.92em;" +
      "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}" +
      ".dm-gm-bubble pre{background:rgba(0,0,0,.08);border-radius:8px;padding:8px 10px;overflow-x:auto;margin:0 0 8px;}" +
      ".dm-gm-bubble pre code{background:none;padding:0;}" +
      "@media (prefers-color-scheme: dark){.dm-gm-bubble code,.dm-gm-bubble pre{background:rgba(255,255,255,.1);}}" +
      ".dm-gm-bubble a{color:inherit;text-decoration:underline;}" +
      ".dm-gm-typing::after{content:'\\258C';display:inline-block;margin-left:2px;" +
      "animation:dmgmblink 1s steps(1) infinite;}" +
      "@keyframes dmgmblink{50%{opacity:0;}}" +
      ".dm-gm-footer{flex:0 0 auto;border-top:1px solid #e2e8f0;padding:10px;}" +
      "@media (prefers-color-scheme: dark){.dm-gm-footer{border-color:#1e293b;}}" +
      ".dm-gm-input-row{display:flex;gap:6px;}" +
      ".dm-gm-input-row textarea{flex:1;resize:none;border-radius:10px;border:1px solid #cbd5e1;" +
      "padding:8px 10px;font-size:13.5px;font-family:inherit;height:38px;background:transparent;color:inherit;}" +
      ".dm-gm-input-row button{background:#16A34A;color:#fff;border:none;border-radius:10px;" +
      "padding:0 14px;cursor:pointer;font-size:13px;flex:0 0 auto;}" +
      ".dm-gm-input-row button:disabled{opacity:.5;cursor:not-allowed;}" +
      ".dm-gm-hint{font-size:11px;opacity:.6;margin-top:6px;}" +
      ".dm-gm-setup{padding:16px 14px;font-size:13px;line-height:1.6;}" +
      ".dm-gm-setup input{width:100%;box-sizing:border-box;padding:8px 10px;margin:10px 0;" +
      "border-radius:8px;border:1px solid #cbd5e1;font-size:13px;background:transparent;color:inherit;}" +
      ".dm-gm-setup button{background:#16A34A;color:#fff;border:none;border-radius:8px;" +
      "padding:8px 14px;cursor:pointer;font-size:13px;}" +
      ".dm-gm-setup a{color:#16A34A;}";
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) node.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function openPanel() {
    var panel = document.getElementById("dm-gm-panel");
    var open = panel.classList.toggle("dm-gm-open");
    if (open) render();
    syncMobileToggle();
  }

  function buildPanel() {
    var panel = el("div", { id: "dm-gm-panel", role: "dialog", "aria-label": "AI 問答小幫手" });
    var header = el("div", { class: "dm-gm-header" }, "<strong>&#10022; Assistant</strong>");
    var actions = el("div", { class: "dm-gm-header-actions" });
    var resetBtn = el("button", { title: "更換 API Key", "aria-label": "更換 API Key" }, "&#9881;");
    resetBtn.addEventListener("click", function () {
      clearApiKey();
      history = [];
      render();
    });
    var closeBtn = el("button", { title: "關閉", "aria-label": "關閉" }, "&#10005;");
    closeBtn.addEventListener("click", function () {
      panel.classList.remove("dm-gm-open");
      syncMobileToggle();
    });
    actions.appendChild(resetBtn);
    actions.appendChild(closeBtn);
    header.appendChild(actions);

    var disclaimer = el(
      "div",
      { class: "dm-gm-disclaimer" },
      "回答由 Gemini 產生，使用你自己的 API Key，可能包含錯誤"
    );

    var body = el("div", { id: "dm-gm-content" });
    panel.appendChild(header);
    panel.appendChild(disclaimer);
    panel.appendChild(body);
    return panel;
  }

  function render() {
    var content = document.getElementById("dm-gm-content");
    if (!content) return;
    content.innerHTML = "";
    var apiKey = getApiKey();
    if (!apiKey) {
      content.appendChild(renderSetup());
    } else {
      content.appendChild(renderChat());
    }
  }

  function renderSetup() {
    var wrap = el(
      "div",
      { class: "dm-gm-setup" },
      "此問答功能由你自己的 Gemini API Key 驅動，Key 只會儲存在你目前這個瀏覽器中（localStorage），" +
        "不會傳送給 Data Machi 網站或任何第三方伺服器。<br/>" +
        '還沒有 Key？前往 <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">' +
        "Google AI Studio</a> 免費申請。"
    );
    var input = el("input", {
      type: "password",
      placeholder: "貼上你的 Gemini API Key",
      autocomplete: "off",
    });
    var saveBtn = el("button", {}, "儲存並開始使用");
    saveBtn.addEventListener("click", function () {
      var val = input.value.trim();
      if (!val) return;
      setApiKey(val);
      render();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") saveBtn.click();
    });
    wrap.appendChild(input);
    wrap.appendChild(saveBtn);
    return wrap;
  }

  function renderChat() {
    var wrap = el("div", { style: "display:flex;flex-direction:column;flex:1 1 auto;min-height:0;" });
    var body = el("div", { class: "dm-gm-body", "aria-live": "polite" });
    history.forEach(function (turn) {
      body.appendChild(renderMessage(turn.role, turn.text));
    });
    var footer = el("div", { class: "dm-gm-footer" });
    var row = el("div", { class: "dm-gm-input-row" });
    var textarea = el("textarea", { placeholder: "輸入你的問題…" });
    var sendBtn = el("button", {}, "送出");

    function send() {
      var q = textarea.value.trim();
      if (!q || busy) return;
      textarea.value = "";
      appendAndSend(q, body, sendBtn, textarea);
    }

    sendBtn.addEventListener("click", send);
    textarea.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    row.appendChild(textarea);
    row.appendChild(sendBtn);
    footer.appendChild(row);
    footer.appendChild(
      el("div", { class: "dm-gm-hint" }, "由 Gemini 3.6 Flash 產生的回答可能有誤，請自行查證。")
    );

    wrap.appendChild(body);
    wrap.appendChild(footer);
    setTimeout(function () {
      body.scrollTop = body.scrollHeight;
    }, 0);
    return wrap;
  }

  function renderMessage(role, text) {
    var msg = el("div", { class: "dm-gm-msg " + role });
    var bubble = el("span", { class: "dm-gm-bubble" });
    if (role === "model") {
      bubble.innerHTML = markdownToHtml(text);
    } else {
      bubble.textContent = text;
    }
    msg.appendChild(bubble);
    return msg;
  }

  function appendAndSend(question, body, sendBtn, textarea) {
    history.push({ role: "user", text: question });
    body.appendChild(renderMessage("user", question));

    var modelMsg = el("div", { class: "dm-gm-msg model" });
    var bubble = el("span", { class: "dm-gm-bubble dm-gm-typing" });
    modelMsg.appendChild(bubble);
    body.appendChild(modelMsg);
    body.scrollTop = body.scrollHeight;

    busy = true;
    sendBtn.disabled = true;
    textarea.disabled = true;

    var lastText = "";
    askGeminiStream(question, function (partial) {
      lastText = partial;
      bubble.innerHTML = markdownToHtml(partial);
      body.scrollTop = body.scrollHeight;
    })
      .then(function (finalText) {
        var text = finalText || lastText;
        bubble.classList.remove("dm-gm-typing");
        bubble.innerHTML = markdownToHtml(text) || "（沒有取得回應內容）";
        history.push({ role: "model", text: text });
      })
      .catch(function (err) {
        modelMsg.className = "dm-gm-msg error";
        bubble.className = "dm-gm-bubble";
        bubble.textContent = err.message || "發生未知錯誤";
      })
      .finally(function () {
        busy = false;
        sendBtn.disabled = false;
        textarea.disabled = false;
        textarea.focus();
        body.scrollTop = body.scrollHeight;
      });
  }

  function buildRequestBody(question) {
    var contents = history
      .filter(function (t) {
        return t.role === "user" || t.role === "model";
      })
      .map(function (t) {
        return { role: t.role, parts: [{ text: t.text }] };
      });
    contents.push({ role: "user", parts: [{ text: question }] });
    return {
      contents: contents,
      systemInstruction: { parts: [{ text: SYSTEM_PREFIX + getPageContext() }] },
    };
  }

  function errorFromResponse(res) {
    return res
      .json()
      .catch(function () {
        return null;
      })
      .then(function (data) {
        var msg = data && data.error && data.error.message;
        if (res.status === 400 || res.status === 403) {
          return new Error(
            "API Key 無效或沒有權限，請按右上角齒輪重新設定。（" + (msg || res.status) + "）"
          );
        }
        if (res.status === 429) {
          return new Error("已達 Gemini API 用量上限，請稍後再試。");
        }
        return new Error("請求失敗（HTTP " + res.status + "）：" + (msg || ""));
      });
  }

  function askGeminiStream(question, onChunk) {
    var apiKey = getApiKey();
    if (!apiKey) return Promise.reject(new Error("尚未設定 API Key"));

    var url = BASE_URL + ":streamGenerateContent?alt=sse&key=" + encodeURIComponent(apiKey);
    var body = buildRequestBody(question);

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) {
        return errorFromResponse(res).then(function (err) {
          throw err;
        });
      }
      if (!res.body || !res.body.getReader) {
        return res.json().then(function (data) {
          var parts =
            data &&
            data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts;
          var text = parts
            ? parts
                .map(function (p) {
                  return p.text || "";
                })
                .join("")
            : "";
          onChunk(text);
          return text;
        });
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var fullText = "";

      function handleBlock(block) {
        var blockLines = block.split("\n");
        for (var i = 0; i < blockLines.length; i++) {
          var line = blockLines[i].trim();
          if (line.slice(0, 5) !== "data:") continue;
          var jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;
          try {
            var data = JSON.parse(jsonStr);
            var parts =
              data.candidates &&
              data.candidates[0] &&
              data.candidates[0].content &&
              data.candidates[0].content.parts;
            var delta = parts
              ? parts
                  .map(function (p) {
                    return p.text || "";
                  })
                  .join("")
              : "";
            if (delta) {
              fullText += delta;
              onChunk(fullText);
            }
          } catch (e) {}
        }
      }

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            if (buffer.trim()) handleBlock(buffer);
            return fullText;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var blocks = buffer.split("\n\n");
          buffer = blocks.pop();
          blocks.forEach(handleBlock);
          return pump();
        });
      }

      return pump();
    });
  }

  function findNativeAssistantButton() {
    var byId = document.getElementById("assistant-entry");
    if (byId) return byId;

    var candidates = document.querySelectorAll("button, a, [role='button']");
    for (var i = 0; i < candidates.length; i++) {
      var node = candidates[i];
      if (node.closest("#dm-gm-panel")) continue;
      var text = (node.textContent || "").trim().toLowerCase();
      var aria = (node.getAttribute("aria-label") || "").toLowerCase();
      if (text.length > 40) continue;
      var isMatch =
        text.indexOf("ask assistant") !== -1 ||
        aria.indexOf("assistant panel") !== -1 ||
        (aria.indexOf("assistant") !== -1 && aria.length < 40);
      if (isMatch) {
        var rect = node.getBoundingClientRect();
        if (rect.top < 300) return node;
      }
    }
    return null;
  }

  function tryBindNative() {
    var btn = findNativeAssistantButton();
    if (!btn || btn.dataset.dmGmBound === "1") return !!btn;
    btn.dataset.dmGmBound = "1";
    btn.addEventListener(
      "click",
      function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openPanel();
      },
      true
    );
    return true;
  }

  // ---- Mobile fallback ---------------------------------------------------
  // The native button is "hidden lg:flex" (desktop-only). On small screens
  // it never renders, so we surface our own floating entry point instead —
  // driven by the button's actual measured visibility, not a guessed
  // breakpoint, so it tracks whatever responsive rules Mintlify ships.

  function buildMobileToggle() {
    var btn = el(
      "button",
      { id: "dm-gm-mobile-toggle", "aria-label": "開啟 AI 問答小幫手" },
      '<svg width="22" height="22" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M5.65799 2.99L4.39499 2.569L3.97399 1.306C3.83699 0.898 3.16199 0.898 3.02499 1.306L2.60399 2.569L1.34099 2.99C1.13699 3.058 0.998993 3.249 0.998993 3.464C0.998993 3.679 1.13699 3.87 1.34099 3.938L2.60399 4.359L3.02499 5.622C3.09299 5.826 3.28499 5.964 3.49999 5.964C3.71499 5.964 3.90599 5.826 3.97499 5.622L4.39599 4.359L5.65899 3.938C5.86299 3.87 6.00099 3.679 6.00099 3.464C6.00099 3.249 5.86199 3.058 5.65799 2.99Z" fill="white" stroke="none"/>' +
        '<path d="M9.5 2.75L11.412 7.587L16.25 9.5L11.412 11.413L9.5 16.25L7.587 11.413L2.75 9.5L7.587 7.587L9.5 2.75Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        "</svg>"
    );
    btn.addEventListener("click", openPanel);
    return btn;
  }

  function isNativeVisible() {
    var btn = document.getElementById("assistant-entry");
    if (!btn) return false;
    if (btn.offsetParent === null) return false;
    var style = window.getComputedStyle(btn);
    if (style.display === "none" || style.visibility === "hidden") return false;
    var rect = btn.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function syncMobileToggle() {
    var mobileBtn = document.getElementById("dm-gm-mobile-toggle");
    var panel = document.getElementById("dm-gm-panel");
    if (!mobileBtn || !panel) return;
    if (panel.classList.contains("dm-gm-open")) {
      mobileBtn.style.display = "none";
      return;
    }
    mobileBtn.style.display = isNativeVisible() ? "none" : "flex";
  }

  function watchForNative() {
    tryBindNative();
    syncMobileToggle();
    var observer = new MutationObserver(function () {
      tryBindNative();
      syncMobileToggle();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncMobileToggle, 150);
    });
  }

  function init() {
    injectStyles();
    document.body.appendChild(buildPanel());
    document.body.appendChild(buildMobileToggle());
    watchForNative();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
