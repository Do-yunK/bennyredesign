# Welcome to the redesign :)



# Benny's Accessibility Hub 2.0

**A bespoke software suite for one- and two-switch accessibility, built with Electron.**

This project provides an accessible computing environment designed for users who operate a computer with limited input methods (such as a single switch). The hub includes games, communication tools, journaling, media streaming control, and more — all navigable via switch scanning.

---

## ⚠️ Disclaimer

This software was created by caregivers for a specific individual with TUBB4A-related Leukodystrophy (H-ABC). It is **not** professional medical software.

This repository serves as an open-source example of how families can use modern development tools (including AI-assisted workflows like ChatGPT and GitHub Copilot) to build accessible technology tailored to specific needs.

---

## Architecture

The system is built on **Electron** (Node.js + Chromium) with specific Python components for features that require system-level access.

### Core (Electron / Node.js)

* `main.js` — Electron main process, launches the hub
* `preload.js` — Secure bridge between web pages and Node.js
* `bennyshub/` — All HTML/CSS/JS applications (games, tools, hub interface)

### Python Components (Windows-specific)

These run as separate processes when needed:

* `messenger/ben_discord_app.py` — Discord GUI client with switch-accessible interface
* `messenger/simple_dm_listener.py` — Background service announcing incoming DMs via TTS
* `search/narbe_scan_browser.py` — Web search with accessible scanning interface
* `streaming/server.py` — Local server for streaming app control
* `streaming/utils/control_bar.py` — Always-on-top overlay for controlling streaming apps

---

## Features

### 🎮 Games

Located in `bennyshub/apps/games/`:

* Benny's Bowling — 3D physics-based bowling (Three.js / Ammo.js)
* Trivia Master — Customizable trivia with local/online packs
* Word Jumble — Word unscrambling game
* Matchy Match — Memory matching
* Benny's P3GL — Peggle-style arcade game
* Bug Blaster — Arcade tower defense
* Chess & Checkers — Classic board games
* Mini Golf — Course-based mini golf with creator
* Dice — Accessible dice roller
* Tic Tac Toe — AI opponent
* Benny Says — Simon-style memory game
* Basketball Shooter — Arcade basketball
* Baseball — Baseball game

### 🛠️ Tools

Located in `bennyshub/apps/tools/`:

* Journal — Voice-enabled daily journal
* Phrase Board — Quick-access communication tiles
* Keyboard — Predictive on-screen keyboard
* Search — Accessible web / YouTube search (Python backend)

### 💬 Messenger (Discord)

A switch-accessible Discord client:

* Full DM and channel support
* TTS announcements
* Predictive keyboard
* Background notification listener

### 📺 Streaming Dashboard

Switch-accessible streaming control:

* Unified launcher across services
* Episode tracking
* Always-on-top control bar (Play, Pause, Volume, Skip, Exit)

---

## Installation

### Prerequisites

* Windows 10/11 (required for Python components)
* Node.js 18+
* Python 3.10+
* Git (optional)

### Clone

```bash
git clone https://github.com/NARBEHOUSE/Benny-s-Accessibility-Hub-2.0.git
cd Benny-s-Accessibility-Hub-2.0
```

### Install Dependencies

```bash
npm install
pip install -r requirements.txt
```

### Run

```bash
npm start
```

Or use `start_hub.bat`.

---

## License

This project is licensed under the **MIT License**.

You are free to use, modify, distribute, and even use this software commercially, provided the original copyright notice and license are included.

See the [LICENSE](LICENSE) file for full details.

---

## Trademark & Attribution

"Benny’s Accessibility Hub" and "NarbeHouse" are identifiers associated with the original project.

While the code is licensed under MIT, use of the project name, branding, or representation as the official project requires permission.

Forks and derivative works must not imply endorsement or affiliation with NarbeHouse without explicit approval.

---

## Third-Party Components

This project includes third-party libraries and dependencies (Electron, Three.js, Ammo.js, Discord.py, PySide6, and others). These retain their original licenses.

Users are responsible for complying with the respective third-party license terms.

---

## Credits

Concept & Caregiving: Nancy & Ari

Development: AI-assisted (ChatGPT / GitHub Copilot) & NarbeHouse

Libraries: Electron, Three.js, Ammo.js, Discord.py, PySide6

---

**Dedicated to Ben. 💙**
