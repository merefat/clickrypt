const content = document.getElementById("content");

function renderLogin() {
  content.innerHTML = `
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="email" placeholder="you@example.com" />
    </div>
    <div class="form-group">
      <label>Passphrase</label>
      <input type="password" id="passphrase" placeholder="Your passphrase" />
    </div>
    <button class="btn" id="loginBtn">Unlock Vault</button>
    <div id="msg"></div>
  `;

  document.getElementById("loginBtn").addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const passphrase = document.getElementById("passphrase").value;
    const msg = document.getElementById("msg");
    const btn = document.getElementById("loginBtn");

    if (!email || !passphrase) {
      msg.innerHTML = '<div class="error">Enter email and passphrase</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = "Unlocking…";
    msg.innerHTML = "";

    chrome.runtime.sendMessage(
      { type: "LOGIN", email, passphrase },
      (res) => {
        btn.disabled = false;
        btn.textContent = "Unlock Vault";
        if (res?.ok) {
          renderVault();
        } else {
          msg.innerHTML = `<div class="error">${res?.error || "Login failed"}</div>`;
        }
      }
    );
  });
}

function renderVault() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
    if (!state?.unlocked) {
      renderLogin();
      return;
    }

    if (state.resources.length === 0) {
      content.innerHTML = `
        <p class="empty">No passwords in your vault yet.</p>
        <button class="btn btn-secondary" id="syncBtn">Sync Vault</button>
        <button class="lock-btn" id="lockBtn">Lock Vault</button>
      `;
    } else {
      const items = state.resources
        .map(
          (r) => `
        <li class="vault-item" data-id="${r.id}">
          <div>
            <div class="name">${escapeHtml(r.name)}</div>
            ${r.uri ? `<div class="uri">${escapeHtml(r.uri)}</div>` : ""}
          </div>
          <button class="fill-btn" data-id="${r.id}">Fill</button>
        </li>
      `
        )
        .join("");

      content.innerHTML = `
        <ul class="vault-list">${items}</ul>
        <button class="btn btn-secondary" id="syncBtn" style="margin-top: 8px;">Sync Vault</button>
        <button class="lock-btn" id="lockBtn">Lock Vault</button>
        <div id="msg"></div>
      `;
    }

    document.querySelectorAll(".fill-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const resourceId = btn.dataset.id;
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          chrome.runtime.sendMessage(
            { type: "AUTOFILL", resourceId, tabId: tabs[0].id },
            (res) => {
              const msg = document.getElementById("msg");
              if (res?.ok) {
                msg.innerHTML = '<div class="success">Filled!</div>';
              } else {
                msg.innerHTML = `<div class="error">${res?.error || "Fill failed"}</div>`;
              }
              setTimeout(() => { if (msg) msg.innerHTML = ""; }, 3000);
            }
          );
        });
      });
    });

    const syncBtn = document.getElementById("syncBtn");
    if (syncBtn) {
      syncBtn.addEventListener("click", () => {
        syncBtn.textContent = "Syncing…";
        chrome.runtime.sendMessage({ type: "SYNC_VAULT" }, (res) => {
          if (res?.ok) {
            renderVault();
          } else {
            syncBtn.textContent = "Sync Failed";
            setTimeout(() => renderVault(), 2000);
          }
        });
      });
    }

    document.getElementById("lockBtn").addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "LOCK" }, () => renderLogin());
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

chrome.runtime.sendMessage({ type: "GET_STATE" }, (state) => {
  if (state?.unlocked) {
    renderVault();
  } else {
    renderLogin();
  }
});
