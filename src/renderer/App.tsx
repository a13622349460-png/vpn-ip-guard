import { EyeOff, Minus, RefreshCw, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, PointerEvent, ReactNode } from "react";
import { classifyDisplayStatus, getDisplayStatusTitle } from "../shared/displayStatus";
import type { IpGuardApi, MonitorSnapshot, NotificationMode, RiskStatus } from "../shared/types";

const statusText: Record<RiskStatus, string> = {
  green: "VPN 出口状态稳定",
  yellow: "网络风险提示：存在轻微波动",
  red: "开发工具连接质量异常"
};

const notificationModes: Array<{ value: NotificationMode; label: string }> = [
  { value: "normal", label: "全部" },
  { value: "risk", label: "风险" },
  { value: "danger", label: "危险" },
  { value: "off", label: "关闭" }
];

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Renderer crashed", error, info);
  }

  render() {
    if (this.state.error) {
      return <DebugScreen message="渲染层发生错误" details={this.state.error.message} />;
    }

    return this.props.children;
  }
}

export default function App() {
  const isMini = new URLSearchParams(window.location.search).get("mini") === "1";

  return (
    <ErrorBoundary>
      {isMini ? <MiniStatusApp api={window.ipGuard} /> : <GuardApp api={window.ipGuard} />}
    </ErrorBoundary>
  );
}

function GuardApp({ api }: { api?: IpGuardApi }) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api) {
      return;
    }

    let disposed = false;
    void api
      .getSnapshot()
      .then((next) => {
        if (disposed) {
          return;
        }
        setSnapshot(next);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!disposed) {
          setError(getErrorMessage(nextError));
        }
      });

    const unsubscribe = api.onSnapshot((next) => {
      setSnapshot(next);
      setError(null);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [api]);

  const status = snapshot?.metrics.status ?? "green";
  const Icon = status === "green" ? ShieldCheck : status === "yellow" ? ShieldAlert : ShieldX;

  const checksCount = snapshot?.history.length ?? 0;
  const current = snapshot?.current ?? null;
  const baseline = snapshot?.metrics.baseline ?? snapshot?.config.baseline ?? null;
  const warningReasons = snapshot?.metrics.warningReasons ?? [];
  const normalReasons = snapshot?.metrics.normalReasons ?? [];
  const subScores = snapshot?.metrics.subScores;
  const statusMessage = snapshot?.metrics.statusMessage ?? statusText[status];
  const displayStatus = classifyDisplayStatus(snapshot);
  const statusTitle = getDisplayStatusTitle(displayStatus);
  const asnMismatch = Boolean(current?.asn && baseline?.asn && current.asn !== baseline.asn);

  const stableText = useMemo(() => {
    const value = snapshot?.metrics.ipStableMs;
    if (value === null || value === undefined) {
      return "暂无";
    }
    return formatDuration(value);
  }, [snapshot?.metrics.ipStableMs]);

  async function runCheckNow() {
    if (!api) {
      return;
    }
    setIsChecking(true);
    try {
      setSnapshot(await api.runCheckNow());
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsChecking(false);
    }
  }

  async function resetAndCheckNow() {
    if (!api) {
      return;
    }
    setIsResetting(true);
    try {
      setSnapshot(await api.resetAndCheckNow());
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setIsResetting(false);
    }
  }

  async function toggleAlwaysOnTop() {
    if (!api || !snapshot) {
      return;
    }
    try {
      setSnapshot(await api.updateConfig({ alwaysOnTop: !snapshot.config.alwaysOnTop }));
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  async function updateNotificationMode(notificationMode: NotificationMode) {
    if (!api || !snapshot) {
      return;
    }
    try {
      setSnapshot(await api.updateConfig({ notificationMode }));
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  async function hideToTray() {
    if (!api) {
      return;
    }
    try {
      await api.hideToTray();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  if (!api) {
    return <DebugScreen message="Electron API 未连接，preload 未成功加载" details="window.ipGuard 不存在" />;
  }

  return (
    <main className={`app status-${status}`}>
      <section className="titlebar">
        <div className="brand">
          <span className="status-dot" />
          <span>VPN IP Guard</span>
        </div>
        <div className="window-controls">
          <button className="icon-button" type="button" onMouseDown={(event) => event.preventDefault()} onClick={hideToTray} title="隐藏到托盘">
            <Minus size={17} />
          </button>
          <button className="icon-button" type="button" onMouseDown={(event) => event.preventDefault()} onClick={hideToTray} title="隐藏到托盘">
            <EyeOff size={17} />
          </button>
        </div>
      </section>

      {error ? <section className="error-banner">{error}</section> : null}

      <section className={`status-panel display-${displayStatus}`}>
        <div className="status-icon">
          <Icon size={40} strokeWidth={1.8} />
        </div>
        <div>
          <div className="status-label">{statusTitle}</div>
          <div className="status-copy">{statusMessage}</div>
        </div>
      </section>

      <div className="scroll-content">
        <section className="metrics-grid">
          <Metric label="当前公网 IP" value={current?.ip ?? "暂无"} wide />
          <Metric label="当前国家" value={current?.countryCode ?? "暂无"} />
          <Metric label="基准国家" value={baseline?.country ?? "评估中"} />
          <Metric label="当前 ASN" value={current?.asn ?? "ASN 未知"} tone={asnMismatch ? "warning" : undefined} />
          <Metric label="基准 ASN" value={baseline ? (baseline.asn ?? "ASN 未知") : "评估中"} tone={asnMismatch ? "warning" : undefined} />
          <Metric label="ISP / Organization" value={formatProvider(current?.isp, current?.org)} wide />
          <Metric label="IP 已稳定" value={stableText} />
          <Metric label="5 分钟 IP 变化" value={`${snapshot?.metrics.ipChanges5m ?? 0} 次`} />
          <Metric label="ASN 5 分钟变化" value={`${snapshot?.metrics.asnChanges5m ?? 0} 次`} />
          <Metric label="平均延迟" value={formatLatency(snapshot?.metrics.averageLatencyMs)} />
          <Metric label="失败率" value={formatRate(snapshot?.metrics.failureRate10)} />
          <Metric label="最近检测" value={current ? formatTime(current.timestamp) : "暂无"} />
        </section>

        <section className="score-grid" aria-label="风险子评分">
          <ScoreItem label="IP 出口一致性" value={subScores?.ipStability ?? 0} />
          <ScoreItem label="地区一致性" value={subScores?.regionConsistency ?? 0} />
          <ScoreItem label="网络质量" value={subScores?.networkQuality ?? 0} />
          <ScoreItem label="服务连通性" value={subScores?.serviceConnectivity ?? 0} />
        </section>

        {snapshot?.metrics.resetHint ? (
          <section className="reset-hint">
            <span>{snapshot.metrics.resetHint}</span>
            <button type="button" onClick={resetAndCheckNow} disabled={isResetting}>
              {isResetting ? "重置中" : "重置并检测"}
            </button>
          </section>
        ) : null}

        <section className="switch-row">
          <label className="toggle">
            <input type="checkbox" checked={snapshot?.config.alwaysOnTop ?? true} onChange={toggleAlwaysOnTop} />
            <span />
          </label>
          <span>Always on top</span>
          <span className="checks-count">{checksCount} 条历史</span>
        </section>

        <section className="notification-row" aria-label="通知模式">
          <span>通知</span>
          <div className="segment-control">
            {notificationModes.map((item) => (
              <button
                key={item.value}
                type="button"
                className={(snapshot?.config.notificationMode ?? "normal") === item.value ? "active" : undefined}
                onClick={() => updateNotificationMode(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        {warningReasons.length > 0 || normalReasons.length > 0 ? (
          <section className="reasons">
            {warningReasons.length > 0 ? <ReasonGroup title="异常 / 警告项" items={warningReasons} tone="warning" /> : null}
            {normalReasons.length > 0 ? <ReasonGroup title="正常项" items={normalReasons} tone="normal" /> : null}
          </section>
        ) : (
          <section className="reasons quiet">没有触发风险规则</section>
        )}

        <section className="actions">
          <button className="primary-button" type="button" onClick={runCheckNow} disabled={isChecking}>
            <RefreshCw size={17} className={isChecking ? "spin" : undefined} />
            {isChecking ? "检测中" : "立即检测"}
          </button>
          <button className="secondary-button" type="button" onClick={resetAndCheckNow} disabled={isResetting}>
            {isResetting ? "重置中" : "重置并检测"}
          </button>
          <button className="secondary-button" type="button" onClick={hideToTray}>
            隐藏到托盘
          </button>
        </section>
      </div>
    </main>
  );
}

function ReasonGroup({ title, items, tone }: { title: string; items: string[]; tone: "warning" | "normal" }) {
  return (
    <div className={`reason-group reason-group-${tone}`}>
      <div className="reasons-title">{title}</div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function MiniStatusApp({ api }: { api?: IpGuardApi }) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const pointerState = useRef<{ pointerId: number; startX: number; startY: number; dragging: boolean } | null>(null);
  const suppressDoubleClickUntil = useRef(0);

  useEffect(() => {
    if (!api) {
      return;
    }

    let disposed = false;
    void api
      .getSnapshot()
      .then((next) => {
        if (!disposed) {
          setSnapshot(next);
        }
      })
      .catch((nextError: unknown) => {
        if (!disposed) {
          setError(getErrorMessage(nextError));
        }
      });

    const unsubscribe = api.onSnapshot((next) => {
      setSnapshot(next);
      setError(null);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [api]);

  async function showMainWindow() {
    if (Date.now() < suppressDoubleClickUntil.current) {
      return;
    }

    try {
      await api?.showMainWindow();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (!api || event.button !== 0) {
      return;
    }

    pointerState.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      dragging: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    api.miniDragStart(event.screenX, event.screenY);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const current = pointerState.current;
    if (!api || !current || current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.screenX - current.startX;
    const deltaY = event.screenY - current.startY;
    const distance = Math.hypot(deltaX, deltaY);
    if (!current.dragging && distance <= 4) {
      return;
    }

    if (!current.dragging) {
      current.dragging = true;
      setIsDragging(true);
    }

    api.miniDragMove(event.screenX, event.screenY);
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    finishDrag(event);
  }

  function handlePointerCancel(event: PointerEvent<HTMLElement>) {
    finishDrag(event);
  }

  function finishDrag(event: PointerEvent<HTMLElement>) {
    const current = pointerState.current;
    if (!api || !current || current.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (current.dragging) {
      suppressDoubleClickUntil.current = Date.now() + 250;
    }

    api.miniDragEnd();
    pointerState.current = null;
    setIsDragging(false);
  }

  const displayStatus = classifyDisplayStatus(snapshot);
  const label = error ? "异常" : getDisplayStatusTitle(displayStatus);

  return (
    <main
      className={`mini-status mini-${displayStatus}${isDragging ? " mini-dragging" : ""}`}
      onDoubleClick={showMainWindow}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      title="双击显示主窗口"
    >
      <span className="mini-drag-handle" aria-hidden="true" />
      <span className="mini-dot" />
      <strong>{label}</strong>
    </main>
  );
}

function ScoreItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-item">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="score-track">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function DebugScreen({ message, details }: { message: string; details?: string }) {
  return (
    <main className="app status-red debug-screen">
      <section className="titlebar">
        <div className="brand">
          <span className="status-dot" />
          <span>VPN IP Guard</span>
        </div>
      </section>
      <section className="status-panel">
        <div className="status-icon">
          <ShieldX size={40} strokeWidth={1.8} />
        </div>
        <div>
          <div className="status-label">危险</div>
          <div className="status-copy">{message}</div>
        </div>
      </section>
      {details ? <section className="error-banner">{details}</section> : null}
    </main>
  );
}

function Metric({
  label,
  value,
  wide = false,
  tone
}: {
  label: string;
  value: string;
  wide?: boolean;
  tone?: "warning";
}) {
  const className = ["metric", wide ? "metric-wide" : null, tone === "warning" ? "metric-warning" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function formatLatency(value: number | null | undefined): string {
  return typeof value === "number" ? `${value} ms` : "暂无";
}

function formatRate(value: number | null | undefined): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "0%";
}

function formatProvider(isp: string | null | undefined, org: string | null | undefined): string {
  if (isp && org && isp !== org) {
    return `${isp} / ${org}`;
  }
  return isp ?? org ?? "未知";
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp);
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) {
    return `${remainingSeconds} 秒`;
  }
  return `${minutes} 分 ${remainingSeconds} 秒`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知 IPC 错误";
}
