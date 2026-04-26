const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const cors = require('cors');
require('dotenv').config();
 
const app = express();
 
// Permits communication from your GitHub Pages site
app.use(cors()); 
 
// Stores the file in memory temporarily before sending to Dropbox
const upload = multer({ storage: multer.memoryStorage() }); 
 
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
 
        const file = req.file;
        const { artist, title, genre, notes } = req.body;
 
        // NAMING LOGIC: 
        // We use the Song Title as the filename. 
        // If the Title field is empty, we use the original filename (minus the .mp3).
        const cleanBaseName = title ? title.trim() : file.originalname.replace(/\.[^/.]+$/, "");
 
        // 1. Upload the MP3 file
        // Path example: /Song Title.mp3
        await dbx.filesUpload({
            path: `/${cleanBaseName}.mp3`,
            contents: file.buffer,
            mode: 'overwrite' // Replaces the file if you upload a new version with the same name
        });
 
        // 2. Upload the Metadata Text file
        // Path example: /Song Title.txt
        const textContent = `Artist: ${artist}\nTitle: ${title}\nGenre: ${genre}\nNotes: ${notes}`;
        await dbx.filesUpload({
            path: `/${cleanBaseName}.txt`,
            contents: Buffer.from(textContent),
            mode: 'overwrite'
        });
 
        console.log(`Success! Uploaded: ${cleanBaseName}.mp3 and ${cleanBaseName}.txt`);
        res.status(200).send(`Files successfully saved as "${cleanBaseName}"`);
 
    } catch (error) {
        console.error("Dropbox Upload Error:", error);
        res.status(500).send('An error occurred during the Dropbox upload process.');
    }
});
 
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
