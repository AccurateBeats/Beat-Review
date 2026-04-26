const express = require('express');
const multer = require('multer');
const { Dropbox } = require('dropbox');
const cors = require('cors');
require('dotenv').config();
const app = express();
app.use(cors()); // Tillåter din GitHub-sida att skicka filer
const upload = multer({ storage: multer.memoryStorage() });
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const dbx = new Dropbox({ accessToken:
process.env.DROPBOX_ACCESS_TOKEN });
        const file = req.file;
        const { artist, title, genre, notes } = req.body;
        await dbx.filesUpload({
            path: `/${file.originalname}`,
            contents: file.buffer
});
        const answersContent = `Artist: ${artist}\nTitle: ${title}\nGenre:
${genre}\nNotes: ${notes}`;
        await dbx.filesUpload({
            path: `/${title}_Answers.txt`,
            contents: Buffer.from(answersContent)
});
        res.status(200).send('Filerna har laddats upp till Dropbox!');
    } catch (error) {
        console.error("Dropbox Upload Error:", error);
        res.status(500).send('Ett fel uppstod vid uppladdningen.');
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
