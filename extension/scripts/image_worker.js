#!/usr/bin/env -S gjs -m
/**
 * Worker nativo en GJS (GdkPixbuf + Gio/GLib) para Auto Wallpaper.
 * Ejecuta fuera del hilo principal (vía Gio.Subprocess) sin dependencias externas:
 * 1. Detección de duplicados perceptuales mediante firmas dHash de 64 bits (`duplicates --json`).
 * 2. Clasificación por luminosidad perceptual mediante modelo CIELAB L* + Percentil 65 (`organize --json`).
 */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf?version=2.0';

const VALID_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.webp', '.avif', '.bmp', '.tiff', '.tif',
    '.jfif', '.pjpeg', '.pjp', '.gif',
]);

const EXCLUDE_DIR_NAME = 'exclude';
const PINNED_DIR_NAME = 'pinned';

// Tabla de consulta precalculada para linealización sRGB -> CIE XYZ
const GAMMA_LUT = new Float64Array(256);
for (let i = 0; i < 256; i++) {
    const c = i / 255.0;
    GAMMA_LUT[i] = c <= 0.04045 ? (c / 12.92) : Math.pow((c + 0.055) / 1.055, 2.4);
}

function getPicturesDir() {
    const specialDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
    if (specialDir) return specialDir;
    return GLib.build_filenamev([GLib.get_home_dir(), 'Pictures']);
}

function getConfigPath() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'auto-wallpaper.json']);
}

function loadConfig() {
    const picDir = getPicturesDir();
    const defaults = {
        dir_light: GLib.build_filenamev([picDir, 'wallpapers', 'light']),
        dir_dark: GLib.build_filenamev([picDir, 'wallpapers', 'dark']),
        unshown_light: [],
        unshown_dark: [],
        force_reload: false,
    };

    const cfgPath = getConfigPath();
    const file = Gio.File.new_for_path(cfgPath);
    try {
        if (file.query_exists(null)) {
            const [ok, contents] = file.load_contents(null);
            if (ok && contents) {
                const decoder = new TextDecoder('utf-8');
                const parsed = JSON.parse(decoder.decode(contents));
                return Object.assign({}, defaults, parsed);
            }
        }
    } catch (e) {}
    return defaults;
}

function saveConfig(cfg) {
    const cfgPath = getConfigPath();
    const file = Gio.File.new_for_path(cfgPath);
    try {
        const parent = file.get_parent();
        if (parent && !parent.query_exists(null)) {
            parent.make_directory_with_parents(null);
        }
        const encoder = new TextEncoder();
        const bytes = encoder.encode(JSON.stringify(cfg, null, 4));
        file.replace_contents(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    } catch (e) {}
}

function expandPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return null;
    if (rawPath.startsWith('~/')) {
        return GLib.build_filenamev([GLib.get_home_dir(), rawPath.substring(2)]);
    }
    return rawPath;
}

function ensureSubdirs(folderPath) {
    const resolved = expandPath(folderPath);
    if (!resolved) return { folder: null, excludeDir: null, pinnedDir: null };

    const folderFile = Gio.File.new_for_path(resolved);
    try {
        if (!folderFile.query_exists(null)) {
            folderFile.make_directory_with_parents(null);
        }
    } catch (e) {}

    const excludePath = GLib.build_filenamev([resolved, EXCLUDE_DIR_NAME]);
    const pinnedPath = GLib.build_filenamev([resolved, PINNED_DIR_NAME]);
    for (const p of [excludePath, pinnedPath]) {
        try {
            const gf = Gio.File.new_for_path(p);
            if (!gf.query_exists(null)) gf.make_directory_with_parents(null);
        } catch (e) {}
    }

    return {
        folder: resolved,
        excludeDir: excludePath,
        pinnedDir: pinnedPath,
    };
}

function isImageFile(filePath, fileInfo = null) {
    if (!filePath) return false;
    const baseName = GLib.path_get_basename(filePath);
    if (!baseName || baseName.startsWith('.')) return false;

    const dotIdx = baseName.lastIndexOf('.');
    if (dotIdx !== -1) {
        const ext = baseName.substring(dotIdx).toLowerCase();
        if (VALID_EXTENSIONS.has(ext)) return true;
    }

    if (fileInfo) {
        try {
            const ct = fileInfo.get_content_type();
            if (ct && ct.startsWith('image/') && !ct.includes('svg')) {
                return true;
            }
        } catch (e) {}
    }

    try {
        const gfile = Gio.File.new_for_path(filePath);
        const stream = gfile.read(null);
        const bytes = stream.read_bytes(32, null);
        stream.close(null);
        if (bytes && bytes.get_size() >= 4) {
            const d = bytes.get_data();
            if (d[0] === 0xFF && d[1] === 0xD8 && d[2] === 0xFF) return true;
            if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4E && d[3] === 0x47) return true;
            if (d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46 && d[3] === 0x38) return true;
            if (d[0] === 0x42 && d[1] === 0x4D) return true;
            if (d[0] === 0x52 && d[1] === 0x49 && d[2] === 0x46 && d[3] === 0x46) {
                if (d[8] === 0x57 && d[9] === 0x45 && d[10] === 0x42 && d[11] === 0x50) return true;
            }
            if (bytes.get_size() >= 12) {
                const text12 = String.fromCharCode(...d.slice(4, 12));
                if (text12.includes('ftyp')) return true;
            }
        }
    } catch (e) {}

    return false;
}

function listImagesInDir(dirPath) {
    if (!dirPath || !GLib.file_test(dirPath, GLib.FileTest.IS_DIR)) return [];
    const results = [];
    try {
        const folder = Gio.File.new_for_path(dirPath);
        const enumerator = folder.enumerate_children(
            'standard::name,standard::type,standard::content-type,standard::size',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null
        );
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            if (info.get_file_type() === Gio.FileType.REGULAR) {
                const name = info.get_name();
                const fullPath = GLib.build_filenamev([dirPath, name]);
                if (isImageFile(fullPath, info)) {
                    results.push({
                        path: fullPath,
                        name,
                        sizeBytes: info.get_size(),
                    });
                }
            }
        }
        enumerator.close(null);
    } catch (e) {}
    return results;
}

/**
 * Evalúa la claridad perceptual de una imagen usando CIELAB L* + Percentil 65 + Chroma.
 */
function analyzeWallpaperLightness(imagePath, threshold = 42.0) {
    const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(imagePath, 160, 160, true);
    if (!pixbuf) {
        return { classification: 'dark', score: 0.0, avgSat: 0.0 };
    }

    const width = pixbuf.get_width();
    const height = pixbuf.get_height();
    const rowstride = pixbuf.get_rowstride();
    const nChannels = pixbuf.get_n_channels();
    const hasAlpha = pixbuf.get_has_alpha();
    const pixels = pixbuf.get_pixels();

    const totalPixels = width * height;
    if (totalPixels <= 0) {
        return { classification: 'dark', score: 0.0, avgSat: 0.0 };
    }

    const lStarValues = new Float64Array(totalPixels);
    let totalSat = 0.0;
    let idx = 0;

    for (let yPos = 0; yPos < height; yPos++) {
        const rowStart = yPos * rowstride;
        for (let xPos = 0; xPos < width; xPos++) {
            const p = rowStart + xPos * nChannels;
            let r = pixels[p];
            let g = pixels[p + 1];
            let b = pixels[p + 2];

            if (hasAlpha && nChannels >= 4) {
                const a = pixels[p + 3] / 255.0;
                r = Math.round(r * a);
                g = Math.round(g * a);
                b = Math.round(b * a);
            }

            const lumY = 0.2126 * GAMMA_LUT[r] + 0.7152 * GAMMA_LUT[g] + 0.0722 * GAMMA_LUT[b];
            const lStar = lumY > 0.008856 ? (116.0 * Math.cbrt(lumY) - 16.0) : (903.3 * lumY);
            lStarValues[idx++] = lStar;

            const maxC = r > g ? (r > b ? r : b) : (g > b ? g : b);
            const minC = r < g ? (r < b ? r : b) : (g < b ? g : b);
            const sat = maxC > 0 ? ((maxC - minC) / maxC) : 0.0;
            totalSat += sat;
        }
    }

    lStarValues.sort();
    const idxP65 = Math.min(Math.floor(totalPixels * 0.65), totalPixels - 1);
    let score = lStarValues[idxP65];

    const avgSat = totalSat / totalPixels;
    if (avgSat > 0.35) {
        const chromaBoost = Math.min(6.0, (avgSat - 0.35) * 20.0);
        score += chromaBoost;
    }

    const classification = score >= threshold ? 'light' : 'dark';
    return { classification, score, avgSat };
}

/**
 * Calcula el Difference Hash (dHash) de 64 bits (BigInt) usando GdkPixbuf.
 */
function computeDhash(imagePath, hashSize = 8) {
    try {
        const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(imagePath, hashSize + 1, hashSize, false);
        if (!pixbuf) return null;

        const rowstride = pixbuf.get_rowstride();
        const nChannels = pixbuf.get_n_channels();
        const pixels = pixbuf.get_pixels();

        let hash = 0n;
        for (let row = 0; row < hashSize; row++) {
            const rowOffset = row * rowstride;
            for (let col = 0; col < hashSize; col++) {
                const pLeft = rowOffset + col * nChannels;
                const pRight = rowOffset + (col + 1) * nChannels;

                const lLeft = 0.299 * pixels[pLeft] + 0.587 * pixels[pLeft + 1] + 0.114 * pixels[pLeft + 2];
                const lRight = 0.299 * pixels[pRight] + 0.587 * pixels[pRight + 1] + 0.114 * pixels[pRight + 2];

                hash = (hash << 1n) | (lLeft > lRight ? 1n : 0n);
            }
        }
        return hash;
    } catch (e) {
        return null;
    }
}

function hammingDistance64(hashA, hashB) {
    let x = hashA ^ hashB;
    let count = 0;
    while (x > 0n) {
        x &= (x - 1n);
        count++;
    }
    return count;
}

function runDuplicatesScan(cfg) {
    const filesToCheck = [];
    const themes = [
        { key: 'dir_light', label: '☀️ Claro', code: 'light' },
        { key: 'dir_dark', label: '🌙 Oscuro', code: 'dark' },
    ];

    for (const t of themes) {
        const { folder, pinnedDir } = ensureSubdirs(cfg[t.key]);
        if (!folder || !GLib.file_test(folder, GLib.FileTest.IS_DIR)) continue;

        for (const item of listImagesInDir(folder)) {
            filesToCheck.push({
                path: item.path,
                name: item.name,
                sizeBytes: item.sizeBytes,
                origin: t.label,
                code: t.code,
                pinned: false,
            });
        }

        if (pinnedDir && GLib.file_test(pinnedDir, GLib.FileTest.IS_DIR)) {
            for (const item of listImagesInDir(pinnedDir)) {
                filesToCheck.push({
                    path: item.path,
                    name: item.name,
                    sizeBytes: item.sizeBytes,
                    origin: `${t.label} [Pinned]`,
                    code: t.code,
                    pinned: true,
                });
            }
        }
    }

    const total = filesToCheck.length;
    if (total < 2) {
        print(`::PROGRESS:: ${JSON.stringify({ phase: 'done', current: 0, total: 0 })}`);
        print(`::RESULT:: ${JSON.stringify([])}`);
        return;
    }

    print(`::PROGRESS:: ${JSON.stringify({ phase: 'hash_start', total })}`);
    const hashes = [];

    for (let i = 0; i < total; i++) {
        const entry = filesToCheck[i];
        print(`::PROGRESS:: ${JSON.stringify({ phase: 'hash', current: i + 1, total, name: entry.name })}`);
        const h = computeDhash(entry.path);
        if (h !== null) {
            hashes.push({ ...entry, hash: h });
        }
    }

    const n = hashes.length;
    print(`::PROGRESS:: ${JSON.stringify({ phase: 'compare_start', total: n })}`);
    const matches = [];

    for (let i = 0; i < n; i++) {
        if (i % 2 === 0 || i === n - 1) {
            print(`::PROGRESS:: ${JSON.stringify({ phase: 'compare', current: i + 1, total: n })}`);
        }
        const itemA = hashes[i];
        for (let j = i + 1; j < n; j++) {
            const itemB = hashes[j];
            const dist = hammingDistance64(itemA.hash, itemB.hash);
            if (dist <= 4) {
                matches.push({ dist, itemA, itemB });
            }
        }
    }

    matches.sort((a, b) => a.dist - b.dist);

    const jsonResults = matches.map(({ dist, itemA, itemB }) => {
        const similarity = dist === 0 ? 100 : Math.floor(((64 - dist) / 64) * 100);
        const sizeMbA = Math.round((itemA.sizeBytes / (1024 * 1024)) * 100) / 100;
        const sizeMbB = Math.round((itemB.sizeBytes / (1024 * 1024)) * 100) / 100;

        return {
            distance: dist,
            similarity,
            is_exact: dist === 0,
            path_a: itemA.path,
            name_a: itemA.name,
            theme_a: itemA.code,
            origin_a: itemA.origin,
            pinned_a: itemA.pinned,
            size_mb_a: sizeMbA,
            path_b: itemB.path,
            name_b: itemB.name,
            theme_b: itemB.code,
            origin_b: itemB.origin,
            pinned_b: itemB.pinned,
            size_mb_b: sizeMbB,
        };
    });

    print(`::RESULT:: ${JSON.stringify(jsonResults)}`);
}

function splitStemAndExt(fileName) {
    const dotIdx = fileName.lastIndexOf('.');
    if (dotIdx <= 0) return { stem: fileName, ext: '' };
    return {
        stem: fileName.substring(0, dotIdx),
        ext: fileName.substring(dotIdx),
    };
}

function runSortProcess(cfg, threshold = 42.0, targetScope = 'both', customDir = null) {
    const { folder: dirLight } = ensureSubdirs(cfg.dir_light);
    const { folder: dirDark } = ensureSubdirs(cfg.dir_dark);

    let movedToLight = 0;
    let movedToDark = 0;
    let errors = 0;
    const details = [];
    const filesToScan = [];

    if (targetScope === 'custom' && customDir) {
        const resolvedCustom = expandPath(customDir);
        if (resolvedCustom && GLib.file_test(resolvedCustom, GLib.FileTest.IS_DIR)) {
            for (const item of listImagesInDir(resolvedCustom)) {
                filesToScan.push({
                    path: item.path,
                    name: item.name,
                    folderType: 'custom',
                    oppositeDir: null,
                });
            }
        }
    } else {
        const foldersToScan = [];
        if ((targetScope === 'both' || targetScope === 'light') && dirLight) {
            foldersToScan.push({ currentDir: dirLight, folderType: 'light', oppositeDir: dirDark });
        }
        if ((targetScope === 'both' || targetScope === 'dark') && dirDark) {
            foldersToScan.push({ currentDir: dirDark, folderType: 'dark', oppositeDir: dirLight });
        }

        for (const f of foldersToScan) {
            if (!GLib.file_test(f.currentDir, GLib.FileTest.IS_DIR)) continue;
            for (const item of listImagesInDir(f.currentDir)) {
                filesToScan.push({
                    path: item.path,
                    name: item.name,
                    folderType: f.folderType,
                    oppositeDir: f.oppositeDir,
                });
            }
        }
    }

    const total = filesToScan.length;
    print(`::PROGRESS:: ${JSON.stringify({ phase: 'start', total })}`);

    for (let i = 0; i < total; i++) {
        const entry = filesToScan[i];
        const idx = i + 1;
        try {
            const { classification: shouldBe, score, avgSat } = analyzeWallpaperLightness(entry.path, threshold);
            const destDir = shouldBe === 'light' ? dirLight : dirDark;
            const roundedScore = Math.round(score * 10) / 10;
            const roundedSat = Math.round(avgSat * 100) / 100;

            if (entry.folderType === 'custom' || entry.folderType !== shouldBe) {
                const targetDir = entry.folderType === 'custom' ? destDir : entry.oppositeDir;
                let destPath = GLib.build_filenamev([targetDir, entry.name]);
                if (GLib.file_test(destPath, GLib.FileTest.EXISTS)) {
                    const { stem, ext } = splitStemAndExt(entry.name);
                    destPath = GLib.build_filenamev([targetDir, `${stem}_${Math.floor(Date.now() / 1000)}${ext}`]);
                }

                const srcFile = Gio.File.new_for_path(entry.path);
                const destFile = Gio.File.new_for_path(destPath);
                srcFile.move(destFile, Gio.FileCopyFlags.OVERWRITE, null, null);

                if (shouldBe === 'light') movedToLight++;
                else movedToDark++;

                const detailItem = {
                    name: entry.name,
                    from: entry.folderType,
                    to: shouldBe,
                    score: roundedScore,
                    sat: roundedSat,
                    path: destPath,
                };
                details.push(detailItem);
                print(`::PROGRESS:: ${JSON.stringify({ phase: 'moved', current: idx, total, ...detailItem })}`);
            } else {
                print(`::PROGRESS:: ${JSON.stringify({
                    phase: 'evaluating',
                    current: idx,
                    total,
                    name: entry.name,
                    theme: entry.folderType,
                    score: roundedScore,
                })}`);
            }
        } catch (e) {
            errors++;
            print(`::PROGRESS:: ${JSON.stringify({
                phase: 'error',
                current: idx,
                total,
                name: entry.name,
                error: e.message || String(e),
            })}`);
        }
    }

    cfg.unshown_light = [];
    cfg.unshown_dark = [];
    if (movedToLight > 0 || movedToDark > 0) {
        cfg.force_reload = true;
    }
    saveConfig(cfg);

    print(`::RESULT:: ${JSON.stringify({
        moved_to_light: movedToLight,
        moved_to_dark: movedToDark,
        errors,
        details,
    })}`);
}

const args = ARGV;
if (args.length > 0) {
    const cfg = loadConfig();
    const cmd = args[0];

    if (['duplicates', 'dupes', 'find-duplicates'].includes(cmd)) {
        runDuplicatesScan(cfg);
    } else if (['organize', 'auto-sort', 'deep-organize'].includes(cmd)) {
        let threshold = 42.0;
        let targetScope = 'both';
        let customDir = null;

        for (let i = 1; i < args.length; i++) {
            if (args[i] === '--threshold' && i + 1 < args.length) {
                const val = parseFloat(args[i + 1]);
                if (!Number.isNaN(val)) threshold = val;
            } else if (args[i] === '--scope' && i + 1 < args.length) {
                targetScope = args[i + 1].toLowerCase();
            } else if (args[i] === '--custom-dir' && i + 1 < args.length) {
                customDir = args[i + 1];
            }
        }
        runSortProcess(cfg, threshold, targetScope, customDir);
    }
}

