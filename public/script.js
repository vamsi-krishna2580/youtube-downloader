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

    // ---------- BASIC VIDEO INFO ----------
    document.getElementById('info').innerHTML = `
      <h3>${data.title}</h3>
      <p>By: ${data.uploader || 'Unknown'}</p>
      <p>Views: ${data.view_count || 'N/A'}</p>
      <img src="${data.thumbnails?.slice(-1)[0]?.url || ''}" width="320">
    `;

    if (!data.formats || data.formats.length === 0) {
      document.getElementById('formats').innerHTML = `<p>No formats found.</p>`;
      return;
    }

    // ---------- FORMAT TABLE ----------
    const rows = data.formats.map(f => `
      <tr>
        <td>${f.format_id}</td>
        <td>${f.ext || ''}</td>
        <td>${f.resolution || ''}</td>
        <td>${f.fps || ''}</td>
        <td>${f.vcodec || ''}</td>
        <td>${f.acodec || ''}</td>
        <td>${f.filesize || 'Unknown'}</td>
        <td>${f.tbr || ''}</td>
        <td>${f.format_note || ''}</td>
        <td>${f.protocol || ''}</td>
        <td>
          <button
            class="dl-btn"
            data-id="${f.format_id}"
            data-vcodec="${f.vcodec}"
            data-acodec="${f.acodec}"
          >⬇️</button>
        </td>
      </tr>
    `).join('');

    document.getElementById('formats').innerHTML = `
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

    // ---------- DOWNLOAD HANDLER ----------
    document.querySelectorAll('.dl-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const formatId = btn.dataset.id;
        startDownload(url, formatId);
      });
    });

  } catch (err) {
    document.getElementById('loader').style.display = 'none';
    console.error(err);
    alert('Failed to fetch info');
  }
}

// ---------- START DOWNLOAD (CRITICAL FIX) ----------
function startDownload(url, formatId) {
  const downloadUrl =
    `/download?url=${encodeURIComponent(url)}&format=${encodeURIComponent(formatId)}`;

  window.location.href = downloadUrl;
}
