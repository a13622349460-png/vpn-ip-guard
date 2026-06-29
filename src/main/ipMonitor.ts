import { EventEmitter } from "node:events";
import { evaluateRisk, createRiskMemory, trimHistory, type RiskMemory } from "../shared/risk.js";
import type { AppConfig, BaselineEndpoint, MonitorSnapshot, ProbeResult } from "../shared/types.js";

const CHECK_INTERVAL_MS = 20 * 1000;
const REQUEST_TIMEOUT_MS = 8 * 1000;

type ConfigProvider = () => AppConfig;
type ConfigUpdater = (patch: Partial<AppConfig>) => AppConfig;

export class IpMonitor extends EventEmitter {
  private history: ProbeResult[] = [];
  private timer: NodeJS.Timeout | null = null;
  private nextCheckAt: number | null = null;
  private memory: RiskMemory = createRiskMemory();
  private reevaluationSamplesRemaining = 0;
  private resetHint: string | null = null;
  private snapshotCache: MonitorSnapshot;

  constructor(
    private readonly getConfig: ConfigProvider,
    private readonly updateConfig: ConfigUpdater
  ) {
    super();
    const config = this.getConfig();
    const { metrics } = evaluateRisk([], config, this.memory);
    this.snapshotCache = {
      config,
      history: [],
      current: null,
      metrics,
      nextCheckAt: null
    };
  }

  start(): void {
    this.schedule(400);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getSnapshot(): MonitorSnapshot {
    return this.snapshotCache;
  }

  async checkNow(): Promise<MonitorSnapshot> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const result = await probePublicIp();
    const baselineBeforeCheck = this.getConfig().baseline;

    if (!baselineBeforeCheck && result.ok) {
      this.updateConfig({ baseline: createBaseline(result) });
      this.resetHint = null;
    } else {
      this.resetHint = getEndpointChangeHint(baselineBeforeCheck, result);
    }

    this.history = trimHistory([...this.history, result]);
    if (this.reevaluationSamplesRemaining > 0) {
      this.reevaluationSamplesRemaining -= 1;
    }
    this.recalculate();
    this.schedule(CHECK_INTERVAL_MS);
    return this.snapshotCache;
  }

  async resetAndCheckNow(): Promise<MonitorSnapshot> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.history = [];
    this.memory = createRiskMemory();
    this.updateConfig({ baseline: null });
    this.resetHint = null;
    this.reevaluationSamplesRemaining = 3;
    this.recalculate();
    return this.checkNow();
  }

  recalculate(): MonitorSnapshot {
    const config = this.getConfig();
    const evaluated = evaluateRisk(this.history, config, this.memory);
    this.memory = evaluated.memory;
    const metrics = this.applyMonitorState(evaluated.metrics);
    this.snapshotCache = {
      config,
      history: this.history,
      current: this.history.at(-1) ?? null,
      metrics,
      nextCheckAt: this.nextCheckAt
    };
    this.emit("snapshot", this.snapshotCache);
    return this.snapshotCache;
  }

  private schedule(delayMs: number): void {
    this.nextCheckAt = Date.now() + delayMs;
    this.recalculate();
    this.timer = setTimeout(() => {
      void this.checkNow();
    }, delayMs);
  }

  private applyMonitorState(metrics: MonitorSnapshot["metrics"]): MonitorSnapshot["metrics"] {
    let next = {
      ...metrics,
      resetHint: this.resetHint
    };

    if (this.reevaluationSamplesRemaining > 0) {
      const warningReasons = [
        `正在重新评估，等待 ${this.reevaluationSamplesRemaining} 次检测后给出稳定状态`,
        ...next.warningReasons
      ];
      next = {
        ...next,
        status: next.rawStatus === "red" ? "red" : "yellow",
        statusMessage: "正在重新评估当前 VPN 出口",
        warningReasons,
        reasons: [...warningReasons, ...next.normalReasons],
        isReevaluating: true,
        reevaluationSamplesRemaining: this.reevaluationSamplesRemaining
      };
    }

    return next;
  }
}

function createBaseline(result: ProbeResult): BaselineEndpoint {
  if (!result.ok || !result.ip || !result.countryCode) {
    throw new Error("Cannot create baseline from failed probe");
  }

  return {
    ip: result.ip,
    country: result.countryCode.toUpperCase(),
    asn: result.asn ?? null,
    isp: result.isp ?? null,
    org: result.org ?? null,
    createdAt: result.timestamp
  };
}

function getEndpointChangeHint(baseline: BaselineEndpoint | null, current: ProbeResult): string | null {
  if (!baseline || !current.ok) {
    return null;
  }

  if (current.countryCode?.toUpperCase() !== baseline.country) {
    return "检测到出口国家变化。如果这是你主动切换的节点，请点击「重置并检测」。";
  }

  const ipChanged = Boolean(current.ip && current.ip !== baseline.ip);
  const asnChanged = Boolean(baseline.asn && current.asn && current.asn !== baseline.asn);

  if (!ipChanged && !asnChanged) {
    return null;
  }

  return "检测到 VPN 出口已变化，请根据需要点击「重置并检测」重新建立基准。";
}

async function probePublicIp(): Promise<ProbeResult> {
  const startedAt = Date.now();

  try {
    const primary = await queryIpApi();
    const enriched = await enrichNetworkInfo(primary);
    return {
      timestamp: startedAt,
      ok: true,
      ip: enriched.ip,
      countryCode: enriched.countryCode,
      asn: enriched.asn,
      isp: enriched.isp,
      org: enriched.org,
      latencyMs: Date.now() - startedAt,
      error: null,
      timedOut: false
    };
  } catch (error) {
    try {
      const fallback = await queryIpWhoIs();
      return {
        timestamp: startedAt,
        ok: true,
        ip: fallback.ip,
        countryCode: fallback.countryCode,
        asn: fallback.asn,
        isp: fallback.isp,
        org: fallback.org,
        latencyMs: Date.now() - startedAt,
        error: null,
        timedOut: false
      };
    } catch (fallbackError) {
      const timedOut =
        (error instanceof Error && error.name === "AbortError") ||
        (fallbackError instanceof Error && fallbackError.name === "AbortError");
      return failure(
        startedAt,
        Date.now() - startedAt,
        timedOut ? "Request timed out" : getErrorMessage(fallbackError),
        timedOut
      );
    }
  }
}

function failure(timestamp: number, latencyMs: number, error: string, timedOut: boolean): ProbeResult {
  return {
    timestamp,
    ok: false,
    ip: null,
    countryCode: null,
    asn: null,
    isp: null,
    org: null,
    latencyMs,
    error,
    timedOut
  };
}

interface NetworkInfo {
  ip: string;
  countryCode: string;
  asn: string | null;
  isp: string | null;
  org: string | null;
}

interface IpApiResponse {
  ip?: string;
  country_code?: string;
  asn?: string | number;
  org?: string;
  organization?: string;
  isp?: string;
}

interface IpWhoIsResponse {
  success?: boolean;
  ip?: string;
  country_code?: string;
  connection?: {
    asn?: string | number;
    isp?: string;
    org?: string;
  };
}

async function queryIpApi(): Promise<NetworkInfo> {
  const data = await fetchJson<IpApiResponse>("https://ipapi.co/json/");
  return normalizeNetworkInfo({
    ip: data.ip,
    countryCode: data.country_code,
    asn: data.asn,
    isp: data.isp,
    org: data.org ?? data.organization
  });
}

async function queryIpWhoIs(ip?: string): Promise<NetworkInfo> {
  const url = ip ? `https://ipwho.is/${encodeURIComponent(ip)}` : "https://ipwho.is/";
  const data = await fetchJson<IpWhoIsResponse>(url);

  if (data.success === false) {
    throw new Error("Fallback IP lookup failed");
  }

  return normalizeNetworkInfo({
    ip: data.ip,
    countryCode: data.country_code,
    asn: data.connection?.asn,
    isp: data.connection?.isp,
    org: data.connection?.org
  });
}

async function enrichNetworkInfo(info: NetworkInfo): Promise<NetworkInfo> {
  if (info.asn && info.isp && info.org) {
    return info;
  }

  try {
    const fallback = await queryIpWhoIs(info.ip);
    return {
      ip: info.ip,
      countryCode: info.countryCode,
      asn: info.asn ?? fallback.asn,
      isp: info.isp ?? fallback.isp,
      org: info.org ?? fallback.org
    };
  } catch {
    return info;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "user-agent": "vpn-ip-guard/1.1"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeNetworkInfo(input: {
  ip?: string;
  countryCode?: string;
  asn?: string | number | null;
  isp?: string | null;
  org?: string | null;
}): NetworkInfo {
  const ip = normalizeText(input.ip);
  const countryCode = normalizeText(input.countryCode)?.toUpperCase() ?? null;

  if (!ip || !countryCode) {
    throw new Error("Missing IP or country code");
  }

  return {
    ip,
    countryCode,
    asn: normalizeAsn(input.asn),
    isp: normalizeText(input.isp),
    org: normalizeText(input.org)
  };
}

function normalizeAsn(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim().toUpperCase();
  if (!text) {
    return null;
  }

  return text.startsWith("AS") ? text : `AS${text}`;
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown request error";
}
