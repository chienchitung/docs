(function () {
  "use strict";

  var STORAGE_KEY = "dm_gemini_api_key";
  var MODEL = "gemini-3.6-flash";
  var API_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    MODEL +
    ":generateContent";
  var MAX_CONTEXT_CHARS = 6000;
  var SYSTEM_PREFIX =
    "你是 Data Machi 文件網站的問答助手，使用繁體中文回答。以下是使用者目前所在頁面的內容，" +
    "請優先根據這些內容回答使用者的問題；如果頁面內容沒有涵蓋，也可以根據你自己的知識回答，" +
    "並清楚說明這部分是額外補充而非頁面原文。回答請簡潔、有條理。\n\n頁面內容：\n";

  if (document.getElementById("dm-gm-toggle")) return;

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

  function injectStyles() {
    var css =
      "#dm-gm-toggle{position:fixed;right:20px;bottom:20px;z-index:999999;width:56px;height:56px;" +
      "border-radius:50%;border:none;background:#16A34A;color:#fff;cursor:pointer;" +
      "box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;}" +
      "#dm-gm-toggle:hover{background:#15803D;}" +
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
      ".dm-gm-msg{margin-bottom:10px;font-size:13.5px;line-height:1.55;white-space:pre-wrap;}" +
      ".dm-gm-msg.user{text-align:right;}" +
      ".dm-gm-msg.user .dm-gm-bubble{background:#16A34A;color:#fff;}" +
      ".dm-gm-msg.model .dm-gm-bubble{background:#f1f5f9;color:#0f172a;}" +
      "@media (prefers-color-scheme: dark){.dm-gm-msg.model .dm-gm-bubble{background:#1e293b;color:#e2e8f0;}}" +
      ".dm-gm-msg.error .dm-gm-bubble{background:#fee2e2;color:#991b1b;}" +
      ".dm-gm-bubble{display:inline-block;padding:8px 12px;border-radius:12px;max-width:90%;}" +
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

  function buildToggle() {
    var btn = el(
      "button",
      { id: "dm-gm-toggle", "aria-label": "開啟 AI 問答小幫手" },
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M4 4h16v12H7l-3 3V4z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>' +
        "</svg>"
    );
    btn.addEventListener("click", function () {
      var panel = document.getElementById("dm-gm-panel");
      var open = panel.classList.toggle("dm-gm-open");
      if (open) render();
    });
    return btn;
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
    var cls = "dm-gm-msg " + role;
    var msg = el("div", { class: cls });
    var bubble = el("span", { class: "dm-gm-bubble" });
    bubble.textContent = text;
    msg.appendChild(bubble);
    return msg;
  }

  function appendAndSend(question, body, sendBtn, textarea) {
    history.push({ role: "user", text: question });
    body.appendChild(renderMessage("user", question));
    var loading = renderMessage("model", "思考中…");
    body.appendChild(loading);
    body.scrollTop = body.scrollHeight;

    busy = true;
    sendBtn.disabled = true;
    textarea.disabled = true;

    askGemini(question)
      .then(function (answer) {
        loading.remove();
        history.push({ role: "model", text: answer });
        body.appendChild(renderMessage("model", answer));
        body.scrollTop = body.scrollHeight;
      })
      .catch(function (err) {
        loading.remove();
        body.appendChild(renderMessage("error", err.message || "發生未知錯誤"));
        body.scrollTop = body.scrollHeight;
      })
      .finally(function () {
        busy = false;
        sendBtn.disabled = false;
        textarea.disabled = false;
        textarea.focus();
      });
  }

  function askGemini(question) {
    var apiKey = getApiKey();
    if (!apiKey) return Promise.reject(new Error("尚未設定 API Key"));

    var contents = history
      .filter(function (t) {
        return t.role === "user" || t.role === "model";
      })
      .map(function (t) {
        return { role: t.role, parts: [{ text: t.text }] };
      });
    contents.push({ role: "user", parts: [{ text: question }] });

    var body = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: SYSTEM_PREFIX + getPageContext() }],
      },
    };

    return fetch(API_URL + "?key=" + encodeURIComponent(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) {
          return res
            .json()
            .catch(function () {
              return null;
            })
            .then(function (data) {
              var msg = data && data.error && data.error.message;
              if (res.status === 400 || res.status === 403) {
                throw new Error("API Key 無效或沒有權限，請按右上角齒輪重新設定。（" + (msg || res.status) + "）");
              }
              if (res.status === 429) {
                throw new Error("已達 Gemini API 用量上限，請稍後再試。");
              }
              throw new Error("請求失敗（HTTP " + res.status + "）：" + (msg || ""));
            });
        }
        return res.json();
      })
      .then(function (data) {
        var parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
        var text = parts ? parts.map(function (p) { return p.text || ""; }).join("") : "";
        return text || "（沒有取得回應內容）";
      });
  }

  function findNativeAssistantButton() {
    var scopeEls = document.querySelectorAll(
      "header, nav, [class*='nav' i], [class*='header' i]"
    );
    var scopes = scopeEls.length ? scopeEls : [document.body];
    for (var s = 0; s < scopes.length; s++) {
      var candidates = scopes[s].querySelectorAll("button, a, [role='button']");
      for (var i = 0; i < candidates.length; i++) {
        var node = candidates[i];
        if (node.id === "dm-gm-toggle" || node.closest("#dm-gm-panel")) continue;
        var text = (node.textContent || "").trim().toLowerCase();
        var aria = (node.getAttribute("aria-label") || "").toLowerCase();
        if (text.length > 40) continue;
        var isMatch =
          text.indexOf("ask assistant") !== -1 ||
          aria.indexOf("ask assistant") !== -1 ||
          (aria.indexOf("assistant") !== -1 && aria.length < 40);
        if (isMatch) {
          var rect = node.getBoundingClientRect();
          if (rect.top < 200) return node;
        }
      }
    }
    return null;
  }

  var nativeHidden = false;
  function tryHideNative() {
    if (nativeHidden) return true;
    var btn = findNativeAssistantButton();
    if (btn) {
      btn.style.display = "none";
      nativeHidden = true;
      return true;
    }
    return false;
  }

  function watchForNative() {
    if (tryHideNative()) return;
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (tryHideNative() || attempts > 20) clearInterval(interval);
    }, 400);
    var observer = new MutationObserver(function () {
      if (tryHideNative()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      observer.disconnect();
    }, 15000);
  }

  function init() {
    injectStyles();
    document.body.appendChild(buildToggle());
    document.body.appendChild(buildPanel());
    watchForNative();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
