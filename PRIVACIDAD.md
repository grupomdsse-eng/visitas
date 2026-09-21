# Datos y permisos

La base de clientes no está dentro del repositorio ni dentro del APK. Se importa desde un archivo seleccionado por el usuario. La única dirección presente por defecto es la sede de salida del proyecto.

La app almacena información en el área privada de Android, más IndexedDB y el respaldo local del motor WebView. No se afirma cifrado propio de la base: su protección depende de la seguridad y bloqueo del dispositivo. No hay cuenta, backend, analítica, anuncios ni sincronización automática.

Permisos declarados: Internet y estado de la conexión. La app no solicita acceso general a almacenamiento, contactos, cámara, SMS ni ubicación. Para importar/exportar se usa el selector de documentos de Android, que concede acceso al documento elegido. Las llamadas utilizan el marcador, no un permiso para llamar automáticamente.

El WebView solo muestra recursos locales del APK. Los sitios externos, Google Maps, teléfono y correo se delegan en aplicaciones del teléfono. Se bloquean esquemas `javascript:`, `file:`, `content:` e `intent:` como destinos navegables. Se usa CSP para bloquear frames y scripts externos; el puente nativo solo se utiliza desde la página empaquetada. Las conexiones de cálculo se limitan a CartoCiudad y OSRM, tras la confirmación del usuario, conservando el comportamiento del original.

Al calcular se envían direcciones y poblaciones a CartoCiudad y coordenadas a OSRM. Al abrir un enlace de Google Maps se transmite el destino a Google. Esto no incluye NIF, notas ni toda la base. Esos servicios externos tienen sus propias condiciones y disponibilidad.

Las copias manuales se guardan donde tú selecciones. Seleccionar un proveedor de nube en el selector puede subir el archivo a ese proveedor. Un JSON de copia contiene información privada sin cifrar. No se debe publicar. El borrado de datos/desinstalación elimina la copia local; guarda respaldos fuera de la app.

La firma privada suministrada permite firmar actualizaciones. Trátala como credencial: guárdala únicamente como secreto de GitHub y en una copia privada, no en archivos del repositorio. Limita el acceso al repositorio y a la configuración de Actions. No compartas el archivo de firma con los comerciales; ellos solo necesitan el APK y sus datos de trabajo.
