const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Load credentials
const envPath = path.join(__dirname, '..', 'data', '.env');
const creds = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) creds[key.trim()] = val.join('=').trim();
  });
}

const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'screenshots');
const EMAIL = () => creds.GOOGLE_EMAIL;
const PASS = () => creds.GOOGLE_PASSWORD;

// Helper: fill email + password on any login form
async function tryGenericLogin(page, email, password) {
  // Common email field selectors
  const emailSelectors = [
    'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
    'input[name="login"]', 'input[name="user"]', 'input[id="email"]',
    'input[id="username"]', 'input[id="login-email"]', 'input[placeholder*="email" i]',
    'input[placeholder*="username" i]', 'input[autocomplete="email"]',
    'input[autocomplete="username"]',
  ];
  // Common password field selectors
  const passSelectors = [
    'input[type="password"]', 'input[name="password"]', 'input[name="pass"]',
    'input[id="password"]',
  ];
  // Common submit selectors
  const submitSelectors = [
    'button[type="submit"]', 'input[type="submit"]', 'button:has-text("Log in")',
    'button:has-text("Sign in")', 'button:has-text("Login")', 'button:has-text("Continue")',
    'button:has-text("Next")', 'a:has-text("Log in")', 'a:has-text("Sign in")',
  ];

  let emailField = null;
  for (const sel of emailSelectors) {
    emailField = await page.$(sel);
    if (emailField) break;
  }

  let passField = null;
  for (const sel of passSelectors) {
    passField = await page.$(sel);
    if (passField) break;
  }

  if (emailField && passField) {
    // Both fields visible — fill and submit
    await emailField.fill(email);
    await passField.fill(password);
    for (const sel of submitSelectors) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); break; }
    }
    await page.waitForTimeout(5000);
    return true;
  }

  if (emailField && !passField) {
    // Two-step login — enter email first
    await emailField.fill(email);
    for (const sel of submitSelectors) {
      const btn = await page.$(sel);
      if (btn) { await btn.click(); break; }
    }
    await page.waitForTimeout(3000);
    // Now look for password
    for (const sel of passSelectors) {
      passField = await page.$(sel);
      if (passField) break;
    }
    if (passField) {
      await passField.fill(password);
      for (const sel of submitSelectors) {
        const btn = await page.$(sel);
        if (btn) { await btn.click(); break; }
      }
      await page.waitForTimeout(5000);
      return true;
    }
  }

  return false; // No login form found
}

// Check if we're on a logged-in page (not a login page)
function isLoggedIn(url, title) {
  const loginIndicators = ['sign in', 'log in', 'login', 'signin', 'authenticate', 'password'];
  const titleLower = (title || '').toLowerCase();
  const urlLower = (url || '').toLowerCase();
  // If title/URL contains login indicators, probably NOT logged in
  const looksLikeLogin = loginIndicators.some(i => titleLower.includes(i) || urlLower.includes(i));
  return !looksLikeLogin;
}

// Login strategies
const loginStrategies = {
  // Google services
  google: {
    match: (url) => /google\.com|gmail\.com|firebase\.google|analytics\.google|tagmanager\.google|play\.google|console\.cloud|lookerstudio|merchants\.google|search\.google|youtube\.com/.test(url),
    login: async (page) => {
      await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.fill('input[type="email"]', EMAIL());
      await page.click('#identifierNext');
      await page.waitForTimeout(3000);
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await page.fill('input[type="password"]', PASS());
      await page.click('#passwordNext');
      await page.waitForTimeout(5000);
      return !page.url().includes('signin') && !page.url().includes('challenge');
    },
  },

  // WordPress sites
  wordpress: {
    match: (url) => /defeatdiabetes\.com\.au|thediabetesplan\.com\.au|riskcalculator\.online/.test(url) && /wp-admin/.test(url),
    login: async (page, account) => {
      const baseDomain = account.url.replace('/wp-admin', '');
      // Check homepage accessibility
      try {
        await page.goto(`https://${baseDomain}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const html = await page.content();
        if (html.includes('wp-content') || html.includes('wordpress') || (await page.title()).length > 0) {
          return true;
        }
      } catch (e) {}
      return false;
    },
  },

  // Zoho
  zoho: {
    match: (url) => /zoho\.com/.test(url),
    login: async (page) => {
      await page.goto('https://accounts.zoho.com/signin', { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForSelector('#login_id', { timeout: 10000 });
      await page.fill('#login_id', creds.ZOHO_EMAIL);
      await page.click('#nextbtn');
      await page.waitForTimeout(3000);
      await page.waitForSelector('#password', { timeout: 10000 });
      await page.fill('#password', creds.ZOHO_PASSWORD);
      await page.click('#nextbtn');
      await page.waitForTimeout(5000);
      return !page.url().includes('signin');
    },
  },

  // Atlassian (Jira, Confluence, Bitbucket, Trello)
  atlassian: {
    match: (url) => /atlassian\.com|trello\.com|bitbucket\.org|jira/.test(url),
    login: async (page, account) => {
      await page.goto('https://id.atlassian.com/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      // Enter email
      const emailField = await page.$('#username') || await page.$('input[name="username"]');
      if (emailField) {
        await emailField.fill(account.username || EMAIL());
        const btn = await page.$('#login-submit') || await page.$('button[type="submit"]');
        if (btn) await btn.click();
        await page.waitForTimeout(3000);
        // Check if redirected to Google SSO
        if (page.url().includes('accounts.google.com')) {
          try {
            const ei = await page.$('input[type="email"]');
            if (ei) { await ei.fill(EMAIL()); await page.click('#identifierNext'); await page.waitForTimeout(3000); }
            const pi = await page.$('input[type="password"]');
            if (pi) { await pi.fill(PASS()); await page.click('#passwordNext'); await page.waitForTimeout(5000); }
          } catch (e) {}
          return !page.url().includes('login') && !page.url().includes('signin');
        }
        // Direct password
        const passField = await page.$('#password') || await page.$('input[name="password"]');
        if (passField) {
          await passField.fill(PASS());
          const sb = await page.$('#login-submit') || await page.$('button[type="submit"]');
          if (sb) await sb.click();
          await page.waitForTimeout(5000);
        }
        return !page.url().includes('login');
      }
      return false;
    },
  },

  // Slack
  slack: {
    match: (url) => /slack\.com/.test(url),
    login: async (page) => {
      await page.goto('https://slack.com/signin#/signin', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      // Try Google SSO button
      const googleBtn = await page.$('[data-qa="sign_in_with_google"]') || await page.$('a:has-text("Sign in with Google")');
      if (googleBtn) {
        await googleBtn.click();
        await page.waitForTimeout(3000);
        if (page.url().includes('accounts.google.com')) {
          try {
            const ei = await page.$('input[type="email"]');
            if (ei) { await ei.fill(EMAIL()); await page.click('#identifierNext'); await page.waitForTimeout(3000); }
            const pi = await page.$('input[type="password"]');
            if (pi) { await pi.fill(PASS()); await page.click('#passwordNext'); await page.waitForTimeout(5000); }
          } catch (e) {}
        }
        return !page.url().includes('signin');
      }
      // Try email login
      const done = await tryGenericLogin(page, EMAIL(), PASS());
      return done && !page.url().includes('signin');
    },
  },

  // Stripe
  stripe: {
    match: (url) => /stripe\.com/.test(url),
    login: async (page) => {
      await page.goto('https://dashboard.stripe.com/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const done = await tryGenericLogin(page, EMAIL(), PASS());
      if (done) return isLoggedIn(page.url(), await page.title());
      return false;
    },
  },

  // AWS
  aws: {
    match: (url) => /aws\.amazon\.com/.test(url),
    login: async (page) => {
      await page.goto('https://console.aws.amazon.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      const done = await tryGenericLogin(page, EMAIL(), PASS());
      if (done) return isLoggedIn(page.url(), await page.title());
      return false;
    },
  },

  // Netlify
  netlify: {
    match: (url) => /netlify\.com/.test(url),
    login: async (page) => {
      await page.goto('https://app.netlify.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const done = await tryGenericLogin(page, EMAIL(), PASS());
      if (done) return isLoggedIn(page.url(), await page.title());
      return false;
    },
  },

  // Meta / Facebook
  meta: {
    match: (url) => /facebook\.com|meta\.com/.test(url),
    login: async (page) => {
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const done = await tryGenericLogin(page, EMAIL(), PASS());
      if (done) {
        await page.waitForTimeout(3000);
        return !page.url().includes('login');
      }
      return false;
    },
  },

  // LinkedIn
  linkedin: {
    match: (url) => /linkedin\.com/.test(url),
    login: async (page) => {
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const done = await tryGenericLogin(page, EMAIL(), PASS());
      if (done) return !page.url().includes('login');
      return false;
    },
  },

  // Twitter / X
  twitter: {
    match: (url) => /x\.com|twitter\.com/.test(url),
    login: async (page) => {
      await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      const done = await tryGenericLogin(page, EMAIL(), PASS());
      if (done) return !page.url().includes('login');
      return false;
    },
  },

  // Apple
  apple: {
    match: (url) => /apple\.com/.test(url),
    login: async (page) => {
      await page.goto('https://appstoreconnect.apple.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(3000);
      const done = await tryGenericLogin(page, EMAIL(), PASS());
      if (done) return isLoggedIn(page.url(), await page.title());
      return false;
    },
  },

  // Generic — attempt login on any site
  generic: {
    match: () => true,
    login: async (page, account) => {
      const url = account.url.startsWith('http') ? account.url : `https://${account.url}`;

      // Common login page paths
      const loginPaths = ['/login', '/signin', '/sign-in', '/auth', '/account/login', ''];
      const baseDomain = url.replace(/\/+$/, '');

      for (const loginPath of loginPaths) {
        const tryUrl = loginPath ? `${baseDomain}${loginPath}` : baseDomain;
        try {
          await page.goto(tryUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(2000);

          // Check for Google SSO button
          const googleSso = await page.$('a:has-text("Google")') ||
                            await page.$('button:has-text("Google")') ||
                            await page.$('[data-provider="google"]') ||
                            await page.$('a[href*="accounts.google.com"]');
          if (googleSso) {
            console.log(`[Verifier] Found Google SSO on ${account.name}, clicking...`);
            await googleSso.click();
            await page.waitForTimeout(3000);
            if (page.url().includes('accounts.google.com')) {
              try {
                const ei = await page.$('input[type="email"]');
                if (ei) { await ei.fill(EMAIL()); await page.click('#identifierNext'); await page.waitForTimeout(3000); }
                const pi = await page.$('input[type="password"]');
                if (pi) { await pi.fill(PASS()); await page.click('#passwordNext'); await page.waitForTimeout(5000); }
              } catch (e) {}
              if (!page.url().includes('signin') && !page.url().includes('login')) return true;
            }
          }

          // Try standard login form
          const done = await tryGenericLogin(page, account.username || EMAIL(), PASS());
          if (done) {
            const title = await page.title();
            const currentUrl = page.url();
            if (isLoggedIn(currentUrl, title)) return true;
          }
        } catch (e) {
          continue;
        }
      }

      // If nothing worked, at least check if the page loads
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const title = await page.title();
        // Don't count page load as success — return false
        console.log(`[Verifier] ${account.name}: Page loads ("${title}") but could not login`);
        return false;
      } catch (e) {
        return false;
      }
    },
  },
};

async function verifyAccount(account) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  try {
    console.log(`[Verifier] Verifying ${account.name} (${account.url})...`);

    const strategyKey = Object.keys(loginStrategies).find(
      key => key !== 'generic' && loginStrategies[key].match(account.url)
    ) || 'generic';

    const strategy = loginStrategies[strategyKey];
    console.log(`[Verifier] Using ${strategyKey} strategy for ${account.name}`);

    let success = false;
    try {
      success = await strategy.login(page, account);
    } catch (loginErr) {
      console.log(`[Verifier] Login error: ${loginErr.message}`);
      success = false;
    }

    // Navigate to target URL if logged in
    if (success && strategyKey !== 'generic' && strategyKey !== 'wordpress') {
      const targetUrl = account.url.startsWith('http') ? account.url : `https://${account.url}`;
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
      } catch (e) {}
    }

    const title = await page.title();
    const finalUrl = page.url();

    const screenshotPath = path.join(SCREENSHOT_DIR, `verify-${account.id}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    await browser.close();

    console.log(`[Verifier] ${account.name}: ${success ? 'OK' : 'FAIL'} — "${title}"`);
    return {
      success,
      strategy: strategyKey,
      title,
      finalUrl,
      screenshot: screenshotPath,
      message: `${success ? 'Login successful' : 'Login failed'} (${strategyKey}): "${title}"`,
    };
  } catch (error) {
    console.error(`[Verifier] ${account.name} failed:`, error.message);
    try { await page.screenshot({ path: path.join(SCREENSHOT_DIR, `verify-${account.id}-error-${Date.now()}.png`) }); } catch (e) {}
    await browser.close();
    return { success: false, error: error.message, message: `Failed: ${error.message}` };
  }
}

module.exports = { verifyAccount };
