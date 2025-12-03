#!/usr/bin/env node
// scripts/launch_playwright.js
// Usage: node scripts/launch_playwright.js '<base64-encoded-json>'
// The JSON shape expected: { profileDir: string, args: string[], proxy?: { server?: string, username?: string, password?: string }, url?: string }

import { chromium } from 'playwright';
// proxy-chain is imported dynamically below when needed. We avoid a top-level
// import so missing package won't crash the script; we fallback to passing
// credentials directly if proxy-chain is not available.
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
  // Playwright expects userDataDir via the first argument to launchPersistentContext,
  // so remove any --user-data-dir from args to avoid warnings/errors.
  args = args.filter(a => !a.startsWith('--user-data-dir'));
  // Remove any proxy args; proxy should be provided via the `proxy` option.
  args = args.filter(a => !a.startsWith('--proxy-server'));
    const url = payload.url || 'about:blank';

    // Normal launch options (remove noisy verbose flags from diagnostics)
    const launchOptions = {
      headless: false,
      args: [...args],
    };

    let anonymizedProxy = null;
    if (payload.proxy && payload.proxy.server) {
      // If credentials are provided, try to anonymize the upstream proxy
      // using proxy-chain so Chromium can connect to a local unauthenticated
      // proxy that forwards to the upstream with auth. This also helps for
      // SOCKS proxies which may not support auth in Chromium directly.
      const { server, username, password } = payload.proxy;
      if (username && password) {
        // insert credentials into upstream URL if missing
        try {
          const url = new URL(server);
          if (!url.username && !url.password) {
            url.username = username;
            url.password = password;
          }
          const upstream = url.toString();
          // dynamic import proxy-chain to avoid hard dependency
          try {
            const mod = await import('proxy-chain');
            ProxyChain = mod.default || mod;
          } catch (impErr) {
            ProxyChain = null;
          }

          if (ProxyChain) {
            anonymizedProxy = await ProxyChain.anonymizeProxy(upstream);
            // set Playwright proxy option and explicit Chromium arg so it uses the anonymizer
            launchOptions.proxy = { server: anonymizedProxy };
            launchOptions.args.push(`--proxy-server=${anonymizedProxy.replace('http://', '')}`);
          } else {
            // fallback: pass credentials directly (may fail for some proxy types)
            launchOptions.proxy = { server, username, password };
            try {
              const u = new URL(server);
              launchOptions.args.push(`--proxy-server=${u.host}`);
            } catch (e) {
              // ignore
            }
          }
        } catch (e) {
          console.error('proxy-chain anonymize failed:', e);
          // fallback: pass credentials directly (may fail for some proxy types)
          launchOptions.proxy = { server, username, password };
        }
      } else {
        launchOptions.proxy = {
          server: payload.proxy.server,
          username: payload.proxy.username || undefined,
          password: payload.proxy.password || undefined,
        };
      }
    }

    // Use persistent context so userDataDir is used
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: launchOptions.headless,
      args: launchOptions.args,
      proxy: launchOptions.proxy,
    });

    const page = context.pages().length ? context.pages()[0] : await context.newPage();

    // Minimal listeners; avoid noisy logging in production
    page.on('requestfailed', (req) => {
      console.warn('[requestfailed]', req.url(), req.failure()?.errorText);
    });

    try {
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    } catch (err) {
      // navigation can fail; report minimally
      console.warn('page.goto failed:', err?.message || err);
    }

    // Optional: try an in-browser fetch to ipify to verify what IP the browser sees
    try {
      const ip = await page.evaluate(() => fetch('https://api.ipify.org').then(r => r.text()).catch(() => null));
  if (ip) console.debug('browser-seen IP:', ip);
    } catch (e) {
      // ignore
    }

    // Keep process alive until the browser is closed
  console.debug('Playwright launched; waiting for browser to close...');

    try {
      // wait indefinitely until the browser is closed by user
      await context.waitForEvent('close', { timeout: 0 });
    } catch (err) {
      console.error('waitForEvent close error:', err);
    }

    try {
      await context.close();
    } catch (err) {
      console.error('context.close error:', err);
    }

    // If we created an anonymized proxy, shut it down when done
    if (anonymizedProxy) {
      try {
        await ProxyChain.closeAnonymizedProxy(anonymizedProxy);
      } catch (e) {
        // ignore
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('launch_playwright error:', err);
    process.exit(1);
  }
}

main();
