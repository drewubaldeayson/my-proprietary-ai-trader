const CONFIG_KEY = 'edgepilotMonitorConfig';
const ALERT_KEY = 'edgepilotAlertState';
const NEWS_KEY = 'edgepilotMarketNews';
const TRADE_CAPTURE_KEY = 'edgepilotTradeCaptures';
const VERSION = '1.3.0';
const MARKET_NEWS_URL =
  'https://app.fundedfuturesnetwork.com/nexus/market-news';
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
  newsContext: null,
};

const marketKeywords = {
  ES: ['S&P', 'SP500', 'S&P 500', 'EQUITIES', 'STOCKS', 'WALL STREET'],
  NQ: ['NASDAQ', 'TECH STOCKS', 'TECHNOLOGY'],
  YM: ['DOW', 'DOW JONES'],
  RTY: ['RUSSELL', 'SMALL CAPS'],
  CL: ['CRUDE', 'OIL', 'WTI', 'OPEC'],
  NG: ['NATURAL GAS'],
  GC: ['GOLD', 'BULLION'],
  SI: ['SILVER'],
  HG: ['COPPER'],
  BTC: ['BITCOIN', 'CRYPTO'],
  ETH: ['ETHEREUM', 'CRYPTO'],
  ZB: ['TREASURY', 'BONDS', 'YIELDS'],
  ZN: ['TREASURY', 'BONDS', 'YIELDS'],
  ZF: ['TREASURY', 'BONDS', 'YIELDS'],
  ZT: ['TREASURY', 'BONDS', 'YIELDS'],
  '6E': ['EURO', 'EUR', 'ECB'],
  '6J': ['YEN', 'JPY', 'BOJ'],
  '6B': ['STERLING', 'POUND', 'GBP', 'BOE'],
};

const microToRoot = {
  MES: 'ES',
  MNQ: 'NQ',
  MYM: 'YM',
  M2K: 'RTY',
  MCL: 'CL',
  MGC: 'GC',
  SIL: 'SI',
  MBT: 'BTC',
  MET: 'ETH',
};

function decodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyNews(title, summary = '') {
  const text = `${title} ${summary}`.toUpperCase();
  const positive = [
    'RALLY',
    'RISE',
    'GAIN',
    'SURGE',
    'REBOUND',
    'BEATS',
    'UPGRADED',
    'OPTIMISM',
  ];
  const negative = [
    'FALL',
    'DROP',
    'SLIDE',
    'SELL-OFF',
    'SELLOFF',
    'MISS',
    'DOWNGRADED',
    'FEARS',
    'TUMBLES',
  ];
  const riskWords = [
    'FOMC',
    'FED ',
    'CPI',
    'INFLATION',
    'PAYROLL',
    'JOBS REPORT',
    'RATE DECISION',
    'OPEC',
    'INVENTORY',
    'EARNINGS',
    'WAR',
    'SANCTIONS',
  ];
  const positiveScore = positive.filter((word) => text.includes(word)).length;
  const negativeScore = negative.filter((word) => text.includes(word)).length;
  const highImpact = riskWords.some((word) => text.includes(word));
  let tone = 'neutral';
  if (positiveScore > negativeScore) tone = 'bullish';
  if (negativeScore > positiveScore) tone = 'bearish';
  if (highImpact && positiveScore === negativeScore) tone = 'risk';
  const markets = Object.entries(marketKeywords)
    .filter(([, keywords]) =>
      keywords.some((keyword) => text.includes(keyword)),
    )
    .map(([market]) => market);
  return { tone, highImpact, markets: [...new Set(markets)] };
}

function parseMarketNews(html) {
  const candidates = [];
  const seen = new Set();
  const add = (rawTitle, rawUrl, rawSummary = '') => {
    const title = decodeHtml(rawTitle);
    const summary = decodeHtml(rawSummary);
    if (title.length < 18 || title.length > 240) return;
    if (
      /^(home|market news|markets|read more|learn more|login|sign in)$/i.test(
        title,
      )
    )
      return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const classification = classifyNews(title, summary);
    let url = MARKET_NEWS_URL;
    try {
      url = new URL(rawUrl || MARKET_NEWS_URL, MARKET_NEWS_URL).href;
    } catch {
      // Keep the source page when a card has no valid detail URL.
    }
    candidates.push({
      id: `news-${candidates.length}-${key.slice(0, 36).replace(/[^a-z0-9]+/g, '-')}`,
      title,
      url,
      summary: summary && summary !== title ? summary.slice(0, 320) : '',
      markets: classification.markets,
      tone: classification.tone,
      highImpact: classification.highImpact,
    });
  };

  const articlePattern = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
  for (const match of html.matchAll(articlePattern)) {
    const block = match[1];
    const link = block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
    const heading = block.match(/<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i)?.[1];
    const summary = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    if (heading) add(heading, link, summary);
  }

  if (!candidates.length) {
    const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(linkPattern)) {
      const href = match[1];
      if (!/market|news|nexus/i.test(href)) continue;
      add(match[2], href);
      if (candidates.length >= 30) break;
    }
  }

  if (!candidates.length) {
    const jsonTitlePattern = /"(?:title|headline)"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
    for (const match of html.matchAll(jsonTitlePattern)) {
      let title = match[1];
      try {
        title = JSON.parse(`"${title}"`);
      } catch {
        // Keep the readable portion when embedded JSON is imperfect.
      }
      add(title, MARKET_NEWS_URL);
      if (candidates.length >= 30) break;
    }
  }
  return candidates.slice(0, 30);
}

async function syncMarketNews() {
  const response = await fetch(MARKET_NEWS_URL, {
    cache: 'no-store',
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`FFN returned HTTP ${response.status}.`);
  const html = await response.text();
  const items = parseMarketNews(html);
  if (!items.length) {
    throw new Error(
      'No news cards were found. Open the FFN Market News page once, then retry.',
    );
  }
  const feed = { items, syncedAt: Date.now(), sourceUrl: MARKET_NEWS_URL };
  await chrome.storage.local.set({ [NEWS_KEY]: feed });
  const config = await getConfig();
  await saveConfig({ ...config, newsContext: feed });
  await evaluate();
  return feed;
}

function inferMarket(snapshot) {
  const text =
    `${snapshot?.title || ''} ${snapshot?.url || ''} ${(snapshot?.text || '').slice(0, 12000)}`.toUpperCase();
  const symbols = [
    'MES',
    'MNQ',
    'MYM',
    'M2K',
    'MCL',
    'MGC',
    'MBT',
    'MET',
    'ES',
    'NQ',
    'YM',
    'RTY',
    'CL',
    'NG',
    'GC',
    'SI',
    'HG',
    'BTC',
    'ETH',
    'ZB',
    'ZN',
    'ZF',
    'ZT',
    '6E',
    '6J',
    '6B',
  ];
  return (
    symbols.find((symbol) =>
      new RegExp(`(^|[^A-Z0-9])${symbol}([^A-Z0-9]|$)`).test(text),
    ) || ''
  );
}

function matchingNewsContext(newsContext, market) {
  if (
    !newsContext?.syncedAt ||
    Date.now() - newsContext.syncedAt > 6 * 60 * 60 * 1000
  ) {
    return { fresh: false, items: [] };
  }
  const root = microToRoot[market] || market;
  const items = (newsContext.items || []).filter(
    (item) => !item.markets?.length || item.markets.includes(root),
  );
  return { fresh: true, items };
}

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

function isNexusUrl(url) {
  try {
    const parsed = new URL(url || '');
    return (
      parsed.hostname === 'ffn.nexusprop.com' ||
      (parsed.hostname === 'app.fundedfuturesnetwork.com' &&
        parsed.pathname.startsWith('/nexus'))
    );
  } catch {
    return false;
  }
}

function nexusRuleBlock(snapshot) {
  const text = String(snapshot?.text || '').toUpperCase();
  const statusIndex = text.indexOf('LIVE RULE STATUS');
  if (statusIndex < 0) return '';

  const status = text.slice(statusIndex, statusIndex + 3000);
  if (status.includes('ALL RULES WITHIN LIMITS')) return '';
  if (/ACCOUNT (?:IS )?(?:FAILED|CLOSED|INACTIVE)/.test(status)) {
    return 'Entry blocked: Nexus reports that the selected account is not active.';
  }
  if (/\b(?:FAILED|BREACHED|VIOLATION|OUTSIDE LIMITS)\b/.test(status)) {
    return 'Entry blocked: Nexus reports a live rule breach or violation.';
  }
  return 'Entry blocked: Nexus does not currently confirm that all live rules are within limits.';
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

async function getTradeCaptures() {
  const stored = await chrome.storage.local.get(TRADE_CAPTURE_KEY);
  return Array.isArray(stored[TRADE_CAPTURE_KEY])
    ? stored[TRADE_CAPTURE_KEY]
    : [];
}

async function broadcastTradeCaptures(captures) {
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
        type: 'EDGEPILOT_TRADE_CAPTURES',
        payload: { captures },
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
  const nexusBlock = propedFresh ? nexusRuleBlock(snapshots.proped) : '';
  let decision = {
    signal: 'WAIT',
    reason: config.armed
      ? 'Waiting for the selected TradingView tab.'
      : 'Browser monitor is disarmed.',
    tradingViewFresh,
    propedFresh,
    timestamp: Date.now(),
    shouldAlert: false,
    newsFresh: false,
    nexusRulesOk: !nexusBlock,
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
  const market = inferMarket(snapshots.tradingview);
  const news = matchingNewsContext(config.newsContext, market);
  decision.market = market;
  decision.newsFresh = news.fresh;

  if (flattenMatch) {
    decision.signal = 'FLATTEN';
    decision.matchedPhrase = flattenMatch;
    decision.reason = `Matched exit label: ${flattenMatch}`;
  } else if (longMatch && shortMatch) {
    decision.reason =
      'Conflicting long and short labels are visible. No entry alert.';
  } else if (longMatch || shortMatch) {
    if (nexusBlock) {
      decision.reason = nexusBlock;
    } else if (!config.riskAllowed) {
      decision.reason =
        config.riskSummary || 'Entry blocked by the EdgePilot risk gate.';
    } else {
      const candidate = longMatch ? 'BUY' : 'SELL';
      const conflictingNews = news.items.filter(
        (item) =>
          item.highImpact &&
          ((candidate === 'BUY' && item.tone === 'bearish') ||
            (candidate === 'SELL' && item.tone === 'bullish')),
      );
      const supportingNews = news.items.filter(
        (item) =>
          (candidate === 'BUY' && item.tone === 'bullish') ||
          (candidate === 'SELL' && item.tone === 'bearish'),
      );
      if (conflictingNews.length) {
        decision.reason = `Entry paused: high-impact ${market || 'market'} news conflicts with the ${candidate.toLowerCase()} setup.`;
        decision.newsHeadline = conflictingNews[0].title;
      } else {
        decision.signal = candidate;
        decision.matchedPhrase = longMatch || shortMatch;
        decision.newsHeadline = supportingNews[0]?.title;
        decision.reason = supportingNews.length
          ? `Matched ${decision.matchedPhrase}; ${market || 'market'} news context is aligned.`
          : `Matched strategy label: ${decision.matchedPhrase}${news.fresh ? '; no conflicting high-impact news found.' : '; market news is not freshly synced.'}`;
      }
    }
  } else {
    decision.reason =
      'Tabs are live. Watching for your configured strategy labels.';
  }

  if (decision.signal !== 'WAIT') {
    const stored = await chrome.storage.local.get(ALERT_KEY);
    const previous = stored[ALERT_KEY] || { signal: '', at: 0 };
    const cooldownMs =
      Math.max(15, Number(config.cooldownSeconds) || 60) * 1000;
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
      'https://ffn.nexusprop.com/*',
      'https://app.fundedfuturesnetwork.com/nexus/*',
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
    proped: all.filter((tab) => isNexusUrl(tab.url)).map(simplify),
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

  if (message?.type === 'EDGEPILOT_SYNC_MARKET_NEWS') {
    syncMarketNews()
      .then((feed) => sendResponse({ ok: true, feed }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error ? error.message : 'Market news sync failed.',
        }),
      );
    return true;
  }

  if (message?.type === 'EDGEPILOT_GET_TRADE_CAPTURES') {
    getTradeCaptures().then((captures) => sendResponse({ captures }));
    return true;
  }

  if (message?.type === 'EDGEPILOT_CAPTURE_TRADE') {
    const capture = message.payload;
    if (
      !capture?.id ||
      !capture.market ||
      !['BUY', 'SELL'].includes(capture.side) ||
      !Number.isFinite(capture.amount) ||
      capture.amount <= 0
    ) {
      sendResponse({ ok: false, error: 'Invalid trade capture.' });
      return false;
    }
    getTradeCaptures()
      .then(async (current) => {
        const next = [
          capture,
          ...current.filter((item) => item.id !== capture.id),
        ].slice(0, 200);
        await chrome.storage.local.set({ [TRADE_CAPTURE_KEY]: next });
        await broadcastTradeCaptures(next);
        return next;
      })
      .then(() => sendResponse({ ok: true }));
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
        source === 'tradingview' ? config.tradingViewTabId : config.propedTabId;
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
