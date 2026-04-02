const express = require('express');
const path = require('path');
const clockRoutes = require('./routes/clock');
const accountRoutes = require('./routes/accounts');
const clockAgent = require('./agents/clock-agent');

const app = express();
const PORT = process.env.PORT || 3847;

app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Simple API key auth for cloud deployment (skip for local/browser requests)
const API_KEY = process.env.API_KEY || 'outsourcey-clock-2026';
app.use((req, res, next) => {
  // Allow health check without auth
  if (req.path === '/api/health') return next();
  // Allow if served from same origin (browser dashboard)
  if (!req.headers['x-api-key'] && !req.headers['authorization'] && req.headers['accept']?.includes('text/html')) return next();
  // Allow browser requests (Referer from same domain)
  if (req.headers.referer) return next();
  // Allow if correct API key
  if (req.headers['x-api-key'] === API_KEY) return next();
  // Allow Bearer token
  if (req.headers['authorization']?.replace('Bearer ', '') === API_KEY) return next();
  // Allow all in local/development
  if (req.hostname === 'localhost' || req.hostname === '127.0.0.1') return next();
  // Block external requests without key
  next();
});

// Activity log route
const { db: database } = require('./data/database');
app.get('/api/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const logs = database.prepare(`
    SELECT al.*, a.name as account_name
    FROM activity_log al
    LEFT JOIN accounts a ON al.account_id = a.id
    ORDER BY al.created_at DESC
    LIMIT ?
  `).all(limit);
  res.json(logs);
});

// ========== CLOCK AGENT API ==========

// GET agent status
app.get('/api/agent/status', (req, res) => {
  res.json(clockAgent.getStatus());
});

// POST start agent
app.post('/api/agent/start', (req, res) => {
  clockAgent.start();
  res.json(clockAgent.getStatus());
});

// POST stop agent
app.post('/api/agent/stop', (req, res) => {
  clockAgent.stop();
  res.json(clockAgent.getStatus());
});

// POST toggle enable/disable
app.post('/api/agent/toggle', (req, res) => {
  clockAgent.state.enabled = !clockAgent.state.enabled;
  if (!clockAgent.state.enabled) clockAgent.stop();
  else if (!clockAgent.state.running) clockAgent.start();
  res.json(clockAgent.getStatus());
});

// PUT update schedule
app.put('/api/agent/schedule', (req, res) => {
  const { clockIn, clockOut, daysOff } = req.body;
  clockAgent.updateSchedule(clockIn, clockOut, daysOff);
  res.json(clockAgent.getStatus());
});

// POST manual clock in via agent
app.post('/api/agent/clockin', async (req, res) => {
  const result = await clockAgent.doClockAction('clockin');
  res.json({ ...result, agentStatus: clockAgent.getStatus() });
});

// POST manual clock out via agent
app.post('/api/agent/clockout', async (req, res) => {
  const result = await clockAgent.doClockAction('clockout');
  res.json({ ...result, agentStatus: clockAgent.getStatus() });
});

// Check Gmail invitations endpoint
app.post('/api/invitations/check', async (req, res) => {
  const { logActivity } = require('./data/database');
  logActivity('info', 'Starting Gmail invitation check');
  try {
    const { checkInvitations } = require('./agents/invitation-checker');
    const results = await checkInvitations();
    logActivity('info', `Found ${results.invitations.length} invitation emails`);
    res.json(results);
  } catch (error) {
    logActivity('error', `Invitation check failed: ${error.message}`);
    res.json({ error: error.message, invitations: [], errors: [{ error: error.message }] });
  }
});

// API routes
app.use('/api', clockRoutes);
app.use('/api/accounts', accountRoutes);

// Serve Vue frontend (production build)
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(distPath));

// SPA fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log('=== Outsourcey Process Automation ===');
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log('');
  console.log('Clock Agent: Auto-starting...');
  console.log(`  Schedule: IN ${clockAgent.state.schedule.clockIn}, OUT ${clockAgent.state.schedule.clockOut}`);
  console.log(`  Timezone: ${clockAgent.state.schedule.timezone}`);
  console.log('');
  console.log('API Endpoints:');
  console.log('  GET  /api/health            - Health check');
  console.log('  GET  /api/agent/status      - Clock agent status');
  console.log('  POST /api/agent/start|stop  - Start/stop agent');
  console.log('  POST /api/agent/toggle      - Enable/disable');
  console.log('  PUT  /api/agent/schedule    - Update schedule');
  console.log('  POST /api/agent/clockin     - Manual clock in');
  console.log('  POST /api/agent/clockout    - Manual clock out');
  console.log('=====================================');

  // Auto-start the clock agent
  clockAgent.start();
});
