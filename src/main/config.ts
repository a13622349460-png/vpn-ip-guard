import Store from "electron-store";
import type { AppConfig, BaselineEndpoint, MiniStatusPosition, NotificationMode } from "../shared/types.js";

type StoreSchema = {
  config: AppConfig;
};

const defaultConfig: AppConfig = {
  alwaysOnTop: true,
  baseline: null,
  notificationMode: "normal",
  miniStatusPosition: null
};

const store = new Store<StoreSchema>({
  name: "vpn-ip-guard",
  defaults: {
    config: defaultConfig
  }
});

export function getConfig(): AppConfig {
  const config = store.get("config", defaultConfig);
  return normalizeConfig(config);
}

export function updateConfig(patch: Partial<AppConfig>): AppConfig {
  const next = normalizeConfig({ ...getConfig(), ...patch });
  store.set("config", next);
  return next;
}

function normalizeConfig(config: AppConfig): AppConfig {
  return {
    alwaysOnTop: Boolean(config.alwaysOnTop),
    baseline: normalizeBaseline(config.baseline),
    notificationMode: normalizeNotificationMode(config.notificationMode),
    miniStatusPosition: normalizeMiniStatusPosition(config.miniStatusPosition)
  };
}

function normalizeNotificationMode(mode: NotificationMode | undefined): NotificationMode {
  if (mode === "normal" || mode === "risk" || mode === "danger" || mode === "off") {
    return mode;
  }
  return "normal";
}

function normalizeMiniStatusPosition(position: MiniStatusPosition | null | undefined): MiniStatusPosition | null {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return null;
  }

  return {
    x: Math.round(position.x),
    y: Math.round(position.y)
  };
}

function normalizeBaseline(baseline: BaselineEndpoint | null | undefined): BaselineEndpoint | null {
  const legacyBaseline = baseline as (BaselineEndpoint & { countryCode?: string }) | null | undefined;
  const country = legacyBaseline?.country ?? legacyBaseline?.countryCode;

  if (!legacyBaseline?.ip || !country || typeof legacyBaseline.createdAt !== "number") {
    return null;
  }

  return {
    ip: legacyBaseline.ip.trim(),
    country: country.trim().toUpperCase().slice(0, 2),
    asn: normalizeOptionalText(legacyBaseline.asn),
    isp: normalizeOptionalText(legacyBaseline.isp),
    org: normalizeOptionalText(legacyBaseline.org),
    createdAt: legacyBaseline.createdAt
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
