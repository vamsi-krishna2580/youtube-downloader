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

// 👉 Change if yt-dlp is not in PATH
const YTDLP_BIN = 'yt-dlp';

// ---------- DIRECTORIES ----------
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

// ---------- HELPERS ----------
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9 ._%()-]/g, '').trim();
}

function getClientId(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown'
  ).replace(/[:.]/g, '_');
}

// ---------- VIDEO INFO ----------
app.post('/info', (req, res) => {
  const url = req.body?.url;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  const proc = spawn(YTDLP_BIN, [
    '-j',
    '--no-playlist',
    '--js-runtimes',
    'node',
    url
  ]);

  let out = '';
  let err = '';

  proc.stdout.on('data', d => (out += d.toString()));
  proc.stderr.on('data', d => (err += d.toString()));

  proc.on('close', code => {
    if (code !== 0) {
      console.error('[yt-dlp info error]', err || out);
      return res.status(500).json({
        error: 'yt-dlp error',
        details: err || out
      });
    }

    try {
      const info = JSON.parse(out);

      res.json({
        id: info.id,
        title: info.title,
        uploader: info.uploader,
        duration: info.duration,
        view_count: info.view_count,
        thumbnails: info.thumbnails,
        formats: (info.formats || []).map(f => ({
          format_id: f.format_id,
          ext: f.ext,
          resolution:
            f.resolution || (f.height ? `${f.height}p` : ''),
          fps: f.fps || '',
          vcodec: f.vcodec,
          acodec: f.acodec,
          filesize: f.filesize
            ? `${(f.filesize / 1048576).toFixed(2)} MB`
            : 'Unknown',
          tbr: f.tbr || '',
          format_note: f.format_note || '',
          protocol: f.protocol || ''
        }))
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse yt-dlp output' });
    }
  });
});

// ---------- DOWNLOAD ----------
app.get('/download', (req, res) => {
  const url = req.query.url;
  let format = req.query.format;

  if (!url) return res.status(400).send('Missing URL');

  // ---------- FORMAT NORMALIZATION ----------
  if (!format) {
    format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best';
  } else if (!format.includes('+') && !format.includes('audio')) {
    format = `${format}+bestaudio/best`;
  }

  const clientId = getClientId(req);
  const timestamp = Date.now();

  const outputTemplate = path.join(
    downloadsDir,
    sanitizeFilename(`${timestamp}.%(ext)s`)
  );

  const args = [
    '-f',
    format,
    '--merge-output-format',
    'mp4',
    '--js-runtimes',
    'node',
    '--newline',
    '--progress',
    '--no-playlist',
    '-o',
    outputTemplate,
    url
  ];

  console.log('\n---------------- DOWNLOAD ----------------');
  console.log(`Client : ${clientId}`);
  console.log(`URL    : ${url}`);
  console.log(`Format : ${format}`);
  console.log('------------------------------------------');

  const dl = spawn(YTDLP_BIN, args);

  dl.stdout.on('data', d => {
    console.log(`[${clientId}] ${d.toString().trim()}`);
  });

  dl.stderr.on('data', d => {
    console.error(`[${clientId}] ${d.toString().trim()}`);
  });

  dl.on('close', code => {
    if (code !== 0) {
      console.error(`[${clientId}] Download failed (${code})`);
      return res.status(500).send('Download failed');
    }

    // Find produced file
    const files = fs
      .readdirSync(downloadsDir)
      .filter(f => f.startsWith(String(timestamp)));

    if (!files.length) {
      return res.status(500).send('File not found');
    }

    const finalFile = path.join(downloadsDir, files[0]);

    res.download(finalFile, err => {
      if (err) console.error('Send error', err);
      fs.unlink(finalFile, () => {});
    });
  });

  req.on('close', () => {
    if (!dl.killed) {
      console.warn(`[${clientId}] Client disconnected – aborting`);
      dl.kill('SIGINT');
    }
  });
});

// ---------- SERVER ----------
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
