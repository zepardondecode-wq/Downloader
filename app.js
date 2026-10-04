const state = {
  platform: null,
  scan: null
};

const brand = document.querySelector('#brand');
const urlInput = document.querySelector('#urlInput');
const scanBtn = document.querySelector('#scanBtn');
const statusEl = document.querySelector('#status');
const resultEl = document.querySelector('#result');
const platformButtons = [...document.querySelectorAll('.platform-btn')];
const resultTemplate = document.querySelector('#resultTemplate');

function setPlatform(platform) {
  state.platform = platform || null;
  brand.dataset.platform = platform || 'none';
  platformButtons.forEach((button) => {
    const active = button.dataset.platform === platform;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
}

function detectClientPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'pin.it' || host === 'pinterest.com' || host.endsWith('.pinterest.com')) return 'pinterest';
  } catch {}
  return null;
}

function setStatus(message = '', kind = '') {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
}

function prettyProvider(provider) {
  return provider?.includes('Pinterest') ? 'custom Pinterest parser' : 'free API';
}

function createAssetButton(asset, index, total) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `asset-btn ${index === 0 ? 'primary' : ''}`;
  button.dataset.index = String(index);
  button.innerHTML = `<span>⇩</span> ${total > 1 ? `DOWNLOAD ${index + 1}` : 'DOWNLOAD'}`;
  button.addEventListener('click', () => startDownload(button, index));
  return button;
}

async function startDownload(button, index = 0) {
  if (!state.scan?.originalUrl || button.classList.contains('loading')) return;
  const original = button.innerHTML;
  button.classList.add('loading');
  button.disabled = true;
  button.innerHTML = `<span class="mini-spinner"></span> MENYIAPKAN`;
  setStatus('Menghubungkan ke sumber media…');

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: state.scan.originalUrl, index })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Download gagal.');

    const anchor = document.createElement('a');
    anchor.href = data.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.download = data.filename || `z-downloder-${index + 1}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setStatus('Media siap. Browser kamu membuka link file dari provider.', 'success');
  } catch (error) {
    setStatus(error.message || 'Download gagal.', 'error');
  } finally {
    button.disabled = false;
    button.classList.remove('loading');
    button.innerHTML = original;
  }
}

function renderResult(data) {
  state.scan = data;
  const fragment = resultTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.result-card');
  const image = fragment.querySelector('.preview-img');
  const previewFrame = fragment.querySelector('.preview-frame');
  const placeholder = fragment.querySelector('.preview-placeholder');

  if (data.thumbnail) {
    image.src = data.thumbnail;
    image.onload = () => previewFrame.classList.add('has-image');
    image.onerror = () => { image.removeAttribute('src'); };
  }

  fragment.querySelector('.media-badge').textContent = data.mediaTypeLabel;
  fragment.querySelector('.platform-pill').textContent = data.platformLabel;
  fragment.querySelector('.provider-pill').textContent = prettyProvider(data.provider);
  fragment.querySelector('.result-title').textContent = data.title;
  fragment.querySelector('.result-desc').textContent = data.description;
  fragment.querySelector('.meta-type').textContent = data.mediaTypeLabel;
  fragment.querySelector('.meta-duration').textContent = data.durationLabel;
  fragment.querySelector('.meta-size').textContent = data.sizeLabel || 'Tidak diketahui';

  const assetList = fragment.querySelector('.asset-list');
  data.assets.forEach((asset, index) => {
    assetList.appendChild(createAssetButton(asset, index, data.assets.length));
  });

  resultEl.innerHTML = '';
  resultEl.appendChild(fragment);
  resultEl.hidden = false;
}

async function scan() {
  const url = urlInput.value.trim();
  if (!url) {
    setStatus('Tempel link terlebih dahulu.', 'error');
    urlInput.focus();
    return;
  }

  const detected = detectClientPlatform(url);
  if (detected) setPlatform(detected);

  scanBtn.disabled = true;
  scanBtn.classList.add('loading');
  setStatus('Scanning URL, membaca metadata dan mencari media…');
  resultEl.hidden = true;

  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Scan gagal.');
    setPlatform(data.platform);
    renderResult(data);
    const plural = data.assets.length > 1 ? ` • ${data.assets.length} item terdeteksi` : '';
    setStatus(`Scan selesai${plural}.`, 'success');
  } catch (error) {
    state.scan = null;
    resultEl.hidden = true;
    setStatus(error.message || 'Scan gagal.', 'error');
  } finally {
    scanBtn.disabled = false;
    scanBtn.classList.remove('loading');
  }
}

platformButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setPlatform(button.dataset.platform);
    if (state.scan && state.scan.platform !== button.dataset.platform) {
      setStatus(`Mode ${button.textContent.trim()} aktif. Scan ulang untuk URL tersebut.`);
    }
  });
});

urlInput.addEventListener('paste', () => {
  setTimeout(() => {
    const detected = detectClientPlatform(urlInput.value.trim());
    if (detected) setPlatform(detected);
  }, 50);
});

urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') scan();
});
scanBtn.addEventListener('click', scan);

setPlatform(null);
