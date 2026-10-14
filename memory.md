# EdgePilot project memory

Read this file before changing this project in a future session. It records the current product state and continuation rules. Never add access tokens, API keys, passwords, cookies, or short-lived repository credentials here.

## Product purpose

EdgePilot is Granger's private prop-trading decision cockpit. It is designed around a Funded Futures Network Standard MAX 50K evaluation and helps track account rules, closed trades, qualifying-day progress, drawdown, daily loss, consistency, contract scaling, payout readiness, market availability, and audible trading alerts.

This is a decision-support and journaling application. It is not a broker, it does not place orders, and it must not fabricate live AI signals when no verified source is connected.

## Live site

- Private production URL: https://edgepilot-ai-trader.grangerdeil.chatgpt.site
- Sites project ID: `appgprj_6aad341fc7088191affc2e2fae11de98`
- The site is owner-only with custom access for one account. Preserve that access unless Granger explicitly asks to change it.
- Sites versions advance on every publication; query the Sites project rather than relying on a stored version number.

## Main account defaults

The starter account is **FFN Standard MAX 50K**:

- Starting balance: $50,000
- Funding path: MAX Standard, five days to pass
- Evaluation profit target: $3,000
- Drawdown: $2,000, EOD (End of Day)
- Daily loss limit: $1,250 soft breach; session lockout rather than account failure
- Minimum trading days: 5 winning days with at least $150 net profit at the session close
- Consistency limit: 40%
- Maximum position: 4 minis or 40 micros
- Evaluation reset fee: $100; activation fee: none
- Data connection: Nexus Connect; selected platform: Onyx
- Funded profit share: 80%; payout frequency: same day
- Funded drawdown lock: original account size ($50,000) after the $2,000 buffer is built
- Funded buffer: $2,000; minimum payout: $500 above the buffer
- Payout cap: $1,500 for payouts 1–3 and $2,000 for payout 4+
- Funded reset fee: $625 before any payout, once
- Funded scaling: 2 minis/20 micros at $0–$1,000 profit; 3/30 at $1,001–$2,000; 4/40 at $2,001+
- Promotion review: after 4 payouts on one account or 10 since the prior review; all Sim Funded accounts close on review
- The FFN add-ons page showed no active add-ons during the October 2026 verification. It offered Rithmic Level 2 and extra Rithmic market-data sessions, neither applicable to the selected Nexus Connect plan.

The dashboard keeps a futures symbol watchlist as a planning aid. It no longer claims the list is an authoritative FFN market universe; Nexus Connect, Onyx, the contract calendar, and the signed FFN agreement control availability.

## Design system

- Main dashboard: `#2d2b55`
- Sidebar: `#1e1e3f`
- Active navigation: `#e1814c`
- Logo and primary accent: `#f59342`
- Active text: `#ffffff`
- Inactive sidebar text: `#828bb7`
- Secondary text: `#9392a5`

The visual direction is a dense but calm risk cockpit. Preserve the existing navy/indigo/terracotta styling unless Granger requests a redesign.

## Implemented dashboard features

- Multiple manually managed prop accounts
- Account switcher and editable account requirements
- Closed-trade journal stored in browser `localStorage`
- Real-time calculations after each logged trade:
  - current balance and cumulative P&L
  - profit-target progress
  - projected EOD trailing drawdown floor from daily closing balances and remaining buffer
  - closed-P&L daily-loss headroom
  - five $150+ winning-day progress
  - largest winning day and consistency percentage
  - today's closed P&L
  - win rate and closed-trade count
- Position-limit warning in the trade form
- Evaluation readiness, funded contract scaling, and payout map
- Futures watchlist and Chicago futures-session indicator
- Distinct Web Audio sounds for BUY, SELL, and FLATTEN
- Practice signal buttons for testing sounds and UI
- WebMCP tools for reading the selected account summary and logging a closed trade when the browser supports WebMCP
- Responsive desktop and mobile layouts

Primary files:

- `app/page.tsx` — main dashboard, account model, journal, calculations, signals, and views
- `app/browser-monitor.tsx` — browser-monitor settings and dashboard/extension bridge
- `app/globals.css` — palette and global styling
- `app/layout.tsx` — metadata
- `.openai/hosting.json` — Sites project binding

## Browser Monitor companion

The Browser Monitor was added because a normal hosted web page cannot read another tab. It is a Manifest V3 extension compatible with Brave, Chrome, and Edge.

Source files:

- `browser-extension/manifest.json`
- `browser-extension/content.js`
- `browser-extension/background.js`
- `browser-extension/README.md`
- Published download: `public/edgepilot-browser-monitor.zip`

Behavior:

1. The user installs the unpacked extension manually.
2. The EdgePilot **Browser monitor** screen detects the extension.
3. The user explicitly selects one TradingView tab and, normally, one FFN Nexus tab at `app.fundedfuturesnetwork.com/nexus` (the legacy `ffn.nexusprop.com` host remains supported).
4. Only the selected source tabs are activated for text monitoring.
5. The extension matches exact, user-configured TradingView indicator phrases.
6. BUY or SELL is allowed only when drawdown, daily-loss, and consistency gates pass, the required Nexus tab is fresh, and any visible Nexus live-rule status does not report a block or violation.
7. FLATTEN/exit phrases can alert regardless of entry risk gating.
8. Repeated sounds are limited by a configurable cooldown.
9. The extension relays only connection state, the resulting decision, and the matched phrase to the dashboard. Raw tab text stays inside the local extension and is not uploaded.
10. The extension never clicks, submits, modifies, closes, or places an order.

Default monitored phrases:

- BUY: `STRONG BUY`, `LONG SETUP`
- SELL: `STRONG SELL`, `SHORT SETUP`
- FLATTEN: `FLATTEN`, `EXIT SIGNAL`, `CLOSE POSITION`

Default safety settings:

- Require a fresh Nexus tab
- Minimum drawdown buffer: $300
- Repeat cooldown: 60 seconds
- Consistency must remain within the selected account's saved limit

Important limitation: this is currently deterministic phrase-and-risk monitoring. It is not general AI vision or unrestricted screen interpretation. Adding model-based analysis requires a secure model connection and explicit approval for what tab data may be sent to that model. Never describe the current monitor as model-based AI.

## Extension installation flow shown to the user

1. Open EdgePilot and select **Browser monitor**.
2. Download and extract `edgepilot-browser-monitor.zip`.
3. Open `brave://extensions`, `chrome://extensions`, or `edge://extensions`.
4. Enable Developer mode.
5. Choose **Load unpacked** and select the extracted folder.
6. Refresh EdgePilot, the TradingView or FFN Onyx signal tab, and FFN Nexus.
7. Return to Browser Monitor, refresh tabs, select the Onyx/TradingView signal tab and Nexus tab, enter exact strategy labels, and arm monitoring.
8. Enable sound once in EdgePilot so browser audio is unlocked.

## Safety and product rules

- Never claim a live signal is AI-generated without an actual verified model and data source.
- Never automate order placement without a separate explicit user request, a carefully scoped confirmation design, and appropriate platform authorization.
- Keep account data and journal data local unless Granger explicitly asks for durable cloud storage.
- Treat FFN Nexus/Onyx and the signed account agreement as the authority. Dashboard calculations are projections from manually logged closed trades and do not include unrealized P&L.
- Preserve owner-only hosting by default.
- Do not store browser-tab text, credentials, session cookies, or authentication data.
- Browser permissions must remain explicit and limited to TradingView, FFN Onyx at `*.onyx-trader.com`, the current `app.fundedfuturesnetwork.com` portal, the legacy `ffn.nexusprop.com` portal, EdgePilot, and local development.

## FFN Onyx support

Extension v1.4.1 recognizes the FFN Onyx trading surface at
`https://ffn.onyx-trader.com/*` as a signal-source tab. Onyx appears in the
TradingView / Onyx dropdown, while the FFN Nexus account page remains a
separate risk-guard selection. The Browser Monitor remains mounted while the
user navigates between EdgePilot sections, so armed monitoring and dashboard
signal delivery continue on Overview. Version 1.4.1 also migrates the legacy
`FLATTEN, EXIT SIGNAL, CLOSE POSITION` default to `FLATTEN SIGNAL, EXIT SIGNAL`
to prevent permanent Onyx order controls from causing false flatten alerts.

## Development and validation

The project uses Vinext/React 19, Tailwind CSS 4, the bundled Shadcn/Base UI primitives, Bun, and Cloudflare-compatible Sites output.

Useful validation commands:

```powershell
bun x tsc --noEmit
bun x oxlint app/page.tsx app/browser-monitor.tsx
node --check browser-extension\background.js
node --check browser-extension\content.js
bun run build
```

Regenerate the downloadable extension after changing anything in `browser-extension/`:

```powershell
Compress-Archive -Path 'browser-extension\*' -DestinationPath 'public\edgepilot-browser-monitor.zip' -Force
```

The full starter lint currently reports unrelated accessibility issues inside untouched generated UI primitives. The application-specific files pass their targeted lint checks.

The workspace's `rtk` helper was not installed when this project was built, despite the workspace instructions mentioning it. Native commands were used after confirming `rtk` was unavailable.

## Publishing continuation

This is an existing private Sites project. For future releases:

1. Read the `sites-building` skill and validate the app.
2. Read the `sites-hosting` skill.
3. Commit the exact validated source.
4. Obtain a fresh short-lived Sites source-repository credential. Never write it to disk or Git configuration.
5. Push the commit to the configured Sites repository.
6. Package the validated build with the Sites `package-site.sh` helper.
7. Save a new Site version using the full pushed commit SHA and package archive.
8. Re-check that access is still verifiably owner-only.
9. Deploy with the private-site deployment operation and poll to a terminal success state.
10. Remove the temporary package archive and stop the local development server.

## Next likely improvements

- Secure, explicitly authorized model-based interpretation of selected TradingView context
- More robust structured TradingView inputs through alerts/webhooks instead of visible-text matching
- Optional encrypted cloud persistence across devices
- Notifications when the dashboard tab is in the background
- Trade editing/deletion with confirmation and an audit history

Do not implement these automatically; they require a new user request and, for model/tab-data transmission, explicit consent and a secure credential path.

codex resume 01a1377e-ad06-74e3-9f46-b5cdc18ae3a1
