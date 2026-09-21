'use client';

import { useEffect, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Download,
  Eye,
  LockKeyhole,
  RadioTower,
  RefreshCw,
  ShieldAlert,
  Unplug,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type MonitorSignal = 'WAIT' | 'BUY' | 'SELL' | 'FLATTEN';

type BrowserTab = {
  id: number;
  title: string;
  url: string;
};

type MonitorConfig = {
  armed: boolean;
  tradingViewTabId: string;
  propedTabId: string;
  longPhrases: string;
  shortPhrases: string;
  flattenPhrases: string;
  cooldownSeconds: number;
  minimumDrawdownBuffer: number;
  requireNexus: boolean;
};

type MonitorDecision = {
  signal: MonitorSignal;
  reason: string;
  matchedPhrase?: string;
  shouldAlert?: boolean;
  tradingViewFresh?: boolean;
  propedFresh?: boolean;
  newsFresh?: boolean;
  market?: string;
  newsHeadline?: string;
  timestamp?: number;
};

type ExtensionMessage = {
  type?: string;
  version?: string;
  payload?: {
    tradingView?: BrowserTab[];
    proped?: BrowserTab[];
    decision?: MonitorDecision;
  };
};

const defaultConfig: MonitorConfig = {
  armed: false,
  tradingViewTabId: '',
  propedTabId: '',
  longPhrases: 'STRONG BUY, LONG SETUP',
  shortPhrases: 'STRONG SELL, SHORT SETUP',
  flattenPhrases: 'FLATTEN, EXIT SIGNAL, CLOSE POSITION',
  cooldownSeconds: 60,
  minimumDrawdownBuffer: 300,
  requireNexus: true,
};

export function BrowserMonitor({
  accountName,
  drawdownBuffer,
  consistency,
  consistencyLimit,
  onSignal,
}: {
  accountName: string;
  drawdownBuffer: number;
  consistency: number;
  consistencyLimit: number;
  onSignal: (signal: Exclude<MonitorSignal, 'WAIT'>, detail: string) => void;
}) {
  const [config, setConfig] = useState<MonitorConfig>(defaultConfig);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [extensionVersion, setExtensionVersion] = useState('');
  const [tradingViewTabs, setTradingViewTabs] = useState<BrowserTab[]>([]);
  const [propedTabs, setPropedTabs] = useState<BrowserTab[]>([]);
  const [decision, setDecision] = useState<MonitorDecision>({
    signal: 'WAIT',
    reason: 'Install the companion extension, then choose both tabs.',
  });
  const riskAllowed =
    drawdownBuffer >= config.minimumDrawdownBuffer &&
    consistency <= consistencyLimit;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = localStorage.getItem('edgepilot.monitor');
        if (saved) setConfig({ ...defaultConfig, ...JSON.parse(saved) });
      } catch {
        // Keep conservative defaults when browser storage is malformed.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('edgepilot.monitor', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
      if (event.source !== window || !event.data?.type) return;

      if (event.data.type === 'EDGEPILOT_EXTENSION_READY') {
        setExtensionConnected(true);
        setExtensionVersion(event.data.version ?? '1.0');
        window.postMessage({ type: 'EDGEPILOT_DASHBOARD_LIST_TABS' }, '*');
      }

      if (event.data.type === 'EDGEPILOT_EXTENSION_TABS') {
        setExtensionConnected(true);
        setTradingViewTabs(event.data.payload?.tradingView ?? []);
        setPropedTabs(event.data.payload?.proped ?? []);
      }

      if (event.data.type === 'EDGEPILOT_MONITOR_DECISION') {
        const next = event.data.payload?.decision;
        if (!next) return;
        setDecision(next);
        if (next.shouldAlert && next.signal !== 'WAIT') {
          onSignal(
            next.signal,
            next.reason || next.matchedPhrase || 'Browser monitor',
          );
        }
      }
    };

    window.addEventListener('message', handleMessage);
    window.postMessage({ type: 'EDGEPILOT_DASHBOARD_PING' }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, [onSignal]);

  useEffect(() => {
    if (!extensionConnected) return;
    window.postMessage(
      {
        type: 'EDGEPILOT_DASHBOARD_CONFIGURE',
        payload: {
          ...config,
          tradingViewTabId: Number(config.tradingViewTabId) || null,
          propedTabId: Number(config.propedTabId) || null,
          riskAllowed,
          riskSummary: riskAllowed
            ? `${accountName} is inside the configured entry guardrails.`
            : `${accountName} is blocked by the dashboard risk gate.`,
        },
      },
      '*',
    );
  }, [accountName, config, extensionConnected, riskAllowed]);

  const refreshTabs = () => {
    window.postMessage({ type: 'EDGEPILOT_DASHBOARD_LIST_TABS' }, '*');
  };

  const canArm =
    extensionConnected &&
    Boolean(config.tradingViewTabId) &&
    (!config.requireNexus || Boolean(config.propedTabId));

  const selectedTradingView = tradingViewTabs.find(
    (tab) => String(tab.id) === config.tradingViewTabId,
  );
  const selectedProped = propedTabs.find(
    (tab) => String(tab.id) === config.propedTabId,
  );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-white/8 bg-[#373565]">
        <div className="grid gap-0 xl:grid-cols-[1.15fr_.85fr]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#f8b56f]">
                  Local browser companion
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                  Monitor TradingView and Nexus together.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#aaa9be]">
                  The extension watches only the tabs you choose. It matches
                  your visible strategy labels, checks the dashboard risk gate,
                  and sends a buy, sell, or flatten alert back to EdgePilot.
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${extensionConnected ? 'border-emerald-300/20 bg-emerald-300/8 text-emerald-300' : 'border-white/10 bg-white/5 text-[#b7b6cb]'}`}
              >
                <span
                  className={`size-2 rounded-full ${extensionConnected ? 'bg-emerald-400' : 'bg-slate-400'}`}
                />
                {extensionConnected
                  ? `Extension connected · v${extensionVersion}`
                  : 'Extension not detected'}
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                {
                  step: '1',
                  title: 'Install once',
                  detail:
                    'Download and load the unpacked extension in Chrome or Edge.',
                },
                {
                  step: '2',
                  title: 'Choose tabs',
                  detail:
                    'Explicitly select the TradingView chart and Proped Nexus tabs.',
                },
                {
                  step: '3',
                  title: 'Arm monitor',
                  detail:
                    'Keep both tabs open. EdgePilot alerts only when every gate passes.',
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl border border-white/7 bg-[#2d2b55]/65 p-4"
                >
                  <span className="grid size-7 place-items-center rounded-lg bg-[#e1814c] text-xs font-bold">
                    {item.step}
                  </span>
                  <p className="mt-3 text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#9392a5]">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="/edgepilot-browser-monitor.zip"
                download
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#f59342] px-4 text-sm font-semibold text-[#211f42] transition hover:bg-[#ffad65]"
              >
                <Download className="size-4" /> Download extension
              </a>
              <Button
                type="button"
                variant="outline"
                onClick={refreshTabs}
                disabled={!extensionConnected}
                className="h-10 border-white/10 bg-transparent text-white hover:bg-white/6"
              >
                <RefreshCw className="size-4" /> Refresh tabs
              </Button>
            </div>
          </div>

          <div className="border-t border-white/8 bg-[#201f44] p-5 sm:p-7 xl:border-l xl:border-t-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="size-5 text-[#f59342]" /> Monitor agent
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${config.armed ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/6 text-[#9392a5]'}`}
              >
                {config.armed ? 'ARMED' : 'DISARMED'}
              </span>
            </div>

            <div className="my-7 text-center">
              <div
                className={`mx-auto grid size-24 place-items-center rounded-full border ${config.armed ? 'border-emerald-400/30 bg-emerald-400/8 text-emerald-300 shadow-[0_0_36px_rgba(52,211,153,.12)]' : 'border-white/10 bg-white/[.025] text-[#77768d]'}`}
              >
                {config.armed ? (
                  <RadioTower className="size-9" />
                ) : (
                  <Unplug className="size-9" />
                )}
              </div>
              <p className="mt-4 font-semibold">{decision.signal}</p>
              <p className="mt-1 text-sm leading-6 text-[#9392a5]">
                {decision.reason}
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-white/[.035] px-3 py-2.5">
                <span className="text-[#aaa9be]">TradingView feed</span>
                <span
                  className={
                    decision.tradingViewFresh
                      ? 'text-emerald-300'
                      : 'text-[#9392a5]'
                  }
                >
                  {decision.tradingViewFresh ? 'Live' : 'Waiting'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/[.035] px-3 py-2.5">
                <span className="text-[#aaa9be]">Nexus guard</span>
                <span
                  className={
                    decision.propedFresh ? 'text-emerald-300' : 'text-[#9392a5]'
                  }
                >
                  {decision.propedFresh ? 'Live' : 'Waiting'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/[.035] px-3 py-2.5">
                <span className="text-[#aaa9be]">Account risk gate</span>
                <span
                  className={riskAllowed ? 'text-emerald-300' : 'text-rose-300'}
                >
                  {riskAllowed ? 'Pass' : 'Blocked'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/[.035] px-3 py-2.5">
                <span className="text-[#aaa9be]">Market news context</span>
                <span
                  className={
                    decision.newsFresh ? 'text-emerald-300' : 'text-amber-200'
                  }
                >
                  {decision.newsFresh
                    ? `Fresh${decision.market ? ` · ${decision.market}` : ''}`
                    : 'Sync recommended'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-3xl border border-white/8 bg-[#373565] p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Eye className="size-5 text-[#f8b56f]" />
            <h3 className="text-lg font-semibold">Authorized tabs</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#9392a5]">
            The extension ignores every tab except the two selected here.
          </p>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label>TradingView chart tab</Label>
              <Select
                value={config.tradingViewTabId}
                onValueChange={(value) =>
                  setConfig({ ...config, tradingViewTabId: String(value) })
                }
              >
                <SelectTrigger className="h-11 w-full border-white/10 bg-[#2d2b55] text-white">
                  <SelectValue placeholder="Choose an open TradingView tab" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#242348] text-white">
                  {tradingViewTabs.map((tab) => (
                    <SelectItem key={tab.id} value={String(tab.id)}>
                      {tab.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="truncate text-xs text-[#77768d]">
                {selectedTradingView?.url ??
                  'Open TradingView, then refresh tabs.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Proped Nexus tab</Label>
              <Select
                value={config.propedTabId}
                onValueChange={(value) =>
                  setConfig({ ...config, propedTabId: String(value) })
                }
              >
                <SelectTrigger className="h-11 w-full border-white/10 bg-[#2d2b55] text-white">
                  <SelectValue placeholder="Choose an open Proped Nexus tab" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#242348] text-white">
                  {propedTabs.map((tab) => (
                    <SelectItem key={tab.id} value={String(tab.id)}>
                      {tab.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="truncate text-xs text-[#77768d]">
                {selectedProped?.url ?? 'Log in to Nexus, then refresh tabs.'}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-[#2d2b55]/70 p-4">
              <div>
                <p className="text-sm font-medium">Require Nexus connection</p>
                <p className="mt-1 text-xs text-[#9392a5]">
                  Block entry alerts when the selected account tab is stale.
                </p>
              </div>
              <Switch
                checked={config.requireNexus}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, requireNexus: checked })
                }
                className="data-checked:bg-[#f59342]"
              />
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-white/8 bg-[#373565] p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <RadioTower className="size-5 text-[#f8b56f]" />
            <h3 className="text-lg font-semibold">Strategy phrases</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#9392a5]">
            Use the exact labels printed by your TradingView indicator. Separate
            alternatives with commas.
          </p>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="long-phrases">Buy / long labels</Label>
              <Input
                id="long-phrases"
                value={config.longPhrases}
                onChange={(event) =>
                  setConfig({ ...config, longPhrases: event.target.value })
                }
                className="h-11 border-white/10 bg-[#2d2b55]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="short-phrases">Sell / short labels</Label>
              <Input
                id="short-phrases"
                value={config.shortPhrases}
                onChange={(event) =>
                  setConfig({ ...config, shortPhrases: event.target.value })
                }
                className="h-11 border-white/10 bg-[#2d2b55]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flatten-phrases">Flatten / exit labels</Label>
              <Input
                id="flatten-phrases"
                value={config.flattenPhrases}
                onChange={(event) =>
                  setConfig({ ...config, flattenPhrases: event.target.value })
                }
                className="h-11 border-white/10 bg-[#2d2b55]"
              />
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_.74fr]">
        <article className="rounded-3xl border border-white/8 bg-[#373565] p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-[#f8b56f]" />
            <h3 className="text-lg font-semibold">Alert guardrails</h3>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="minimum-buffer">
                Minimum drawdown buffer ($)
              </Label>
              <Input
                id="minimum-buffer"
                type="number"
                min="0"
                value={config.minimumDrawdownBuffer}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    minimumDrawdownBuffer: Number(event.target.value),
                  })
                }
                className="h-11 border-white/10 bg-[#2d2b55]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-cooldown">Repeat cooldown (seconds)</Label>
              <Input
                id="alert-cooldown"
                type="number"
                min="15"
                max="3600"
                value={config.cooldownSeconds}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    cooldownSeconds: Number(event.target.value),
                  })
                }
                className="h-11 border-white/10 bg-[#2d2b55]"
              />
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/8 bg-[#2d2b55]/70 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#aaa9be]">Current drawdown buffer</span>
              <span
                className={
                  drawdownBuffer >= config.minimumDrawdownBuffer
                    ? 'text-emerald-300'
                    : 'text-rose-300'
                }
              >
                ${Math.round(drawdownBuffer).toLocaleString()}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-[#aaa9be]">Current consistency</span>
              <span
                className={
                  consistency <= consistencyLimit
                    ? 'text-emerald-300'
                    : 'text-rose-300'
                }
              >
                {consistency.toFixed(1)}% / {consistencyLimit}%
              </span>
            </div>
          </div>
        </article>

        <article className="flex flex-col rounded-3xl border border-[#e1814c]/30 bg-[#e1814c]/7 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-[#f8b56f]">
            <LockKeyhole className="size-5" />
            <h3 className="font-semibold">Local-only monitoring</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#b8b7ca]">
            Tab text is inspected inside your browser extension. Raw TradingView
            and Nexus page text is not uploaded to EdgePilot or an AI provider.
            Only the resulting signal, connection state, and matched label reach
            this dashboard tab.
          </p>
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-black/10 p-3 text-xs leading-5 text-[#aaa9be]">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
            This monitor never clicks, places, modifies, or closes an order.
          </div>
          <Button
            type="button"
            disabled={!canArm}
            onClick={() => setConfig({ ...config, armed: !config.armed })}
            className={`mt-auto h-11 ${config.armed ? 'bg-rose-400/12 text-rose-200 hover:bg-rose-400/20' : 'bg-[#f59342] text-[#211f42] hover:bg-[#ffad65]'}`}
          >
            {config.armed ? 'Disarm browser monitor' : 'Arm browser monitor'}
          </Button>
          {!canArm && (
            <p className="mt-2 text-center text-xs text-[#9392a5]">
              Connect the extension and select the required tabs first.
            </p>
          )}
        </article>
      </section>
    </div>
  );
}
