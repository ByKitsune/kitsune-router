# 🌿 ZenRouter CLI (`@joyccn/zenrouter`)

> Serene AI Gateway & Intelligent Multi-Provider Routing Engine CLI Launcher

Official CLI package for running, configuring, and managing **ZenRouter** on macOS, Linux, and Windows.

- **GitHub Repository**: [https://github.com/ZenRouter/ZenRouter](https://github.com/ZenRouter/ZenRouter)
- **Web Dashboard**: [https://router.bykitsune.org](https://router.bykitsune.org)

---

## Current release: 0.9.13

Dated **2026-10-19**. [GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.13) · [Changelog](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.13.md) · [Release notes](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.13.md).

## ⚡ Installation & Usage

Requires **Node.js >=22.19.0**. The package is `@joyccn/zenrouter`; the command remains `zenrouter`. Pinned examples apply after publication, which is separate from documentation preparation. This release repairs thinking probes and adds independent OpenAI/Codex processing-speed controls. Fast/Ultrafast can cost more and require supported models/accounts; an expired or invalidated OAuth refresh token still requires reauthorization.

### Run instantly with NPX:
```bash
npx @joyccn/zenrouter@0.9.13
```

### Install globally:
```bash
npm install -g @joyccn/zenrouter@0.9.13
zenrouter
```

---

## 🛠️ CLI Commands & Options

```text
Usage: zenrouter [options] [command]

Options:
  -v, --version         output the current version
  -p, --port <number>   specify server port (default: 20128)
  -d, --data-dir <dir>  specify persistent database directory (default: ~/.zenrouter)
  --no-open             do not automatically open the browser dashboard on launch
  -h, --help            display help for command
```

---

## 📄 License
MIT License &copy; 2026 Joy and ZenRouter Contributors.
