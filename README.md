# Auto Wallpaper for GNOME Shell

[![GNOME 45+](https://img.shields.io/badge/GNOME%20Shell-45%20%7C%2046%20%7C%2047%20%7C%2048%20%7C%2049%20%7C%2050-blue.svg)](https://extensions.gnome.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-green.svg)](LICENSE)
[![Interface: Libadwaita](https://img.shields.io/badge/Interface-Libadwaita%20GTK4-purple.svg)](https://gnome.pages.gitlab.gnome.org/libadwaita/)

**Auto Wallpaper** is a modern, lightweight, and fully asynchronous wallpaper cycler and manager designed specifically for GNOME Shell. It provides seamless synchronization with GNOME's dynamic Light and Dark style themes, structural duplicate image detection, perceptual lightness classification, and optional AI-assisted upscaling.

---

## ✨ Features

- **🌓 Dynamic Light & Dark Theme Sync**: Automatically switches between dedicated wallpaper collections whenever your system changes between light and dark modes (`org.gnome.desktop.interface.color-scheme`).
- **⏱️ Flexible Rotation Schedules**:
  - **Interval mode**: Change wallpapers every *N* minutes or hours.
  - **Daily mode**: Change wallpapers at a fixed time each day (24-hour format) with multi-day frequency intervals.
  - **Manual mode**: Change wallpapers on demand.
- **🎴 Sequence Modes**:
  - **Random**: Classic pseudo-random selection.
  - **Random Sequential (Full Deck)**: Cycles through all available wallpapers without repeats until the entire collection is shown.
- **⚡ 100% Asynchronous & Non-Blocking**:
  - Built strictly using asynchronous GJS APIs (`Gio.File.enumerate_children_async`, `replace_contents_bytes_async`, `Gio.FileMonitor`).
  - Never freezes or blocks the GNOME Shell main rendering thread.
- **📌 Pin & Exclude Folders**:
  - `pinned/`: Mark wallpapers to protect them in their assigned theme.
  - `exclude/`: Move undesired wallpapers away from rotation without deleting them.
- **🔍 Perceptual Duplicate Detector (dHash)**:
  - Fast, native GJS worker calculating 64-bit structural perceptual hashes (dHash) to find exact and near-identical images even if re-compressed or resized.
- **🎨 Perceptual Lightness Classifier (CIELAB L*)**:
  - Automatically analyzes image brightness using human perception models (CIELAB L* + 65th percentile) to organize mixed collections into light and dark folders.
- **✨ Optional AI Upscaling (Smart Upscale)**:
  - Integration with Vulkan-accelerated Real-CUGAN models to enhance low-resolution wallpapers with no blocking operations and user-guided dependency setup.
- **⌨️ Native Global Shortcuts**:
  - `<Super>w`: Instantly skip to the next wallpaper.
  - `<Super><Alt>w`: Rescan collections, reshuffle deck, and apply fresh wallpapers.
- **📋 Panel Tray Indicator**:
  - Optional status icon in the top panel with quick actions (Next, Shuffle, Reload, Auto toggle, Preferences).

---

## 💻 Compatibility

- **GNOME Shell Versions**: `45`, `46`, `47`, `48`, `49`, `50`
- **Session Types**: Wayland and X11
- **UI Toolkit**: GTK4 & Libadwaita

---

## 📦 Installation

### From GNOME Extensions (Recommended)
Install directly from [extensions.gnome.org](https://extensions.gnome.org/extension/autowallpaper@lumory) (once published) and toggle it on.

### Manual Installation (From Source)
1. Clone the repository:
   ```bash
   git clone https://github.com/lumory/autoWallpaper.git
   cd autoWallpaper
   ```
2. Run the installer:
   ```bash
   ./install.sh
   ```
3. Restart GNOME Shell:
   - **Wayland**: Log out and log back in.
   - **X11**: Press `Alt + F2`, type `r`, and press Enter.

To uninstall:
```bash
./install.sh --uninstall
```

---

## 🛠️ Note for Extensions.gnome.org (EGO) Reviewers

- **Main Extension Lifecycle**: [extension/extension.js](extension/extension.js) is 100% self-contained asynchronous GJS. It does not spawn subprocesses, does not perform synchronous disk I/O, does not import GTK into the Shell process, and cleanly removes all signals, monitors, timeouts, and UI widgets on `disable()`.
- **Worker Script**: `extension/scripts/image_worker.js` is a lightweight GJS script executed via `Gio.Subprocess` only from the preferences window (`prefs.js`) to handle duplicate detection and luminosity classification off the UI thread.
- **Optional Python Script**: `extension/scripts/smart_upscale.py` is strictly an optional maintenance utility accessible only from the preferences window. It is never invoked by the GNOME Shell extension itself, and never downloads binaries silently (guided user terminal commands are displayed instead).

---

## 🌐 Localization (i18n)

Auto Wallpaper is localized using GNU Gettext with English as the base language (`msgid`). Translations are available for:
- English (`en`)
- Spanish (`es`)
- French (`fr`)
- German (`de`)
- Italian (`it`)
- Portuguese (`pt`, `pt_BR`)
- Russian (`ru`)
- Chinese (`zh_CN`, `zh_TW`, `zh_HK`)
- Japanese (`ja`)
- Korean (`ko`)
- Polish (`pl`)
- Ukrainian (`uk`)
- Dutch (`nl`)
- Turkish (`tr`)

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0** (GPL-3.0-or-later). See the [LICENSE](LICENSE) file for details.

