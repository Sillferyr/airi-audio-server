const fs = require('fs');
const path = require('path');
const https = require('https');

function resolvePath(p) {
  if (!p) return '';
  if (path.isAbsolute(p)) return p;
  return path.resolve(__dirname, p);
}

function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`\nStarting download from Hugging Face / Model Hub:`);
    console.log(`URL   : ${url}`);
    console.log(`Target: ${targetPath}\n`);

    const request = (currentUrl) => {
      https.get(currentUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          return request(response.headers.location);
        }

        if (response.statusCode !== 200) {
          return reject(new Error(`Download failed. HTTP Status: ${response.statusCode}`));
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastReport = 0;

        const fileStream = fs.createWriteStream(targetPath);
        response.pipe(fileStream);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          if (now - lastReport > 800 || downloadedBytes === totalBytes) {
            lastReport = now;
            if (totalBytes > 0) {
              const pct = ((downloadedBytes / totalBytes) * 100).toFixed(1);
              const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
              const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
              process.stdout.write(`\rDownloading: [${mb} MB / ${totalMb} MB] (${pct}%)`);
            } else {
              const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
              process.stdout.write(`\rDownloading: ${mb} MB`);
            }
          }
        });

        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`\n✓ Download complete: ${path.basename(targetPath)}`);
          resolve();
        });

        fileStream.on('error', (err) => {
          fs.unlink(targetPath, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(targetPath, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

function ensureSidecarConfig(targetDir) {
  const configFile = path.join(targetDir, 'config.json');
  if (!fs.existsSync(configFile)) {
    const sidecar = {
      family: "fish_drama3",
      model_type: "fish_drama3"
    };
    fs.writeFileSync(configFile, JSON.stringify(sidecar, null, 2), 'utf-8');
    console.log(`✓ Created sidecar configuration at: ${configFile}`);
  }
}

function registerInServerConfig(modelRelPath) {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!cfg.models) cfg.models = {};
      cfg.models['fish-drama3'] = {
        family: 'fish_drama3',
        path: modelRelPath,
        mode: 'streaming',
        allow_unfiltered_tags: true,
        session_options: {
          'fish_drama3.cpu_expert_layers': '24',
          'fish_drama3.context_length': '2048'
        }
      };
      if (!cfg.installed_models) cfg.installed_models = [];
      if (!cfg.installed_models.includes('fish-drama3')) {
        cfg.installed_models.push('fish-drama3');
      }
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
      console.log(`✓ Registered 'fish-drama3' in config.json with CPU offload layers=24`);
    } catch (e) {
      console.warn(`[Warning] Could not auto-update config.json: ${e.message}`);
    }
  }
}

async function main() {
  console.log("=".repeat(65));
  console.log("   AIRI Audio Server - Fish Audio Drama 3 (Q2_K) Installer     ");
  console.log("=".repeat(65));
  console.log("\nFish Audio Drama 3 is a 40-layer hybrid attention/MoE speech");
  console.log("synthesis model with 256 experts per layer, zero-shot voice cloning,");
  console.log("paralinguistic event tags, and real-time streaming.\n");
  console.log("Package : drama-3-backbone-8bit-experts-Q2_K.gguf (~15.88 GB)");
  console.log("Source  : Jmica/Drama-3-GGUF (Hugging Face)\n");

  const url = "https://huggingface.co/Jmica/Drama-3-GGUF/resolve/main/drama-3-backbone-8bit-experts-Q2_K.gguf";
  const relPath = "models/Drama-3-GGUF/drama-3-backbone-8bit-experts-Q2_K.gguf";
  const targetPath = resolvePath(relPath);

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 15000000000) {
    console.log(`✓ Fish Audio Drama 3 Q2_K is already downloaded at: ${targetPath}`);
    ensureSidecarConfig(path.dirname(targetPath));
    registerInServerConfig(relPath);
    return;
  }

  try {
    const { spawnSync } = require('child_process');
    const localDir = path.dirname(targetPath);
    console.log(`Checking HuggingFace CLI acceleration...`);
    const hfCheck = spawnSync('py', ['-m', 'huggingface_hub.cli.hf', 'download', 'Jmica/Drama-3-GGUF', 'drama-3-backbone-8bit-experts-Q2_K.gguf', '--local-dir', localDir, '--max-workers', '8'], {
      stdio: 'inherit',
      cwd: __dirname
    });
    if (hfCheck.status !== 0 || !fs.existsSync(targetPath) || fs.statSync(targetPath).size < 1000000) {
      console.log(`\nFalling back to direct HTTPS chunked stream download...`);
      await downloadFile(url, targetPath);
    }
    ensureSidecarConfig(path.dirname(targetPath));
    registerInServerConfig(relPath);
    console.log("\n" + "=".repeat(65));
    console.log("✓ Fish Audio Drama 3 Q2_K Installation Complete!");
    console.log("You can now call POST /v1/audio/speech with model: 'fish-drama3'");
    console.log("=".repeat(65) + "\n");
  } catch (err) {
    console.error(`\n[Download Error] ${err.message}`);
    process.exit(1);
  }
}

main();
