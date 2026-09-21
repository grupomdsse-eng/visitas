# MDS Visitas · Android 1.0.3

Aplicación Android para organizar visitas comerciales de Grupo MDS.

Esta edición incorpora **las 335 fichas de clientes dentro del APK**, junto con las jornadas ordenadas y la revisión pública de horarios realizada el 21/09/2026. La aplicación permite abrir la ficha completa, editar datos, añadir notas e historial, registrar visitas y navegar con Google Maps.

## IMPORTANTE · repositorio privado

Este proyecto contiene datos reales de clientes dentro de `app/src/main/assets/site/index.html` (contactos, direcciones y otros datos de la base). **Usa un repositorio PRIVADO.** No publiques el proyecto, no lo conviertas en público y no pegues sus archivos en issues públicos.

## Qué incluye

- 335 fichas de clientes integradas.
- 20 jornadas precalculadas. Las primeras se completan hasta 15 visitas; las últimas pueden tener menos cuando no existe una combinación segura que permita llegar a 15 dentro de los horarios conocidos.
- Horarios públicos buscados individualmente para las 335 fichas.
- 248 fichas con horario público utilizable.
- 1 ficha localizada como cerrada temporalmente.
- 86 fichas sin horario público inequívoco: se muestran como **“Horario no verificado”** y deben confirmarse antes de desplazarse.
- Direcciones públicas actualizadas cuando la evidencia era suficientemente fuerte.
- Orden inicial por horario de apertura + cercanía geográfica aproximada.
- Botón **“Optimizar carretera + horarios”**: localiza portales con CartoCiudad, obtiene una matriz de carretera con OSRM y vuelve a elegir el siguiente cliente según apertura + distancia desde la parada anterior.
- Google Maps para la navegación final.
- Guardado privado en Android, notas, historial, edición, copias de seguridad y restauración.

Los horarios públicos pueden cambiar por festivos, verano, incidencias o cambios del negocio. La app conserva fecha, fuente asociada y nivel de confianza cuando existe. Una ficha sin horario no se presenta como “abierta”.

## Generar automáticamente el APK en GitHub

### 1. Crea un repositorio privado

Por ejemplo `mds-visitas-android`.

### 2. Configura la firma

En **Settings → Secrets and variables → Actions → New repository secret**:

- Name: `MDS_ANDROID_SIGNING`
- Secret: pega el contenido completo de `MDS_Firma_Privada.txt` que ya tienes de las versiones anteriores.

No subas la clave privada al repositorio.

### 3. Sube el contenido descomprimido

En la raíz deben quedar directamente:

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

No subas únicamente el ZIP y no metas el proyecto dentro de otra carpeta.

### 4. Genera el APK

GitHub → **Actions → Generar APK Android → Run workflow**.

Cuando finalice correctamente, descarga **Artifacts → MDS-Visitas-APK**. El APK de trabajo será `MDS-Visitas.apk` cuando la firma esté configurada.

## Actualizar una instalación existente

Esta versión mantiene el identificador `com.grupomds.visitas`. Si utilizas la misma firma, instala el nuevo APK encima del anterior **sin desinstalar**.

La aplicación migra a la base integrada de 1.0.3 y conserva, por código de cliente, las notas, historial, visitas, información comercial y correcciones que ya hubieras guardado. Las jornadas se sustituyen por la nueva planificación de horarios; si has modificado manualmente direcciones o inclusión de clientes, la app lo marca para recalcular.

Haz una copia de seguridad antes de actualizar.

## Cómo se ordenan las visitas

La planificación integrada utiliza un criterio secuencial:

1. Cada nuevo día parte de la sede de C/ Aragón 1, Dos Hermanas.
2. Se estima la hora de llegada.
3. Se descartan, para ese momento, negocios cuyo horario público indica que estarían cerrados.
4. Entre los negocios visitables se prioriza el más cercano desde la ubicación anterior.
5. Si un negocio abre más tarde, se intenta visitar antes otro abierto en vez de esperar.
6. Las fichas sin horario inequívoco solo se colocan en una franja prudente y aparecen como **“confirmar antes”**.
7. Al llegar a 15 visitas se inicia una nueva jornada desde la sede.

El orden integrado usa coordenadas aproximadas por código postal para poder disponer de una planificación desde el primer arranque. Para distancia de carretera real, usa **Optimizar carretera + horarios** dentro de la app. Ese cálculo no usa tráfico en tiempo real y no constituye un óptimo matemático global: aplica el criterio solicitado de elegir secuencialmente el cliente visitable más cercano.

## Horarios y estados

Al pulsar un cliente se muestra:

- horario semanal encontrado;
- estado “abierto ahora / cerrado ahora / horario no verificado”;
- nivel de confianza del horario;
- fecha de comprobación;
- negocio/fuente asociada y enlace para volver a comprobar el horario en Google;
- datos completos del cliente, dirección original, revisión, contacto, teléfono, correo, NIF/CIF, notas e historial.

En **Clientes** puedes filtrar por:

- con horario público;
- horario por confirmar;
- cerrado temporalmente;
- incluidos en planificación;
- apartados;
- dirección actualizada.

## Privacidad y almacenamiento

Los datos se guardan en el almacenamiento privado de la aplicación Android y en su base local. No existe sincronización automática entre teléfonos.

El cálculo de rutas envía únicamente direcciones a CartoCiudad y coordenadas a OSRM. No envía NIF, teléfonos, correos ni notas a esos servicios. Google Maps se abre de forma externa cuando tú pulsas navegar.

Borrar los datos de Android o desinstalar la aplicación elimina los avances locales. Conserva copias JSON periódicas.

## Compatibilidad

- Android 8.0 (API 26) o posterior.
- Java 17.
- compileSdk / targetSdk 35.
- Lint permanece activo con `abortOnError true`.
- `windowLightNavigationBar` está aislado en `values-v27` para mantener compatibilidad con API 26.

## Comprobación local

```sh
bash scripts/check.sh
```

La compilación real Android y el análisis Lint se ejecutan en GitHub Actions.
