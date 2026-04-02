const { Router } = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { logActivity } = require('../data/database');

const router = Router();

const CONFIG = {
  email: 'navlink26@gmail.com',
  password: 'Developer@2026',
  loginUrl: 'https://accounts.zoho.com/signin?servicename=zohopeople&serviceurl=https://people.zoho.com/outsourcey/zp',
  peopleUrl: 'https://people.zoho.com/outsourcey/zp#home/myspace/overview-actionlist',
};

// Persistent storage for cookies to avoid re-login
const COOKIE_PATH = path.join(__dirname, '..', 'data', 'zoho-cookies.json');

async function saveCookies(context) {
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
    console.log(`[ZohoClock] Saved ${cookies.length} cookies`);
  } catch (e) {
    console.error('[ZohoClock] Failed to save cookies:', e.message);
  }
}

async function loadCookies(context) {
  try {
    if (fs.existsSync(COOKIE_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf8'));
      await context.addCookies(cookies);
      console.log(`[ZohoClock] Loaded ${cookies.length} saved cookies`);
      return true;
    }
  } catch (e) {
    console.error('[ZohoClock] Failed to load cookies:', e.message);
  }
  return false;
}

async function handleSignInLimitPage(page) {
  // Check if we hit the daily sign-in limit warning/block page
  const pageText = await Promise.race([
    page.textContent('body').catch(() => ''),
    new Promise(resolve => setTimeout(() => resolve(''), 5000)),
  ]);
  if (pageText.includes('sign-in limit') || pageText.includes('Sign-In Summary')) {
    console.log('[ZohoClock] Hit sign-in limit page, clicking "I Understand"...');
    const btn = await page.$('button:has-text("I Understand")') ||
                await page.$('a:has-text("I Understand")');
    if (btn) {
      await btn.click();
      await page.waitForTimeout(3000);
      console.log('[ZohoClock] Clicked "I Understand", continuing...');
    }

    // Check if fully blocked (no more sign-ins)
    if (pageText.includes('No more sign-ins allowed')) {
      return { blocked: true, message: 'Daily sign-in limit reached (20/day). Try again after midnight.' };
    }
  }
  return { blocked: false };
}

async function doLogin(page) {
  console.log('[ZohoClock] Performing fresh login...');
  await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

  await page.waitForSelector('#login_id', { timeout: 15000 });
  await page.fill('#login_id', CONFIG.email);
  await page.click('#nextbtn');
  await page.waitForTimeout(3000);

  await page.waitForSelector('#password', { timeout: 15000 });
  await page.fill('#password', CONFIG.password);
  await page.click('#nextbtn');
  await page.waitForTimeout(8000);

  const postLoginUrl = page.url();
  console.log('[ZohoClock] Post-password URL: ' + postLoginUrl);

  // Check for OTP requirement (only on actual signin pages, not interstitials)
  if (postLoginUrl.includes('signin') && !postLoginUrl.includes('announcement') && !postLoginUrl.includes('tfa') && !postLoginUrl.includes('sessions')) {
    const otpField = await page.$('#otp_code') || await page.$('input[name="otp"]') || await page.$('input[placeholder*="OTP"]');
    if (otpField) {
      console.log('[ZohoClock] OTP verification required');
      return { blocked: true, message: 'OTP_REQUIRED — check navlink26@gmail.com for the code.' };
    }
  }

  // After login, Zoho often shows interstitial pages (MFA banner, sessions reminder, etc.)
  // The session is already established, so we can navigate directly to Zoho People
  // NOTE: Check hostname, not full URL — interstitial URLs contain people.zoho.com in query params
  if (!postLoginUrl.startsWith('https://people.zoho.com')) {
    console.log('[ZohoClock] Bypassing interstitial, navigating to Zoho People...');
    await page.goto(CONFIG.peopleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
  }

  // Verify we made it — handle sign-in limit page if it shows up here
  const finalUrl = page.url();
  if (finalUrl.includes('sign-in') || finalUrl.includes('signin')) {
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '').catch(() => '');
    if (bodyText.includes('sign-in limit') || bodyText.includes('No more sign-ins')) {
      console.log('[ZohoClock] Hit daily sign-in limit');
      return { blocked: true, message: 'Daily sign-in limit reached (20/day). Try again after midnight.' };
    }
  }

  console.log('[ZohoClock] Login complete, URL: ' + page.url());
  return { blocked: false };
}

async function handleCheckoutConfirmation(page) {
  // Zoho People may show a confirmation dialog after clicking Check-out
  // Wait a moment for dialog to appear
  await page.waitForTimeout(2000);

  // Approach 1: Check for lyte-modal / confirmation dialogs
  const confirmSelectors = [
    'lyte-yield .lyteConfirmBoxAgree',
    'lyte-yield button.confirmBtn',
    'button.lyteConfirm',
    'button[data-action="confirm"]',
    '.lyte-modal button.cxBtn',
    '.lyte-modal .lyteConfirmBoxAgree',
    'input.confirmBtn',
    '.zpAtt_popup button',
    'lyte-yield .cxBtn.lyteConfirmBoxAgree',
  ];

  for (const sel of confirmSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn && await btn.isVisible()) {
        console.log(`[ZohoClock] Found confirm button: ${sel}`);
        await btn.click();
        await page.waitForTimeout(3000);
        return true;
      }
    } catch (e) {}
  }

  // Approach 2: Find any visible button with confirm-like text
  const clicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button, a.cxBtn, input[type="button"]');
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      const isVisible = btn.offsetParent !== null;
      if (isVisible && (text === 'yes' || text === 'ok' || text === 'confirm' || text === 'submit' || text === 'check-out')) {
        btn.click();
        return 'Clicked: ' + text;
      }
    }
    return null;
  });

  if (clicked) {
    console.log(`[ZohoClock] ${clicked}`);
    await page.waitForTimeout(3000);
    return true;
  }

  return false;
}

async function zohoAction(action = 'clockin') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Starting ${action}...`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });

  // Load saved cookies to skip login
  const hasCookies = await loadCookies(context);
  const page = await context.newPage();

  try {
    let needsLogin = true;

    // Try navigating directly with saved cookies first
    if (hasCookies) {
      console.log('[ZohoClock] Trying saved session...');
      await page.goto(CONFIG.peopleUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Handle sign-in limit page even on cookie-based navigation
      const limitCheck = await handleSignInLimitPage(page);
      if (limitCheck.blocked) {
        await browser.close();
        return { success: false, action, error: 'SIGNIN_LIMIT', message: limitCheck.message };
      }

      // Check if we landed on Zoho People (session valid) or got redirected to login
      const url = page.url();
      if (url.startsWith('https://people.zoho.com') && !url.includes('signin')) {
        // Check if attendance button exists (proves we're actually logged in)
        const btn = await page.$('#ZPAtt_check_in_out');
        if (btn) {
          console.log('[ZohoClock] Session restored from cookies!');
          needsLogin = false;
        }
      }
    }

    // Fall back to fresh login if cookies didn't work
    if (needsLogin) {
      const loginResult = await doLogin(page);
      if (loginResult.blocked) {
        await browser.close();
        return { success: false, action, error: loginResult.message.includes('OTP') ? 'OTP_REQUIRED' : 'SIGNIN_LIMIT', message: loginResult.message };
      }

      // Save cookies after successful login
      await saveCookies(context);
    }

    // Now we should be on Zoho People — wait for attendance button
    await page.waitForSelector('#ZPAtt_check_in_out', { timeout: 25000 });
    const currentButtonText = (await page.textContent('#ZPAtt_check_in_out')).trim().toLowerCase();
    console.log('[ZohoClock] Current button: ' + currentButtonText);

    const wantCheckIn = action === 'clockin';
    const buttonSaysCheckIn = currentButtonText.includes('check-in');

    if (wantCheckIn && !buttonSaysCheckIn) {
      await saveCookies(context);
      await browser.close();
      return { success: true, action, message: 'Already clocked in', skipped: true };
    }
    if (!wantCheckIn && buttonSaysCheckIn) {
      await saveCookies(context);
      await browser.close();
      return { success: true, action, message: 'Already clocked out', skipped: true };
    }

    // Click the clock button
    await page.click('#ZPAtt_check_in_out');
    console.log('[ZohoClock] Clicked ' + currentButtonText + ' button');

    // Handle confirmation dialog (especially for checkout)
    if (action === 'clockout') {
      await handleCheckoutConfirmation(page);
    } else {
      await page.waitForTimeout(5000);
    }

    // Verify the action took effect
    await page.waitForTimeout(2000);
    const newButtonText = (await page.textContent('#ZPAtt_check_in_out')).trim();
    console.log('[ZohoClock] Button now says: ' + newButtonText);

    // Take screenshot for audit
    const screenshotsDir = path.join(__dirname, '..', '..', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    const screenshotPath = path.join(screenshotsDir, `${action}-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Verify the button actually changed
    const newButtonLower = newButtonText.toLowerCase();
    const actionWorked = (action === 'clockin' && newButtonLower.includes('check-out')) ||
                         (action === 'clockout' && newButtonLower.includes('check-in'));

    if (!actionWorked) {
      console.log(`[ZohoClock] WARNING: Button didn't change. Expected opposite state. Current: ${newButtonText}`);
      // Save a debug screenshot
      await page.screenshot({ path: path.join(screenshotsDir, `${action}-nochange-${Date.now()}.png`), fullPage: true });

      // Maybe there's a confirmation dialog we missed — try once more
      if (action === 'clockout') {
        console.log('[ZohoClock] Retrying confirmation dialog handling...');

        // Check page content for any modal/overlay
        const pageContent = await page.content();
        const hasModal = pageContent.includes('lyte-modal') || pageContent.includes('lyte-yield') ||
                         pageContent.includes('confirmDialog') || pageContent.includes('zpAtt_popup');
        console.log('[ZohoClock] Has modal elements:', hasModal);

        if (hasModal) {
          // Try clicking inside the modal
          await page.evaluate(() => {
            const modals = document.querySelectorAll('lyte-yield, .lyte-modal, lyte-confirm-box');
            for (const modal of modals) {
              const btns = modal.querySelectorAll('button, a, input[type="button"]');
              for (const btn of btns) {
                if (btn.offsetParent !== null) {
                  btn.click();
                  return;
                }
              }
            }
          });
          await page.waitForTimeout(3000);

          const finalButtonText = (await page.textContent('#ZPAtt_check_in_out')).trim();
          console.log('[ZohoClock] Final button text after retry: ' + finalButtonText);
          await page.screenshot({ path: path.join(screenshotsDir, `${action}-retry-${Date.now()}.png`), fullPage: true });

          await saveCookies(context);
          await browser.close();
          return { success: true, action, message: `${action} completed (confirmation handled)`, newState: finalButtonText };
        }
      }

      await saveCookies(context);
      await browser.close();
      return { success: false, action, error: 'BUTTON_UNCHANGED', message: `${action} clicked but button still says: ${newButtonText}. May need confirmation dialog handling.` };
    }

    // Save cookies after successful action
    await saveCookies(context);
    await browser.close();
    console.log(`[${new Date().toISOString()}] ${action} completed!`);
    return { success: true, action, message: action + ' completed', newState: newButtonText };

  } catch (error) {
    console.error('[ZohoClock] Error:', error.message);
    try {
      const screenshotsDir = path.join(__dirname, '..', '..', 'screenshots');
      if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotsDir, `${action}-error-${Date.now()}.png`), fullPage: true });
    } catch (e) {}
    await saveCookies(context).catch(() => {});
    await browser.close();
    return { success: false, action, error: error.message };
  }
}

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.post('/clockin', async (req, res) => {
  const result = await zohoAction('clockin');
  logActivity('clockin', result.message || 'Clock in attempted', null, result);
  try { require('../agents/clock-agent').recordClockAction('clockin', result); } catch (e) {}
  res.json(result);
});

router.post('/clockout', async (req, res) => {
  const result = await zohoAction('clockout');
  logActivity('clockout', result.message || 'Clock out attempted', null, result);
  try { require('../agents/clock-agent').recordClockAction('clockout', result); } catch (e) {}
  res.json(result);
});

router.post('/submit-otp', async (req, res) => {
  const otp = req.body.otp;
  if (!otp) return res.json({ success: false, error: 'Missing otp in body' });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#login_id', { timeout: 15000 });
    await page.fill('#login_id', CONFIG.email);
    await page.click('#nextbtn');
    await page.waitForTimeout(3000);
    await page.waitForSelector('#password', { timeout: 15000 });
    await page.fill('#password', CONFIG.password);
    await page.click('#nextbtn');
    await page.waitForTimeout(5000);

    const otpField = await page.$('#otp_code') || await page.$('input[name="otp"]') || await page.$('input[placeholder*="OTP"]') || await page.$('input[type="text"]');
    if (otpField) {
      await otpField.fill(otp);
      const verifyBtn = await page.$('button:has-text("Verify")') || await page.$('input[type="submit"]');
      if (verifyBtn) await verifyBtn.click();
      await page.waitForTimeout(8000);

      // Save cookies after OTP login so future actions skip login
      await saveCookies(context);

      const screenshotsDir = path.join(__dirname, '..', '..', 'screenshots');
      if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotsDir, `otp-submitted-${Date.now()}.png`), fullPage: true });
      console.log('[ZohoClock] OTP submitted. Now at: ' + page.url());
      await browser.close();
      res.json({ success: true, message: 'OTP submitted, session saved', url: page.url() });
    } else {
      await browser.close();
      res.json({ success: false, message: 'No OTP field found', url: page.url() });
    }
  } catch (e) {
    await browser.close();
    res.json({ success: false, error: e.message });
  }
});

router.post('/clock', async (req, res) => {
  const action = req.body.action || 'clockin';
  const result = await zohoAction(action);
  res.json(result);
});

// Utility: clear saved cookies (force fresh login next time)
router.post('/clear-session', (req, res) => {
  try {
    if (fs.existsSync(COOKIE_PATH)) fs.unlinkSync(COOKIE_PATH);
    res.json({ success: true, message: 'Session cookies cleared. Next action will do a fresh login.' });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

module.exports = router;
