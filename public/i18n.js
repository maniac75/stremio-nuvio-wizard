// Wizard interface translations. Content language (#language) is independent.
(function(){
  'use strict';
  var entries = `
Pelis necesita tu propia API de TMDB para instalarse. Selecciona «Usar mi propia clave» en TMDB e ingrésala para habilitarlo.	Pelis needs your own TMDB API key to install. Select "Use my own key" under TMDB and enter it to enable Pelis.
Especializado en castellano. Requiere TorBox o AllDebrid; el wizard crea su configuración.	Specialized in Spanish from Spain. Requires TorBox or AllDebrid; the wizard creates its configuration.
Idioma de la página	Page language
Volver al inicio	Back to start
Guía para principiantes ↗	Beginner’s guide ↗
Configura Stremio o Nuvio paso a paso, con respaldo y revisión antes de aplicar.	Set up Stremio or Nuvio step by step, with a backup and a review before applying changes.
Debridio en AIOStreams	Debridio in AIOStreams
API key de Debridio	Debridio API key
Activa Debridio y Watchtower dentro de AIOStreams si ingresas una clave. Sirve igual para Stremio y Nuvio.	Enter a key to enable Debridio and Watchtower inside AIOStreams. Works with Stremio and Nuvio.
Obtener API key de Debridio	Get a Debridio API key
Creado por	Created by
Cuenta	Account
Respaldo	Backup
Preferencias	Preferences
Complementos	Addons
Revisar	Review
¿Dónde quieres instalar los complementos?	Where would you like to install the addons?
Elige la app que quieres configurar. Stremio y Nuvio guardan sus complementos por separado.	Choose the app to configure. Stremio and Nuvio store their addons separately.
Perfil de Nuvio	Nuvio profile
Se detectará al conectar	Detected when you connect
Si hay varios perfiles, elige cuál vas a configurar antes de crear el respaldo.	If you have several profiles, choose the one to configure before making a backup.
Correo electrónico	Email address
Contraseña	Password
o	or
Pega aquí la AuthKey	Paste your AuthKey here
¿Cómo obtener la AuthKey?	How do I get an AuthKey?
Abre	Open
, inicia sesión y en la consola del navegador ejecuta:	, sign in, and run this in your browser console:
Recordar cuenta en este navegador	Remember account in this browser
Guarda tu token de acceso en este navegador para reconectar automáticamente. Úsalo sólo en un equipo personal.	Stores your access token in this browser to reconnect automatically. Use it only on a personal device.
Conectar cuenta	Connect account
Olvidar cuenta guardada	Forget saved account
Continuar al respaldo →	Continue to backup →
2 · Respalda tu cuenta	2 · Back up your account
PASO NECESARIO PARA CONTINUAR	REQUIRED STEP TO CONTINUE
Pulsa «Crear backup seguro».	Click “Create secure backup”.
El wizard guardará y verificará la lista actual de complementos. Después se activará aquí mismo «Continuar a preferencias».	The wizard will save and verify your current addon list. Then “Continue to preferences” will become available here.
Crear backup seguro	Create secure backup
Continuar a preferencias →	Continue to preferences →
Agregar copia de los ajustes del AIO anterior (opcional)	Add a copy of your previous AIO settings (optional)
Exportación JSON de AIOStreams	AIOStreams JSON export
Puedes adjuntarla si ya la tienes. No hace falta para seguir. Guárdala en privado: puede contener claves.	Attach it if you already have it. It is not required to continue. Keep it private: it may contain keys.
Opcional: restaurar una copia anterior	Optional: restore a previous backup
Restaurar reemplaza los complementos actuales. Usa estas opciones sólo si quieres volver a una configuración anterior.	Restoring replaces the current addons. Only use this to return to a previous setup.
Restaurar desde JSON	Restore from JSON
Restaurar backup anterior	Restore previous backup
Ordenar addons y elegir catálogos	Reorder addons and choose catalogs
Los botones suben o bajan addons. Desmarcar un catálogo lo quita de Inicio y Descubrir; puedes recuperarlo restaurando el backup.	Use the buttons to move addons up or down. Unchecking a catalog removes it from Home and Discover; you can restore it from the backup.
Guardar orden y catálogos	Save order and catalogs
← Volver a la cuenta	← Back to account
3 · Tus preferencias	3 · Your preferences
El nuevo AIOStreams se instalará en Midnight nightly. La URL anterior queda en el respaldo.	A new AIOStreams will be installed on Midnight nightly. The previous URL is saved in the backup.
Configuración AIOStreams	AIOStreams setup
Configuración recomendada	Recommended setup
Configuración predeterminada de Tamtaro	Tamtaro default setup
La recomendada ya incluye filtros y orden de resultados. La de Tamtaro conserva los ajustes de su plantilla actual. Ambas crean un AIO nuevo sin cambiar el anterior.	The recommended setup includes filters and result sorting. Tamtaro keeps the settings from its current template. Both create a new AIO without changing the old one.
Idioma principal	Content language
Español Latino	Latin American Spanish
Español España	Spanish (Spain)
Preferencias adicionales de contenido	Additional content preferences
Seleccionar todos	Select all
Borrar selección	Clear selection
Perfil Kids	Kids profile
Catálogos infantiles y filtro de edad más estricto en AIOMetadata.	Kids catalogs and a stricter age filter in AIOMetadata.
Anime / Kitsu	Anime / Kitsu
Agrega Kitsu para catálogos, metadata y búsquedas de anime.	Adds Kitsu for anime catalogs, metadata, and search.
Añade canales de TV en vivo de Argentina como addon separado.	Adds live Argentine TV channels as a separate addon.
Quitar 4K	Remove 4K
Oculta resultados 2160p/4K para ahorrar ancho de banda o usar equipos más modestos.	Hides 2160p/4K results to save bandwidth or use less powerful devices.
Sólo cached	Cached only
Muestra sólo archivos ya disponibles en el Debrid; evita esperar descargas nuevas.	Shows only files already cached by your Debrid service; avoids waiting for new downloads.
Quitar WatchHub	Remove WatchHub
Elimina el addon oficial de enlaces a servicios comerciales; no afecta tu biblioteca.	Removes the official addon linking to commercial streaming services; your library is unaffected.
Fuentes de streaming	Streaming sources
Tengo Debrid	I have Debrid
No tengo Debrid	I don't have Debrid
Modo gratuito.	Free mode.
AIOStreams usará fuentes HTTP y P2P compatibles, sin exigir una cuenta Debrid. Algunas fuentes P2P dependen de seeders y pueden exponer tu IP a otros peers.	AIOStreams will use compatible HTTP and P2P sources without requiring a Debrid account. Some P2P sources depend on seeders and may expose your IP to other peers.
Puedes usar uno o varios servicios Debrid al mismo tiempo.	You can use one or several Debrid services at once.
+ Agregar servicio	+ Add service
← Volver al respaldo	← Back to backup
Continuar a complementos →	Continue to addons →
4 · Fichas y pósteres	4 · Metadata and posters
RECOMENDADO	RECOMMENDED
OPCIONAL	OPTIONAL
OPCIONAL VISUAL	VISUAL OPTION
Clave integrada de AIOMetadata	Built-in AIOMetadata key
Usar mi propia clave	Use my own key
Mi API key v3 o Read Access Token v4 de TMDB	My TMDB API key v3 or Read Access Token v4
Obtener API key ↗	Get API key ↗
Mi API key de TVDB	My TVDB API key
Información de TVDB ↗	TVDB information ↗
Sin posters RPDB	No RPDB posters
Mi API key de RPDB	My RPDB API key
TMDB y TVDB pueden usar las claves internas de la instancia, sin mostrarlas ni guardarlas en el wizard. RPDB requiere una clave propia para activar sus posters.	TMDB and TVDB can use the instance keys without showing or storing them in the wizard. RPDB requires your own key to enable its posters.
Complementos para añadir	Addons to add
Modo gratuito activo.	Free mode active.
AIOStreams ya se configurará con fuentes HTTP/P2P. Aquí sólo quedan disponibles complementos standalone que también funcionan sin Debrid.	AIOStreams will already be configured with HTTP/P2P sources. Only standalone addons that also work without Debrid remain available here.
Trailers y resúmenes de temporada en el idioma elegido.	Trailers and season recaps in your chosen language.
Busca subtítulos en varias fuentes y los reúne en un solo addon.	Searches several subtitle sources and combines them in one addon.
Segundo proveedor de subtítulos para ampliar cobertura y servir de respaldo.	A second subtitle provider for broader coverage and backup.
Store por Debrid	Debrid store
Catálogo para explorar lo que ya tienes guardado en cada servicio Debrid.	A catalog to explore files already saved in each Debrid service.
AIOStreams reúne las fuentes principales. Aquí puedes sumar subtítulos, tráileres y otras opciones. AIOMetadata se instala siempre.	AIOStreams brings together the main sources. Add subtitles, trailers, and other options here. AIOMetadata is always installed.
Complementos en español (opcional)	Spanish-language addons (optional)
Estas opciones aparecen en la guía de	These options appear in the
. Se configuran automáticamente cuando es posible.	guide. They are configured automatically when possible.
RECOMENDADO ES	RECOMMENDED FOR SPANISH
Muy útil para castellano. El wizard lo configura en español, excluye 3D/VHS/Screener y usa tu Debrid.	Useful for Spanish-language content. The wizard sets it to Spanish, excludes 3D/VHS/Screener, and uses your Debrid.
Versión de Comet enfocada en contenido hispano; prioriza español y puede usar Debrid o P2P según el modo elegido.	A Comet version focused on Spanish-language content; prioritizes Spanish and can use Debrid or P2P depending on the selected mode.
Fuentes HTTP. Se configura con CineHDplus y VerHDlink como recomienda la guía.	HTTP sources. Configured with CineHDplus and VerHDlink as the guide recommends.
SI VES ANIME	IF YOU WATCH ANIME
AnimeFLV, AnimeAV1, TioAnime, AnimeJara, JKAnime y más, con catálogos y streams.	AnimeFLV, AnimeAV1, TioAnime, AnimeJara, JKAnime, and more, with catalogs and streams.
OPCIONAL CASTELLANO	OPTIONAL SPANISH
Especializado en castellano. Requiere TMDB y TorBox o AllDebrid; el wizard crea su configuración.	Focused on Spanish-language content. Requires TMDB and TorBox or AllDebrid; the wizard builds its configuration.
Útil para contenido antiguo en español de España. Automatizado con TorBox o AllDebrid.	Useful for older content in Spanish from Spain. Automated with TorBox or AllDebrid.
Fuentes adicionales y opciones avanzadas	Additional sources and advanced options
Se instalan por separado. La mayoría ya está incluida en AIOStreams, por eso vienen desactivados. Puedes activarlos si quieres otra fuente directa.	Installed separately. Most are already included in AIOStreams, so they are off by default. Turn them on if you want another direct source.
GUÍA ES	SPANISH GUIDE
NO NECESARIO CON AIO	NOT NEEDED WITH AIO
YA INCLUIDO EN AIO	ALREADY IN AIO
NO RECOMENDADO CON DEBRID	NOT RECOMMENDED WITH DEBRID
Fuente directa adicional; AIOStreams ya consulta Torrentio.	An extra direct source; AIOStreams already queries Torrentio.
Rápido y compatible con Debrid o P2P; AIO ya lo integra.	Fast and compatible with Debrid or P2P; AIO already includes it.
Buena alternativa, pero ya forma parte del AIO.	A good alternative, but already part of AIO.
Fuentes HTTP útiles para nicho; AIO ya las consulta.	Useful niche HTTP sources; AIO already queries them.
Fuentes HTTP adicionales, pero Sootio ya está dentro del AIO.	Additional HTTP sources, but Sootio is already in AIO.
HD/4K con TorBox; AIO ya lo consulta.	HD/4K with TorBox; AIO already queries it.
P2P directo. Con Debrid normalmente sólo agrega ruido y exposición innecesaria.	Direct P2P. With Debrid, it usually only adds noise and unnecessary exposure.
Indexadores adicionales; puede aportar resultados raros que AIO no encuentre.	Extra indexers that may find uncommon results AIO misses.
Otra base de torrents; útil como redundancia.	Another torrent database; useful as a fallback.
AIOStreams ya usa STorz; con Debrid usa tus servicios y en modo gratuito usa P2P.	AIOStreams already uses STorz; with Debrid it uses your services, and in free mode it uses P2P.
Muy completo; puede usar Debrid o fuentes P2P, pero AIO ya lo integra.	Comprehensive; it can use Debrid or P2P sources, but AIO already includes it.
Agregar un complemento por URL (opcional)	Add an addon by URL (optional)
Una URL	One URL
por línea	per line
Validar URLs	Validate URLs
Guardar o importar opciones para otra cuenta	Save or import options for another account
Exporta las selecciones del wizard sin contraseñas, claves Debrid ni URL privadas. Al importar tendrás que ingresar las claves y URLs personalizadas de esa cuenta.	Exports your wizard choices without passwords, Debrid keys, or private URLs. When importing, enter the keys and custom URLs for the new account.
Descargar perfil sin claves	Download profile without keys
Importar perfil	Import profile
← Volver a preferencias	← Back to preferences
Continuar a revisión →	Continue to review →
5 · Revisa y aplica los cambios	5 · Review and apply changes
← Modificar opciones	← Change options
Actualizar el plan	Refresh plan
Confirmo el respaldo y el plan mostrado	I confirm the backup and the plan shown
Aplicar en Stremio	Apply to Stremio
Aplicar en Nuvio	Apply to Nuvio
Actualizar sólo AIO	Update AIO only
Privacidad y seguridad	Privacy and security
Tu correo y contraseña pasan por el servidor del wizard sólo para iniciar sesión en Stremio o Nuvio y no se guardan. Si eliges «Recordar cuenta», el token de acceso queda en este navegador: úsalo sólo en un equipo personal. Los respaldos se guardan cifrados (AES-256-GCM) en el servidor, máximo 12 por cuenta, y se borran a los 30 días; pueden incluir URLs de complementos con tus claves Debrid. Las credenciales nuevas de AIO no se guardan. Antes de aplicar cambios se verifica el respaldo.	Your email and password pass through the wizard server only to sign in to Stremio or Nuvio and are not stored. If you choose “Remember account”, the access token stays in this browser: use it only on a personal device. Backups are stored encrypted (AES-256-GCM) on the server, up to 12 per account, and deleted after 30 days; they may include add-on URLs containing your Debrid keys. New AIO credentials are not stored. The backup is verified before any change is applied.
Proyecto independiente y no oficial, sin relación con Stremio ni Nuvio. El wizard no aloja ni enlaza contenido: sólo configura complementos de terceros en tu cuenta.	Independent, unofficial project, not affiliated with Stremio or Nuvio. The wizard does not host or link to any content: it only configures third-party add-ons in your account.
¿Te sirvió? Apoya el proyecto:	Found it useful? Support the project:
Código fuente	Source code
Continuar →	Continue →
Abrir opciones  ▾	Open options  ▾
Ocultar opciones  ▴	Hide options  ▴
¿Quieres instalar lo mismo en Nuvio?	Would you like to install the same setup in Nuvio?
¿Quieres instalar lo mismo en Stremio?	Would you like to install the same setup in Stremio?
Se copiarán las URL instaladas, incluido el mismo AIOStreams. Primero conectaremos y respaldaremos la segunda cuenta. No se creará otro AIO.	The installed URLs, including the same AIOStreams, will be copied. First we will connect and back up the second account. No new AIO will be created.
Sí, instalar también en Nuvio	Yes, install in Nuvio too
Sí, instalar también en Stremio	Yes, install in Stremio too
Correo de Nuvio	Nuvio email
Correo de Stremio	Stremio email
Contraseña de Nuvio	Nuvio password
Contraseña de Stremio	Stremio password
AuthKey de Stremio (opcional, en vez de contraseña)	Stremio AuthKey (optional, instead of a password)
Perfil de Nuvio	Nuvio profile
Conectar segunda cuenta	Connect second account
Crear respaldo y revisar	Create backup and review
Cuenta conectada. Ahora crea el respaldo y revisa el plan para Nuvio.	Account connected. Back up and review the Nuvio plan.
Cuenta conectada. Ahora crea el respaldo y revisa el plan para Stremio.	Account connected. Back up and review the Stremio plan.
Revisa el cambio antes de aplicarlo. La primera cuenta permanecerá intacta.	Review the change before applying. The first account will remain untouched.
Descargar lista de Nuvio	Download Nuvio addon list
Descargar lista de Stremio	Download Stremio addon list
Comprobar si ya quedó instalado	Check whether it is already installed
Comprobando…	Checking…
Copiar cuentas	Copy accounts
Cerrar ✕	Close ✕
Copiar a la otra cuenta	Copy to the other account
Usa la lista de una cuenta para configurar la otra. El mismo AIOStreams se conserva; antes de aplicar se guarda un respaldo de destino.	Use one account’s addon list to set up the other. The same AIOStreams is kept; a backup of the destination is saved before applying.
Primero conecta la cuenta de origen en el paso 1. Después podrás comprobar o copiar sus complementos sin repetir la instalación de AIOStreams.	First connect the source account in step 1. Then check or copy its addons without installing AIOStreams again.
Nuvio omite Cinemeta y Streailer: por eso puede mostrar dos complementos menos que Stremio.	Nuvio omits Cinemeta and Streailer, so it may show two fewer addons than Stremio.
Copiar Stremio ↔ Nuvio	Copy Stremio ↔ Nuvio
¿También usas la otra app?	Do you also use the other app?
Copia tu configuración de complementos entre Stremio y Nuvio sin volver a instalar todo desde cero. El wizard respalda primero la cuenta de destino y reutiliza el mismo AIOStreams.	Copy your addon setup between Stremio and Nuvio without reinstalling everything from scratch. The wizard backs up the destination account first and reuses the same AIOStreams.
Copiar configuración entre Stremio y Nuvio	Copy setup between Stremio and Nuvio
Esta herramienta replica en una app la lista de complementos que ya tienes en la otra. La cuenta conectada en el paso 1 será el origen; la otra cuenta será el destino.	This tool replicates the addon list from one app to the other. The account connected in step 1 is the source; the other account is the destination.
Stremio → Nuvio	Stremio → Nuvio
Nuvio → Stremio	Nuvio → Stremio
Copia los complementos de Stremio a Nuvio y reutiliza exactamente el mismo AIOStreams. Cinemeta y Streailer se omiten porque Nuvio no los usa.	Copies your Stremio addons to Nuvio and reuses the exact same AIOStreams. Cinemeta and Streailer are omitted because Nuvio does not use them.
Copia los complementos de Nuvio a Stremio y conserva Cinemeta y Streailer si ya estaban instalados en Stremio.	Copies your Nuvio addons to Stremio and keeps Cinemeta and Streailer if they were already installed in Stremio.
Protección:	Protection:
antes de cambiar la cuenta de destino, el wizard crea y verifica un respaldo de esa cuenta. La cuenta de origen nunca se modifica. Si la copia falla, intenta restaurar el destino.	before changing the destination account, the wizard creates and verifies a backup of it. The source account is never modified. If copying fails, it attempts to restore the destination.
Primero elige el origen.	Choose the source first.
En el paso 1 conecta la cuenta de Stremio o Nuvio cuya configuración quieres copiar. Después vuelve aquí: el wizard detectará automáticamente el sentido de la copia y te pedirá la cuenta de destino.	In step 1, connect the Stremio or Nuvio account whose setup you want to copy. Then return here: the wizard will automatically detect the direction and ask for the destination account.
Origen:	Source:
Destino:	Destination:
Adaptación para Nuvio:	Nuvio adaptation:
Cinemeta y Streailer no se copian porque Nuvio no los utiliza. El resto, incluido AIOStreams, conserva sus mismas URL.	Cinemeta and Streailer are not copied because Nuvio does not use them. Everything else, including AIOStreams, keeps the same URLs.
Adaptación para Stremio:	Stremio adaptation:
se copian los complementos de Nuvio y se conservan Cinemeta y Streailer si ya estaban instalados en Stremio.	Nuvio addons are copied and Cinemeta and Streailer are kept if they were already installed in Stremio.
Cómo funciona	How it works
Revisa cuántos complementos se reemplazarán y confirma el plan.	Review how many addons will be replaced and confirm the plan.
Confirmar plan para aplicar	Confirm plan to apply
Aplicación donde instalar	App to configure
AuthKey de Stremio	Stremio AuthKey
Stremio & Nuvio Wizard · creado por supermaniac75 · 2026	Stremio & Nuvio Wizard · created by supermaniac75 · 2026
`;
  var exact = new Map(entries.trim().split('\n').map(function(line){
    var cut=line.indexOf('\t');return [line.slice(0,cut),line.slice(cut+1)];
  }));
  var dynamic = `
Acceso directo ✓	Direct access ✓
Wizard sin conexión	Wizard offline
AIO destino offline	Target AIO offline
Este paso no cambia tus complementos.	This step does not change your addons.
Ingresa tu correo y contraseña de Stremio.	Enter your Stremio email and password.
Usa el correo y la contraseña de tu cuenta Nuvio. Al conectar aún no se modifica nada.	Use your Nuvio email and password. Connecting does not change anything yet.
No se pudo recuperar la cuenta guardada. Conéctala de nuevo.	Could not restore the saved account. Connect again.
Guardaremos tus complementos y sus URL antes de instalar un AIOStreams nuevo. El AIO anterior no se modificará.	We will save your addons and URLs before installing a new AIOStreams. The previous AIO will not be changed.
Guardaremos tus complementos y sus URL antes de instalar un AIOStreams nuevo. El AIO anterior no se modificará; puedes añadir una copia de sus ajustes si ya tienes la exportación.	We will save your addons and URLs before installing a new AIOStreams. The previous AIO will not be changed; you may attach its settings if you already have an export.
Guardaremos tus complementos y después instalaremos AIOStreams. No necesitas una exportación JSON.	We will save your addons and then install AIOStreams. You do not need a JSON export.
Comprobando clave…	Checking key…
ⓘ No se pudo comprobar la clave ahora. Puedes continuar y revisar después.	ⓘ Could not check this key right now. You can continue and review it later.
Procesando…	Processing…
Conectando…	Connecting…
No se pudo guardar la cuenta en este navegador.	Could not save this account in this browser.
email + contraseña	email + password
Siguiente paso obligatorio: crear o restaurar un backup.	Required next step: create or restore a backup.
Cuenta conectada. Revisa tus complementos y continúa al respaldo.	Account connected. Review your addons and continue to the backup.
Cuenta conectada.	Account connected.
Si la sesión guardada venció, vuelve a conectar la cuenta.	If your saved session expired, connect again.
Creando y verificando…	Creating and verifying…
Rehacer backup	Create backup again
RESPALDO VERIFICADO ✓	BACKUP VERIFIED ✓
Ya puedes pulsar «Continuar a preferencias» aquí mismo.	You can now click “Continue to preferences” here.
Tus complementos y sus URL quedaron guardados y verificados. El AIO anterior no se modificó.	Your addons and URLs were saved and verified. The previous AIO was not changed.
✓ COPIA CREADA Y VERIFICADA	✓ BACKUP CREATED AND VERIFIED
RESPALDO PENDIENTE	BACKUP PENDING
Se instalará un AIO nuevo y el anterior permanecerá intacto.	A new AIO will be installed; the previous one stays unchanged.
Se instalará un AIO nuevo; el anterior no se modificará.	A new AIO will be installed; the previous one will not be changed.
Puedes continuar con tus preferencias.	You can continue to preferences.
Copia verificada ✓. Ya puedes configurar.	Backup verified ✓. You can continue.
No se habilitó la configuración: 	Setup was not enabled: 
Instalación nueva	New installation
No disponible	Unavailable
No se pudo crear el respaldo. Revisa el mensaje de error y vuelve a pulsar «Crear backup seguro».	Could not create the backup. Check the error and click “Create secure backup” again.
No hay URLs para validar.	There are no URLs to validate.
Validando…	Validating…
No se pudo copiar	Could not copy
URL copiada ✓	URL copied ✓
Copiar URL	Copy URL
Subir	Move up
Bajar	Move down
Catálogos	Catalogs
Quitar	Remove
Servicio	Service
Esperando para comprobar…	Waiting to check…
Cambiaste opciones: revisa nuevamente el plan.	Options changed: review the plan again.
Cambiaste la autenticación. Conecta nuevamente la cuenta.	Authentication changed. Connect the account again.
Ingresa tu correo y contraseña de Nuvio.	Enter your Nuvio email and password.
Ingresa email + contraseña o pega una AuthKey.	Enter email + password or paste an AuthKey.
La instancia no ofrece todas las claves compartidas ahora. Para los servicios no disponibles, usa una clave propia.	The instance does not offer all shared keys right now. Use your own key for unavailable services.
Primero crea y verifica el backup obligatorio.	First create and verify the required backup.
Agrega al menos un Debrid con su API key.	Add at least one Debrid service and its API key.
Agrega al menos un Debrid con su API key o elige «No tengo Debrid».	Add at least one Debrid service and its API key, or choose “I don't have Debrid”.
Modo gratuito: AIOStreams usará fuentes HTTP/P2P compatibles y no configurará ningún servicio Debrid.	Free mode: AIOStreams will use compatible HTTP/P2P sources and will not configure any Debrid service.
Modo gratuito activo: se usarán fuentes HTTP/P2P compatibles.	Free mode active: compatible HTTP/P2P sources will be used.
Ingresa la API key de tu servicio Debrid o elige «No tengo Debrid».	Enter your Debrid service API key or choose “I don't have Debrid”.
Cambiaste el modo de streaming: revisa nuevamente el plan.	Streaming mode changed: review the plan again.
Perfil importado en modo gratuito. Revisa tus opciones y URLs personales antes de continuar.	Profile imported in free mode. Review your options and personal URLs before continuing.
Revisando…	Reviewing…
Corrige las claves marcadas antes de revisar el plan.	Correct the marked keys before reviewing the plan.
REEMPLAZAR	REPLACE
ELIMINAR	REMOVE
AGREGAR	ADD
ID REPETIDO	DUPLICATE ID
ID REPETIDO · ELIGE UNO	DUPLICATE ID · CHOOSE ONE
AGREGAR AL PERFIL	ADD TO PROFILE
Plan revisado. Puedes configurar cuando estés conforme.	Plan reviewed. You can apply it when ready.
Backup no válido. Crea uno nuevo antes de configurar.	Invalid backup. Create a new one before applying changes.
Primero revisa el plan final.	Review the final plan first.
Configurando…	Configuring…
Aplicando cambios. No cierres esta pestaña.	Applying changes. Do not close this tab.
Ver detalles de la instalación	View installation details
Descargar UUID y contraseña AIO	Download AIO UUID and password
Descargar lista y URL de complementos	Download addon list and URLs
Ver complementos instalados	View installed addons
Configuración aplicada. Tu backup anterior sigue disponible para restaurar.	Configuration applied. Your previous backup is still available for restoration.
Cuenta olvidada en este navegador. Puedes conectarte con otra cuenta.	Saved account removed from this browser. You can connect a different account.
Guardando…	Saving…
Orden y catálogos verificados. Crea un backup nuevo para seguir.	Order and catalogs verified. Create a new backup to continue.
Perfil importado. Revisa nuevamente el plan.	Profile imported. Review the plan again.
Perfil importado. Ingresa tus claves Debrid y URLs personales antes de revisar.	Profile imported. Enter your Debrid keys and personal URLs before reviewing.
El archivo de perfil es demasiado grande.	The profile file is too large.
Formato de perfil no reconocido.	Unrecognized profile format.
Ingresa la API key de tu servicio Debrid para continuar.	Enter your Debrid service API key to continue.
Completa o elimina las filas Debrid sin API key.	Complete or remove Debrid rows without an API key.
Hay servicios Debrid repetidos. Conserva una sola fila por servicio.	Duplicate Debrid services. Keep just one row per service.
Comprobando las claves Debrid…	Checking Debrid keys…
Corrige la clave indicada antes de continuar.	Correct the indicated key before continuing.
No hay AIO instalado	No AIO installed
no hay AIO instalado	no AIO installed
configuración interna respaldada	internal settings backed up
sin configuración interna respaldada	internal settings not backed up
queda intacto; su URL está respaldada, pero sus ajustes internos no están disponibles	left untouched; its URL is backed up, but its internal settings are unavailable
URL respaldada; ajustes internos no disponibles	URL backed up; internal settings unavailable
no confirmada	not confirmed
sin respuesta	no response
Puedes guardar nombres y URL para reinstalarlos manualmente. Las URL pueden incluir claves privadas.	You can save names and URLs to reinstall addons manually. URLs may contain private keys.
Descargar lista de addons y URL	Download addon list and URLs
ID de addon repetido	Duplicate addon ID
. Revisa las variantes antes de conservarlas.	. Review the variants before keeping them.
No disponible	Unavailable
Descargar copia JSON	Download JSON backup
Guárdala en privado: puede contener URLs configuradas con tokens.	Keep it private: it may contain configured URLs with tokens.
Tu lista de complementos está respaldada. Para actualizar el AIO existente, adjunta su exportación JSON y crea otra copia.	Your addon list is backed up. To update the existing AIO, attach its JSON export and make another backup.
ajustes respaldados	settings backed up
exportación adjunta	export attached
lectura de la instancia	read from instance
ajustes internos pendientes de respaldo	internal settings still need a backup
El AIO actual requiere la contraseña original o su exportación JSON para actualizarlo.	The current AIO requires its original password or JSON export for an update.
La exportación AIO supera 900 KB.	The AIO export is over 900 KB.
La exportación AIO no es un JSON válido.	The AIO export is not valid JSON.
El servidor no confirmó la verificación	The server did not confirm verification
El archivo no tiene el formato de backup de Stremio/Bootstrapper.	This file is not a Stremio/Bootstrapper backup.
¿Restaurar exactamente el backup anterior?	Restore the exact previous backup?
Restaurando…	Restoring…
Crea un nuevo backup para continuar.	Create a new backup to continue.
La configuración interna AIO está en la exportación descargable y debe importarse en AIOStreams.	The internal AIO settings are in the downloadable export and must be imported into AIOStreams.
El backup no contiene configuración interna AIO.	The backup does not contain internal AIO settings.
Descargar configuración AIO anterior	Download previous AIO configuration
→ Se instalará otro AIO en Midnight y la URL anterior quedará en el respaldo.	→ Another AIO will be installed on Midnight; the old URL stays in the backup.
→ No se puede actualizar esta instancia desde el wizard. Elige cambiar.	→ This instance cannot be updated from the wizard. Choose a different instance.
→ Se instalará en la instancia recomendada; la URL anterior quedará en el respaldo.	→ The recommended instance will be used; the old URL stays in the backup.
 (AIO nuevo; el anterior no se modifica y su URL queda respaldada).	 (new AIO; the previous one is unchanged and its URL is backed up).
 (se actualiza la instalación existente).	 (the existing installation is updated).
 (nueva instalación).	 (new installation).
AIO nuevo: se aplicará el perfil seleccionado desde cero.	New AIO: the selected setup will be applied from scratch.
Comparación detallada AIO no disponible: adjunta su exportación en el backup.	Detailed AIO comparison is unavailable: attach its export to the backup.
Addons actuales fuera del perfil: elige cuáles agregar	Current addons outside this setup: choose which ones to add
La instalación parte con una lista limpia. Marca solamente los complementos actuales que quieras volver a agregar; conservarán su URL y configuración. Si hay variantes con el mismo ID, elige sólo una.	The installation starts with a clean list. Select only existing addons you want to add again; their URLs and settings will be kept. Choose one variant per addon ID.
AIO ya tiene este perfil; no hubo cambios.	AIO already has this setup; no changes were made.
Cambió el manifiesto: actualiza o reinstala sólo AIO en Stremio para que reconozca los nuevos catálogos o recursos.	The manifest changed: update or reinstall only AIO in Stremio so it recognizes the new catalogs or resources.
No cambió el manifiesto: no necesitas reinstalar.	The manifest did not change: no reinstall is needed.
Push completado. Revisa nuevamente antes de enviar otros cambios.	Push complete. Review the plan again before sending other changes.
correcta	correct
en línea	online
configuración predeterminada de Tamtaro	Tamtaro default setup
configuración recomendada	recommended setup
Guarda el UUID y la contraseña	Save the UUID and password
Guarda esta clave para editar AIOStreams	Save this key to edit AIOStreams
Estas son las credenciales de administración del AIOStreams que acaba de crear el wizard. Las necesitarás para volver a entrar y cambiar su configuración más adelante.	These are the administrator credentials for the AIOStreams instance the wizard just created. You will need them to sign in again and change its settings later.
UUID de AIOStreams	AIOStreams UUID
Clave de edición / contraseña	Editing key / password
Copiar UUID	Copy UUID
Copiar clave	Copy key
Copiar ambos	Copy both
Importante:	Important:
el wizard no guarda esta contraseña en el servidor ni en sus backups. Se mantiene sólo durante esta sesión y en el JSON que descargues.	the wizard does not store this password on the server or in its backups. It is only kept during this session and in the JSON file you download.
Antes de cerrar o recargar esta página, guárdala en un gestor de contraseñas o en otro lugar seguro.	Before closing or reloading this page, save it in a password manager or another secure location.
Descargar JSON con credenciales AIO	Download AIO credentials JSON
El JSON contiene otra copia del UUID, la clave de edición y la URL de instalación de AIOStreams. Guárdalo también en privado.	The JSON contains another copy of the UUID, editing key, and AIOStreams installation URL. Keep it private as well.
no guarda esta clave de AIOStreams	does not store this AIOStreams key
UUID copiado ✓	UUID copied ✓
Clave copiada ✓	Key copied ✓
Credenciales copiadas ✓	Credentials copied ✓
El orden cambió. Crea un nuevo backup antes de configurar.	The order changed. Create a new backup before applying the setup.
Se instalará otro AIO en Midnight; el anterior no se modificará y su URL está en el respaldo.	Another AIO will be installed on Midnight; the previous one will not be changed, and its URL is in the backup.
Se actualiza el AIO en su instancia actual.	AIO is updated on its current instance.
Se cambiará a Midnight nightly si está en otra instancia.	It will switch to Midnight nightly if it is on another instance.
Se configurará AIOMetadata; si su clave TMDB compartida falla, se conservará la instalación actual.	AIOMetadata will be configured; if its shared TMDB key fails, the current installation will be kept.
Se conserva Cinemeta en la versión base del wizard.	Cinemeta is kept in the wizard's base setup.
Se reinstala con el idioma elegido.	Reinstalled with your chosen language.
Streailer está desactivado en el formulario.	Streailer is turned off in the form.
SubSense está desactivado en el formulario.	SubSense is turned off in the form.
Se reinstala con la configuración elegida.	Reinstalled with your chosen setup.
OpenSubtitles PRO está desactivado.	OpenSubtitles PRO is turned off.
Anime Kitsu seguirá instalado.	Anime Kitsu will remain installed.
Anime está desactivado.	Anime is turned off.
Argentina TV seguirá instalado.	Argentina TV will remain installed.
TV en vivo está desactivada.	Live TV is turned off.
Se recrea según los Debrid seleccionados.	Recreated for the selected Debrid services.
Stores están desactivados.	Stores are turned off.
WatchHub está marcado para eliminar.	WatchHub is marked for removal.
Addon ajeno al wizard: tú decides si conservarlo.	Addon outside the wizard: you decide whether to keep it.
Ver cambios automáticos	View automatic changes
El AIO anterior no se modificó.	The previous AIO was not changed.
El AIO anterior no se modificará.	The previous AIO will not be changed.
El AIO anterior queda intacto.	The previous AIO stays unchanged.
El servidor no confirmó la verificación	The server did not confirm verification
No se pudo actualizar AIO	Could not update AIO
Ingresa una clave válida.	Enter a valid key.
No hay una comprobación automática fiable para este servicio. Revisa que la clave esté completa.	No reliable automatic check is available for this service. Make sure the key is complete.
El servicio no pudo responder ahora. Prueba de nuevo más tarde.	The service could not respond right now. Try again later.
TVDB no aceptó esta API key.	TVDB did not accept this API key.
TorBox no aceptó esta API key.	TorBox did not accept this API key.
No se pudo comprobar ahora. Comprueba la clave en el sitio del servicio.	Could not verify this key right now. Check it on the service website.
`;
  dynamic.trim().split('\n').forEach(function(line){var cut=line.indexOf('\t');exact.set(line.slice(0,cut),line.slice(cut+1));});
  var reverse=new Map(Array.from(exact,function(pair){return [pair[1],pair[0]];}));
  window.wizardOriginal=function(input){
    var match=String(input).match(/^(\s*)([\s\S]*?)(\s*)$/);
    return match[1]+(reverse.get(match[2])||match[2])+match[3];
  };
  var checkPatterns = [
    [/^Verificado: (.*?) ya tiene los (\d+) complementos esperados y usa el mismo AIOStreams\.$/,'Verified: $1 already has all $2 expected addons and uses the same AIOStreams.'],
    [/^Aún no coincide: (.*?) tiene (\d+) complementos; se esperan (\d+)\. Puedes respaldar y revisar antes de aplicar\.$/,'Not yet a match: $1 has $2 addons; $3 are expected. You can back up and review before applying.'],
    [/^No se pudo comprobar: (.*)$/,'Could not check: $1']
  ];
  var patterns = [
    [/^1 · Conecta tu cuenta (.*)$/,'1 · Connect your $1 account'],
    [/^Addons actuales: (.*)$/,'Current addons: $1'],
    [/^Clave verificada con (.*?)\.$/,'Key verified with $1.'],
    [/^La clave fue rechazada por (.*?)\.$/,'The key was rejected by $1.'],
    [/^Complementos instalados \((.*)\)$/,'Installed addons ($1)'],
    [/^Ver complementos instalados \((.*)\)$/,'View installed addons ($1)'],
    [/^Backups cifrados anteriores: (.*)$/,'Previous encrypted backups: $1'],
    [/^Perfil a aplicar: (.*)$/,'Setup to apply: $1'],
    [/^AIO anterior: (.*)$/,'Previous AIO: $1'],
    [/^AIOStreams detectado en otra instancia \((.*)\)$/,'AIOStreams found on another instance ($1)'],
    [/^AIOStreams detectado en (.*)$/,'AIOStreams found on $1'],
    [/^Servicios AIO actuales: (.*)$/,'Current AIO services: $1'],
    [/^AIOStreams no detectado → se creará uno nuevo\.$/,'No AIOStreams found → a new one will be created.'],
    [/^Instancia AIO: (.*)$/,'AIO instance: $1'],
    [/^Ver cambios automáticos \((.*)\)$/,'View automatic changes ($1)'],
    [/^Verificación (.*)$/,'$1 verification'],
    [/^Addons protegidos: (.*)$/,'Addons protected: $1'],
    [/^Respaldo verificado\. (.*)$/,'Backup verified. $1'],
    [/^← Volver (.*)$/,'← Back $1'],
    [/^No se aplicó completamente: (.*)\. El backup verificado sigue disponible\.$/,'Could not fully apply the setup: $1. The verified backup is still available.'],
    [/^No se aplicó completamente: (.*)$/,'Could not fully apply the setup: $1'],
    [/^Elige la cuenta de (.*?) y vuelve a conectar\.$/,'Choose your $1 account and connect again.'],
    [/^Comprueba qué se añadirá, reemplazará o conservará antes de cambiar (.*)\.$/,'Review what will be added, replaced, or kept before changing $1.'],
    [/^Aplicar en (.*)$/,'Apply to $1'],
    [/^Copia de seguridad: (.*)$/,'Backup: $1'],
    [/^AIOStreams: (.*)$/,'AIOStreams: $1'],
    [/^AIOMetadata: (.*)$/,'AIOMetadata: $1'],
    [/^¡Lo lograste! (.*) está configurado$/,'You did it! $1 is set up'],
    [/^Se instalaron (\d+) complementos: (\d+) configurados por el wizard y (\d+) conservados\. La colección quedó verificada en tu cuenta\.$/,'Installed $1 addons: $2 configured by the wizard and $3 kept. Your account was verified.'],
    [/^(.*?) está seleccionado y se actualizará con la configuración del wizard\.$/,'$1 is selected and will be updated with the wizard settings.'],
    [/^No se pudo guardar la colección en (.*): (.*)$/,'Could not save the addon list in $1: $2'],
    [/^No se pudo verificar la colección en (.*): (.*)$/,'Could not verify the addon list in $1: $2'],
    [/^No se pudo guardar la colección en (.*)$/,'Could not save the addon collection in $1'],
    [/^ del archivo privado: los necesitarás para entrar a este AIOStreams y cambiar su configuración más adelante\. Para reinstalar los demás complementos, conserva también la lista de URL\. El respaldo de (.*?) permite restaurar la colección anterior\.$/,' in the private file: you will need them to access this AIOStreams and change its setup later. Keep the URL list to reinstall the other addons. The $1 backup can restore the previous collection.'],
    [/^Guarda la lista de URL para reinstalar los complementos más adelante\. El respaldo de (.*?) permite restaurar la colección anterior\.$/,'Save the URL list to reinstall addons later. The $1 backup can restore the previous collection.'],
    [/^La colección instalada no coincide con el plan; se restaurará la anterior$/,'The installed addon list does not match the plan; the previous list will be restored'],
    [/^AIO destino (.*)$/,'Target AIO $1'],
    [/^Creado: (.*)$/,'Created: $1'],
    [/^Se creará un AIO nuevo y se reemplazará su entrada en Stremio\. Puedes abrir «Ver cambios automáticos» para revisar cada complemento; la URL anterior queda en el respaldo\.$/,'A new AIO will be created and replace its Stremio entry. Open “View automatic changes” to review each addon; the old URL remains in the backup.'],
    [/^Se creará un AIO nuevo y se reemplazará su entrada en tu perfil de Nuvio\. Puedes abrir «Ver cambios automáticos» para revisar cada complemento; la URL anterior queda en el respaldo\.$/,'A new AIO will be created and replace its entry in your Nuvio profile. Open “View automatic changes” to review each addon; the old URL remains in the backup.']
  ];
  patterns.unshift(...checkPatterns);
  patterns.push(
    [/^Ingresa el acceso de (.*)\.$/,'Enter your $1 credentials.'],
    [/^No se pudo conectar: (.*)$/,'Could not connect: $1'],
    [/^No se completó la instalación en (.*): (.*)$/,'Could not finish installing in $1: $2'],
    [/^Copiar (Stremio|Nuvio) → (Stremio|Nuvio)$/,'Copy $1 → $2'],
    [/^la cuenta de (Stremio|Nuvio) que ya conectaste\.$/,'the $1 account you already connected.'],
    [/^la cuenta de (Stremio|Nuvio) que conectarás aquí\. Al aplicar, la lista de complementos de (Stremio|Nuvio) se reemplazará por una copia compatible de (Stremio|Nuvio)\.$/,'the $1 account you will connect here. When applied, the $2 addon list will be replaced with a compatible copy from $3.'],
    [/^Conecta tu cuenta de (Stremio|Nuvio)\.$/,'Connect your $1 account.'],
    [/^El wizard crea y verifica un respaldo de (Stremio|Nuvio) antes de modificarla\.$/,'The wizard creates and verifies a $1 backup before changing it.'],
    [/^Aplica la copia\. (Stremio|Nuvio) permanece intacto y ambas apps usarán el mismo AIOStreams\.$/,'Apply the copy. $1 remains unchanged and both apps will use the same AIOStreams.'],
    [/^Preparar copia a (Stremio|Nuvio)$/,'Prepare copy to $1'],
    [/^Conectar cuenta de (Stremio|Nuvio)$/,'Connect $1 account'],
    [/^Comparar con (Stremio|Nuvio)$/,'Compare with $1'],
    [/^Respaldar (Stremio|Nuvio) y revisar$/,'Back up $1 and review'],
    [/^(Stremio|Nuvio) conectado\. Ahora respalda (Stremio|Nuvio) y revisa exactamente qué se copiará desde (Stremio|Nuvio)\.$/,'$1 connected. Now back up $2 and review exactly what will be copied from $3.'],
    [/^Respaldo de (Stremio|Nuvio) creado y verificado\.$/,'$1 backup created and verified.'],
    [/^Al aplicar, (Stremio|Nuvio) reemplazará su lista actual \((\d+) complementos\) por (\d+) complementos copiados desde (Stremio|Nuvio)\. Se reutilizará exactamente la misma instancia de AIOStreams\.$/,'When applied, $1 will replace its current list ($2 addons) with $3 addons copied from $4. The exact same AIOStreams instance will be reused.'],
    [/^(Stremio|Nuvio) no se modificará\.$/,'$1 will not be modified.'],
    [/^Revisa el cambio antes de aplicarlo\. Sólo se modificará (Stremio|Nuvio); (Stremio|Nuvio) permanecerá intacto\.$/,'Review the change before applying it. Only $1 will be modified; $2 will remain unchanged.'],
    [/^¿Copiar la configuración de (Stremio|Nuvio) a (Stremio|Nuvio)\? Se reemplazará la lista de (Stremio|Nuvio); su respaldo ya está guardado y (Stremio|Nuvio) no se modificará\.$/,'Copy the setup from $1 to $2? The $3 list will be replaced; its backup is already saved and $4 will not be modified.'],
    [/^Copia completada: (Stremio|Nuvio) → (Stremio|Nuvio)\. (Stremio|Nuvio) tiene (\d+) complementos verificados y utiliza el mismo AIOStreams\. (Stremio|Nuvio) quedó intacto\. Respaldo de (Stremio|Nuvio): (.*)\.$/,'Copy complete: $1 → $2. $3 has $4 verified addons and uses the same AIOStreams. $5 remained unchanged. $6 backup: $7.'],
    [/^No se pudo preparar (Stremio|Nuvio) para recibir la copia: (.*)$/,'Could not prepare $1 to receive the copy: $2']
  );  patterns.push(
    [/^Backup verificado y plan revisado\. ¿Aplicar la configuración a (.*?)\?$/,'Backup verified and plan reviewed. Apply the setup to $1?'],
    [/^¿Cambiar AIO de (.*?) a (.*?) y aplicar el plan\? El backup conservará la instalación anterior\.$/,'Switch AIO from $1 to $2 and apply the plan? The backup will keep the previous installation.'],
    [/^Esto reemplazará la colección actual por (\d+) addons del JSON\. Antes se creará un backup de seguridad\. ¿Continuar\?$/,'This will replace the current addon list with $1 addons from the JSON file. A safety backup will be created first. Continue?'],
    [/^¿Guardar el nuevo orden y los catálogos seleccionados en (.*?)\? El backup permite deshacerlo\.$/,'Save the new order and selected catalogs in $1? You can undo this using the backup.'],
    [/^¿Actualizar la configuración completa de AIOStreams en (.*?)\? Se guardará una copia antes del cambio\. La URL y los demás addons se conservarán\.$/,'Update the full AIOStreams setup on $1? A backup will be saved before the change. The URL and other addons will be kept.']
  );
  function translate(input){
    var match=String(input).match(/^(\s*)([\s\S]*?)(\s*)$/);
    var core=match[2], value=exact.get(core);
    if(value===undefined){
      value=core;
      for(var i=0;i<patterns.length;i++){
        if(patterns[i][0].test(value)){value=value.replace(patterns[i][0],patterns[i][1]);break;}
      }
    }
    return match[1]+value+match[3];
  }
  var nodeState=new WeakMap(),attrState=new WeakMap();
  var locale='es';
  var excluded='SCRIPT,STYLE,CODE,NOSCRIPT,SVG';
  function textNode(node){
    if(!node.parentElement||node.parentElement.closest(excluded))return;
    var state=nodeState.get(node);
    if(!state||node.nodeValue!==state.rendered)state={original:node.nodeValue};
    var rendered=locale==='en'?translate(state.original):state.original;
    state.rendered=rendered;nodeState.set(node,state);
    if(node.nodeValue!==rendered)node.nodeValue=rendered;
  }
  function attributes(el){
    if(el.matches('SCRIPT,STYLE,CODE,NOSCRIPT'))return;
    ['placeholder','title','aria-label'].forEach(function(name){
      if(!el.hasAttribute(name))return;
      var data=attrState.get(el)||{};
      var state=data[name];
      if(!state||el.getAttribute(name)!==state.rendered)state={original:el.getAttribute(name)};
      var rendered=locale==='en'?translate(state.original):state.original;
      data[name]={original:state.original,rendered:rendered};attrState.set(el,data);
      if(el.getAttribute(name)!==rendered)el.setAttribute(name,rendered);
    });
  }
  function scan(root){
    if(root.nodeType===3){textNode(root);return;}
    if(root.nodeType!==1 && root.nodeType!==9)return;
    if(root.nodeType===1)attributes(root);
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      var n=walker.currentNode;
      if(n.nodeType===3)textNode(n);else attributes(n);
    }
  }
  var selector=document.getElementById('uiLanguage');
  var originalConfirm=window.confirm.bind(window), originalAlert=window.alert.bind(window);
  window.confirm=function(message){return originalConfirm(locale==='en'?translate(message):message);};
  window.alert=function(message){return originalAlert(locale==='en'?translate(message):message);};
  try{locale=localStorage.getItem('stremio-wizard-ui-language')==='en'?'en':'es';}catch(_){}
  selector.value=locale;
  function setLanguage(next){
    locale=next==='en'?'en':'es';document.documentElement.lang=locale;
    try{localStorage.setItem('stremio-wizard-ui-language',locale);}catch(_){}
    scan(document.body);
    if(typeof syncFloatingNext==='function')syncFloatingNext();
  }
  selector.addEventListener('change',function(){setLanguage(this.value);});
  var home=document.getElementById('homeLink');
  home.href=location.pathname+location.hash;
  home.addEventListener('click',function(event){event.preventDefault();showWizardStep(1);window.scrollTo({top:0,behavior:'smooth'});});
  var pending=false;
  new MutationObserver(function(){
    if(pending)return;
    pending=true;
    queueMicrotask(function(){pending=false;scan(document.body);});
  }).observe(document.body,{subtree:true,childList:true,characterData:true});
  setLanguage(locale);
})();
