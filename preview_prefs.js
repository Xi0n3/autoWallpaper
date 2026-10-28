#!/usr/bin/env -S gjs -m
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import GLib from 'gi://GLib';
import GIRepository from 'gi://GIRepository';

// Configurar rutas de typelib de GNOME Shell
try {
    const repo = GIRepository.Repository.dup_default ? GIRepository.Repository.dup_default() : GIRepository.Repository.get_default();
    repo.prepend_search_path('/usr/lib64/gnome-shell/girepository-1.0');
    repo.prepend_search_path('/usr/lib64/gnome-extensions-app/girepository-1.0');
    repo.prepend_search_path('/usr/lib/gnome-shell/girepository-1.0');
} catch (e) {
    console.warn('No se pudo añadir ruta de typelib:', e.message);
}

// Cargar recursos internos de GNOME Shell
try {
    const res = Gio.Resource.load('/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource');
    res._register();
} catch (e) {
    console.warn('GResource ya cargado o no encontrado:', e.message);
}

Adw.init();

const baseDir = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const extDir = GLib.build_filenamev([baseDir, 'extension']);

const module = await import(`file://${extDir}/prefs.js`);
const PrefsClass = module.default;

const app = new Adw.Application({
    application_id: 'org.lumory.autowallpaper.prefs',
    flags: Gio.ApplicationFlags.NON_UNIQUE
});

app.connect('activate', () => {
    const window = new Adw.PreferencesWindow({ application: app });
    const prefsInstance = new PrefsClass({
        uuid: 'autowallpaper@lumory',
        path: extDir,
        dir: Gio.File.new_for_path(extDir),
        name: 'Auto Wallpaper'
    });
    prefsInstance.fillPreferencesWindow(window);
    window.present();
});

app.run([]);
