'use client';

import {
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  ChevronRight,
  Clock3,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Menu,
  Newspaper,
  Plus,
  Radio,
  RadioTower,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Volume2,
  VolumeX,
  WalletCards,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BrowserMonitor } from '@/app/browser-monitor';
import { MarketNews, type MarketNewsFeed } from '@/app/market-news';

type View =
  | 'overview'
  | 'journal'
  | 'markets'
  | 'news'
  | 'monitor'
  | 'settings';
type Signal = 'WAIT' | 'BUY' | 'SELL' | 'FLATTEN';

type Account = {
  id: string;
  name: string;
  provider: string;
  startingBalance: number;
  fundingPath: string;
  stage: 'Evaluation' | 'Funded';
  drawdownAmount: number;
  drawdownModel: string;
  profitTarget: number;
  dailyLossLimit: number;
  minTradingDays: number;
  qualifyingDayMinimum: number;
  consistencyLimit: number;
  maxMinis: number;
  maxMicros: number;
  profitShare: string;
  payoutSchedule: string;
  maxPayout: number;
  maxPayoutLater: number;
  minimumPayout: number;
  drawdownLock: number;
  buffer: number;
  resetFee: number;
  fundedResetFee: number;
  dataFeed: string;
  platform: string;
  weekendHolds: boolean;
};

type Trade = {
  id: string;
  accountId: string;
  date: string;
  market: string;
  direction: 'Long' | 'Short';
  contracts: number;
  sizeType: 'Mini' | 'Micro';
  pnl: number;
  notes: string;
};

type QuickTrade = {
  id: string;
  accountId: string;
  market: string;
  side: 'BUY' | 'SELL';
  amount: number;
  timestamp: number;
  sourceUrl: string;
};

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

const defaultAccount: Account = {
  // Keep this ID stable so the original seeded 25K account migrates in place
  // without orphaning its local journal entries.
  id: 'proped-standard-25k',
  name: 'FFN Standard MAX 50K',
  provider: 'Funded Futures Network',
  startingBalance: 50000,
  fundingPath: 'MAX Standard · 5 days to pass',
  stage: 'Evaluation',
  drawdownAmount: 2000,
  drawdownModel: 'EOD (End of Day)',
  profitTarget: 3000,
  dailyLossLimit: 1250,
  minTradingDays: 5,
  qualifyingDayMinimum: 150,
  consistencyLimit: 40,
  maxMinis: 4,
  maxMicros: 40,
  profitShare: '80%',
  payoutSchedule: 'Same day',
  maxPayout: 1500,
  maxPayoutLater: 2000,
  minimumPayout: 500,
  drawdownLock: 50000,
  buffer: 2000,
  resetFee: 100,
  fundedResetFee: 625,
  dataFeed: 'Nexus Connect',
  platform: 'Onyx',
  weekendHolds: false,
};

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'journal', label: 'Trade journal', icon: ListChecks },
  { id: 'markets', label: 'Markets', icon: BarChart3 },
  { id: 'news', label: 'Market news', icon: Newspaper },
  { id: 'monitor', label: 'Browser monitor', icon: RadioTower },
  { id: 'settings', label: 'Accounts', icon: Settings },
];

const markets = [
  {
    category: 'Stock indices',
    symbols: 'ES · MES · NQ · MNQ · YM · MYM · RTY · M2K',
  },
  { category: 'Energy', symbols: 'CL · MCL · NG · QM' },
  { category: 'Metals', symbols: 'GC · MGC · SI · SIL · HG · PL' },
  { category: 'Agriculture', symbols: 'ZC · ZW · ZS · ZM · ZL' },
  { category: 'Currencies', symbols: '6E · 6J · 6B · 6A · 6C · 6S · 6N · 6M' },
  { category: 'Treasuries', symbols: 'ZB · ZN · ZF · ZT · GE' },
  { category: 'Crypto futures', symbols: 'BTC · MBT · ETH · MET' },
];

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const today = () => new Date().toISOString().slice(0, 10);
const emptyNewsFeed: MarketNewsFeed = {
  items: [],
  syncedAt: null,
  sourceUrl: 'https://app.fundedfuturesnetwork.com/nexus/market-news',
};
const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

type FundedScalingBand = {
  maxProfit: number;
  minis: number;
  micros: number;
  range: string;
};

function getFundedScalingBands(account: Account): FundedScalingBand[] {
  const plans: Record<number, FundedScalingBand[]> = {
    25000: [
      { maxProfit: 800, minis: 1, micros: 10, range: '$0–$800 profit' },
      { maxProfit: 1000, minis: 2, micros: 20, range: '$801–$1,000 profit' },
      { maxProfit: Infinity, minis: 3, micros: 30, range: '$1,001+ profit' },
    ],
    50000: [
      { maxProfit: 1000, minis: 2, micros: 20, range: '$0–$1,000 profit' },
      { maxProfit: 2000, minis: 3, micros: 30, range: '$1,001–$2,000 profit' },
      { maxProfit: Infinity, minis: 4, micros: 40, range: '$2,001+ profit' },
    ],
    100000: [
      { maxProfit: 3000, minis: 4, micros: 40, range: '$0–$3,000 profit' },
      { maxProfit: 4500, minis: 6, micros: 60, range: '$3,001–$4,500 profit' },
      { maxProfit: Infinity, minis: 10, micros: 100, range: '$4,501+ profit' },
    ],
    150000: [
      { maxProfit: 3000, minis: 4, micros: 40, range: '$0–$3,000 profit' },
      { maxProfit: 4500, minis: 8, micros: 80, range: '$3,001–$4,500 profit' },
      { maxProfit: Infinity, minis: 15, micros: 150, range: '$4,501+ profit' },
    ],
    250000: [
      { maxProfit: 5000, minis: 6, micros: 60, range: '$0–$5,000 profit' },
      {
        maxProfit: 9000,
        minis: 12,
        micros: 120,
        range: '$5,001–$9,000 profit',
      },
      { maxProfit: Infinity, minis: 20, micros: 200, range: '$9,001+ profit' },
    ],
  };

  return (
    plans[account.startingBalance] ?? [
      {
        maxProfit: Infinity,
        minis: account.maxMinis,
        micros: account.maxMicros,
        range: 'Confirm scaling in FFN Nexus',
      },
    ]
  );
}

function normalizeAccount(value: Partial<Account>): Account {
  const isLegacyStarter =
    value.id === defaultAccount.id ||
    (value.provider === 'Proped Capital' && value.startingBalance === 25000);

  if (isLegacyStarter) {
    return { ...value, ...defaultAccount, id: value.id ?? defaultAccount.id };
  }

  const drawdownAmount = value.drawdownAmount ?? defaultAccount.drawdownAmount;
  return {
    ...defaultAccount,
    ...value,
    id: value.id ?? newId(),
    stage: value.stage ?? 'Evaluation',
    dailyLossLimit: value.dailyLossLimit ?? drawdownAmount,
    minTradingDays: value.minTradingDays ?? 0,
    qualifyingDayMinimum: value.qualifyingDayMinimum ?? 0,
    maxPayoutLater: value.maxPayoutLater ?? value.maxPayout ?? 0,
    minimumPayout: value.minimumPayout ?? 0,
    drawdownLock: value.drawdownLock ?? 0,
    buffer: value.buffer ?? drawdownAmount,
    resetFee: value.resetFee ?? 0,
    fundedResetFee: value.fundedResetFee ?? 0,
    platform: value.platform ?? value.dataFeed ?? 'Confirm in account portal',
  };
}

function buildStats(account: Account, trades: Trade[]) {
  const ordered = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const profit = ordered.reduce((sum, trade) => sum + trade.pnl, 0);
  const balance = account.startingBalance + profit;
  const daily = new Map<string, number>();

  for (const trade of ordered) {
    daily.set(trade.date, (daily.get(trade.date) ?? 0) + trade.pnl);
  }

  let running = account.startingBalance;
  let peak = running;
  const curve = [running];
  const dailyResults = [...daily.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [, dailyPnl] of dailyResults) {
    running += dailyPnl;
    peak = Math.max(peak, running);
    curve.push(running);
  }

  const winningTrades = ordered.filter((trade) => trade.pnl > 0).length;
  const largestDay = Math.max(0, ...daily.values());
  const consistency = profit > 0 ? (largestDay / profit) * 100 : 0;
  const trailingFloor = peak - account.drawdownAmount;
  const projectedFloor =
    account.stage === 'Funded' && account.drawdownLock > 0
      ? Math.min(trailingFloor, account.drawdownLock)
      : trailingFloor;
  const drawdownBuffer = balance - projectedFloor;
  const todaysPnl = daily.get(today()) ?? 0;
  const dailyLossRemaining = Math.max(
    0,
    account.dailyLossLimit + Math.min(0, todaysPnl),
  );
  const qualifyingDays = dailyResults.filter(
    ([, dailyPnl]) => dailyPnl >= account.qualifyingDayMinimum,
  ).length;
  const dayProgress = account.minTradingDays
    ? clamp((qualifyingDays / account.minTradingDays) * 100)
    : 100;
  const fundedBand = getFundedScalingBands(account).find(
    (band) => profit <= band.maxProfit,
  );
  const contractCapMinis =
    account.stage === 'Funded'
      ? (fundedBand?.minis ?? account.maxMinis)
      : account.maxMinis;
  const contractCapMicros =
    account.stage === 'Funded'
      ? (fundedBand?.micros ?? account.maxMicros)
      : account.maxMicros;
  const passReady =
    account.stage === 'Evaluation' &&
    profit >= account.profitTarget &&
    qualifyingDays >= account.minTradingDays &&
    consistency <= account.consistencyLimit &&
    drawdownBuffer > 0 &&
    dailyLossRemaining > 0;

  return {
    balance,
    profit,
    peak,
    curve,
    projectedFloor,
    drawdownBuffer,
    todaysPnl,
    dailyLossRemaining,
    consistency,
    largestDay,
    qualifyingDays,
    tradingDays: daily.size,
    dayProgress,
    contractCapMinis,
    contractCapMicros,
    passReady,
    winRate: ordered.length ? (winningTrades / ordered.length) * 100 : 0,
    progress: clamp((profit / account.profitTarget) * 100),
    trades: ordered.length,
  };
}

function getChicagoSession() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const weekday = pick('weekday');
  const hour = Number(pick('hour')) % 24;
  const minute = Number(pick('minute'));
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} CT`;

  if (
    weekday === 'Sat' ||
    (weekday === 'Sun' && hour < 17) ||
    (weekday === 'Fri' && hour >= 16)
  ) {
    return { label: 'Market closed', tone: 'closed', time };
  }
  if (hour === 16) return { label: 'Daily maintenance', tone: 'pause', time };
  return { label: 'Futures session open', tone: 'open', time };
}

function Sparkline({ values }: { values: number[] }) {
  const width = 520;
  const height = 140;
  const padded = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...padded);
  const max = Math.max(...padded);
  const range = max - min || 1;
  const points = padded
    .map((value, index) => {
      const x = (index / (padded.length - 1)) * width;
      const y = height - 14 - ((value - min) / range) * (height - 28);
      return `${x},${y}`;
    })
    .join(' ');
  const lastY = points.split(' ').at(-1)?.split(',')[1] ?? 70;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-32 w-full"
      aria-label="Account balance curve"
    >
      <title>Account balance curve</title>
      <defs>
        <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f59342" stopOpacity=".34" />
          <stop offset="1" stopColor="#f59342" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        y1="70"
        x2={width}
        y2="70"
        stroke="rgba(255,255,255,.08)"
        strokeDasharray="5 7"
      />
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill="url(#curve-fill)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="#f59342"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={width} cy={lastY} r="5" fill="#f8b56f" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof WalletCards;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <article className="rounded-2xl border border-white/8 bg-[#373565] p-4 shadow-[0_14px_32px_rgba(14,12,39,.18)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#aaaac0]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {value}
          </p>
        </div>
        <span
          className={`grid size-9 place-items-center rounded-xl ${tone === 'good' ? 'bg-emerald-400/12 text-emerald-300' : tone === 'warn' ? 'bg-amber-400/12 text-amber-300' : 'bg-white/7 text-[#b8b8d1]'}`}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#9392a5]">{detail}</p>
    </article>
  );
}

export default function Home() {
  const [view, setView] = useState<View>('overview');
  const [accounts, setAccounts] = useState<Account[]>([defaultAccount]);
  const [selectedAccountId, setSelectedAccountId] = useState(defaultAccount.id);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [quickTrades, setQuickTrades] = useState<QuickTrade[]>([]);
  const [newsFeed, setNewsFeed] = useState<MarketNewsFeed>(emptyNewsFeed);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [newsSyncing, setNewsSyncing] = useState(false);
  const [newsSyncError, setNewsSyncError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [signal, setSignal] = useState<Signal>('WAIT');
  const [signalSource, setSignalSource] = useState('Practice mode');
  const [tradeDialogOpen, setTradeDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [accountMode, setAccountMode] = useState<'add' | 'edit'>('add');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState(getChicagoSession);
  const [tradeForm, setTradeForm] = useState({
    date: today(),
    market: 'MES',
    direction: 'Long' as 'Long' | 'Short',
    contracts: 1,
    sizeType: 'Micro' as 'Mini' | 'Micro',
    pnl: 0,
    notes: '',
  });
  const [accountForm, setAccountForm] = useState<Account>(defaultAccount);
  const audioRef = useRef<AudioContext | null>(null);

  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ??
    accounts[0] ??
    defaultAccount;
  const accountTrades = trades.filter(
    (trade) => trade.accountId === selectedAccount.id,
  );
  const stats = useMemo(
    () => buildStats(selectedAccount, accountTrades),
    [selectedAccount, accountTrades],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const savedAccounts = localStorage.getItem('edgepilot.accounts');
        const savedTrades = localStorage.getItem('edgepilot.trades');
        const savedSelected = localStorage.getItem('edgepilot.selected');
        const savedSound = localStorage.getItem('edgepilot.sound');
        const savedQuickTrades = localStorage.getItem('edgepilot.quickTrades');
        const savedNews = localStorage.getItem('edgepilot.marketNews');
        if (savedAccounts) {
          const parsed = JSON.parse(savedAccounts);
          if (Array.isArray(parsed)) setAccounts(parsed.map(normalizeAccount));
        }
        if (savedTrades) setTrades(JSON.parse(savedTrades));
        if (savedSelected) setSelectedAccountId(savedSelected);
        if (savedSound) setSoundEnabled(savedSound === 'true');
        if (savedQuickTrades) setQuickTrades(JSON.parse(savedQuickTrades));
        if (savedNews)
          setNewsFeed({ ...emptyNewsFeed, ...JSON.parse(savedNews) });
      } catch {
        // Keep the starter account when browser storage is malformed.
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem('edgepilot.accounts', JSON.stringify(accounts));
    localStorage.setItem('edgepilot.trades', JSON.stringify(trades));
    localStorage.setItem('edgepilot.selected', selectedAccountId);
    localStorage.setItem('edgepilot.sound', String(soundEnabled));
    localStorage.setItem('edgepilot.quickTrades', JSON.stringify(quickTrades));
    localStorage.setItem('edgepilot.marketNews', JSON.stringify(newsFeed));
  }, [
    accounts,
    trades,
    quickTrades,
    newsFeed,
    selectedAccountId,
    soundEnabled,
    loaded,
  ]);

  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data?.type) return;

      if (event.data.type === 'EDGEPILOT_EXTENSION_READY') {
        setExtensionConnected(true);
        window.postMessage(
          { type: 'EDGEPILOT_DASHBOARD_GET_TRADE_CAPTURES' },
          '*',
        );
      }

      if (event.data.type === 'EDGEPILOT_MARKET_NEWS_RESULT') {
        setNewsSyncing(false);
        const result = event.data.payload;
        if (!result?.ok || !result.feed) {
          setNewsSyncError(
            result?.error ?? 'The FFN market-news page could not be synced.',
          );
          return;
        }
        setNewsFeed(result.feed);
        setNewsSyncError('');
      }

      if (event.data.type === 'EDGEPILOT_TRADE_CAPTURES') {
        const captures = Array.isArray(event.data.payload?.captures)
          ? event.data.payload.captures
          : [];
        setQuickTrades((current) => {
          const known = new Set(current.map((trade) => trade.id));
          const incoming = captures
            .filter((trade: QuickTrade) => trade?.id && !known.has(trade.id))
            .map((trade: QuickTrade) => ({
              ...trade,
              accountId: selectedAccountId,
            }));
          return incoming.length
            ? [...incoming, ...current].slice(0, 200)
            : current;
        });
      }
    };

    window.addEventListener('message', handleExtensionMessage);
    window.postMessage({ type: 'EDGEPILOT_DASHBOARD_PING' }, '*');
    return () => window.removeEventListener('message', handleExtensionMessage);
  }, [selectedAccountId]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setSession(getChicagoSession()),
      60000,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const register = async () => {
      await context.registerTool(
        {
          name: 'get_prop_account_summary',
          title: 'Get prop account summary',
          description:
            'Read the selected account balance, target progress, qualifying days, daily-loss room, drawdown buffer, and consistency from the visible EdgePilot dashboard.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => ({
            account: selectedAccount.name,
            balance: stats.balance,
            profit: stats.profit,
            targetProgressPercent: Math.round(stats.progress * 10) / 10,
            qualifyingDays: stats.qualifyingDays,
            requiredQualifyingDays: selectedAccount.minTradingDays,
            dailyLossRemaining: stats.dailyLossRemaining,
            projectedDrawdownBuffer: stats.drawdownBuffer,
            consistencyPercent: Math.round(stats.consistency * 10) / 10,
            readyToPass: stats.passReady,
          }),
        },
        { signal: lifecycle.signal },
      );

      await context.registerTool(
        {
          name: 'log_closed_trade',
          title: 'Log closed trade',
          description:
            'Add a closed trade to the selected EdgePilot account and immediately update the visible risk statistics.',
          inputSchema: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'ISO date in YYYY-MM-DD format.',
              },
              market: { type: 'string' },
              direction: { type: 'string', enum: ['Long', 'Short'] },
              contracts: { type: 'number', minimum: 0.01 },
              sizeType: { type: 'string', enum: ['Mini', 'Micro'] },
              pnl: { type: 'number' },
              notes: { type: 'string' },
            },
            required: [
              'date',
              'market',
              'direction',
              'contracts',
              'sizeType',
              'pnl',
            ],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (input) => {
            const value = input as Partial<Trade>;
            if (
              !value.date ||
              !value.market ||
              !['Long', 'Short'].includes(value.direction ?? '') ||
              !['Mini', 'Micro'].includes(value.sizeType ?? '') ||
              typeof value.contracts !== 'number' ||
              value.contracts <= 0 ||
              typeof value.pnl !== 'number'
            ) {
              throw new Error('Invalid closed trade input.');
            }
            const trade: Trade = {
              id: newId(),
              accountId: selectedAccount.id,
              date: value.date,
              market: value.market.toUpperCase(),
              direction: value.direction as 'Long' | 'Short',
              contracts: value.contracts,
              sizeType: value.sizeType as 'Mini' | 'Micro',
              pnl: value.pnl,
              notes: value.notes ?? '',
            };
            setTrades((current) => [...current, trade]);
            return {
              logged: true,
              tradeId: trade.id,
              account: selectedAccount.name,
            };
          },
        },
        { signal: lifecycle.signal },
      );
    };

    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [selectedAccount, stats]);

  const playSignalSound = (nextSignal: Signal) => {
    if (!soundEnabled || nextSignal === 'WAIT') return;
    try {
      const AudioCtor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) return;
      const audio = audioRef.current ?? new AudioCtor();
      audioRef.current = audio;
      const frequencies =
        nextSignal === 'BUY'
          ? [620, 820]
          : nextSignal === 'SELL'
            ? [520, 360]
            : [260, 220, 180];
      frequencies.forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime + index * 0.12;
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.11);
      });
    } catch {
      // Audio remains optional when the browser blocks playback.
    }
  };

  const previewSignal = (nextSignal: Signal) => {
    setSignal(nextSignal);
    setSignalSource('Practice alert · interface test only');
    playSignalSound(nextSignal);
  };

  const syncMarketNews = () => {
    setNewsSyncing(true);
    setNewsSyncError('');
    window.postMessage({ type: 'EDGEPILOT_DASHBOARD_SYNC_MARKET_NEWS' }, '*');
  };

  const handleMonitorSignal = (
    nextSignal: Exclude<Signal, 'WAIT'>,
    detail: string,
  ) => {
    setSignal(nextSignal);
    setSignalSource(`Browser monitor · ${detail}`);
    playSignalSound(nextSignal);
  };

  const submitTrade = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trade: Trade = {
      id: newId(),
      accountId: selectedAccount.id,
      ...tradeForm,
      market: tradeForm.market.trim().toUpperCase(),
    };
    setTrades((current) => [...current, trade]);
    setTradeDialogOpen(false);
    setTradeForm({
      date: today(),
      market: 'MES',
      direction: 'Long',
      contracts: 1,
      sizeType: 'Micro',
      pnl: 0,
      notes: '',
    });
  };

  const openAddAccount = () => {
    setAccountMode('add');
    setAccountForm({
      ...defaultAccount,
      id: newId(),
      name: '',
      provider: 'Funded Futures Network',
    });
    setAccountDialogOpen(true);
  };

  const openEditAccount = (account: Account) => {
    setAccountMode('edit');
    setAccountForm({ ...account });
    setAccountDialogOpen(true);
  };

  const submitAccount = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (accountMode === 'add') {
      setAccounts((current) => [...current, accountForm]);
      setSelectedAccountId(accountForm.id);
    } else {
      setAccounts((current) =>
        current.map((account) =>
          account.id === accountForm.id ? accountForm : account,
        ),
      );
    }
    setAccountDialogOpen(false);
  };

  const goTo = (nextView: View) => {
    setView(nextView);
    setMobileMenuOpen(false);
  };

  const signalTone =
    signal === 'BUY'
      ? 'text-emerald-300'
      : signal === 'SELL'
        ? 'text-rose-300'
        : signal === 'FLATTEN'
          ? 'text-amber-300'
          : 'text-[#d8d7e7]';
  const signalCopy = signal === 'WAIT' ? 'No active signal' : signalSource;

  return (
    <main className="min-h-screen bg-[#2d2b55] text-white">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/6 bg-[#1e1e3f] px-4 py-5 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-[#f59342] text-sm font-black text-[#1e1e3f] shadow-[0_8px_24px_rgba(245,147,66,.24)]">
            EP
          </span>
          <div>
            <p className="font-semibold tracking-tight">EdgePilot</p>
            <p className="text-xs text-[#828bb7]">Prop trading cockpit</p>
          </div>
        </div>

        <nav className="mt-10 space-y-1" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => goTo(item.id)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${active ? 'bg-[#e1814c] text-white shadow-[0_8px_24px_rgba(225,129,76,.2)]' : 'text-[#828bb7] hover:bg-white/5 hover:text-white'}`}
              >
                <Icon className="size-[18px]" />
                {item.label}
                {active && (
                  <ChevronRight className="ml-auto size-4 opacity-70" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-white/8 bg-white/[.035] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#f8b56f]">
            <ShieldCheck className="size-4" /> Risk first
          </div>
          <p className="mt-3 text-sm leading-6 text-[#b1b0c6]">
            Your account agreement is the final authority. This cockpit tracks
            the rules you enter.
          </p>
        </div>
      </aside>

      <section className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 border-b border-white/7 bg-[#2d2b55]/92 backdrop-blur-xl">
          <div className="flex h-[76px] items-center gap-3 px-4 sm:px-6 xl:px-8">
            <button
              className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5 lg:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm text-[#9392a5]">
                {selectedAccount.fundingPath}
              </p>
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {navItems.find((item) => item.id === view)?.label}
              </h1>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-2 rounded-xl border border-white/8 bg-white/[.035] px-3 py-2 text-sm md:flex">
                <span
                  className={`size-2 rounded-full ${session.tone === 'open' ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : session.tone === 'pause' ? 'bg-amber-400' : 'bg-slate-400'}`}
                />
                <span>{session.label}</span>
                <span className="text-[#9392a5]">{session.time}</span>
              </div>
              <Select
                value={selectedAccountId}
                onValueChange={(value) => setSelectedAccountId(String(value))}
              >
                <SelectTrigger className="h-10 max-w-[190px] border-white/10 bg-[#373565] px-3 text-white hover:bg-[#3d3b70]">
                  <span className="truncate">{selectedAccount.name}</span>
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#242348] text-white">
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => setTradeDialogOpen(true)}
                className="h-10 bg-[#f59342] px-3 text-[#211f42] hover:bg-[#ffad65] sm:px-4"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Log trade</span>
              </Button>
            </div>
          </div>
          {mobileMenuOpen && (
            <nav className="grid grid-cols-2 gap-2 border-t border-white/7 bg-[#1e1e3f] p-3 lg:hidden">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => goTo(item.id)}
                  className={`rounded-xl px-3 py-2.5 text-left text-sm ${view === item.id ? 'bg-[#e1814c] text-white' : 'text-[#a2a5c6]'}`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}
        </header>

        <div className="mx-auto max-w-[1540px] p-4 sm:p-6 xl:p-8">
          {view === 'overview' && (
            <div className="space-y-5">
              <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.72fr)]">
                <article className="relative overflow-hidden rounded-3xl border border-white/9 bg-[#39376b] p-5 shadow-[0_28px_80px_rgba(12,10,35,.24)] sm:p-6">
                  <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[#f59342]/10 blur-3xl" />
                  <div className="relative flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-sm text-[#b7b6cb]">
                        <WalletCards className="size-4 text-[#f8a75c]" />{' '}
                        Current balance
                      </div>
                      <div className="mt-2 flex items-baseline gap-3">
                        <span className="text-4xl font-semibold tracking-[-.04em] sm:text-5xl">
                          {fmt.format(stats.balance)}
                        </span>
                        <span
                          className={`flex items-center gap-1 text-sm font-semibold ${stats.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
                        >
                          {stats.profit >= 0 ? (
                            <ArrowUpRight className="size-4" />
                          ) : (
                            <ArrowDownRight className="size-4" />
                          )}
                          {fmt.format(Math.abs(stats.profit))}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-[#2b294f]/70 px-4 py-3 text-right">
                      <p className="text-xs uppercase tracking-[.12em] text-[#9392a5]">
                        Target
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {fmt.format(selectedAccount.profitTarget)}
                      </p>
                    </div>
                  </div>
                  <div className="relative mt-5">
                    <Sparkline values={stats.curve} />
                  </div>
                  <div className="relative mt-2 flex items-center gap-4">
                    <Progress
                      value={stats.progress}
                      className="flex-1 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-white/8 [&_[data-slot=progress-indicator]]:bg-[#f59342]"
                    />
                    <span className="text-sm font-semibold tabular-nums text-[#f8b56f]">
                      {stats.progress.toFixed(1)}%
                    </span>
                  </div>
                  <div className="relative mt-3 flex flex-wrap justify-between gap-2 text-xs text-[#9392a5]">
                    <span>
                      {fmt.format(
                        Math.max(
                          0,
                          selectedAccount.profitTarget - stats.profit,
                        ),
                      )}{' '}
                      remaining
                    </span>
                    <span>
                      {stats.trades
                        ? `${stats.trades} closed trade${stats.trades === 1 ? '' : 's'}`
                        : 'Log a trade to begin your curve'}
                    </span>
                  </div>
                </article>

                <article className="rounded-3xl border border-white/9 bg-[#201f44] p-5 shadow-[0_28px_80px_rgba(12,10,35,.24)] sm:p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Bot className="size-5 text-[#f59342]" /> Signal desk
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#9392a5]">
                      <Switch
                        checked={soundEnabled}
                        onCheckedChange={setSoundEnabled}
                        className="data-checked:bg-[#f59342]"
                        aria-label="Signal sounds"
                      />
                      {soundEnabled ? (
                        <Volume2 className="size-4" />
                      ) : (
                        <VolumeX className="size-4" />
                      )}
                    </div>
                  </div>
                  <div className="my-7 text-center">
                    <div className="relative mx-auto grid size-28 place-items-center rounded-full border border-white/10 bg-[#2d2b55] shadow-[0_0_0_12px_rgba(255,255,255,.02)]">
                      <span
                        className={`absolute inset-3 rounded-full border border-current opacity-20 ${signalTone}`}
                      />
                      <Radio
                        className={`absolute size-14 opacity-15 ${signalTone}`}
                      />
                      <span
                        className={`relative text-xl font-black tracking-[.12em] ${signalTone}`}
                      >
                        {signal}
                      </span>
                    </div>
                    <p className="mt-5 font-medium">{signalCopy}</p>
                    <p className="mt-1 text-sm text-[#9392a5]">
                      {signalSource.startsWith('Browser monitor')
                        ? 'Triggered by your authorized local tab monitor.'
                        : 'Alerts below test the sound and interface only.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['BUY', 'SELL', 'FLATTEN'] as Signal[]).map((item) => (
                      <button
                        key={item}
                        onClick={() => previewSignal(item)}
                        className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition ${item === 'BUY' ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300 hover:bg-emerald-400/15' : item === 'SELL' ? 'border-rose-400/20 bg-rose-400/8 text-rose-300 hover:bg-rose-400/15' : 'border-amber-400/20 bg-amber-400/8 text-amber-300 hover:bg-amber-400/15'}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setView('monitor')}
                    className="mt-4 w-full rounded-xl bg-white/[.035] px-3 py-2 text-left text-xs leading-5 text-[#a8a7bc] transition hover:bg-white/7 hover:text-white"
                  >
                    Connect the Browser Monitor to authorize TradingView and
                    Nexus tabs →
                  </button>
                </article>
              </section>

              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  label="Drawdown buffer"
                  value={fmt.format(stats.drawdownBuffer)}
                  detail={`Projected EOD floor ${fmt.format(stats.projectedFloor)}`}
                  icon={ShieldCheck}
                  tone={
                    stats.drawdownBuffer < selectedAccount.drawdownAmount * 0.3
                      ? 'warn'
                      : 'good'
                  }
                />
                <StatCard
                  label="Daily loss room"
                  value={fmt.format(stats.dailyLossRemaining)}
                  detail={`${fmt.format(selectedAccount.dailyLossLimit)} limit · closed P&L projection`}
                  icon={ShieldCheck}
                  tone={
                    stats.dailyLossRemaining <
                    selectedAccount.dailyLossLimit * 0.3
                      ? 'warn'
                      : 'good'
                  }
                />
                <StatCard
                  label="$100+ qualifying days"
                  value={`${stats.qualifyingDays} / ${selectedAccount.minTradingDays}`}
                  detail={`${stats.tradingDays} trading day${stats.tradingDays === 1 ? '' : 's'} logged`}
                  icon={ListChecks}
                  tone={
                    stats.qualifyingDays >= selectedAccount.minTradingDays
                      ? 'good'
                      : 'neutral'
                  }
                />
                <StatCard
                  label="Consistency"
                  value={`${stats.consistency.toFixed(1)}%`}
                  detail={`${selectedAccount.consistencyLimit}% limit · best day ${fmt.format(stats.largestDay)}`}
                  icon={Gauge}
                  tone={
                    stats.consistency > selectedAccount.consistencyLimit
                      ? 'warn'
                      : 'good'
                  }
                />
                <StatCard
                  label="Today’s closed P&L"
                  value={fmt.format(stats.todaysPnl)}
                  detail={`${stats.winRate.toFixed(0)}% win rate across ${stats.trades} trades`}
                  icon={TrendingUp}
                  tone={stats.todaysPnl >= 0 ? 'good' : 'warn'}
                />
                <StatCard
                  label="Current contract cap"
                  value={`${stats.contractCapMinis} mini${stats.contractCapMinis === 1 ? '' : 's'}`}
                  detail={`or ${stats.contractCapMicros} micros · ${selectedAccount.stage}`}
                  icon={Activity}
                />
              </section>

              <section className="grid gap-5 xl:grid-cols-[1fr_1.05fr]">
                <article className="rounded-3xl border border-white/8 bg-[#373565] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#f8b56f]">
                        Pass plan
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        Evaluation guardrails
                      </h2>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${stats.passReady ? 'border-emerald-300/20 bg-emerald-300/8 text-emerald-300' : 'border-amber-300/20 bg-amber-300/8 text-amber-200'}`}
                    >
                      {stats.passReady ? 'Ready to pass' : 'In progress'}
                    </span>
                  </div>
                  <div className="mt-6 space-y-5">
                    {[
                      {
                        label: 'Reach profit target',
                        value: `${stats.progress.toFixed(1)}%`,
                        width: stats.progress,
                        note: `${fmt.format(stats.profit)} of ${fmt.format(selectedAccount.profitTarget)}`,
                      },
                      {
                        label: `Complete ${selectedAccount.minTradingDays} qualifying days`,
                        value: `${stats.qualifyingDays} / ${selectedAccount.minTradingDays}`,
                        width: stats.dayProgress,
                        note: `${fmt.format(selectedAccount.qualifyingDayMinimum)}+ closed profit on each counted day`,
                      },
                      {
                        label: 'Stay inside drawdown',
                        value: fmt.format(stats.drawdownBuffer),
                        width: clamp(
                          (stats.drawdownBuffer /
                            selectedAccount.drawdownAmount) *
                            100,
                        ),
                        note: `${selectedAccount.drawdownModel} · journal projection`,
                      },
                      {
                        label: 'Keep best day below consistency',
                        value: `${stats.consistency.toFixed(1)}%`,
                        width: clamp(
                          (stats.consistency /
                            selectedAccount.consistencyLimit) *
                            100,
                        ),
                        note: `${selectedAccount.consistencyLimit}% maximum`,
                      },
                    ].map((row) => (
                      <div key={row.label}>
                        <div className="flex items-end justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium">{row.label}</p>
                            <p className="mt-1 text-xs text-[#9392a5]">
                              {row.note}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-[#f8b56f]">
                            {row.value}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/7">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#e1814c] to-[#f6ae67]"
                            style={{ width: `${row.width}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-3xl border border-white/8 bg-[#373565] p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#f8b56f]">
                        {selectedAccount.name}
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        Today’s rule card
                      </h2>
                    </div>
                    <span className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold text-[#b7b6cb]">
                      {selectedAccount.stage}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[
                      [
                        'Daily loss limit',
                        fmt.format(selectedAccount.dailyLossLimit),
                      ],
                      [
                        'Qualifying day',
                        `${fmt.format(selectedAccount.qualifyingDayMinimum)}+`,
                      ],
                      ['Reset fee', fmt.format(selectedAccount.resetFee)],
                      [
                        'Connection',
                        `${selectedAccount.dataFeed} · ${selectedAccount.platform}`,
                      ],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-white/7 bg-[#2d2b55]/65 p-3.5"
                      >
                        <p className="text-xs text-[#9392a5]">{label}</p>
                        <p className="mt-2 text-sm font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#9392a5]">
                    <Clock3 className="mt-0.5 size-4 shrink-0 text-[#f8b56f]" />{' '}
                    Stop before the limit, not at it. This card uses closed
                    journal P&amp;L; Nexus/Onyx equity and your signed agreement
                    remain authoritative for intraday and unrealized loss.
                  </p>
                </article>
              </section>

              <section className="rounded-3xl border border-white/8 bg-[#201f44] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#f8b56f]">
                      After you pass
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">
                      Funded payout and scaling map
                    </h2>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#b7b6cb]">
                    Same-day payouts · {selectedAccount.profitShare} split
                  </span>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {getFundedScalingBands(selectedAccount).map((band) => (
                    <div
                      key={band.range}
                      className="rounded-2xl border border-white/7 bg-[#2d2b55]/70 p-4"
                    >
                      <p className="font-semibold">
                        {band.minis} mini{band.minis === 1 ? '' : 's'} /{' '}
                        {band.micros} micros
                      </p>
                      <p className="mt-1 text-xs text-[#9392a5]">
                        {band.range}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <p className="rounded-xl bg-white/[.035] p-3">
                    <span className="text-[#9392a5]">Minimum payout</span>
                    <br />
                    <strong>{fmt.format(selectedAccount.minimumPayout)}</strong>
                  </p>
                  <p className="rounded-xl bg-white/[.035] p-3">
                    <span className="text-[#9392a5]">Payouts 1–3 cap</span>
                    <br />
                    <strong>{fmt.format(selectedAccount.maxPayout)}</strong>
                  </p>
                  <p className="rounded-xl bg-white/[.035] p-3">
                    <span className="text-[#9392a5]">Payout 4+ cap</span>
                    <br />
                    <strong>
                      {fmt.format(selectedAccount.maxPayoutLater)}
                    </strong>
                  </p>
                  <p className="rounded-xl bg-white/[.035] p-3">
                    <span className="text-[#9392a5]">Funded drawdown lock</span>
                    <br />
                    <strong>{fmt.format(selectedAccount.drawdownLock)}</strong>
                  </p>
                </div>
                <p className="mt-4 text-xs leading-5 text-[#9392a5]">
                  Promotion review follows 4 payouts on one account or 10 since
                  the last review; all Sim Funded accounts close on review. The
                  one-time funded reset before any payout is{' '}
                  {fmt.format(selectedAccount.fundedResetFee)}.
                </p>
              </section>
            </div>
          )}

          {view === 'journal' && (
            <div className="space-y-5">
              <section className="flex flex-col justify-between gap-4 rounded-3xl border border-white/8 bg-[#373565] p-5 sm:flex-row sm:items-center sm:p-6">
                <div>
                  <p className="text-sm text-[#f8b56f]">Closed-trade journal</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    Every entry updates your cockpit instantly.
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#aaa9be]">
                    Enter the net P&L shown in Nexus, including fees if
                    possible. Open positions are not included in the risk
                    projection.
                  </p>
                </div>
                <Button
                  onClick={() => setTradeDialogOpen(true)}
                  className="h-10 bg-[#f59342] text-[#211f42] hover:bg-[#ffad65]"
                >
                  <Plus /> Log closed trade
                </Button>
              </section>
              {quickTrades.filter(
                (trade) => trade.accountId === selectedAccount.id,
              ).length > 0 && (
                <section className="overflow-hidden rounded-3xl border border-[#e1814c]/25 bg-[#373565]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
                    <div>
                      <p className="text-sm font-semibold">
                        Nexus quick captures
                      </p>
                      <p className="mt-1 text-xs text-[#9392a5]">
                        Logged by the extension at order time. These do not
                        affect P&amp;L statistics.
                      </p>
                    </div>
                    <span className="rounded-full bg-[#e1814c]/12 px-3 py-1 text-xs font-semibold text-[#f8b56f]">
                      {
                        quickTrades.filter(
                          (trade) => trade.accountId === selectedAccount.id,
                        ).length
                      }{' '}
                      captured
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="bg-[#302e5b] text-xs uppercase tracking-[.1em] text-[#9392a5]">
                        <tr>
                          <th className="px-5 py-3">Time</th>
                          <th className="px-5 py-3">Market</th>
                          <th className="px-5 py-3">Action</th>
                          <th className="px-5 py-3">Amount</th>
                          <th className="px-5 py-3">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6">
                        {quickTrades
                          .filter(
                            (trade) => trade.accountId === selectedAccount.id,
                          )
                          .map((trade) => (
                            <tr key={trade.id}>
                              <td className="px-5 py-4 text-[#b7b6cb]">
                                {new Intl.DateTimeFormat('en-US', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                }).format(new Date(trade.timestamp))}
                              </td>
                              <td className="px-5 py-4 font-semibold">
                                {trade.market}
                              </td>
                              <td className="px-5 py-4">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${trade.side === 'BUY' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}
                                >
                                  {trade.side}
                                </span>
                              </td>
                              <td className="px-5 py-4">{trade.amount}</td>
                              <td className="px-5 py-4 text-[#9392a5]">
                                FFN Nexus
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <section className="overflow-hidden rounded-3xl border border-white/8 bg-[#373565]">
                {accountTrades.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="border-b border-white/8 bg-[#302e5b] text-xs uppercase tracking-[.1em] text-[#9392a5]">
                        <tr>
                          <th className="px-5 py-4">Date</th>
                          <th className="px-5 py-4">Market</th>
                          <th className="px-5 py-4">Side</th>
                          <th className="px-5 py-4">Size</th>
                          <th className="px-5 py-4">Net P&L</th>
                          <th className="px-5 py-4">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/6">
                        {[...accountTrades]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((trade) => (
                            <tr
                              key={trade.id}
                              className="hover:bg-white/[.025]"
                            >
                              <td className="px-5 py-4 text-[#b7b6cb]">
                                {trade.date}
                              </td>
                              <td className="px-5 py-4 font-semibold">
                                {trade.market}
                              </td>
                              <td className="px-5 py-4">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${trade.direction === 'Long' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'}`}
                                >
                                  {trade.direction}
                                </span>
                              </td>
                              <td className="px-5 py-4">
                                {trade.contracts} {trade.sizeType.toLowerCase()}
                                {trade.contracts === 1 ? '' : 's'}
                              </td>
                              <td
                                className={`px-5 py-4 font-semibold ${trade.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}
                              >
                                {trade.pnl >= 0 ? '+' : ''}
                                {fmt.format(trade.pnl)}
                              </td>
                              <td className="max-w-[260px] truncate px-5 py-4 text-[#9392a5]">
                                {trade.notes || '—'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid min-h-[360px] place-items-center p-8 text-center">
                    <div>
                      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/6 text-[#f8b56f]">
                        <ListChecks />
                      </span>
                      <h3 className="mt-4 text-lg font-semibold">
                        No trades logged yet
                      </h3>
                      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#9392a5]">
                        After you close a trade in FFN, log its net result here
                        to update balance, drawdown, consistency, and win rate.
                      </p>
                      <Button
                        onClick={() => setTradeDialogOpen(true)}
                        className="mt-5 bg-[#f59342] text-[#211f42] hover:bg-[#ffad65]"
                      >
                        <Plus /> Log first trade
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {view === 'markets' && (
            <div className="space-y-5">
              <section className="rounded-3xl border border-white/8 bg-[#373565] p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-[#f8b56f]">Futures watchlist</p>
                    <h2 className="mt-1 text-2xl font-semibold">
                      Markets you can trade
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[#aaa9be]">
                      Use this symbol list as a planning aid. Confirm every
                      contract, session, and market-data entitlement in Nexus
                      Connect, Onyx, and your current FFN agreement before
                      entry.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-[#2d2b55] px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <span
                        className={`size-2 rounded-full ${session.tone === 'open' ? 'bg-emerald-400' : 'bg-slate-400'}`}
                      />
                      {session.label}
                    </p>
                    <p className="mt-1 text-xs text-[#9392a5]">
                      {session.time}
                    </p>
                  </div>
                </div>
              </section>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {markets.map((market, index) => (
                  <article
                    key={market.category}
                    className="group rounded-3xl border border-white/8 bg-[#373565] p-5 transition hover:-translate-y-0.5 hover:border-[#e1814c]/35"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-xl bg-[#2d2b55] text-[#f8b56f]">
                        <BarChart3 className="size-5" />
                      </span>
                      <span className="text-xs font-medium text-[#9392a5]">
                        0{index + 1}
                      </span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">
                      {market.category}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[#b5b4c8]">
                      {market.symbols}
                    </p>
                  </article>
                ))}
                <article className="rounded-3xl border border-dashed border-[#e1814c]/35 bg-[#e1814c]/6 p-5">
                  <Sparkles className="size-5 text-[#f8b56f]" />
                  <h3 className="mt-5 text-lg font-semibold">
                    Micro-first sizing
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#b5b4c8]">
                    Your {fmt.format(selectedAccount.startingBalance)} plan
                    allows up to {selectedAccount.maxMicros} micros. Micros can
                    make it easier to size exposure precisely while protecting
                    the {fmt.format(selectedAccount.drawdownAmount)} drawdown
                    buffer.
                  </p>
                </article>
              </section>
            </div>
          )}

          {view === 'news' && (
            <MarketNews
              feed={newsFeed}
              extensionConnected={extensionConnected}
              syncing={newsSyncing}
              syncError={newsSyncError}
              onSync={syncMarketNews}
            />
          )}

          {view === 'monitor' && (
            <BrowserMonitor
              accountName={selectedAccount.name}
              drawdownBuffer={stats.drawdownBuffer}
              dailyLossRemaining={stats.dailyLossRemaining}
              consistency={stats.consistency}
              consistencyLimit={selectedAccount.consistencyLimit}
              onSignal={handleMonitorSignal}
            />
          )}

          {view === 'settings' && (
            <div className="space-y-5">
              <section className="flex flex-col justify-between gap-4 rounded-3xl border border-white/8 bg-[#373565] p-5 sm:flex-row sm:items-center sm:p-6">
                <div>
                  <p className="text-sm text-[#f8b56f]">
                    Manual account management
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    Keep every prop account in one cockpit.
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#aaa9be]">
                    Enter the requirements exactly as shown in your FFN account
                    agreement or Nexus dashboard.
                  </p>
                </div>
                <Button
                  onClick={openAddAccount}
                  className="h-10 bg-[#f59342] text-[#211f42] hover:bg-[#ffad65]"
                >
                  <Plus /> Add account
                </Button>
              </section>
              <section className="grid gap-4 xl:grid-cols-2">
                {accounts.map((account) => {
                  const accountStats = buildStats(
                    account,
                    trades.filter((trade) => trade.accountId === account.id),
                  );
                  return (
                    <article
                      key={account.id}
                      className={`rounded-3xl border p-5 sm:p-6 ${account.id === selectedAccountId ? 'border-[#e1814c]/55 bg-[#3a3769]' : 'border-white/8 bg-[#373565]'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold">
                              {account.name}
                            </h3>
                            {account.id === selectedAccountId && (
                              <span className="rounded-full bg-[#e1814c]/15 px-2 py-1 text-[11px] font-semibold text-[#f8b56f]">
                                Selected
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-[#9392a5]">
                            {account.provider} · {account.fundingPath}
                          </p>
                        </div>
                        <button
                          onClick={() => openEditAccount(account)}
                          className="rounded-xl border border-white/10 px-3 py-2 text-sm text-[#c5c4d4] hover:bg-white/5"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                        <div>
                          <p className="text-[#9392a5]">Balance</p>
                          <p className="mt-1 font-semibold">
                            {fmt.format(accountStats.balance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#9392a5]">Profit target</p>
                          <p className="mt-1 font-semibold">
                            {fmt.format(account.profitTarget)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#9392a5]">Drawdown</p>
                          <p className="mt-1 font-semibold">
                            {fmt.format(account.drawdownAmount)} ·{' '}
                            {account.drawdownModel}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#9392a5]">Consistency</p>
                          <p className="mt-1 font-semibold">
                            {account.consistencyLimit}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[#9392a5]">Daily loss limit</p>
                          <p className="mt-1 font-semibold">
                            {fmt.format(account.dailyLossLimit)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[#9392a5]">Qualifying days</p>
                          <p className="mt-1 font-semibold">
                            {accountStats.qualifyingDays} /{' '}
                            {account.minTradingDays} at{' '}
                            {fmt.format(account.qualifyingDayMinimum)}+
                          </p>
                        </div>
                        <div>
                          <p className="text-[#9392a5]">Position cap</p>
                          <p className="mt-1 font-semibold">
                            {account.maxMinis} minis / {account.maxMicros}{' '}
                            micros
                          </p>
                        </div>
                        <div>
                          <p className="text-[#9392a5]">Payout</p>
                          <p className="mt-1 font-semibold">
                            {account.payoutSchedule} · {account.profitShare}
                          </p>
                        </div>
                      </div>
                      {account.id !== selectedAccountId && (
                        <Button
                          variant="outline"
                          onClick={() => setSelectedAccountId(account.id)}
                          className="mt-6 w-full border-white/10 bg-transparent text-white hover:bg-white/6"
                        >
                          Switch to this account
                        </Button>
                      )}
                    </article>
                  );
                })}
              </section>
            </div>
          )}
        </div>
      </section>

      <Dialog open={tradeDialogOpen} onOpenChange={setTradeDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#242348] p-5 text-white sm:max-w-lg sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl">Log a closed trade</DialogTitle>
            <DialogDescription className="text-[#aaa9be]">
              Use the net result from your platform. Statistics update as soon
              as you save.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitTrade} className="mt-2 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="trade-date">Close date</Label>
                <Input
                  id="trade-date"
                  type="date"
                  required
                  value={tradeForm.date}
                  onChange={(e) =>
                    setTradeForm({ ...tradeForm, date: e.target.value })
                  }
                  className="h-10 border-white/10 bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trade-market">Market symbol</Label>
                <Input
                  id="trade-market"
                  required
                  value={tradeForm.market}
                  onChange={(e) =>
                    setTradeForm({ ...tradeForm, market: e.target.value })
                  }
                  className="h-10 border-white/10 bg-white/5 uppercase"
                  placeholder="MES"
                />
              </div>
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select
                  value={tradeForm.direction}
                  onValueChange={(value) =>
                    setTradeForm({
                      ...tradeForm,
                      direction: value as 'Long' | 'Short',
                    })
                  }
                >
                  <SelectTrigger className="h-10 w-full border-white/10 bg-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#242348] text-white">
                    <SelectItem value="Long">Long</SelectItem>
                    <SelectItem value="Short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contract type</Label>
                <Select
                  value={tradeForm.sizeType}
                  onValueChange={(value) =>
                    setTradeForm({
                      ...tradeForm,
                      sizeType: value as 'Mini' | 'Micro',
                    })
                  }
                >
                  <SelectTrigger className="h-10 w-full border-white/10 bg-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#242348] text-white">
                    <SelectItem value="Micro">Micro</SelectItem>
                    <SelectItem value="Mini">Mini</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="trade-contracts">Contracts</Label>
                <Input
                  id="trade-contracts"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={tradeForm.contracts}
                  onChange={(e) =>
                    setTradeForm({
                      ...tradeForm,
                      contracts: Number(e.target.value),
                    })
                  }
                  className="h-10 border-white/10 bg-white/5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trade-pnl">Net P&L ($)</Label>
                <Input
                  id="trade-pnl"
                  type="number"
                  step="0.01"
                  required
                  value={tradeForm.pnl}
                  onChange={(e) =>
                    setTradeForm({ ...tradeForm, pnl: Number(e.target.value) })
                  }
                  className="h-10 border-white/10 bg-white/5"
                />
              </div>
            </div>
            {tradeForm.contracts >
              (tradeForm.sizeType === 'Mini'
                ? stats.contractCapMinis
                : stats.contractCapMicros) && (
              <p className="rounded-xl border border-rose-400/20 bg-rose-400/8 px-3 py-2 text-sm text-rose-200">
                This exceeds the saved {tradeForm.sizeType.toLowerCase()}{' '}
                position limit for {selectedAccount.name} at its current stage.
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="trade-notes">Notes</Label>
              <textarea
                id="trade-notes"
                value={tradeForm.notes}
                onChange={(e) =>
                  setTradeForm({ ...tradeForm, notes: e.target.value })
                }
                className="min-h-24 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-[#77758e] focus:border-[#f59342]"
                placeholder="Setup, execution, lesson…"
              />
            </div>
            <DialogFooter className="-mx-5 -mb-5 border-white/8 bg-[#1e1e3f]/65 sm:-mx-6 sm:-mb-6">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setTradeDialogOpen(false)}
                className="text-[#b7b6cb] hover:bg-white/6 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#f59342] text-[#211f42] hover:bg-[#ffad65]"
              >
                Save trade
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-[#242348] p-5 text-white sm:max-w-2xl sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {accountMode === 'add'
                ? 'Add prop account'
                : 'Edit account rules'}
            </DialogTitle>
            <DialogDescription className="text-[#aaa9be]">
              Copy each value from the firm’s current account agreement.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAccount} className="mt-2 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['Account name', 'name', 'FFN Standard MAX 50K', 'text'],
                ['Provider', 'provider', 'Funded Futures Network', 'text'],
                ['Starting balance', 'startingBalance', '50000', 'number'],
                [
                  'Funding path',
                  'fundingPath',
                  'MAX Standard · 5 days to pass',
                  'text',
                ],
                ['Drawdown amount', 'drawdownAmount', '2000', 'number'],
                ['Drawdown model', 'drawdownModel', 'EOD (End of Day)', 'text'],
                ['Profit target', 'profitTarget', '3000', 'number'],
                ['Daily loss limit', 'dailyLossLimit', '1250', 'number'],
                ['Minimum trading days', 'minTradingDays', '5', 'number'],
                [
                  'Qualifying day minimum',
                  'qualifyingDayMinimum',
                  '150',
                  'number',
                ],
                ['Consistency limit %', 'consistencyLimit', '40', 'number'],
                ['Max minis', 'maxMinis', '4', 'number'],
                ['Max micros', 'maxMicros', '40', 'number'],
                ['Profit share', 'profitShare', '80%', 'text'],
                ['Payout schedule', 'payoutSchedule', 'Same day', 'text'],
                ['Payout cap (1–3)', 'maxPayout', '1500', 'number'],
                ['Payout cap (4+)', 'maxPayoutLater', '2000', 'number'],
                ['Minimum payout', 'minimumPayout', '500', 'number'],
                ['Drawdown lock balance', 'drawdownLock', '50000', 'number'],
                ['Funded buffer', 'buffer', '2000', 'number'],
                ['Evaluation reset fee', 'resetFee', '100', 'number'],
                ['Funded reset fee', 'fundedResetFee', '625', 'number'],
                ['Data feed', 'dataFeed', 'Nexus Connect', 'text'],
                ['Trading platform', 'platform', 'Onyx', 'text'],
              ].map(([label, key, placeholder, type]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`account-${key}`}>{label}</Label>
                  <Input
                    id={`account-${key}`}
                    type={type}
                    required
                    value={String(accountForm[key as keyof Account])}
                    placeholder={placeholder}
                    onChange={(e) =>
                      setAccountForm({
                        ...accountForm,
                        [key]:
                          type === 'number'
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                    className="h-10 border-white/10 bg-white/5"
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Account stage</Label>
              <Select
                value={accountForm.stage}
                onValueChange={(value) =>
                  setAccountForm({
                    ...accountForm,
                    stage: value as Account['stage'],
                  })
                }
              >
                <SelectTrigger className="h-10 w-full border-white/10 bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#242348] text-white">
                  <SelectItem value="Evaluation">Evaluation</SelectItem>
                  <SelectItem value="Funded">Funded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[.035] p-4">
              <div>
                <p className="text-sm font-medium">Weekend holds</p>
                <p className="mt-1 text-xs text-[#9392a5]">
                  Enable only if this account includes the required add-on.
                </p>
              </div>
              <Switch
                checked={accountForm.weekendHolds}
                onCheckedChange={(checked) =>
                  setAccountForm({ ...accountForm, weekendHolds: checked })
                }
                className="data-checked:bg-[#f59342]"
              />
            </div>
            <DialogFooter className="-mx-5 -mb-5 border-white/8 bg-[#1e1e3f]/65 sm:-mx-6 sm:-mb-6">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAccountDialogOpen(false)}
                className="text-[#b7b6cb] hover:bg-white/6 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#f59342] text-[#211f42] hover:bg-[#ffad65]"
              >
                {accountMode === 'add' ? 'Add account' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <footer className="border-t border-white/6 bg-[#232247] px-5 py-4 text-center text-xs leading-5 text-[#9392a5] lg:ml-[248px]">
        EdgePilot is a planning and journaling tool, not financial advice or a
        broker. Signals shown without a verified live data connection are
        practice alerts only. FFN’s Nexus dashboard and your signed agreement
        control.
      </footer>
    </main>
  );
}
