const { logActivity } = require('../data/database');

// Clock Agent — tracks status and exposes info
// Actual clock action uses the shared zohoAction from routes/clock.js
// This agent monitors the state and provides dashboard data

const state = {
  running: true,
  mode: 'n8n', // 'n8n' = external scheduler, 'internal' = built-in scheduler
  schedule: {
    clockIn: '08:00',
    clockOut: '17:00',
    timezone: 'Asia/Manila',
    daysOff: [0, 6],
  },
  enabled: true,
  lastClockIn: null,
  lastClockOut: null,
  nextAction: null,
  todayClocked: { in: false, out: false },
  n8n: {
    webhookUrl: 'https://zoho-clock-gab.loca.lt',
    clockInEndpoint: '/clockin',
    clockOutEndpoint: '/clockout',
    status: 'configured',
  },
  timer: null,
  log: [],
};

function addLog(type, message) {
  const entry = { type, message, time: new Date().toISOString() };
  state.log.unshift(entry);
  if (state.log.length > 50) state.log.pop();
  console.log(`[ClockAgent] ${type}: ${message}`);
  try { logActivity(type, `[ClockAgent] ${message}`); } catch (e) {}
}

function getNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: state.schedule.timezone }));
}

function getTimeStr() {
  return getNow().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getDateStr() {
  return getNow().toISOString().split('T')[0];
}

function isDayOff() {
  return state.schedule.daysOff.includes(getNow().getDay());
}

function parseTime(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function currentMinutes() {
  const now = getNow();
  return now.getHours() * 60 + now.getMinutes();
}

function calculateNextAction() {
  const now = currentMinutes();
  const clockInMin = parseTime(state.schedule.clockIn);
  const clockOutMin = parseTime(state.schedule.clockOut);
  const today = getDateStr();

  if (isDayOff()) {
    state.nextAction = { action: 'clockin', time: state.schedule.clockIn, day: 'Next workday', via: 'n8n' };
    return;
  }
  if (!state.todayClocked.in && now < clockInMin + 5) {
    state.nextAction = { action: 'clockin', time: state.schedule.clockIn, day: today, via: 'n8n' };
  } else if (!state.todayClocked.out && now < clockOutMin + 5) {
    state.nextAction = { action: 'clockout', time: state.schedule.clockOut, day: today, via: 'n8n' };
  } else {
    state.nextAction = { action: 'clockin', time: state.schedule.clockIn, day: 'Tomorrow', via: 'n8n' };
  }
}

// Called when clock in/out happens (from any source — n8n webhook or manual)
function recordClockAction(action, result) {
  if (action === 'clockin') {
    state.lastClockIn = new Date().toISOString();
    state.todayClocked.in = true;
  } else {
    state.lastClockOut = new Date().toISOString();
    state.todayClocked.out = true;
  }
  addLog(action, `${action} — ${result.message || 'completed'}`);
  calculateNextAction();
}

// Delegate to the shared zohoAction in routes/clock.js
// This avoids duplicate Playwright code and uses persistent cookies
async function doClockAction(action) {
  addLog(action, `${action} started...`);

  try {
    // Lazy-require to avoid circular dependency at startup
    const clockRouteModule = require('../routes/clock');
    // The route exports are on the router, but zohoAction isn't exported
    // So we call it via HTTP internally or use the module-level function
    // For now, use the same approach but import from the route
  } catch (e) {}

  // Use the route's zohoAction by requiring it as a peer
  // Since zohoAction is not exported from the router, we replicate the call
  // via a local HTTP request to our own server
  const http = require('http');
  return new Promise((resolve) => {
    const postData = JSON.stringify({});
    const req = http.request({
      hostname: 'localhost',
      port: process.env.PORT || 3847,
      path: `/api/${action}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          addLog(action, `${action} result: ${result.message || result.error || 'unknown'}`);
          resolve(result);
        } catch (e) {
          addLog('error', `${action} parse error: ${e.message}`);
          resolve({ success: false, error: e.message });
        }
      });
    });
    req.on('error', (e) => {
      addLog('error', `${action} request error: ${e.message}`);
      resolve({ success: false, error: e.message });
    });
    req.write(postData);
    req.end();
  });
}

function start() {
  state.running = true;
  addLog('info', `Clock Agent started — mode: ${state.mode}, schedule: IN ${state.schedule.clockIn} / OUT ${state.schedule.clockOut} (${state.schedule.timezone})`);
  calculateNextAction();

  // Reset daily state at midnight
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    const now = currentMinutes();
    if (now < 2) state.todayClocked = { in: false, out: false };
    calculateNextAction();
  }, 60000);
}

function stop() {
  if (state.timer) clearInterval(state.timer);
  state.running = false;
  state.timer = null;
  addLog('info', 'Clock Agent stopped');
}

function updateSchedule(clockIn, clockOut, daysOff) {
  if (clockIn) state.schedule.clockIn = clockIn;
  if (clockOut) state.schedule.clockOut = clockOut;
  if (daysOff) state.schedule.daysOff = daysOff;
  calculateNextAction();
  addLog('info', `Schedule updated — IN ${state.schedule.clockIn}, OUT ${state.schedule.clockOut}`);
}

function getStatus() {
  return {
    running: state.running,
    enabled: state.enabled,
    mode: state.mode,
    schedule: state.schedule,
    lastClockIn: state.lastClockIn,
    lastClockOut: state.lastClockOut,
    nextAction: state.nextAction,
    todayClocked: state.todayClocked,
    currentTime: getTimeStr(),
    currentDate: getDateStr(),
    isDayOff: isDayOff(),
    n8n: state.n8n,
    log: state.log.slice(0, 20),
  };
}

module.exports = { start, stop, getStatus, updateSchedule, doClockAction, recordClockAction, state };
