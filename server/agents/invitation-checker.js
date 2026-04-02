const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', 'data', '.env');
const creds = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) creds[key.trim()] = val.join('=').trim();
  });
}

const SCREENSHOT_DIR = path.join(__dirname, '..', '..', 'screenshots');

async function checkInvitations() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();
  const results = { invitations: [], errors: [] };

  try {
    // Step 1: Login to Google
    console.log('[Invitations] Logging into Google...');
    await page.goto('https://accounts.google.com/signin', { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', creds.GOOGLE_EMAIL);
    await page.click('#identifierNext');
    await page.waitForTimeout(3000);
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.fill('input[type="password"]', creds.GOOGLE_PASSWORD);
    await page.click('#passwordNext');
    await page.waitForTimeout(5000);
    console.log('[Invitations] Logged into Google:', page.url());

    // Step 2: Go to Gmail and search for invitations
    console.log('[Invitations] Opening Gmail...');
    await page.goto('https://mail.google.com/mail/u/0/#search/invitation+OR+invite+OR+access+OR+%22has+been+shared%22+OR+%22added+you%22+OR+%22join%22+is%3Aunread', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(10000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gmail-invitations.png') });
    console.log('[Invitations] Gmail loaded:', page.url());

    // Step 3: Extract email subjects and senders from the list
    const emails = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr.zA');
      const results = [];
      rows.forEach((row, i) => {
        if (i >= 20) return; // Limit to 20
        const sender = row.querySelector('.yW .bA4 span')?.getAttribute('name') ||
                       row.querySelector('.yW span')?.textContent?.trim() || '';
        const subject = row.querySelector('.y6 span:first-child')?.textContent?.trim() ||
                        row.querySelector('.bog')?.textContent?.trim() || '';
        const snippet = row.querySelector('.y2')?.textContent?.trim() || '';
        const isUnread = row.classList.contains('zE');
        results.push({ sender, subject, snippet, isUnread, index: i });
      });
      return results;
    });

    console.log(`[Invitations] Found ${emails.length} invitation-related emails`);
    results.invitations = emails;

    // Step 4: Click each email, look for invitation links, and accept them
    for (const email of emails) {
      try {
        console.log(`[Invitations] Checking: "${email.subject}" from ${email.sender}`);

        // Click the email
        const rows = await page.$$('tr.zA');
        if (rows[email.index]) {
          await rows[email.index].click();
          await page.waitForTimeout(3000);

          // Look for invitation/accept links
          const links = await page.evaluate(() => {
            const anchors = document.querySelectorAll('a[href]');
            const inviteLinks = [];
            const keywords = ['accept', 'join', 'invite', 'access', 'confirm', 'activate', 'open', 'view', 'get started'];
            anchors.forEach(a => {
              const text = (a.textContent || '').toLowerCase().trim();
              const href = a.href || '';
              if (keywords.some(k => text.includes(k) || href.includes(k)) &&
                  href.startsWith('http') &&
                  !href.includes('google.com/support') &&
                  !href.includes('unsubscribe')) {
                inviteLinks.push({ text: a.textContent.trim(), href });
              }
            });
            return inviteLinks;
          });

          if (links.length > 0) {
            console.log(`[Invitations] Found ${links.length} action links in "${email.subject}":`);
            for (const link of links) {
              console.log(`  -> ${link.text}: ${link.href.substring(0, 80)}...`);
              email.actionLinks = links;

              // Open invitation link in new tab
              try {
                const newPage = await context.newPage();
                await newPage.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await newPage.waitForTimeout(3000);

                const pageTitle = await newPage.title();
                const pageUrl = newPage.url();
                console.log(`[Invitations] Opened: ${pageTitle} (${pageUrl})`);

                // Try clicking accept/join/confirm buttons
                const acceptBtn = await newPage.$('button:has-text("Accept"), button:has-text("Join"), button:has-text("Confirm"), a:has-text("Accept"), a:has-text("Join"), input[value*="Accept"], input[value*="Join"]');
                if (acceptBtn) {
                  await acceptBtn.click();
                  await newPage.waitForTimeout(3000);
                  console.log(`[Invitations] Clicked accept button on ${pageTitle}`);
                  email.accepted = true;
                }

                await newPage.screenshot({
                  path: path.join(SCREENSHOT_DIR, `invitation-${email.index}-${Date.now()}.png`)
                });

                await newPage.close();
              } catch (linkErr) {
                console.log(`[Invitations] Failed to open link: ${linkErr.message}`);
              }
            }
          }

          // Go back to search results
          await page.goto('https://mail.google.com/mail/u/0/#search/invitation+OR+invite+OR+access+OR+%22has+been+shared%22+OR+%22added+you%22+OR+%22join%22+is%3Aunread', {
            waitUntil: 'networkidle',
            timeout: 20000,
          });
          await page.waitForTimeout(2000);
        }
      } catch (emailErr) {
        console.log(`[Invitations] Error processing email: ${emailErr.message}`);
        results.errors.push({ email: email.subject, error: emailErr.message });
      }
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gmail-invitations-done.png') });

  } catch (error) {
    console.error('[Invitations] Error:', error.message);
    try {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'gmail-invitations-error.png') });
    } catch (e) {}
    results.errors.push({ error: error.message });
  }

  await browser.close();
  return results;
}

module.exports = { checkInvitations };
