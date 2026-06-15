import express from 'express';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadModel, unloadModel, getLoadedModelInfo, diffusion, SD_V2_1_1B_Q8_0 } from "@qvac/sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));



const CONFIG_PATH = path.join(__dirname, '.device-preference.json');

function getPreferredDevice() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return data.device || null;
    }
  } catch (err) {
    console.error('Failed to read device preference:', err.message);
  }
  return null;
}

function setPreferredDevice(device) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ device }), 'utf8');
  } catch (err) {
    console.error('Failed to write device preference:', err.message);
  }
}

// Global model state
let loadedModelId = process.modelId || null;
let modelLoadPercent = 0;
let modelLoadStatus = 'Awaiting trigger...';
let isModelLoading = false;

const modelSize = (SD_V2_1_1B_Q8_0.expectedSize / (1024 * 1024 * 1024)).toFixed(2) + ' GB';

function broadcastModelProgress(percent, status) {
  io.emit('model-download-progress', { percent, status, size: modelSize });
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Trigger model download
  socket.on('trigger-model-download', async () => {
    // If already loaded, verify it's still alive in the worker
    if (loadedModelId) {
      try {
        await getLoadedModelInfo({ modelId: loadedModelId });
        socket.emit('model-download-progress', {
          percent: 100,
          status: 'Model fully loaded locally.',
          size: modelSize
        });
        return;
      } catch (err) {
        console.log('Model ID was stale/not found, resetting state and reloading...', err.message);
        loadedModelId = null;
        process.modelId = null;
      }
    }

    // If currently loading, report current progress
    if (isModelLoading) {
      socket.emit('model-download-progress', {
        percent: Math.round(modelLoadPercent),
        status: modelLoadStatus,
        size: modelSize
      });
      return;
    }

    isModelLoading = true;
    modelLoadPercent = 0;
    modelLoadStatus = 'Initiating model download...';
    broadcastModelProgress(modelLoadPercent, modelLoadStatus);

    try {
      console.log('Starting model download...');
      const preferredDevice = getPreferredDevice();
      const loadConfig = { prediction: "v" };
      if (preferredDevice) {
        loadConfig.device = preferredDevice;
        if (preferredDevice === 'cpu') {
          loadConfig.threads = 4;
        }
        console.log(`Using cached device preference: ${preferredDevice}`);
      }

      loadedModelId = await loadModel({
        modelSrc: SD_V2_1_1B_Q8_0,
        modelType: "sdcpp-generation",
        modelConfig: loadConfig,
        onProgress: (p) => {
          modelLoadPercent = p.percentage;
          modelLoadStatus = p.percentage >= 100 ? 'Model fully loaded locally.' : `Downloading model weights... (${p.percentage.toFixed(1)}%)`;
          broadcastModelProgress(Math.round(modelLoadPercent), modelLoadStatus);
        }
      });
      process.modelId = loadedModelId;

      isModelLoading = false;
      console.log('Model loaded successfully. ID:', loadedModelId);
    } catch (err) {
      isModelLoading = false;
      modelLoadPercent = 0;
      modelLoadStatus = 'Failed to load model: ' + err.message;
      console.error('Failed to load model:', err);
      broadcastModelProgress(0, modelLoadStatus);
      socket.emit('error_event', { message: 'Failed to load model: ' + err.message });
    }
  });

  socket.on('generate', async (data) => {
    const { prompt, ratio } = data;
    if (!prompt || prompt.trim() === '') {
      socket.emit('error_event', { message: 'Prompt is required' });
      return;
    }

    if (!loadedModelId) {
      socket.emit('error_event', { message: 'Model is not loaded yet' });
      return;
    }

    const runDiffusion = async (modelIdToUse) => {
      socket.emit('progress', {
        percent: 0,
        status: 'Starting diffusion process...',
        sub: 'DIFFUSION INITIALIZING'
      });

      console.log(`Generating image for prompt: "${prompt}" with ratio: ${ratio} using model ID: ${modelIdToUse}`);

      const { progressStream, outputs, stats } = diffusion({
        modelId: modelIdToUse,
        prompt,
      });

      // Stream progress steps
      for await (const { step, totalSteps } of progressStream) {
        const percent = Math.round((step / totalSteps) * 100);
        socket.emit('progress', {
          percent,
          status: `Denoising step ${step}/${totalSteps}...`,
          sub: 'RUNNING DIFFUSION'
        });
      }

      // Resolve output buffers
      const buffers = await outputs;
      if (!buffers || buffers.length === 0) {
        throw new Error('No image buffer returned from diffusion model.');
      }

      // Convert image buffer to a base64 Data URL instead of saving to disk
      const base64Data = Buffer.from(buffers[0]).toString('base64');
      const dataUrl = `data:image/png;base64,${base64Data}`;

      // Emit success
      socket.emit('success', {
        url: dataUrl,
        prompt,
        seed: (await stats).seed || -1
      });

      console.log(`Image generated and emitted successfully as base64 Data URL.`);
    };

    try {
      await runDiffusion(loadedModelId);
    } catch (err) {
      console.error('Image generation failed:', err);

      const isCrash = err.code === 50205 || (err.message && err.message.includes('WORKER_CRASHED'));
      if (isCrash) {
        console.log('Worker crashed during GPU execution. Attempting CPU fallback...');

        // Save device preference so we load CPU directly next time and prevent double loading
        setPreferredDevice('cpu');

        // Reset the stale model state
        loadedModelId = null;
        process.modelId = null;

        socket.emit('progress', {
          percent: 0,
          status: 'GPU driver crashed. Automatically falling back to CPU mode...',
          sub: 'CPU FALLBACK LOADING'
        });

        try {
          console.log('Loading model on CPU...');
          isModelLoading = true;
          modelLoadPercent = 0;
          modelLoadStatus = 'Loading CPU model weights...';
          broadcastModelProgress(modelLoadPercent, modelLoadStatus);

          loadedModelId = await loadModel({
            modelSrc: SD_V2_1_1B_Q8_0,
            modelType: "sdcpp-generation",
            modelConfig: { prediction: "v", device: 'cpu', threads: 4 },
            onProgress: (p) => {
              modelLoadPercent = p.percentage;
              modelLoadStatus = `Loading CPU model weights... (${p.percentage.toFixed(1)}%)`;
              broadcastModelProgress(Math.round(modelLoadPercent), modelLoadStatus);
            }
          });
          process.modelId = loadedModelId;
          isModelLoading = false;
          console.log('Model loaded successfully on CPU. ID:', loadedModelId);

          // Retry diffusion on CPU
          await runDiffusion(loadedModelId);
        } catch (cpuErr) {
          console.error('CPU fallback execution failed:', cpuErr);
          isModelLoading = false;
          socket.emit('error_event', { message: 'Image generation failed on CPU: ' + cpuErr.message });
        }
      } else {
        if (err.message && (err.message.includes('MODEL_NOT_FOUND') || err.message.includes('not found'))) {
          loadedModelId = null;
          process.modelId = null;
          broadcastModelProgress(0, 'Model state lost. Please re-trigger download.');
        }
        socket.emit('error_event', { message: 'Image generation failed: ' + err.message });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.downloadInterval) {
      clearInterval(socket.downloadInterval);
    }
  });
});

// Serve static index.html for other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

// Clean exit handler to unload the model when the server terminates
async function handleCleanup() {
  const modelId = process.modelId || loadedModelId;
  if (modelId && modelId !== 'mock-model-id') {
    console.log(`\nUnloading model ID ${modelId} before closing server...`);
    try {
      await unloadModel({ modelId, clearStorage: false });
      console.log('Model unloaded successfully.');
    } catch (err) {
      if (err.name === 'MODEL_NOT_LOADED' || (err.message && err.message.includes('not loaded'))) {
        console.log('Model was already unloaded.');
      } else {
        console.error('Failed to unload model during shutdown:', err);
      }
    }
  }
  process.exit(0);
}

// Register process exit listeners
process.on('SIGINT', handleCleanup);
process.on('SIGTERM', handleCleanup);
