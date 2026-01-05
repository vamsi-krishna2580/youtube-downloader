document.getElementById('getInfoBtn').addEventListener('click', getInfo);

async function getInfo() {
  const url = document.getElementById('url').value.trim();
  if (!url) return alert('Please enter a YouTube URL');

  document.getElementById('loader').style.display = 'block';
  document.getElementById('info').innerHTML = '';
  document.getElementById('formats').innerHTML = '';

  try {
    const res = await fetch('/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();
    document.getElementById('loader').style.display = 'none';

    if (data.error) {
      console.error(data);
      return alert('Error: ' + data.error);
    }

    // --- show basic video info ---
    document.getElementById('info').innerHTML = `
      <h3>${data.title}</h3>
      <p>By: ${data.uploader || 'Unknown'}</p>
      <p>Views: ${data.view_count || 'N/A'}</p>
      <img src="${data.thumbnails?.slice(-1)[0]?.url || ''}" width="320">
    `;

    // --- build full format table like yt-dlp -F ---
    if (!data.formats || data.formats.length === 0) {
      document.getElementById('formats').innerHTML = `<p>No formats found.</p>`;
      return;
    }

    let rows = data.formats.map(f => `
      <tr>
        <td>${f.format_id}</td>
        <td>${f.ext || ''}</td>
        <td>${f.resolution || (f.height ? f.height + 'p' : 'audio only')}</td>
        <td>${f.fps || ''}</td>
        <td>${f.vcodec || ''}</td>
        <td>${f.acodec || ''}</td>
        <td>${f.filesize ? (f.filesize / (1024 * 1024)).toFixed(1) + ' MB' : 'Unknown'}</td>
        <td>${f.tbr || ''}</td>
        <td>${f.format_note || ''}</td>
        <td>${f.protocol || ''}</td>
        <td><button class="dl-btn" data-id="${f.format_id}" data-vcodec="${f.vcodec}" data-acodec="${f.acodec}">⬇️</button></td>
      </tr>
    `).join('');

    const formatsDiv = document.getElementById('formats');
    formatsDiv.innerHTML = `
      <table border="1" cellspacing="0" cellpadding="5">
        <thead>
          <tr>
            <th>ID</th>
            <th>EXT</th>
            <th>RESOLUTION</th>
            <th>FPS</th>
            <th>VCODEC</th>
            <th>ACODEC</th>
            <th>SIZE</th>
            <th>BITRATE</th>
            <th>NOTE</th>
            <th>PROTO</th>
            <th>ACTION</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    // --- download button logic ---
    document.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.dataset.id;
        const vcodec = btn.dataset.vcodec;
        const acodec = btn.dataset.acodec;

        // --- detect if it's video-only ---
        if (vcodec !== 'none' && acodec === 'none') {
          const confirmMerge = confirm(
            "This format is video-only (no audio).\n\nDo you want to:\n- OK → Download Video + Best Audio\n- Cancel → Download Video Only"
          );

          if (confirmMerge) {
            startDownload(url, `${format}+bestaudio/best`);
          } else {
            startDownload(url, format);
          }
        }
        // --- audio-only formats ---
        else if (vcodec === 'none' && acodec !== 'none') {
          startDownload(url, format);
        }
        // --- combined formats ---
        else {
          startDownload(url, format);
        }
      });
    });

  } catch (err) {
    document.getElementById('loader').style.display = 'none';
    console.error(err);
    alert('Failed to fetch info: ' + err.message);
  }
}

// 🔽 Helper function to start the download
function startDownload(url, format) {
  const downloadUrl = `/download?url=${encodeURIComponent(url)}&format=${format}`;
  window.location.href = downloadUrl;
}
