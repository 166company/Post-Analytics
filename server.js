const express = require('express');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');

const app  = express();
const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

app.use(express.json());
app.use(express.static(__dirname));

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

app.post('/api/config', (req, res) => {
  writeConfig({ ...readConfig(), ...req.body });
  res.json({ ok: true });
});

app.delete('/api/config', (req, res) => {
  writeConfig({});
  res.json({ ok: true });
});

// 0.0.0.0 — şəbəkədəki bütün kompüterlərdən əlçatan olur
app.listen(PORT, '0.0.0.0', () => {
  // LAN IP-lərini tap
  const nets = os.networkInterfaces();
  const ips  = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }

  console.log('\n========================================');
  console.log('  Post Analytics işləyir');
  console.log('========================================');
  console.log(`  Bu kompüter:    http://localhost:${PORT}`);
  ips.forEach(ip => {
    console.log(`  Şəbəkə üzrə:   http://${ip}:${PORT}`);
  });
  console.log('========================================');
  console.log('  Digər kompüterlərdə "Şəbəkə üzrə"');
  console.log('  ünvanını brauzerə yazın.');
  console.log('  Bu pəncərəni bağlamayın!\n');
});
