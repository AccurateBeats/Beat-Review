const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Allows your GitHub Pages site to securely send files to this server
app.use(cors()); 

// Temporarily stores the uploaded file in the server's memory
const upload = multer({ storage: multer.memoryStorage() }); 

// Catches the file and sends it to Dropbox
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        // Unlocks Dropbox using your secret key
        const dbx = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
        
        const file = req.file;
        const { artist, title, genre, notes } = req.body;

        // 1. Uploads the tagged MP3 file to Dropbox
        await dbx.filesUpload({
            path: `/${file.originalname}`,
            contents: file.buffer
        });

        // 2. Creates a text document with the answers and uploads it
        const answersContent = `Artist: ${artist}\nTitle: ${title}\nGenre: ${genre}\nNotes: ${notes}`;
        await dbx.filesUpload({
            path: `/${title}_Answers.txt`,
            contents: Buffer.from(answersContent)
        });

        res.status(200).send('Files successfully uploaded to Dropbox!');

    } catch (error) {
        console.error("Dropbox Upload Error:", error);
        res.status(500).send('An error occurred while uploading to the server.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
