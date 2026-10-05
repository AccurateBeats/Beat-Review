const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const DEFAULT_MAX_SUBMISSIONS = 20;
const ALLOWED_MAX_SUBMISSIONS = [10, 20, 30, 40, 50];
const STATUS_JSON_URL =
    process.env.STATUS_JSON_URL ||
    'https://accuratebeats.github.io/Beat-Review/status.json';
const STATUS_CACHE_MS = 60_000;
const DROPBOX_FOLDER_PATH = '';

let statusCache = {
    max: DEFAULT_MAX_SUBMISSIONS,
    isOpen: true,
    fetchedAt: 0
};

function normalizeMaxSubmissions(value) {
    const parsed = parseInt(value, 10);
    if (ALLOWED_MAX_SUBMISSIONS.includes(parsed)) {
        return parsed;
    }
    return DEFAULT_MAX_SUBMISSIONS;
}

async function fetchStatusConfig() {
    const now = Date.now();
    if (now - statusCache.fetchedAt < STATUS_CACHE_MS) {
        return statusCache;
    }

    const fallback = {
        max: DEFAULT_MAX_SUBMISSIONS,
        isOpen: true,
        fetchedAt: now
    };

    try {
        const res = await fetch(`${STATUS_JSON_URL}?t=${now}`, {
            headers: { Accept: 'application/json' }
        });
        if (!res.ok) {
            statusCache = fallback;
            return statusCache;
        }
        const data = await res.json();
        const max = normalizeMaxSubmissions(data.maxSubmissions);
        const isOpen = data.isOpen !== false;
        statusCache = { max, isOpen, fetchedAt: now };
        return statusCache;
    } catch (error) {
        console.error('STATUS JSON ERROR:', error.message || error);
        statusCache = fallback;
        return statusCache;
    }
}

async function fetchMaxSubmissions() {
    const config = await fetchStatusConfig();
    return config.max;
}

function getDropboxClient() {
    return new Dropbox({
        clientId: process.env.DROPBOX_APP_KEY,
        clientSecret: process.env.DROPBOX_APP_SECRET,
        refreshToken: process.env.DROPBOX_REFRESH_TOKEN
    });
}

function sanitizeFileName(name) {
    return name
        .replace(/[\/\\:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function sendJson(res, status, payload) {
    return res.status(status).json(payload);
}

async function listAllEntries(dbx, folderPath) {
    let allEntries = [];

    let response = await dbx.filesListFolder({
        path: folderPath
    });

    allEntries = allEntries.concat(response.result.entries);

    while (response.result.has_more) {
        response = await dbx.filesListFolderContinue({
            cursor: response.result.cursor
        });
        allEntries = allEntries.concat(response.result.entries);
    }

    return allEntries;
}

async function countMp3Files(dbx, folderPath) {
    const entries = await listAllEntries(dbx, folderPath);

    return entries.filter(item =>
        item['.tag'] === 'file' &&
        item.name &&
        item.name.toLowerCase().endsWith('.mp3')
    ).length;
}

app.get('/', (req, res) => {
    res.send('Server is running.');
});

/** Public slot count for the uploader UI */
app.get('/slots', async (req, res) => {
    try {
        if (!process.env.DROPBOX_APP_KEY || !process.env.DROPBOX_APP_SECRET || !process.env.DROPBOX_REFRESH_TOKEN) {
            return sendJson(res, 500, {
                ok: false,
                message: 'Dropbox credentials are missing on the server.'
            });
        }

        const dbx = getDropboxClient();
        const count = await countMp3Files(dbx, DROPBOX_FOLDER_PATH);
        const statusConfig = await fetchStatusConfig();
        const max = statusConfig.max;

        return sendJson(res, 200, {
            ok: true,
            count,
            max,
            remaining: Math.max(0, max - count),
            full: count >= max,
            isOpen: statusConfig.isOpen
        });
    } catch (error) {
        console.error('SLOTS ERROR:', error);
        return sendJson(res, 500, {
            ok: false,
            message: error?.message || 'Could not read submission count.'
        });
    }
});

app.get('/debug-dropbox', async (req, res) => {
    try {
        if (!process.env.DROPBOX_APP_KEY || !process.env.DROPBOX_APP_SECRET || !process.env.DROPBOX_REFRESH_TOKEN) {
            return res.status(500).send('DEBUG: Dropbox credentials are missing on the server.');
        }

        const dbx = getDropboxClient();
        const entries = await listAllEntries(dbx, DROPBOX_FOLDER_PATH);
        const mp3Count = entries.filter(item =>
            item['.tag'] === 'file' &&
            item.name &&
            item.name.toLowerCase().endsWith('.mp3')
        ).length;

        return res.status(200).json({
            ok: true,
            folderPath: DROPBOX_FOLDER_PATH,
            totalEntries: entries.length,
            mp3Count: mp3Count,
            sampleNames: entries.slice(0, 10).map(item => item.name)
        });
    } catch (error) {
        console.error('DEBUG DROPBOX ERROR FULL:', error);
        return res.status(500).json({
            ok: false,
            status: error?.status || null,
            message: error?.message || 'Unknown error',
            error: error?.error || null
        });
    }
});

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!process.env.DROPBOX_APP_KEY || !process.env.DROPBOX_APP_SECRET || !process.env.DROPBOX_REFRESH_TOKEN) {
            return sendJson(res, 500, {
                ok: false,
                code: 'MISSING_CREDENTIALS',
                message: 'Dropbox credentials are missing on the server.'
            });
        }

        if (!req.file) {
            return sendJson(res, 400, {
                ok: false,
                code: 'NO_FILE',
                message: 'No MP3 file was received by the server.'
            });
        }

        const dbx = getDropboxClient();
        const statusConfig = await fetchStatusConfig();
        const maxSubmissions = statusConfig.max;

        if (!statusConfig.isOpen) {
            return sendJson(res, 403, {
                ok: false,
                code: 'SUBMISSIONS_CLOSED',
                message: 'Submissions are currently closed. Please check back later.',
                count: null,
                max: maxSubmissions,
                remaining: null
            });
        }

        const mp3Count = await countMp3Files(dbx, DROPBOX_FOLDER_PATH);

        if (mp3Count >= maxSubmissions) {
            return sendJson(res, 403, {
                ok: false,
                code: 'LIMIT_REACHED',
                message: `Submissions are closed! Either it's not open yet OR we've reached the ${maxSubmissions} beat limit.`,
                count: mp3Count,
                max: maxSubmissions,
                remaining: 0
            });
        }

        const file = req.file;
        const { artist, title, genre, notes } = req.body;

        let cleanBaseName;
        if (artist && title) {
            cleanBaseName = `${artist.trim()} - ${title.trim()}`;
        } else if (artist) {
            cleanBaseName = artist.trim();
        } else if (title) {
            cleanBaseName = title.trim();
        } else {
            cleanBaseName = file.originalname.replace(/\.[^/.]+$/, '');
        }

        cleanBaseName = sanitizeFileName(cleanBaseName);

        const mp3Path = `${DROPBOX_FOLDER_PATH}/${cleanBaseName}.mp3`.replace(/\/+/g, '/');
        const txtPath = `${DROPBOX_FOLDER_PATH}/${cleanBaseName}.txt`.replace(/\/+/g, '/');

        await dbx.filesUpload({
            path: mp3Path,
            contents: file.buffer,
            mode: { '.tag': 'overwrite' }
        });

        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'UTC' });
        const textContent = `
=========================================
         TRACK SUBMISSION INFO
=========================================

ARTIST:      ${artist || 'Not specified'}
TITLE:       ${title || 'Not specified'}
GENRE:       ${genre || 'Not specified'}

-----------------------------------------
NOTES:
${notes || 'No extra notes provided.'}

-----------------------------------------
UPLOADED AT: ${timestamp} (UTC)
=========================================
        `.trim();

        await dbx.filesUpload({
            path: txtPath,
            contents: Buffer.from(textContent, 'utf8'),
            mode: { '.tag': 'overwrite' }
        });

        const newCount = mp3Count + 1;
        console.log(`Uploaded successfully: ${cleanBaseName} (Total Submissions: ${newCount}/${maxSubmissions})`);

        return sendJson(res, 200, {
            ok: true,
            message: `Success! Files saved as: ${cleanBaseName}`,
            fileName: cleanBaseName,
            count: newCount,
            max: maxSubmissions,
            remaining: Math.max(0, maxSubmissions - newCount)
        });
    } catch (error) {
        console.error('UPLOAD ERROR FULL:', error);

        let errorMessage = 'Unknown error';
        if (error?.error?.error_summary) {
            errorMessage = error.error.error_summary;
        } else if (error?.message) {
            errorMessage = error.message;
        }

        return sendJson(res, 500, {
            ok: false,
            code: 'UPLOAD_ERROR',
            message: `Upload failed: ${errorMessage}`,
            status: error?.status || null
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
