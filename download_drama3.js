const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

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

function registerInServerConfig(modelId, modelRelPath) {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!cfg.models) cfg.models = {};
      cfg.models[modelId] = {
        family: 'fish_drama3',
        path: modelRelPath,
        mode: 'streaming',
        allow_unfiltered_tags: true,
        session_options: {
          'cuda_graphs': 'false',
          'fish_drama3.disk_experts': 'true',
          'fish_drama3.pin_experts': 'true',
          'fish_drama3.expert_cache_size': '16',
          'fish_drama3.cpu_expert_layers': '0',
          'fish_drama3.codec_backend': 'same',
          'fish_drama3.context_length': '2048'
        }
      };
      if (!cfg.installed_models) cfg.installed_models = [];
      if (!cfg.installed_models.includes(modelId)) {
        cfg.installed_models.push(modelId);
      }
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
      console.log(`✓ Registered '${modelId}' in config.json with optimized GPU backend.`);
    } catch (e) {
      console.warn(`[Warning] Could not auto-update config.json: ${e.message}`);
    }
  }
}

async function main() {
  const useQ2K = process.argv.includes('--q2k') || process.argv.includes('--large');

  console.log("=".repeat(65));
  console.log("       AIRI Audio Server - Fish Audio Drama 3 Installer          ");
  console.log("=".repeat(65));
  console.log("\nFish Audio Drama 3 is a 40-layer hybrid attention/MoE speech");
  console.log("synthesis model with zero-shot voice cloning, paralinguistic tags,");
  console.log("and real-time streaming.\n");

  const repo = useQ2K ? "Jmica/Drama-3-GGUF" : "pentacoxian-dev/drama3-small-GGUF";
  const filename = useQ2K ? "drama-3-backbone-8bit-experts-Q2_K.gguf" : "drama3-small-IQ3_XXS.gguf";
  const dirName = useQ2K ? "Drama-3-GGUF" : "Drama3-small-GGUF";
  const modelId = useQ2K ? "fish-drama3-q2k" : "fish-drama3";
  const minSize = useQ2K ? 15000000000 : 9000000000;
  const relPath = `models/${dirName}/${filename}`;
  const targetPath = resolvePath(relPath);
  const url = `https://huggingface.co/${repo}/resolve/main/${filename}`;

  console.log(`Selected Tier: ${useQ2K ? 'Drama 3 Q2_K (Original 15.88 GB MoE)' : 'Drama 3 Small IQ3_XXS (Optimized 9.74 GB MoE)'}`);
  console.log(`Repository   : ${repo}`);
  console.log(`File         : ${filename}\n`);

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > minSize) {
    console.log(`✓ Model package is already downloaded at: ${targetPath}`);
    ensureSidecarConfig(path.dirname(targetPath));
    registerInServerConfig(modelId, relPath);
    return;
  }

  try {
    const localDir = path.dirname(targetPath);
    console.log(`Attempting accelerated download via HuggingFace Hub...`);
    const hfArgs = ['-m', 'huggingface_hub.cli.hf', 'download', repo, filename];
    if (!useQ2K) hfArgs.push('silence_codes.json');
    hfArgs.push('--local-dir', localDir);

    const hfCheck = spawnSync('py', hfArgs, {
      stdio: 'inherit',
      cwd: __dirname
    });

    if (hfCheck.status !== 0 || !fs.existsSync(targetPath) || fs.statSync(targetPath).size < minSize) {
      console.log(`\nFalling back to direct HTTPS chunked stream download...`);
      await downloadFile(url, targetPath);
      if (!useQ2K) {
        const scUrl = `https://huggingface.co/${repo}/resolve/main/silence_codes.json`;
        const scTarget = path.join(localDir, 'silence_codes.json');
        await downloadFile(scUrl, scTarget).catch(() => {});
      }
    }

    ensureSidecarConfig(path.dirname(targetPath));
    registerInServerConfig(modelId, relPath);

    console.log("\n" + "=".repeat(65));
    console.log(`✓ Fish Audio Drama 3 (${useQ2K ? 'Q2_K' : 'Small IQ3_XXS'}) Installation Complete!`);
    console.log(`You can now call POST /v1/audio/speech with model: '${modelId}'`);
    console.log("=".repeat(65) + "\n");
  } catch (err) {
    console.error(`\n[Download Error] ${err.message}`);
    process.exit(1);
  }
}

main();
