# AEZAKMI Pro v3.0.5

Antidetect browser with Camoufox engine (Firefox fork with native C++ fingerprint protection).

## Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Tauri 2 (Rust)
- **Browser Engine:** Camoufox (downloads at first launch)
- **Proxy:** Firefox WebExtension (HTTP/HTTPS/SOCKS4/SOCKS5 with auth)

## Development

```bash
pnpm install
pnpm exec tauri dev
```

## Build

```bash
pnpm exec tauri build
```

Output: `src-tauri/target/release/bundle/nsis/AEZAKMI_3.0.5_x64-setup.exe`

## Project Structure

```
src/                  # React frontend
  components/         # UI components (ProfileModal, ProxyModal, etc.)
  pages/              # Dashboard, Index
  lib/                # Utilities (updater, geoip, license, etc.)
scripts/
  launch_playwright.cjs  # Camoufox launcher (called by Rust backend)
  prepare-bundle.cjs     # Build-time bundler (node.exe + scripts)
src-tauri/
  src/lib.rs          # Rust backend (profile launch, Camoufox download, updater)
  tauri.conf.json     # Tauri config (NSIS installer)
```
