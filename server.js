const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const YTDLP_BIN = 'yt-dlp'; // full path if needed, e.g. 'C:\\Users\\vamsi\\yt-dlp.exe'

// --- ensure downloads folder exists ---
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9 ._-]/g, '').trim();
}

// ---------- GET VIDEO INFO ----------
app.post('/info', async (req, res) => {
  const url = req.body?.url;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  const proc = spawn(YTDLP_BIN, ['-j', '--no-playlist', url]);
  let out = '', err = '';
  proc.stdout.on('data', d => out += d.toString());
  proc.stderr.on('data', d => err += d.toString());

  proc.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: 'yt-dlp error', details: err || out });
    }
    try {
      const info = JSON.parse(out);

      // Send *all* format details (for full table)
      const trimmed = {
        id: info.id,
        title: info.title,
        uploader: info.uploader,
        duration: info.duration,
        view_count: info.view_count,
        thumbnails: info.thumbnails,
        formats: info.formats?.map(f => ({
          format_id: f.format_id,
          ext: f.ext,
          resolution: f.resolution || `${f.width || ''}x${f.height || ''}` || '',
          fps: f.fps || '',
          vcodec: f.vcodec,
          acodec: f.acodec,
          filesize: f.filesize ? `${(f.filesize / 1048576).toFixed(2)} MB` : 'Unknown',
          tbr: f.tbr ? `${f.tbr}k` : '',
          format_note: f.format_note || '',
          protocol: f.protocol || '',
          format: f.format
        })) || []
      };
      res.json(trimmed);

    } catch (e) {
      res.status(500).json({ error: 'Failed to parse yt-dlp output', raw: out.slice(0, 800) });
    }
  });
});

app.get('/progress', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Missing URL');

  res.set({
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive'
  });

  const args = [
    '-f', 'bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '-o', '-',
    url
  ];

  const dl = spawn(YTDLP_BIN, args);

  dl.stderr.on('data', d => {
    const line = d.toString();
    const match = line.match(/(\d+\.\d)% of .*? at (.*?) ETA (.*)/);
    if (match) {
      res.write(`data: ${JSON.stringify({
        percent: match[1],
        speed: match[2],
        eta: match[3]
      })}\n\n`);
    }
  });

  dl.on('close', (code) => {
    res.write(`data: ${JSON.stringify({ done: true, code })}\n\n`);
    res.end();
  });
});


// ---------- DOWNLOAD ROUTE ----------
app.get('/download', (req, res) => {
  const url = req.query.url;
  const format = req.query.format || 'best';
  if (!url) return res.status(400).send('Missing URL');

  const tempFile = path.join(downloadsDir, sanitizeFilename(Date.now() + '.mp4'));

  const args = [
    '-f', format, // frontend already decides whether to include "+bestaudio/best"
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '-o', tempFile,
    url
  ];

  const dl = spawn(YTDLP_BIN, args, { stdio: 'pipe' });

  dl.stderr.on('data', d => console.log('[yt-dlp]', d.toString()));

  dl.on('close', (code) => {
    if (code !== 0) {
      console.error('yt-dlp exited with code', code);
      return res.status(500).send('Download failed');
    }

    res.download(tempFile, path.basename(tempFile), (err) => {
      if (err) console.error('Send error', err);
      fs.unlink(tempFile, () => {}); // cleanup
    });
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
