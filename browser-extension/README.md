# EdgePilot Browser Monitor

This Manifest V3 extension connects the EdgePilot dashboard to explicitly selected TradingView and FFN Nexus tabs. It performs phrase matching, market-news checks, and connection checks locally in the browser. It never clicks or submits trades.

## Install in Chrome, Brave, or Edge

1. Extract `edgepilot-browser-monitor.zip`.
2. Open `chrome://extensions` in Chrome, `brave://extensions` in Brave, or
   `edge://extensions` in Edge.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder.
5. Refresh EdgePilot, TradingView, and FFN Nexus, then open **Browser monitor** in EdgePilot.
6. Open **Market news** in EdgePilot and select **Sync latest news**.

Keep the selected tabs open while monitoring is armed. Use exact visible labels from your TradingView indicator for the buy, sell, and flatten phrases.

The FFN selector supports both the current
`app.fundedfuturesnetwork.com/nexus` portal and the legacy
`ffn.nexusprop.com` portal. Entry alerts are blocked when the dashboard risk
gate fails or the selected Nexus account page reports a live rule problem.

On FFN Nexus trading pages, the extension adds a **Log trade** button. It
detects the visible market and timestamp automatically; enter the amount and choose
BUY or SELL. Captures are stored locally and appear in EdgePilot's trade journal.
