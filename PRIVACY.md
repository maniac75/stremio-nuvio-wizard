# Privacy

*Español abajo.*

This describes the public instance at <https://wizard.stremio-nuvio.workers.dev>. If you self-host, you are the operator.

- **Email and password.** Sent over HTTPS to the wizard server only to sign in to Stremio or Nuvio. They are used once and not stored.
- **Access token.** Kept in server memory only while a request runs. If you tick "Remember account", the token is stored in your browser's `localStorage` (obfuscated, not protected against anyone who can use that browser). Use it only on a personal device; "Forget saved account" removes it.
- **Backups.** Before any change, the wizard stores a backup of your add-on list on the server, encrypted with AES-256-GCM. Up to 12 per account, automatically deleted after 30 days. Add-on URLs can embed API keys (for example Debrid keys), so backups may contain them. Backups are named with a short hash of your email, not the email itself.
- **New AIOStreams credentials** created by the wizard are shown to you once and not stored.
- **Logs.** Error messages are printed to the server console and not stored. For Stremio↔Nuvio copies, a short activity record with a hashed account ID is written to disk. Passwords, tokens and keys are never written to disk outside the encrypted backups.
- **No analytics, ads or third-party trackers.**
- **Third parties.** Your requests reach Stremio, Nuvio, AIOStreams, AIOMetadata and the add-ons you choose, under their own policies.

To have your backups deleted earlier, open an issue without personal data and the operator will contact you, or simply wait 30 days.

---

## Privacidad (español)

- **Correo y contraseña:** viajan por HTTPS al servidor del wizard sólo para iniciar sesión en Stremio o Nuvio. Se usan una vez y no se guardan.
- **Token de acceso:** sólo en memoria mientras dura la solicitud. Si marcas «Recordar cuenta», queda en el `localStorage` de tu navegador (ofuscado, sin protección frente a quien use ese navegador). Úsalo sólo en un equipo personal.
- **Respaldos:** se guardan cifrados (AES-256-GCM) en el servidor, máximo 12 por cuenta, y se borran solos a los 30 días. Pueden contener URLs de complementos con claves Debrid.
- **Credenciales nuevas de AIOStreams:** se muestran una vez y no se guardan.
- **Registros:** los errores se muestran en la consola del servidor y no se guardan. En copias entre apps se escribe un registro breve con un identificador de cuenta en hash. Contraseñas, tokens y claves nunca se escriben en disco fuera de los respaldos cifrados.
- **Sin analítica, publicidad ni rastreadores.**
