#!/usr/bin/env node
// CommonJS version of launch_playwright for pkg bundling
// Usage: node scripts/launch_playwright.cjs '<base64-encoded-json>'

const { chromium } = require('playwright');
let ProxyChain = null;

async function main() {
  try {
    const payloadB64 = process.argv[2];
    if (!payloadB64) {
      throw new Error('Missing payload argument');
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
