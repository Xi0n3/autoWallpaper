import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

const VALID_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp',
    '.tiff', '.tif', '.jfif', '.pjpeg', '.pjp', '.gif',
]);

const EXCLUDE_DIR_NAME = 'exclude';
const PINNED_DIR_NAME = 'pinned';

export default class AutoWallpaperExtension extends Extension {
    enable() {
        this._cancellable = new Gio.Cancellable();
        this._imagesLight = [];
        this._imagesDark = [];
        this._folderMonitors = [];
        this._configMonitor = null;
        this._configMonitorSigId = 0;
        this._timerId = 0;
        this._saveFlagTimeoutId = 0;
        this._configDebounceId = 0;
        this._folderDebounceLightId = 0;
        this._folderDebounceDarkId = 0;
        this._savingInternal = false;
        this._keybindingsRegistered = false;
        this._extSettingsSignals = [];

        this._bgSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

        try {
            this._extSettings = this.getSettings();
        } catch (e) {
            this._extSettings = null;
        }

        // Botón indicador discreto en la barra superior
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

        const icon = new St.Icon({
            icon_name: 'preferences-desktop-wallpaper-symbolic',
            style_class: 'system-status-icon',
        });
        this._indicator.add_child(icon);

        this._indicator.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 1) {
                this.openPreferences();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        // Configuración por defecto en memoria antes de la carga asíncrona
        this._cfg = this._getDefaultConfig();

        // Conectar detección de tema en tiempo real (claro / oscuro)
        this._schemeChangedId = this._interfaceSettings.connect('changed::color-scheme', () => {
            this._onThemeChanged();
        });

        // Conectar cambios en GSettings de atajos nativos
        if (this._extSettings) {
            for (const key of ['shortcuts-enabled', 'shortcut-next', 'shortcut-reload']) {
                const sigId = this._extSettings.connect(`changed::${key}`, () => {
                    this._syncKeybindingsFromSettings();
                });
                this._extSettingsSignals.push(sigId);
            }
        }

        // Inicializar configuración, caché de carpetas, monitores y temporizador de forma 100% asíncrona
        this._initializeAsync();
    }

    disable() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }

        this._removeKeybindings();

        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        if (this._saveFlagTimeoutId) {
            GLib.source_remove(this._saveFlagTimeoutId);
            this._saveFlagTimeoutId = 0;
        }
        if (this._configDebounceId) {
            GLib.source_remove(this._configDebounceId);
            this._configDebounceId = 0;
        }
        if (this._folderDebounceLightId) {
            GLib.source_remove(this._folderDebounceLightId);
            this._folderDebounceLightId = 0;
        }
        if (this._folderDebounceDarkId) {
            GLib.source_remove(this._folderDebounceDarkId);
            this._folderDebounceDarkId = 0;
        }

        if (this._schemeChangedId && this._interfaceSettings) {
            this._interfaceSettings.disconnect(this._schemeChangedId);
            this._schemeChangedId = 0;
        }

        if (this._extSettings && this._extSettingsSignals.length > 0) {
            for (const sigId of this._extSettingsSignals) {
                this._extSettings.disconnect(sigId);
            }
            this._extSettingsSignals = [];
        }

        if (this._configMonitor) {
            if (this._configMonitorSigId) {
                this._configMonitor.disconnect(this._configMonitorSigId);
                this._configMonitorSigId = 0;
            }
            this._configMonitor.cancel();
            this._configMonitor = null;
        }

        this._cleanupFolderMonitors();

        this._bgSettings = null;
        this._interfaceSettings = null;
        this._extSettings = null;
        this._imagesLight = [];
        this._imagesDark = [];
        this._cfg = null;

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    // =========================================================================
    // CONFIGURACIÓN Y PERSISTENCIA ASÍNCRONA
    // =========================================================================

    _getPicturesDir() {
        const specialDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        if (specialDir) return specialDir;
        return GLib.build_filenamev([GLib.get_home_dir(), 'Pictures']);
    }

    _getConfigFilePath() {
        return GLib.build_filenamev([GLib.get_user_config_dir(), 'auto-wallpaper.json']);
    }

    _getDefaultConfig() {
        const picDir = this._getPicturesDir();
        return {
            dir_light: GLib.build_filenamev([picDir, 'wallpapers', 'light']),
            dir_dark: GLib.build_filenamev([picDir, 'wallpapers', 'dark']),
            auto_rotation_enabled: true,
            mode: 'time',
            interval: 30,
            day_time: '12:00',
            sequence_mode: 'random',
            unshown_light: [],
            unshown_dark: [],
            saved_light: null,
            saved_dark: null,
            seen_light: false,
            seen_dark: false,
            next_run: 0,
            force_reload: false,
            known_count_light: null,
            known_count_dark: null,
            reset_on_style_change: true,
            shortcuts_enabled: false,
            shortcut_next: '<Super>w',
            shortcut_reload: '<Super><Alt>w',
        };
    }

    _sanitizeUserPaths(cfg, defaults) {
        const homeDir = GLib.get_home_dir();
        for (const key of ['dir_light', 'dir_dark']) {
            const val = cfg[key];
            if (!val || typeof val !== 'string') {
                cfg[key] = defaults[key];
                continue;
            }
            if (val.startsWith('~/')) {
                cfg[key] = GLib.build_filenamev([homeDir, val.substring(2)]);
            } else if (val.startsWith('/home/') && !val.startsWith(`${homeDir}/`) && val !== homeDir) {
                cfg[key] = defaults[key];
            }
        }
        if (typeof cfg.auto_rotation_enabled !== 'boolean') {
            cfg.auto_rotation_enabled = (cfg.mode !== 'manual');
        }
        if (cfg.mode === 'manual') {
            cfg.mode = 'time';
        }
        return cfg;
    }

    _loadConfigAsync() {
        return new Promise((resolve) => {
            const configPath = this._getConfigFilePath();
            const file = Gio.File.new_for_path(configPath);
            const defaults = this._getDefaultConfig();

            file.load_contents_async(this._cancellable, (source, res) => {
                try {
                    const [ok, contents] = source.load_contents_finish(res);
                    if (ok && contents) {
                        const decoder = new TextDecoder('utf-8');
                        const parsed = JSON.parse(decoder.decode(contents));
                        const merged = Object.assign({}, defaults, parsed);
                        this._sanitizeUserPaths(merged, defaults);
                        resolve(merged);
                        return;
                    }
                } catch (e) {
                    if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
                        // Si el archivo no existe o es inválido, se inicializa con valores por defecto
                    }
                }
                this._saveConfigAsync(defaults);
                resolve(defaults);
            });
        });
    }

    _saveConfigAsync(cfgToSave = this._cfg) {
        if (!cfgToSave || !this._cancellable || this._cancellable.is_cancelled()) return;

        this._savingInternal = true;
        if (this._saveFlagTimeoutId) {
            GLib.source_remove(this._saveFlagTimeoutId);
            this._saveFlagTimeoutId = 0;
        }

        const configPath = this._getConfigFilePath();
        const file = Gio.File.new_for_path(configPath);
        const encoder = new TextEncoder();
        const jsonString = JSON.stringify(cfgToSave, null, 4);
        const bytes = new GLib.Bytes(encoder.encode(jsonString));

        file.replace_contents_bytes_async(
            bytes,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            this._cancellable,
            (source, res) => {
                try {
                    source.replace_contents_finish(res);
                } catch (e) {
                    // Si el directorio ~/.config no existe aún, intentamos crearlo asíncronamente
                    const parent = file.get_parent();
                    if (parent) {
                        parent.make_directory_async(GLib.PRIORITY_DEFAULT, this._cancellable, (pSource, pRes) => {
                            try {
                                pSource.make_directory_finish(pRes);
                            } catch (err) {}
                            file.replace_contents_bytes_async(
                                bytes,
                                null,
                                false,
                                Gio.FileCreateFlags.REPLACE_DESTINATION,
                                this._cancellable,
                                () => {}
                            );
                        });
                    }
                } finally {
                    if (this._cancellable && !this._cancellable.is_cancelled()) {
                        this._saveFlagTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                            this._savingInternal = false;
                            this._saveFlagTimeoutId = 0;
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                }
            }
        );
    }

    // =========================================================================
    // INICIALIZACIÓN Y MONITOR DE CONFIGURACIÓN
    // =========================================================================

    async _initializeAsync() {
        const loadedCfg = await this._loadConfigAsync();
        if (!this._cancellable || this._cancellable.is_cancelled()) return;

        this._cfg = loadedCfg;

        // Sincronizar atajos de teclado nativos
        this._syncSettingsFromConfig();
        this._updateKeybindings();

        // Configurar monitor de archivo de configuración (~/.config/auto-wallpaper.json)
        this._setupConfigMonitor();

        // Escanear carpetas iniciales de forma asíncrona
        await this._refreshAllCachesAsync();
        if (!this._cancellable || this._cancellable.is_cancelled()) return;

        // Configurar monitores inotify sobre las carpetas de imágenes
        this._setupFolderMonitors();

        // Sincronizar estado inicial al arrancar la sesión
        const scheme = this._interfaceSettings.get_string('color-scheme');
        if (scheme === 'prefer-dark') {
            this._cfg.seen_dark = true;
        } else {
            this._cfg.seen_light = true;
        }

        if (this._cfg.force_reload) {
            const forceBoth = Boolean(this._cfg.force_both);
            this._cfg.force_reload = false;
            delete this._cfg.force_both;
            if (forceBoth) {
                this._cfg.known_count_light = this._imagesLight.length;
                this._cfg.known_count_dark = this._imagesDark.length;
            }
            this._rollWallpapers(forceBoth);
        } else {
            this._onThemeChanged(false);
            if (this._cfg.auto_rotation_enabled !== false) {
                const nowSec = Date.now() / 1000;
                if (!this._cfg.next_run || this._cfg.next_run <= 0) {
                    this._cfg.next_run = this._calculateNextRun(this._cfg);
                    this._saveConfigAsync();
                } else if (nowSec >= this._cfg.next_run) {
                    this._rollWallpapers(false);
                } else {
                    this._saveConfigAsync();
                }
            } else {
                this._saveConfigAsync();
            }
        }

        // Programar temporizador no bloqueante para el próximo cambio
        this._scheduleNextRunTimer();
    }

    _setupConfigMonitor() {
        if (this._configMonitor) {
            if (this._configMonitorSigId) {
                this._configMonitor.disconnect(this._configMonitorSigId);
                this._configMonitorSigId = 0;
            }
            this._configMonitor.cancel();
            this._configMonitor = null;
        }

        try {
            const cfgFile = Gio.File.new_for_path(this._getConfigFilePath());
            this._configMonitor = cfgFile.monitor_file(Gio.FileMonitorFlags.NONE, this._cancellable);
            this._configMonitorSigId = this._configMonitor.connect('changed', (mon, f1, f2, eventType) => {
                if (this._savingInternal) return;
                if (
                    eventType === Gio.FileMonitorEvent.CHANGED ||
                    eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
                    eventType === Gio.FileMonitorEvent.CREATED
                ) {
                    if (this._configDebounceId) {
                        GLib.source_remove(this._configDebounceId);
                    }
                    this._configDebounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
                        this._configDebounceId = 0;
                        this._onExternalConfigChanged();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
        } catch (e) {
            console.warn(`[AutoWallpaper] No se pudo monitorear config: ${e.message}`);
        }
    }

    async _onExternalConfigChanged() {
        if (!this._cancellable || this._cancellable.is_cancelled()) return;

        const prevLightDir = this._cfg?.dir_light;
        const prevDarkDir = this._cfg?.dir_dark;
        const prevShortcutsEnabled = this._cfg?.shortcuts_enabled;
        const prevShortcutNext = this._cfg?.shortcut_next;
        const prevShortcutReload = this._cfg?.shortcut_reload;

        const newCfg = await this._loadConfigAsync();
        if (!this._cancellable || this._cancellable.is_cancelled()) return;

        this._cfg = newCfg;

        // Si cambiaron los atajos en el JSON, sincronizarlos con GSettings y el WM
        if (
            newCfg.shortcuts_enabled !== prevShortcutsEnabled ||
            newCfg.shortcut_next !== prevShortcutNext ||
            newCfg.shortcut_reload !== prevShortcutReload
        ) {
            this._syncSettingsFromConfig();
            this._updateKeybindings();
        }

        // Si cambiaron las carpetas configuradas, actualizar caché y monitores
        const foldersChanged = (newCfg.dir_light !== prevLightDir || newCfg.dir_dark !== prevDarkDir);
        if (foldersChanged) {
            await this._refreshAllCachesAsync();
            if (!this._cancellable || this._cancellable.is_cancelled()) return;
            this._setupFolderMonitors();
        }

        // Procesar solicitud de recarga / siguiente fondo inmediata
        if (this._cfg.force_reload) {
            const forceBoth = Boolean(this._cfg.force_both);
            this._cfg.force_reload = false;
            delete this._cfg.force_both;

            if (forceBoth && !foldersChanged) {
                await this._refreshAllCachesAsync();
                if (!this._cancellable || this._cancellable.is_cancelled()) return;
            }
            if (forceBoth) {
                this._cfg.known_count_light = this._imagesLight.length;
                this._cfg.known_count_dark = this._imagesDark.length;
            }
            this._rollWallpapers(forceBoth);
            return;
        }

        // Verificar temporizador si la rotación automática está activa
        if (this._cfg.auto_rotation_enabled !== false) {
            if (!this._cfg.next_run || this._cfg.next_run <= 0) {
                this._cfg.next_run = this._calculateNextRun(this._cfg);
                this._saveConfigAsync();
            }
        }
        this._scheduleNextRunTimer();
    }

    // =========================================================================
    // ESCANEO ASÍNCRONO DE CARPETAS Y MONITORES INOTIFY (Gio.FileMonitor)
    // =========================================================================

    _isValidImageInfo(fileName, info) {
        if (!fileName || fileName.startsWith('.')) return false;

        const dotIdx = fileName.lastIndexOf('.');
        if (dotIdx !== -1) {
            const ext = fileName.substring(dotIdx).toLowerCase();
            if (VALID_EXTENSIONS.has(ext)) return true;
        }

        if (info) {
            try {
                const contentType = info.get_content_type();
                if (contentType && contentType.startsWith('image/') && !contentType.includes('svg')) {
                    return true;
                }
            } catch (e) {}
        }

        return false;
    }

    _enumerateSingleDirAsync(folderPath) {
        return new Promise((resolve) => {
            if (!folderPath || !this._cancellable || this._cancellable.is_cancelled()) {
                resolve([]);
                return;
            }

            const folder = Gio.File.new_for_path(folderPath);
            folder.enumerate_children_async(
                'standard::name,standard::type,standard::content-type',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                GLib.PRIORITY_LOW,
                this._cancellable,
                (source, res) => {
                    let enumerator;
                    try {
                        enumerator = source.enumerate_children_finish(res);
                    } catch (e) {
                        resolve([]);
                        return;
                    }

                    const foundUris = [];

                    const nextBatch = () => {
                        if (!this._cancellable || this._cancellable.is_cancelled()) {
                            enumerator.close_async(GLib.PRIORITY_LOW, null, null);
                            resolve(foundUris);
                            return;
                        }

                        enumerator.next_files_async(
                            64,
                            GLib.PRIORITY_LOW,
                            this._cancellable,
                            (enumSource, enumRes) => {
                                try {
                                    const files = enumSource.next_files_finish(enumRes);
                                    if (!files || files.length === 0) {
                                        enumerator.close_async(GLib.PRIORITY_LOW, null, null);
                                        resolve(foundUris);
                                        return;
                                    }

                                    for (const info of files) {
                                        if (info.get_file_type() === Gio.FileType.REGULAR) {
                                            const name = info.get_name();
                                            if (this._isValidImageInfo(name, info)) {
                                                const child = folder.get_child(name);
                                                foundUris.push(child.get_uri());
                                            }
                                        }
                                    }

                                    nextBatch();
                                } catch (e) {
                                    enumerator.close_async(GLib.PRIORITY_LOW, null, null);
                                    resolve(foundUris);
                                }
                            }
                        );
                    };

                    nextBatch();
                }
            );
        });
    }

    async _scanThemeFolderAsync(baseDir) {
        if (!baseDir) return [];
        const mainUris = await this._enumerateSingleDirAsync(baseDir);
        const pinnedDir = GLib.build_filenamev([baseDir, PINNED_DIR_NAME]);
        const pinnedUris = await this._enumerateSingleDirAsync(pinnedDir);
        return [...mainUris, ...pinnedUris];
    }

    async _refreshThemeCacheAsync(theme) {
        if (!this._cfg || !this._cancellable || this._cancellable.is_cancelled()) return;

        if (theme === 'light') {
            this._imagesLight = await this._scanThemeFolderAsync(this._cfg.dir_light);
        } else {
            this._imagesDark = await this._scanThemeFolderAsync(this._cfg.dir_dark);
        }
    }

    async _refreshAllCachesAsync() {
        if (!this._cfg || !this._cancellable || this._cancellable.is_cancelled()) return;
        const [lightUris, darkUris] = await Promise.all([
            this._scanThemeFolderAsync(this._cfg.dir_light),
            this._scanThemeFolderAsync(this._cfg.dir_dark),
        ]);
        this._imagesLight = lightUris;
        this._imagesDark = darkUris;
    }

    _setupFolderMonitors() {
        this._cleanupFolderMonitors();
        if (!this._cfg || !this._cancellable || this._cancellable.is_cancelled()) return;

        const watchTheme = (theme, baseDir) => {
            if (!baseDir) return;
            const pinnedDir = GLib.build_filenamev([baseDir, PINNED_DIR_NAME]);
            const parentDir = GLib.path_get_dirname(baseDir);

            // Monitoreamos tanto la carpeta base como pinned/ y el padre (por si se crea después)
            const candidatePaths = [baseDir, pinnedDir];
            if (parentDir && parentDir !== baseDir) {
                candidatePaths.push(parentDir);
            }

            for (const path of candidatePaths) {
                try {
                    const gfile = Gio.File.new_for_path(path);
                    const mon = gfile.monitor_directory(Gio.FileMonitorFlags.NONE, this._cancellable);
                    const sigId = mon.connect('changed', (monitor, file, otherFile, eventType) => {
                        const relevantEvents = [
                            Gio.FileMonitorEvent.CREATED,
                            Gio.FileMonitorEvent.DELETED,
                            Gio.FileMonitorEvent.MOVED_IN,
                            Gio.FileMonitorEvent.MOVED_OUT,
                            Gio.FileMonitorEvent.RENAMED,
                            Gio.FileMonitorEvent.MOVED,
                            Gio.FileMonitorEvent.CHANGES_DONE_HINT,
                        ];
                        if (!relevantEvents.includes(eventType)) return;

                        this._scheduleFolderCacheRefresh(theme);
                    });
                    this._folderMonitors.push({ mon, sigId });
                } catch (e) {
                    // Ignorar si alguna ruta aún no existe
                }
            }
        };

        watchTheme('light', this._cfg.dir_light);
        watchTheme('dark', this._cfg.dir_dark);
    }

    _scheduleFolderCacheRefresh(theme) {
        if (theme === 'light') {
            if (this._folderDebounceLightId) {
                GLib.source_remove(this._folderDebounceLightId);
            }
            this._folderDebounceLightId = GLib.timeout_add(GLib.PRIORITY_LOW, 350, () => {
                this._folderDebounceLightId = 0;
                this._refreshThemeCacheAsync('light');
                return GLib.SOURCE_REMOVE;
            });
        } else {
            if (this._folderDebounceDarkId) {
                GLib.source_remove(this._folderDebounceDarkId);
            }
            this._folderDebounceDarkId = GLib.timeout_add(GLib.PRIORITY_LOW, 350, () => {
                this._folderDebounceDarkId = 0;
                this._refreshThemeCacheAsync('dark');
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _cleanupFolderMonitors() {
        if (this._folderMonitors) {
            for (const item of this._folderMonitors) {
                try {
                    if (item.sigId) item.mon.disconnect(item.sigId);
                    item.mon.cancel();
                } catch (e) {}
            }
        }
        this._folderMonitors = [];
    }

    // =========================================================================
    // MOTOR DE ROTACIÓN Y SINCRONIZACIÓN DE TEMA EN TIEMPO REAL
    // =========================================================================

    _isValidSavedWallpaper(uri, theme) {
        if (!uri || typeof uri !== 'string') return false;
        if (uri.includes(`/${EXCLUDE_DIR_NAME}/`)) return false;

        const cache = (theme === 'dark') ? this._imagesDark : this._imagesLight;
        if (cache.length > 0 && cache.includes(uri)) {
            return true;
        }

        // Si el fondo fue elegido manualmente fuera de la colección, verificar formato de URI válido
        try {
            const [path] = GLib.filename_from_uri(uri);
            if (!path || path.includes(`/${EXCLUDE_DIR_NAME}/`)) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    _getNextImageUri(theme) {
        const images = (theme === 'dark') ? this._imagesDark : this._imagesLight;
        if (!images || images.length === 0) return null;

        if (this._cfg.sequence_mode !== 'random-sequential') {
            const idx = Math.floor(Math.random() * images.length);
            return images[idx];
        }

        const stateKey = `unshown_${theme}`;
        const imageSet = new Set(images);
        let unshown = Array.isArray(this._cfg[stateKey])
            ? this._cfg[stateKey].filter((uri) => imageSet.has(uri))
            : [];

        if (unshown.length === 0) {
            unshown = [...images];
        }

        const chosenIdx = Math.floor(Math.random() * unshown.length);
        const chosen = unshown[chosenIdx];
        unshown.splice(chosenIdx, 1);

        this._cfg[stateKey] = unshown;
        return chosen;
    }

    _rollWallpapers(forceBoth = false) {
        if (!this._cfg || !this._bgSettings || !this._interfaceSettings) return;

        const scheme = this._interfaceSettings.get_string('color-scheme');
        const isDarkActive = (scheme === 'prefer-dark');

        if (isDarkActive) {
            this._cfg.seen_dark = true;
        } else {
            this._cfg.seen_light = true;
        }

        const shouldRollDark =
            forceBoth ||
            Boolean(this._cfg.seen_dark) ||
            !this._isValidSavedWallpaper(this._cfg.saved_dark, 'dark');

        const shouldRollLight =
            forceBoth ||
            Boolean(this._cfg.seen_light) ||
            !this._isValidSavedWallpaper(this._cfg.saved_light, 'light');

        if (shouldRollDark) {
            const imgDark = this._getNextImageUri('dark');
            if (imgDark) {
                this._bgSettings.set_string('picture-uri-dark', imgDark);
                this._cfg.saved_dark = imgDark;
                this._cfg.seen_dark = isDarkActive || forceBoth;
            }
        }

        if (shouldRollLight) {
            const imgLight = this._getNextImageUri('light');
            if (imgLight) {
                this._bgSettings.set_string('picture-uri', imgLight);
                this._cfg.saved_light = imgLight;
                this._cfg.seen_light = !isDarkActive || forceBoth;
            }
        }

        this._cfg.next_run = this._calculateNextRun(this._cfg);
        this._saveConfigAsync();
        this._scheduleNextRunTimer();
    }

    _rollSingleWallpaper(scheme) {
        if (!this._cfg || !this._bgSettings) return;

        if (scheme === 'prefer-dark') {
            const img = this._getNextImageUri('dark');
            if (img) {
                this._bgSettings.set_string('picture-uri-dark', img);
                this._cfg.saved_dark = img;
                this._cfg.seen_dark = true;
            }
        } else {
            const img = this._getNextImageUri('light');
            if (img) {
                this._bgSettings.set_string('picture-uri', img);
                this._cfg.saved_light = img;
                this._cfg.seen_light = true;
            }
        }
    }

    _onThemeChanged(saveAfter = true) {
        if (!this._cfg || !this._bgSettings || !this._interfaceSettings) return;

        const scheme = this._interfaceSettings.get_string('color-scheme');
        const isDark = (scheme === 'prefer-dark');
        const seenKey = isDark ? 'seen_dark' : 'seen_light';
        const savedKey = isDark ? 'saved_dark' : 'saved_light';
        const bgKey = isDark ? 'picture-uri-dark' : 'picture-uri';
        const themeName = isDark ? 'dark' : 'light';

        const wasUnseen = !this._cfg[seenKey];
        this._cfg[seenKey] = true;

        if (!this._isValidSavedWallpaper(this._cfg[savedKey], themeName)) {
            this._rollSingleWallpaper(scheme);
        } else {
            // Garantizar que el fondo activo del tema esté sincronizado con GSettings
            const currentBgUri = this._bgSettings.get_string(bgKey);
            if (this._cfg[savedKey] && currentBgUri !== this._cfg[savedKey]) {
                this._bgSettings.set_string(bgKey, this._cfg[savedKey]);
            }
        }

        const hasWallpaper = this._isValidSavedWallpaper(this._cfg[savedKey], themeName);
        if (
            wasUnseen &&
            hasWallpaper &&
            this._cfg.reset_on_style_change !== false &&
            this._cfg.mode === 'time' &&
            this._cfg.auto_rotation_enabled !== false
        ) {
            this._cfg.next_run = this._calculateNextRun(this._cfg);
            this._scheduleNextRunTimer();
        }

        if (saveAfter) {
            this._saveConfigAsync();
        }
    }

    _calculateNextRun(cfg) {
        if (!cfg || cfg.auto_rotation_enabled === false || cfg.mode === 'manual') {
            return 0;
        }
        const now = new Date();
        if (cfg.mode === 'time') {
            const minutes = Math.max(1, Number(cfg.interval) || 30);
            return (now.getTime() + minutes * 60 * 1000) / 1000;
        } else if (cfg.mode === 'day') {
            const tStr = String(cfg.day_time || '12:00');
            const match = tStr.match(/^([0-1]?[0-9]|2[0-3]):?([0-5][0-9])$/);
            let hr = 12;
            let mn = 0;
            if (match) {
                hr = parseInt(match[1], 10);
                mn = parseInt(match[2], 10);
            }
            const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hr, mn, 0, 0);
            const daysInterval = Math.max(1, Number(cfg.interval) || 1);
            if (now >= target) {
                target.setDate(target.getDate() + daysInterval);
            } else {
                target.setDate(target.getDate() + Math.max(0, daysInterval - 1));
            }
            return target.getTime() / 1000;
        }
        return 0;
    }

    _scheduleNextRunTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }

        if (!this._cfg || !this._cancellable || this._cancellable.is_cancelled()) return;
        if (this._cfg.auto_rotation_enabled === false || this._cfg.mode === 'manual') {
            return;
        }

        const nowSec = Date.now() / 1000;
        if (!this._cfg.next_run || this._cfg.next_run <= 0) {
            this._cfg.next_run = this._calculateNextRun(this._cfg);
            this._saveConfigAsync();
        }

        const delaySec = Math.max(1, Math.ceil(this._cfg.next_run - nowSec));
        const waitSec = Math.min(delaySec, 3600);

        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, waitSec, () => {
            this._timerId = 0;
            this._onTimerTick();
            return GLib.SOURCE_REMOVE;
        });
    }

    _onTimerTick() {
        if (!this._cfg || !this._cancellable || this._cancellable.is_cancelled()) return;
        if (this._cfg.auto_rotation_enabled === false || this._cfg.mode === 'manual') {
            return;
        }

        const nowSec = Date.now() / 1000;
        if (!this._cfg.next_run || this._cfg.next_run <= 0) {
            this._cfg.next_run = this._calculateNextRun(this._cfg);
            this._saveConfigAsync();
            this._scheduleNextRunTimer();
        } else if (nowSec >= this._cfg.next_run) {
            this._rollWallpapers(false);
        } else {
            this._scheduleNextRunTimer();
        }
    }

    // =========================================================================
    // ATAJOS DE TECLADO NATIVOS (Main.wm.addKeybinding)
    // =========================================================================

    _syncSettingsFromConfig() {
        if (!this._extSettings || !this._cfg) return;
        try {
            const enabled = Boolean(this._cfg.shortcuts_enabled);
            if (this._extSettings.get_boolean('shortcuts-enabled') !== enabled) {
                this._extSettings.set_boolean('shortcuts-enabled', enabled);
            }

            const nextAccel = this._cfg.shortcut_next || '<Super>w';
            const curNext = this._extSettings.get_strv('shortcut-next');
            if (!curNext || curNext[0] !== nextAccel) {
                this._extSettings.set_strv('shortcut-next', [nextAccel]);
            }

            const reloadAccel = this._cfg.shortcut_reload || '<Super><Alt>w';
            const curReload = this._extSettings.get_strv('shortcut-reload');
            if (!curReload || curReload[0] !== reloadAccel) {
                this._extSettings.set_strv('shortcut-reload', [reloadAccel]);
            }
        } catch (e) {}
    }

    _syncKeybindingsFromSettings() {
        if (!this._extSettings || !this._cfg) return;
        try {
            const enabled = this._extSettings.get_boolean('shortcuts-enabled');
            const nextArr = this._extSettings.get_strv('shortcut-next');
            const reloadArr = this._extSettings.get_strv('shortcut-reload');

            this._cfg.shortcuts_enabled = enabled;
            if (nextArr && nextArr.length > 0) this._cfg.shortcut_next = nextArr[0];
            if (reloadArr && reloadArr.length > 0) this._cfg.shortcut_reload = reloadArr[0];
            this._updateKeybindings();
        } catch (e) {}
    }

    _updateKeybindings() {
        this._removeKeybindings();

        if (!this._extSettings || !this._cfg || !this._cfg.shortcuts_enabled) {
            return;
        }

        try {
            Main.wm.addKeybinding(
                'shortcut-next',
                this._extSettings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => {
                    this._rollWallpapers(false);
                }
            );

            Main.wm.addKeybinding(
                'shortcut-reload',
                this._extSettings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => {
                    this._handleReloadShortcutAsync();
                }
            );

            this._keybindingsRegistered = true;
        } catch (e) {
            console.warn(`[AutoWallpaper] Error registrando atajos nativos: ${e.message}`);
        }
    }

    async _handleReloadShortcutAsync() {
        if (!this._cfg) return;
        this._cfg.unshown_light = [];
        this._cfg.unshown_dark = [];
        await this._refreshAllCachesAsync();
        if (!this._cancellable || this._cancellable.is_cancelled()) return;
        this._cfg.known_count_light = this._imagesLight.length;
        this._cfg.known_count_dark = this._imagesDark.length;
        this._rollWallpapers(true);
    }

    _removeKeybindings() {
        if (!this._keybindingsRegistered) return;
        try {
            Main.wm.removeKeybinding('shortcut-next');
        } catch (e) {}
        try {
            Main.wm.removeKeybinding('shortcut-reload');
        } catch (e) {}
        this._keybindingsRegistered = false;
    }
}
