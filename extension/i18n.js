import GLib from 'gi://GLib';
import Gettext from 'gettext';

const DOMAIN = 'autowallpaper@lumory';
let _initialized = false;
let _gettextAvailable = false;
let _currentLang = 'es';

// Diccionario de traducciones integrado para fallback inmediato y compatibilidad total
const translations = {
    en: {
        "Auto Wallpaper": "Auto Wallpaper",
        "Apariencia": "Appearance",
        "Estilo": "Style",
        "Haz clic en una miniatura para cambiar el fondo de pantalla del tema correspondiente.": "Click on a thumbnail to change the wallpaper for the corresponding theme.",
        "Haz clic para cambiar el fondo claro (Predeterminado)": "Click to change light wallpaper (Default)",
        "Haz clic para cambiar el fondo oscuro (Dark)": "Click to change dark wallpaper (Dark)",
        "Predeterminado": "Default",
        "Oscuro": "Dark",
        "cambiando el tema": "changing theme",
        "Se ha cambiado el fondo del tema": "Wallpaper changed for theme",
        "puede verlo": "view it by",
        "Seleccionar fondo de pantalla claro": "Select light wallpaper",
        "Seleccionar fondo de pantalla oscuro": "Select dark wallpaper",
        "Carpetas de Fondos": "Wallpaper Folders",
        "Selecciona las carpetas de imágenes asignadas a cada tema.": "Select the image folders assigned to each theme.",
        "Colección Claro": "Light Collection",
        "Colección Oscuro": "Dark Collection",
        "Cambiar carpeta seleccionada": "Change selected folder",
        "Abrir carpeta en Archivos": "Open folder in Files",
        "Rotación de fondos del conjunto": "Collection Wallpaper Rotation",
        "Configura el orden en que se van a proyectar las imágenes.": "Configure the order in which images are cycled.",
        "Se han detectado cambios en los fondos almacenados. ": "Changes detected in stored wallpapers. ",
        "Recarga": "Reload",
        "Recargar fondos ahora": "Reload wallpapers now",
        " para actualizar los fondos": " to update wallpapers",
        "Descartar aviso": "Dismiss notice",
        "Servicio en segundo plano": "Background Service",
        "Comprobando estado...": "Checking status...",
        "Siguiente": "Next",
        "Pasar al siguiente fondo de la secuencia actual": "Skip to next wallpaper in current sequence",
        "Barajar": "Shuffle",
        "Revolver la lista de fondos pendientes sin reiniciar el ciclo": "Shuffle pending wallpapers without restarting the cycle",
        "Recargar": "Reload",
        "Re-escanear carpetas, reiniciar la baraja completa y aplicar nuevos fondos": "Rescan folders, reset the entire deck, and apply new wallpapers",
        "Secuencia de rotación": "Rotation sequence",
        "Al azar": "Random",
        "Al azar sin repeticiones (baraja completa)": "Random without repeats (full deck)",
        "Rotación automática": "Automatic rotation",
        "Temporizador y automatización del cambio en segundo plano.": "Timer and background change automation.",
        "Activar rotación automática": "Enable automatic rotation",
        "Habilitar el servicio para cambiar las imágenes según la frecuencia programada": "Enable service to switch wallpapers based on scheduled frequency",
        "Frecuencia de cambio": "Switch frequency",
        "Intervalo de tiempo (minutos)": "Time interval (minutes)",
        "Hora fija diaria": "Fixed daily time",
        "Minutos entre cambios": "Minutes between switches",
        "Tiempo que permanece cada fondo de pantalla": "Time each wallpaper remains active",
        "Hora de cambio diario": "Daily switch time",
        "Hora programada para rotar el fondo cada día (formato 24h)": "Scheduled time to rotate wallpaper each day (24h format)",
        "Hora (00 a 23)": "Hour (00 to 23)",
        "Minutos (00 a 59)": "Minutes (00 to 59)",
        "Días entre cambios": "Days between switches",
        "Frecuencia en días de la rotación diaria": "Frequency in days for daily rotation",
        "Contar cambio de estilo no visto en la rotación": "Count unseen style change as rotation",
        "Al alternar entre claro y oscuro, si el fondo aún no se había visto, reinicia el temporizador (solo en intervalo de tiempo)": "When switching between light and dark, if the wallpaper was not yet seen, restart the timer (interval mode only)",
        "Herramientas y Mantenimiento": "Tools and Maintenance",
        "Mantenimiento, gestión del fondo en pantalla, organización inteligente y optimización.": "Maintenance, active wallpaper management, smart organization, and optimization.",
        "Fondo actual en pantalla": "Current wallpaper on screen",
        "Detectando fondo visible...": "Detecting active wallpaper...",
        "Ubicar y mostrar archivo en Archivos (Nautilus)": "Locate and show file in Files (Nautilus)",
        "Fijar fondo en pinned/ (proteger en este tema)": "Pin wallpaper in pinned/ (protect in this theme)",
        "Excluir fondo de la rotación (mover a exclude/)": "Exclude wallpaper from rotation (move to exclude/)",
        "No hay ningún fondo configurado o el archivo no existe": "No wallpaper configured or file does not exist",
        "Fijado (pinned)": "Pinned",
        "Desfijar fondo (regresar a la carpeta principal)": "Unpin wallpaper (return to main folder)",
        "Fijar fondo en pinned/ (no mover de este tema)": "Pin wallpaper in pinned/ (do not rotate away)",
        "Fondo desfijado y devuelto a la carpeta principal": "Wallpaper unpinned and returned to main folder",
        "Fondo fijado en pinned/": "Wallpaper pinned in pinned/",
        "¿Excluir este fondo de pantalla?": "Exclude this wallpaper?",
        "se moverá a la carpeta 'exclude/' y se cambiará al siguiente fondo disponible de la rotación.": "will be moved to 'exclude/' and wallpaper will switch to next in rotation.",
        "Cancelar": "Cancel",
        "Excluir": "Exclude",
        "Fondo excluido y rotado": "Wallpaper excluded and rotated",
        "Detector de Fondos Duplicados": "Duplicate Wallpaper Detector",
        "Detecta imágenes repetidas o casi idénticas con firmas estructurales (dHash)": "Detects repeated or near-identical images using structural perceptual hashes (dHash)",
        "Buscar duplicados": "Scan duplicates",
        "Clasificar Fondos por Luminosidad": "Classify Wallpapers by Luminosity",
        "Evalúa el brillo perceptual (CIELAB L*) y clasifica automáticamente entre claro y oscuro": "Evaluates perceptual lightness (CIELAB L*) and classifies automatically into light and dark",
        "Clasificar": "Classify",
        "Reescalado con IA (Smart Upscale)": "AI Upscaling (Smart Upscale)",
        "Comprobando compatibilidad de aceleración Vulkan y motor Real-CUGAN...": "Checking Vulkan acceleration compatibility and Real-CUGAN engine...",
        "Reescalar...": "Upscale...",
        "Requiere aceleración Vulkan y motor Real-CUGAN instalado": "Requires Vulkan acceleration and Real-CUGAN engine installed",
        "No compatible": "Not supported",
        "¿Verificar compatibilidad nuevamente?": "Check compatibility again?",
        "El motor Real-CUGAN con aceleración Vulkan reportó incompatibilidad o no respondió en la última comprobación.": "The Real-CUGAN engine with Vulkan acceleration reported incompatibility or did not respond.",
        "¿Deseas volver a escanear los controladores de GPU Vulkan y el motor ahora?": "Do you want to rescan Vulkan GPU drivers and the engine now?",
        "Verificar nuevamente": "Check again",
        "Verificando...": "Checking...",
        "Atajos": "Shortcuts",
        "Atajos de teclado": "Keyboard Shortcuts",
        "Atajos nativos de GNOME para cambiar y recargar fondos rápidamente.": "Native GNOME shortcuts to quickly switch and reload wallpapers.",
        "Habilitar atajos de teclado": "Enable keyboard shortcuts",
        "Activa los atajos globales en el entorno de escritorio": "Enables global shortcuts in the desktop environment",
        "Siguiente wallpaper": "Next wallpaper",
        "Recargar conjuntos": "Reload collections",
        "Ejecuta: auto-wallpaper next": "Runs: auto-wallpaper next",
        "Ejecuta: auto-wallpaper reload": "Runs: auto-wallpaper reload",
        "Super + W (Predeterminado)": "Super + W (Default)",
        "Super + Alt + W (Predeterminado)": "Super + Alt + W (Default)",
        "Super + Espacio": "Super + Space",
        "Super + Flecha Derecha": "Super + Right Arrow",
        "Personalizado": "Custom",
        "Desactivado": "Disabled",
        "Servicio detenido": "Service stopped",
        "El temporizador automático está detenido": "Automatic timer is stopped",
        "Servicio activo": "Service active",
        "Próximo cambio en:": "Next switch in:",
        "Restantes:": "Remaining:",
        "Modo:": "Mode:",
        "Seleccionar carpeta de fondos claros": "Select light wallpaper folder",
        "Seleccionar carpeta de fondos oscuros": "Select dark wallpaper folder",
        "¿Recargar todos los fondos?": "Reload all wallpapers?",
        "Esto re-escaneará las carpetas y recargará toda la lista de fondos, incluyendo el fondo actual.": "This will rescan folders and reload all wallpapers, including current wallpaper.",
        "Desactivado (Manual)": "Disabled (Manual)",
        "Calculando / Inminente...": "Calculating / Imminent...",
        "Imágenes (*.png, *.jpg, *.jpeg, *.webp)": "Images (*.png, *.jpg, *.jpeg, *.webp)",
        "Fondos Duplicados o Repetidos": "Duplicate or Repeated Wallpapers",
        "Volver a escanear": "Rescan",
        "Escaneando colecciones de fondos...": "Scanning wallpaper collections...",
        "Calculando firmas estructurales dHash y comparando similitudes...": "Calculating dHash structural hashes and comparing similarities...",
        "¡No hay duplicados!": "No duplicates found!",
        "Todas las imágenes de tus colecciones son únicas. No se detectaron fondos repetidos ni versiones comprimidas.": "All images in your collections are unique. No repeated wallpapers or compressed copies detected.",
        "Iniciando escaneo...": "Starting scan...",
        "Se encontraron": "Found",
        "coincidencias de fondos repetidos o casi idénticos:": "matches of duplicate or near-identical wallpapers:",
        "DUPLICADO EXACTO (100% idéntico)": "EXACT DUPLICATE (100% identical)",
        "CASI IDÉNTICO": "NEAR IDENTICAL",
        "similitud": "similarity",
        "Mover esta versión a la subcarpeta exclude/": "Move this version to exclude/ subfolder",
        "Ubicar en Archivos": "Locate in Files",
        "Excluida ✓": "Excluded ✓",
        "movida a exclude/": "moved to exclude/",
        "Aviso:": "Notice:",
        "El análisis perceptual examina la luminosidad píxel a píxel de cada imagen. En colecciones con muchos fondos, el proceso puede tardar un poco según el rendimiento de tu equipo.": "Perceptual analysis evaluates pixel lightness for each image. For large collections, this process may take a while depending on hardware.",
        "Parámetros de Clasificación por Luminosidad": "Luminosity Classification Parameters",
        "Organiza automáticamente tus fondos en las carpetas Claro y Oscuro según el modelo perceptivo humano (CIELAB L* + Percentil 65).": "Automatically organize wallpapers into Light and Dark folders using human perceptual model (CIELAB L* + 65th percentile).",
        "Muy permisivo": "Very Permissive",
        "Permisivo": "Permissive",
        "Equilibrado": "Balanced",
        "Exigente": "Demanding",
        "Muy estricto": "Very Strict",
        "Más Claros": "More Light",
        "Más Oscuros": "More Dark",
        "Muy permisivo para Claro · Máximo favorecedor para fondos claros": "Very permissive for Light · Maximum favor towards light wallpapers",
        "Permisivo para Claro · Favorece fondos claros": "Permissive for Light · Favors light wallpapers",
        "Equilibrada / Estándar · Recomendado · Balance perceptivo óptimo": "Balanced / Standard · Recommended · Optimal perceptual balance",
        "Exigente para Claro · Más fondos a Oscuro": "Demanding for Light · More wallpapers moved to Dark",
        "Muy estricto para Claro · Mínimo favorecedor para Claro": "Very strict for Light · Minimum favor towards Light wallpapers",
        "Sensibilidad de brillo (Umbral CIELAB L*)": "Brightness Sensitivity (CIELAB L* Threshold)",
        "Colecciones a analizar": "Collections to analyze",
        "Las subcarpetas pinned/ y exclude/ siempre están protegidas.": "Subfolders pinned/ and exclude/ are always protected.",
        "Ambos conjuntos (Claro y Oscuro - Recomendado)": "Both collections (Light and Dark - Recommended)",
        "Solo conjunto Claro (Reevaluar y mover fondos oscuros)": "Light collection only (Reevaluate and move dark wallpapers)",
        "Solo conjunto Oscuro (Reevaluar y mover fondos claros)": "Dark collection only (Reevaluate and move light wallpapers)",
        "Carpeta personalizada (Analizar y clasificar imágenes hacia Claro/Oscuro)": "Custom folder (Analyze and classify images into Light/Dark)",
        "Carpeta a clasificar": "Folder to classify",
        "Ninguna carpeta seleccionada": "No folder selected",
        "Seleccionar carpeta...": "Select folder...",
        "Seleccionar carpeta personalizada": "Select custom folder",
        "Iniciar clasificación": "Start classification",
        "Clasificando fondos mediante CIELAB L*...": "Classifying wallpapers via CIELAB L*...",
        "Evaluando brillo perceptual y percentil 65 en cada imagen...": "Evaluating perceptual lightness and 65th percentile for each image...",
        "Movidos a Claro": "Moved to Light",
        "Movidos a Oscuro": "Moved to Dark",
        "Iniciando análisis...": "Starting analysis...",
        "Las subcarpetas": "Subfolders",
        "fondos fijados": "pinned wallpapers",
        "y": "and",
        "fondos excluidos": "excluded wallpapers",
        "están protegidas y no se moverán.": "are protected and will not be moved.",
        "Escaneando y clasificando fondos...": "Scanning and classifying wallpapers...",
        "Analizando brillo perceptual (CIELAB L*) y percentil 65 en cada imagen": "Analyzing perceptual lightness (CIELAB L*) and 65th percentile on each image",
        "Detener": "Stop",
        "Cerrar": "Close",
        "Proceso detenido por el usuario": "Process stopped by user",
        "Clasificación completada": "Classification completed",
        "¡Colecciones ya equilibradas!": "Collections already balanced!",
        "Todos los fondos ya se encuentran en su carpeta adecuada según el umbral seleccionado.": "All wallpapers are already in their appropriate folder according to the selected threshold.",
        "Colecciones equilibradas": "Balanced collections",
        "No se requirió mover ningún fondo. Ambas carpetas coinciden con sus perfiles de luminosidad.": "No wallpapers needed to be moved. Both folders match their lightness profiles.",
        "Clasificación finalizada con éxito": "Classification completed successfully",
        "mostrando los últimos": "showing last",
        "en vivo": "live",
        "Se movieron": "Moved",
        "a claro y": "to light and",
        "a oscuro en total": "to dark in total",
        "Clasificación de fondos finalizada": "Wallpaper classification completed",
        "Evaluando:": "Evaluating:",
        "Brillo L*": "Lightness L*",
        "Reescalado Inteligente (Real-CUGAN)": "Smart Upscale (Real-CUGAN)",
        "El proceso de reescalado utiliza aceleración neuronal por GPU (Vulkan). Puede tardar en completarse y ocasionar pérdida temporal de rendimiento mientras se ejecuta.": "The upscaling process uses Vulkan GPU neural acceleration. It may take some time and temporarily affect performance while running.",
        "Parámetros del Reescalado IA": "AI Upscale Parameters",
        "Acelera la nitidez y resolución usando Real-CUGAN.": "Enhance sharpness and resolution using Real-CUGAN.",
        "GPU detectada:": "Detected GPU:",
        "Carpeta a reescalar": "Folder to upscale",
        "☀️ Conjunto claro": "☀️ Light collection",
        "🌙 Conjunto oscuro": "🌙 Dark collection",
        "🌓 Ambos conjuntos (claro y oscuro)": "🌓 Both collections (light and dark)",
        "Factor de escala": "Scale factor",
        "Multiplicador de resolución": "Resolution multiplier",
        "2x (Recomendado para 1080p -> 4K)": "2x (Recommended for 1080p -> 4K)",
        "Reducción de ruido (Denoise)": "Noise Reduction (Denoise)",
        "Nivel de limpieza de artefactos y compresión": "Artifact and compression cleanup level",
        "Nivel 0 - Predeterminado (Nitidez óptima)": "Level 0 - Default (Optimal sharpness)",
        "Nivel 1 - Suave": "Level 1 - Soft",
        "Nivel 2 - Medio": "Level 2 - Medium",
        "Nivel 3 - Intenso": "Level 3 - Strong",
        "Nivel -1 - Sin denoise (Preserva grano)": "Level -1 - No denoise (Preserves grain)",
        "Límite de resolución": "Resolution limit",
        "Omitir imágenes que ya alcancen o superen este tamaño": "Skip images that already reach or exceed this size",
        "2560x1440 (2K QHD - Recomendado)": "2560x1440 (2K QHD - Recommended)",
        "1920x1080 (Full HD)": "1920x1080 (Full HD)",
        "3840x2160 (4K UHD)": "3840x2160 (4K UHD)",
        "Sin límite (procesar todas las imágenes)": "No limit (process all images)",
        "Copia de seguridad": "Backup copy",
        "Guardar copia de las imágenes originales en exclude/backup_upscale_original/": "Save copy of original images in exclude/backup_upscale_original/",
        "Ignorar etiqueta de reescalado previo": "Ignore previous upscale tag",
        "Permite reescalar imágenes que ya fueron procesadas anteriormente con IA": "Allows re-upscaling images previously processed with AI",
        "¿Ignorar etiqueta de reescalado previo?": "Ignore previous upscale tag?",
        "Advertencia: Reescalar sucesivamente una imagen ya procesada con IA puede introducir artefactos no deseados o degradar la calidad original.": "Warning: Repeatedly upscaling an AI-processed image may introduce unwanted artifacts or degrade quality.",
        "¿Estás seguro de que deseas forzar el reescalado sobre imágenes previamente tratadas?": "Are you sure you want to force upscaling on previously treated images?",
        "Activar de todos modos": "Enable anyway",
        "Iniciar reescalado": "Start upscaling",
        "Reescalando fondos con Real-CUGAN...": "Upscaling wallpapers with Real-CUGAN...",
        "Iniciando...": "Starting...",
        "Reescalado con IA finalizado": "AI Upscaling completed",
        "Analizando candidatos:": "Analyzing candidates:",
        "de": "of",
        "Comprobando resolución y firmas de reescalado previo...": "Checking resolution and previous upscale signatures...",
        "procesadas": "processed",
        "Reescalando": "Upscaling",
        "Completada": "Completed",
        "guardada exitosamente": "saved successfully",
        "Reescalado completado": "Upscaling completed",
        "Procesamiento de carpeta finalizado": "Folder processing finished",
        "Sin imágenes pendientes por procesar": "No pending images to process",
        "Rotación automática activada": "Automatic rotation active",
        "Rotación automática pausada": "Automatic rotation paused",
        "Dependencias opcionales faltantes": "Missing optional dependencies",
        "Esta herramienta auxiliar requiere Python 3 y las siguientes librerías instaladas en tu sistema:": "This auxiliary tool requires Python 3 and the following libraries installed on your system:",
        "Instálalas desde tu terminal con:": "Install them from your terminal with:",
        "Motor Real-CUGAN no instalado": "Real-CUGAN engine not installed",
        "El motor de inteligencia artificial Real-CUGAN (~45 MB) se descarga bajo demanda para mantener la extensión ligera.": "The Real-CUGAN AI engine (~45 MB) is downloaded on demand to keep the extension lightweight.",
        "Descargar motor Real-CUGAN (~45 MB)": "Download Real-CUGAN engine (~45 MB)",
        "Descargando motor Real-CUGAN...": "Downloading Real-CUGAN engine...",
        "Extrayendo motor y modelos...": "Extracting engine and models...",
        "Configurar motor...": "Setup engine...",
        "Motor descargado e instalado correctamente": "Engine downloaded and installed successfully",
        "Error al descargar el motor Real-CUGAN": "Error downloading Real-CUGAN engine",
        "Para mantener la extensión ligera y cumplir las políticas de GNOME Extensions, instala el motor Real-CUGAN (~45 MB) con un clic copiando el siguiente comando en tu terminal:": "To keep the extension lightweight and comply with GNOME Extensions policies, install the Real-CUGAN engine (~45 MB) by copying and running the following command in your terminal:",
        "Copiar comando de instalación": "Copy installation command",
        "Copiar comando": "Copy command",
        "¡Copiado! ✓": "Copied! ✓",
        "Comando copiado al portapapeles": "Command copied to clipboard",
        "Atajo nativo de GNOME Shell: Siguiente fondo": "GNOME Shell native shortcut: Next wallpaper",
        "Atajo nativo de GNOME Shell: Barajar y recargar": "GNOME Shell native shortcut: Shuffle and reload"
},
    es: {
        // En español se preservan los textos originales directamente
    }
};

/**
 * Inicializa el sistema de traducción con soporte para Gettext nativo
 * @param {string} localeDir Ruta al directorio locale
 */
export function initI18n(localeDir) {
    if (_initialized) return;

    try {
        if (Gettext && typeof Gettext.bindtextdomain === 'function') {
            if (typeof Gettext.setlocale === 'function' && Gettext.LocaleCategory) {
                try {
                    Gettext.setlocale(Gettext.LocaleCategory.ALL, '');
                } catch (e) {}
            }
            if (localeDir) {
                Gettext.bindtextdomain(DOMAIN, localeDir);
            }
            Gettext.textdomain(DOMAIN);
            _gettextAvailable = true;
        }
    } catch (e) {
        _gettextAvailable = false;
    }

    // Detectar idioma del sistema
    try {
        const langNames = GLib.get_language_names();
        for (const name of langNames) {
            const clean = name.split('.')[0];
            const code = clean.toLowerCase();
            const base = code.split(/[_@]/)[0];
            if (['pt_br', 'pt'].includes(code) || base === 'pt') {
                _currentLang = 'pt_BR';
                break;
            } else if (['zh_tw', 'zh_hk'].includes(code)) {
                _currentLang = 'zh_TW';
                break;
            } else if (['zh_cn', 'zh'].includes(code) || base === 'zh') {
                _currentLang = 'zh_CN';
                break;
            } else if (['en', 'es', 'fr', 'de', 'it', 'ru', 'ja', 'ko', 'pl', 'uk', 'nl', 'tr'].includes(base)) {
                _currentLang = base;
                break;
            }
        }
    } catch (e) {
        _currentLang = 'es';
    }

    _initialized = true;
}

/**
 * Traduce una cadena al idioma activo
 * @param {string} msgid Texto original en español
 * @returns {string} Texto traducido
 */
export function gettext(msgid) {
    if (!msgid) return msgid;

    if (_gettextAvailable) {
        try {
            const res = Gettext.dgettext(DOMAIN, msgid);
            if (res && res !== msgid) return res;
        } catch (e) {}
    }

    if (_currentLang === 'en' && translations.en && translations.en[msgid]) {
        return translations.en[msgid];
    }

    return msgid;
}

export const _ = gettext;

export function setLanguage(lang) {
    _currentLang = lang;
}

export function getLanguage() {
    return _currentLang;
}
