# Privacidad

Esta edición incorpora la base completa de clientes dentro del APK para que funcione sin una importación inicial.

- Mantén el repositorio de GitHub **privado**.
- No compartas `app/src/main/assets/site/index.html` públicamente: contiene datos de clientes.
- No subas copias JSON exportadas, notas comerciales ni la clave privada de firma.
- La app guarda los cambios en los datos privados de Android.
- CartoCiudad recibe calle/población para geocodificación cuando el usuario solicita recalcular.
- OSRM recibe coordenadas para la matriz viaria.
- NIF, teléfonos, correos, notas e historial no se envían a CartoCiudad/OSRM.
- Google Maps, teléfono y correo se abren únicamente tras una acción del usuario.
- Desinstalar o borrar los datos de la app elimina la información local; usa copias de seguridad.
