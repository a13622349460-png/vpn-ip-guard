import type { DisplayStatus, MonitorSnapshot } from "./types.js";

export function classifyDisplayStatus(snapshot: MonitorSnapshot | null): DisplayStatus {
  if (!snapshot?.current) {
    return "safe";
  }

  const { current, metrics } = snapshot;
  const baseline = metrics.baseline ?? snapshot.config.baseline;
  const hasLatencyIssue = typeof metrics.averageLatencyMs === "number" && metrics.averageLatencyMs > 600;
  const hasDriftIssue = Boolean(
    metrics.countryChangedFromBaseline ||
      metrics.ipChanges5m > 0 ||
      metrics.asnChanges5m > 0 ||
      (baseline && current.ok && current.countryCode?.toUpperCase() !== baseline.country) ||
      (baseline?.asn && current.asn && current.asn !== baseline.asn)
  );
  const hasSevereIssue = Boolean(
    metrics.status === "red" ||
      metrics.consecutiveTimeouts >= 2 ||
      metrics.failureRate10 > 0.3 ||
      metrics.ipChanges5m >= 3 ||
      metrics.asnChanges5m >= 2 ||
      (baseline && current.ok && current.countryCode?.toUpperCase() !== baseline.country)
  );

  if (hasSevereIssue) {
    return "danger";
  }

  if (hasDriftIssue) {
    return "risk";
  }

  if (hasLatencyIssue) {
    return "latency";
  }

  return "safe";
}

export function getDisplayStatusTitle(status: DisplayStatus): string {
  if (status === "safe") {
    return "安全";
  }

  if (status === "danger") {
    return "危险";
  }

  if (status === "latency") {
    return "延迟";
  }

  return "风险";
}
