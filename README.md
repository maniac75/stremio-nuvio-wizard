# Stremio & Nuvio Wizard

A step-by-step setup wizard for **Stremio** and **Nuvio**: connect your account, take a verified backup, pick add-ons, review every change, then apply. Built for Spanish-speaking users (UI in Spanish and English).

**Live:** <https://wizard.stremio-nuvio.workers.dev> · **Beginner guide (ES):** <https://wizard.stremio-nuvio.workers.dev/guia.html>

[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/supermaniac)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-support-EA4AAA?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/maniac75)

> **Unofficial project.** Not affiliated with Stremio, Nuvio, AIOStreams or any add-on author. The wizard does not host, index or link to any media; it only edits the add-on list of *your own* account. You are responsible for how you use third-party add-ons in your country.

## Features

- **Sign in with Stremio:** approve access on Stremio’s official link page (or scan the QR), no password typed into the wizard.
- **Safe by default:** a verified, encrypted backup is required before any change, and the wizard refuses to apply if the account changed since that backup. Failed applies roll back.
- **Review before apply:** shows what will be added, replaced or removed, and lets you keep your own add-ons.
- **9 content languages:** Latin American Spanish, Spain Spanish, English, Brazilian and European Portuguese, French, Italian, German and Dutch, plus an advanced, ordered list of audio and subtitle languages.
- **Starting points:** Recommended, Minimal, Full or HTTP only (no torrents), plus a factory reset to Stremio's official add-ons.
- **AIOStreams + AIOMetadata** set up with sensible defaults for your language, optional Debrid (TorBox, Real-Debrid, AllDebrid, Premiumize, Debrid-Link, EasyDebrid, Offcloud, Debrider) and Easynews (Usenet), with "cached only" mode.
- **Home catalogs:** choose AIOMetadata row groups (streaming services, genres, decades, studios, countries, themes, anime) before installing; optional Gemini AI search.
- **Subtitles and trailers:** SubSense, OpenSubtitles PRO, optional SubSync (fixes frame-rate drift), Streailer, plus a link to Subtitle Sync (set up on its own page).
- **Copy between apps:** Stremio → Nuvio and Nuvio → Stremio, reusing the same AIOStreams instance.
- **Nuvio extras:** home-screen collections (Watch now, Genres, Decades, Themed, International, and Franchises with your own TMDB key), and one-click copy of the setup to the other profiles of the account. Collections are included in the backup.
- **Watchly recommendations (optional):** “Because you watched…” rows from your Stremio or Nuvio history, plus one-click Trakt connect for Stremio (auto-detected).
- **Customize after installing:** reorder add-ons and, in Stremio, hide or rename catalogs, with a safety backup first.
- **Remember my keys (optional):** service keys saved encrypted in your own browser for the next run.
- **Restore** any previous backup or an exported JSON.
- **Check my setup:** finds broken or retired add-ons in your account and removes them, with a backup first.
- **Daily add-on monitor:** a GitHub Action checks every add-on the wizard installs and opens an issue if one goes down.
- **Posters with ratings:** free PostersPlus styles (no key, with live preview), RPDB with your own key, or your own pattern (private PostersPlus, Pictorium…).
- **Nuvio quality badges:** a short guide to add a community Fusion badge pack.
- **Optional MDBList key** for watch tracking and MDBList search in AIOMetadata.
- **Nuvio collections your way:** choose which home collections and folders to install, and in what order.
- **Simkl and MyAnimeList (optional):** your lists as home rows in AIOMetadata, like Trakt.
- **Trakt (optional):** one-click Trakt connect for your Stremio account (auto-detected), plus Trakt Up Next and Watchlist rows in AIOMetadata with a validated Token ID.
- **Light and dark theme:** follows your system by default, or pick one (saved in your browser).
- **Beginner's guide** in [English](https://wizard.stremio-nuvio.workers.dev/guide.html) and [Spanish](https://wizard.stremio-nuvio.workers.dev/guia.html).

## How it works

- `public/` is the static front end (served by Cloudflare Workers Static Assets).
- `core.js` holds all wizard logic; `worker.js` exposes it as a Cloudflare Worker and `server.js` as a plain Node server.
- **Stateless:** the server keeps no data. Each backup is encrypted (AES-256-GCM) with a server-side key and handed back to *your* browser, which sends it back when you apply or restore. Backups expire after 30 days.
- Per-IP rate limiting protects the sign-in endpoints.

## Deploy on Cloudflare Workers

```bash
npm install
npx wrangler secret put BACKUP_KEY     # 32 random bytes in base64, e.g. `openssl rand -base64 32`
npm run deploy
```

Local development: put `BACKUP_KEY=...` in `.dev.vars` and run `npm run dev`.

## Self-hosting with Node

Requirements: Node.js 20+.

```bash
npm start            # http://127.0.0.1:8787
```

`PORT` and `HOST` are optional. The backup key is read from `BACKUP_KEY` or generated in `data/wizard.key` on first run (never commit it). Put HTTPS in front of it.

## Privacy

Passwords are used once to sign in and never stored. The server stores nothing; encrypted backups live in your browser and expire after 30 days. Full details: [PRIVACY.md](PRIVACY.md).

## Contributing

Bug reports and ideas are welcome in [Issues](https://github.com/maniac75/stremio-nuvio-wizard/issues). Please never paste passwords, auth keys, Debrid keys or add-on URLs that contain them.

## Support

If the wizard saved you time, you can support it on [Ko-fi](https://ko-fi.com/supermaniac) or [GitHub Sponsors](https://github.com/sponsors/maniac75). Thank you!

## License

[MIT](LICENSE). Stremio and Nuvio names and logos belong to their respective owners and are used only to identify the apps.

---

## En español

Asistente paso a paso para configurar **Stremio** y **Nuvio**: conecta tu cuenta, crea un respaldo verificado, elige complementos, revisa los cambios y aplica. Proyecto **no oficial** y sin relación con Stremio ni Nuvio; no aloja ni enlaza contenido, sólo configura complementos de terceros en tu propia cuenta.

- Úsalo en <https://wizard.stremio-nuvio.workers.dev> o sigue la [guía para principiantes](https://wizard.stremio-nuvio.workers.dev/guia.html).
- Tu contraseña no se guarda y el servidor no guarda nada: los respaldos quedan cifrados en tu navegador y vencen a los 30 días ([detalle](PRIVACY.md)).
- Errores y sugerencias en [Issues](https://github.com/maniac75/stremio-nuvio-wizard/issues), sin pegar claves ni contraseñas.
- ¿Te sirvió? Apóyalo en [Ko-fi](https://ko-fi.com/supermaniac) o [GitHub Sponsors](https://github.com/sponsors/maniac75).
