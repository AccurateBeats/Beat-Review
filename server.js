const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const cors = require('cors');
require('dotenv').config();
 
const app = express();
app.use(cors()); 
 
const upload = multer({ storage: multer.memoryStorage() }); 
 
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
 
        const file = req.file;
        const { artist, title, genre, notes } = req.body;
 
        // NEW NAMING LOGIC: "Artist - Title"
        // 1. If both exist: "Artist - Title"
        // 2. If only artist: "Artist"
        // 3. If only title: "Title"
        // 4. Fallback: Original Filename
        let cleanBaseName;
        if (artist && title) {
            cleanBaseName = `${artist.trim()} - ${title.trim()}`;
        } else if (artist) {
            cleanBaseName = artist.trim();
        } else if (title) {
            cleanBaseName = title.trim();
        } else {
            cleanBaseName = file.originalname.replace(/\.[^/.]+$/, "");
        }
 
        // 1. Upload the MP3 file
        await dbx.filesUpload({
            path: `/${cleanBaseName}.mp3`,
            contents: file.buffer,
            mode: 'overwrite'
        });
 
        // 2. Upload the Metadata Text file
        const textContent = `Artist: ${artist}\nTitle: ${title}\nGenre: ${genre}\nNotes: ${notes}`;
        await dbx.filesUpload({
            path: `/${cleanBaseName}.txt`,
            contents: Buffer.from(textContent),
            mode: 'overwrite'
        });
 
        console.log(`Uploaded successfully: ${cleanBaseName}`);
        res.status(200).send(`Success! Files saved as: ${cleanBaseName}`);
 
    } catch (error) {
        console.error("Dropbox Upload Error:", error);
        res.status(500).send('Upload failed.');
    }
});
 
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
