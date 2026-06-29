# VPN IP Guard

VPN IP Guard is a small Windows desktop monitor for checking whether the current VPN/IP exit stays consistent.

It does not connect to, configure, or optimize a VPN. It only monitors the public IP exit that is already active on the machine.

## Normal Use

Double-click:

```text
start-vpn-ip-guard.bat
```

The batch file automatically enters the project folder and starts the app. Regular users do not need to type `npm run dev:all`.

When the app starts, it checks the current public IP exit and keeps running in the system tray. Closing the window hides it to the tray instead of quitting.

## Baseline Logic

VPN IP Guard does not use a hard-coded default country.

On the first successful public IP detection, the app saves the current exit as the baseline. The baseline contains:

- `ip`
- `country`
- `asn`
- `isp` / `org`
- `createdAt`

Later checks compare the current result against that baseline:

- If the current country differs from the baseline country, the app warns: `检测到出口国家变化。如果这是你主动切换的节点，请点击「重置并检测」。`
- If the current IP or ASN differs from the baseline, the app counts it in the IP/ASN change statistics.
- Network latency, timeout, and request failure rate are still tracked as connection quality signals.

Clicking `重置并检测` clears the detection history, clears IP/ASN change statistics, uses the next successful detection as the new baseline, and enters the reevaluation state.

## Reset Local Config

To safely reset only the local runtime configuration, double-click:

```text
reset-vpn-ip-guard-config.bat
```

This removes the stored baseline and persisted local app state for VPN IP Guard. It does not delete source code, `node_modules`, the startup script, or any project files.

After the reset, the next app launch will use the first successful public IP, country, and ASN detection as the new baseline exit. The script prints `本地配置已重置。` when it finishes.

## UI

The main panel shows:

- current public IP
- current country
- baseline country
- current ASN
- baseline ASN
- ISP / Organization
- IP stable duration
- 5-minute IP change count
- 5-minute ASN change count
- average latency
- failure rate
- latest check time

The app does not recommend any country or VPN node.

## Developer Commands

Install dependencies:

```bash
npm install
```

Run the Vite dev server and Electron together:

```bash
npm run dev:all
```

Build the app:

```bash
npm run build
```

Start Electron from the built output:

```bash
npm start
```

Create a desktop shortcut to the normal launcher:

```bash
npm run shortcut
```

Reset local runtime configuration:

```bash
npm run reset:config
```
