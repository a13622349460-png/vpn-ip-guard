export type RiskStatus = "green" | "yellow" | "red";

export interface BaselineEndpoint {
  ip: string;
  country: string;
  asn: string | null;
  isp: string | null;
  org: string | null;
  createdAt: number;
}

export interface AppConfig {
  alwaysOnTop: boolean;
  baseline: BaselineEndpoint | null;
}

export interface ProbeResult {
  timestamp: number;
  ok: boolean;
  ip: string | null;
  countryCode: string | null;
  asn?: string | null;
  isp?: string | null;
  org?: string | null;
  latencyMs: number | null;
  error: string | null;
  timedOut: boolean;
}

export interface RiskSubScores {
  ipStability: number;
  regionConsistency: number;
  networkQuality: number;
  serviceConnectivity: number;
}

export interface RiskMetrics {
  rawStatus: RiskStatus;
  status: RiskStatus;
  score: number;
  reasons: string[];
  warningReasons: string[];
  normalReasons: string[];
  statusMessage: string;
  isReevaluating: boolean;
  reevaluationSamplesRemaining: number;
  resetHint: string | null;
  baseline: BaselineEndpoint | null;
  countryChangedFromBaseline: boolean;
  ipStableMs: number | null;
  ipChanges5m: number;
  asnChanges5m: number;
  averageLatencyMs: number | null;
  failureRate10: number;
  consecutiveTimeouts: number;
  subScores: RiskSubScores;
  stableStreak: number;
  minorAnomalyStreak: number;
  severeAnomalyStreak: number;
}

export interface MonitorSnapshot {
  config: AppConfig;
  history: ProbeResult[];
  current: ProbeResult | null;
  metrics: RiskMetrics;
  nextCheckAt: number | null;
}

export interface IpGuardApi {
  getSnapshot: () => Promise<MonitorSnapshot>;
  runCheckNow: () => Promise<MonitorSnapshot>;
  resetAndCheckNow: () => Promise<MonitorSnapshot>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<MonitorSnapshot>;
  hideToTray: () => Promise<void>;
  onSnapshot: (callback: (snapshot: MonitorSnapshot) => void) => () => void;
}

declare global {
  interface Window {
    ipGuard?: IpGuardApi;
  }
}
