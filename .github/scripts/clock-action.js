const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ACTION = process.argv[2] || 'clockin';

const CONFIG = {
  email: process.env.ZOHO_EMAIL || 'navlink26@gmail.com',
  password: process.env.ZOHO_PASSWORD || '',
  loginUrl: 'https://accounts.zoho.com/signin?servicename=zohopeople&serviceurl=https://people.zoho.com/outsourcey/zp',
  peopleUrl: 'https://people.zoho.com/outsourcey/zp#home/myspace/overview-actionlist',
};

const screenshotsDir = path.join(process.cwd(), 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

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

    const postLoginUrl = page.url();
    console.log('Post-login URL:', postLoginUrl);

    // Handle interstitial pages (MFA banner, sessions reminder, etc.)
    if (!postLoginUrl.startsWith('https://people.zoho.com')) {
      console.log('Bypassing interstitial, navigating to Zoho People...');
      await page.goto(CONFIG.peopleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(8000);
    }

    console.log('Current URL:', page.url());
    await page.screenshot({ path: path.join(screenshotsDir, `${ACTION}-01-loaded.png`), fullPage: true });

    // Step 2: Wait for attendance button
    await page.waitForSelector('#ZPAtt_check_in_out', { timeout: 25000 });
    const buttonText = (await page.textContent('#ZPAtt_check_in_out')).trim().toLowerCase();
    console.log('Button says:', buttonText);

    const wantCheckIn = ACTION === 'clockin';
    const buttonSaysCheckIn = buttonText.includes('check-in');

    // Already in desired state
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

    // Step 3: Click the button
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

      // Try generic confirm button
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

    // Step 4: Verify
    const newButtonText = (await page.textContent('#ZPAtt_check_in_out')).trim();
    console.log('Button now says:', newButtonText);

    await page.screenshot({ path: path.join(screenshotsDir, `${ACTION}-02-done.png`), fullPage: true });

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
