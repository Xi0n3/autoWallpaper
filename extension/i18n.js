import GLib from 'gi://GLib';
import Gettext from 'gettext';

const DOMAIN = 'autowallpaper@lumory';
let _initialized = false;
let _gettextAvailable = false;
let _currentLang = 'en';

// Fallback translations if Gettext is not available or in standalone/test environments
const translations = {
    es: {
        "Auto Wallpaper": "Auto Wallpaper",
        "Appearance": "Apariencia",
        "Style": "Estilo",
        "Click on a thumbnail to change the wallpaper for the corresponding theme.": "Haz clic en una miniatura para cambiar el fondo de pantalla del tema correspondiente.",
        "Click to change light wallpaper (Default)": "Haz clic para cambiar el fondo claro (Predeterminado)",
        "Click to change dark wallpaper (Dark)": "Haz clic para cambiar el fondo oscuro (Dark)",
        "Default": "Predeterminado",
        "Dark": "Oscuro",
        "changing theme": "cambiando el tema",
        "Wallpaper changed for theme": "Se ha cambiado el fondo del tema",
        "view it by": "puede verlo",
        "Select light wallpaper": "Seleccionar fondo de pantalla claro",
        "Select dark wallpaper": "Seleccionar fondo de pantalla oscuro",
        "Wallpaper Folders": "Carpetas de Fondos",
        "Select the image folders assigned to each theme.": "Selecciona las carpetas de imágenes asignadas a cada tema.",
        "Light Collection": "Colección Claro",
        "Dark Collection": "Colección Oscuro",
        "Change selected folder": "Cambiar carpeta seleccionada",
        "Open folder in Files": "Abrir carpeta en Archivos",
        "Collection Wallpaper Rotation": "Rotación de fondos del conjunto",
        "Configure the order in which images are cycled.": "Configura el orden en que se van a proyectar las imágenes.",
        "Changes detected in stored wallpapers. ": "Se han detectado cambios en los fondos almacenados. ",
        "Reload": "Recarga",
        "Reload wallpapers now": "Recargar fondos ahora",
        " to update wallpapers": " para actualizar los fondos",
        "Dismiss notice": "Descartar aviso",
        "Background Service": "Servicio en segundo plano",
        "Checking status...": "Comprobando estado...",
        "Next": "Siguiente",
        "Skip to next wallpaper in current sequence": "Pasar al siguiente fondo de la secuencia actual",
        "Shuffle": "Barajar",
        "Shuffle pending wallpapers without restarting the cycle": "Revolver la lista de fondos pendientes sin reiniciar el ciclo",
        "Rescan folders, reset the entire deck, and apply new wallpapers": "Re-escanear carpetas, reiniciar la baraja completa y aplicar nuevos fondos",
        "Rotation sequence": "Secuencia de rotación",
        "Random": "Al azar",
        "Random without repeats (full deck)": "Al azar sin repeticiones (baraja completa)",
        "Automatic rotation": "Rotación automática",
        "Timer and background change automation.": "Temporizador y automatización del cambio en segundo plano.",
        "Enable automatic rotation": "Activar rotación automática",
        "Enable service to switch wallpapers based on scheduled frequency": "Habilitar el servicio para cambiar las imágenes según la frecuencia programada",
        "Switch frequency": "Frecuencia de cambio",
        "Time interval (minutes)": "Intervalo de tiempo (minutos)",
        "Fixed daily time": "Hora fija diaria",
        "Minutes between switches": "Minutos entre cambios",
        "Time each wallpaper remains active": "Tiempo que permanece cada fondo de pantalla",
        "Daily switch time": "Hora de cambio diario",
        "Scheduled time to rotate wallpaper each day (24h format)": "Hora programada para rotar el fondo cada día (formato 24h)",
        "Hour (00 to 23)": "Hora (00 a 23)",
        "Minutes (00 to 59)": "Minutos (00 a 59)",
        "Days between switches": "Días entre cambios",
        "Frequency in days for daily rotation": "Frecuencia en días de la rotación diaria",
        "Count unseen style change as rotation": "Contar cambio de estilo no visto en la rotación",
        "When switching between light and dark, if the wallpaper was not yet seen, restart the timer (interval mode only)": "Al alternar entre claro y oscuro, si el fondo aún no se había visto, reinicia el temporizador (solo en intervalo de tiempo)",
        "Tools and Maintenance": "Herramientas y Mantenimiento",
        "Maintenance, active wallpaper management, smart organization, and optimization.": "Mantenimiento, gestión del fondo en pantalla, organización inteligente y optimización.",
        "Current wallpaper on screen": "Fondo actual en pantalla",
        "Detecting active wallpaper...": "Detectando fondo visible...",
        "Locate and show file in Files (Nautilus)": "Ubicar y mostrar archivo en Archivos (Nautilus)",
        "Pin wallpaper in pinned/ (protect in this theme)": "Fijar fondo en pinned/ (proteger en este tema)",
        "Exclude wallpaper from rotation (move to exclude/)": "Excluir fondo de la rotación (mover a exclude/)",
        "No wallpaper configured or file does not exist": "No hay ningún fondo configurado o el archivo no existe",
        "Pinned": "Fijado (pinned)",
        "Unpin wallpaper (return to main folder)": "Desfijar fondo (regresar a la carpeta principal)",
        "Pin wallpaper in pinned/ (do not rotate away)": "Fijar fondo en pinned/ (no mover de este tema)",
        "Wallpaper unpinned and returned to main folder": "Fondo desfijado y devuelto a la carpeta principal",
        "Wallpaper pinned in pinned/": "Fondo fijado en pinned/",
        "Exclude this wallpaper?": "¿Excluir este fondo de pantalla?",
        "will be moved to 'exclude/' and wallpaper will switch to next in rotation.": "se moverá a la carpeta 'exclude/' y se cambiará al siguiente fondo disponible de la rotación.",
        "Cancel": "Cancelar",
        "Exclude": "Excluir",
        "Wallpaper excluded and rotated": "Fondo excluido y rotado",
        "Duplicate Wallpaper Detector": "Detector de Fondos Duplicados",
        "Detects repeated or near-identical images using structural perceptual hashes (dHash)": "Detecta imágenes repetidas o casi idénticas con firmas estructurales (dHash)",
        "Scan duplicates": "Buscar duplicados",
        "Classify Wallpapers by Luminosity": "Clasificar Fondos por Luminosidad",
        "Evaluates perceptual lightness (CIELAB L*) and classifies automatically into light and dark": "Evalúa el brillo perceptual (CIELAB L*) y clasifica automáticamente entre claro y oscuro",
        "Classify": "Clasificar",
        "AI Upscaling (Smart Upscale)": "Reescalado con IA (Smart Upscale)",
        "Checking Vulkan acceleration compatibility and Real-CUGAN engine...": "Comprobando compatibilidad de aceleración Vulkan y motor Real-CUGAN...",
        "Upscale...": "Reescalar...",
        "Requires Vulkan acceleration and Real-CUGAN engine installed": "Requiere aceleración Vulkan y motor Real-CUGAN instalado",
        "Not supported": "No compatible",
        "Check compatibility again?": "¿Verificar compatibilidad nuevamente?",
        "The Real-CUGAN engine with Vulkan acceleration reported incompatibility or did not respond.": "El motor Real-CUGAN con aceleración Vulkan reportó incompatibilidad o no respondió en la última comprobación.",
        "Do you want to rescan Vulkan GPU drivers and the engine now?": "¿Deseas volver a escanear los controladores de GPU Vulkan y el motor ahora?",
        "Check again": "Verificar nuevamente",
        "Checking...": "Verificando...",
        "Shortcuts": "Atajos",
        "Keyboard Shortcuts": "Atajos de teclado",
        "Native GNOME shortcuts to quickly switch and reload wallpapers.": "Atajos nativos de GNOME para cambiar y recargar fondos rápidamente.",
        "Enable keyboard shortcuts": "Habilitar atajos de teclado",
        "Enables global shortcuts in the desktop environment": "Activa los atajos globales en el entorno de escritorio",
        "Next wallpaper": "Siguiente wallpaper",
        "Reload collections": "Recargar conjuntos",
        "Runs: auto-wallpaper next": "Ejecuta: auto-wallpaper next",
        "Runs: auto-wallpaper reload": "Ejecuta: auto-wallpaper reload",
        "Super + W (Default)": "Super + W (Predeterminado)",
        "Super + Alt + W (Default)": "Super + Alt + W (Predeterminado)",
        "Super + Space": "Super + Espacio",
        "Super + Right Arrow": "Super + Flecha Derecha",
        "Custom": "Personalizado",
        "Disabled": "Desactivado",
        "Service stopped": "Servicio detenido",
        "Automatic timer is stopped": "El temporizador automático está detenido",
        "Service active": "Servicio activo",
        "Next switch in:": "Próximo cambio en:",
        "Remaining:": "Restantes:",
        "Mode:": "Modo:",
        "Select light wallpaper folder": "Seleccionar carpeta de fondos claros",
        "Select dark wallpaper folder": "Seleccionar carpeta de fondos oscuros",
        "Reload all wallpapers?": "¿Recargar todos los fondos?",
        "This will rescan folders and reload all wallpapers, including current wallpaper.": "Esto re-escaneará las carpetas y recargará toda la lista de fondos, incluyendo el fondo actual.",
        "Disabled (Manual)": "Desactivado (Manual)",
        "Calculating / Imminent...": "Calculando / Inminente...",
        "Images (*.png, *.jpg, *.jpeg, *.webp)": "Imágenes (*.png, *.jpg, *.jpeg, *.webp)",
        "Duplicate or Repeated Wallpapers": "Fondos Duplicados o Repetidos",
        "Rescan": "Volver a escanear",
        "Scanning wallpaper collections...": "Escaneando colecciones de fondos...",
        "Calculating dHash structural hashes and comparing similarities...": "Calculando firmas estructurales dHash y comparando similitudes...",
        "No duplicates found!": "¡No hay duplicados!",
        "All images in your collections are unique. No repeated wallpapers or compressed copies detected.": "Todas las imágenes de tus colecciones son únicas. No se detectaron fondos repetidos ni versiones comprimidas.",
        "Starting scan...": "Iniciando escaneo...",
        "Found": "Se encontraron",
        "matches of duplicate or near-identical wallpapers:": "coincidencias de fondos repetidos o casi idénticos:",
        "EXACT DUPLICATE (100% identical)": "DUPLICADO EXACTO (100% idéntico)",
        "NEAR IDENTICAL": "CASI IDÉNTICO",
        "similarity": "similitud",
        "Move this version to exclude/ subfolder": "Mover esta versión a la subcarpeta exclude/",
        "Locate in Files": "Ubicar en Archivos",
        "Excluded ✓": "Excluida ✓",
        "moved to exclude/": "movida a exclude/",
        "Notice:": "Aviso:",
        "Perceptual analysis evaluates pixel lightness for each image. For large collections, this process may take a while depending on hardware.": "El análisis perceptual examina la luminosidad píxel a píxel de cada imagen. En colecciones con muchos fondos, el proceso puede tardar un poco según el rendimiento de tu equipo.",
        "Luminosity Classification Parameters": "Parámetros de Clasificación por Luminosidad",
        "Automatically organize wallpapers into Light and Dark folders using human perceptual model (CIELAB L* + 65th percentile).": "Organiza automáticamente tus fondos en las carpetas Claro y Oscuro según el modelo perceptivo humano (CIELAB L* + Percentil 65).",
        "Very Permissive": "Muy permisivo",
        "Permissive": "Permisivo",
        "Balanced": "Equilibrado",
        "Demanding": "Exigente",
        "Very Strict": "Muy estricto",
        "More Light": "Más Claros",
        "More Dark": "Más Oscuros",
        "Very permissive for Light · Maximum favor towards light wallpapers": "Muy permisivo para Claro · Máximo favorecedor para fondos claros",
        "Permissive for Light · Favors light wallpapers": "Permisivo para Claro · Favorece fondos claros",
        "Balanced / Standard · Recommended · Optimal perceptual balance": "Equilibrada / Estándar · Recomendado · Balance perceptivo óptimo",
        "Demanding for Light · More wallpapers moved to Dark": "Exigente para Claro · Más fondos a Oscuro",
        "Very strict for Light · Minimum favor towards Light wallpapers": "Muy estricto para Claro · Mínimo favorecedor para Claro",
        "Brightness Sensitivity (CIELAB L* Threshold)": "Sensibilidad de brillo (Umbral CIELAB L*)",
        "Collections to analyze": "Colecciones a analizar",
        "Subfolders pinned/ and exclude/ are always protected.": "Las subcarpetas pinned/ y exclude/ siempre están protegidas.",
        "Both collections (Light and Dark - Recommended)": "Ambos conjuntos (Claro y Oscuro - Recomendado)",
        "Light collection only (Reevaluate and move dark wallpapers)": "Solo conjunto Claro (Reevaluar y mover fondos oscuros)",
        "Dark collection only (Reevaluate and move light wallpapers)": "Solo conjunto Oscuro (Reevaluar y mover fondos claros)",
        "Custom folder (Analyze and classify images into Light/Dark)": "Carpeta personalizada (Analizar y clasificar imágenes hacia Claro/Oscuro)",
        "Folder to classify": "Carpeta a clasificar",
        "No folder selected": "Ninguna carpeta seleccionada",
        "Select folder...": "Seleccionar carpeta...",
        "Select custom folder": "Seleccionar carpeta personalizada",
        "Start classification": "Iniciar clasificación",
        "Classifying wallpapers via CIELAB L*...": "Clasificando fondos mediante CIELAB L*...",
        "Evaluating perceptual lightness and 65th percentile for each image...": "Evaluando brillo perceptual y percentil 65 en cada imagen...",
        "Moved to Light": "Movidos a Claro",
        "Moved to Dark": "Movidos a Oscuro",
        "Starting analysis...": "Iniciando análisis...",
        "Subfolders": "Las subcarpetas",
        "pinned wallpapers": "fondos fijados",
        "and": "y",
        "excluded wallpapers": "fondos excluidos",
        "are protected and will not be moved.": "están protegidas y no se moverán.",
        "Scanning and classifying wallpapers...": "Escaneando y clasificando fondos...",
        "Analyzing perceptual lightness (CIELAB L*) and 65th percentile on each image": "Analizando brillo perceptual (CIELAB L*) y percentil 65 en cada imagen",
        "Stop": "Detener",
        "Close": "Cerrar",
        "Process stopped by user": "Proceso detenido por el usuario",
        "Classification completed": "Clasificación completada",
        "Collections already balanced!": "¡Colecciones ya equilibradas!",
        "All wallpapers are already in their appropriate folder according to the selected threshold.": "Todos los fondos ya se encuentran en su carpeta adecuada según el umbral seleccionado.",
        "Balanced collections": "Colecciones equilibradas",
        "No wallpapers needed to be moved. Both folders match their lightness profiles.": "No se requirió mover ningún fondo. Ambas carpetas coinciden con sus perfiles de luminosidad.",
        "Classification completed successfully": "Clasificación finalizada con éxito",
        "showing last": "mostrando los últimos",
        "live": "en vivo",
        "Moved": "Se movieron",
        "to light and": "a claro y",
        "to dark in total": "a oscuro en total",
        "Wallpaper classification completed": "Clasificación de fondos finalizada",
        "Evaluating:": "Evaluando:",
        "Lightness L*": "Brillo L*",
        "Smart Upscale (Real-CUGAN)": "Reescalado Inteligente (Real-CUGAN)",
        "The upscaling process uses Vulkan GPU neural acceleration. It may take some time and temporarily affect performance while running.": "El proceso de reescalado utiliza aceleración neuronal por GPU (Vulkan). Puede tardar en completarse y ocasionar pérdida temporal de rendimiento mientras se ejecuta.",
        "AI Upscale Parameters": "Parámetros del Reescalado IA",
        "Enhance sharpness and resolution using Real-CUGAN.": "Acelera la nitidez y resolución usando Real-CUGAN.",
        "Detected GPU:": "GPU detectada:",
        "Folder to upscale": "Carpeta a reescalar",
        "☀️ Light collection": "☀️ Conjunto claro",
        "🌙 Dark collection": "🌙 Conjunto oscuro",
        "🌓 Both collections (light and dark)": "🌓 Ambos conjuntos (claro y oscuro)",
        "Scale factor": "Factor de escala",
        "Resolution multiplier": "Multiplicador de resolución",
        "2x (Recommended for 1080p -> 4K)": "2x (Recomendado para 1080p -> 4K)",
        "Noise Reduction (Denoise)": "Reducción de ruido (Denoise)",
        "Artifact and compression cleanup level": "Nivel de limpieza de artefactos y compresión",
        "Level 0 - Default (Optimal sharpness)": "Nivel 0 - Predeterminado (Nitidez óptima)",
        "Level 1 - Soft": "Nivel 1 - Suave",
        "Level 2 - Medium": "Nivel 2 - Medio",
        "Level 3 - Strong": "Nivel 3 - Intenso",
        "Level -1 - No denoise (Preserves grain)": "Nivel -1 - Sin denoise (Preserva grano)",
        "Resolution limit": "Límite de resolución",
        "Skip images that already reach or exceed this size": "Omitir imágenes que ya alcancen o superen este tamaño",
        "2560x1440 (2K QHD - Recommended)": "2560x1440 (2K QHD - Recomendado)",
        "1920x1080 (Full HD)": "1920x1080 (Full HD)",
        "3840x2160 (4K UHD)": "3840x2160 (4K UHD)",
        "No limit (process all images)": "Sin límite (procesar todas las imágenes)",
        "Backup copy": "Copia de seguridad",
        "Save copy of original images in exclude/backup_upscale_original/": "Guardar copia de las imágenes originales en exclude/backup_upscale_original/",
        "Ignore previous upscale tag": "Ignorar etiqueta de reescalado previo",
        "Allows re-upscaling images previously processed with AI": "Permite reescalar imágenes que ya fueron procesadas anteriormente con IA",
        "Ignore previous upscale tag?": "¿Ignorar etiqueta de reescalado previo?",
        "Warning: Repeatedly upscaling an AI-processed image may introduce unwanted artifacts or degrade quality.": "Advertencia: Reescalar sucesivamente una imagen ya procesada con IA puede introducir artefactos no deseados o degradar la calidad original.",
        "Are you sure you want to force upscaling on previously treated images?": "¿Estás seguro de que deseas forzar el reescalado sobre imágenes previamente tratadas?",
        "Enable anyway": "Activar de todos modos",
        "Start upscaling": "Iniciar reescalado",
        "Upscaling wallpapers with Real-CUGAN...": "Reescalando fondos con Real-CUGAN...",
        "Starting...": "Iniciando...",
        "AI Upscaling completed": "Reescalado con IA finalizado",
        "Analyzing candidates:": "Analizando candidatos:",
        "of": "de",
        "Checking resolution and previous upscale signatures...": "Comprobando resolución y firmas de reescalado previo...",
        "processed": "procesadas",
        "Upscaling": "Reescalando",
        "Completed": "Completada",
        "saved successfully": "guardada exitosamente",
        "Upscaling completed": "Reescalado completado",
        "Folder processing finished": "Procesamiento de carpeta finalizado",
        "No pending images to process": "Sin imágenes pendientes por procesar",
        "Automatic rotation active": "Rotación automática activada",
        "Automatic rotation paused": "Rotación automática pausada",
        "Missing optional dependencies": "Dependencias opcionales faltantes",
        "This auxiliary tool requires Python 3 and the following libraries installed on your system:": "Esta herramienta auxiliar requiere Python 3 y las siguientes librerías instaladas en tu sistema:",
        "Install them from your terminal with:": "Instálalas desde tu terminal con:",
        "Real-CUGAN engine not installed": "Motor Real-CUGAN no instalado",
        "The Real-CUGAN AI engine (~45 MB) is downloaded on demand to keep the extension lightweight.": "El motor de inteligencia artificial Real-CUGAN (~45 MB) se descarga bajo demanda para mantener la extensión ligera.",
        "Download Real-CUGAN engine (~45 MB)": "Descargar motor Real-CUGAN (~45 MB)",
        "Downloading Real-CUGAN engine...": "Descargando motor Real-CUGAN...",
        "Extracting engine and models...": "Extrayendo motor y modelos...",
        "Setup engine...": "Configurar motor...",
        "Engine downloaded and installed successfully": "Motor descargado e instalado correctamente",
        "Error downloading Real-CUGAN engine": "Error al descargar el motor Real-CUGAN",
        "To keep the extension lightweight and comply with GNOME Extensions policies, install the Real-CUGAN engine (~45 MB) by copying and running the following command in your terminal:": "Para mantener la extensión ligera y cumplir las políticas de GNOME Extensions, instala el motor Real-CUGAN (~45 MB) con un clic copiando el siguiente comando en tu terminal:",
        "Copy installation command": "Copiar comando de instalación",
        "Copy command": "Copiar comando",
        "Copied! ✓": "¡Copiado! ✓",
        "Command copied to clipboard": "Comando copiado al portapapeles",
        "System Tray Icon": "Icono en la bandeja del sistema",
        "Show or hide the quick-access indicator on the GNOME top bar.": "Mostrar u ocultar el indicador de acceso rápido en la barra superior de GNOME.",
        "Show tray icon": "Mostrar icono en la bandeja",
        "Shows an icon in the top bar with a quick menu (Next, Shuffle, Settings, etc.)": "Muestra un icono en el panel superior con menú rápido (Siguiente, Barajar, Configuración, etc.)",
        "Next Wallpaper": "Siguiente fondo",
        "Shuffle Sequence": "Barajar secuencia",
        "Reload Collections": "Recargar colecciones",
        "Settings": "Configuración",
        "Hide Tray Icon": "Ocultar icono de bandeja",
        "Hours between switches": "Horas entre cambios",
        "Hours each wallpaper remains active": "Horas que permanece cada fondo de pantalla",
        "Additional minutes each wallpaper remains active": "Minutos adicionales que permanece cada fondo de pantalla",
        "Checking components...": "Comprobando componentes...",
        "Checking Python dependencies and Vulkan/Real-CUGAN acceleration...": "Verificando dependencias de Python y aceleración Vulkan/Real-CUGAN...",
        "Engine and dependencies ready": "Motor y dependencias listos",
        "Ignore": "Ignorar",
        "Ignore this combination": "Ignorar esta combinación",
        "Ignore this combination and do not show it again as duplicate": "Ignorar esta combinación y no volver a mostrarla como duplicado",
        "Combination ignored": "Combinación ignorada",
        "Combination restored": "Combinación restaurada",
        "Ignored Duplicates": "Duplicados ignorados",
        "Ignored Combinations": "Combinaciones ignoradas",
        "No ignored duplicates": "No hay duplicados ignorados",
        "Stop ignoring": "Dejar de ignorar",
        "Restore": "Restaurar",
        "Back to results": "Volver a resultados",
        "GNOME Shell native shortcut: Next wallpaper": "Atajo nativo de GNOME Shell: Siguiente fondo",
        "GNOME Shell native shortcut: Shuffle and reload": "Atajo nativo de GNOME Shell: Barajar y recargar",
        "View ignored combinations": "Ver combinaciones ignoradas",
        "Combinations you choose to ignore will appear here so you can restore them.": "Las combinaciones que decidas ignorar aparecerán aquí para que puedas restaurarlas.",
        "image": "imagen",
        "images": "imágenes",
        "No images": "Sin imágenes",
        "Add wallpapers to folders or select one containing images to enable rotation and tools.": "Añade fondos a las carpetas o selecciona una que contenga imágenes para habilitar la rotación y herramientas.",
        "Checking Python dependencies and Real-CUGAN engine availability...": "Verificando dependencias de Python y disponibilidad del motor Real-CUGAN...",
        "Hide from panel": "Ocultar de la bandeja",
        "Ignored": "Ignorados",
        "No compatible images detected in collections": "No se detectaron imágenes compatibles en las colecciones",
        "Additional minutes (0 to 59)": "Minutos adicionales (0 a 59)"
}
};

/**
 * Initializes the translation system with native Gettext support
 * @param {string} localeDir Path to locale directory
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

    // Detect system language
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
        _currentLang = 'en';
    }

    _initialized = true;
}

/**
 * Translates a string into the active language
 * @param {string} msgid Base string in English
 * @returns {string} Translated string
 */
export function gettext(msgid) {
    if (!msgid) return msgid;

    if (_gettextAvailable) {
        try {
            const res = Gettext.dgettext(DOMAIN, msgid);
            if (res && res !== msgid) return res;
        } catch (e) {}
    }

    if (_currentLang === 'es' && translations.es && translations.es[msgid]) {
        return translations.es[msgid];
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
