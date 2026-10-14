'use client';

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Clock3,
  ExternalLink,
  Newspaper,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

export type MarketNewsItem = {
  id: string;
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
  markets: string[];
  tone: 'bullish' | 'bearish' | 'neutral' | 'risk';
  highImpact?: boolean;
};

export type MarketNewsFeed = {
  items: MarketNewsItem[];
  syncedAt: number | null;
  sourceUrl: string;
};

const sourceUrl = 'https://app.fundedfuturesnetwork.com/nexus/market-news';

function timeLabel(value: number | null) {
  if (!value) return 'Not synced yet';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const toneStyle = {
  bullish: 'border-emerald-300/20 bg-emerald-300/8 text-emerald-300',
  bearish: 'border-rose-300/20 bg-rose-300/8 text-rose-300',
  risk: 'border-amber-300/20 bg-amber-300/8 text-amber-200',
  neutral: 'border-white/10 bg-white/5 text-[#b7b6cb]',
};

export function MarketNews({
  feed,
  extensionConnected,
  syncing,
  syncError,
  onSync,
}: {
  feed: MarketNewsFeed;
  extensionConnected: boolean;
  syncing: boolean;
  syncError: string;
  onSync: () => void;
}) {
  const bullish = feed.items.filter((item) => item.tone === 'bullish').length;
  const bearish = feed.items.filter((item) => item.tone === 'bearish').length;
  const highImpact = feed.items.filter((item) => item.highImpact).length;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-white/8 bg-[#373565]">
        <div className="grid gap-0 xl:grid-cols-[1.2fr_.8fr]">
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#f8b56f]">
                  FFN market intelligence
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                  Market news context
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#aaa9be]">
                  Sync the latest FFN headlines into the local signal gate. News
                  can add confirmation or caution, but it never creates a trade
                  signal on its own.
                </p>
              </div>
              <Button
                type="button"
                onClick={onSync}
                disabled={!extensionConnected || syncing}
                className="h-10 bg-[#f59342] text-[#211f42] hover:bg-[#ffad65]"
              >
                <RefreshCw
                  className={`size-4 ${syncing ? 'animate-spin' : ''}`}
                />
                {syncing ? 'Syncing…' : 'Sync latest news'}
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium ${extensionConnected ? 'border-emerald-300/20 bg-emerald-300/8 text-emerald-300' : 'border-white/10 bg-white/5 text-[#b7b6cb]'}`}
              >
                <span
                  className={`size-2 rounded-full ${extensionConnected ? 'bg-emerald-400' : 'bg-slate-400'}`}
                />
                {extensionConnected
                  ? 'Extension connected'
                  : 'Extension required to sync'}
              </span>
              <span className="inline-flex items-center gap-2 text-[#9392a5]">
                <Clock3 className="size-4" /> Last sync:{' '}
                {timeLabel(feed.syncedAt)}
              </span>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[#f8b56f] hover:text-white"
              >
                Open source <ExternalLink className="size-3.5" />
              </a>
            </div>

            {syncError && (
              <div className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-300/20 bg-rose-300/8 p-4 text-sm leading-6 text-rose-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {syncError}
              </div>
            )}
          </div>

          <div className="border-t border-white/8 bg-[#201f44] p-5 sm:p-7 xl:border-l xl:border-t-0">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="size-5 text-[#f59342]" /> Signal context
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-white/[.035] p-3 text-center">
                <ArrowUpRight className="mx-auto size-4 text-emerald-300" />
                <p className="mt-2 text-xl font-semibold">{bullish}</p>
                <p className="mt-1 text-xs text-[#9392a5]">Positive</p>
              </div>
              <div className="rounded-2xl bg-white/[.035] p-3 text-center">
                <ArrowDownRight className="mx-auto size-4 text-rose-300" />
                <p className="mt-2 text-xl font-semibold">{bearish}</p>
                <p className="mt-1 text-xs text-[#9392a5]">Negative</p>
              </div>
              <div className="rounded-2xl bg-white/[.035] p-3 text-center">
                <AlertTriangle className="mx-auto size-4 text-amber-300" />
                <p className="mt-2 text-xl font-semibold">{highImpact}</p>
                <p className="mt-1 text-xs text-[#9392a5]">High impact</p>
              </div>
            </div>
            <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[#9392a5]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" />
              Conflicting high-impact news pauses new buy or sell alerts.
              Matching context is included in the alert reason for review.
            </p>
          </div>
        </div>
      </section>

      {feed.items.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {feed.items.map((item) => (
            <article
              key={item.id}
              className="rounded-3xl border border-white/8 bg-[#373565] p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${toneStyle[item.tone]}`}
                >
                  {item.tone === 'risk' ? 'Event risk' : item.tone}
                </span>
                {item.highImpact && (
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-2.5 py-1 text-xs font-semibold text-amber-200">
                    High impact
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-lg font-semibold leading-7">
                {item.title}
              </h3>
              {item.summary && (
                <p className="mt-2 text-sm leading-6 text-[#aaa9be]">
                  {item.summary}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/7 pt-4">
                <div className="flex flex-wrap gap-1.5">
                  {(item.markets.length ? item.markets : ['Broad market']).map(
                    (market) => (
                      <span
                        key={market}
                        className="rounded-lg bg-[#2d2b55] px-2 py-1 text-xs text-[#b8b7ca]"
                      >
                        {market}
                      </span>
                    ),
                  )}
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#f8b56f] hover:text-white"
                >
                  Read <ExternalLink className="size-3.5" />
                </a>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="grid min-h-[340px] place-items-center rounded-3xl border border-dashed border-white/10 bg-[#373565]/65 p-8 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/6 text-[#f8b56f]">
              <Newspaper />
            </span>
            <h3 className="mt-4 text-lg font-semibold">
              No market news synced
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#9392a5]">
              Connect the updated extension, then sync. EdgePilot stores only
              the extracted headlines and market tags on this device.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
