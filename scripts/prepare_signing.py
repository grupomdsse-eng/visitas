#!/usr/bin/env python3
"""Unpacks ONE repository secret without committing any signing material."""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys

def append_env(key, value):
    if '\n' in value or '\r' in value:
        raise ValueError('Formato no permitido en la firma')
    with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as f:
        f.write(f'{key}={value}\n')

def main():
    secret = os.environ.get('MDS_ANDROID_SIGNING', '').strip()
    if not secret:
        append_env('MDS_BUILD_KIND', 'debug')
        print('::warning::Sin firma privada: se generará MDS-Visitas-PRUEBAS.apk. Para uso diario y actualizaciones, añade el secreto MDS_ANDROID_SIGNING indicado en README.')
        return
    try:
        data = json.loads(secret)
        password, alias = data['password'], data['alias']
        if not isinstance(password, str) or not re.fullmatch(r'[A-Za-z0-9_-]{12,150}', password):
            raise ValueError('Contraseña no válida')
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', alias):
            raise ValueError('Alias no válido')
        raw = base64.b64decode(data['keystore'], validate=True)
        if not 500 < len(raw) < 25000:
            raise ValueError('Tamaño de firma no válido')
        # Do not log the secret, password, base64, environment or keytool output.
        print('::add-mask::' + password)
        print('::add-mask::' + data['keystore'])
        directory = Path(os.environ['RUNNER_TEMP']) / 'mds-signing'
        directory.mkdir(mode=0o700, exist_ok=True)
        path = directory / 'private.p12'
        path.write_bytes(raw)
        path.chmod(0o600)
        env = dict(os.environ, MDS_P12_PASSWORD=password)
        result = subprocess.run(['keytool', '-list', '-keystore', str(path), '-storetype', 'PKCS12',
                                 '-storepass:env', 'MDS_P12_PASSWORD', '-alias', alias],
                                env=env, capture_output=True, timeout=30)
        if result.returncode:
            raise ValueError('La firma no se puede abrir')
        append_env('MDS_KEYSTORE_PATH', str(path))
        append_env('MDS_KEYSTORE_PASSWORD', password)
        append_env('MDS_KEY_ALIAS', alias)
        append_env('MDS_BUILD_KIND', 'release')
        print('Firma privada comprobada. Se generará MDS-Visitas.apk actualizable.')
    except Exception:
        print('::error::MDS_ANDROID_SIGNING no es válido. Pega TODO el contenido de MDS_Firma_Privada.txt, sin modificarlo, como secreto del repositorio.')
        sys.exit(1)

if __name__ == '__main__':
    main()
