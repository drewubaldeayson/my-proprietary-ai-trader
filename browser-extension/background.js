const CONFIG_KEY = 'edgepilotMonitorConfig';
const ALERT_KEY = 'edgepilotAlertState';
const VERSION = '1.0.0';
const snapshots = { tradingview: null, proped: null };

const defaultConfig = {
  armed: false,
  tradingViewTabId: null,
  propedTabId: null,
  longPhrases: 'STRONG BUY, LONG SETUP',
  shortPhrases: 'STRONG SELL, SHORT SETUP',
  flattenPhrases: 'FLATTEN, EXIT SIGNAL, CLOSE POSITION',
  cooldownSeconds: 60,
  requireNexus: true,
  riskAllowed: false,
  riskSummary: 'Waiting for the EdgePilot risk gate.',
};

async function getConfig() {
  const stored = await chrome.storage.local.get(CONFIG_KEY);
  return { ...defaultConfig, ...(stored[CONFIG_KEY] || {}) };
}

async function saveConfig(next) {
  await chrome.storage.local.set({ [CONFIG_KEY]: next });
  return next;
}

function splitPhrases(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function firstMatch(text, phrases) {
  return phrases.find((phrase) => text.includes(phrase));
}

function fresh(snapshot, tabId) {
  return Boolean(
    snapshot &&
      tabId &&
      snapshot.tabId === tabId &&
      Date.now() - snapshot.timestamp < 45000,
  );
}

async function broadcastDecision(decision) {
  const dashboardTabs = await chrome.tabs.query({
    url: [
      'https://edgepilot-ai-trader.grangerdeil.chatgpt.site/*',
      'http://localhost:3000/*',
    ],
  });
  for (const tab of dashboardTabs) {
    if (!tab.id) continue;
    chrome.tabs
      .sendMessage(tab.id, {
        type: 'EDGEPILOT_MONITOR_DECISION',
        payload: { decision },
      })
      .catch(() => undefined);
  }
}

async function evaluate() {
  const config = await getConfig();
  const tradingViewFresh = fresh(
    snapshots.tradingview,
    config.tradingViewTabId,
  );
  const propedFresh = fresh(snapshots.proped, config.propedTabId);
  let decision = {
    signal: 'WAIT',
    reason: config.armed
      ? 'Waiting for the selected TradingView tab.'
      : 'Browser monitor is disarmed.',
    tradingViewFresh,
    propedFresh,
    timestamp: Date.now(),
    shouldAlert: false,
  };

  if (!config.armed) {
    await broadcastDecision(decision);
    return decision;
  }
  if (!tradingViewFresh) {
    await broadcastDecision(decision);
    return decision;
  }
  if (config.requireNexus && !propedFresh) {
    decision.reason = 'Waiting for a fresh update from the selected Nexus tab.';
    await broadcastDecision(decision);
    return decision;
  }

  const text = snapshots.tradingview.text.toUpperCase();
  const longMatch = firstMatch(text, splitPhrases(config.longPhrases));
  const shortMatch = firstMatch(text, splitPhrases(config.shortPhrases));
  const flattenMatch = firstMatch(text, splitPhrases(config.flattenPhrases));

  if (flattenMatch) {
    decision.signal = 'FLATTEN';
    decision.matchedPhrase = flattenMatch;
    decision.reason = `Matched exit label: ${flattenMatch}`;
  } else if (longMatch && shortMatch) {
    decision.reason = 'Conflicting long and short labels are visible. No entry alert.';
  } else if (longMatch || shortMatch) {
    if (!config.riskAllowed) {
      decision.reason = config.riskSummary || 'Entry blocked by the EdgePilot risk gate.';
    } else {
      decision.signal = longMatch ? 'BUY' : 'SELL';
      decision.matchedPhrase = longMatch || shortMatch;
      decision.reason = `Matched strategy label: ${decision.matchedPhrase}`;
    }
  } else {
    decision.reason = 'Tabs are live. Watching for your configured strategy labels.';
  }

  if (decision.signal !== 'WAIT') {
    const stored = await chrome.storage.local.get(ALERT_KEY);
    const previous = stored[ALERT_KEY] || { signal: '', at: 0 };
    const cooldownMs = Math.max(15, Number(config.cooldownSeconds) || 60) * 1000;
    if (
      previous.signal !== decision.signal ||
      Date.now() - previous.at >= cooldownMs
    ) {
      decision.shouldAlert = true;
      await chrome.storage.local.set({
        [ALERT_KEY]: { signal: decision.signal, at: Date.now() },
      });
    }
  }

  await broadcastDecision(decision);
  return decision;
}

async function requestSnapshots() {
  const config = await getConfig();
  for (const tabId of [config.tradingViewTabId, config.propedTabId]) {
    if (!tabId) continue;
    chrome.tabs
      .sendMessage(tabId, { type: 'EDGEPILOT_REQUEST_SNAPSHOT' })
      .catch(() => undefined);
  }
}

async function syncTabActivation(config) {
  const tabs = await chrome.tabs.query({
    url: [
      'https://*.tradingview.com/*',
      'https://tradingview.com/*',
      'https://propedcapital.com/*',
      'https://*.propedcapital.com/*',
    ],
  });
  for (const tab of tabs) {
    if (!tab.id) continue;
    const isTradingView = (tab.url || '').includes('tradingview.com');
    const selectedId = isTradingView
      ? config.tradingViewTabId
      : config.propedTabId;
    chrome.tabs
      .sendMessage(tab.id, {
        type: 'EDGEPILOT_MONITOR_ACTIVATE',
        active: tab.id === selectedId,
      })
      .catch(() => undefined);
  }
}

async function listTabs() {
  const all = await chrome.tabs.query({});
  const config = await getConfig();
  const simplify = (tab) => ({
    id: tab.id,
    title: tab.title || tab.url || 'Untitled tab',
    url: tab.url || '',
  });
  return {
    version: VERSION,
    tradingView: all
      .filter((tab) => (tab.url || '').includes('tradingview.com'))
      .map(simplify),
    proped: all
      .filter((tab) => (tab.url || '').includes('propedcapital.com'))
      .map(simplify),
    config,
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const config = await getConfig();
  await saveConfig(config);
  chrome.alarms.create('edgepilot-heartbeat', { periodInMinutes: 0.5 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('edgepilot-heartbeat', { periodInMinutes: 0.5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'edgepilot-heartbeat') requestSnapshots();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const config = await getConfig();
  let changed = false;
  if (config.tradingViewTabId === tabId) {
    config.tradingViewTabId = null;
    snapshots.tradingview = null;
    changed = true;
  }
  if (config.propedTabId === tabId) {
    config.propedTabId = null;
    snapshots.proped = null;
    changed = true;
  }
  if (changed) await saveConfig({ ...config, armed: false });
  await evaluate();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'EDGEPILOT_LIST_TABS') {
    listTabs().then(sendResponse);
    return true;
  }

  if (message?.type === 'EDGEPILOT_CONFIGURE') {
    getConfig()
      .then((current) => saveConfig({ ...current, ...message.payload }))
      .then(async (config) => {
        await syncTabActivation(config);
        await requestSnapshots();
      })
      .then(evaluate)
      .then((decision) => sendResponse({ ok: true, decision }));
    return true;
  }

  if (message?.type === 'EDGEPILOT_SOURCE_READY' && sender.tab?.id) {
    getConfig().then((config) => {
      const selectedId =
        message.payload?.source === 'tradingview'
          ? config.tradingViewTabId
          : config.propedTabId;
      sendResponse({ active: selectedId === sender.tab.id });
    });
    return true;
  }

  if (message?.type === 'EDGEPILOT_TAB_SNAPSHOT' && sender.tab?.id) {
    getConfig().then(async (config) => {
      const source = message.payload?.source;
      const selectedId =
        source === 'tradingview'
          ? config.tradingViewTabId
          : config.propedTabId;
      if (selectedId !== sender.tab.id) return;
      snapshots[source] = {
        ...message.payload,
        tabId: sender.tab.id,
        timestamp: Date.now(),
      };
      await evaluate();
    });
  }
});
