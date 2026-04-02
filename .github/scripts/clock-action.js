const { chromium } = require('playwright');
const imapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

const ACTION = process.argv[2] || 'clockin';

const CONFIG = {
  email: process.env.ZOHO_EMAIL || 'navlink26@gmail.com',
  password: process.env.ZOHO_PASSWORD || '',
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
  loginUrl: 'https://accounts.zoho.com/signin?servicename=zohopeople&serviceurl=https://people.zoho.com/outsourcey/zp',
  peopleUrl: 'https://people.zoho.com/outsourcey/zp#home/myspace/overview-actionlist',
};

const screenshotsDir = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

// Fetch the latest Zoho OTP from Gmail via IMAP
async function fetchOTPFromGmail(maxRetries = 5) {
  if (!CONFIG.gmailAppPassword) {
    console.error('GMAIL_APP_PASSWORD not set — cannot fetch OTP');
    return null;
  }

  const imapConfig = {
    imap: {
      user: CONFIG.email,
      password: CONFIG.gmailAppPassword,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
    },
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Checking Gmail for OTP (attempt ${attempt}/${maxRetries})...`);

    try {
      const connection = await imapSimple.connect(imapConfig);
      await connection.openBox('INBOX');

      // Search for recent Zoho OTP emails (last 5 minutes)
      const searchCriteria = [
        ['FROM', 'noreply@zoho.com'],
        ['SINCE', new Date(Date.now() - 5 * 60 * 1000)],
      ];
      const fetchOptions = { bodies: [''], markSeen: true };

      const messages = await connection.search(searchCriteria, fetchOptions);

      if (messages.length === 0) {
        console.log('No OTP email found yet...');
        await connection.end();
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 10000)); // Wait 10s between retries
          continue;
        }
        return null;
      }

      // Get the most recent message
      const latest = messages[messages.length - 1];
      const rawEmail = latest.parts.find(p => p.which === '').body;
      const parsed = await simpleParser(rawEmail);

      const body = (parsed.text || parsed.html || '').toString();
      console.log('Email subject:', parsed.subject);

      // Extract OTP — Zoho OTPs are typically 6 digits
      const otpMatch = body.match(/\b(\d{6})\b/);
      if (otpMatch) {
        console.log('Found OTP:', otpMatch[1]);
        await connection.end();
        return otpMatch[1];
      }

      // Try alternate patterns
      const altMatch = body.match(/(?:OTP|code|verification)[:\s]*(\d{4,8})/i);
      if (altMatch) {
        console.log('Found OTP (alt):', altMatch[1]);
        await connection.end();
        return altMatch[1];
      }

      console.log('Email found but no OTP pattern matched');
      console.log('Body preview:', body.substring(0, 300));
      await connection.end();

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 10000));
      }
    } catch (err) {
      console.error(`IMAP error (attempt ${attempt}):`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  return null;
}

async function run() {
  console.log(`[${new Date().toISOString()}] Starting ${ACTION}...`);

  if (!CONFIG.password) {
    console.error('ERROR: ZOHO_PASSWORD secret not set');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  try {
    // Step 1: Login
    console.log('Navigating to Zoho login...');
    await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

    await page.waitForSelector('#login_id', { timeout: 15000 });
    await page.fill('#login_id', CONFIG.email);
    await page.click('#nextbtn');
    await page.waitForTimeout(3000);

    await page.waitForSelector('#password', { timeout: 15000 });
    await page.fill('#password', CONFIG.password);
    await page.click('#nextbtn');
    await page.waitForTimeout(8000);

    let postLoginUrl = page.url();
    console.log('Post-login URL:', postLoginUrl);
    await page.screenshot({ path: path.join(screenshotsDir, `${ACTION}-00-post-login.png`), fullPage: true });

    // Step 2: Handle OTP verification
    const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '').catch(() => '');

    if (pageText.includes('OTP') || pageText.includes('Verify via email') || pageText.includes('one-time password')) {
      console.log('OTP verification required! Fetching OTP from Gmail...');

      // Wait a bit for the email to arrive
      await new Promise(r => setTimeout(r, 15000));

      const otp = await fetchOTPFromGmail(5);

      if (otp) {
        console.log('Entering OTP:', otp);

        // Find and fill the OTP field
        const otpField = await page.$('#otp_id') ||
                         await page.$('#otp_code') ||
                         await page.$('input[name="otp"]') ||
                         await page.$('input[placeholder*="OTP"]') ||
                         await page.$('input[placeholder*="Enter"]') ||
                         await page.$('input[type="text"]') ||
                         await page.$('input[type="number"]');

        if (otpField) {
          await otpField.fill(otp);
          console.log('OTP entered, clicking verify...');

          // Click verify button
          const verifyBtn = await page.$('button#nextbtn') ||
                            await page.$('button:has-text("Verify")') ||
                            await page.$('#nextbtn') ||
                            await page.$('input[type="submit"]');
          if (verifyBtn) {
            await verifyBtn.click();
          } else {
            // Try generic approach
            await page.evaluate(() => {
              const btns = document.querySelectorAll('button, input[type="submit"]');
              for (const b of btns) {
                const t = b.textContent.trim().toLowerCase();
                if (t.includes('verify') || t.includes('submit') || t.includes('next')) {
                  b.click();
                  return;
                }
              }
            });
          }

          await page.waitForTimeout(8000);
          postLoginUrl = page.url();
          console.log('After OTP URL:', postLoginUrl);
          await page.screenshot({ path: path.join(screenshotsDir, `${ACTION}-01-after-otp.png`), fullPage: true });
        } else {
          console.error('Could not find OTP input field');
          await page.screenshot({ path: path.join(screenshotsDir, `${ACTION}-otp-no-field.png`), fullPage: true });
        }
      } else {
        console.error('ERROR: Could not retrieve OTP from Gmail');
        await page.screenshot({ path: path.join(screenshotsDir, `${ACTION}-otp-failed.png`), fullPage: true });
        await browser.close();
        process.exit(1);
      }
    }

    // Step 3: Navigate to Zoho People (bypass any interstitial)
    if (!postLoginUrl.startsWith('https://people.zoho.com')) {
      console.log('Navigating to Zoho People...');
      await page.goto(CONFIG.peopleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(8000);
    }

    console.log('Current URL:', page.url());
    await page.screenshot({ path: path.join(screenshotsDir, `${ACTION}-02-loaded.png`), fullPage: true });

    // Step 4: Wait for attendance button
    await page.waitForSelector('#ZPAtt_check_in_out', { timeout: 25000 });
    const buttonText = (await page.textContent('#ZPAtt_check_in_out')).trim().toLowerCase();
    console.log('Button says:', buttonText);

    const wantCheckIn = ACTION === 'clockin';
    const buttonSaysCheckIn = buttonText.includes('check-in');

    if (wantCheckIn && !buttonSaysCheckIn) {
      console.log('Already clocked in');
      console.log(JSON.stringify({ success: true, action: ACTION, message: 'Already clocked in', skipped: true }));
      await browser.close();
      return;
    }
    if (!wantCheckIn && buttonSaysCheckIn) {
      console.log('Already clocked out');
      console.log(JSON.stringify({ success: true, action: ACTION, message: 'Already clocked out', skipped: true }));
      await browser.close();
      return;
    }

    // Step 5: Click the button
    console.log(`Clicking ${buttonText}...`);
    await page.click('#ZPAtt_check_in_out');
    await page.waitForTimeout(5000);

    // Handle confirmation dialog for checkout
    if (ACTION === 'clockout') {
      const confirmSelectors = [
        'lyte-yield .lyteConfirmBoxAgree',
        'lyte-yield button.confirmBtn',
        'button.lyteConfirm',
        'button[data-action="confirm"]',
      ];
      for (const sel of confirmSelectors) {
        try {
          const btn = await page.$(sel);
          if (btn && await btn.isVisible()) {
            console.log(`Clicking confirm: ${sel}`);
            await btn.click();
            await page.waitForTimeout(3000);
            break;
          }
        } catch (e) {}
      }

      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a.cxBtn, input[type="button"]');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toLowerCase();
          if (btn.offsetParent !== null && (text === 'yes' || text === 'ok' || text === 'confirm')) {
            btn.click();
            return;
          }
        }
      });
      await page.waitForTimeout(3000);
    }

    // Step 6: Verify
    const newButtonText = (await page.textContent('#ZPAtt_check_in_out')).trim();
    console.log('Button now says:', newButtonText);

    await page.screenshot({ path: path.join(screenshotsDir, `${ACTION}-03-done.png`), fullPage: true });

    const result = { success: true, action: ACTION, message: `${ACTION} completed`, newState: newButtonText };
    console.log(JSON.stringify(result));

    await browser.close();
  } catch (error) {
    console.error('Error:', error.message);
    try {
      await page.screenshot({ path: path.join(screenshotsDir, `${ACTION}-error.png`), fullPage: true });
    } catch (e) {}
    await browser.close();
    process.exit(1);
  }
}

run();
