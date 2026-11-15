# Stremio & Nuvio Wizard

A step-by-step setup wizard for **Stremio** and **Nuvio**: connect your account, take a verified backup, pick add-ons, review every change, then apply. Built for Spanish-speaking users (UI in Spanish and English).

**Live:** <https://wizard.stremio-nuvio.workers.dev> · **Beginner guide (ES):** <https://wizard.stremio-nuvio.workers.dev/guia.html>

[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/supermaniac)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-support-EA4AAA?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/maniac75)

> **Unofficial project.** Not affiliated with Stremio, Nuvio, AIOStreams or any add-on author. The wizard does not host, index or link to any media; it only edits the add-on list of *your own* account. You are responsible for how you use third-party add-ons in your country.

## Features

- **Safe by default:** a verified, encrypted backup is required before any change, and the wizard refuses to apply if the account changed since that backup. Failed applies roll back.
- **Review before apply:** shows what will be added, replaced or removed, and lets you keep your own add-ons.
- **AIOStreams + AIOMetadata** set up with sensible Spanish/Latin American defaults, optional Debrid (TorBox, Real-Debrid, AllDebrid, Premiumize, Debrid-Link, EasyDebrid) with "cached only" mode.
- **Subtitles and trailers:** SubSense, OpenSubtitles PRO, Streailer.
- **Copy between apps:** Stremio → Nuvio and Nuvio → Stremio, reusing the same AIOStreams instance.
- **Restore** any previous backup or an exported JSON.

## Self-hosting

Requirements: Node.js 20+. No dependencies.

```bash
git clone https://github.com/maniac75/stremio-nuvio-wizard.git
cd stremio-nuvio-wizard
npm start            # http://127.0.0.1:8787
```

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address (keep it local and put HTTPS in front) |
| `BACKUP_RETENTION_DAYS` | `30` | Backups older than this are deleted automatically |

On first run the server creates `data/wizard.key` (backup encryption key) and `data/backups/`. Never commit or share them.

Expose it with any HTTPS reverse proxy or tunnel. An optional Cloudflare Worker proxy is in `cloudflare-worker/`:

```bash
cd cloudflare-worker
npx wrangler secret put ORIGIN   # your HTTPS origin, e.g. https://wizard.example.com
npx wrangler deploy
```

## Privacy

Passwords are used once to sign in and never stored. Backups are encrypted and deleted after 30 days. Full details: [PRIVACY.md](PRIVACY.md).

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
- Tu contraseña no se guarda. Los respaldos se cifran y se borran a los 30 días ([detalle](PRIVACY.md)).
- Errores y sugerencias en [Issues](https://github.com/maniac75/stremio-nuvio-wizard/issues), sin pegar claves ni contraseñas.
- ¿Te sirvió? Apóyalo en [Ko-fi](https://ko-fi.com/supermaniac) o [GitHub Sponsors](https://github.com/sponsors/maniac75).
