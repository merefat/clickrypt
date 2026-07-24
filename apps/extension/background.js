const API_BASE = "http://localhost:4001/api/v1";

let vaultState = {
  accessToken: null,
  privateKey: null,
  resources: [],
  unlocked: false,
};

// Restore state from chrome.storage on service worker restart (MV3)
chrome.storage.local.get(["cp_at", "cp_priv"], (result) => {
  if (result.cp_at && result.cp_priv) {
    vaultState.accessToken = result.cp_at;
    vaultState.privateKey = result.cp_priv;
    vaultState.unlocked = true;
    syncVault().catch(() => {});
  }
});

// Authenticated fetch wrapper with token refresh on 401
async function apiFetch(path, options = {}) {
  const headers = { ...options.headers };
  if (vaultState.accessToken) {
    headers["Authorization"] = `Bearer ${vaultState.accessToken}`;
  }
  let res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });

  if (res.status === 401 && vaultState.accessToken) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      vaultState.accessToken = data.accessToken;
      chrome.storage.local.set({ cp_at: data.accessToken });
      headers["Authorization"] = `Bearer ${vaultState.accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
    }
  }

  return res;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOGIN") {
    handleLogin(message.email, message.passphrase)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "LOCK") {
    if (syncSocket) { syncSocket.disconnect(); syncSocket = null; }
    vaultState = { accessToken: null, privateKey: null, resources: [], unlocked: false };
    chrome.storage.local.remove(["cp_at", "cp_priv"]);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "GET_STATE") {
    sendResponse({
      unlocked: vaultState.unlocked,
      resources: vaultState.resources.map((r) => ({ id: r.id, name: r.name, uri: r.uri })),
    });
    return false;
  }

  if (message.type === "AUTOFILL") {
    const tabId = message.tabId || (sender.tab && sender.tab.id);
    autofillResource(message.resourceId, tabId)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "SAVE_LOGIN") {
    saveLogin(message.name, message.uri, message.username, message.password)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "SYNC_VAULT") {
    syncVault()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleLogin(email, passphrase) {
  const verifyRes = await apiFetch("/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!verifyRes.ok) throw new Error("User not found");
  const verifyData = await verifyRes.json();

  const { decryptWithPassphrase, decryptMessage } = await import("./crypto-bundle.js");
  const privateKeyArmored = await decryptWithPassphrase(verifyData.encryptedPrivateKey, passphrase);

  const { plaintext: token } = await decryptMessage(verifyData.challenge, privateKeyArmored);

  const loginRes = await apiFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, token }),
  });
  if (!loginRes.ok) throw new Error("Login failed");
  const loginData = await loginRes.json();

  vaultState.accessToken = loginData.accessToken;
  vaultState.privateKey = privateKeyArmored;
  vaultState.unlocked = true;

  chrome.storage.local.set({ cp_at: loginData.accessToken, cp_priv: privateKeyArmored });

  await syncVault();
  connectSync();

  return { ok: true };
}

let syncSocket = null;

function connectSync() {
  if (syncSocket) syncSocket.disconnect();

  // Dynamic import of socket.io-client bundled via esbuild
  import("./socket-bundle.js")
    .then(({ io }) => {
      syncSocket = io(`${API_BASE.replace("/api/v1", "")}/sync`, {
        auth: { token: vaultState.accessToken },
        transports: ["websocket"],
      });

      syncSocket.on("sync", (event) => {
        if (event.type === "resource:create" || event.type === "resource:delete" || event.type === "folder:create" || event.type === "folder:delete") {
          syncVault().catch(() => {});
        }
      });

      syncSocket.on("disconnect", () => {
        syncSocket = null;
      });
    })
    .catch(() => {
      // socket-bundle.js not built yet — skip sync
    });
}

async function syncVault() {
  if (!vaultState.accessToken) return { error: "Not unlocked" };

  const res = await apiFetch("/resources");
  if (!res.ok) return { error: "Failed to fetch resources" };

  vaultState.resources = await res.json();
  return { ok: true, count: vaultState.resources.length };
}

async function autofillResource(resourceId, tabId) {
  if (!vaultState.accessToken || !vaultState.privateKey) {
    return { error: "Vault is locked" };
  }

  const res = await apiFetch(`/resources/${resourceId}/secret`);
  if (!res.ok) return { error: "Failed to fetch secret" };

  const { encryptedData } = await res.json();
  const { decryptMessage } = await import("./crypto-bundle.js");
  const { plaintext } = await decryptMessage(encryptedData, vaultState.privateKey);
  const secret = JSON.parse(plaintext);

  await chrome.tabs.sendMessage(tabId, {
    type: "FILL_FORM",
    username: secret.username || "",
    password: secret.password || "",
  });

  return { ok: true };
}

async function saveLogin(name, uri, username, password) {
  if (!vaultState.accessToken || !vaultState.privateKey) {
    return { error: "Vault is locked" };
  }

  const { encryptMessage, getPublicKeyFromPrivateKey } = await import("./crypto-bundle.js");
  const publicKey = await getPublicKeyFromPrivateKey(vaultState.privateKey);
  const secretPayload = JSON.stringify({ username, password, notes: "" });
  const encryptedData = await encryptMessage(secretPayload, [publicKey]);

  const res = await apiFetch("/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      uri,
      encryptedData,
      metadata: { username },
    }),
  });

  if (!res.ok) return { error: "Failed to save" };

  await syncVault();
  return { ok: true };
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !vaultState.unlocked) return;
  if (!tab.url) return;

  const url = new URL(tab.url);
  const matching = vaultState.resources.filter(
    (r) => r.uri && url.hostname.includes(new URL(r.uri).hostname)
  );

  if (matching.length > 0) {
    await chrome.tabs.sendMessage(tabId, {
      type: "MATCHES_FOUND",
      resources: matching.map((r) => ({ id: r.id, name: r.name })),
    });
  }
});
