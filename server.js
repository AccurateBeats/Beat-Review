const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });
const MAX_SUBMISSIONS = 20;
const DROPBOX_FOLDER_PATH = '';

function getDropboxClient() {
    return new Dropbox({
        accessToken: process.env.DROPBOX_ACCESS_TOKEN
    });
}

async function countMp3Files(dbx, folderPath) {
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

    return allEntries.filter(item =>
        item['.tag'] === 'file' &&
        item.name &&
        item.name.toLowerCase().endsWith('.mp3')
    ).length;
}

function sanitizeFileName(name) {
    return name
        .replace(/[\/\\:\*\?"<>\|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!process.env.DROPBOX_ACCESS_TOKEN) {
            return res.status(500).send('Dropbox token is missing on the server.');
        }

        if (!req.file) {
            return res.status(400).send('No MP3 file was received by the server.');
        }

        const dbx = getDropboxClient();

        const mp3Count = await countMp3Files(dbx, DROPBOX_FOLDER_PATH);

        if (mp3Count >= MAX_SUBMISSIONS) {
            return res.status(403).send(`Submissions are officially closed! We have reached our ${MAX_SUBMISSIONS} beat limit.`);
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

        console.log(`Uploaded successfully: ${cleanBaseName} (Total Submissions: ${mp3Count + 1}/${MAX_SUBMISSIONS})`);
        return res.status(200).send(`Success! Files saved as: ${cleanBaseName}`);
    } catch (error) {
        console.error('Dropbox Upload Error FULL:', error);
        console.error('Dropbox Upload Error STATUS:', error?.status);
        console.error('Dropbox Upload Error MESSAGE:', error?.message);
        console.error('Dropbox Upload Error BODY:', error?.error);

        return res.status(500).send('An error occurred during the Dropbox upload process.');
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
