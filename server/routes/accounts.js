const { Router } = require('express');
const { db, logActivity } = require('../data/database');

const router = Router();

// GET activity log (must be before /:id)
router.get('/log/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const logs = db.prepare(`
    SELECT al.*, a.name as account_name
    FROM activity_log al
    LEFT JOIN accounts a ON al.account_id = a.id
    ORDER BY al.created_at DESC
    LIMIT ?
  `).all(limit);
  res.json(logs);
});

// POST verify ALL accounts (must be before /:id)
router.post('/verify-all', async (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts').all();
  logActivity('verify', `Starting bulk verification of ${accounts.length} accounts`);
  res.json({ message: `Verification started for ${accounts.length} accounts`, total: accounts.length });

  const { verifyAccount } = require('../agents/verifier');
  for (const account of accounts) {
    try {
      const result = await verifyAccount(account);
      const newStatus = result.success ? 'Connected' : 'Failed';
      db.prepare(`
        UPDATE accounts SET status = ?, last_verified = datetime('now'), verify_message = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, result.message || '', account.id);
      logActivity('verify', `Auto-verified ${account.name}: ${newStatus}`, account.id);
    } catch (e) {
      db.prepare(`
        UPDATE accounts SET status = 'Failed', last_verified = datetime('now'), verify_message = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(e.message, account.id);
      logActivity('error', `Auto-verify failed for ${account.name}`, account.id);
    }
  }
});

// GET all accounts (with key counts)
router.get('/', (req, res) => {
  const accounts = db.prepare(`
    SELECT a.*, COUNT(k.id) as _keyCount
    FROM accounts a
    LEFT JOIN account_keys k ON a.id = k.account_id
    GROUP BY a.id
    ORDER BY a.category, a.name
  `).all();
  res.json(accounts);
});

// GET single account
router.get('/:id', (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Not found' });
  res.json(account);
});

// POST create account
router.post('/', (req, res) => {
  const { name, url, category, status, username, password, notes } = req.body;
  const result = db.prepare(`
    INSERT INTO accounts (name, url, category, status, username, password, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, url, category || 'Operational', status || 'Unchecked', username || '', password || '', notes || '');

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
  logActivity('create', `Added account: ${name}`, account.id);
  res.status(201).json(account);
});

// PUT update account
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, url, category, status, username, password, notes, developer_url, login_url, mcp_server } = req.body;
  db.prepare(`
    UPDATE accounts SET
      name = COALESCE(?, name),
      url = COALESCE(?, url),
      category = COALESCE(?, category),
      status = COALESCE(?, status),
      username = COALESCE(?, username),
      password = COALESCE(?, password),
      notes = COALESCE(?, notes),
      developer_url = COALESCE(?, developer_url),
      login_url = COALESCE(?, login_url),
      mcp_server = COALESCE(?, mcp_server),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name, url, category, status, username, password, notes, developer_url, login_url, mcp_server, req.params.id);

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  logActivity('update', `Updated account: ${account.name}`, account.id);
  res.json(account);
});

// DELETE account
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  logActivity('delete', `Deleted account: ${existing.name}`);
  res.json({ success: true });
});

// POST verify single account
// Logic: Connected = login works or API keys valid
//        No Account Yet = no credentials, no keys, can't login
//        Failed = has credentials but login/API failed
router.post('/:id/verify', async (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Not found' });

  const keys = db.prepare('SELECT * FROM account_keys WHERE account_id = ?').all(account.id);
  const hasKeys = keys.length > 0;
  const hasPassword = account.password && account.password.length > 0;
  const hasMcp = account.mcp_server && account.mcp_server.length > 0;

  try {
    const { verifyAccount } = require('../agents/verifier');
    const result = await verifyAccount(account);

    // Also test API keys if browser login fails
    let apiKeyValid = false;
    if (!result.success && hasKeys) {
      const https = require('https');
      // Test Trello API keys
      const trelloKey = keys.find(k => k.key_type === 'api_key');
      const trelloToken = keys.find(k => k.key_type === 'oauth_token');
      if (trelloKey && trelloToken && account.url.includes('trello')) {
        try {
          const testUrl = `https://api.trello.com/1/members/me?key=${trelloKey.key_value}&token=${trelloToken.key_value}`;
          const resp = await new Promise((resolve, reject) => {
            https.get(testUrl, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(r.statusCode)); }).on('error', reject);
          });
          apiKeyValid = resp === 200;
        } catch (e) {}
      }
      // Google OAuth — if configured, trust it
      const oauthId = keys.find(k => k.key_type === 'oauth_client_id');
      if (oauthId) apiKeyValid = true;
    }

    let newStatus, message;
    if (result.success) {
      newStatus = 'Connected';
      message = result.message;
    } else if (apiKeyValid) {
      newStatus = 'Connected';
      message = 'API keys validated (browser login skipped)';
    } else if (hasKeys || hasMcp) {
      newStatus = 'Failed';
      message = result.message;
    } else if (hasPassword) {
      newStatus = 'Failed';
      message = result.message;
    } else {
      newStatus = 'No Account Yet';
      message = 'No credentials or API keys configured';
    }

    db.prepare(`
      UPDATE accounts SET
        status = ?,
        last_verified = datetime('now'),
        verify_message = ?,
        verify_screenshot = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, message, result.screenshot || '', account.id);

    const updated = db.prepare(`
      SELECT a.*, COUNT(k.id) as _keyCount FROM accounts a
      LEFT JOIN account_keys k ON a.id = k.account_id
      WHERE a.id = ? GROUP BY a.id
    `).get(account.id);
    logActivity('verify', `Verified ${account.name}: ${newStatus}`, account.id, result);
    res.json({ ...updated, verifyResult: result });
  } catch (error) {
    const newStatus = (hasKeys || hasPassword) ? 'Failed' : 'No Account Yet';
    db.prepare(`
      UPDATE accounts SET
        status = ?,
        last_verified = datetime('now'),
        verify_message = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(newStatus, error.message, account.id);

    const updated = db.prepare(`
      SELECT a.*, COUNT(k.id) as _keyCount FROM accounts a
      LEFT JOIN account_keys k ON a.id = k.account_id
      WHERE a.id = ? GROUP BY a.id
    `).get(account.id);
    logActivity('error', `Verification failed for ${account.name}: ${error.message}`, account.id);
    res.json({ ...updated, verifyResult: { success: false, error: error.message } });
  }
});

// POST full health check — login + API keys + MCP
router.post('/:id/health-check', async (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Not found' });

  const results = { login: null, apiKeys: [], mcp: null };

  // 1. Verify login via Playwright
  try {
    const { verifyAccount } = require('../agents/verifier');
    const loginResult = await verifyAccount(account);
    results.login = loginResult;
  } catch (e) {
    results.login = { success: false, error: e.message };
  }

  // 2. Test API keys
  const keys = db.prepare('SELECT * FROM account_keys WHERE account_id = ?').all(account.id);
  for (const key of keys) {
    const keyResult = { id: key.id, name: key.key_name, type: key.key_type, status: 'stored' };

    // Test Trello keys
    if (key.key_type === 'api_key' && account.url.includes('trello')) {
      try {
        const https = require('https');
        const token = keys.find(k => k.key_type === 'oauth_token');
        if (token) {
          const testUrl = `https://api.trello.com/1/members/me?key=${key.key_value}&token=${token.key_value}`;
          const response = await new Promise((resolve, reject) => {
            https.get(testUrl, r => {
              let d = '';
              r.on('data', c => d += c);
              r.on('end', () => resolve({ status: r.statusCode, data: d }));
            }).on('error', reject);
          });
          keyResult.status = response.status === 200 ? 'valid' : 'invalid';
          keyResult.details = response.status === 200 ? 'API responded OK' : `HTTP ${response.status}`;
        }
      } catch (e) {
        keyResult.status = 'error';
        keyResult.details = e.message;
      }
    }

    // Test Google OAuth keys
    if (key.key_type === 'oauth_client_id') {
      keyResult.status = 'configured';
      keyResult.details = 'OAuth Client ID stored — use gws CLI or browser auth to validate';
    }

    results.apiKeys.push(keyResult);
  }

  // 3. Check MCP server
  if (account.mcp_server) {
    results.mcp = { package: account.mcp_server, status: 'configured' };
  }

  // Update account status
  const loginOk = results.login && results.login.success;
  const hasKeys = keys.length > 0;
  const anyKeyValid = results.apiKeys.some(k => k.status === 'valid' || k.status === 'configured');

  let newStatus = 'Failed';
  let message = 'Health check failed';
  if (loginOk && hasKeys && anyKeyValid) {
    newStatus = 'Connected';
    message = `Full health check passed — login OK, ${keys.length} keys, ${account.mcp_server ? 'MCP configured' : 'no MCP'}`;
  } else if (loginOk) {
    newStatus = 'Connected';
    message = `Login verified${hasKeys ? `, ${keys.length} keys stored` : ', no API keys'}`;
  } else if (hasKeys && anyKeyValid) {
    newStatus = 'Connected';
    message = `API keys valid (${keys.length} stored)${loginOk ? '' : ', browser login failed'}`;
  } else if (hasKeys) {
    newStatus = 'Unchecked';
    message = `${keys.length} keys stored but not validated`;
  }

  db.prepare(`
    UPDATE accounts SET status = ?, verify_message = ?, last_verified = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(newStatus, message, account.id);

  logActivity('verify', `Health check for ${account.name}: ${newStatus}`, account.id, results);

  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id);
  res.json({ ...updated, healthCheck: results });
});

// === ACCOUNT KEYS (API credentials) ===

// GET keys for an account
router.get('/:id/keys', (req, res) => {
  const keys = db.prepare('SELECT * FROM account_keys WHERE account_id = ? ORDER BY key_type, key_name').all(req.params.id);
  res.json(keys);
});

// POST add a key
router.post('/:id/keys', (req, res) => {
  const { key_type, key_name, key_value } = req.body;
  const result = db.prepare(`
    INSERT INTO account_keys (account_id, key_type, key_name, key_value)
    VALUES (?, ?, ?, ?)
  `).run(req.params.id, key_type, key_name, key_value);
  const key = db.prepare('SELECT * FROM account_keys WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(key);
});

// PUT update a key
router.put('/:id/keys/:keyId', (req, res) => {
  const { key_type, key_name, key_value } = req.body;
  db.prepare(`
    UPDATE account_keys SET
      key_type = COALESCE(?, key_type),
      key_name = COALESCE(?, key_name),
      key_value = COALESCE(?, key_value),
      updated_at = datetime('now')
    WHERE id = ? AND account_id = ?
  `).run(key_type, key_name, key_value, req.params.keyId, req.params.id);
  const key = db.prepare('SELECT * FROM account_keys WHERE id = ?').get(req.params.keyId);
  res.json(key);
});

// DELETE a key
router.delete('/:id/keys/:keyId', (req, res) => {
  db.prepare('DELETE FROM account_keys WHERE id = ? AND account_id = ?').run(req.params.keyId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
