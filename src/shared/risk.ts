import type { AppConfig, BaselineEndpoint, ProbeResult, RiskMetrics, RiskStatus, RiskSubScores } from "./types.js";

const TEN_MINUTES = 10 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

export interface RiskMemory {
  status: RiskStatus;
  stableStreak: number;
  minorAnomalyStreak: number;
  severeAnomalyStreak: number;
}

export const createRiskMemory = (): RiskMemory => ({
  status: "green",
  stableStreak: 0,
  minorAnomalyStreak: 0,
  severeAnomalyStreak: 0
});

interface WarningBuckets {
  country: string[];
  exit: string[];
  failure: string[];
  latency: string[];
  quality: string[];
}

function createWarningBuckets(): WarningBuckets {
  return {
    country: [],
    exit: [],
    failure: [],
    latency: [],
    quality: []
  };
}

export function trimHistory(history: ProbeResult[], now = Date.now()): ProbeResult[] {
  return history.filter((item) => now - item.timestamp <= TEN_MINUTES);
}

export function evaluateRisk(
  historyInput: ProbeResult[],
  config: AppConfig,
  memory: RiskMemory
): { metrics: RiskMetrics; memory: RiskMemory } {
  const now = Date.now();
  const history = trimHistory(historyInput, now);
  const current = history.at(-1) ?? null;
  const recent10 = history.slice(-10);
  const last5m = history.filter((item) => now - item.timestamp <= FIVE_MINUTES);
  const warnings = createWarningBuckets();
  const normalReasons: string[] = [];
  const baseline = config.baseline;
  let severe = false;
  let minor = false;
  let directRed = false;

  if (!current) {
    normalReasons.push("等待首次检测");
    return {
      metrics: buildMetrics("green", memory.status, warnings, normalReasons, history, memory, config),
      memory
    };
  }

  if (!current.ok) {
    minor = true;
    warnings.failure.push(`当前检测失败：${current.error ?? "未知错误"}`);
  } else {
    normalReasons.push("服务连通性正常");
  }

  if (!baseline) {
    normalReasons.push("等待首次成功检测建立基准出口");
  } else if (current.ok && current.countryCode?.toUpperCase() !== baseline.country) {
    severe = true;
    directRed = true;
    warnings.country.push("检测到出口国家变化。如果这是你主动切换的节点，请点击「重置并检测」。");
  } else if (current.ok) {
    normalReasons.push("当前国家与基准国家一致");
  }

  const failed10 = recent10.filter((item) => !item.ok).length;
  const failureRate10 = recent10.length ? failed10 / recent10.length : 0;
  if (failureRate10 > 0.3) {
    severe = true;
    warnings.failure.push(`请求失败率偏高：${formatPercent(failureRate10)}`);
  } else if (failureRate10 > 0) {
    minor = true;
    warnings.failure.push(`请求失败率 ${formatPercent(failureRate10)}，连接存在轻微失败`);
  } else {
    normalReasons.push("请求失败率 0%");
  }

  const ipChanges5m = baseline ? countBaselineMismatches(last5m, baseline.ip, (item) => item.ip) : 0;
  if (ipChanges5m === 1) {
    minor = true;
    warnings.exit.push("IP 在 5 分钟内与基准出口不一致 1 次");
  } else if (ipChanges5m === 2) {
    minor = true;
    warnings.exit.push("IP 在 5 分钟内与基准出口不一致 2 次");
  } else if (ipChanges5m >= 3) {
    severe = true;
    warnings.exit.push(`IP 在 5 分钟内与基准出口不一致 ${ipChanges5m} 次`);
  } else if (baseline) {
    normalReasons.push("IP 与基准出口一致");
  }

  const asnChanges5m = baseline?.asn
    ? countBaselineMismatches(last5m, baseline.asn, (item) => item.asn ?? null)
    : 0;
  if (!current.asn) {
    normalReasons.push("ASN 未知");
  } else if (!baseline?.asn) {
    normalReasons.push("基准 ASN 未知");
  } else if (asnChanges5m === 1) {
    minor = true;
    warnings.exit.push("ASN 在 5 分钟内与基准出口不一致 1 次");
  } else if (asnChanges5m >= 2) {
    severe = true;
    warnings.exit.push(`ASN 在 5 分钟内与基准出口不一致 ${asnChanges5m} 次`);
  } else {
    normalReasons.push("ASN 与基准出口一致");
  }

  const averageLatencyMs = averageLatency(recent10);
  const networkQualityScore = getNetworkQualityScore(averageLatencyMs);
  if (averageLatencyMs !== null && averageLatencyMs > 600) {
    minor = true;
    warnings.latency.push(`平均延迟偏高：${averageLatencyMs}ms`);
  } else if (averageLatencyMs !== null) {
    normalReasons.push("延迟稳定");
  } else {
    normalReasons.push("延迟数据不足");
  }

  if (networkQualityScore < 70) {
    minor = true;
    warnings.quality.push(`网络质量偏低：${networkQualityScore}/100`);
    if (ipChanges5m === 0 && asnChanges5m === 0) {
      warnings.quality.push("IP 出口稳定，但连接质量较差");
    }
  }

  const consecutiveTimeouts = countConsecutiveTimeouts(history);
  if (consecutiveTimeouts >= 2) {
    severe = true;
    warnings.failure.push("连续 2 次请求超时");
  } else {
    normalReasons.push("未检测到连续失败");
  }

  if (!current.ok && consecutiveFailures(history) >= 2) {
    severe = true;
    directRed = true;
    warnings.failure.push("开发工具连接质量异常，可能已经断连");
  }

  let rawStatus: RiskStatus = "green";
  if (severe) {
    rawStatus = "red";
  } else if (minor) {
    rawStatus = "yellow";
  }

  const nextMemory = updateMemory(memory, rawStatus, directRed);
  const metrics = buildMetrics(rawStatus, nextMemory.status, warnings, normalReasons, history, nextMemory, config);
  return { metrics, memory: nextMemory };
}

function updateMemory(memory: RiskMemory, rawStatus: RiskStatus, directRed: boolean): RiskMemory {
  if (directRed) {
    return {
      status: "red",
      stableStreak: 0,
      minorAnomalyStreak: 0,
      severeAnomalyStreak: memory.severeAnomalyStreak + 1
    };
  }

  const stableStreak = rawStatus === "green" ? memory.stableStreak + 1 : 0;
  const minorAnomalyStreak = rawStatus === "yellow" ? memory.minorAnomalyStreak + 1 : 0;
  const severeAnomalyStreak = rawStatus === "red" ? memory.severeAnomalyStreak + 1 : 0;

  let status = memory.status;
  if (rawStatus === "green" && stableStreak >= 5) {
    status = "green";
  } else if (rawStatus === "yellow" && minorAnomalyStreak >= 2) {
    status = status === "red" ? "red" : "yellow";
  } else if (rawStatus === "red" && severeAnomalyStreak >= 2) {
    status = "red";
  }

  if (memory.status === "green" && rawStatus === "yellow" && minorAnomalyStreak < 2) {
    status = "green";
  }

  return { status, stableStreak, minorAnomalyStreak, severeAnomalyStreak };
}

function buildMetrics(
  rawStatus: RiskStatus,
  status: RiskStatus,
  warnings: WarningBuckets,
  normalReasons: string[],
  history: ProbeResult[],
  memory: RiskMemory,
  config: AppConfig
): RiskMetrics {
  const now = Date.now();
  const recent10 = history.slice(-10);
  const last5m = history.filter((item) => now - item.timestamp <= FIVE_MINUTES);
  const current = history.at(-1) ?? null;
  const baseline = config.baseline;
  const averageLatencyMs = averageLatency(recent10);
  const failureRate10 = recent10.length ? recent10.filter((item) => !item.ok).length / recent10.length : 0;
  const ipChanges5m = baseline ? countBaselineMismatches(last5m, baseline.ip, (item) => item.ip) : 0;
  const asnChanges5m = baseline?.asn
    ? countBaselineMismatches(last5m, baseline.asn, (item) => item.asn ?? null)
    : 0;
  const consecutiveTimeouts = countConsecutiveTimeouts(history);
  const countryChangedFromBaseline = Boolean(
    baseline && current?.ok && current.countryCode?.toUpperCase() !== baseline.country
  );
  const subScores = calculateSubScores({
    current,
    baseline,
    ipChanges5m,
    asnChanges5m,
    averageLatencyMs,
    failureRate10,
    consecutiveTimeouts
  });
  const score = Math.round(
    (subScores.ipStability +
      subScores.regionConsistency +
      subScores.networkQuality +
      subScores.serviceConnectivity) /
      4
  );
  const warningReasons = flattenWarnings(warnings);
  const statusMessage = getStatusMessage(status, warnings);

  return {
    rawStatus,
    status,
    score,
    reasons: [...warningReasons, ...normalReasons],
    warningReasons,
    normalReasons,
    statusMessage,
    isReevaluating: false,
    reevaluationSamplesRemaining: 0,
    resetHint: null,
    baseline,
    countryChangedFromBaseline,
    ipStableMs: current?.ip ? getIpStableMs(history, current.ip) : null,
    ipChanges5m,
    asnChanges5m,
    averageLatencyMs,
    failureRate10,
    consecutiveTimeouts,
    subScores,
    stableStreak: memory.stableStreak,
    minorAnomalyStreak: memory.minorAnomalyStreak,
    severeAnomalyStreak: memory.severeAnomalyStreak
  };
}

function calculateSubScores(input: {
  current: ProbeResult | null;
  baseline: BaselineEndpoint | null;
  ipChanges5m: number;
  asnChanges5m: number;
  averageLatencyMs: number | null;
  failureRate10: number;
  consecutiveTimeouts: number;
}): RiskSubScores {
  const currentCountry = input.current?.countryCode?.toUpperCase() ?? null;
  const baselineCountry = input.baseline?.country ?? null;
  const ipPenalty = input.ipChanges5m === 0 ? 0 : input.ipChanges5m === 1 ? 20 : input.ipChanges5m === 2 ? 35 : 65;
  const asnPenalty = input.asnChanges5m === 0 ? 0 : input.asnChanges5m === 1 ? 20 : 55;
  const regionConsistency = !input.current?.ok
    ? 50
    : baselineCountry && currentCountry
      ? currentCountry === baselineCountry
        ? 100
        : 0
      : 60;
  const failurePenalty = Math.round(input.failureRate10 * 100);
  const timeoutPenalty = input.consecutiveTimeouts >= 2 ? 45 : input.consecutiveTimeouts === 1 ? 18 : 0;

  return {
    ipStability: clampScore(100 - ipPenalty - asnPenalty),
    regionConsistency: clampScore(regionConsistency),
    networkQuality: getNetworkQualityScore(input.averageLatencyMs),
    serviceConnectivity: clampScore((input.current?.ok === false ? 70 : 100) - failurePenalty - timeoutPenalty)
  };
}

function getNetworkQualityScore(averageLatencyMs: number | null): number {
  if (averageLatencyMs === null) {
    return 70;
  }

  if (averageLatencyMs <= 300) {
    return 100;
  }

  if (averageLatencyMs <= 600) {
    return 82;
  }

  if (averageLatencyMs <= 1000) {
    return 55;
  }

  return 35;
}

function flattenWarnings(warnings: WarningBuckets): string[] {
  return [
    ...warnings.country,
    ...warnings.exit,
    ...warnings.failure,
    ...warnings.latency,
    ...warnings.quality
  ];
}

function getStatusMessage(status: RiskStatus, warnings: WarningBuckets): string {
  if (status === "green") {
    return "VPN 出口状态稳定";
  }

  if (warnings.country.length > 0) {
    return "出口国家发生变化";
  }

  if (warnings.exit.length > 0) {
    return "出口 IP / ASN 发生变化";
  }

  if (warnings.failure.length > 0) {
    return status === "red" ? "开发工具连接质量异常" : "连接存在轻微失败";
  }

  if (warnings.latency.length > 0) {
    return "出口稳定，但连接延迟偏高";
  }

  if (warnings.quality.length > 0) {
    return "出口稳定，但网络质量偏低";
  }

  return status === "red" ? "开发工具连接质量异常" : "网络风险提示";
}

function averageLatency(history: ProbeResult[]): number | null {
  const values = history
    .map((item) => item.latencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function countBaselineMismatches(
  history: ProbeResult[],
  baselineValue: string,
  selector: (item: ProbeResult) => string | null | undefined
): number {
  return history.filter((item) => {
    const value = selector(item);
    return Boolean(item.ok && value && value !== baselineValue);
  }).length;
}

function getIpStableMs(history: ProbeResult[], currentIp: string): number {
  const current = history.at(-1);
  if (!current) {
    return 0;
  }

  for (let index = history.length - 2; index >= 0; index -= 1) {
    if (history[index].ip !== currentIp) {
      return current.timestamp - history[index + 1].timestamp;
    }
  }

  return current.timestamp - history[0].timestamp;
}

function countConsecutiveTimeouts(history: ProbeResult[]): number {
  let count = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (!history[index].timedOut) {
      break;
    }
    count += 1;
  }
  return count;
}

function consecutiveFailures(history: ProbeResult[]): number {
  let count = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].ok) {
      break;
    }
    count += 1;
  }
  return count;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
