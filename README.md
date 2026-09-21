# MDS Visitas · Android

Aplicación Android para tus visitas comerciales, con las fichas completas al pulsar un cliente, historial editable y guardado local. Este proyecto convierte la versión móvil suministrada en un APK, sin publicar una web y sin incluir la base privada en el código.

## Generar el APK en GitHub

### 1. Crea el repositorio

Crea un repositorio **privado** en GitHub, por ejemplo `mds-visitas-android`.

### 2. Añade la firma privada una sola vez

En el repositorio, entra en **Settings → Secrets and variables → Actions → New repository secret**.

- **Name:** `MDS_ANDROID_SIGNING`
- **Secret:** abre el archivo **MDS_Firma_Privada.txt** entregado aparte, copia **todo su contenido** y pégalo aquí. No hay que descodificarlo, cambiarlo ni escribir otras contraseñas.

Pulsa **Add secret**. Conserva el archivo original en un lugar privado. No lo subas como un archivo del repositorio y no lo pegues en un issue, comentario o registro de ejecución.

Esta firma se reutiliza para que los nuevos APK puedan actualizar la misma aplicación. `FIRMA_PUBLICA.txt` contiene solo la huella pública de comprobación, no la clave.

**Sin este secreto también se genera un APK, pero será `MDS-Visitas-PRUEBAS.apk`.** Esa edición usa un identificador separado, no sustituye la edición de trabajo y su firma puede cambiar entre compilaciones. No la uses como copia única de tus datos. Para uso diario añade el secreto y vuelve a ejecutar el flujo.

### 3. Sube el contenido del proyecto, no el ZIP

Descomprime el ZIP del proyecto. En GitHub pulsa **Add file → Upload files** y arrastra **todo el contenido descomprimido**.

En la raíz del repositorio deben quedar directamente:

```text
.github/workflows/android-apk.yml
app/
scripts/
tests/
build.gradle
settings.gradle
gradle.properties
version.properties
README.md
```

Incluye también `.gitignore`, `.gitattributes` y los documentos. **La carpeta `.github` es imprescindible.** No debe quedar dentro de otra carpeta como `proyecto/.github`, ni debe subirse únicamente el archivo ZIP.

Pulsa **Commit changes**. No subas `CLIENTES_MDS.json`, copias de seguridad o el archivo de firma.

### 4. Descarga el resultado

Entra en **Actions → Generar APK Android → ejecución más reciente**.

La compilación arranca con cada subida de cambios a una rama. También puedes iniciarla desde **Run workflow** cuando el flujo ya esté en la rama principal. Si GitHub pide habilitar Actions, actívalo para este repositorio.

Cuando la ejecución termine en verde, abre **Artifacts → MDS-Visitas-APK**. Descarga y extrae ese ZIP. Dentro aparecerán:

```text
MDS-Visitas.apk
INSTALAR.txt
SHA256.txt
```

También hay un botón de descarga en el resumen de la ejecución. Los artefactos de este proyecto se conservan durante **30 días**, sujetos a la configuración y límites de tu cuenta; conserva tu APK descargado. No confundas el ZIP de código con el ZIP que contiene el APK.

### 5. Instala y carga los clientes

Pasa `MDS-Visitas.apk` y `CLIENTES_MDS.json` a tu teléfono Android. Abre el APK. Si Android lo solicita, permite a esa aplicación de archivos o navegador instalar esta aplicación; no es necesario desactivar Play Protect. Al terminar puedes retirar ese permiso de instalación.

Abre **MDS Visitas → Cargar mis clientes** y selecciona `CLIENTES_MDS.json`. La base se importa **una sola vez en ese móvil**. También admite una copia JSON de esta app. Para una copia antigua que solo incluya avances y no la base, importa primero los clientes y después restaura la copia.

**El APK y el repositorio no contienen tus 335 fichas privadas.** El archivo se lee en el móvil y no se sube a GitHub ni a un servidor. Las anotaciones añadidas en tu copia anterior no pueden recuperarse de este proyecto: exporta tus avances desde aquella copia y restáuralos en Android.

## Uso diario

En **Mi jornada**, toca un cliente para abrir su ficha completa. En la ficha puedes **Añadir información**, **Editar datos** y registrar una visita. Las notas se añaden al historial con fecha. Los borradores se guardan mientras escribes; confirma los cambios con el botón Guardar correspondiente.

En **Herramientas → Copia de seguridad**, Android abre su selector de guardado. Elige una carpeta y confirma. La aplicación solo avisa de copia guardada cuando Android termina la escritura. Cancelar el selector no borra los datos ni se presenta como una copia completada.

Google Maps, llamadas, correo y fuentes públicas se abren con las aplicaciones externas del teléfono. No se realiza ninguna llamada ni se envía un correo sin tu intervención.

La aplicación y los datos locales pueden consultarse y editarse sin Internet. Recalcular rutas, buscar direcciones y utilizar los servicios de mapas requiere conexión. La lógica y las advertencias de las jornadas del archivo anterior se conservan: **convertir a APK no valida las direcciones ni convierte el borrador en una ruta óptima verificada**.

## Actualizar sin perder datos

Conserva **el mismo repositorio, secreto de firma e identificador** `com.grupomds.visitas`. Sube la actualización; GitHub genera otro APK con un código de versión mayor. Instálalo encima de la app existente, **sin desinstalar primero**.

Exporta una copia JSON antes de actualizar. No cambies ni regeneres la firma entre versiones. La edición de pruebas es otra aplicación (`com.grupomds.visitas.pruebas`) y no comparte datos: para pasar de pruebas a producción, exporta e importa.

Si trasladas el proyecto a otro repositorio, conserva el secreto y ajusta `versionCodeBase` para que el nuevo código de versión supere al del APK ya instalado.

## Dónde se guarda la información

El APK incorpora los archivos de la aplicación. La base editable se guarda en IndexedDB y en un respaldo nativo con escritura atómica dentro de **los datos privados de Android**, no solo en la caché temporal. El respaldo nativo se recupera al abrir la app si es más reciente.

No se usa un servidor de clientes ni se sincroniza entre comerciales. Cada teléfono mantiene su copia. El proyecto desactiva las copias automáticas del sistema para estos datos; usa la exportación manual. Desinstalar o borrar los datos de la aplicación elimina la información local. Los JSON exportados contienen información privada sin cifrar: protégelos y no los subas al repositorio.

## Requisitos y compilación

Android **8.0 o posterior** con Android System WebView actualizado. El proyecto usa Java 17, Gradle 8.11.1, Android Gradle Plugin 8.9.2, SDK/Build Tools 35 y AndroidX WebKit 1.12.1, con versiones fijadas por compatibilidad.

**No necesitas Android Studio en tu ordenador para el flujo de GitHub.** El runner instala las herramientas. Este paquete no incluye el binario de Gradle Wrapper: el flujo usa el Gradle instalado mediante `setup-gradle`. Con las herramientas instaladas localmente, puedes ejecutar:

```sh
bash scripts/check.sh
gradle :app:assembleDebug
```

Para compilar release localmente debes proporcionar `MDS_KEYSTORE_PATH`, `MDS_KEYSTORE_PASSWORD` y `MDS_KEY_ALIAS`. El script de GitHub ya lo hace desde el único secreto.

El flujo no crea Releases ni publica en Google Play: deja el APK como artefacto descargable. La instalación desde APK es para Android, no iPhone.

## Si algo falla

| Qué ves | Qué revisar |
|---|---|
| No aparece «Generar APK Android» | Comprueba que `.github/workflows/android-apk.yml` está en la raíz y que no subiste solo un ZIP. |
| «MDS_ANDROID_SIGNING no es válido» | Copia todo el contenido original del archivo de firma, sin añadir texto ni cambiar comillas. Guarda el secreto y vuelve a ejecutar. |
| APK «PRUEBAS» | Falta el secreto. Añádelo y ejecuta de nuevo para la edición de uso diario. |
| GitHub no inicia trabajos o indica límite de uso | Revisa que Actions esté permitido y las cuotas/configuración de tu cuenta. |
| Fallo descargando Android/Gradle/dependencias | Revisa el primer paso rojo y su registro; reintenta si hubo un fallo de red. No borres los datos del móvil. |
| Android no permite actualizar | Comprueba que es la misma edición, firma y un código de versión no inferior. Exporta datos; no desinstales como primer remedio. |
| No aparecen los clientes | Pulsa «Cargar mis clientes» y selecciona tu JSON local. El APK no los incluye. |

## Estado de comprobación

Se comprobaron la sintaxis JavaScript, XML, estructura del proyecto, 29 condiciones de política de enlaces y la interfaz en Chromium con el puente Android simulado. Se probó importar las 335 fichas, abrir detalles, añadir notas, editar, cancelar/exportar y restaurar desde ese puente simulado.

**No se ha compilado el APK ni probado en un dispositivo Android en este entorno.** La compilación, el análisis Android y la verificación de firma se ejecutan realmente en tu cuenta de GitHub. El guardado del selector de archivos y el funcionamiento en tu teléfono deben verificarse allí antes de usarlo como única herramienta de trabajo.

Consulta `COMPROBACIONES.md`, `PRIVACIDAD.md` y `FUENTES_TECNICAS.md` para más detalle.


## Corrección 1.0.1 - Android Lint NewApi
Se han separado las llamadas WindowInsets de API 30+ en un método protegido por versión y se han marcado los atributos modernos del manifiesto. Lint sigue activo (`abortOnError true`); no se ha desactivado la comprobación global.
