# Privacy

*Español abajo.*

This describes the public instance at <https://wizard.stremio-nuvio.workers.dev>. If you self-host, you are the operator.

- **Email and password.** Sent over HTTPS to the wizard server only to sign in to Stremio or Nuvio. They are used once and not stored.
- **Access token.** Used only while a request runs. If you tick "Remember account", it is stored in your browser encrypted with a non-exportable key kept in IndexedDB. Use it only on a personal device; "Forget saved account" removes it.
- **Backups.** Before any change, the wizard creates a backup of your add-on list, encrypts it with AES-256-GCM using a key only the server holds, and gives it to your browser (`localStorage`, up to 8). The server keeps no copy. Backups can only be opened by this service and expire after 30 days. Add-on URLs can embed API keys (for example Debrid keys), so backups may contain them in encrypted form.
- **New AIOStreams credentials** created by the wizard are shown to you once and not stored.
- **Logs.** The server writes no files. Error messages and, for Stremio↔Nuvio copies, a short record with a hashed account ID go to the platform's request logs. Passwords, tokens and keys are never logged.
- **No analytics, ads or third-party trackers.**
- **Third parties.** Your requests reach Stremio, Nuvio, AIOStreams, AIOMetadata and the add-ons you choose, under their own policies.

There is nothing to delete on the server. To remove your backups, clear this site's data in your browser.

---

## Privacidad (español)

- **Correo y contraseña:** viajan por HTTPS al servidor del wizard sólo para iniciar sesión en Stremio o Nuvio. Se usan una vez y no se guardan.
- **Token de acceso:** si marcas «Recordar cuenta», queda en tu navegador cifrado con una clave no exportable. Úsalo sólo en un equipo personal.
- **Respaldos:** se cifran (AES-256-GCM) con una clave que sólo tiene el servidor y se guardan en tu navegador, no en el servidor. Sólo este servicio puede abrirlos y vencen a los 30 días.
- **Credenciales nuevas de AIOStreams:** se muestran una vez y no se guardan.
- **Registros:** el servidor no escribe archivos. Errores y copias entre apps quedan en los registros de la plataforma con un identificador de cuenta en hash. Nunca contraseñas, tokens ni claves.
- **Sin analítica, publicidad ni rastreadores.**
