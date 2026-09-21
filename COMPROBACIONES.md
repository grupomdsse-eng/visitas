# Comprobaciones de esta entrega

## Resultado y límites

Esta entrega es un **proyecto fuente**, no un APK ya compilado. No se dispone aquí del SDK Android ni de un dispositivo Android. La primera compilación completa, el análisis Lint y la verificación del APK firmado se ejecutarán en GitHub Actions al subir el proyecto.

## Comprobado en este entorno

- Estructura Android y archivos necesarios; XML bien formado; identificadores HTML únicos.
- Sintaxis de `app.js` mediante `node --check`.
- Compilación Java de la política independiente de Android (`SecurityPolicy.java`) y **29 aserciones** de enlaces y nombres de exportación. Esto **no** compila `MainActivity` ni el resto del APK.
- Workflow YAML analizado: ejecución por cambios y manual, runner Ubuntu, permisos de lectura, entrega del APK como artefacto.
- Firma privada PKCS12 creada y comprobada con `keytool`. Pruebas del script con secreto válido, secreto ausente (edición de pruebas) y secreto incorrecto (error explícito).
- No hay claves privadas, contraseñas de firma, clientes ni avances personales incorporados en el proyecto para subir a GitHub.
- Interfaz en Chromium a 390 × 844 píxeles, sin desbordamiento horizontal ni errores JavaScript en las pruebas.

### Pruebas funcionales de interfaz

El puente Android se **simuló** en Chromium. El documento se cargó en memoria y la política CSP se revisó estructuralmente, no con ejecución desde el origen real de Android.

1. Inicio sin clientes y pantalla de importación.
2. Importación de las 335 fichas del archivo aportado y primera jornada de 15.
3. Apertura de la ficha completa al tocar el cliente.
4. Anotación añadida al historial con fecha y envío al adaptador de guardado.
5. Edición de contacto y horario, conservada y visible en la ficha.
6. Consulta y edición con la red del navegador desactivada después de cargar la interfaz.
7. Exportación JSON mediante el adaptador nativo simulado, incluyendo historial.
8. Cancelación de la exportación sin marcar una copia como realizada.
9. Recuperación desde el respaldo nativo simulado con almacenamiento web nuevo.
10. Ausencia de errores JavaScript y de desbordamiento horizontal en móvil.

Las pruebas usaron los datos aportados solo localmente. No se incluyen datos de prueba privados ni cambios de prueba en el repositorio o en el JSON original.

## Pendiente de comprobar en Android real

- Compilación completa, resolución de dependencias y resultado de Lint.
- Instalación del APK y actualización sobre otra versión con la misma firma.
- IndexedDB y respaldo `AtomicFile` con procesos Android reales, incluido cierre forzado y reapertura.
- Selectores reales de importación y exportación; permisos por documento y cancelación.
- Navegación externa con Google Maps, correo y teléfono instalados en el móvil.
- Botón Atrás, teclado, rotación e insets en versiones Android concretas.
- Uso tras reinicio del móvil sin conexión; límites reales de almacenamiento.

## Prueba de aceptación antes de uso diario

Instala el APK, importa los datos, abre una ficha y añade una nota de prueba. Cierra y vuelve a abrir la aplicación para comprobar que sigue allí. Activa modo avión y repite la consulta y edición. Exporta una copia JSON a una carpeta conocida y comprueba que está disponible. Conserva una copia externa antes de cualquier actualización.

La conversión a Android no realiza una nueva validación de clientes ni una nueva optimización de rutas. Se conservan los datos y avisos del proyecto anterior.

## Corrección v1.0.2
- `android:windowLightNavigationBar` se ha retirado de `res/values/styles.xml` porque requiere API 27.
- El atributo se define ahora exclusivamente en `res/values-v27/styles.xml`.
- Se mantiene `minSdk 26`; Android 8.0 usa el tema base y Android 8.1+ usa el recurso v27.
