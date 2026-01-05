const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
app.use(helmet());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const YTDLP_BIN = 'yt-dlp';

// ---------------- HELPERS ----------------
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9 ._-]/g, '').trim();
}

// Common yt-dlp flags for Render stability
function ytDlpBaseArgs() {
  return [
    '-4',                         // FORCE IPv4 (VERY IMPORTANT for Render)
    '--no-check-certificate',
    '--no-call-home',
    '--no-warnings'
  ];
}

// ---------------- GET VIDEO INFO ----------------
app.post('/info', (req, res) => {
  const url = req.body?.url;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  const args = [
    ...ytDlpBaseArgs(),
    '-j',
    '--no-playlist',
    url
  ];

  console.log('YT-DLP INFO CMD:', YTDLP_BIN, args.join(' '));

  const proc = spawn(YTDLP_BIN, args);
  let out = '';
  let err = '';

  proc.stdout.on('data', d => out += d.toString());
  proc.stderr.on('data', d => err += d.toString());

  proc.on('close', code => {
    if (code !== 0) {
      console.error('YT-DLP INFO ERROR:', err);
      return res.status(500).json({ error: 'yt-dlp failed', details: err });
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
        formats: info.formats?.map(f => ({
          format_id: f.format_id,
          ext: f.ext,
          resolution: f.resolution || `${f.width || ''}x${f.height || ''}`,
          fps: f.fps || '',
          vcodec: f.vcodec,
          acodec: f.acodec,
          filesize: f.filesize
            ? `${(f.filesize / 1048576).toFixed(2)} MB`
            : 'Unknown',
          tbr: f.tbr ? `${f.tbr}k` : '',
          format_note: f.format_note || '',
          protocol: f.protocol || ''
        })) || []
      });
    } catch (e) {
      console.error('JSON PARSE ERROR:', e);
      res.status(500).json({ error: 'Invalid yt-dlp JSON' });
    }
  });
});

// ---------------- PROGRESS (SSE) ----------------
app.get('/progress', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end();

  res.set({
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive'
  });

  const args = [
    ...ytDlpBaseArgs(),
    '-f', 'bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '-o', '-',
    url
  ];

  console.log('YT-DLP PROGRESS CMD:', YTDLP_BIN, args.join(' '));

  const dl = spawn(YTDLP_BIN, args);

  dl.stderr.on('data', d => {
    const line = d.toString();
    console.error('YT-DLP STDERR:', line);

    const match = line.match(/(\d+\.\d+)%.*?at (.*?) ETA (.*)/);
    if (match) {
      res.write(`data: ${JSON.stringify({
        percent: match[1],
        speed: match[2],
        eta: match[3]
      })}\n\n`);
    }
  });

  dl.on('close', code => {
    res.write(`data: ${JSON.stringify({ done: true, code })}\n\n`);
    res.end();
  });

  req.on('close', () => dl.kill('SIGKILL'));
});

// ---------------- DOWNLOAD (STREAM DIRECTLY) ----------------
app.get('/download', (req, res) => {
  const url = req.query.url;
  const format = req.query.format || 'best';
  if (!url) return res.status(400).send('Missing URL');

  const filename = sanitizeFilename(`video-${Date.now()}.mp4`);

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`
  );
  res.setHeader('Content-Type', 'video/mp4');

  const args = [
    ...ytDlpBaseArgs(),
    '-f', format,
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '-o', '-',
    url
  ];

  console.log('YT-DLP DOWNLOAD CMD:', YTDLP_BIN, args.join(' '));

  const dl = spawn(YTDLP_BIN, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  dl.stdout.on('error', err => {
    console.error('STDOUT PIPE ERROR:', err);
  });

  dl.stdout.pipe(res);

  dl.stderr.on('data', d => {
    console.error('YT-DLP STDERR:', d.toString());
  });

  dl.on('close', code => {
    console.log('YT-DLP EXIT CODE:', code);
    res.end();
  });

  req.on('close', () => {
    dl.kill('SIGKILL');
  });
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);
