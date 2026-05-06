const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// Railway/Render-də DATA_DIR env var qoy, yoxdursa proqram qovluğu
const DATA_DIR   = process.env.DATA_DIR || __dirname;
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

app.use(express.json());
app.use(express.static(__dirname));

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function writeConfig(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) { console.error('Config yazıla bilmədi:', e.message); }
}

// GET /api/config — token + pages qaytar
app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

// POST /api/config — token + pages saxla
app.post('/api/config', (req, res) => {
  const updated = { ...readConfig(), ...req.body };
  writeConfig(updated);
  res.json({ ok: true });
});

// DELETE /api/config — hamısını sil
app.delete('/api/config', (req, res) => {
  writeConfig({});
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Post Analytics işləyir: http://localhost:${PORT}`);
  console.log(`Config saxlanır: ${CONFIG_FILE}`);
});
