import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';
import { initI18n, _ } from './i18n.js';

export default class AutoWallpaperPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(720, 680);
        window.set_title(_("Auto Wallpaper"));

        const localeDir = GLib.build_filenamev([this.path, 'locale']);
        try {
            this.initTranslations();
        } catch (e) {}
        initI18n(localeDir);

        // Cargar hoja de estilos CSS
        this._loadStyles();

        this._isToggling = false;

        // Cargar configuración persistente de auto-wallpaper.json
        const cfg = this._loadConfigFile();

        // Conexión con GSettings de GNOME
        const bgSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
        const interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

        // Página principal
        const page = new Adw.PreferencesPage({
            title: _("Appearance"),
            icon_name: 'preferences-desktop-wallpaper-symbolic',
        });
        window.add(page);

        // =====================================================================
        // SECCIÓN 1: ESTILO (Previsualización fija 16:9 con recorte Cover)
        // =====================================================================
        const styleGroup = new Adw.PreferencesGroup({
            title: _("Style"),
            description: _("Click on a thumbnail to change the wallpaper for the corresponding theme."),
        });
        page.add(styleGroup);

        const cardContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['style-container-card'],
            halign: Gtk.Align.CENTER,
            margin_top: 8,
            margin_bottom: 4,
        });
        styleGroup.add(cardContainer);

        const thumbnailsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 28,
            halign: Gtk.Align.CENTER,
        });
        cardContainer.append(thumbnailsBox);

        // Dimensiones 16:9 idénticas y estrictas
        const PREVIEW_WIDTH = 240;
        const PREVIEW_HEIGHT = 135;

        // --- Columna 1: Predeterminado (Claro) ---
        const colLight = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            halign: Gtk.Align.CENTER,
        });

        const btnLight = new Gtk.Button({
            css_classes: ['flat', 'wallpaper-thumbnail-btn'],
            tooltip_text: _("Click to change light wallpaper (Default)"),
            width_request: PREVIEW_WIDTH,
            height_request: PREVIEW_HEIGHT,
        });

        const picLight = new Gtk.Picture({
            content_fit: Gtk.ContentFit.COVER,
            can_shrink: true,
            width_request: PREVIEW_WIDTH,
            height_request: PREVIEW_HEIGHT,
            css_classes: ['wallpaper-preview-img'],
        });
        btnLight.set_child(picLight);
        colLight.append(btnLight);

        const lblLight = new Gtk.Label({
            label: _("Default"),
            css_classes: ['wallpaper-title-label', 'title-4'],
        });
        colLight.append(lblLight);
        thumbnailsBox.append(colLight);

        // --- Columna 2: Oscuro (Dark) ---
        const colDark = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            halign: Gtk.Align.CENTER,
        });

        const btnDark = new Gtk.Button({
            css_classes: ['flat', 'wallpaper-thumbnail-btn'],
            tooltip_text: _("Click to change dark wallpaper (Dark)"),
            width_request: PREVIEW_WIDTH,
            height_request: PREVIEW_HEIGHT,
        });

        const picDark = new Gtk.Picture({
            content_fit: Gtk.ContentFit.COVER,
            can_shrink: true,
            width_request: PREVIEW_WIDTH,
            height_request: PREVIEW_HEIGHT,
            css_classes: ['wallpaper-preview-img'],
        });
        btnDark.set_child(picDark);
        colDark.append(btnDark);

        const lblDark = new Gtk.Label({
            label: _("Dark"),
            css_classes: ['wallpaper-title-label', 'title-4'],
        });
        colDark.append(lblDark);
        thumbnailsBox.append(colDark);

        // --- Notificación discreta de una sola línea pegada a la Sección 1 ---
        const noticeRevealer = new Gtk.Revealer({
            transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
            transition_duration: 180,
            reveal_child: false,
        });
        cardContainer.append(noticeRevealer);

        const noticeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            halign: Gtk.Align.CENTER,
            css_classes: ['subtle-theme-notice'],
        });
        noticeRevealer.set_child(noticeBox);

        const lblNoticePrefix = new Gtk.Label({
            css_classes: ['subtle-notice-text'],
        });
        const btnNoticeAction = new Gtk.Button({
            label: _("changing theme"),
            css_classes: ['flat', 'subtle-notice-link'],
        });
        noticeBox.append(lblNoticePrefix);
        noticeBox.append(btnNoticeAction);

        let pendingTargetScheme = null;

        const showThemeNotice = (themeName, targetScheme) => {
            pendingTargetScheme = targetScheme;
            lblNoticePrefix.set_label(`${_("Wallpaper changed for theme")} ${themeName}, ${_("view it by")} `);
            noticeRevealer.set_reveal_child(true);
        };

        const hideThemeNotice = () => {
            noticeRevealer.set_reveal_child(false);
            pendingTargetScheme = null;
        };

        btnNoticeAction.connect('clicked', () => {
            if (pendingTargetScheme) {
                interfaceSettings.set_string('color-scheme', pendingTargetScheme);
                hideThemeNotice();
            }
        });

        let updateCurrentWallpaperRow = null;

        // Actualizar miniaturas y bordes de acento
        const refreshPreviews = () => {
            const uriLight = bgSettings.get_string('picture-uri');
            const uriDark = bgSettings.get_string('picture-uri-dark');
            this._updatePicture(picLight, uriLight, PREVIEW_WIDTH, PREVIEW_HEIGHT);
            this._updatePicture(picDark, uriDark, PREVIEW_WIDTH, PREVIEW_HEIGHT);
            if (updateCurrentWallpaperRow) updateCurrentWallpaperRow();
        };

        const refreshActiveStyle = () => {
            const scheme = interfaceSettings.get_string('color-scheme');
            const isDark = (scheme === 'prefer-dark');

            if (isDark) {
                btnDark.add_css_class('active-style');
                btnLight.remove_css_class('active-style');
            } else {
                btnLight.add_css_class('active-style');
                btnDark.remove_css_class('active-style');
            }
        };

        refreshPreviews();
        refreshActiveStyle();

        // Eventos de selección manual de fondo
        btnLight.connect('clicked', () => {
            this._openImageChooser(window, _("Select light wallpaper"), (filePath, fileUri) => {
                bgSettings.set_string('picture-uri', fileUri);
                this._syncConfigFile({ saved_light: fileUri });
                this._updatePicture(picLight, fileUri, PREVIEW_WIDTH, PREVIEW_HEIGHT);

                const currentScheme = interfaceSettings.get_string('color-scheme');
                if (currentScheme === 'prefer-dark') {
                    showThemeNotice(_("Default").toLowerCase(), 'default');
                } else {
                    hideThemeNotice();
                }
            });
        });

        btnDark.connect('clicked', () => {
            this._openImageChooser(window, _("Select dark wallpaper"), (filePath, fileUri) => {
                bgSettings.set_string('picture-uri-dark', fileUri);
                this._syncConfigFile({ saved_dark: fileUri });
                this._updatePicture(picDark, fileUri, PREVIEW_WIDTH, PREVIEW_HEIGHT);

                const currentScheme = interfaceSettings.get_string('color-scheme');
                if (currentScheme !== 'prefer-dark') {
                    showThemeNotice(_("Dark").toLowerCase(), 'prefer-dark');
                } else {
                    hideThemeNotice();
                }
            });
        });

        // =====================================================================
        // SUBSECCIÓN 1: CONJUNTOS DE FONDOS (Carpetas hasta arriba)
        // =====================================================================
        const foldersGroup = new Adw.PreferencesGroup({
            title: _("Wallpaper Folders"),
            description: _("Select the image folders assigned to each theme."),
        });
        page.add(foldersGroup);

        // Banner informativo si ninguna carpeta contiene imágenes válidas
        const emptyNoticeRevealer = new Gtk.Revealer({
            transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
            transition_duration: 200,
            reveal_child: false,
        });
        foldersGroup.add(emptyNoticeRevealer);

        const emptyNoticeRow = new Adw.ActionRow({
            title: _("No compatible images detected in collections"),
            subtitle: _("Add wallpapers to folders or select one containing images to enable rotation and tools."),
            icon_name: 'dialog-information-symbolic',
            css_classes: ['subtle-theme-notice'],
        });
        emptyNoticeRevealer.set_child(emptyNoticeRow);

        // --- Carpeta de fondos claros ---
        const rowLight = new Adw.ActionRow({
            title: _("Light Collection"),
            subtitle: cfg.dir_light || GLib.build_filenamev([this._getPicturesDir(), 'wallpapers', 'light']),
        });
        const btnLightNautilus = new Gtk.Button({
            icon_name: 'folder-symbolic',
            css_classes: ['flat'],
            tooltip_text: _("Open folder in Files"),
        });
        const btnLightFolder = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            css_classes: ['flat'],
            tooltip_text: _("Change selected folder"),
        });
        rowLight.add_suffix(btnLightNautilus);
        rowLight.add_suffix(btnLightFolder);
        foldersGroup.add(rowLight);

        // --- Carpeta de fondos oscuros ---
        const rowDark = new Adw.ActionRow({
            title: _("Dark Collection"),
            subtitle: cfg.dir_dark || GLib.build_filenamev([this._getPicturesDir(), 'wallpapers', 'dark']),
        });
        const btnDarkNautilus = new Gtk.Button({
            icon_name: 'folder-symbolic',
            css_classes: ['flat'],
            tooltip_text: _("Open folder in Files"),
        });
        const btnDarkFolder = new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            css_classes: ['flat'],
            tooltip_text: _("Change selected folder"),
        });
        rowDark.add_suffix(btnDarkNautilus);
        rowDark.add_suffix(btnDarkFolder);
        foldersGroup.add(rowDark);

        // =====================================================================
        // SUBSECCIÓN 2: ROTACIÓN DE FONDOS DEL CONJUNTO
        // Contiene en la misma sección: 1. Estado del servicio (y sus 3 botones) y 2. Secuencia de rotación
        // =====================================================================
        const rotGroup = new Adw.PreferencesGroup({
            title: _("Collection Wallpaper Rotation"),
            description: _("Configure the order in which images are cycled."),
        });
        page.add(rotGroup);

        // --- Notificación discreta de cambios detectados en las carpetas ---
        let reloadNoticeDismissed = false;

        const reloadNoticeRevealer = new Gtk.Revealer({
            transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
            transition_duration: 180,
            reveal_child: false,
        });
        rotGroup.add(reloadNoticeRevealer);

        const reloadNoticeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            halign: Gtk.Align.CENTER,
            margin_bottom: 8,
            css_classes: ['subtle-theme-notice'],
        });
        reloadNoticeRevealer.set_child(reloadNoticeBox);

        const lblReloadPrefix = new Gtk.Label({
            label: _("Changes detected in stored wallpapers. "),
            css_classes: ['subtle-notice-text'],
        });
        const btnReloadLink = new Gtk.Button({
            label: _("Reload"),
            css_classes: ['flat', 'subtle-notice-link'],
            tooltip_text: _("Reload wallpapers now"),
        });
        const lblReloadSuffix = new Gtk.Label({
            label: _(" to update wallpapers"),
            css_classes: ['subtle-notice-text'],
        });
        const btnCloseReloadNotice = new Gtk.Button({
            icon_name: 'window-close-symbolic',
            css_classes: ['flat', 'subtle-notice-close'],
            tooltip_text: _("Dismiss notice"),
        });

        reloadNoticeBox.append(lblReloadPrefix);
        reloadNoticeBox.append(btnReloadLink);
        reloadNoticeBox.append(lblReloadSuffix);
        reloadNoticeBox.append(btnCloseReloadNotice);

        const showReloadNotice = () => {
            if (!reloadNoticeDismissed) {
                reloadNoticeRevealer.set_reveal_child(true);
            }
        };

        const hideReloadNotice = () => {
            reloadNoticeRevealer.set_reveal_child(false);
        };

        btnCloseReloadNotice.connect('clicked', () => {
            reloadNoticeDismissed = true;
            hideReloadNotice();
        });

        // 1. Tarjeta: Estado del servicio (información + 3 botones)
        const statusCard = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            selection_mode: Gtk.SelectionMode.NONE,
            margin_bottom: 12,
        });
        rotGroup.add(statusCard);

        // Fila 1: Información de Estado (ancho completo, sin salto de línea)
        const statusInfoRow = new Adw.ActionRow({
            title: _("Background Service"),
            subtitle: _("Checking status..."),
        });
        statusCard.append(statusInfoRow);

        // Fila 2 (Subelemento abajo): Barra con los 3 botones bien proporcionados
        const buttonsRow = new Gtk.ListBoxRow({
            activatable: false,
            selectable: false,
        });

        const buttonsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            homogeneous: true,
            hexpand: true,
            margin_top: 6,
            margin_bottom: 6,
            margin_start: 12,
            margin_end: 12,
        });

        // 1. Siguiente
        const btnNext = new Gtk.Button({
            child: new Adw.ButtonContent({
                icon_name: 'media-skip-forward-symbolic',
                label: _("Next"),
            }),
            css_classes: ['flat'],
            tooltip_text: _("Skip to next wallpaper in current sequence"),
        });

        // 2. Barajar
        const btnShuffle = new Gtk.Button({
            child: new Adw.ButtonContent({
                icon_name: 'media-playlist-shuffle-symbolic',
                label: _("Shuffle"),
            }),
            css_classes: ['flat'],
            tooltip_text: _("Shuffle pending wallpapers without restarting the cycle"),
        });

        // 3. Recargar
        const btnReload = new Gtk.Button({
            child: new Adw.ButtonContent({
                icon_name: 'view-refresh-symbolic',
                label: _("Reload"),
            }),
            css_classes: ['flat'],
            tooltip_text: _("Rescan folders, reset the entire deck, and apply new wallpapers"),
        });

        buttonsBox.append(btnNext);
        buttonsBox.append(btnShuffle);
        buttonsBox.append(btnReload);
        buttonsRow.set_child(buttonsBox);
        statusCard.append(buttonsRow);

        // 2. Tarjeta: Secuencia de rotación (separada de la tarjeta superior)
        const seqCard = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            selection_mode: Gtk.SelectionMode.NONE,
        });
        rotGroup.add(seqCard);

        const currentSeqIndex = (cfg.sequence_mode === 'random-sequential') ? 1 : 0;
        const seqCombo = new Adw.ComboRow({
            title: _("Rotation sequence"),
            model: new Gtk.StringList({
                strings: [
                    _("Random"),
                    _("Random without repeats (full deck)"),
                ],
            }),
            selected: currentSeqIndex,
        });
        seqCard.append(seqCombo);

        // =====================================================================
        // SUBSECCIÓN 4: ROTACIÓN AUTOMÁTICA (Activar, Frecuencia, Parámetros)
        // =====================================================================
        const autoGroup = new Adw.PreferencesGroup({
            title: _("Automatic rotation"),
            description: _("Timer and background change automation."),
        });
        page.add(autoGroup);

        // 1. Activar rotación automática
        const switchAuto = new Adw.SwitchRow({
            title: _("Enable automatic rotation"),
            subtitle: _("Enable service to switch wallpapers based on scheduled frequency"),
        });
        autoGroup.add(switchAuto);

        // Contenedor animado para Frecuencia y sus Parámetros
        const autoParamsRevealer = new Gtk.Revealer({
            transition_type: Gtk.RevealerTransitionType.SLIDE_DOWN,
            transition_duration: 250,
            reveal_child: false,
        });
        autoGroup.add(autoParamsRevealer);

        const autoParamsBoxList = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            selection_mode: Gtk.SelectionMode.NONE,
            margin_top: 6,
        });
        autoParamsRevealer.set_child(autoParamsBoxList);

        // 2. Frecuencia (Solo intervalo o diario, sin modo manual innecesario)
        let currentModeIndex = (cfg.mode === 'day') ? 1 : 0;

        const modeCombo = new Adw.ComboRow({
            title: _("Switch frequency"),
            model: new Gtk.StringList({
                strings: [
                    _("Time interval (minutes)"),
                    _("Fixed daily time"),
                ],
            }),
            selected: currentModeIndex,
        });
        autoParamsBoxList.append(modeCombo);

        // 3. Parámetros de la frecuencia
        // Filas para intervalo en horas y minutos
        const initTotalMinutes = (cfg.mode === 'time' && cfg.interval) ? cfg.interval : 30;
        let initHours = Math.floor(initTotalMinutes / 60);
        let initMinutes = initTotalMinutes % 60;
        if (initHours === 0 && initMinutes === 0) {
            initMinutes = 1;
        }

        const spinHours = new Adw.SpinRow({
            title: _("Hours between switches"),
            subtitle: _("Hours each wallpaper remains active"),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 72,
                step_increment: 1,
                page_increment: 1,
                value: initHours,
            }),
            visible: (cfg.mode !== 'day'),
        });
        autoParamsBoxList.append(spinHours);

        const spinMinutes = new Adw.SpinRow({
            title: _("Minutes between switches"),
            subtitle: _("Additional minutes (0 to 59)"),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 59,
                step_increment: 1,
                page_increment: 5,
                value: initMinutes,
            }),
            visible: (cfg.mode !== 'day'),
        });
        autoParamsBoxList.append(spinMinutes);

        // Fila para hora exacta diaria con selector de tiempo específico (HH : MM)
        const rowDayTime = new Adw.ActionRow({
            title: _("Daily switch time"),
            subtitle: _("Scheduled time to rotate wallpaper each day (24h format)"),
            visible: (cfg.mode === 'day'),
        });

        const timeBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });

        let initH = 12, initM = 0;
        if (cfg.day_time) {
            const parts = cfg.day_time.split(':');
            if (parts.length === 2) {
                initH = parseInt(parts[0], 10) || 0;
                initM = parseInt(parts[1], 10) || 0;
            }
        }

        const spinHour = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 23, step_increment: 1, page_increment: 2, value: initH }),
            wrap: true,
            numeric: true,
            valign: Gtk.Align.CENTER,
            tooltip_text: _("Hour (00 to 23)"),
        });
        spinHour.connect('output', () => {
            const v = Math.floor(spinHour.get_value());
            spinHour.set_text(v.toString().padStart(2, '0'));
            return true;
        });

        const lblColon = new Gtk.Label({
            label: ':',
            valign: Gtk.Align.CENTER,
            css_classes: ['title-2'],
        });

        const spinMinute = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 59, step_increment: 1, page_increment: 5, value: initM }),
            wrap: true,
            numeric: true,
            valign: Gtk.Align.CENTER,
            tooltip_text: _("Minutes (00 to 59)"),
        });
        spinMinute.connect('output', () => {
            const v = Math.floor(spinMinute.get_value());
            spinMinute.set_text(v.toString().padStart(2, '0'));
            return true;
        });

        timeBox.append(spinHour);
        timeBox.append(lblColon);
        timeBox.append(spinMinute);
        rowDayTime.add_suffix(timeBox);
        autoParamsBoxList.append(rowDayTime);

        const spinDayDays = new Adw.SpinRow({
            title: _("Days between switches"),
            subtitle: _("Frequency in days for daily rotation"),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 30,
                step_increment: 1,
                page_increment: 2,
                value: (cfg.mode === 'day' && cfg.interval) ? cfg.interval : 1,
            }),
            visible: (cfg.mode === 'day'),
        });
        autoParamsBoxList.append(spinDayDays);

        // 4. Contar cambio de estilo no visto en la rotación
        const switchResetOnStyleChange = new Adw.SwitchRow({
            title: _("Count unseen style change as rotation"),
            subtitle: _("When switching between light and dark, if the wallpaper was not yet seen, restart the timer (interval mode only)"),
            active: (cfg.reset_on_style_change !== false),
            sensitive: (cfg.mode !== 'day'),
        });
        autoParamsBoxList.append(switchResetOnStyleChange);

        // =====================================================================
        // SECCIÓN 3: HERRAMIENTAS Y MANTENIMIENTO
        // =====================================================================
        const toolsGroup = new Adw.PreferencesGroup({
            title: _("Tools and Maintenance"),
            description: _("Maintenance, active wallpaper management, smart organization, and optimization."),
        });
        page.add(toolsGroup);

        // --- Fila 1: Gestión rápida del fondo actual ---
        const currentWpRow = new Adw.ActionRow({
            title: _("Current wallpaper on screen"),
            subtitle: _("Detecting active wallpaper..."),
        });
        const iconCurrentWp = new Gtk.Image({
            icon_name: 'camera-photo-symbolic',
        });
        currentWpRow.add_prefix(iconCurrentWp);

        const currentActionsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });
        currentWpRow.add_suffix(currentActionsBox);

        const btnLocateWp = new Gtk.Button({
            icon_name: 'folder-symbolic',
            css_classes: ['flat'],
            tooltip_text: _("Locate and show file in Files (Nautilus)"),
        });
        const btnPinWp = new Gtk.Button({
            icon_name: 'view-pin-symbolic',
            css_classes: ['flat'],
            tooltip_text: _("Pin wallpaper in pinned/ (protect in this theme)"),
        });
        const btnExcludeWp = new Gtk.Button({
            icon_name: 'eye-not-looking-symbolic',
            css_classes: ['flat'],
            tooltip_text: _("Exclude wallpaper from rotation (move to exclude/)"),
        });
        currentActionsBox.append(btnLocateWp);
        currentActionsBox.append(btnPinWp);
        currentActionsBox.append(btnExcludeWp);
        toolsGroup.add(currentWpRow);

        updateCurrentWallpaperRow = () => {
            const scheme = interfaceSettings.get_string('color-scheme');
            const isDark = (scheme === 'prefer-dark');
            const key = isDark ? 'picture-uri-dark' : 'picture-uri';
            const uri = bgSettings.get_string(key);
            const localPath = this._getLocalPath(uri);

            if (!localPath || !GLib.file_test(localPath, GLib.FileTest.EXISTS)) {
                currentWpRow.set_subtitle(_("No wallpaper configured or file does not exist"));
                btnLocateWp.set_sensitive(false);
                btnPinWp.set_sensitive(false);
                btnExcludeWp.set_sensitive(false);
                return;
            }

            btnLocateWp.set_sensitive(true);
            btnPinWp.set_sensitive(true);
            btnExcludeWp.set_sensitive(true);

            const filename = GLib.path_get_basename(localPath);
            const parentDir = GLib.path_get_dirname(localPath);
            const isPinned = (GLib.path_get_basename(parentDir) === 'pinned');
            const themeLabel = isDark ? `🌙 ${_("Dark")}` : `☀️ ${_("Default")}`;

            if (isPinned) {
                currentWpRow.set_subtitle(`${filename}   ·   ${themeLabel}   ·   <span foreground="#3584e4">📌 ${_("Pinned")}</span>`);
                btnPinWp.set_tooltip_text(_("Unpin wallpaper (return to main folder)"));
                btnPinWp.add_css_class('accent');
            } else {
                currentWpRow.set_subtitle(`${filename}   ·   ${themeLabel}`);
                btnPinWp.set_tooltip_text(_("Pin wallpaper in pinned/ (do not rotate away)"));
                btnPinWp.remove_css_class('accent');
            }
        };

        btnLocateWp.connect('clicked', () => {
            const scheme = interfaceSettings.get_string('color-scheme');
            const key = (scheme === 'prefer-dark') ? 'picture-uri-dark' : 'picture-uri';
            const uri = bgSettings.get_string(key);
            const localPath = this._getLocalPath(uri);
            if (!localPath || !GLib.file_test(localPath, GLib.FileTest.EXISTS)) return;

            if (GLib.find_program_in_path('nautilus')) {
                try {
                    Gio.Subprocess.new(['nautilus', '--select', localPath], Gio.SubprocessFlags.NONE);
                } catch (e) {
                    this._openInNautilus(window, GLib.path_get_dirname(localPath));
                }
            } else {
                this._openInNautilus(window, GLib.path_get_dirname(localPath));
            }
        });

        btnPinWp.connect('clicked', () => {
            const scheme = interfaceSettings.get_string('color-scheme');
            const isDark = (scheme === 'prefer-dark');
            const key = isDark ? 'picture-uri-dark' : 'picture-uri';
            const uri = bgSettings.get_string(key);
            const localPath = this._getLocalPath(uri);
            if (!localPath || !GLib.file_test(localPath, GLib.FileTest.EXISTS)) return;

            const currentCfg = this._loadConfigFile();
            const themeDir = isDark ? currentCfg.dir_dark : currentCfg.dir_light;
            if (!themeDir || !GLib.file_test(themeDir, GLib.FileTest.IS_DIR)) return;

            const filename = GLib.path_get_basename(localPath);
            const parentDir = GLib.path_get_dirname(localPath);
            const isPinned = (GLib.path_get_basename(parentDir) === 'pinned');

            const srcFile = Gio.File.new_for_path(localPath);

            if (isPinned) {
                // Desfijar: mover de regreso a themeDir
                const destFile = Gio.File.new_for_path(GLib.build_filenamev([themeDir, filename]));
                try {
                    srcFile.move(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                    const newUri = destFile.get_uri();
                    bgSettings.set_string(key, newUri);
                    if (isDark) currentCfg.saved_dark = newUri;
                    else currentCfg.saved_light = newUri;
                    this._saveConfigFile(currentCfg);
                    window.add_toast(new Adw.Toast({ title: _("Wallpaper unpinned and returned to main folder") }));
                    refreshPreviews();
                    updateCurrentWallpaperRow();
                } catch (e) {
                    console.error('[AutoWallpaper] Error al desfijar:', e.message);
                }
            } else {
                // Fijar: mover a pinned/
                const pinnedDir = GLib.build_filenamev([themeDir, 'pinned']);
                const gPinnedDir = Gio.File.new_for_path(pinnedDir);
                if (!gPinnedDir.query_exists(null)) {
                    gPinnedDir.make_directory_with_parents(null);
                }
                const destFile = Gio.File.new_for_path(GLib.build_filenamev([pinnedDir, filename]));
                try {
                    srcFile.move(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                    const newUri = destFile.get_uri();
                    bgSettings.set_string(key, newUri);
                    if (isDark) currentCfg.saved_dark = newUri;
                    else currentCfg.saved_light = newUri;
                    this._saveConfigFile(currentCfg);
                    window.add_toast(new Adw.Toast({ title: _("Wallpaper pinned in pinned/") }));
                    refreshPreviews();
                    updateCurrentWallpaperRow();
                } catch (e) {
                    console.error('[AutoWallpaper] Error al fijar:', e.message);
                }
            }
        });

        btnExcludeWp.connect('clicked', () => {
            const scheme = interfaceSettings.get_string('color-scheme');
            const isDark = (scheme === 'prefer-dark');
            const key = isDark ? 'picture-uri-dark' : 'picture-uri';
            const uri = bgSettings.get_string(key);
            const localPath = this._getLocalPath(uri);
            if (!localPath || !GLib.file_test(localPath, GLib.FileTest.EXISTS)) return;

            const filename = GLib.path_get_basename(localPath);

            const dialog = new Adw.MessageDialog({
                transient_for: window,
                modal: true,
                heading: _("Exclude this wallpaper?"),
                body: `"${filename}" ${_("will be moved to 'exclude/' and wallpaper will switch to next in rotation.")}`,
            });
            dialog.add_response('cancel', _("Cancel"));
            dialog.add_response('exclude', _("Exclude"));
            dialog.set_response_appearance('exclude', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.set_default_response('exclude');
            dialog.set_close_response('cancel');

            dialog.connect('response', (self, response) => {
                if (response === 'exclude') {
                    const currentCfg = this._loadConfigFile();
                    const themeDir = isDark ? currentCfg.dir_dark : currentCfg.dir_light;
                    if (!themeDir) return;

                    const excludeDir = GLib.build_filenamev([themeDir, 'exclude']);
                    const gExcludeDir = Gio.File.new_for_path(excludeDir);
                    if (!gExcludeDir.query_exists(null)) {
                        gExcludeDir.make_directory_with_parents(null);
                    }

                    const srcFile = Gio.File.new_for_path(localPath);
                    const destFile = Gio.File.new_for_path(GLib.build_filenamev([excludeDir, filename]));
                    try {
                        srcFile.move(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                        
                        const unshownKey = isDark ? 'unshown_dark' : 'unshown_light';
                        if (Array.isArray(currentCfg[unshownKey])) {
                            currentCfg[unshownKey] = currentCfg[unshownKey].filter(p => !p.endsWith(filename));
                        }
                        currentCfg.force_reload = true;
                        this._saveConfigFile(currentCfg);

                        window.add_toast(new Adw.Toast({ title: _("Wallpaper excluded and rotated") }));

                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                            this._ensureWallpaperRolledFallback(bgSettings, interfaceSettings, false);
                            refreshPreviews();
                            updateCurrentWallpaperRow();
                            this._checkServiceActive((active) => updateStatusText(active));
                            return GLib.SOURCE_REMOVE;
                        });
                    } catch (e) {
                        console.error('[AutoWallpaper] Error al excluir:', e.message);
                    }
                }
            });

            dialog.present();
        });

        // --- Fila 2: Buscador de duplicados (dHash) ---
        const rowDupes = new Adw.ActionRow({
            title: _("Duplicate Wallpaper Detector"),
            subtitle: _("Detects repeated or near-identical images using structural perceptual hashes (dHash)"),
        });
        const iconDupes = new Gtk.Image({
            icon_name: 'edit-find-symbolic',
        });
        rowDupes.add_prefix(iconDupes);

        const btnDupes = new Gtk.Button({
            label: _("Scan duplicates"),
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        rowDupes.add_suffix(btnDupes);
        toolsGroup.add(rowDupes);

        btnDupes.connect('clicked', () => {
            this._openDuplicatesDialog(window);
        });

        // --- Fila 3: Clasificar por luminosidad (CIELAB L* + P65) ---
        const rowSort = new Adw.ActionRow({
            title: _("Classify Wallpapers by Luminosity"),
            subtitle: _("Evaluates perceptual lightness (CIELAB L*) and classifies automatically into light and dark"),
        });
        const iconSort = new Gtk.Image({
            icon_name: 'display-brightness-symbolic',
        });
        rowSort.add_prefix(iconSort);

        const btnSort = new Gtk.Button({
            label: _("Classify"),
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
        });
        rowSort.add_suffix(btnSort);
        toolsGroup.add(rowSort);

        btnSort.connect('clicked', () => {
            this._openLuminositySortDialog(window, {
                refreshPreviews,
                updateCurrentWallpaperRow,
                updateStatusText,
            });
        });

        // --- Fila 4: Reescalado con IA (Smart Upscale - Real-CUGAN) ---
        const rowUpscale = new Adw.ActionRow({
            title: _("AI Upscaling (Smart Upscale)"),
            subtitle: _("Checking Vulkan acceleration compatibility and Real-CUGAN engine..."),
        });
        const iconUpscale = new Gtk.Image({
            icon_name: 'applications-graphics-symbolic',
        });
        rowUpscale.add_prefix(iconUpscale);

        const btnUpscale = new Gtk.Button({
            label: _("Upscale..."),
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
            sensitive: true,
        });
        rowUpscale.add_suffix(btnUpscale);
        toolsGroup.add(rowUpscale);

        let upscaleEngineInfo = null;

        const checkUpscaleAvailability = () => {
            const scriptPath = this._getScriptPath('smart_upscale.py');
            if (!GLib.find_program_in_path('python3') || !GLib.file_test(scriptPath, GLib.FileTest.EXISTS)) {
                upscaleEngineInfo = {
                    available: false,
                    has_python: Boolean(GLib.find_program_in_path('python3')),
                    has_pillow: false,
                    has_cv2: false,
                    has_numpy: false,
                    engine_installed: false,
                    missing_pkgs: ['python3', 'Pillow', 'OpenCV', 'NumPy'],
                    reason: _("Missing optional dependencies"),
                };
                rowUpscale.set_subtitle(_("Requires Vulkan acceleration and Real-CUGAN engine installed"));
                btnUpscale.set_sensitive(true);
                btnUpscale.set_label(_("Setup engine..."));
                return;
            }

            try {
                const proc = Gio.Subprocess.new(
                    ['python3', scriptPath, '--check-env'],
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                );
                proc.communicate_utf8_async(null, null, (source, res) => {
                    try {
                        const [, stdout] = source.communicate_utf8_finish(res);
                        if (stdout) {
                            const trimmed = stdout.trim();
                            const jsonStart = trimmed.indexOf('{');
                            const jsonEnd = trimmed.lastIndexOf('}');
                            if (jsonStart !== -1 && jsonEnd !== -1) {
                                const data = JSON.parse(trimmed.substring(jsonStart, jsonEnd + 1));
                                upscaleEngineInfo = data;
                                if (data.available) {
                                    rowUpscale.set_subtitle(`Real-CUGAN activo   ·   GPU: ${data.gpu_name}`);
                                    btnUpscale.set_sensitive(true);
                                    btnUpscale.set_label(_("Upscale..."));
                                    return;
                                }
                                rowUpscale.set_subtitle(data.reason || _("Requires Vulkan acceleration and Real-CUGAN engine installed"));
                                btnUpscale.set_sensitive(true);
                                btnUpscale.set_label(_("Setup engine..."));
                                return;
                            }
                        }
                        upscaleEngineInfo = { available: false, engine_installed: false };
                        rowUpscale.set_subtitle(_("Requires Vulkan acceleration and Real-CUGAN engine installed"));
                        btnUpscale.set_sensitive(true);
                        btnUpscale.set_label(_("Setup engine..."));
                    } catch (err) {
                        upscaleEngineInfo = { available: false, engine_installed: false };
                        rowUpscale.set_subtitle(_("Requires Vulkan acceleration and Real-CUGAN engine installed"));
                        btnUpscale.set_sensitive(true);
                        btnUpscale.set_label(_("Setup engine..."));
                    }
                });
            } catch (e) {
                upscaleEngineInfo = { available: false, engine_installed: false };
                rowUpscale.set_subtitle(_("Requires Vulkan acceleration and Real-CUGAN engine installed"));
                btnUpscale.set_sensitive(true);
                btnUpscale.set_label(_("Setup engine..."));
            }
        };
        checkUpscaleAvailability();

        btnUpscale.connect('clicked', () => {
            this._openUpscaleDialog(window, upscaleEngineInfo, () => {
                checkUpscaleAvailability();
            });
        });

        updateCurrentWallpaperRow();

        // =====================================================================
        // SECCIÓN 5: ATAJOS DE TECLADO (Atajos Nativos en GNOME Shell)
        // =====================================================================
        const shortcutsGroup = new Adw.PreferencesGroup({
            title: _("Keyboard Shortcuts"),
            description: _("Native GNOME shortcuts to quickly switch and reload wallpapers."),
        });
        page.add(shortcutsGroup);

        const switchShortcuts = new Adw.SwitchRow({
            title: _("Enable keyboard shortcuts"),
            subtitle: _("Enables global shortcuts in the desktop environment"),
            active: Boolean(cfg.shortcuts_enabled),
        });
        shortcutsGroup.add(switchShortcuts);

        const nextShortcuts = [
            { label: 'Super + W', accel: '<Super>w' },
            { label: 'Super + Espacio', accel: '<Super>space' },
            { label: 'Super + Flecha Derecha', accel: '<Super>Right' },
            { label: 'Super + N', accel: '<Super>n' },
            { label: 'Alt + W', accel: '<Alt>w' },
            { label: 'Ctrl + Alt + W', accel: '<Primary><Alt>w' },
        ];

        const reloadShortcuts = [
            { label: 'Super + Alt + W', accel: '<Super><Alt>w' },
            { label: 'Super + Alt + Espacio', accel: '<Super><Alt>space' },
            { label: 'Super + Alt + Flecha Derecha', accel: '<Super><Alt>Right' },
            { label: 'Super + Shift + W', accel: '<Super><Shift>w' },
            { label: 'Ctrl + Alt + R', accel: '<Primary><Alt>r' },
        ];

        let selectedNextIdx = nextShortcuts.findIndex(s => s.accel === cfg.shortcut_next);
        if (selectedNextIdx < 0) selectedNextIdx = 0;

        let selectedReloadIdx = reloadShortcuts.findIndex(s => s.accel === cfg.shortcut_reload);
        if (selectedReloadIdx < 0) selectedReloadIdx = 0;

        const comboNextShortcut = new Adw.ComboRow({
            title: _("Next wallpaper"),
            subtitle: _("GNOME Shell native shortcut: Next wallpaper"),
            model: new Gtk.StringList({
                strings: nextShortcuts.map(s => s.label),
            }),
            selected: selectedNextIdx,
            sensitive: Boolean(cfg.shortcuts_enabled),
        });
        shortcutsGroup.add(comboNextShortcut);

        const comboReloadShortcut = new Adw.ComboRow({
            title: _("Reload collections"),
            subtitle: _("GNOME Shell native shortcut: Shuffle and reload"),
            model: new Gtk.StringList({
                strings: reloadShortcuts.map(s => s.label),
            }),
            selected: selectedReloadIdx,
            sensitive: Boolean(cfg.shortcuts_enabled),
        });
        shortcutsGroup.add(comboReloadShortcut);

        let updatingShortcutsInternally = false;
        const applyShortcuts = () => {
            if (updatingShortcutsInternally) return;
            const isEnabled = switchShortcuts.active;
            comboNextShortcut.set_sensitive(isEnabled);
            comboReloadShortcut.set_sensitive(isEnabled);

            const nextObj = nextShortcuts[comboNextShortcut.selected] || nextShortcuts[0];
            const reloadObj = reloadShortcuts[comboReloadShortcut.selected] || reloadShortcuts[0];

            this._syncNativeExtensionShortcuts(isEnabled, nextObj.accel, reloadObj.accel);

            const c = this._loadConfigFile();
            c.shortcuts_enabled = isEnabled;
            c.shortcut_next = nextObj.accel;
            c.shortcut_reload = reloadObj.accel;
            this._saveConfigFile(c);
        };

        switchShortcuts.connect('notify::active', applyShortcuts);
        comboNextShortcut.connect('notify::selected', applyShortcuts);
        comboReloadShortcut.connect('notify::selected', applyShortcuts);
        applyShortcuts();

        // =====================================================================
        // SECCIÓN 6: ICONO EN LA BANDEJA DEL SISTEMA (Por defecto desactivado)
        // =====================================================================
        const trayGroup = new Adw.PreferencesGroup({
            title: _("System Tray Icon"),
            description: _("Show or hide the quick-access indicator on the GNOME top bar."),
        });
        page.add(trayGroup);

        const switchTrayIcon = new Adw.SwitchRow({
            title: _("Show tray icon"),
            subtitle: _("Shows an icon in the top bar with a quick menu (Next, Shuffle, Settings, etc.)"),
            active: Boolean(cfg.show_panel_icon),
        });
        trayGroup.add(switchTrayIcon);

        let updatingTraySwitchInternally = false;
        switchTrayIcon.connect('notify::active', () => {
            if (updatingTraySwitchInternally) return;
            const showIcon = switchTrayIcon.active;
            try {
                const extSettings = this.getSettings();
                if (extSettings) {
                    extSettings.set_boolean('show-panel-icon', showIcon);
                    Gio.Settings.sync();
                }
            } catch (e) {}

            const c = this._loadConfigFile();
            c.show_panel_icon = showIcon;
            this._saveConfigFile(c);
        });

        // =====================================================================
        // PIE DE PÁGINA DISCRETO PARA DESARROLLO (Versión y Motor)
        // =====================================================================
        const devFooterGroup = new Adw.PreferencesGroup();
        const lblDevFooter = new Gtk.Label({
            label: 'dev · runtime: GJS / JavaScript Native (EGO Edition)',
            halign: Gtk.Align.CENTER,
            margin_top: 8,
            margin_bottom: 4,
            css_classes: ['dev-footer-info'],
        });
        devFooterGroup.add(lblDevFooter);
        page.add(devFooterGroup);

        // Función para actualizar la tarjeta de estado (Motor Nativo en GJS)
        const updateStatusText = (isActive) => {
            const currentCfg = this._loadConfigFile();
            btnNext.set_sensitive(true);
            btnShuffle.set_sensitive(true);
            btnReload.set_sensitive(true);

            if (!isActive) {
                statusInfoRow.set_title(_("Automatic rotation paused"));
                statusInfoRow.set_subtitle(`<span foreground="#9a9996">●</span> ${_("Automatic timer is stopped")}`);
                return;
            }

            statusInfoRow.set_title(_("Automatic rotation active"));

            const timeLeftStr = this._formatTimeLeft(currentCfg);
            let detailParts = [`<span foreground="#33d17a">●</span> ${_("Next switch in:")} <b>${timeLeftStr}</b>`];

            if (currentCfg.sequence_mode === 'random-sequential') {
                const remLight = (currentCfg.unshown_light || []).length;
                const remDark = (currentCfg.unshown_dark || []).length;
                detailParts.push(`${_("Remaining:")} ☀️ <b>${remLight}</b>  ·  🌙 <b>${remDark}</b>`);
            } else {
                detailParts.push(`${_("Mode:")} <b>${_("Random")}</b>`);
            }

            statusInfoRow.set_subtitle(detailParts.join('   ·   '));
        };

        // Función para verificar si al menos una de las carpetas es válida y contiene imágenes
        const updateVisibilityByFolders = () => {
            const currentCfg = this._loadConfigFile();
            const countLight = this._countWallpaperImages(currentCfg.dir_light);
            const countDark = this._countWallpaperImages(currentCfg.dir_dark);
            const hasValidCollections = (countLight > 0 || countDark > 0);

            rotGroup.set_visible(hasValidCollections);
            autoGroup.set_visible(hasValidCollections);
            toolsGroup.set_visible(hasValidCollections);
            shortcutsGroup.set_visible(hasValidCollections);

            if (emptyNoticeRevealer) {
                emptyNoticeRevealer.set_reveal_child(!hasValidCollections);
            }

            if (currentCfg.dir_light) {
                const sLight = countLight > 0
                    ? `${currentCfg.dir_light}  ·  ${countLight} ${countLight === 1 ? _("image") : _("images")}`
                    : `${currentCfg.dir_light}  ·  ${_("No images")}`;
                rowLight.set_subtitle(sLight);
            }
            if (currentCfg.dir_dark) {
                const sDark = countDark > 0
                    ? `${currentCfg.dir_dark}  ·  ${countDark} ${countDark === 1 ? _("image") : _("images")}`
                    : `${currentCfg.dir_dark}  ·  ${_("No images")}`;
                rowDark.set_subtitle(sDark);
            }

            return hasValidCollections;
        };

        const handleFolderContentChange = () => {
            const wasValid = rotGroup.get_visible();
            const isNowValid = updateVisibilityByFolders();

            if (!wasValid && isNowValid) {
                this._setupFolderMonitors(handleFolderContentChange);
                refreshPreviews();
                const currentCfg = this._loadConfigFile();
                currentCfg.known_count_light = this._countWallpaperImages(currentCfg.dir_light);
                currentCfg.known_count_dark = this._countWallpaperImages(currentCfg.dir_dark);
                this._saveConfigFile(currentCfg);
                hideReloadNotice();
            } else if (isNowValid) {
                showReloadNotice();
            }
        };

        btnLightFolder.connect('clicked', () => {
            this._openFolderChooser(window, _("Select light wallpaper folder"), (chosenPath) => {
                const currentCfg = this._loadConfigFile();
                currentCfg.dir_light = chosenPath;
                currentCfg.known_count_light = this._countWallpaperImages(chosenPath);
                this._saveConfigFile(currentCfg);
                handleFolderContentChange();
                this._checkServiceActive((active) => updateStatusText(active));
            });
        });

        btnLightNautilus.connect('clicked', () => {
            const currentCfg = this._loadConfigFile();
            this._openInNautilus(window, currentCfg.dir_light);
        });

        btnDarkFolder.connect('clicked', () => {
            this._openFolderChooser(window, _("Select dark wallpaper folder"), (chosenPath) => {
                const currentCfg = this._loadConfigFile();
                currentCfg.dir_dark = chosenPath;
                currentCfg.known_count_dark = this._countWallpaperImages(chosenPath);
                this._saveConfigFile(currentCfg);
                handleFolderContentChange();
                this._checkServiceActive((active) => updateStatusText(active));
            });
        });

        btnDarkNautilus.connect('clicked', () => {
            const currentCfg = this._loadConfigFile();
            this._openInNautilus(window, currentCfg.dir_dark);
        });

        seqCombo.connect('notify::selected', () => {
            const isSeq = (seqCombo.selected === 1);
            const currentCfg = this._loadConfigFile();
            currentCfg.sequence_mode = isSeq ? 'random-sequential' : 'random';
            if (isSeq) {
                currentCfg.unshown_light = this._getWallpaperImageUris(currentCfg.dir_light);
                currentCfg.unshown_dark = this._getWallpaperImageUris(currentCfg.dir_dark);
            }
            this._saveConfigFile(currentCfg);
            this._checkServiceActive((active) => updateStatusText(active));
        });

        // Eventos de frecuencia: guarda la configuración y actualiza la UI de inmediato sin reiniciar systemd
        modeCombo.connect('notify::selected', () => {
            const isDay = (modeCombo.selected === 1);
            const currentCfg = this._loadConfigFile();

            if (!isDay) {
                currentCfg.mode = 'time';
                const h = Math.floor(spinHours.get_value());
                const m = Math.floor(spinMinutes.get_value());
                currentCfg.interval = Math.max(1, (h * 60) + m);
                spinHours.set_visible(true);
                spinMinutes.set_visible(true);
                rowDayTime.set_visible(false);
                spinDayDays.set_visible(false);
                switchResetOnStyleChange.set_sensitive(true);
            } else {
                currentCfg.mode = 'day';
                currentCfg.interval = spinDayDays.get_value();
                const h = Math.floor(spinHour.get_value()).toString().padStart(2, '0');
                const m = Math.floor(spinMinute.get_value()).toString().padStart(2, '0');
                currentCfg.day_time = `${h}:${m}`;
                spinHours.set_visible(false);
                spinMinutes.set_visible(false);
                rowDayTime.set_visible(true);
                spinDayDays.set_visible(true);
                switchResetOnStyleChange.set_sensitive(false);
            }

            currentCfg.next_run = this._calculateNextRun(currentCfg);
            this._saveConfigFile(currentCfg);
            this._checkServiceActive((active) => updateStatusText(active));
        });

        // Cambio de opción para reiniciar rotación al cambiar de estilo
        switchResetOnStyleChange.connect('notify::active', () => {
            const currentCfg = this._loadConfigFile();
            currentCfg.reset_on_style_change = switchResetOnStyleChange.active;
            this._saveConfigFile(currentCfg);
        });

        // Cambio de intervalo en horas y minutos: actualiza la cuenta regresiva al instante
        const onIntervalChanged = () => {
            if (modeCombo.selected === 0) {
                let h = Math.floor(spinHours.get_value());
                let m = Math.floor(spinMinutes.get_value());
                let total = (h * 60) + m;
                if (total < 1) {
                    total = 1;
                    spinMinutes.set_value(1);
                }
                const currentCfg = this._loadConfigFile();
                currentCfg.interval = total;
                currentCfg.next_run = this._calculateNextRun(currentCfg);
                this._saveConfigFile(currentCfg);
                this._checkServiceActive((active) => updateStatusText(active));
            }
        };

        spinHours.connect('notify::value', onIntervalChanged);
        spinMinutes.connect('notify::value', onIntervalChanged);

        // Cambio de hora o minuto en selector específico de tiempo (sin margen de error para el usuario)
        const onTimeInputChanged = () => {
            if (modeCombo.selected === 1) {
                const currentCfg = this._loadConfigFile();
                const h = Math.floor(spinHour.get_value()).toString().padStart(2, '0');
                const m = Math.floor(spinMinute.get_value()).toString().padStart(2, '0');
                currentCfg.day_time = `${h}:${m}`;
                currentCfg.next_run = this._calculateNextRun(currentCfg);
                this._saveConfigFile(currentCfg);
                this._checkServiceActive((active) => updateStatusText(active));
            }
        };
        spinHour.connect('notify::value', onTimeInputChanged);
        spinMinute.connect('notify::value', onTimeInputChanged);

        spinDayDays.connect('notify::value', () => {
            if (modeCombo.selected === 1) {
                const currentCfg = this._loadConfigFile();
                currentCfg.interval = spinDayDays.get_value();
                currentCfg.next_run = this._calculateNextRun(currentCfg);
                this._saveConfigFile(currentCfg);
                this._checkServiceActive((active) => updateStatusText(active));
            }
        });

        // Conexión del switch de rotación automática
        let updatingSwitchInternally = false;

        switchAuto.connect('notify::active', () => {
            if (updatingSwitchInternally) return;

            const shouldEnable = switchAuto.active;
            autoParamsRevealer.set_reveal_child(shouldEnable);

            this._toggleService(shouldEnable, () => {
                this._checkServiceActive((active) => updateStatusText(active));
            });
        });

        // --- Conexiones de los 3 Botones de Acción ---
        // 1. Siguiente: pasa al siguiente en la secuencia actual notificando al motor nativo
        btnNext.connect('clicked', () => {
            const currentCfg = this._loadConfigFile();
            currentCfg.force_reload = true;
            this._saveConfigFile(currentCfg);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
                this._ensureWallpaperRolledFallback(bgSettings, interfaceSettings, false);
                refreshPreviews();
                this._checkServiceActive((active) => updateStatusText(active));
                return GLib.SOURCE_REMOVE;
            });
        });

        // 2. Barajar: revuelve el orden de la baraja pendiente sin resetearla y pasa al siguiente
        btnShuffle.connect('clicked', () => {
            const currentCfg = this._loadConfigFile();
            if (Array.isArray(currentCfg.unshown_light) && currentCfg.unshown_light.length > 1) {
                currentCfg.unshown_light.sort(() => Math.random() - 0.5);
            }
            if (Array.isArray(currentCfg.unshown_dark) && currentCfg.unshown_dark.length > 1) {
                currentCfg.unshown_dark.sort(() => Math.random() - 0.5);
            }
            currentCfg.force_reload = true;
            this._saveConfigFile(currentCfg);
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 180, () => {
                this._ensureWallpaperRolledFallback(bgSettings, interfaceSettings, false);
                refreshPreviews();
                this._checkServiceActive((active) => updateStatusText(active));
                return GLib.SOURCE_REMOVE;
            });
        });

        // 3. Recargar: re-escanea carpetas en disco, reinicia la baraja completa y rota en ambos temas
        const executeReload = () => {
            const currentCfg = this._loadConfigFile();
            currentCfg.unshown_light = [];
            currentCfg.unshown_dark = [];
            currentCfg.force_reload = true;
            currentCfg.force_both = true;
            currentCfg.known_count_light = this._countWallpaperImages(currentCfg.dir_light);
            currentCfg.known_count_dark = this._countWallpaperImages(currentCfg.dir_dark);
            this._saveConfigFile(currentCfg);
            hideReloadNotice();

            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 260, () => {
                this._ensureWallpaperRolledFallback(bgSettings, interfaceSettings, true);
                refreshPreviews();
                this._checkServiceActive((active) => updateStatusText(active));
                return GLib.SOURCE_REMOVE;
            });
        };

        const confirmAndReload = () => {
            const dialog = new Adw.MessageDialog({
                transient_for: window,
                modal: true,
                heading: _("Reload all wallpapers?"),
                body: _("This will rescan folders and reload all wallpapers, including current wallpaper."),
            });
            dialog.add_response('cancel', _("Cancel"));
            dialog.add_response('reload', _("Reload"));
            dialog.set_response_appearance('reload', Adw.ResponseAppearance.SUGGESTED);
            dialog.set_default_response('reload');
            dialog.set_close_response('cancel');

            dialog.connect('response', (self, response) => {
                if (response === 'reload') {
                    executeReload();
                }
            });

            dialog.present();
        };

        btnReload.connect('clicked', confirmAndReload);
        btnReloadLink.connect('clicked', confirmAndReload);

        // Sincronizar estado inicial del motor de rotación nativo
        this._checkServiceActive((isActive) => {
            updatingSwitchInternally = true;
            switchAuto.set_active(isActive);
            autoParamsRevealer.set_reveal_child(isActive);
            updatingSwitchInternally = false;
            updateStatusText(isActive);
        });

        // Verificar visibilidad inicial de los grupos dependientes de carpetas
        updateVisibilityByFolders();

        // Configurar monitores en tiempo real para cambios en carpetas
        this._setupFolderMonitors(handleFolderContentChange);

        // Comprobar si hubo cambios de fondos mientras la ventana estuvo cerrada
        const curLightCount = this._countWallpaperImages(cfg.dir_light);
        const curDarkCount = this._countWallpaperImages(cfg.dir_dark);
        if (typeof cfg.known_count_light !== 'number' || typeof cfg.known_count_dark !== 'number') {
            cfg.known_count_light = curLightCount;
            cfg.known_count_dark = curDarkCount;
            this._saveConfigFile(cfg);
        } else if (curLightCount !== cfg.known_count_light || curDarkCount !== cfg.known_count_dark) {
            showReloadNotice();
        }

        // Temporizador de refresco para el tiempo restante y vigilancia de colecciones cada 3 segundos
        let lastKnownValid = (curLightCount > 0 || curDarkCount > 0);
        const timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            this._checkServiceActive((isActive) => {
                updateStatusText(isActive);
            });
            const latestCfg = this._loadConfigFile();
            if (Boolean(latestCfg.show_panel_icon) !== switchTrayIcon.active) {
                updatingTraySwitchInternally = true;
                switchTrayIcon.set_active(Boolean(latestCfg.show_panel_icon));
                updatingTraySwitchInternally = false;
            }
            const currentValid = updateVisibilityByFolders();
            if (!lastKnownValid && currentValid) {
                lastKnownValid = true;
                this._setupFolderMonitors(handleFolderContentChange);
                refreshPreviews();
            } else {
                lastKnownValid = currentValid;
            }
            return GLib.SOURCE_CONTINUE;
        });

        // Conectar señales para reflejar cambios externos automáticamente
        const sigBgLight = bgSettings.connect('changed::picture-uri', refreshPreviews);
        const sigBgDark = bgSettings.connect('changed::picture-uri-dark', refreshPreviews);
        const sigScheme = interfaceSettings.connect('changed::color-scheme', () => {
            refreshActiveStyle();
            if (updateCurrentWallpaperRow) updateCurrentWallpaperRow();
            const currentScheme = interfaceSettings.get_string('color-scheme');
            if (pendingTargetScheme && currentScheme === pendingTargetScheme) {
                hideThemeNotice();
            }
        });

        // Desconectar al cerrar
        window.connect('destroy', () => {
            GLib.source_remove(timerId);
            bgSettings.disconnect(sigBgLight);
            bgSettings.disconnect(sigBgDark);
            interfaceSettings.disconnect(sigScheme);
            this._cleanupFolderMonitors();
        });
    }

    _syncNativeExtensionShortcuts(enabled, nextAccel = '<Super>w', reloadAccel = '<Super><Alt>w') {
        try {
            const extSettings = this.getSettings();
            if (extSettings) {
                extSettings.set_boolean('shortcuts-enabled', Boolean(enabled));
                extSettings.set_strv('shortcut-next', [nextAccel]);
                extSettings.set_strv('shortcut-reload', [reloadAccel]);
                Gio.Settings.sync();
            }
        } catch (e) {
            // En modo previsualización aislada sin instalar el esquema globalmente, se sincroniza vía JSON
        }
    }

    _ensureWallpaperRolledFallback(bgSettings, interfaceSettings, forceBoth = false) {
        const cfg = this._loadConfigFile();
        if (!cfg.force_reload) return;

        // Si extension.js no está activo (ej. preview_prefs.js), rotamos directamente
        cfg.force_reload = false;
        delete cfg.force_both;

        const scheme = interfaceSettings.get_string('color-scheme');
        const isDarkActive = (scheme === 'prefer-dark');

        if (isDarkActive) cfg.seen_dark = true;
        else cfg.seen_light = true;

        const pickNext = (dirPath, theme) => {
            const images = this._getWallpaperImageUris(dirPath);
            if (!images || images.length === 0) return null;
            if (cfg.sequence_mode !== 'random-sequential') {
                return images[Math.floor(Math.random() * images.length)];
            }
            const stateKey = `unshown_${theme}`;
            const imgSet = new Set(images);
            let unshown = Array.isArray(cfg[stateKey]) ? cfg[stateKey].filter(u => imgSet.has(u)) : [];
            if (unshown.length === 0) unshown = [...images];
            const idx = Math.floor(Math.random() * unshown.length);
            const chosen = unshown[idx];
            unshown.splice(idx, 1);
            cfg[stateKey] = unshown;
            return chosen;
        };

        if (forceBoth || cfg.seen_dark || !cfg.saved_dark) {
            const imgDark = pickNext(cfg.dir_dark, 'dark');
            if (imgDark) {
                bgSettings.set_string('picture-uri-dark', imgDark);
                cfg.saved_dark = imgDark;
                cfg.seen_dark = isDarkActive || forceBoth;
            }
        }
        if (forceBoth || cfg.seen_light || !cfg.saved_light) {
            const imgLight = pickNext(cfg.dir_light, 'light');
            if (imgLight) {
                bgSettings.set_string('picture-uri', imgLight);
                cfg.saved_light = imgLight;
                cfg.seen_light = !isDarkActive || forceBoth;
            }
        }
        cfg.next_run = this._calculateNextRun(cfg);
        this._saveConfigFile(cfg);
    }

    _isImageFile(file, info = null) {
        if (!file) return false;
        const name = file.get_basename();
        if (!name || name.startsWith('.')) return false;

        const parent = file.get_parent();
        if (parent && parent.get_basename() === 'exclude') return false;

        // 1. Extensión conocida común (case-insensitive)
        const dotIdx = name.lastIndexOf('.');
        if (dotIdx !== -1) {
            const ext = name.substring(dotIdx).toLowerCase();
            const validExts = [
                '.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp',
                '.tiff', '.tif', '.jfif', '.pjpeg', '.pjp', '.gif'
            ];
            if (validExts.includes(ext)) return true;
        }

        // 2. MIME type del enumerador
        try {
            if (info) {
                const ct = info.get_content_type();
                if (ct && ct.startsWith('image/') && !ct.includes('svg')) {
                    return true;
                }
            }
        } catch (e) {}

        // 3. Inspección de Content-Type vía Gio.File si no venía en info
        try {
            const fileInfo = info || file.query_info(
                'standard::content-type,standard::fast-content-type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            if (fileInfo) {
                const ct = fileInfo.get_content_type();
                if (ct && ct.startsWith('image/') && !ct.includes('svg')) {
                    return true;
                }
            }
        } catch (e) {}

        // 4. Verificación de Magic Bytes (cabecera binaria) para archivos sin extensión o con extensión arbitraria
        try {
            const stream = file.read(null);
            const bytes = stream.read_bytes(32, null);
            stream.close(null);
            if (bytes && bytes.get_size() >= 4) {
                const data = bytes.get_data();
                // JPEG: FF D8 FF
                if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return true;
                // PNG: 89 50 4E 47
                if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) return true;
                // GIF: GIF8
                if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x38) return true;
                // BMP: BM
                if (data[0] === 0x42 && data[1] === 0x4D) return true;
                // WEBP: RIFF....WEBP
                if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46) {
                    if (data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return true;
                }
                // AVIF: ....ftypavif o ftypmif1
                if (bytes.get_size() >= 12) {
                    const text12 = String.fromCharCode.apply(null, data.slice(4, 12));
                    if (text12.includes('ftyp')) return true;
                }
            }
        } catch (e) {}

        return false;
    }

    _countWallpaperImages(dirPath) {
        if (!dirPath || !GLib.file_test(dirPath, GLib.FileTest.IS_DIR)) return 0;
        let count = 0;

        const countInDir = (folder) => {
            try {
                const enumerator = folder.enumerate_children(
                    'standard::name,standard::type,standard::content-type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    null
                );
                let info;
                while ((info = enumerator.next_file(null)) !== null) {
                    if (info.get_file_type() === Gio.FileType.REGULAR) {
                        const child = folder.get_child(info.get_name());
                        if (this._isImageFile(child, info)) {
                            count++;
                        }
                    }
                }
            } catch (e) {
                // Carpeta inaccesible o vacía
            }
        };

        const mainFolder = Gio.File.new_for_path(dirPath);
        countInDir(mainFolder);
        const pinnedFolder = mainFolder.get_child('pinned');
        if (pinnedFolder.query_exists(null)) {
            countInDir(pinnedFolder);
        }
        return count;
    }

    _getWallpaperImageUris(dirPath) {
        if (!dirPath || !GLib.file_test(dirPath, GLib.FileTest.IS_DIR)) return [];
        const uris = [];

        const collectFrom = (folder) => {
            try {
                const enumerator = folder.enumerate_children(
                    'standard::name,standard::type,standard::content-type',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    null
                );
                let info;
                while ((info = enumerator.next_file(null)) !== null) {
                    if (info.get_file_type() === Gio.FileType.REGULAR) {
                        const child = folder.get_child(info.get_name());
                        if (this._isImageFile(child, info)) {
                            uris.push(child.get_uri());
                        }
                    }
                }
            } catch (e) {}
        };

        const mainFolder = Gio.File.new_for_path(dirPath);
        collectFrom(mainFolder);
        const pinnedFolder = mainFolder.get_child('pinned');
        if (pinnedFolder.query_exists(null)) {
            collectFrom(pinnedFolder);
        }
        return uris;
    }

    _setupFolderMonitors(onFolderChanged) {
        this._cleanupFolderMonitors();
        this._folderMonitors = [];

        const cfg = this._loadConfigFile();
        const dirsToWatch = [];
        if (cfg.dir_light) dirsToWatch.push(cfg.dir_light);
        if (cfg.dir_dark) dirsToWatch.push(cfg.dir_dark);

        for (const baseDir of dirsToWatch) {
            if (!GLib.file_test(baseDir, GLib.FileTest.IS_DIR)) {
                // Si la carpeta aún no existe, vigilar directorio padre para detectar cuando se cree
                const parentDir = GLib.path_get_dirname(baseDir);
                if (GLib.file_test(parentDir, GLib.FileTest.IS_DIR)) {
                    try {
                        const gparent = Gio.File.new_for_path(parentDir);
                        const mon = gparent.monitor_directory(Gio.FileMonitorFlags.NONE, null);
                        mon.connect('changed', (monitor, file, otherFile, eventType) => {
                            if (eventType === Gio.FileMonitorEvent.CREATED || eventType === Gio.FileMonitorEvent.MOVED_IN) {
                                if (GLib.file_test(baseDir, GLib.FileTest.IS_DIR)) {
                                    onFolderChanged();
                                }
                            }
                        });
                        this._folderMonitors.push(mon);
                    } catch (e) {}
                }
                continue;
            }

            const watchPaths = [baseDir];
            const pinnedDir = GLib.build_filenamev([baseDir, 'pinned']);
            if (GLib.file_test(pinnedDir, GLib.FileTest.IS_DIR)) {
                watchPaths.push(pinnedDir);
            }

            for (const p of watchPaths) {
                try {
                    const gfile = Gio.File.new_for_path(p);
                    const mon = gfile.monitor_directory(Gio.FileMonitorFlags.NONE, null);
                    mon.connect('changed', (monitor, file, otherFile, eventType) => {
                        const relevantEvents = [
                            Gio.FileMonitorEvent.CREATED,
                            Gio.FileMonitorEvent.DELETED,
                            Gio.FileMonitorEvent.MOVED_IN,
                            Gio.FileMonitorEvent.MOVED_OUT,
                            Gio.FileMonitorEvent.RENAMED,
                            Gio.FileMonitorEvent.MOVED,
                            Gio.FileMonitorEvent.CHANGES_DONE_HINT,
                        ];

                        if (relevantEvents.includes(eventType)) {
                            if (this._isImageFile(file) || (otherFile && this._isImageFile(otherFile))) {
                                onFolderChanged();
                            }
                        }
                    });
                    this._folderMonitors.push(mon);
                } catch (e) {
                    console.warn(`[AutoWallpaper] Error al monitorear ${p}: ${e.message}`);
                }
            }
        }
    }

    _cleanupFolderMonitors() {
        if (this._folderMonitors) {
            for (const mon of this._folderMonitors) {
                try {
                    mon.cancel();
                } catch (e) {}
            }
        }
        this._folderMonitors = [];
    }

    _loadStyles() {
        const cssPath = GLib.build_filenamev([this.path, 'prefs.css']);
        const cssFile = Gio.File.new_for_path(cssPath);

        if (cssFile.query_exists(null)) {
            const provider = new Gtk.CssProvider();
            provider.load_from_file(cssFile);
            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(),
                provider,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            );
        }
    }

    _getPicturesDir() {
        const specialDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        if (specialDir) return specialDir;
        return GLib.build_filenamev([GLib.get_home_dir(), 'Pictures']);
    }

    _loadConfigFile() {
        const configPath = GLib.build_filenamev([GLib.get_user_config_dir(), 'auto-wallpaper.json']);
        const file = Gio.File.new_for_path(configPath);
        const picDir = this._getPicturesDir();
        const homeDir = GLib.get_home_dir();

        const defaults = {
            dir_light: GLib.build_filenamev([picDir, 'wallpapers', 'light']),
            dir_dark: GLib.build_filenamev([picDir, 'wallpapers', 'dark']),
            auto_rotation_enabled: true,
            mode: 'time',
            interval: 30,
            day_time: '12:00',
            sequence_mode: 'random',
            unshown_light: [],
            unshown_dark: [],
            next_run: 0,
            force_reload: false,
            known_count_light: null,
            known_count_dark: null,
            reset_on_style_change: true,
            shortcuts_enabled: false,
            shortcut_next: '<Super>w',
            shortcut_reload: '<Super><Alt>w',
            show_panel_icon: false,
            ignored_duplicates: [],
        };

        try {
            if (file.query_exists(null)) {
                const [ok, contents] = file.load_contents(null);
                if (ok) {
                    const decoder = new TextDecoder('utf-8');
                    const parsed = JSON.parse(decoder.decode(contents));
                    const cfg = Object.assign({}, defaults, parsed);

                    for (const key of ['dir_light', 'dir_dark']) {
                        const val = cfg[key];
                        if (!val || typeof val !== 'string') {
                            cfg[key] = defaults[key];
                        } else if (val.startsWith('~/')) {
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
            } else {
                this._saveConfigFile(defaults);
            }
        } catch (e) {
            console.warn(`[AutoWallpaper] Error cargando config: ${e.message}`);
        }
        return defaults;
    }

    _saveConfigFile(config) {
        const configDir = GLib.get_user_config_dir();
        const configPath = GLib.build_filenamev([configDir, 'auto-wallpaper.json']);
        const file = Gio.File.new_for_path(configPath);
        try {
            const parent = file.get_parent();
            if (parent && !parent.query_exists(null)) {
                parent.make_directory_with_parents(null);
            }
            const encoder = new TextEncoder();
            const jsonBytes = encoder.encode(JSON.stringify(config, null, 4));
            file.replace_contents(jsonBytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        } catch (e) {
            console.error(`[AutoWallpaper] Error guardando config: ${e.message}`);
        }
    }

    _syncConfigFile(updates) {
        const cfg = this._loadConfigFile();
        Object.assign(cfg, updates);
        this._saveConfigFile(cfg);
    }

    _calculateNextRun(cfg) {
        if (!cfg || cfg.auto_rotation_enabled === false || cfg.mode === 'manual') {
            return 0;
        }
        const now = new Date();
        if (cfg.mode === 'time') {
            const minutes = cfg.interval || 30;
            return (now.getTime() + minutes * 60 * 1000) / 1000;
        } else if (cfg.mode === 'day') {
            const tStr = cfg.day_time || '12:00';
            const match = tStr.match(/^([0-1]?[0-9]|2[0-3]):?([0-5][0-9])$/);
            let hr = 12, mn = 0;
            if (match) {
                hr = parseInt(match[1], 10);
                mn = parseInt(match[2], 10);
            }
            const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hr, mn, 0, 0);
            const daysInterval = Math.max(1, cfg.interval || 1);
            if (now >= target) {
                target.setDate(target.getDate() + daysInterval);
            } else {
                target.setDate(target.getDate() + Math.max(0, daysInterval - 1));
            }
            return target.getTime() / 1000;
        }
        return 0;
    }

    _formatTimeLeft(cfg) {
        if (cfg.auto_rotation_enabled === false || cfg.mode === 'manual') {
            return _("Disabled (Manual)");
        }
        const diff = (cfg.next_run || 0) - (Date.now() / 1000);
        if (diff <= 0) {
            return _("Calculating / Imminent...");
        }
        const totalSec = Math.floor(diff);
        const s = totalSec % 60;
        const totalMin = Math.floor(totalSec / 60);
        const m = totalMin % 60;
        const totalHrs = Math.floor(totalMin / 60);
        const h = totalHrs % 24;
        const d = Math.floor(totalHrs / 24);

        const parts = [];
        if (d > 0) parts.push(`${d} d`);
        if (h > 0) parts.push(`${h} h`);
        if (m > 0) parts.push(`${m} min`);
        if (parts.length === 0) return `${s} s`;
        return parts.join(', ');
    }

    _checkServiceActive(callback) {
        const cfg = this._loadConfigFile();
        const isActive = (cfg.auto_rotation_enabled !== false && cfg.mode !== 'manual');
        callback(isActive, isActive ? 'active' : 'paused');
    }

    _toggleService(enable, callback) {
        if (this._isToggling) return;
        this._isToggling = true;

        try {
            const cfg = this._loadConfigFile();
            cfg.auto_rotation_enabled = Boolean(enable);
            if (enable) {
                if (cfg.mode === 'manual') {
                    cfg.mode = 'time';
                }
                cfg.next_run = this._calculateNextRun(cfg);
            }
            this._saveConfigFile(cfg);
        } catch (e) {
            console.error(`[AutoWallpaper] Error alternando rotación: ${e.message}`);
        } finally {
            this._isToggling = false;
            if (callback) callback();
        }
    }

    _openInNautilus(parentWindow, folderPath) {
        if (!folderPath) return;
        try {
            const launcher = new Gtk.FileLauncher({
                file: Gio.File.new_for_path(folderPath),
            });
            launcher.launch(parentWindow, null, null);
        } catch (e) {
            console.warn(`[AutoWallpaper] Error abriendo carpeta: ${e.message}`);
        }
    }

    _openFolderChooser(parentWindow, dialogTitle, onSelected) {
        const fileDialog = new Gtk.FileDialog({
            title: dialogTitle,
            modal: true,
        });

        fileDialog.select_folder(parentWindow, null, (dialog, result) => {
            try {
                const selectedFolder = dialog.select_folder_finish(result);
                if (selectedFolder) {
                    const chosenPath = selectedFolder.get_path();
                    try {
                        const exclude = selectedFolder.get_child('exclude');
                        if (!exclude.query_exists(null)) exclude.make_directory(null);
                        const pinned = selectedFolder.get_child('pinned');
                        if (!pinned.query_exists(null)) pinned.make_directory(null);
                    } catch (err) {}

                    onSelected(chosenPath);
                }
            } catch (err) {
                // Diálogo cerrado o cancelado
            }
        });
    }

    _getLocalPath(uriOrPath) {
        if (!uriOrPath) return null;
        if (uriOrPath.startsWith('file://')) {
            try {
                const [path] = GLib.filename_from_uri(uriOrPath);
                return path;
            } catch (e) {
                return null;
            }
        }
        return uriOrPath;
    }

    _createCoverThumbnail(uriOrPath, targetW, targetH) {
        const localPath = this._getLocalPath(uriOrPath);
        if (!localPath || !GLib.file_test(localPath, GLib.FileTest.EXISTS)) {
            return null;
        }

        try {
            const [ok, origW, origH] = GdkPixbuf.Pixbuf.get_file_info(localPath);
            if (!ok || origW <= 0 || origH <= 0) return null;

            const scale = Math.max(targetW / origW, targetH / origH);
            const scaledW = Math.max(targetW, Math.round(origW * scale));
            const scaledH = Math.max(targetH, Math.round(origH * scale));

            const scaledPixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
                localPath,
                scaledW,
                scaledH,
                false
            );

            const srcX = Math.max(0, Math.floor((scaledW - targetW) / 2));
            const srcY = Math.max(0, Math.floor((scaledH - targetH) / 2));

            const cropped = scaledPixbuf.new_subpixbuf(srcX, srcY, targetW, targetH);
            return Gdk.Texture.new_for_pixbuf(cropped);
        } catch (e) {
            console.warn(`[AutoWallpaper] Error generando miniatura cover: ${e.message}`);
            return null;
        }
    }

    _updatePicture(pictureWidget, uri, targetW, targetH) {
        if (!uri) return;
        try {
            const texture = this._createCoverThumbnail(uri, targetW, targetH);
            if (texture) {
                pictureWidget.set_paintable(texture);
                return;
            }
            const localPath = this._getLocalPath(uri);
            if (localPath && GLib.file_test(localPath, GLib.FileTest.EXISTS)) {
                pictureWidget.set_filename(localPath);
            }
        } catch (e) {
            console.warn(`[AutoWallpaper] Error al actualizar imagen: ${e.message}`);
        }
    }

    _openImageChooser(parentWindow, dialogTitle, onSelected) {
        const fileDialog = new Gtk.FileDialog({
            title: dialogTitle,
            modal: true,
        });

        const imageFilter = new Gtk.FileFilter();
        imageFilter.set_name(_("Images (*.png, *.jpg, *.jpeg, *.webp)"));
        imageFilter.add_mime_type('image/png');
        imageFilter.add_mime_type('image/jpeg');
        imageFilter.add_mime_type('image/webp');

        const filtersStore = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype });
        filtersStore.append(imageFilter);
        fileDialog.set_filters(filtersStore);

        fileDialog.open(parentWindow, null, (dialog, result) => {
            try {
                const selectedFile = dialog.open_finish(result);
                if (selectedFile) {
                    const filePath = selectedFile.get_path();
                    const fileUri = selectedFile.get_uri();
                    onSelected(filePath, fileUri);
                }
            } catch (err) {
                // Cancelado
            }
        });
    }

    _getScriptPath(name) {
        return GLib.build_filenamev([this.path, 'scripts', name]);
    }

    _checkPythonEnvAsync(requiredModules, callback) {
        if (!GLib.find_program_in_path('python3')) {
            callback({
                ok: false,
                missing: ['python3', ...requiredModules],
                installCmd: 'sudo dnf install python3 python3-pillow   # Fedora\nsudo apt install python3 python3-pil      # Ubuntu/Debian\nsudo pacman -S python python-pillow       # Arch Linux',
            });
            return;
        }

        const pyCheck = `
import json, importlib.util
mods = ${JSON.stringify(requiredModules)}
missing = [m for m in mods if importlib.util.find_spec(m) is None]
distro = "unknown"
try:
    with open("/etc/os-release") as f:
        text = f.read().lower()
        if "fedora" in text or "rhel" in text: distro = "fedora"
        elif "ubuntu" in text or "debian" in text or "mint" in text or "pop" in text: distro = "debian"
        elif "arch" in text or "manjaro" in text or "endeavour" in text: distro = "arch"
except Exception:
    pass
print(json.dumps({"ok": len(missing) == 0, "missing": missing, "distro": distro}))
`;
        try {
            const proc = Gio.Subprocess.new(
                ['python3', '-c', pyCheck],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            proc.communicate_utf8_async(null, null, (source, res) => {
                try {
                    const [, stdout] = source.communicate_utf8_finish(res);
                    const data = JSON.parse((stdout || '').trim());
                    const mapPkg = (distro, mods) => {
                        const pkgs = [];
                        for (const m of mods) {
                            if (m === 'PIL') {
                                pkgs.push(distro === 'debian' ? 'python3-pil' : distro === 'arch' ? 'python-pillow' : 'python3-pillow');
                            } else if (m === 'cv2') {
                                pkgs.push(distro === 'arch' ? 'python-opencv' : 'python3-opencv');
                            } else if (m === 'numpy') {
                                pkgs.push(distro === 'arch' ? 'python-numpy' : 'python3-numpy');
                            }
                        }
                        if (distro === 'fedora') return `sudo dnf install ${pkgs.join(' ')}`;
                        if (distro === 'debian') return `sudo apt install ${pkgs.join(' ')}`;
                        if (distro === 'arch') return `sudo pacman -S ${pkgs.join(' ')}`;
                        return `sudo dnf install ${pkgs.join(' ')}   # Fedora\nsudo apt install ${pkgs.join(' ').replace('python3-pillow', 'python3-pil')}   # Ubuntu/Debian\nsudo pacman -S ${pkgs.join(' ').replace(/python3-/g, 'python-')}   # Arch`;
                    };
                    callback({
                        ok: Boolean(data.ok),
                        missing: data.missing || [],
                        installCmd: mapPkg(data.distro, data.missing || requiredModules),
                    });
                } catch (e) {
                    callback({
                        ok: false,
                        missing: requiredModules,
                        installCmd: 'sudo dnf install python3-pillow python3-opencv python3-numpy',
                    });
                }
            });
        } catch (e) {
            callback({
                ok: false,
                missing: requiredModules,
                installCmd: 'sudo dnf install python3-pillow python3-opencv python3-numpy',
            });
        }
    }

    _createMissingDepsStatusPage(onRetry) {
        const statusPage = new Adw.StatusPage({
            icon_name: 'dialog-warning-symbolic',
            title: _("Missing optional dependencies"),
            description: _("This auxiliary tool requires Python 3 and the following libraries installed on your system:"),
        });

        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            width_request: 480,
        });

        const lblMissing = new Gtk.Label({
            label: '',
            use_markup: true,
            wrap: true,
            halign: Gtk.Align.CENTER,
            css_classes: ['heading'],
        });

        const lblCmdHint = new Gtk.Label({
            label: _("Install them from your terminal with:"),
            css_classes: ['dim-label', 'caption'],
            halign: Gtk.Align.CENTER,
        });

        const cmdEntry = new Gtk.Label({
            label: '',
            selectable: true,
            wrap: true,
            halign: Gtk.Align.CENTER,
            css_classes: ['card', 'monospace', 'cmd-box-label'],
            margin_top: 4,
            margin_bottom: 4,
        });

        const btnCopyCmd = new Gtk.Button({
            child: new Adw.ButtonContent({
                icon_name: 'edit-copy-symbolic',
                label: _("Copy command"),
            }),
            css_classes: ['suggested-action', 'pill'],
            halign: Gtk.Align.CENTER,
        });

        const btnRetry = new Gtk.Button({
            label: _("Check again"),
            css_classes: ['pill'],
            halign: Gtk.Align.CENTER,
        });
        btnRetry.connect('clicked', () => {
            if (onRetry) onRetry();
        });

        const actionsRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            halign: Gtk.Align.CENTER,
            margin_top: 6,
        });
        actionsRow.append(btnCopyCmd);
        actionsRow.append(btnRetry);

        btnCopyCmd.connect('clicked', () => {
            const textToCopy = cmdEntry.get_label();
            if (textToCopy) {
                try {
                    Gdk.Display.get_default().get_clipboard().set(textToCopy);
                    btnCopyCmd.set_child(new Adw.ButtonContent({
                        icon_name: 'emblem-default-symbolic',
                        label: _("Copied! ✓"),
                    }));
                } catch (e) {}
            }
        });

        contentBox.append(lblMissing);
        contentBox.append(lblCmdHint);
        contentBox.append(cmdEntry);
        contentBox.append(actionsRow);
        statusPage.set_child(contentBox);

        return {
            widget: statusPage,
            updateInfo: (info) => {
                const friendlyNames = (info.missing || []).map((m) => {
                    if (m === 'PIL') return 'Pillow (PIL)';
                    if (m === 'cv2') return 'OpenCV (cv2)';
                    if (m === 'numpy') return 'NumPy';
                    return m;
                });
                lblMissing.set_label(`<b>• ${friendlyNames.join('\n• ')}</b>`);
                cmdEntry.set_label(info.installCmd || '');
            },
        };
    }

    _openDuplicatesDialog(parentWindow) {
        const dialog = new Adw.Window({
            transient_for: parentWindow,
            modal: true,
            title: _("Duplicate or Repeated Wallpapers"),
            default_width: 760,
            default_height: 580,
        });

        const toolbarView = new Adw.ToolbarView();
        dialog.set_content(toolbarView);

        const headerBar = new Adw.HeaderBar();
        toolbarView.add_top_bar(headerBar);

        const btnRefresh = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: _("Rescan"),
        });

        const btnIgnoredList = new Gtk.Button({
            label: _("Ignored"),
            icon_name: 'view-list-bullet-symbolic',
            tooltip_text: _("View ignored combinations"),
        });
        headerBar.pack_end(btnRefresh);
        headerBar.pack_end(btnIgnoredList);

        const stack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.CROSSFADE,
            transition_duration: 200,
        });
        toolbarView.set_content(stack);

        // Página 1: Cargando
        const loadingBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
            spacing: 12,
        });
        const spinner = new Gtk.Spinner({
            spinning: true,
            width_request: 42,
            height_request: 42,
            halign: Gtk.Align.CENTER,
        });
        const lblLoadingTitle = new Gtk.Label({
            label: `<b>${_("Scanning wallpaper collections...")}</b>`,
            use_markup: true,
            css_classes: ['title-3'],
        });
        const lblLoadingDesc = new Gtk.Label({
            label: _("Calculating dHash structural hashes and comparing similarities..."),
            css_classes: ['dim-label'],
        });
        const progressBar = new Gtk.ProgressBar({
            show_text: true,
            width_request: 320,
            halign: Gtk.Align.CENTER,
            margin_top: 8,
        });
        loadingBox.append(spinner);
        loadingBox.append(lblLoadingTitle);
        loadingBox.append(lblLoadingDesc);
        loadingBox.append(progressBar);
        stack.add_named(loadingBox, 'loading');

        // Página 2: Sin duplicados
        const statusEmpty = new Adw.StatusPage({
            icon_name: 'emblem-default-symbolic',
            title: _("No duplicates found!"),
            description: _("All images in your collections are unique. No repeated wallpapers or compressed copies detected."),
        });
        stack.add_named(statusEmpty, 'empty');

        // Página 3: Resultados
        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        const resultsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_start: 24,
            margin_end: 24,
            margin_top: 16,
            margin_bottom: 24,
        });
        scrolled.set_child(resultsBox);
        stack.add_named(scrolled, 'results');

        // Página 4: Lista de duplicados ignorados
        const scrolledIgnored = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        const ignoredBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            margin_start: 24,
            margin_end: 24,
            margin_top: 16,
            margin_bottom: 24,
        });
        scrolledIgnored.set_child(ignoredBox);
        stack.add_named(scrolledIgnored, 'ignored');

        const makePairKey = (p1, p2) => (p1 < p2 ? `${p1}|||${p2}` : `${p2}|||${p1}`);

        const cleanStaleIgnored = () => {
            const c = this._loadConfigFile();
            if (!Array.isArray(c.ignored_duplicates)) c.ignored_duplicates = [];
            const originalLen = c.ignored_duplicates.length;
            c.ignored_duplicates = c.ignored_duplicates.filter(item => {
                return item &&
                    item.path_a && GLib.file_test(item.path_a, GLib.FileTest.EXISTS) &&
                    item.path_b && GLib.file_test(item.path_b, GLib.FileTest.EXISTS);
            });
            if (c.ignored_duplicates.length !== originalLen) {
                this._saveConfigFile(c);
            }
            return c;
        };

        const renderIgnoredView = () => {
            const c = cleanStaleIgnored();
            let ch = ignoredBox.get_first_child();
            while (ch) {
                const next = ch.get_next_sibling();
                ignoredBox.remove(ch);
                ch = next;
            }

            const headerRow = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 12,
                margin_bottom: 8,
            });

            const btnBack = new Gtk.Button({
                label: _("Back to results"),
                icon_name: 'go-previous-symbolic',
                css_classes: ['flat', 'pill'],
            });
            btnBack.connect('clicked', () => {
                const hasCards = resultsBox.get_first_child() !== null;
                stack.set_visible_child_name(hasCards ? 'results' : 'empty');
            });
            headerRow.append(btnBack);

            const lblTitleIgnored = new Gtk.Label({
                label: `<b>${_("Ignored Combinations")}</b> (${c.ignored_duplicates.length})`,
                use_markup: true,
                hexpand: true,
                halign: Gtk.Align.START,
                css_classes: ['title-4'],
            });
            headerRow.append(lblTitleIgnored);
            ignoredBox.append(headerRow);

            if (c.ignored_duplicates.length === 0) {
                const emptyStatus = new Adw.StatusPage({
                    icon_name: 'emblem-default-symbolic',
                    title: _("No ignored duplicates"),
                    description: _("Combinations you choose to ignore will appear here so you can restore them."),
                });
                ignoredBox.append(emptyStatus);
            } else {
                c.ignored_duplicates.forEach((item) => {
                    const rowCard = new Gtk.Box({
                        orientation: Gtk.Orientation.HORIZONTAL,
                        spacing: 12,
                        css_classes: ['card'],
                        margin_top: 4,
                        margin_bottom: 4,
                    });

                    const infoBox = new Gtk.Box({
                        orientation: Gtk.Orientation.VERTICAL,
                        spacing: 4,
                        hexpand: true,
                        margin_start: 12,
                        margin_top: 10,
                        margin_bottom: 10,
                    });
                    const lblPairNames = new Gtk.Label({
                        label: `<b>${item.name_a}</b>   <i>vs</i>   <b>${item.name_b}</b>`,
                        use_markup: true,
                        halign: Gtk.Align.START,
                    });
                    const lblPairPaths = new Gtk.Label({
                        label: `${GLib.path_get_dirname(item.path_a)}   ·   ${GLib.path_get_dirname(item.path_b)}`,
                        halign: Gtk.Align.START,
                        ellipsize: 3,
                        css_classes: ['caption', 'dim-label'],
                    });
                    infoBox.append(lblPairNames);
                    infoBox.append(lblPairPaths);
                    rowCard.append(infoBox);

                    const btnRestore = new Gtk.Button({
                        label: _("Restore"),
                        icon_name: 'edit-undo-symbolic',
                        css_classes: ['flat', 'suggested-action'],
                        valign: Gtk.Align.CENTER,
                        margin_end: 12,
                        tooltip_text: _("Stop ignoring"),
                    });
                    btnRestore.connect('clicked', () => {
                        const cur = this._loadConfigFile();
                        if (Array.isArray(cur.ignored_duplicates)) {
                            const k = makePairKey(item.path_a, item.path_b);
                            cur.ignored_duplicates = cur.ignored_duplicates.filter(it => makePairKey(it.path_a, it.path_b) !== k);
                            this._saveConfigFile(cur);
                        }
                        ignoredBox.remove(rowCard);
                        lblTitleIgnored.set_label(`<b>${_("Ignored Combinations")}</b> (${cur.ignored_duplicates.length})`);
                        parentWindow.add_toast(new Adw.Toast({ title: _("Combination restored") }));
                        if (cur.ignored_duplicates.length === 0) {
                            renderIgnoredView();
                        }
                    });
                    rowCard.append(btnRestore);
                    ignoredBox.append(rowCard);
                });
            }

            stack.set_visible_child_name('ignored');
        };

        btnIgnoredList.connect('clicked', () => {
            if (stack.get_visible_child_name() === 'ignored') {
                const hasCards = resultsBox.get_first_child() !== null;
                stack.set_visible_child_name(hasCards ? 'results' : 'empty');
            } else {
                renderIgnoredView();
            }
        });

        let runScan = null;

        runScan = () => {
            stack.set_visible_child_name('loading');
            btnRefresh.set_sensitive(false);
            progressBar.set_fraction(0.0);
            progressBar.set_text(_("Starting scan..."));
            lblLoadingDesc.set_text(_("Calculating dHash structural hashes and comparing similarities..."));

            let child = resultsBox.get_first_child();
            while (child) {
                const next = child.get_next_sibling();
                resultsBox.remove(child);
                child = next;
            }

            const renderResults = (matchesList) => {
                btnRefresh.set_sensitive(true);
                const c = cleanStaleIgnored();
                const ignoredKeys = new Set((c.ignored_duplicates || []).map(it => makePairKey(it.path_a, it.path_b)));
                const visibleMatches = (matchesList || []).filter(m => !ignoredKeys.has(makePairKey(m.path_a, m.path_b)));

                if (!Array.isArray(visibleMatches) || visibleMatches.length === 0) {
                    stack.set_visible_child_name('empty');
                    return;
                }

                const headerLabel = new Gtk.Label({
                    label: `${_("Found")} <b>${visibleMatches.length}</b> ${_("matches of duplicate or near-identical wallpapers:")}`,
                    use_markup: true,
                    halign: Gtk.Align.START,
                    margin_bottom: 8,
                    css_classes: ['title-4'],
                });
                resultsBox.append(headerLabel);

                visibleMatches.forEach((m) => {
                    const card = new Gtk.Box({
                        orientation: Gtk.Orientation.VERTICAL,
                        spacing: 10,
                        css_classes: ['dupe-card'],
                    });

                    const badgeBox = new Gtk.Box({
                        orientation: Gtk.Orientation.HORIZONTAL,
                        spacing: 8,
                    });
                    const lblBadge = new Gtk.Label({
                        label: m.is_exact ? _("EXACT DUPLICATE (100% identical)") : `${_("NEAR IDENTICAL")} (~${m.similarity}% ${_("similarity")})`,
                        css_classes: [m.is_exact ? 'dupe-badge-exact' : 'dupe-badge-similar'],
                        hexpand: true,
                        halign: Gtk.Align.START,
                    });
                    badgeBox.append(lblBadge);

                    const btnIgnore = new Gtk.Button({
                        label: _("Ignore"),
                        icon_name: 'action-unavailable-symbolic',
                        css_classes: ['flat'],
                        tooltip_text: _("Ignore this combination and do not show it again as duplicate"),
                    });
                    btnIgnore.connect('clicked', () => {
                        const cur = this._loadConfigFile();
                        if (!Array.isArray(cur.ignored_duplicates)) cur.ignored_duplicates = [];
                        const pairK = makePairKey(m.path_a, m.path_b);
                        if (!cur.ignored_duplicates.some(it => makePairKey(it.path_a, it.path_b) === pairK)) {
                            cur.ignored_duplicates.push({
                                path_a: m.path_a,
                                path_b: m.path_b,
                                name_a: m.name_a,
                                name_b: m.name_b,
                                date: Date.now(),
                            });
                            this._saveConfigFile(cur);
                        }
                        resultsBox.remove(card);
                        parentWindow.add_toast(new Adw.Toast({ title: _("Combination ignored") }));

                        let hasRemaining = false;
                        let ch = resultsBox.get_first_child();
                        while (ch) {
                            if (ch.has_css_class && ch.has_css_class('dupe-card')) {
                                hasRemaining = true;
                                break;
                            }
                            ch = ch.get_next_sibling();
                        }
                        if (!hasRemaining) {
                            stack.set_visible_child_name('empty');
                        }
                    });
                    badgeBox.append(btnIgnore);
                    card.append(badgeBox);

                    const compareBox = new Gtk.Box({
                        orientation: Gtk.Orientation.HORIZONTAL,
                        spacing: 18,
                        halign: Gtk.Align.CENTER,
                        margin_top: 4,
                    });

                    const createCol = (filePath, fileName, themeLabel, sizeMb) => {
                        const col = new Gtk.Box({
                            orientation: Gtk.Orientation.VERTICAL,
                            spacing: 6,
                            width_request: 260,
                            halign: Gtk.Align.CENTER,
                        });

                        const pic = new Gtk.Picture({
                            content_fit: Gtk.ContentFit.COVER,
                            width_request: 240,
                            height_request: 135,
                            css_classes: ['dupe-preview-img'],
                        });
                        const localP = this._getLocalPath(filePath);
                        if (localP) {
                            pic.set_filename(localP);
                        }
                        col.append(pic);

                        const lblName = new Gtk.Label({
                            label: fileName,
                            ellipsize: 3,
                            max_width_chars: 26,
                            css_classes: ['heading'],
                        });
                        col.append(lblName);

                        const lblMeta = new Gtk.Label({
                            label: `${themeLabel}   ·   ${sizeMb} MB`,
                            css_classes: ['dim-label', 'caption'],
                        });
                        col.append(lblMeta);

                        const actionsBox = new Gtk.Box({
                            orientation: Gtk.Orientation.HORIZONTAL,
                            spacing: 8,
                            halign: Gtk.Align.CENTER,
                            margin_top: 4,
                        });

                        const btnExclude = new Gtk.Button({
                            label: _("Exclude"),
                            icon_name: 'user-trash-symbolic',
                            css_classes: ['flat', 'destructive-action'],
                            tooltip_text: _("Move this version to exclude/ subfolder"),
                        });

                        const btnLocate = new Gtk.Button({
                            icon_name: 'folder-symbolic',
                            css_classes: ['flat'],
                            tooltip_text: _("Locate in Files"),
                        });

                        btnLocate.connect('clicked', () => {
                            if (GLib.find_program_in_path('nautilus')) {
                                Gio.Subprocess.new(['nautilus', '--select', filePath], Gio.SubprocessFlags.NONE);
                            } else {
                                this._openInNautilus(dialog, GLib.path_get_dirname(filePath));
                            }
                        });

                        btnExclude.connect('clicked', () => {
                            const parentDir = GLib.path_get_dirname(filePath);
                            let themeDir = parentDir;
                            if (GLib.path_get_basename(parentDir) === 'pinned') {
                                themeDir = GLib.path_get_dirname(parentDir);
                            }
                            const excludeDir = GLib.build_filenamev([themeDir, 'exclude']);
                            const gExcludeDir = Gio.File.new_for_path(excludeDir);
                            if (!gExcludeDir.query_exists(null)) {
                                gExcludeDir.make_directory_with_parents(null);
                            }

                            const srcFile = Gio.File.new_for_path(filePath);
                            const destFile = Gio.File.new_for_path(GLib.build_filenamev([excludeDir, fileName]));
                            try {
                                srcFile.move(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);
                                btnExclude.set_sensitive(false);
                                btnExclude.set_label(_("Excluded ✓"));
                                btnExclude.remove_css_class('destructive-action');
                                parentWindow.add_toast(new Adw.Toast({ title: `"${fileName}" ${_("moved to exclude/")}` }));
                            } catch (e) {
                                console.error('[AutoWallpaper] Error al mover a exclude:', e.message);
                            }
                        });

                        actionsBox.append(btnExclude);
                        actionsBox.append(btnLocate);
                        col.append(actionsBox);

                        return col;
                    };

                    const colA = createCol(m.path_a, m.name_a, m.origin_a, m.size_mb_a);
                    const lblVs = new Gtk.Label({
                        label: 'vs',
                        css_classes: ['title-3', 'dim-label'],
                        valign: Gtk.Align.CENTER,
                    });
                    const colB = createCol(m.path_b, m.name_b, m.origin_b, m.size_mb_b);

                    compareBox.append(colA);
                    compareBox.append(lblVs);
                    compareBox.append(colB);
                    card.append(compareBox);

                    resultsBox.append(card);
                });

                stack.set_visible_child_name('results');
            };

            const startDuplicatesSubprocess = () => {
                const scriptPath = this._getScriptPath('image_worker.js');
                try {
                    const proc = Gio.Subprocess.new(
                        ['gjs', '-m', scriptPath, 'duplicates', '--json'],
                        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE
                    );

                    const stdoutStream = new Gio.DataInputStream({
                        base_stream: proc.get_stdout_pipe(),
                    });
                    let matchesData = [];

                    const readNextLine = () => {
                        stdoutStream.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
                            try {
                                const [line] = stream.read_line_finish_utf8(res);
                                if (line !== null) {
                                    if (line.startsWith('::PROGRESS:: ')) {
                                        try {
                                            const pData = JSON.parse(line.substring(13));
                                            if (pData.phase === 'hash_start') {
                                                progressBar.set_fraction(0.0);
                                                progressBar.set_text(`0 de ${pData.total} firmas (0%)`);
                                            } else if (pData.phase === 'hash') {
                                                const frac = pData.total > 0 ? (pData.current / pData.total) * 0.5 : 0;
                                                progressBar.set_fraction(frac);
                                                progressBar.set_text(`Fase 1/2: Firmas ${pData.current}/${pData.total} (${Math.round(frac * 100)}%)`);
                                                lblLoadingDesc.set_text(`Calculando dHash de: ${pData.name}`);
                                            } else if (pData.phase === 'compare_start') {
                                                progressBar.set_fraction(0.5);
                                                progressBar.set_text(`Fase 2/2: Comparando 0/${pData.total}`);
                                            } else if (pData.phase === 'compare') {
                                                const frac = 0.5 + (pData.total > 0 ? (pData.current / pData.total) * 0.5 : 0);
                                                progressBar.set_fraction(frac);
                                                progressBar.set_text(`Fase 2/2: Comparando ${pData.current}/${pData.total} (${Math.round(frac * 100)}%)`);
                                                lblLoadingDesc.set_text(`Comparando similitudes estructurales (${pData.current}/${pData.total})...`);
                                            }
                                        } catch (e) {}
                                    } else if (line.startsWith('::RESULT:: ')) {
                                        try {
                                            matchesData = JSON.parse(line.substring(11));
                                        } catch (e) {}
                                    }
                                    readNextLine();
                                } else {
                                    renderResults(matchesData);
                                }
                            } catch (e) {
                                renderResults(matchesData);
                            }
                        });
                    };
                    readNextLine();
                } catch (err) {
                    console.error('[AutoWallpaper] Error al lanzar proceso de duplicados:', err.message);
                    btnRefresh.set_sensitive(true);
                    stack.set_visible_child_name('empty');
                }
            };

            startDuplicatesSubprocess();
        };

        btnRefresh.connect('clicked', runScan);
        dialog.present();
        runScan();
    }

    _openLuminositySortDialog(parentWindow, callbacks = {}) {
        const dialog = new Adw.Window({
            transient_for: parentWindow,
            modal: true,
            title: _("Classify Wallpapers by Luminosity"),
            default_width: 760,
            default_height: 600,
        });

        const toolbarView = new Adw.ToolbarView();
        dialog.set_content(toolbarView);

        const headerBar = new Adw.HeaderBar();
        toolbarView.add_top_bar(headerBar);

        const stack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
            transition_duration: 250,
        });
        toolbarView.set_content(stack);

        // --- Página 1: Configuración de parámetros antes de iniciar ---
        const pageConfig = new Adw.PreferencesPage();
        stack.add_named(pageConfig, 'config');
        stack.set_visible_child_name('config');

        // Aviso sutil de rendimiento (escala de grises, poco llamativo)
        const groupNotice = new Adw.PreferencesGroup();
        const warnPerfBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            css_classes: ['subtle-perf-notice'],
            margin_top: 4,
            margin_bottom: 4,
        });
        const iconWarn = new Gtk.Image({
            icon_name: 'dialog-information-symbolic',
            pixel_size: 16,
        });
        const lblWarn = new Gtk.Label({
            label: `<b>${_("Notice:")}</b> ${_("Perceptual analysis evaluates pixel lightness for each image. For large collections, this process may take a while depending on hardware.")}`,
            use_markup: true,
            wrap: true,
            hexpand: true,
            halign: Gtk.Align.START,
            css_classes: ['caption'],
        });
        warnPerfBox.append(iconWarn);
        warnPerfBox.append(lblWarn);
        groupNotice.add(warnPerfBox);
        pageConfig.add(groupNotice);

        const groupParams = new Adw.PreferencesGroup({
            title: _("Luminosity Classification Parameters"),
            description: _("Automatically organize wallpapers into Light and Dark folders using human perceptual model (CIELAB L* + 65th percentile)."),
        });
        pageConfig.add(groupParams);

        const thresholdOptions = [
            {
                threshold: 30.0,
                badge: _("Very Permissive"),
                pillClass: 'sort-stat-pill-light',
                subtitle: _("Very permissive for Light · Maximum favor towards light wallpapers"),
            },
            {
                threshold: 36.0,
                badge: _("Permissive"),
                pillClass: 'sort-stat-pill-light',
                subtitle: _("Permissive for Light · Favors light wallpapers"),
            },
            {
                threshold: 42.0,
                badge: _("Balanced"),
                pillClass: 'sort-stat-pill-neutral',
                subtitle: _("Balanced / Standard · Recommended · Optimal perceptual balance"),
            },
            {
                threshold: 48.0,
                badge: _("Demanding"),
                pillClass: 'sort-stat-pill-dark',
                subtitle: _("Demanding for Light · More wallpapers moved to Dark"),
            },
            {
                threshold: 54.0,
                badge: _("Very Strict"),
                pillClass: 'sort-stat-pill-dark',
                subtitle: _("Very strict for Light · Minimum favor towards Light wallpapers"),
            },
        ];

        const rowThreshold = new Adw.PreferencesRow({
            activatable: false,
            selectable: false,
        });

        const boxThreshold = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
            margin_top: 12,
            margin_bottom: 14,
            margin_start: 16,
            margin_end: 16,
        });

        const headerThreshold = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
        });

        const titleBoxThreshold = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            hexpand: true,
        });

        const lblThresholdTitle = new Gtk.Label({
            label: _("Brightness Sensitivity (CIELAB L* Threshold)"),
            halign: Gtk.Align.START,
            css_classes: ['title'],
        });

        const lblThresholdSubtitle = new Gtk.Label({
            label: thresholdOptions[2].subtitle,
            halign: Gtk.Align.START,
            css_classes: ['subtitle'],
            wrap: true,
        });

        titleBoxThreshold.append(lblThresholdTitle);
        titleBoxThreshold.append(lblThresholdSubtitle);
        headerThreshold.append(titleBoxThreshold);

        const lblThresholdBadge = new Gtk.Label({
            label: thresholdOptions[2].badge,
            valign: Gtk.Align.CENTER,
            css_classes: ['sort-threshold-badge', thresholdOptions[2].pillClass],
        });
        headerThreshold.append(lblThresholdBadge);
        boxThreshold.append(headerThreshold);

        const scaleThreshold = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 4, 1);
        scaleThreshold.set_round_digits(0);
        scaleThreshold.set_draw_value(false);
        scaleThreshold.set_hexpand(true);
        scaleThreshold.set_value(2); // Por defecto: Equilibrado (Umbral 42.0)

        scaleThreshold.add_mark(0, Gtk.PositionType.BOTTOM, `<small>${_("More Light")}</small>`);
        scaleThreshold.add_mark(1, Gtk.PositionType.BOTTOM, `<small>${_("Permissive")}</small>`);
        scaleThreshold.add_mark(2, Gtk.PositionType.BOTTOM, `<small>${_("Balanced")}</small>`);
        scaleThreshold.add_mark(3, Gtk.PositionType.BOTTOM, `<small>${_("Demanding")}</small>`);
        scaleThreshold.add_mark(4, Gtk.PositionType.BOTTOM, `<small>${_("More Dark")}</small>`);

        const updateThresholdUI = (idx) => {
            const opt = thresholdOptions[idx] ?? thresholdOptions[2];
            lblThresholdSubtitle.set_text(opt.subtitle);
            lblThresholdBadge.set_text(opt.badge);
            lblThresholdBadge.remove_css_class('sort-stat-pill-light');
            lblThresholdBadge.remove_css_class('sort-stat-pill-neutral');
            lblThresholdBadge.remove_css_class('sort-stat-pill-dark');
            lblThresholdBadge.add_css_class(opt.pillClass);
        };

        scaleThreshold.connect('change-value', (self, scroll, val) => {
            const snapped = Math.max(0, Math.min(4, Math.round(val)));
            self.set_value(snapped);
            return true;
        });

        scaleThreshold.connect('value-changed', () => {
            const idx = Math.max(0, Math.min(4, Math.round(scaleThreshold.get_value())));
            updateThresholdUI(idx);
        });

        boxThreshold.append(scaleThreshold);
        rowThreshold.set_child(boxThreshold);
        groupParams.add(rowThreshold);

        const comboScope = new Adw.ComboRow({
            title: _("Collections to analyze"),
            subtitle: _("Subfolders pinned/ and exclude/ are always protected."),
            model: new Gtk.StringList({
                strings: [
                    _("Both collections (Light and Dark - Recommended)"),
                    _("Light collection only (Reevaluate and move dark wallpapers)"),
                    _("Dark collection only (Reevaluate and move light wallpapers)"),
                    _("Custom folder (Analyze and classify images into Light/Dark)"),
                ],
            }),
            selected: 0,
        });
        groupParams.add(comboScope);

        let chosenCustomDir = null;

        const rowCustomDir = new Adw.ActionRow({
            title: _("Folder to classify"),
            subtitle: _("No folder selected"),
            visible: false,
        });

        const btnChooseCustom = new Gtk.Button({
            label: _("Select folder..."),
            icon_name: 'folder-open-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['pill'],
        });

        const openCustomFolderPicker = () => {
            const fileDialog = new Gtk.FileDialog({
                title: _("Select custom folder"),
                modal: true,
            });
            fileDialog.select_folder(dialog, null, (d, res) => {
                try {
                    const folder = d.select_folder_finish(res);
                    if (folder) {
                        chosenCustomDir = folder.get_path();
                        rowCustomDir.set_subtitle(chosenCustomDir);
                    }
                } catch (err) {}
            });
        };

        btnChooseCustom.connect('clicked', openCustomFolderPicker);
        rowCustomDir.add_suffix(btnChooseCustom);
        rowCustomDir.set_activatable_widget(btnChooseCustom);
        groupParams.add(rowCustomDir);

        comboScope.connect('notify::selected', () => {
            const isCustom = (comboScope.selected === 3);
            rowCustomDir.set_visible(isCustom);
            if (isCustom && !chosenCustomDir) {
                openCustomFolderPicker();
            }
        });

        const btnBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END,
            margin_top: 14,
            margin_bottom: 12,
        });
        groupParams.add(btnBox);

        const btnCancel = new Gtk.Button({
            label: _("Cancel"),
            css_classes: ['flat'],
        });
        btnCancel.connect('clicked', () => dialog.close());

        const btnStart = new Gtk.Button({
            label: _("Start classification"),
            css_classes: ['suggested-action', 'pill'],
        });
        btnBox.append(btnCancel);
        btnBox.append(btnStart);

        // --- Página 2: Progreso en tiempo real con feed dinámico ---
        const runningBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_start: 22,
            margin_end: 22,
            margin_top: 16,
            margin_bottom: 20,
        });
        stack.add_named(runningBox, 'running');

        // Header status box
        const statusBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
        });
        const lblTitle = new Gtk.Label({
            label: `<b>${_("Classifying wallpapers via CIELAB L*...")}</b>`,
            use_markup: true,
            css_classes: ['title-3'],
            halign: Gtk.Align.START,
        });
        const lblDesc = new Gtk.Label({
            label: _("Evaluating perceptual lightness and 65th percentile for each image..."),
            css_classes: ['dim-label'],
            halign: Gtk.Align.START,
        });
        statusBox.append(lblTitle);
        statusBox.append(lblDesc);
        runningBox.append(statusBox);

        // 1. FILA DE RESUMEN DE ESTADÍSTICAS (PÍLDORAS CLARO / OSCURO) ARRIBA DE LA BARRA
        const statsRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.START,
            margin_top: 4,
            margin_bottom: 4,
        });

        const pillLightBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            css_classes: ['sort-stat-pill-light'],
            valign: Gtk.Align.CENTER,
        });
        const iconLightPill = new Gtk.Image({
            icon_name: 'weather-clear-symbolic',
            pixel_size: 15,
        });
        const lblLightPill = new Gtk.Label({
            label: `${_("Moved to Light")}: <b>0</b>`,
            use_markup: true,
        });
        pillLightBox.append(iconLightPill);
        pillLightBox.append(lblLightPill);
        statsRow.append(pillLightBox);

        const pillDarkBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            css_classes: ['sort-stat-pill-dark'],
            valign: Gtk.Align.CENTER,
        });
        const iconDarkPill = new Gtk.Image({
            icon_name: 'weather-clear-night-symbolic',
            pixel_size: 15,
        });
        const lblDarkPill = new Gtk.Label({
            label: `${_("Moved to Dark")}: <b>0</b>`,
            use_markup: true,
        });
        pillDarkBox.append(iconDarkPill);
        pillDarkBox.append(lblDarkPill);
        statsRow.append(pillDarkBox);

        runningBox.append(statsRow);

        // 2. BARRA DE PROGRESO
        const progressBar = new Gtk.ProgressBar({
            show_text: true,
            margin_top: 2,
            margin_bottom: 2,
        });
        progressBar.set_text(_("Starting analysis..."));
        runningBox.append(progressBar);

        // 3. TIP ELEGANTE Y DISCRETO DE CARPETAS PROTEGIDAS DEBAJO DE LA BARRA DE CARGA
        const tipBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            css_classes: ['sort-tip-subtle'],
            valign: Gtk.Align.CENTER,
            margin_top: 2,
            margin_bottom: 4,
        });
        const iconTip = new Gtk.Image({
            icon_name: 'security-high-symbolic',
            pixel_size: 14,
            css_classes: ['dim-label'],
        });
        const lblTip = new Gtk.Label({
            label: `${_("Subfolders")} <b>pinned/</b> (${_("pinned wallpapers")}) ${_("and")} <b>exclude/</b> (${_("excluded wallpapers")}) ${_("are protected and will not be moved.")}`,
            use_markup: true,
            hexpand: true,
            halign: Gtk.Align.START,
            css_classes: ['caption', 'dim-label'],
        });
        tipBox.append(iconTip);
        tipBox.append(lblTip);
        runningBox.append(tipBox);

        // 4. SCROLLED VIEW WITH RESULTS
        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
        });
        const resultsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_top: 8,
            margin_bottom: 8,
        });
        scrolled.set_child(resultsBox);
        runningBox.append(scrolled);

        // Placeholder con rueda de cargando visible mientras se escanean los fondos
        const scanningPlaceholder = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER,
            margin_top: 48,
            margin_bottom: 48,
        });
        const scanningSpinner = new Gtk.Spinner({
            spinning: true,
            width_request: 44,
            height_request: 44,
            halign: Gtk.Align.CENTER,
        });
        const lblScanningTitle = new Gtk.Label({
            label: `<b>${_("Scanning and classifying wallpapers...")}</b>`,
            use_markup: true,
            css_classes: ['title-3'],
        });
        const lblScanningDesc = new Gtk.Label({
            label: _("Analyzing perceptual lightness (CIELAB L*) and 65th percentile on each image"),
            css_classes: ['dim-label'],
        });
        const lblCurrentEval = new Gtk.Label({
            label: '',
            css_classes: ['caption', 'dim-label'],
            ellipsize: 3,
            max_width_chars: 42,
        });
        scanningPlaceholder.append(scanningSpinner);
        scanningPlaceholder.append(lblScanningTitle);
        scanningPlaceholder.append(lblScanningDesc);
        scanningPlaceholder.append(lblCurrentEval);
        resultsBox.append(scanningPlaceholder);

        // Bottom actions
        const actionsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END,
        });
        const btnStop = new Gtk.Button({
            label: _("Stop"),
            css_classes: ['destructive-action'],
        });
        const btnClose = new Gtk.Button({
            label: _("Close"),
            css_classes: ['suggested-action'],
            visible: false,
        });
        actionsBox.append(btnStop);
        actionsBox.append(btnClose);
        runningBox.append(actionsBox);

        let activeProc = null;
        let movedLightCount = 0;
        let movedDarkCount = 0;

        // Búfer FIFO de tarjetas en vivo (Máx 20) para garantizar fluidez y escalabilidad absoluta con 500+ imágenes
        const MAX_CARDS = 20;
        const cardQueue = [];

        btnClose.connect('clicked', () => dialog.close());

        btnStop.connect('clicked', () => {
            if (activeProc) {
                try {
                    activeProc.force_exit();
                } catch (e) {}
            }
            if (scanningPlaceholder.get_parent() === resultsBox) {
                resultsBox.remove(scanningPlaceholder);
            }
            lblTitle.set_label(`<b>${_("Process stopped by user")}</b>`);
            btnStop.set_visible(false);
            btnClose.set_visible(true);
        });

        const scriptPath = this._getScriptPath('image_worker.js');
        const currentCfg = this._loadConfigFile();
        const darkFolderName = GLib.path_get_basename(currentCfg.dir_dark || 'dark');
        const lightFolderName = GLib.path_get_basename(currentCfg.dir_light || 'light');

        btnStart.connect('clicked', () => {
            const scopeVals = ['both', 'light', 'dark', 'custom'];
            const chosenScope = scopeVals[comboScope.selected] ?? 'both';

            if (chosenScope === 'custom' && !chosenCustomDir) {
                parentWindow.add_toast(new Adw.Toast({ title: _("Select folder...") }));
                openCustomFolderPicker();
                return;
            }

            stack.set_visible_child_name('running');

            const chosenThreshold = thresholdOptions[Math.round(scaleThreshold.get_value())]?.threshold ?? 42.0;

            const procArgs = [
                'gjs', '-m', scriptPath, 'organize',
                '--json',
                '--threshold', String(chosenThreshold),
                '--scope', chosenScope,
            ];

            if (chosenScope === 'custom' && chosenCustomDir) {
                procArgs.push('--custom-dir', chosenCustomDir);
            }

            try {
                activeProc = Gio.Subprocess.new(
                    procArgs,
                    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE
                );

                const stdoutStream = new Gio.DataInputStream({
                    base_stream: activeProc.get_stdout_pipe(),
                });

                const onProcessFinished = () => {
                    progressBar.set_fraction(1.0);
                    progressBar.set_text(`${_("Classification completed")} (100%)`);
                    btnStop.set_visible(false);
                    btnClose.set_visible(true);

                    if (scanningPlaceholder.get_parent() === resultsBox) {
                        resultsBox.remove(scanningPlaceholder);
                    }

                    if (movedLightCount === 0 && movedDarkCount === 0) {
                        lblTitle.set_label(`<b>${_("Collections already balanced!")}</b>`);
                        lblDesc.set_label(_("All wallpapers are already in their appropriate folder according to the selected threshold."));
                        const emptyCard = new Adw.StatusPage({
                            icon_name: 'emblem-default-symbolic',
                            title: _("Balanced collections"),
                            description: _("No wallpapers needed to be moved. Both folders match their lightness profiles."),
                        });
                        resultsBox.append(emptyCard);
                    } else {
                        lblTitle.set_label(`<b>✓ ${_("Classification completed successfully")}</b>`);
                        const totalMoved = movedLightCount + movedDarkCount;
                        const extraNote = totalMoved > MAX_CARDS ? ` (${_("showing last")} ${MAX_CARDS} ${_("live")})` : '';
                        lblDesc.set_label(`${_("Moved")} ${movedLightCount} ${_("to light and")} ${movedDarkCount} ${_("to dark in total")}${extraNote}.`);
                        parentWindow.add_toast(new Adw.Toast({ title: _("Wallpaper classification completed") }));
                    }

                    if (callbacks.refreshPreviews) callbacks.refreshPreviews();
                    if (callbacks.updateCurrentWallpaperRow) callbacks.updateCurrentWallpaperRow();
                    const cfg = this._loadConfigFile();
                    cfg.known_count_light = this._countWallpaperImages(cfg.dir_light);
                    cfg.known_count_dark = this._countWallpaperImages(cfg.dir_dark);
                    this._saveConfigFile(cfg);
                    if (callbacks.updateStatusText) {
                        this._checkServiceActive((active) => callbacks.updateStatusText(active));
                    }
                };

                let lastOrganizeUiUpdate = 0;

                const readNext = () => {
                    stdoutStream.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
                        try {
                            const [line] = stream.read_line_finish_utf8(res);
                            if (line !== null) {
                                if (line.startsWith('::PROGRESS:: ')) {
                                    try {
                                        const data = JSON.parse(line.substring(13));
                                        if (data.phase === 'start') {
                                            progressBar.set_fraction(0.0);
                                            progressBar.set_text(`0 de ${data.total} (0%)`);
                                        } else if (data.phase === 'evaluating') {
                                            const nowMs = GLib.get_monotonic_time() / 1000;
                                            if (nowMs - lastOrganizeUiUpdate > 65 || data.current === data.total) {
                                                lastOrganizeUiUpdate = nowMs;
                                                const frac = data.total > 0 ? (data.current / data.total) : 0;
                                                progressBar.set_fraction(frac);
                                                progressBar.set_text(`${data.current} de ${data.total} (${Math.round(frac * 100)}%)`);
                                                lblDesc.set_text(`${_("Evaluating:")} ${data.name} (L*: ${data.score})`);
                                                lblCurrentEval.set_label(`${_("Evaluating:")} ${data.name} (L*: ${data.score})`);
                                            }
                                        } else if (data.phase === 'moved') {
                                            const frac = data.total > 0 ? (data.current / data.total) : 0;
                                            progressBar.set_fraction(frac);
                                            progressBar.set_text(`${data.current} de ${data.total} (${Math.round(frac * 100)}%)`);

                                            if (scanningPlaceholder.get_parent() === resultsBox) {
                                                resultsBox.remove(scanningPlaceholder);
                                            }

                                            if (data.to === 'light') {
                                                movedLightCount++;
                                                lblLightPill.set_label(`${_("Moved to Light")}: <b>${movedLightCount}</b>`);
                                            } else {
                                                movedDarkCount++;
                                                lblDarkPill.set_label(`${_("Moved to Dark")}: <b>${movedDarkCount}</b>`);
                                            }

                                            // Creación de tarjeta visual
                                            const card = new Gtk.Box({
                                                orientation: Gtk.Orientation.HORIZONTAL,
                                                spacing: 18,
                                                halign: Gtk.Align.CENTER,
                                                css_classes: ['organize-card'],
                                            });

                                            // Columna del fondo
                                            const wpBox = new Gtk.Box({
                                                orientation: Gtk.Orientation.VERTICAL,
                                                spacing: 6,
                                                width_request: 220,
                                                halign: Gtk.Align.CENTER,
                                            });
                                            const wpPic = new Gtk.Picture({
                                                content_fit: Gtk.ContentFit.COVER,
                                                width_request: 200,
                                                height_request: 112,
                                                css_classes: ['organize-thumb'],
                                            });
                                            const localP = this._getLocalPath(data.path);
                                            if (localP) {
                                                wpPic.set_filename(localP);
                                            }
                                            wpBox.append(wpPic);

                                            const wpName = new Gtk.Label({
                                                label: data.name,
                                                ellipsize: 3,
                                                max_width_chars: 24,
                                                css_classes: ['heading'],
                                            });
                                            wpBox.append(wpName);

                                            const wpScore = new Gtk.Label({
                                                label: `${_("Lightness L*")}: ${data.score}/100 · Sat: ${data.sat}`,
                                                css_classes: ['dim-label', 'caption'],
                                            });
                                            wpBox.append(wpScore);

                                            // Columna de la carpeta destino
                                            const folderBox = new Gtk.Box({
                                                orientation: Gtk.Orientation.VERTICAL,
                                                spacing: 6,
                                                width_request: 220,
                                                valign: Gtk.Align.CENTER,
                                                halign: Gtk.Align.CENTER,
                                                css_classes: ['organize-folder-card'],
                                            });
                                            const isMovingDark = (data.to === 'dark');
                                            const folderIconName = isMovingDark ? 'weather-clear-night-symbolic' : 'weather-clear-symbolic';
                                            const folderTitle = isMovingDark ? _("Dark Collection") : _("Light Collection");
                                            const folderPathName = isMovingDark ? darkFolderName : lightFolderName;

                                            const fIcon = new Gtk.Image({
                                                icon_name: folderIconName,
                                                pixel_size: 34,
                                                css_classes: [isMovingDark ? 'organize-icon-dark' : 'organize-icon-light'],
                                            });
                                            folderBox.append(fIcon);

                                            const fTitle = new Gtk.Label({
                                                label: `<b>${folderTitle}</b>`,
                                                use_markup: true,
                                                css_classes: ['heading'],
                                            });
                                            folderBox.append(fTitle);

                                            const fSub = new Gtk.Label({
                                                label: folderPathName,
                                                ellipsize: 3,
                                                max_width_chars: 24,
                                                css_classes: ['dim-label', 'caption'],
                                            });
                                            folderBox.append(fSub);

                                            // Contenedor de la flecha estilizada
                                            const arrowBox = new Gtk.Box({
                                                valign: Gtk.Align.CENTER,
                                                halign: Gtk.Align.CENTER,
                                                css_classes: ['organize-arrow-container'],
                                            });
                                            const arrowIcon = new Gtk.Image({
                                                icon_name: isMovingDark ? 'go-next-symbolic' : 'go-previous-symbolic',
                                                pixel_size: 24,
                                                css_classes: [isMovingDark ? 'organize-icon-dark' : 'organize-icon-light'],
                                            });
                                            arrowBox.append(arrowIcon);

                                            // Regla de orientación y posición:
                                            // Flecha a la derecha si va a oscuro; flecha a la izquierda y posiciones invertidas si va a claro
                                            if (isMovingDark) {
                                                card.append(wpBox);
                                                card.append(arrowBox);
                                                card.append(folderBox);
                                            } else {
                                                card.append(folderBox);
                                                card.append(arrowBox);
                                                card.append(wpBox);
                                            }

                                            resultsBox.append(card);
                                            cardQueue.push(card);

                                            // Control de búfer para evitar sobrecarga de memoria GTK con cientos de fondos
                                            if (cardQueue.length > MAX_CARDS) {
                                                const oldCard = cardQueue.shift();
                                                if (oldCard && oldCard.get_parent() === resultsBox) {
                                                    resultsBox.remove(oldCard);
                                                }
                                            }
                                        }
                                    } catch (e) {}
                                }
                                readNext();
                            } else {
                                onProcessFinished();
                            }
                        } catch (e) {
                            onProcessFinished();
                        }
                    });
                };

                readNext();
            } catch (err) {
                lblTitle.set_label('❌ Error al iniciar clasificación');
                lblDesc.set_label(err.message);
                btnStop.set_visible(false);
                btnClose.set_visible(true);
            }
        });

        dialog.present();
    }

    _openUpscaleDialog(parentWindow, engineInfo, onEngineUpdated = null) {
        const dialog = new Adw.Window({
            transient_for: parentWindow,
            modal: true,
            title: _("Smart Upscale (Real-CUGAN)"),
            default_width: 660,
            default_height: 540,
        });

        const toolbarView = new Adw.ToolbarView();
        dialog.set_content(toolbarView);

        const headerBar = new Adw.HeaderBar();
        toolbarView.add_top_bar(headerBar);

        const stack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.SLIDE_LEFT_RIGHT,
            transition_duration: 250,
        });
        toolbarView.set_content(stack);

        // --- Página 0: Comprobando componentes con animación suave ---
        const checkingPage = new Adw.StatusPage({
            icon_name: 'preferences-system-search-symbolic',
            title: _("Checking components..."),
            description: _("Checking Python dependencies and Real-CUGAN engine availability..."),
        });
        const checkingSpinner = new Gtk.Spinner({
            spinning: true,
            width_request: 44,
            height_request: 44,
            halign: Gtk.Align.CENTER,
            margin_top: 12,
        });
        checkingPage.set_child(checkingSpinner);
        stack.add_named(checkingPage, 'checking');
        stack.set_visible_child_name('checking');

        // --- Página 0A: Dependencias de Python faltantes ---
        let verifyUpscaleEnv = null;
        const upscaleMissingDepsView = this._createMissingDepsStatusPage(() => {
            if (verifyUpscaleEnv) verifyUpscaleEnv();
        });
        stack.add_named(upscaleMissingDepsView.widget, 'missing_deps');

        // --- Página 0B: Instalación asistida del motor Real-CUGAN (compatible con EGO) ---
        const engineTargetDir = `${GLib.get_user_data_dir()}/autowallpaper/realcugan`;
        const installEngineCmd = `mkdir -p "${engineTargetDir}" && curl -L "https://github.com/nihui/realcugan-ncnn-vulkan/releases/download/20220728/realcugan-ncnn-vulkan-20220728-ubuntu.zip" -o "${engineTargetDir}/realcugan.zip" && unzip -o "${engineTargetDir}/realcugan.zip" -d "${engineTargetDir}" && rm -f "${engineTargetDir}/realcugan.zip" && chmod +x "${engineTargetDir}"/*/realcugan-ncnn-vulkan`;

        const downloadEnginePage = new Adw.StatusPage({
            icon_name: 'folder-download-symbolic',
            title: _("Real-CUGAN engine not installed"),
            description: _("To keep the extension lightweight and comply with GNOME Extensions policies, install the Real-CUGAN engine (~45 MB) by copying and running the following command in your terminal:"),
        });
        const downloadBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            width_request: 480,
        });
        const lblEngineCmd = new Gtk.Label({
            label: installEngineCmd,
            selectable: true,
            wrap: true,
            wrap_mode: 2,
            halign: Gtk.Align.CENTER,
            css_classes: ['card', 'monospace', 'cmd-box-label'],
            margin_top: 4,
            margin_bottom: 4,
        });
        const engineBtnsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            halign: Gtk.Align.CENTER,
            margin_top: 6,
        });
        const btnCopyEngineCmd = new Gtk.Button({
            child: new Adw.ButtonContent({
                icon_name: 'edit-copy-symbolic',
                label: _("Copy installation command"),
            }),
            css_classes: ['suggested-action', 'pill'],
            halign: Gtk.Align.CENTER,
        });
        const btnVerifyEngine = new Gtk.Button({
            label: _("Check again"),
            css_classes: ['pill'],
            halign: Gtk.Align.CENTER,
        });
        engineBtnsBox.append(btnCopyEngineCmd);
        engineBtnsBox.append(btnVerifyEngine);

        downloadBox.append(lblEngineCmd);
        downloadBox.append(engineBtnsBox);
        downloadEnginePage.set_child(downloadBox);
        stack.add_named(downloadEnginePage, 'download_engine');

        // --- Página 1: Configuración de parámetros ---
        const pageConfig = new Adw.PreferencesPage();
        stack.add_named(pageConfig, 'config');

        // Aviso sutil de rendimiento (escala de grises, poco llamativo)
        const groupNotice = new Adw.PreferencesGroup();
        const warnPerfBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 10,
            css_classes: ['subtle-perf-notice'],
            margin_top: 4,
            margin_bottom: 4,
        });
        const iconWarn = new Gtk.Image({
            icon_name: 'dialog-information-symbolic',
            pixel_size: 16,
        });
        const lblWarn = new Gtk.Label({
            label: `<b>${_("Notice:")}</b> ${_("The upscaling process uses Vulkan GPU neural acceleration. It may take some time and temporarily affect performance while running.")}`,
            use_markup: true,
            wrap: true,
            hexpand: true,
            halign: Gtk.Align.START,
            css_classes: ['caption'],
        });
        warnPerfBox.append(iconWarn);
        warnPerfBox.append(lblWarn);
        groupNotice.add(warnPerfBox);
        pageConfig.add(groupNotice);

        const groupParams = new Adw.PreferencesGroup({
            title: _("AI Upscale Parameters"),
            description: `${_("Enhance sharpness and resolution using Real-CUGAN.")}\n${_("Detected GPU:")} ${engineInfo?.gpu_name || 'Vulkan GPU'}`,
        });
        pageConfig.add(groupParams);

        verifyUpscaleEnv = () => {
            stack.set_visible_child_name('checking');
            checkingSpinner.start();

            this._checkPythonEnvAsync(['PIL', 'cv2', 'numpy'], (envInfo) => {
                // Buffer de tiempo de maniobra y sincronización para evitar parpadeos confusos
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                    if (!envInfo.ok && Array.isArray(envInfo.missing) && envInfo.missing.length > 0) {
                        upscaleMissingDepsView.updateInfo(envInfo);
                        stack.set_visible_child_name('missing_deps');
                        return GLib.SOURCE_REMOVE;
                    }

                    const upscaleScript = this._getScriptPath('smart_upscale.py');
                    try {
                        const proc = Gio.Subprocess.new(
                            ['python3', upscaleScript, '--check-env'],
                            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                        );
                        proc.communicate_utf8_async(null, null, (source, res) => {
                            try {
                                const [, stdout] = source.communicate_utf8_finish(res);
                                const data = JSON.parse((stdout || '{}').trim());
                                if (!data.engine_installed) {
                                    stack.set_visible_child_name('download_engine');
                                    return;
                                }
                                groupParams.set_description(`${_("Enhance sharpness and resolution using Real-CUGAN.")}\n${_("Detected GPU:")} ${data.gpu_name || 'Vulkan GPU'}`);
                                if (onEngineUpdated) onEngineUpdated();
                                stack.set_visible_child_name('config');
                            } catch (e) {
                                stack.set_visible_child_name('download_engine');
                            }
                        });
                    } catch (e) {
                        stack.set_visible_child_name('download_engine');
                    }
                    return GLib.SOURCE_REMOVE;
                });
            });
        };

        btnCopyEngineCmd.connect('clicked', () => {
            try {
                Gdk.Display.get_default().get_clipboard().set(installEngineCmd);
                btnCopyEngineCmd.set_child(new Adw.ButtonContent({
                    icon_name: 'emblem-default-symbolic',
                    label: _("Copied! ✓"),
                }));
                parentWindow.add_toast(new Adw.Toast({ title: _("Command copied to clipboard") }));
            } catch (e) {}
        });

        btnVerifyEngine.connect('clicked', () => {
            verifyUpscaleEnv();
        });

        if (engineInfo && engineInfo.available) {
            stack.set_visible_child_name('config');
        } else {
            verifyUpscaleEnv();
        }

        const comboTarget = new Adw.ComboRow({
            title: _("Folder to upscale"),
            model: new Gtk.StringList({
                strings: [
                    _("☀️ Light collection"),
                    _("🌙 Dark collection"),
                    _("🌓 Both collections (light and dark)"),
                ],
            }),
            selected: 0,
        });
        groupParams.add(comboTarget);

        const comboScale = new Adw.ComboRow({
            title: _("Scale factor"),
            subtitle: _("Resolution multiplier"),
            model: new Gtk.StringList({
                strings: [
                    _("2x (Recommended for 1080p -> 4K)"),
                    '3x',
                    '4x',
                ],
            }),
            selected: 0,
        });
        groupParams.add(comboScale);

        const comboDenoise = new Adw.ComboRow({
            title: _("Noise Reduction (Denoise)"),
            subtitle: _("Artifact and compression cleanup level"),
            model: new Gtk.StringList({
                strings: [
                    _("Level 0 - Default (Optimal sharpness)"),
                    _("Level 1 - Soft"),
                    _("Level 2 - Medium"),
                    _("Level 3 - Strong"),
                    _("Level -1 - No denoise (Preserves grain)"),
                ],
            }),
            selected: 0,
        });
        groupParams.add(comboDenoise);

        const comboMaxRes = new Adw.ComboRow({
            title: _("Resolution limit"),
            subtitle: _("Skip images that already reach or exceed this size"),
            model: new Gtk.StringList({
                strings: [
                    _("2560x1440 (2K QHD - Recommended)"),
                    _("1920x1080 (Full HD)"),
                    _("3840x2160 (4K UHD)"),
                    _("No limit (process all images)"),
                ],
            }),
            selected: 0,
        });
        groupParams.add(comboMaxRes);

        const switchBackup = new Adw.SwitchRow({
            title: _("Backup copy"),
            subtitle: _("Save copy of original images in exclude/backup_upscale_original/"),
            active: true,
        });
        groupParams.add(switchBackup);

        const switchIgnoreTag = new Adw.SwitchRow({
            title: _("Ignore previous upscale tag"),
            subtitle: _("Allows re-upscaling images previously processed with AI"),
            active: false,
        });
        let ignoreTagConfirmed = false;
        switchIgnoreTag.connect('notify::active', () => {
            if (switchIgnoreTag.active && !ignoreTagConfirmed) {
                const warnDialog = new Adw.MessageDialog({
                    transient_for: dialog,
                    modal: true,
                    heading: _("Ignore previous upscale tag?"),
                    body: `${_("Warning: Repeatedly upscaling an AI-processed image may introduce unwanted artifacts or degrade quality.")}\n\n${_("Are you sure you want to force upscaling on previously treated images?")}`,
                });
                warnDialog.add_response('cancel', _("Cancel"));
                warnDialog.add_response('confirm', _("Enable anyway"));
                warnDialog.set_response_appearance('confirm', Adw.ResponseAppearance.DESTRUCTIVE);
                warnDialog.set_default_response('cancel');
                warnDialog.set_close_response('cancel');
                warnDialog.connect('response', (self, response) => {
                    if (response === 'confirm') {
                        ignoreTagConfirmed = true;
                        switchIgnoreTag.set_active(true);
                    } else {
                        ignoreTagConfirmed = false;
                        switchIgnoreTag.set_active(false);
                    }
                });
                warnDialog.present();
            } else if (!switchIgnoreTag.active) {
                ignoreTagConfirmed = false;
            }
        });
        groupParams.add(switchIgnoreTag);

        const btnBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END,
            margin_top: 14,
            margin_bottom: 12,
        });
        groupParams.add(btnBox);

        const btnCancel = new Gtk.Button({
            label: _("Cancel"),
            css_classes: ['flat'],
        });
        btnCancel.connect('clicked', () => dialog.close());

        const btnStart = new Gtk.Button({
            label: _("Start upscaling"),
            css_classes: ['suggested-action', 'pill'],
        });
        btnBox.append(btnCancel);
        btnBox.append(btnStart);

        // --- Página 2: Progreso en tiempo real con terminal ---
        const runningBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 10,
            margin_start: 18,
            margin_end: 18,
            margin_top: 14,
            margin_bottom: 16,
        });
        stack.add_named(runningBox, 'running');

        const runningHeaderBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            valign: Gtk.Align.CENTER,
        });
        const runSpinner = new Gtk.Spinner({
            spinning: true,
            width_request: 24,
            height_request: 24,
        });
        const lblRunTitle = new Gtk.Label({
            label: `<b>${_("Upscaling wallpapers with Real-CUGAN...")}</b>`,
            use_markup: true,
            css_classes: ['title-4'],
        });
        runningHeaderBox.append(runSpinner);
        runningHeaderBox.append(lblRunTitle);
        runningBox.append(runningHeaderBox);

        // Progress bar
        const runningProgressBar = new Gtk.ProgressBar({
            show_text: true,
            margin_top: 2,
            margin_bottom: 2,
        });
        runningProgressBar.set_text(_("Starting..."));
        runningBox.append(runningProgressBar);

        // Tarjeta visual del fondo actualmente en procesamiento
        const currentItemCard = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 14,
            css_classes: ['upscale-current-card'],
            visible: false,
        });
        const currentPic = new Gtk.Picture({
            content_fit: Gtk.ContentFit.COVER,
            width_request: 120,
            height_request: 68,
            css_classes: ['upscale-current-thumb'],
        });
        const currentInfoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
            valign: Gtk.Align.CENTER,
            hexpand: true,
        });
        const lblCurrentName = new Gtk.Label({
            label: '',
            ellipsize: 3,
            halign: Gtk.Align.START,
            css_classes: ['heading'],
        });
        const lblCurrentDetails = new Gtk.Label({
            label: '',
            halign: Gtk.Align.START,
            css_classes: ['dim-label', 'caption'],
        });
        currentInfoBox.append(lblCurrentName);
        currentInfoBox.append(lblCurrentDetails);
        currentItemCard.append(currentPic);
        currentItemCard.append(currentInfoBox);
        runningBox.append(currentItemCard);

        const scrolledLog = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
        });
        const logView = new Gtk.TextView({
            monospace: true,
            editable: false,
            cursor_visible: false,
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            css_classes: ['terminal-log-view'],
        });
        scrolledLog.set_child(logView);
        runningBox.append(scrolledLog);

        const runActionsBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.END,
        });
        const btnStop = new Gtk.Button({
            label: _("Stop"),
            css_classes: ['destructive-action'],
        });
        const btnClose = new Gtk.Button({
            label: _("Close"),
            css_classes: ['suggested-action'],
            visible: false,
        });
        runActionsBox.append(btnStop);
        runActionsBox.append(btnClose);
        runningBox.append(runActionsBox);

        let activeProc = null;

        btnClose.connect('clicked', () => dialog.close());

        btnStop.connect('clicked', () => {
            if (activeProc) {
                try {
                    activeProc.force_exit();
                } catch (e) {}
            }
            lblRunTitle.set_label(`<b>${_("Process stopped by user")}</b>`);
            runSpinner.set_spinning(false);
            btnStop.set_visible(false);
            btnClose.set_visible(true);
        });

        btnStart.connect('clicked', () => {
            stack.set_visible_child_name('running');

            const currentCfg = this._loadConfigFile();
            const targetIndex = comboTarget.selected;
            const targetDirs = [];
            if (targetIndex === 0) targetDirs.push(currentCfg.dir_light);
            else if (targetIndex === 1) targetDirs.push(currentCfg.dir_dark);
            else {
                targetDirs.push(currentCfg.dir_light);
                targetDirs.push(currentCfg.dir_dark);
            }

            const scaleVal = [2, 3, 4][comboScale.selected] || 2;
            const denoiseVal = [0, 1, 2, 3, -1][comboDenoise.selected] || 0;
            const resLimits = [
                { w: 2560, h: 1440 },
                { w: 1920, h: 1080 },
                { w: 3840, h: 2160 },
                { w: 99999, h: 99999 },
            ];
            const chosenRes = resLimits[comboMaxRes.selected] || resLimits[0];
            const useBackup = switchBackup.active;

            const upscaleScript = this._getScriptPath('smart_upscale.py');
            const textBuffer = logView.get_buffer();

            const appendLog = (text) => {
                const endIter = textBuffer.get_end_iter();
                textBuffer.insert(endIter, text, -1);
                const mark = textBuffer.create_mark(null, textBuffer.get_end_iter(), false);
                logView.scroll_to_mark(mark, 0.05, false, 0.0, 1.0);
            };

            appendLog(':: Iniciando Smart Upscale con Real-CUGAN...\n');
            appendLog(`:: Parámetros: Escala ${scaleVal}x | Denoise ${denoiseVal} | Límite ${chosenRes.w}x${chosenRes.h}\n\n`);

            let dirQueue = [...targetDirs];

            const runNextDir = () => {
                if (dirQueue.length === 0) {
                    appendLog('\n:: ¡Todos los directorios han sido procesados con éxito!\n');
                    lblRunTitle.set_label(`<b>✓ ${_("AI Upscaling completed")}</b>`);
                    runSpinner.set_spinning(false);
                    btnStop.set_visible(false);
                    btnClose.set_visible(true);
                    parentWindow.add_toast(new Adw.Toast({ title: _("AI Upscaling completed") }));
                    return;
                }

                const currentDir = dirQueue.shift();
                appendLog(`:: Procesando carpeta: ${currentDir}\n`);

                const cmd = [
                    'python3',
                    '-u',
                    upscaleScript,
                    currentDir,
                    '-s', String(scaleVal),
                    '-n', String(denoiseVal),
                    '--max-width', String(chosenRes.w),
                    '--max-height', String(chosenRes.h),
                ];
                if (!useBackup) {
                    cmd.push('--no-backup');
                }
                if (switchIgnoreTag.active) {
                    cmd.push('--ignore-tag');
                }

                try {
                    activeProc = Gio.Subprocess.new(
                        cmd,
                        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE
                    );

                    const stdoutStream = new Gio.DataInputStream({
                        base_stream: activeProc.get_stdout_pipe(),
                    });

                    const readNext = () => {
                        stdoutStream.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
                            try {
                                const [line] = stream.read_line_finish_utf8(res);
                                if (line !== null) {
                                    if (line.startsWith('::PROGRESS:: ')) {
                                        try {
                                            const pData = JSON.parse(line.substring(13));
                                            if (pData.event === 'scanning') {
                                                const frac = pData.total > 0 ? (pData.current / pData.total) : 0;
                                                runningProgressBar.set_fraction(frac);
                                                runningProgressBar.set_text(`${_("Analyzing candidates:")} ${pData.current} ${_("of")} ${pData.total} (${Math.round(frac * 100)}%)`);
                                                lblCurrentName.set_label(pData.name || '');
                                                lblCurrentDetails.set_label(_("Checking resolution and previous upscale signatures..."));
                                            } else if (pData.event === 'start') {
                                                runningProgressBar.set_fraction(0.0);
                                                runningProgressBar.set_text(`0 ${_("of")} ${pData.total} ${_("processed")} (0%)`);
                                                appendLog(`\n:: Se encontraron ${pData.total} imágenes listas para reescalar.\n\n`);
                                            } else if (pData.event === 'processing') {
                                                const frac = pData.total > 0 ? ((pData.current - 1) / pData.total) : 0;
                                                runningProgressBar.set_fraction(frac);
                                                runningProgressBar.set_text(`${_("Upscaling")} ${pData.current} ${_("of")} ${pData.total} (${Math.round(frac * 100)}%)`);
                                                lblCurrentName.set_label(pData.name || '');
                                                lblCurrentDetails.set_label(`${pData.orig_dims}  ➔  ${pData.target_dims}  ·  ${_("Scale factor")} ${pData.scale}x`);
                                                this._updatePicture(currentPic, pData.path, 120, 68);
                                                currentItemCard.set_visible(true);
                                            } else if (pData.event === 'image_done') {
                                                const frac = pData.total > 0 ? (pData.current / pData.total) : 0;
                                                runningProgressBar.set_fraction(frac);
                                                runningProgressBar.set_text(`${_("Completed")} ${pData.current} ${_("of")} ${pData.total} (${Math.round(frac * 100)}%)`);
                                                lblCurrentDetails.set_label(`✓ ${pData.name} ${_("saved successfully")}`);
                                            } else if (pData.event === 'done') {
                                                runningProgressBar.set_fraction(1.0);
                                                runningProgressBar.set_text(`${_("Upscaling completed")} (100%)`);
                                                lblCurrentDetails.set_label(`✓ ${_("Folder processing finished")}`);
                                            } else if (pData.event === 'empty') {
                                                runningProgressBar.set_fraction(1.0);
                                                runningProgressBar.set_text(_("No pending images to process"));
                                                currentItemCard.set_visible(false);
                                                appendLog(':: No se encontraron imágenes que requieran reescalado.\n');
                                            }
                                        } catch (e) {}
                                        readNext();
                                        return;
                                    }
                                    appendLog(line + '\n');
                                    readNext();
                                }
                            } catch (e) {}
                        });
                    };
                    readNext();

                    activeProc.wait_async(null, (proc, waitRes) => {
                        try {
                            proc.wait_finish(waitRes);
                        } catch (e) {}
                        activeProc = null;
                        runNextDir();
                    });
                } catch (err) {
                    appendLog(`❌ Error ejecutando smart_upscale: ${err.message}\n`);
                    runNextDir();
                }
            };

            runNextDir();
        });

        dialog.present();
    }
}

