#!/usr/bin/env bash
# ==============================================================================
# Script de Instalación / Desinstalación de Auto Wallpaper (Arquitectura Nativa EGO)
# ==============================================================================

set -e

# Directorios y variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_UUID="autowallpaper@lumory"
EXT_DEST="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SYSTEMD_USER_DIR/auto-wallpaper.service"
USER_DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/autowallpaper"

# Colores para la terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

cleanup_legacy_systemd() {
    if systemctl --user is-active --quiet auto-wallpaper.service 2>/dev/null; then
        echo -e "  -> Deteniendo servicio heredado auto-wallpaper.service..."
        systemctl --user stop auto-wallpaper.service || true
    fi
    if systemctl --user is-enabled --quiet auto-wallpaper.service 2>/dev/null; then
        echo -e "  -> Deshabilitando servicio heredado auto-wallpaper.service..."
        systemctl --user disable auto-wallpaper.service || true
    fi
    if [ -f "$SERVICE_FILE" ]; then
        echo -e "  -> Eliminando archivo de servicio heredado..."
        rm -f "$SERVICE_FILE"
        systemctl --user daemon-reload 2>/dev/null || true
    fi
}

# Función para desinstalar
uninstall() {
    echo -e "${YELLOW}${BOLD}:: Desinstalando Auto Wallpaper...${NC}"

    # 1. Limpiar cualquier servicio systemd heredado
    cleanup_legacy_systemd

    # 2. Deshabilitar y eliminar enlace de extensión
    if command -v gnome-extensions >/dev/null 2>&1; then
        echo -e "  -> Deshabilitando extensión en GNOME..."
        gnome-extensions disable "$EXT_UUID" 2>/dev/null || true
    fi
    if [ -L "$EXT_DEST" ] || [ -d "$EXT_DEST" ]; then
        echo -e "  -> Eliminando extensión en $EXT_DEST..."
        rm -rf "$EXT_DEST"
    fi

    echo -e "${GREEN}${BOLD}✓ Desinstalación completada con éxito.${NC}"
    echo -e "${CYAN}Nota: Si deseas eliminar también tu configuración y el motor IA opcional, ejecuta:${NC}"
    echo -e "  rm -rf ~/.config/auto-wallpaper.json ~/.local/share/autowallpaper\n"
    exit 0
}

# Comprobar argumento de desinstalación o empaquetado EGO
if [ "$1" = "--uninstall" ] || [ "$1" = "-u" ]; then
    uninstall
fi

if [ "$1" = "--pack" ] || [ "$1" = "-p" ]; then
    echo -e "${BLUE}${BOLD}:: Empaquetando extensión para extensions.gnome.org (EGO)...${NC}"
    if command -v python3 >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/compile_locales.py" ]; then
        python3 "$SCRIPT_DIR/compile_locales.py"
    fi
    # Para cumplir con las políticas de EGO (GNOME 44+), el zip NO debe incluir gschemas.compiled
    rm -f "$SCRIPT_DIR/extension/schemas/gschemas.compiled"
    gnome-extensions pack "$SCRIPT_DIR/extension" \
        --force \
        --extra-source="i18n.js" \
        --extra-source="prefs.css" \
        --extra-source="locale" \
        --extra-source="scripts" \
        --out-dir="$SCRIPT_DIR"
    # Recompilar esquema localmente para pruebas de desarrollo
    if command -v glib-compile-schemas >/dev/null 2>&1 && [ -d "$SCRIPT_DIR/extension/schemas" ]; then
        glib-compile-schemas "$SCRIPT_DIR/extension/schemas/"
    fi
    echo -e "${GREEN}${BOLD}✓ Paquete EGO generado:${NC} $SCRIPT_DIR/$EXT_UUID.shell-extension.zip"
    exit 0
fi

echo -e "\n${CYAN}${BOLD}======================================================${NC}"
echo -e "${CYAN}${BOLD}     Instalador de Auto Wallpaper (Nativo GJS/EGO)    ${NC}"
echo -e "${CYAN}${BOLD}======================================================${NC}\n"

# 1. Limpiar demonio systemd heredado si existía
cleanup_legacy_systemd

# 2. Verificar módulos opcionales de Python solo para Reescalado con IA (Smart Upscale)
echo -e "${BLUE}:: Verificando herramientas opcionales para Reescalado con IA (Smart Upscale)...${NC}"
echo -e "${GREEN}✓ El motor de rotación, detector de duplicados (dHash) y clasificador por luminosidad (CIELAB L*) funcionan 100% de forma nativa en GNOME (GJS + GdkPixbuf).${NC}"
OPTIONAL_PKGS=()

if ! command -v python3 >/dev/null 2>&1; then
    OPTIONAL_PKGS+=("python3")
else
    python3 -c "import PIL" 2>/dev/null || OPTIONAL_PKGS+=("python3-pillow / python3-pil")
    python3 -c "import cv2, numpy" 2>/dev/null || OPTIONAL_PKGS+=("python3-opencv + python3-numpy")
fi

if [ ${#OPTIONAL_PKGS[@]} -gt 0 ]; then
    echo -e "${YELLOW}  Para usar la herramienta opcional de Reescalado con IA (Real-CUGAN), puedes instalar:${NC}"
    for pkg in "${OPTIONAL_PKGS[@]}"; do
        echo -e "   - $pkg"
    done
    echo -e "  • Fedora:    ${BOLD}sudo dnf install python3-pillow python3-opencv python3-numpy${NC}"
    echo -e "  • Ubuntu:    ${BOLD}sudo apt install python3-pil python3-opencv python3-numpy${NC}"
    echo -e "  • Arch:      ${BOLD}sudo pacman -S python-pillow python-opencv python-numpy${NC}\n"
else
    echo -e "${GREEN}✓ Todas las dependencias opcionales para Reescalado con IA están listas.${NC}"
fi

# 3. Asegurar permisos de scripts auxiliares en extension/scripts/
echo -e "\n${BLUE}:: Preparando scripts auxiliares y permisos...${NC}"
chmod +x "$SCRIPT_DIR/extension/scripts/image_worker.js" \
         "$SCRIPT_DIR/extension/scripts/smart_upscale.py" 2>/dev/null || true
echo -e "${GREEN}✓ Scripts auxiliares listos.${NC}"

# 4. Compilar esquemas GSettings y traducciones
if command -v glib-compile-schemas >/dev/null 2>&1 && [ -d "$SCRIPT_DIR/extension/schemas" ]; then
    echo -e "\n${BLUE}:: Compilando esquemas GSettings...${NC}"
    glib-compile-schemas "$SCRIPT_DIR/extension/schemas/"
    echo -e "${GREEN}✓ Esquemas compilados.${NC}"
fi

if command -v python3 >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/compile_locales.py" ]; then
    echo -e "\n${BLUE}:: Compilando archivos de idioma (.po -> .mo)...${NC}"
    python3 "$SCRIPT_DIR/compile_locales.py"
fi

# 5. Enlazar la extensión a GNOME Shell
echo -e "\n${BLUE}:: Instalando extensión en GNOME Shell...${NC}"
mkdir -p "$HOME/.local/share/gnome-shell/extensions"
rm -rf "$EXT_DEST"
ln -sf "$SCRIPT_DIR/extension" "$EXT_DEST"
echo -e "${GREEN}✓ Enlace creado:${NC} $EXT_DEST -> $SCRIPT_DIR/extension"

# 6. Habilitar la extensión si gnome-extensions está disponible
if command -v gnome-extensions >/dev/null 2>&1; then
    echo -e "\n${BLUE}:: Activando extensión...${NC}"
    gnome-extensions enable "$EXT_UUID" 2>/dev/null || true
fi

echo -e "\n${GREEN}${BOLD}======================================================${NC}"
echo -e "${GREEN}${BOLD}       ¡Instalación completada con éxito! 🎉          ${NC}"
echo -e "${GREEN}${BOLD}======================================================${NC}\n"

echo -e "${BOLD}Últimos pasos para empezar a usarla:${NC}"
echo -e " 1. ${CYAN}Reinicia GNOME Shell${NC} para que detecte los cambios:"
echo -e "    • En ${BOLD}Wayland${NC}: Cierra sesión de usuario y vuelve a entrar."
echo -e "    • En ${BOLD}X11${NC}: Presiona ${YELLOW}Alt + F2${NC}, escribe ${YELLOW}r${NC} y pulsa Enter."
echo -e " 2. Abre la app ${BOLD}Extensiones${NC} o haz clic en el icono del panel superior para configurar tus carpetas."
echo -e " 3. Si en algún momento deseas desinstalarla, simplemente corre:"
echo -e "    ${YELLOW}./install.sh --uninstall${NC}\n"
