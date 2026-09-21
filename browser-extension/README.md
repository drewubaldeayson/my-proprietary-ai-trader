# EdgePilot Browser Monitor

This Manifest V3 extension connects the EdgePilot dashboard to explicitly selected TradingView and Proped Nexus tabs. It performs phrase matching, market-news checks, and connection checks locally in the browser. It never clicks or submits trades.

## Install in Chrome or Edge

1. Extract `edgepilot-browser-monitor.zip`.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder.
5. Refresh EdgePilot, TradingView, and Proped Nexus, then open **Browser monitor** in EdgePilot.
6. Open **Market news** in EdgePilot and select **Sync latest news**.

Keep the selected tabs open while monitoring is armed. Use exact visible labels from your TradingView indicator for the buy, sell, and flatten phrases.

On Proped Nexus trading pages, the extension adds a **Log trade** button. It
detects the visible market and timestamp automatically; enter the amount and choose
BUY or SELL. Captures are stored locally and appear in EdgePilot's trade journal.
