# Privacy

*Español abajo.*

This describes the public instance at <https://wizard.stremio-nuvio.workers.dev>. If you self-host, you are the operator.

- **Email and password.** Sent over HTTPS to the wizard server only to sign in to Stremio or Nuvio. They are used once and not stored.
- **Access token.** Used only while a request runs. If you tick "Remember account", it is stored in your browser encrypted with a non-exportable key kept in IndexedDB. Use it only on a personal device; "Forget saved account" removes it.
- **Remember my keys (optional).** If you tick it, your service keys are stored in your browser encrypted with the same non-exportable key as "Remember account". Anyone using that browser can reuse them, so use it only on a personal device; "Forget saved keys" removes them.
- **Backups.** Before any change, the wizard creates a backup of your add-on list, encrypts it with AES-256-GCM using a key only the server holds, and gives it to your browser (`localStorage`, up to 8). The server keeps no copy. Backups can only be opened by this service and expire after 30 days. Add-on URLs can embed API keys (for example Debrid keys), so backups may contain them in encrypted form.
- **Service keys and passwords** (Debrid keys, Easynews username and password, Gemini, TMDB, MDBList…) go only into the AIOStreams and AIOMetadata configurations created for you. If you turn on Subtitle Sync, your OpenSubtitles API key, username and password (and, with TorBox, your TorBox key and AIOStreams link) are sent to Subtitle Sync (subtitlesync.stream) to create your addon link. The wizard does not store them.
- **New AIOStreams credentials** created by the wizard are shown to you once and not stored.
- **Logs.** The server writes no files. Error messages and, for Stremio↔Nuvio copies, a short record with a hashed account ID go to the platform's request logs. Passwords, tokens and keys are never logged.
- **Anonymous step counters.** For each wizard step the logs record only the step name, the app (Stremio or Nuvio), the country (two-letter code, no city), whether it worked, how long it took and a generic error type (for example "auth" or "timeout"). No email, account, IP, key or error text. They are used to find where setups fail and are kept only as long as the platform's logs (a few days).
- **No analytics cookies, ads or third-party trackers.**
- **Third parties.** Your requests reach Stremio, Nuvio, AIOStreams, AIOMetadata and the add-ons you choose, under their own policies.
- **PostersPlus (only if you pick it).** Your apps load poster images from postersplus.elfhosted.com, which receives the title's IMDb ID, like any image host.
- **Watchly (only if you tick it).** To build recommendations, the wizard sends Watchly (watchly.elfhosted.com, open source, run by ElfHosted) your Stremio session key or, in Nuvio, your Nuvio session for the chosen profile, plus your content language. Watchly keeps that access to read your watch history, under its own policy. Your password is never sent. You can revoke it by changing your password or signing out of all sessions in the app.

There is nothing to delete on the server. To remove your backups, clear this site's data in your browser.

---

## Privacidad (español)

- **Correo y contraseña:** viajan por HTTPS al servidor del wizard sólo para iniciar sesión en Stremio o Nuvio. Se usan una vez y no se guardan.
- **Token de acceso:** si marcas «Recordar cuenta», queda en tu navegador cifrado con una clave no exportable. Úsalo sólo en un equipo personal.
- **Recordar mis claves (opcional):** si lo marcas, tus claves quedan en el navegador cifradas con la misma llave no exportable de «Recordar cuenta». Quien use ese navegador podrá reutilizarlas: úsalo sólo en un equipo personal. «Olvidar claves guardadas» las borra.
- **Respaldos:** se cifran (AES-256-GCM) con una clave que sólo tiene el servidor y se guardan en tu navegador, no en el servidor. Sólo este servicio puede abrirlos y vencen a los 30 días.
- **Claves y contraseñas de servicios** (Debrid, usuario y contraseña de Easynews, Gemini, TMDB, MDBList…): van sólo a las configuraciones de AIOStreams y AIOMetadata que se crean para ti. Si activas Subtitle Sync, tu API key, usuario y contraseña de OpenSubtitles (y, con TorBox, tu clave de TorBox y tu enlace de AIOStreams) se envían a Subtitle Sync (subtitlesync.stream) para crear tu enlace del complemento. El wizard no las guarda.
- **Credenciales nuevas de AIOStreams:** se muestran una vez y no se guardan.
- **Registros:** el servidor no escribe archivos. Errores y copias entre apps quedan en los registros de la plataforma con un identificador de cuenta en hash. Nunca contraseñas, tokens ni claves.
- **Contadores anónimos por paso:** de cada paso se registra sólo su nombre, la app (Stremio o Nuvio), el país (código de dos letras, sin ciudad), si funcionó, cuánto tardó y un tipo de error genérico (por ejemplo «auth» o «timeout»). Sin correo, cuenta, IP, claves ni el texto del error. Sirven para encontrar dónde fallan las configuraciones y duran lo que duran los registros de la plataforma (unos días).
- **Sin cookies de analítica, publicidad ni rastreadores.**
- **PostersPlus (sólo si lo eliges):** tus apps cargan los pósteres desde postersplus.elfhosted.com, que recibe el ID de IMDb del título, como cualquier servidor de imágenes.
- **Watchly (sólo si lo marcas):** para crear recomendaciones, el wizard le envía a Watchly (watchly.elfhosted.com, código abierto, operado por ElfHosted) la clave de sesión de Stremio o, en Nuvio, la sesión del perfil elegido, más el idioma del contenido. Watchly conserva ese acceso para leer tu historial, según su propia política. Tu contraseña nunca se envía. Puedes revocarlo cambiando la contraseña o cerrando todas las sesiones en la app.
