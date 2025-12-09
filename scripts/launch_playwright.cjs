#!/usr/bin/env node
// CommonJS version of launch_playwright for pkg bundling
// Usage: node scripts/launch_playwright.cjs '<base64-encoded-json>'

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
let ProxyChain = null;

// Find bundled Node.js runtime or system node
function getBundledNodePath() {
  // When running from pkg bundle, __dirname points to snapshot filesystem
  // Try to find node-runtime in app directory
  const exePath = process.execPath;
  const appDir = path.dirname(exePath);
  
  // Check for bundled node-runtime
  const bundledNodePaths = [
    path.join(appDir, 'node-runtime', 'node.exe'),
    path.join(appDir, '..', 'node-runtime', 'node.exe'),
    path.join(appDir, 'resources', 'node-runtime', 'node.exe'),
  ];
  
  for (const nodePath of bundledNodePaths) {
    if (fs.existsSync(nodePath)) {
      console.log('Found bundled Node.js at:', nodePath);
      return { node: nodePath, npx: path.join(path.dirname(nodePath), 'npx.cmd') };
    }
  }
  
  // Fallback to system node
  return { node: 'node', npx: process.platform === 'win32' ? 'npx.cmd' : 'npx' };
}

// Auto-install Chromium if not present
async function ensureChromiumInstalled() {
  // Check if chromium is already available
  try {
    const executablePath = chromium.executablePath();
    if (fs.existsSync(executablePath)) {
      console.log('Chromium browser already installed at:', executablePath);
      return;
    }
  } catch (e) {
    console.log('Chromium browser not found, will attempt installation...');
  }

  // Try to auto-install
  try {
    console.log('Installing Chromium browser...');
    console.log('This may take a few minutes on first launch.');
    
    const { npx } = getBundledNodePath();
    const installCmd = `"${npx}" playwright install chromium`;
    
    execSync(installCmd, { 
      stdio: 'inherit',
      timeout: 600000, // 10 minutes timeout
      env: { ...process.env },
      shell: true
    });
    
    console.log('Chromium browser installed successfully!');
    
    // Verify installation
    const executablePath = chromium.executablePath();
    if (fs.existsSync(executablePath)) {
      console.log('Verified Chromium at:', executablePath);
    } else {
      throw new Error('Installation completed but browser not found');
    }
  } catch (installError) {
    console.error('Failed to auto-install Chromium:', installError.message);
    console.error('\nChromium browser is required for this application.');
    throw new Error('Chromium browser not available.');
  }
}

async function main() {
  try {
    const argv = process.argv.slice(2 || 0);
    if (argv.includes('--help') || argv.includes('-h')) {
      console.log('Usage: node scripts/launch_playwright.cjs <base64-payload>');
      console.log('       node scripts/launch_playwright.cjs --dry-run');
      console.log('Options:\n  --dry-run    Run smoke test and exit 0 without launching browser\n  --help,-h    Show this help');
      process.exit(0);
    }

    if (argv.includes('--dry-run')) {
      console.log('Dry-run OK (no payload required)');
      process.exit(0);
    }

    // Ensure Chromium is installed before launching
    await ensureChromiumInstalled();

    const payloadB64 = argv[0];
    if (!payloadB64) {
      throw new Error('Missing payload argument (or use --dry-run)');
    }

    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    const payload = JSON.parse(json);

    const profileDir = payload.profileDir || `./playwright-profile-${Date.now()}`;
    let args = payload.args || [];
    args = args.filter(a => !a.startsWith('--user-data-dir'));
    args = args.filter(a => !a.startsWith('--proxy-server'));
    const url = payload.url || 'about:blank';

    const launchOptions = { headless: false, args: [...args] };

    let anonymizedProxy = null;
    if (payload.proxy && payload.proxy.server) {
      const { server, username, password } = payload.proxy;
      if (username && password) {
        try {
          let upstream = server;
          try { const tmp = new URL(server); if (!tmp.username && !tmp.password) { tmp.username = username; tmp.password = password; upstream = tmp.toString(); } } catch(e) {}
          try {
            // try to require proxy-chain if available
            ProxyChain = require('proxy-chain');
          } catch (impErr) {
            ProxyChain = null;
          }

          if (ProxyChain) {
            anonymizedProxy = await ProxyChain.anonymizeProxy(upstream);
            launchOptions.proxy = { server: anonymizedProxy };
            launchOptions.args.push(`--proxy-server=${anonymizedProxy.replace('http://','')}`);
          } else {
            launchOptions.proxy = { server, username, password };
            try { const u = new URL(server); launchOptions.args.push(`--proxy-server=${u.host}`); } catch (e) {}
          }
        } catch (e) {
          launchOptions.proxy = { server, username, password };
        }
      } else {
        launchOptions.proxy = { server: payload.proxy.server, username: payload.proxy.username || undefined, password: payload.proxy.password || undefined };
      }
    }

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: launchOptions.headless,
      args: launchOptions.args,
      proxy: launchOptions.proxy,
    });

    const page = context.pages().length ? context.pages()[0] : await context.newPage();

    page.on('requestfailed', (req) => {
      try { console.warn('[requestfailed]', req.url(), req.failure()?.errorText); } catch(e){}
    });

    try { await page.goto(url, { waitUntil: 'load', timeout: 60000 }); } catch (err) { console.warn('page.goto failed:', err && err.message ? err.message : err); }

    try {
      const ip = await page.evaluate(() => fetch('https://api.ipify.org').then(r => r.text()).catch(() => null));
      if (ip) console.debug('browser-seen IP:', ip);
    } catch (e) {}

    console.debug('Playwright launched; waiting for browser to close...');
    try { await context.waitForEvent('close', { timeout: 0 }); } catch (err) {}
    try { await context.close(); } catch (err) {}

    if (anonymizedProxy && ProxyChain && ProxyChain.closeAnonymizedProxy) {
      try { await ProxyChain.closeAnonymizedProxy(anonymizedProxy); } catch (e) {}
    }

    process.exit(0);
  } catch (err) {
    console.error('launch_playwright error:', err);
    process.exit(1);
  }
}

main();
