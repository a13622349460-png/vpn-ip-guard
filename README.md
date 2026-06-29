# VPN IP Guard / VPN 出口 IP 监控工具

VPN IP Guard 是一个 Windows 桌面端 VPN 出口 IP 监控工具，用来观察当前公网 IP、国家、ASN、ISP/Organization、平均延迟和请求失败率是否稳定。

它不是 VPN 客户端，不负责连接 VPN、不优化节点、不推荐国家或线路。它只负责监控当前机器已经生效的公网 IP 出口状态。

English keywords: VPN IP monitor, public IP guard, VPN exit monitor, ASN monitor, Windows tray app.

## 普通使用 / Normal Use

普通用户只需要双击：

```text
start-vpn-ip-guard.bat
```

这个启动脚本会自动进入项目目录并启动应用，不需要手动输入 `npm run dev:all`。

应用启动后会检测当前公网 IP 出口，并在 Windows 系统托盘中持续运行。关闭窗口时默认隐藏到托盘，不会直接退出。

## 基准出口逻辑 / Baseline Logic

VPN IP Guard 不使用固定默认国家，比如不会默认假设目标国家是 JP。

首次成功检测公网 IP 后，应用会把当前出口保存为“基准出口”（baseline）。基准信息包括：

- `ip`
- `country`
- `asn`
- `isp` / `org`
- `createdAt`

后续检测会把当前结果和基准出口对比：

- 如果当前国家和基准国家不同，会提示：`检测到出口国家变化。如果这是你主动切换的节点，请点击「重置并检测」。`
- 如果当前 IP 或 ASN 和基准出口不同，会计入 IP / ASN 变化统计。
- 平均延迟、请求超时和失败率会作为网络连接质量信号单独显示。

点击 `重置并检测` 会清空历史检测记录、IP / ASN 变化统计，并用下一次成功检测结果建立新的基准出口。

## 状态含义 / Status Meaning

- `安全 / Safe`：当前国家、ASN、IP 出口与基准出口一致，连接质量正常。
- `延迟 / Latency`：出口仍然稳定，但平均延迟偏高。
- `风险 / Risk`：IP、ASN 或国家与基准出口不一致，或出现出口稳定性相关问题。
- `危险 / Danger`：连续请求失败、多次超时、国家明显不一致，或服务连通性严重异常。

## 重置本地配置 / Reset Local Config

如果想安全地清理本地运行配置，双击：

```text
reset-vpn-ip-guard-config.bat
```

这个脚本只清理应用运行时配置，例如 baseline 和本地状态记录；不会删除源码、`node_modules`、启动脚本或其它项目文件。

重置后，下次启动应用会使用第一次成功检测到的公网 IP、国家和 ASN 作为新的基准出口。脚本完成时会显示：

```text
本地配置已重置。
```

## 界面信息 / UI

主界面会显示：

- 当前公网 IP / current public IP
- 当前国家 / current country
- 基准国家 / baseline country
- 当前 ASN / current ASN
- 基准 ASN / baseline ASN
- ISP / Organization
- IP 已稳定时长 / IP stable duration
- 5 分钟 IP 变化次数 / 5-minute IP change count
- 5 分钟 ASN 变化次数 / 5-minute ASN change count
- 平均延迟 / average latency
- 失败率 / failure rate
- 最近检测时间 / latest check time

本工具不推荐任何国家或 VPN 节点。

## 开发者命令 / Developer Commands

安装依赖：

```bash
npm install
```

同时启动 Vite 和 Electron：

```bash
npm run dev:all
```

构建应用：

```bash
npm run build
```

从构建产物启动 Electron：

```bash
npm start
```

创建桌面快捷方式：

```bash
npm run shortcut
```

重置本地运行配置：

```bash
npm run reset:config
```
