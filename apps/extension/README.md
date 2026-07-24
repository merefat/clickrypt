# Clickrypt Browser Extension

A Manifest V3 Chrome extension for autofilling and saving passwords from your Clickrypt vault.

## Features

- **Unlock flow**: Enter email + passphrase to decrypt your private key in extension memory
- **Autofill**: Detects login forms on web pages and matches them to vault entries by URI
- **Save-on-submit**: Detects new login submissions and prompts to save to vault
- **Vault sync**: Fetches resources from the Clickrypt API
- **Popup UI**: Browse vault entries, autofill current tab, sync, and lock

## Development

### Prerequisites
- Clickrypt API running at `http://localhost:3001`
- Crypto package built (`npx pnpm --filter @clickrypt/crypto build`)

### Build the crypto bundle
```bash
node build-crypto.mjs
```

### Load the extension in Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `apps/extension/` directory

### Usage
1. Click the Clickrypt icon in the toolbar
2. Enter your email and passphrase to unlock
3. On login pages, matching vault entries will appear as a banner
4. Submit a login form to get a save prompt

## Files

- `manifest.json` — MV3 manifest
- `background.js` — Service worker (auth, vault sync, autofill, save)
- `content.js` — Content script (form detection, fill, save prompt)
- `popup.html` / `popup.js` — Extension popup UI
- `crypto-bundle.js` — Bundled `@clickrypt/crypto` for browser usage
- `build-crypto.mjs` — Build script for the crypto bundle
