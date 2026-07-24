let detectedLogin = null;

function findLoginForm() {
  const passwordInputs = document.querySelectorAll('input[type="password"]');
  if (passwordInputs.length === 0) return null;

  const passwordInput = passwordInputs[0];
  const form = passwordInput.closest("form");

  let usernameInput = null;
  if (form) {
    usernameInput = form.querySelector('input[type="email"], input[type="text"]:not([type="password"])');
  } else {
    const inputs = document.querySelectorAll('input[type="email"], input[type="text"]');
    for (const input of inputs) {
      if (input.getBoundingClientRect().top < passwordInput.getBoundingClientRect().top) {
        usernameInput = input;
        break;
      }
    }
  }

  return { usernameInput, passwordInput, form };
}

function fillForm(username, password) {
  const login = findLoginForm();
  if (!login) return false;

  if (login.usernameInput) {
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeInputSetter.call(login.usernameInput, username);
    login.usernameInput.dispatchEvent(new Event("input", { bubbles: true }));
    login.usernameInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (login.passwordInput) {
    const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeInputSetter.call(login.passwordInput, password);
    login.passwordInput.dispatchEvent(new Event("input", { bubbles: true }));
    login.passwordInput.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return true;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "FILL_FORM") {
    const success = fillForm(message.username, message.password);
    sendResponse({ ok: success });
    return false;
  }

  if (message.type === "MATCHES_FOUND") {
    showAutofillBanner(message.resources);
    return false;
  }
});

function showAutofillBanner(resources) {
  const existing = document.getElementById("clickrypt-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "clickrypt-banner";
  banner.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 2147483647;
    background: #17293c; color: #e2e8f0; border: 1px solid #2a4055;
    border-radius: 8px; padding: 12px 16px; font-family: system-ui, sans-serif;
    font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); min-width: 240px;
  `;

  const title = document.createElement("div");
  title.textContent = "Clickrypt — Autofill available";
  title.style.cssText = "font-weight: 600; margin-bottom: 8px;";
  banner.appendChild(title);

  for (const r of resources) {
    const btn = document.createElement("button");
    btn.textContent = r.name;
    btn.style.cssText = `
      display: block; width: 100%; text-align: left; padding: 6px 12px;
      margin-bottom: 4px; background: #1a3349; color: #e2e8f0; border: none;
      border-radius: 6px; cursor: pointer; font-size: 13px;
    `;
    btn.onmouseover = () => { btn.style.background = "#2a4055"; };
    btn.onmouseout = () => { btn.style.background = "#1a3349"; };
    btn.onclick = () => {
      chrome.runtime.sendMessage({ type: "AUTOFILL", resourceId: r.id }, (res) => {
        if (res?.ok) {
          banner.remove();
        }
      });
    };
    banner.appendChild(btn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.style.cssText = `
    position: absolute; top: 4px; right: 8px; background: none; border: none;
    color: #5a7a95; cursor: pointer; font-size: 18px;
  `;
  closeBtn.onclick = () => banner.remove();
  banner.appendChild(closeBtn);

  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 15000);
}

function detectNewLogin() {
  const login = findLoginForm();
  if (!login || !login.form) return;

  login.form.addEventListener("submit", () => {
    const username = login.usernameInput?.value || "";
    const password = login.passwordInput?.value || "";
    if (!password) return;

    detectedLogin = {
      name: document.title || window.location.hostname,
      uri: window.location.href,
      username,
      password,
    };

    setTimeout(() => {
      showSavePrompt();
    }, 1000);
  });
}

function showSavePrompt() {
  if (!detectedLogin) return;

  const existing = document.getElementById("clickrypt-save-prompt");
  if (existing) existing.remove();

  const prompt = document.createElement("div");
  prompt.id = "clickrypt-save-prompt";
  prompt.style.cssText = `
    position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
    background: #17293c; color: #e2e8f0; border: 1px solid #2a4055;
    border-radius: 8px; padding: 16px; font-family: system-ui, sans-serif;
    font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); min-width: 280px;
  `;

  const title = document.createElement("div");
  title.textContent = "Save to Clickrypt?";
  title.style.cssText = "font-weight: 600; margin-bottom: 8px;";
  prompt.appendChild(title);

  const info = document.createElement("div");
  info.style.cssText = "font-size: 12px; color: #8ba3b8; margin-bottom: 12px;";
  info.textContent = `${detectedLogin.name} — ${detectedLogin.username}`;
  prompt.appendChild(info);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; gap: 8px;";

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save";
  saveBtn.style.cssText = "flex: 1; padding: 6px; background: #1ebbd4; color: white; border: none; border-radius: 6px; cursor: pointer;";
  saveBtn.onclick = () => {
    chrome.runtime.sendMessage({
      type: "SAVE_LOGIN",
      name: detectedLogin.name,
      uri: detectedLogin.uri,
      username: detectedLogin.username,
      password: detectedLogin.password,
    }, (res) => {
      if (res?.ok) {
        prompt.remove();
      } else {
        title.textContent = "Save failed — is vault unlocked?";
        title.style.color = "#f89c11";
      }
    });
  };
  btnRow.appendChild(saveBtn);

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "Skip";
  skipBtn.style.cssText = "flex: 1; padding: 6px; background: #2a4055; color: #e2e8f0; border: none; border-radius: 6px; cursor: pointer;";
  skipBtn.onclick = () => prompt.remove();
  btnRow.appendChild(skipBtn);

  prompt.appendChild(btnRow);
  document.body.appendChild(prompt);
  setTimeout(() => prompt.remove(), 30000);
}

detectNewLogin();
