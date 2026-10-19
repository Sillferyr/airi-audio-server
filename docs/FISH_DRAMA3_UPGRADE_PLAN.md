# Fish Audio Drama 3 Backend Upgrade Plan

**Document Version:** 1.0.0  
**Date:** October 18, 2026  
**Status:** In Progress  
**Target Repository:** `airi-audio-server`  
**Backend Engine:** `audio.cpp` (Local path: `../audio.cpp`)

---

## 1. Goal and Objectives

Upgrade the `airi-audio-server` microservice backend to natively support **Fish Audio Drama 3** (`fish_drama3`), the 40-layer hybrid attention/MoE speech generation model.

### Key Objectives:
1. **Model Selection**: Install and support the clean **Q2_K** package:
   - File: `drama-3-backbone-8bit-experts-Q2_K.gguf` (15.88 GiB)
   - Repository: [`Jmica/Drama-3-GGUF`](https://huggingface.co/Jmica/Drama-3-GGUF)
   - Status: Official standard K-quant package. (Experimental pruned IQ3_XXS deferred for future evaluation).
2. **Maintainer Binary Strategy**:
   - **Immediate Phase**: Build optimized native binaries for the local system architecture (`sm89` - NVIDIA GeForce RTX 4070 Laptop GPU / Ada Lovelace) to install, test, and benchmark immediately.
   - **Release Phase (Maintainer Reminder)**: Before pushing upstream updates to `airi-audio-server`, compile the full multi-architecture release matrix (`sm75`, `sm86`, `sm89`, `sm120`) for both `audiocpp_server` and `audiocpp_cli` so all hardware tiers are supported out-of-the-box.
3. **Seamless Installer Experience**:
   - Update `setup.js` (called by `install.bat`) so Fish Drama 3 appears as a quick, prominent option in the interactive installation wizard.
   - Provide a dedicated, resumable downloader script (`download_drama3.js` / `npm run add-drama3`).
4. **VRAM Offloading & Stability**:
   - Drama 3 requires ~16 GB storage. For an 8 GB VRAM GPU, offloading expert layers to CPU (`fish_drama3.cpu_expert_layers=24`) is required.
   - Patch `src/engine.js` to properly forward `session_options` from `config.json` into `server.json`.

---

## 2. Environment and Architecture Reference

### Local Hardware:
- **GPU**: NVIDIA GeForce RTX 4070 Laptop GPU (8,188 MiB VRAM, Compute Capability 8.9 / `sm89`)
- **Host OS**: Windows 11
- **Compilers & Toolchains**: Visual Studio 2022 Community (MSVC 19.36), CMake 3.27.1, CUDA 13.1 `nvcc`
- **Runtimes**: Node.js v22.21.1, Python 3.12 (`py.exe`)

### Git Repositories:
- `airi-audio-server`: `C:\Users\h4rdc\Documents\Github\coding-agent\airi-audio-server`
- `audio.cpp`: `C:\Users\h4rdc\Documents\Github\coding-agent\audio.cpp`
  - Backup branch for previous custom work: `feature/higgs-streaming-backup`
  - Target tracking branch: `origin/main` (contains tag `v0.9.2-drama3-base-small` and commit `50749561`)

---

## 3. Phased Execution Roadmap

### Phase 1: Local `audio.cpp` Synchronization
- [x] Located existing local repository at `c:\Users\h4rdc\Documents\Github\coding-agent\audio.cpp`.
- [x] Fetched upstream changes from `origin` (tags `v0.9.2`, `v0.9.2-drama3-base-small`).
- [x] Preserved local commits (`be0ee952` streaming changes) to `feature/higgs-streaming-backup`.
- [ ] Align local `audio.cpp` working tree to latest `origin/main`.
- [ ] Initialize/update frontends submodule (`git -c submodule.external/audio.cpp-server-frontends.url=https://github.com/0xShug0/audio.cpp-server-frontends.git submodule update --init --recursive`).

### Phase 2: Binary Compilation (sm89 Native Build)
- [ ] Build `audiocpp_server` using `scripts\build_windows.ps1` with:
  - `-Preset windows-cuda-release`
  - `-ModelSet custom -Models "citrinet_asr,omnivoice,higgs_audio_tts,fish_audio,yue2,moss_voicegen,stable_audio,fish_drama3"`
  - `-CudaArchitectures "89"`
  - `-DeploymentBuild` (embeds contract model specs into the binary)
- [ ] Build `audiocpp_cli` with the identical configuration.
- [ ] Verify `bin\windows-cuda\audiocpp_cli.exe --version` and `audiocpp_cli.exe --family fish_drama3`.
- [ ] Copy binaries to `airi-audio-server\bin\windows-cuda\` (`audiocpp_server.exe`, `audiocpp_server_sm89.exe`, `audiocpp_cli.exe`, `audiocpp_cli_sm89.exe`).

### Phase 3: `airi-audio-server` Engine & Configuration Fixes
- [ ] **`src/engine.js`**: Update `initialize()` to dynamically spread `modelConfig.session_options` into `serverConfig.models[0].session_options`.
- [ ] **`config.json`**: Register `fish-drama3` model profile:
  ```json
  "fish-drama3": {
    "family": "fish_drama3",
    "path": "models/Drama-3-GGUF/drama-3-backbone-8bit-experts-Q2_K.gguf",
    "mode": "streaming",
    "allow_unfiltered_tags": true,
    "session_options": {
      "fish_drama3.cpu_expert_layers": "24",
      "fish_drama3.context_length": "2048"
    }
  }
  ```
- [x] **`setup.js`**: Added option `[8] Fish Audio Drama 3 Q2_K (Next-Gen MoE TTS)` in `MODEL_CATALOG` for instant one-click selection.
- [x] **`download_drama3.js`**: Created dedicated download utility with HF CLI acceleration and auto-registration. Added `add-drama3` to `package.json`.

### Phase 4: Model Acquisition & Verification
- [x] Download `drama-3-backbone-8bit-experts-Q2_K.gguf` (15.88 GiB) into `models/Drama-3-GGUF/`.
- [x] Test CLI synthesis:
  - Validated prompt evaluation and MoE expert streaming.
  - Resolved MSVC ICE compiler bug in `qwen3_audio_encoder_runtime.cpp`.
  - Resolved Windows file replacement `rename: Access is denied` in `app/workflow/file_sink.cpp`.
- [x] Test Server synthesis:
  - Validated OpenAI-compatible POST `/v1/audio/speech` with Morgan Freeman voice cloning (`morgan-freeman.wav`).
  - Generated output: `airi-audio-server/test_output_drama3.wav` (6.18s, 44.1kHz mono PCM, 532 KB).
  - **Latency / Performance Optimization**:
    - **Before**: 24 CPU expert layers + active CUDA graphs = 36.5s per token (84m total generation).
    - **Optimized**: `pin_experts=true`, `expert_cache_size=16`, `cpu_expert_layers=0`, `codec_backend=cpu`, `GGML_CUDA_DISABLE_GRAPHS=1` = 147ms per token (~248x speedup).
    - Steady-state warm request completed with HTTP 200 in ~115s total for a multi-second voice-cloned utterance.

### Phase 5: Maintainer Multi-Arch Release Build (Post-Verification Reminder)
- [ ] Compile full binary matrix in `audio.cpp`:
  - `sm75` (Turing: RTX 2060-2080, GTX 1660, T4)
  - `sm86` (Ampere: RTX 3050-3090, A2000-A6000)
  - `sm89` (Ada Lovelace: RTX 4050-4090, L4, L40) — **Completed and deployed to bin/windows-cuda/**
  - `sm120` (Blackwell: RTX 50-series)
- [ ] Package and stage for repository release.
