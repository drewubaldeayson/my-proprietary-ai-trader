(() => {
  const VERSION = '1.4.0';
  const host = window.location.hostname;
  const isDashboard =
    host === 'edgepilot-ai-trader.grangerdeil.chatgpt.site' ||
    host === 'localhost';

  if (isDashboard) {
    const announce = () => {
      window.postMessage(
        { type: 'EDGEPILOT_EXTENSION_READY', version: VERSION },
        '*',
      );
    };

    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data?.type) return;
      if (event.data.type === 'EDGEPILOT_DASHBOARD_PING') {
        announce();
      }
      if (event.data.type === 'EDGEPILOT_DASHBOARD_LIST_TABS') {
        chrome.runtime.sendMessage(
          { type: 'EDGEPILOT_LIST_TABS' },
          (payload) => {
            window.postMessage(
              { type: 'EDGEPILOT_EXTENSION_TABS', payload },
              '*',
            );
          },
        );
      }
      if (event.data.type === 'EDGEPILOT_DASHBOARD_CONFIGURE') {
        chrome.runtime.sendMessage(
          { type: 'EDGEPILOT_CONFIGURE', payload: event.data.payload },
          () => undefined,
        );
      }
      if (event.data.type === 'EDGEPILOT_DASHBOARD_SYNC_MARKET_NEWS') {
        chrome.runtime.sendMessage(
          { type: 'EDGEPILOT_SYNC_MARKET_NEWS' },
          (payload) => {
            window.postMessage(
              {
                type: 'EDGEPILOT_MARKET_NEWS_RESULT',
                payload: payload || {
                  ok: false,
                  error: 'The extension did not return a response.',
                },
              },
              '*',
            );
          },
        );
      }
      if (event.data.type === 'EDGEPILOT_DASHBOARD_GET_TRADE_CAPTURES') {
        chrome.runtime.sendMessage(
          { type: 'EDGEPILOT_GET_TRADE_CAPTURES' },
          (payload) => {
            window.postMessage(
              { type: 'EDGEPILOT_TRADE_CAPTURES', payload },
              '*',
            );
          },
        );
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'EDGEPILOT_MONITOR_DECISION') {
        window.postMessage(message, '*');
      }
      if (message?.type === 'EDGEPILOT_TRADE_CAPTURES') {
        window.postMessage(message, '*');
      }
    });

    announce();
    return;
  }

  const source =
    host.includes('tradingview.com') || host.endsWith('onyx-trader.com')
      ? 'tradingview'
      : 'proped';
  let timer;
  let observer;
  let active = false;

  const knownMarkets = [
    'MES',
    'MNQ',
    'MYM',
    'M2K',
    'MCL',
    'MGC',
    'MBT',
    'MET',
    'SIL',
    'BTC',
    'ETH',
    'ES',
    'NQ',
    'YM',
    'RTY',
    'CL',
    'NG',
    'QM',
    'GC',
    'SI',
    'HG',
    'PL',
    'ZC',
    'ZW',
    'ZS',
    'ZM',
    'ZL',
    '6E',
    '6J',
    '6B',
    '6A',
    '6C',
    '6S',
    '6N',
    '6M',
    'ZB',
    'ZN',
    'ZF',
    'ZT',
    'GE',
  ];

  const detectMarket = () => {
    const selectors = [
      '[data-symbol]',
      '[data-market]',
      '[data-instrument]',
      '[aria-label*="symbol" i]',
      '[class*="symbol" i]',
      '[class*="instrument" i]',
    ];
    const focusedText = selectors
      .flatMap((selector) =>
        Array.from(document.querySelectorAll(selector)).slice(0, 12),
      )
      .map((node) =>
        [
          node.getAttribute('data-symbol'),
          node.getAttribute('data-market'),
          node.getAttribute('data-instrument'),
          node.textContent,
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join(' ')
      .toUpperCase();
    const fallbackText = `${document.title} ${window.location.pathname} ${
      document.body?.innerText?.slice(0, 12000) || ''
    }`.toUpperCase();
    for (const text of [focusedText, fallbackText]) {
      for (const market of knownMarkets) {
        const escaped = market.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(text)) {
          return market;
        }
      }
    }
    return '';
  };

  const installTradeCapture = () => {
    if (
      source !== 'proped' ||
      !window.location.pathname.startsWith('/nexus') ||
      window.location.pathname.includes('/market-news') ||
      document.getElementById('edgepilot-trade-capture-root')
    ) {
      return;
    }

    const mount = document.createElement('div');
    mount.id = 'edgepilot-trade-capture-root';
    document.documentElement.appendChild(mount);
    const root = mount.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        *{box-sizing:border-box}button,input{font:inherit}.ep-launch{position:fixed;right:22px;bottom:22px;z-index:2147483646;border:0;border-radius:14px;background:#f59342;color:#211f42;padding:12px 16px;font:700 14px/1.2 system-ui;box-shadow:0 12px 32px rgba(22,18,54,.38);cursor:pointer}.ep-launch:hover{background:#ffad65}.ep-backdrop{display:none;position:fixed;inset:0;z-index:2147483647;background:rgba(10,9,28,.68);align-items:center;justify-content:center;padding:18px}.ep-backdrop[data-open="true"]{display:flex}.ep-card{width:min(430px,100%);border:1px solid rgba(255,255,255,.12);border-radius:22px;background:#242348;color:#fff;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.45);font-family:system-ui}.ep-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.ep-title{margin:0;font-size:20px}.ep-copy{margin:7px 0 0;color:#aaa9be;font-size:13px;line-height:1.5}.ep-close{border:0;background:transparent;color:#aaa9be;font-size:24px;cursor:pointer}.ep-market{margin-top:18px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:#2d2b55;padding:12px}.ep-label{display:block;color:#aaa9be;font-size:12px;margin-bottom:7px}.ep-market-value{font-size:18px;font-weight:750}.ep-input{width:100%;height:42px;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(255,255,255,.05);color:#fff;padding:0 12px;outline:none}.ep-input:focus{border-color:#f59342}.ep-field{margin-top:16px}.ep-sides{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ep-side{height:42px;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(255,255,255,.04);color:#fff;cursor:pointer}.ep-side[data-active="true"][data-side="BUY"]{border-color:#6ee7b7;background:rgba(52,211,153,.13);color:#a7f3d0}.ep-side[data-active="true"][data-side="SELL"]{border-color:#fda4af;background:rgba(251,113,133,.13);color:#fecdd3}.ep-save{width:100%;height:44px;margin-top:20px;border:0;border-radius:12px;background:#f59342;color:#211f42;font-weight:750;cursor:pointer}.ep-save:disabled{opacity:.5;cursor:not-allowed}.ep-note{margin:12px 0 0;color:#85839c;text-align:center;font-size:11px;line-height:1.5}.ep-toast{display:none;margin-top:14px;border-radius:10px;background:rgba(52,211,153,.12);color:#a7f3d0;padding:10px;font-size:12px;text-align:center}.ep-toast[data-show="true"]{display:block}
      </style>
      <button class="ep-launch" type="button">Log trade</button>
      <div class="ep-backdrop" role="dialog" aria-modal="true" aria-labelledby="ep-title">
        <form class="ep-card">
          <div class="ep-top"><div><h2 class="ep-title" id="ep-title">Capture Nexus trade</h2><p class="ep-copy">Market and time are captured automatically.</p></div><button class="ep-close" type="button" aria-label="Close">×</button></div>
          <div class="ep-market"><span class="ep-label">Detected market</span><div class="ep-market-value">Detecting…</div></div>
          <div class="ep-field"><label class="ep-label" for="ep-amount">Amount / contracts</label><input class="ep-input" id="ep-amount" type="number" min="0.01" step="0.01" value="1" required></div>
          <div class="ep-field"><span class="ep-label">What did you do?</span><div class="ep-sides"><button class="ep-side" data-side="BUY" data-active="true" type="button">BUY</button><button class="ep-side" data-side="SELL" data-active="false" type="button">SELL</button></div></div>
          <div class="ep-toast" aria-live="polite">Trade captured in EdgePilot.</div>
          <button class="ep-save" type="submit">Save trade capture</button>
          <p class="ep-note">Logging only. EdgePilot never clicks or places an order.</p>
        </form>
      </div>`;

    const launch = root.querySelector('.ep-launch');
    const backdrop = root.querySelector('.ep-backdrop');
    const close = root.querySelector('.ep-close');
    const form = root.querySelector('form');
    const marketValue = root.querySelector('.ep-market-value');
    const amountInput = root.querySelector('#ep-amount');
    const toast = root.querySelector('.ep-toast');
    const save = root.querySelector('.ep-save');
    let selectedSide = 'BUY';
    let currentMarket = '';

    const refreshMarket = () => {
      currentMarket = detectMarket();
      marketValue.textContent = currentMarket || 'Market not detected';
      marketValue.style.color = currentMarket ? '#fff' : '#fcd34d';
      save.disabled = !currentMarket;
    };
    const open = () => {
      refreshMarket();
      toast.dataset.show = 'false';
      backdrop.dataset.open = 'true';
      amountInput.focus();
    };
    const dismiss = () => {
      backdrop.dataset.open = 'false';
    };

    launch.addEventListener('click', open);
    close.addEventListener('click', dismiss);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) dismiss();
    });
    root.querySelectorAll('.ep-side').forEach((button) => {
      button.addEventListener('click', () => {
        selectedSide = button.dataset.side;
        root.querySelectorAll('.ep-side').forEach((item) => {
          item.dataset.active = String(item === button);
        });
      });
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      refreshMarket();
      const amount = Number(amountInput.value);
      if (!currentMarket || !Number.isFinite(amount) || amount <= 0) return;
      const capture = {
        id: `nexus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        market: currentMarket,
        side: selectedSide,
        amount,
        timestamp: Date.now(),
        sourceUrl: window.location.href,
      };
      chrome.runtime.sendMessage(
        { type: 'EDGEPILOT_CAPTURE_TRADE', payload: capture },
        (response) => {
          if (!response?.ok) return;
          toast.dataset.show = 'true';
          window.setTimeout(dismiss, 900);
        },
      );
    });
  };

  const sendSnapshot = () => {
    const text = (document.body?.innerText || '')
      .replace(/\s+/g, ' ')
      .slice(0, 60000);
    chrome.runtime.sendMessage({
      type: 'EDGEPILOT_TAB_SNAPSHOT',
      payload: {
        source,
        title: document.title,
        url: window.location.href,
        text,
        timestamp: Date.now(),
      },
    });
  };

  const scheduleSnapshot = () => {
    if (!active) return;
    clearTimeout(timer);
    timer = setTimeout(sendSnapshot, 1200);
  };

  const setActive = (nextActive) => {
    active = Boolean(nextActive);
    clearTimeout(timer);
    observer?.disconnect();
    observer = undefined;
    if (!active) return;
    observer = new MutationObserver(scheduleSnapshot);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    sendSnapshot();
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'EDGEPILOT_REQUEST_SNAPSHOT' && active)
      sendSnapshot();
    if (message?.type === 'EDGEPILOT_MONITOR_ACTIVATE') {
      setActive(message.active);
    }
  });

  chrome.runtime.sendMessage(
    { type: 'EDGEPILOT_SOURCE_READY', payload: { source } },
    (response) => setActive(response?.active),
  );

  installTradeCapture();
})();
