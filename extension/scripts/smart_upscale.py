#!/usr/bin/env python3
"""
Módulo auxiliar opcional de Reescalado con IA (Real-CUGAN NCNN Vulkan) para Auto Wallpaper.
Se invoca asíncronamente desde prefs.js mediante Gio.Subprocess y descarga el motor bajo
demanda en ~/.local/share/autowallpaper/realcugan/.
"""
import os
import sys
import stat
import shutil
import subprocess
import tempfile
import re
from pathlib import Path
import argparse
import json

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    np = None
    HAS_NUMPY = False

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    cv2 = None
    HAS_CV2 = False

try:
    from PIL import Image, PngImagePlugin
    HAS_PILLOW = True
except ImportError:
    Image = None
    PngImagePlugin = None
    HAS_PILLOW = False

XDG_DATA_HOME = Path(os.environ.get("XDG_DATA_HOME", os.path.expanduser("~/.local/share")))
USER_ENGINE_DIR = XDG_DATA_HOME / "autowallpaper" / "realcugan"

FLAG_KEY = "UpscaledBy"
FLAG_VALUE = "Real-CUGAN-Upscaled"
KNOWN_FLAGS = {FLAG_VALUE, "Real-ESRGAN-Upscaled"}
EXIF_SOFTWARE_TAG = 305

DEFAULT_SCALE = 2
DEFAULT_DENOISE = 0
DEFAULT_MODEL = "models-se"
DEFAULT_SYNCGAP = 0
EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".avif", ".bmp", ".tiff", ".tif",
    ".jfif", ".pjpeg", ".pjp", ".gif"
}
BACKUP_FOLDER_NAME = "backup_upscale_original"


def is_image_file(path_obj) -> bool:
    """Determina si un archivo es una imagen válida por extensión o cabecera binaria."""
    try:
        p = Path(path_obj)
        if not p.is_file() or p.name.startswith("."):
            return False

        if p.suffix.lower() in EXTENSIONS:
            return True

        with open(p, "rb") as f:
            header = f.read(32)

        if not header:
            return False

        if header.startswith(b"\xff\xd8\xff"):
            return True
        if header.startswith(b"\x89PNG\r\n\x1a\n"):
            return True
        if header.startswith(b"RIFF") and b"WEBP" in header[:16]:
            return True
        if header.startswith(b"GIF87a") or header.startswith(b"GIF89a"):
            return True
        if header.startswith(b"BM"):
            return True
        if b"ftypavif" in header[:24] or b"ftypmif1" in header[:24]:
            return True
        if header.startswith(b"II*\x00") or header.startswith(b"MM\x00*"):
            return True
    except Exception:
        pass
    return False


def find_engine(model_family: str = DEFAULT_MODEL) -> tuple[Path | None, Path | None]:
    """Busca el ejecutable de Real-CUGAN en ~/.local/share/autowallpaper/realcugan o en el PATH del sistema."""
    if USER_ENGINE_DIR.exists():
        executables = list(USER_ENGINE_DIR.rglob("realcugan-ncnn-vulkan"))
        if executables:
            exe_path = executables[0]
            try:
                current_stat = os.stat(exe_path)
                if not (current_stat.st_mode & stat.S_IEXEC):
                    os.chmod(exe_path, current_stat.st_mode | stat.S_IEXEC)
            except OSError:
                pass
            model_dir = exe_path.parent / model_family
            if not model_dir.exists():
                model_dir = exe_path.parent / "models-se"
            return exe_path, model_dir

    sys_exe = shutil.which("realcugan-ncnn-vulkan")
    if sys_exe:
        exe_path = Path(sys_exe).resolve()
        for candidate_base in [exe_path.parent, Path("/usr/share/realcugan-ncnn-vulkan"), Path("/usr/local/share/realcugan-ncnn-vulkan")]:
            model_dir = candidate_base / model_family
            if model_dir.exists():
                return exe_path, model_dir
            fallback_dir = candidate_base / "models-se"
            if fallback_dir.exists():
                return exe_path, fallback_dir
        return exe_path, exe_path.parent / model_family

    return None, None


def ensure_engine(model_family: str = DEFAULT_MODEL) -> tuple[Path, Path]:
    """Localiza el ejecutable de Real-CUGAN instalado en el sistema o en el directorio de datos del usuario."""
    exe_path, model_dir = find_engine(model_family)
    if exe_path and model_dir:
        return exe_path, model_dir
    raise FileNotFoundError(
        f"El motor Real-CUGAN no está instalado en {USER_ENGINE_DIR} ni en el PATH del sistema."
    )


def detect_best_gpu(exe_path: Path) -> tuple[int, str]:
    """Detecta los dispositivos Vulkan disponibles y prioriza GPUs dedicadas (NVIDIA / AMD)."""
    gpus = {}

    env = os.environ.copy()
    if os.path.exists("/proc/driver/nvidia") or os.path.exists("/dev/nvidia0"):
        env.setdefault("__NV_PRIME_RENDER_OFFLOAD", "1")
        env.setdefault("__GLX_VENDOR_LIBRARY_NAME", "nvidia")
        env.setdefault("__VK_LAYER_NV_optimus", "NVIDIA_only")

    dummy_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa748a\x00\x00\x00\x00IEND\xaeB`\x82"

    stderr_output = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=".png") as inf, tempfile.NamedTemporaryFile(suffix=".png") as outf:
            inf.write(dummy_png)
            inf.flush()
            try:
                proc = subprocess.run(
                    [str(exe_path), "-v", "-i", inf.name, "-o", outf.name],
                    capture_output=True,
                    text=True,
                    timeout=15,
                    env=env
                )
                stderr_output = proc.stderr or ""
            except subprocess.TimeoutExpired as te:
                stderr_output = te.stderr or ""
    except Exception:
        pass

    for line in stderr_output.splitlines():
        m = re.search(r"\[(\d+)\s+([^\]]+)\]", line)
        if m:
            gpus[int(m.group(1))] = m.group(2)

    for idx, name in gpus.items():
        name_l = name.lower()
        if any(vendor in name_l for vendor in ["nvidia", "geforce", "rtx", "gtx", "radeon", "amd"]):
            return idx, f"{name} (Dedicada)"

    if gpus:
        first_idx = next(iter(gpus.keys()))
        return first_idx, gpus[first_idx]

    try:
        smi = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"], capture_output=True, text=True, timeout=3)
        if smi.returncode == 0 and smi.stdout.strip():
            gpu_name = smi.stdout.strip().splitlines()[0]
            return 0, f"{gpu_name} (Dedicada - NVIDIA)"
    except Exception:
        pass

    if os.path.exists("/proc/driver/nvidia") or os.path.exists("/dev/nvidia0"):
        return 0, "NVIDIA GPU (Dedicada Detectada)"

    return 0, "Dispositivo Vulkan Compatible"


def check_environment_status() -> dict:
    """Verifica las dependencias de Python, el motor Real-CUGAN y Vulkan sin descargar nada."""
    missing_pkgs = []
    if not HAS_PILLOW:
        missing_pkgs.append("Pillow (PIL)")
    if not HAS_CV2:
        missing_pkgs.append("OpenCV (cv2)")
    if not HAS_NUMPY:
        missing_pkgs.append("NumPy")

    exe_path, model_dir = find_engine(DEFAULT_MODEL)
    engine_installed = bool(exe_path and model_dir and exe_path.exists())

    gpu_id = 0
    gpu_name = "Dispositivo Vulkan Compatible"
    vulkan_ok = False

    if engine_installed and exe_path:
        try:
            gpu_id, gpu_name = detect_best_gpu(exe_path)
            vulkan_ok = True
        except Exception:
            vulkan_ok = False
    else:
        if shutil.which("vulkaninfo") or os.path.exists("/dev/dri") or os.path.exists("/proc/driver/nvidia"):
            vulkan_ok = True

    available = (len(missing_pkgs) == 0) and engine_installed and vulkan_ok
    reason = ""
    if missing_pkgs:
        reason = f"Faltan librerías de Python: {', '.join(missing_pkgs)}"
    elif not engine_installed:
        reason = "El motor Real-CUGAN no está descargado todavía"
    elif not vulkan_ok:
        reason = "No se detectó aceleración Vulkan compatible"

    return {
        "available": available,
        "has_pillow": HAS_PILLOW,
        "has_cv2": HAS_CV2,
        "has_numpy": HAS_NUMPY,
        "missing_pkgs": missing_pkgs,
        "engine_installed": engine_installed,
        "engine_path": str(exe_path) if exe_path else None,
        "engine_target_dir": str(USER_ENGINE_DIR),
        "vulkan_ok": vulkan_ok,
        "gpu_id": gpu_id if gpu_id != -1 else 0,
        "gpu_name": gpu_name if gpu_name != "auto" else "Aceleración Vulkan activa",
        "reason": reason,
    }


def setup_backup_directory(target_path: Path) -> Path:
    base_folder = target_path if target_path.is_dir() else target_path.parent
    backup_dir = base_folder / "exclude" / BACKUP_FOLDER_NAME
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def check_already_processed(image_path: Path) -> tuple[bool, str]:
    """Comprueba si la imagen ya tiene la firma de reescalado incrustada."""
    if not HAS_PILLOW:
        return False, ""
    try:
        with Image.open(image_path) as im:
            exif = im.getexif()
            if exif:
                val = str(exif.get(EXIF_SOFTWARE_TAG, ""))
                if any(flag in val for flag in KNOWN_FLAGS):
                    return True, val

            if hasattr(im, "text"):
                val = str(im.text.get(FLAG_KEY, ""))
                if any(flag in val for flag in KNOWN_FLAGS):
                    return True, val
            if hasattr(im, "info"):
                val = str(im.info.get(FLAG_KEY, ""))
                if any(flag in val for flag in KNOWN_FLAGS):
                    return True, val
    except Exception:
        pass
    return False, ""


def sanitize_image(src_path: Path, dest_clean_png: Path) -> tuple[int, int]:
    """Preprocesa la imagen para evitar fallos de canal alfa y dimensiones impares en la GPU."""
    img = cv2.imread(str(src_path), cv2.IMREAD_UNCHANGED)
    if img is None:
        try:
            with Image.open(src_path) as pil_img:
                pil_rgb = pil_img.convert("RGB")
                img = cv2.cvtColor(np.array(pil_rgb), cv2.COLOR_RGB2BGR)
        except Exception:
            raise ValueError(f"No se pudo decodificar el archivo de imagen: '{src_path.name}'")

    if len(img.shape) == 3 and img.shape[2] == 4:
        b, g, r, a = cv2.split(img)
        alpha = a.astype(float) / 255.0
        white = np.ones_like(b, dtype=float) * 255.0
        b = np.clip(b.astype(float) * alpha + white * (1.0 - alpha), 0, 255).astype(np.uint8)
        g = np.clip(g.astype(float) * alpha + white * (1.0 - alpha), 0, 255).astype(np.uint8)
        r = np.clip(r.astype(float) * alpha + white * (1.0 - alpha), 0, 255).astype(np.uint8)
        img = cv2.merge([b, g, r])
    elif len(img.shape) == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

    if img.dtype == np.uint16:
        img = (img / 256).astype(np.uint8)

    h, w = img.shape[:2]
    new_w = w - (w % 2)
    new_h = h - (h % 2)
    if new_w != w or new_h != h:
        img = img[:new_h, :new_w]

    cv2.imwrite(str(dest_clean_png), img)
    return new_w, new_h


def save_image_with_flag(img_cv2_bgr, output_path: Path):
    """Guarda la imagen inyectando la firma en EXIF / metadatos PNG."""
    img_rgb = cv2.cvtColor(img_cv2_bgr, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(img_rgb)

    exif = pil_img.getexif()
    exif[EXIF_SOFTWARE_TAG] = FLAG_VALUE

    ext = output_path.suffix.lower()
    if ext in [".jpg", ".jpeg"]:
        pil_img.save(output_path, "JPEG", quality=96, exif=exif)
    elif ext == ".png":
        pnginfo = PngImagePlugin.PngInfo()
        pnginfo.add_text(FLAG_KEY, FLAG_VALUE)
        pil_img.save(output_path, "PNG", pnginfo=pnginfo, exif=exif)
    elif ext == ".webp":
        pil_img.save(output_path, "WEBP", quality=96, exif=exif)
    else:
        cv2.imwrite(str(output_path), img_cv2_bgr)


def run_cugan(
    exe_path: Path,
    model_dir: Path,
    input_path: Path,
    output_path: Path,
    scale: int = DEFAULT_SCALE,
    denoise: int = DEFAULT_DENOISE,
    gpu_id: int = -1,
    syncgap: int = DEFAULT_SYNCGAP
):
    """Ejecuta inferencia segura con comprobación de integridad."""
    temp_clean_in = output_path.with_name(f".clean_{output_path.stem}.png")
    temp_raw_out = output_path.with_name(f".raw_{output_path.stem}.png")

    try:
        sanitize_image(input_path, temp_clean_in)

        orig_img = cv2.imread(str(temp_clean_in))
        orig_mean = float(np.mean(orig_img)) if orig_img is not None else 100.0

        cmd = [
            str(exe_path),
            "-i", str(temp_clean_in),
            "-o", str(temp_raw_out),
            "-s", str(scale),
            "-n", str(denoise),
            "-m", str(model_dir),
            "-c", str(syncgap),
            "-f", "png"
        ]

        if gpu_id >= 0:
            cmd.extend(["-g", str(gpu_id)])

        result_proc = subprocess.run(
            cmd,
            cwd=exe_path.parent,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        if result_proc.returncode != 0:
            raise RuntimeError(f"Fallo del binario (código {result_proc.returncode}): {result_proc.stderr.strip()}")

        if not temp_raw_out.exists() or temp_raw_out.stat().st_size == 0:
            raise RuntimeError("El archivo de salida no fue generado o está vacío (0 bytes).")

        result = cv2.imread(str(temp_raw_out))
        if result is None:
            raise RuntimeError("No se pudo decodificar el resultado del modelo.")

        res_mean = float(np.mean(result))
        res_std = float(np.std(result))

        if res_mean < 3.0:
            raise RuntimeError(f"El modelo devolvió una imagen completamente negra (mean={res_mean:.2f}).")

        if orig_mean > 15.0 and res_mean < 8.0:
            raise RuntimeError(f"Colapso de brillo del modelo (original mean={orig_mean:.1f} -> resultado mean={res_mean:.1f}).")

        if res_std < 1.0:
            raise RuntimeError(f"El modelo devolvió una imagen plana sin contraste (std={res_std:.2f}).")

        save_image_with_flag(result, output_path)

    finally:
        if temp_clean_in.exists():
            temp_clean_in.unlink()
        if temp_raw_out.exists():
            temp_raw_out.unlink()


def parse_args():
    parser = argparse.ArgumentParser(
        description="Smart Upscale con Real-CUGAN para Auto Wallpaper.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument("path", nargs="?", default=None, help="Ruta de la carpeta o archivo de imagen a procesar.")
    parser.add_argument("-i", "--input", dest="input_path", default=None, help="Ruta alternativa de la carpeta o imagen.")
    parser.add_argument("-s", "--scale", type=int, default=DEFAULT_SCALE, choices=[2, 3, 4], help="Factor de escalado.")
    parser.add_argument("-n", "--denoise", type=int, default=DEFAULT_DENOISE, choices=[-1, 0, 1, 2, 3], help="Nivel de denoise.")
    parser.add_argument("-m", "--model", dest="model_family", default=DEFAULT_MODEL, choices=["models-se", "models-pro", "models-nose"])
    parser.add_argument("-g", "--gpu", default="auto", help="ID de GPU Vulkan ('auto' para autoseleccionar).")
    parser.add_argument("-c", "--syncgap", type=int, default=DEFAULT_SYNCGAP, choices=[0, 1, 2, 3])
    parser.add_argument("--max-width", type=int, default=2560)
    parser.add_argument("--max-height", type=int, default=1440)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--ignore-tag", action="store_true")
    parser.add_argument("--no-backup", action="store_true")
    parser.add_argument("--check-env", action="store_true", help="Verifica el estado de dependencias y motor Real-CUGAN en JSON.")
    return parser.parse_args()


def main():
    args = parse_args()

    if args.check_env:
        print(json.dumps(check_environment_status()), flush=True)
        return

    if not (HAS_CV2 and HAS_NUMPY and HAS_PILLOW):
        missing = []
        if not HAS_PILLOW:
            missing.append("Pillow (python3-pillow)")
        if not HAS_CV2:
            missing.append("OpenCV (python3-opencv)")
        if not HAS_NUMPY:
            missing.append("NumPy (python3-numpy)")
        print(f"❌ Error: Faltan dependencias de Python requeridas: {', '.join(missing)}", flush=True)
        sys.exit(1)

    raw_path = args.path or args.input_path
    if not raw_path:
        print("Error: No se especificó ninguna ruta a procesar.")
        sys.exit(1)

    target_path = Path(os.path.expanduser(raw_path)).resolve()
    if not target_path.exists():
        print(f"Error: La ruta '{target_path}' no existe.")
        sys.exit(1)

    model_family = args.model_family
    scale_factor = args.scale
    denoise_level = args.denoise
    syncgap_mode = args.syncgap

    if scale_factor == 4 and model_family == "models-pro":
        model_family = "models-se"
    if model_family == "models-pro":
        if denoise_level in [1, 2]:
            denoise_level = 0
        if syncgap_mode != 0:
            syncgap_mode = 0

    exe_path, model_dir = ensure_engine(model_family)

    if args.gpu == "auto":
        gpu_id, gpu_desc = detect_best_gpu(exe_path)
    else:
        try:
            gpu_id = int(args.gpu)
            gpu_desc = f"ID manual ({gpu_id})"
        except ValueError:
            gpu_id = -1
            gpu_desc = "auto"

    print(f":: Motor: {exe_path.name}")
    print(f":: GPU seleccionada: [{gpu_id if gpu_id >= 0 else 'auto'}] {gpu_desc}")
    print(f":: Modelo: {model_dir.name} | Escala: {scale_factor}x | Denoise: {denoise_level} | Syncgap: {syncgap_mode}\n")

    backup_dir = setup_backup_directory(target_path) if not args.no_backup else None

    if target_path.is_file():
        if not is_image_file(target_path):
            print(f"Error: El archivo '{target_path.name}' no parece ser una imagen válida.")
            sys.exit(1)
        images = [target_path]
    elif target_path.is_dir():
        images = [
            p for p in target_path.iterdir()
            if is_image_file(p) and not p.name.startswith(".") and "exclude" not in p.parts
        ]
    else:
        print(f"Error: '{target_path}' no es un archivo ni carpeta válido.")
        sys.exit(1)

    if not images:
        print("No se encontraron imágenes para procesar.")
        return

    print(f"Escaneando {len(images)} imágenes...\n")
    candidates = []

    for scan_idx, img_path in enumerate(sorted(images), 1):
        print(f"::PROGRESS:: {json.dumps({'event': 'scanning', 'current': scan_idx, 'total': len(images), 'name': img_path.name})}", flush=True)
        if not (args.force or args.ignore_tag):
            is_processed, flag_found = check_already_processed(img_path)
            if is_processed:
                print(f"  [YA MEJORADA] {img_path.name} -> Firma detectada ('{flag_found}'). Omitiendo.")
                continue

        img_info = cv2.imread(str(img_path))
        if img_info is None:
            continue
        h, w = img_info.shape[:2]

        if not args.force and (w >= args.max_width or h >= args.max_height):
            print(f"  [OMITIDA] {img_path.name} -> {w}x{h} (Resolución alta >= {args.max_width}x{args.max_height})")
            continue

        candidates.append((img_path, f"{w}x{h}", w, h))

    if not candidates:
        print(f"::PROGRESS:: {json.dumps({'event': 'empty'})}", flush=True)
        print("\nNo hay imágenes pendientes por procesar.")
        return

    print(f"\nSe encontraron {len(candidates)} imágenes listas para procesar.\n")
    print(f"::PROGRESS:: {json.dumps({'event': 'start', 'total': len(candidates)})}", flush=True)

    for idx, (img_path, dims, orig_w, orig_h) in enumerate(candidates, 1):
        target_w = orig_w * scale_factor
        target_h = orig_h * scale_factor
        print(f"::PROGRESS:: {json.dumps({'event': 'processing', 'current': idx, 'total': len(candidates), 'path': str(img_path), 'name': img_path.name, 'orig_dims': dims, 'target_dims': f'{target_w}x{target_h}', 'scale': scale_factor})}", flush=True)
        print(f"[{idx}/{len(candidates)}] Procesando: {img_path.name} ({dims} ➔ {target_w}x{target_h})...", flush=True)

        if backup_dir:
            backup_file = backup_dir / img_path.name
            if not backup_file.exists():
                shutil.copy2(img_path, backup_file)

        temp_target = img_path.with_name(f".tmp_cugan_{img_path.name}")

        try:
            print("       -> Ejecutando inferencia neuronal Real-CUGAN con aceleración Vulkan...", flush=True)
            run_cugan(
                exe_path,
                model_dir,
                img_path,
                temp_target,
                scale=scale_factor,
                denoise=denoise_level,
                gpu_id=gpu_id,
                syncgap=syncgap_mode
            )
            temp_target.replace(img_path)
            print("       -> ✓ Reemplazada exitosamente con flag 'Real-CUGAN-Upscaled'.", flush=True)
            print(f"::PROGRESS:: {json.dumps({'event': 'image_done', 'current': idx, 'total': len(candidates), 'name': img_path.name})}", flush=True)
        except Exception as e:
            print(f"       -> ❌ [ERROR PROTEGIDO] No se modificó el original: {e}", flush=True)
            if temp_target.exists():
                temp_target.unlink()

    print(f"::PROGRESS:: {json.dumps({'event': 'done', 'total': len(candidates)})}", flush=True)

    if backup_dir:
        print(f"\nProceso finalizado. Copias de seguridad en: exclude/{BACKUP_FOLDER_NAME}/")
    else:
        print("\nProceso finalizado.")


if __name__ == "__main__":
    main()
