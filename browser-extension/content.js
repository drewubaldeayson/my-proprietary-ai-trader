(() => {
  const VERSION = '1.0.0';
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
        chrome.runtime.sendMessage({ type: 'EDGEPILOT_LIST_TABS' }, (payload) => {
          window.postMessage(
            { type: 'EDGEPILOT_EXTENSION_TABS', payload },
            '*',
          );
        });
      }
      if (event.data.type === 'EDGEPILOT_DASHBOARD_CONFIGURE') {
        chrome.runtime.sendMessage(
          { type: 'EDGEPILOT_CONFIGURE', payload: event.data.payload },
          () => undefined,
        );
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'EDGEPILOT_MONITOR_DECISION') {
        window.postMessage(message, '*');
      }
    });

    announce();
    return;
  }

  const source = host.includes('tradingview.com') ? 'tradingview' : 'proped';
  let timer;
  let observer;
  let active = false;

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
    if (message?.type === 'EDGEPILOT_REQUEST_SNAPSHOT' && active) sendSnapshot();
    if (message?.type === 'EDGEPILOT_MONITOR_ACTIVATE') {
      setActive(message.active);
    }
  });

  chrome.runtime.sendMessage(
    { type: 'EDGEPILOT_SOURCE_READY', payload: { source } },
    (response) => setActive(response?.active),
  );
})();
