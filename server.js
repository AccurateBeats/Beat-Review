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
        
        // ==========================================
        // NEW FEATURE: THE 20 SUBMISSION LIMIT CHECK
        // ==========================================
        // 1. Ask Dropbox what is currently in the folder
        const folderData = await dbx.filesListFolder({ path: '' });
        
        // 2. Count only the items that end with ".mp3"
        const mp3Count = folderData.result.entries.filter(item => item.name.endsWith('.mp3')).length;

        // 3. If there are 20 or more mp3s, stop everything and send a 403 (Forbidden) error
        if (mp3Count >= 20) {
            return res.status(403).send("Submissions are officially closed! We have reached our 20 beat limit.");
        }
        // ==========================================

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
            cleanBaseName = file.originalname.replace(/\.[^/.]+$/, "");
        }

        // Upload MP3
        await dbx.filesUpload({
            path: `/${cleanBaseName}.mp3`,
            contents: file.buffer,
            mode: 'overwrite'
        });

        // Prettified Text File
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

        // Upload Text
        await dbx.filesUpload({
            path: `/${cleanBaseName}.txt`,
            contents: Buffer.from(textContent),
            mode: 'overwrite'
        });

        console.log(`Uploaded successfully: ${cleanBaseName} (Total Submissions: ${mp3Count + 1}/20)`);
        res.status(200).send(`Success! Files saved as: ${cleanBaseName}`);

    } catch (error) {
        console.error("Dropbox Upload Error:", error);
        res.status(500).send('An error occurred during the Dropbox upload process.');
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});





Byt allt i index.html till detta: 

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Beats Uploader</title>
    <script src="https://unpkg.com/browser-id3-writer@4.4.0/dist/browser-id3-writer.js"></script>
</head>
<body style="background-color: #f0f0f0; padding: 20px;">
    <div id="app" style="font-family: sans-serif; max-width: 450px; margin: 0 auto; padding: 25px; background: #fff; border-radius: 10px;">
        <h3>Upload Your Track (Limit: 20)</h3>
        
        <label>Artist Name:</label>
        <input type="text" id="artistInput" style="width:100%; margin-bottom:15px; padding:10px;">

        <label>Song Title:</label>
        <input type="text" id="titleInput" style="width:100%; margin-bottom:15px; padding:10px;">

        <label>Genre:</label>
        <input type="text" id="genreInput" style="width:100%; margin-bottom:15px; padding:10px;">

        <label>Extra Notes:</label>
        <textarea id="notesInput" rows="3" style="width:100%; margin-bottom:20px; padding:10px;"></textarea>

        <label>Select MP3 File (Max 10MB):</label>
        <input type="file" id="fileInput" accept="audio/mpeg" style="width:100%; margin-bottom:25px;">

        <button id="tagButton" style="width:100%; padding:12px; background:#222; color:#fff; cursor:pointer;">Send to Dropbox</button>
        <div id="statusMessage" style="display:none; margin-top:15px; font-weight: bold;"></div>
    </div>

    <script>
        document.getElementById('tagButton').addEventListener('click', () => {
            const file = document.getElementById('fileInput').files[0];
            const artist = document.getElementById('artistInput').value;
            const title = document.getElementById('titleInput').value;
            const genre = document.getElementById('genreInput').value;
            const notes = document.getElementById('notesInput').value;

            if (!file) return alert('Please select an MP3 file first!');
            if (file.size > 10485760) return alert('File is too large! Max 10MB.');

            const btn = document.getElementById('tagButton');
            btn.innerText = "Processing & Uploading...";
            btn.disabled = true;

            const reader = new FileReader();
            reader.onload = function() {
                try {
                    const writer = new ID3Writer(reader.result);
                    if (artist) writer.setFrame('TPE1', [artist]);
                    if (title) writer.setFrame('TIT2', title);
                    writer.addTag();

                    const formData = new FormData();
                    formData.append('file', writer.getBlob(), 'tagged_' + file.name);
                    formData.append('artist', artist);
                    formData.append('title', title);
                    formData.append('genre', genre);
                    formData.append('notes', notes);

                    const serverUrl = 'https://beats-2kd7.onrender.com/upload';

                    fetch(serverUrl, { method: 'POST', body: formData })
                    .then(async res => {
                        const statusBox = document.getElementById('statusMessage');
                        const responseText = await res.text();

                        if(res.ok) {
                            // Success!
                            statusBox.style.color = 'green';
                            statusBox.innerText = responseText;
                            statusBox.style.display = 'block';
                            
                            // Clear out the form
                            document.getElementById('fileInput').value = '';
                            document.getElementById('artistInput').value = '';
                            document.getElementById('titleInput').value = '';
                            document.getElementById('genreInput').value = '';
                            document.getElementById('notesInput').value = '';
                        } 
                        else if (res.status === 403) {
                            // Hit the 20 file limit! Show a friendly alert instead of a crash report.
                            alert(responseText);
                            statusBox.style.color = 'red';
                            statusBox.innerText = responseText;
                            statusBox.style.display = 'block';
                            btn.style.display = 'none'; // Hide the upload button entirely!
                        } 
                        else {
                            throw new Error(responseText);
                        }
                    }).catch(error => {
                        console.error(error);
                        alert("CRASH REPORT (Network): " + error.message);
                    }).finally(() => {
                        if(btn.style.display !== 'none') {
                            btn.innerText = "Send to Dropbox";
                            btn.disabled = false;
                        }
                    });
                } catch(e) { 
                    console.error(e);
                    alert("CRASH REPORT (Tagging): " + e.name + " - " + e.message); 
                    btn.innerText = "Send to Dropbox";
                    btn.disabled = false; 
                }
            };
            reader.readAsArrayBuffer(file);
        });
    </script>
</body>
</html>
