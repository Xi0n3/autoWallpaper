#!/usr/bin/env python3
"""
Compila los archivos .po de la carpeta po/ a archivos binarios .mo en extension/locale/
"""
import os
import subprocess
import sys

def compile_all():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    po_dir = os.path.join(base_dir, 'po')
    loc_dir = os.path.join(base_dir, 'extension', 'locale')
    domain = 'autowallpaper@lumory'

    if not os.path.exists(po_dir):
        print(f"Directorio de traducciones {po_dir} no encontrado.")
        return 1

    success = True
    for item in os.listdir(po_dir):
        if item.endswith('.po'):
            lang = os.path.splitext(item)[0]
            po_file = os.path.join(po_dir, item)
            targets = [lang]
            if lang == 'pt_BR':
                targets.append('pt')
            elif lang == 'zh_CN':
                targets.append('zh')
            elif lang == 'zh_TW':
                targets.append('zh_HK')

            for target in targets:
                out_dir = os.path.join(loc_dir, target, 'LC_MESSAGES')
                os.makedirs(out_dir, exist_ok=True)
                mo_file = os.path.join(out_dir, f'{domain}.mo')

                res = subprocess.run(['msgfmt', po_file, '-o', mo_file], capture_output=True, text=True)
                if res.returncode == 0:
                    print(f"✓ Compilado: {target} -> {mo_file}")
                else:
                    print(f"✗ Error al compilar {po_file}:\n{res.stderr}")
                    success = False

    return 0 if success else 1

if __name__ == '__main__':
    sys.exit(compile_all())
