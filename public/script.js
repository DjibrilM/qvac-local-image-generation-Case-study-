document.addEventListener('DOMContentLoaded', () => {
  // Initialize Socket.io Connection
  const socket = io();

  // Trigger model download when socket connects/reconnects
  socket.on('connect', () => {
    socket.emit('trigger-model-download');
  });
 
  // UI Elements
  const promptInput = document.getElementById('prompt-input');
  const sizeBtns = document.querySelectorAll('.size-btn');
  const generateBtn = document.getElementById('generate-btn');
  const controlsBar = document.getElementById('controls-bar');
  const downloadBtn = document.getElementById('download-btn');
  
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const canvasPlaceholder = document.getElementById('canvas-placeholder');
  const canvasAspectHint = document.getElementById('canvas-aspect-hint');
  const canvasLoader = document.getElementById('canvas-loader');
  const outputImage = document.getElementById('output-image');
 
  const loaderPercent = document.getElementById('loader-percent');
  const loaderStatus = document.getElementById('loader-status');
  const loaderSub = document.getElementById('loader-sub');
 
  // State: selectedRatio is null initially (enforcing explicit selection)
  let selectedRatio = null;
  let activeGenerating = false;
  let modelLoaded = false;
 
  // Dimensions Map
  const dimensions = {
    portrait: { width: '320px', height: '420px', label: 'Portrait (3:4)' },
    inbetween: { width: '400px', height: '400px', label: 'Almost Square (1:1)' },
    landscape: { width: '500px', height: '330px', label: 'Landscape (1.5:1)' }
  };
 
  // Preset Cards Selection Logic
  const presetCards = document.querySelectorAll('.preset-card');
  presetCards.forEach(card => {
    card.addEventListener('click', () => {
      if (activeGenerating) return;
 
      // If already active, deselect and clear prompt
      if (card.classList.contains('active-preset')) {
        card.classList.remove('active-preset');
        promptInput.value = '';
      } else {
        // Remove active class from all other cards
        presetCards.forEach(c => c.classList.remove('active-preset'));
        // Make this card active
        card.classList.add('active-preset');
        // Populate prompt input
        promptInput.value = card.getAttribute('data-prompt');
        // Clear validation styles
        promptInput.classList.remove('border-destructive');
      }
    });
  });
 
  // Clear presets active state if the user types custom prompt
  promptInput.addEventListener('input', () => {
    presetCards.forEach(c => c.classList.remove('active-preset'));
  });
 
  // Handle preset size buttons click (pre-generation canvas resizing)
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (activeGenerating) return;
 
      // Reset button classes
      sizeBtns.forEach(b => {
        b.classList.remove('border-primary', 'bg-primary/10', 'text-white');
        b.classList.add('border-border', 'bg-secondary/40', 'text-neutral-400');
      });
 
      // Highlight selected button
      btn.classList.add('border-primary', 'bg-primary/10', 'text-white');
      btn.classList.remove('border-border', 'bg-secondary/40', 'text-neutral-400');
 
      selectedRatio = btn.getAttribute('data-ratio');
      
      // Update canvas wrapper dimensions and hint text
      const dim = dimensions[selectedRatio];
      canvasWrapper.style.width = dim.width;
      canvasWrapper.style.height = dim.height;
      canvasAspectHint.textContent = dim.label;
 
      // Clear visual validation error highlight on selector container if any
      const sizeContainer = document.getElementById('size-selector-container');
      if (sizeContainer) {
        sizeContainer.classList.remove('border-destructive', 'bg-destructive/5');
      }
    });
  });
 
  // Trigger generation
  generateBtn.addEventListener('click', () => {
    if (!modelLoaded) return;
    const prompt = promptInput.value.trim();
    let hasError = false;
 
    // Validate prompt presence
    if (!prompt) {
      promptInput.classList.add('border-destructive');
      promptInput.focus();
      setTimeout(() => promptInput.classList.remove('border-destructive'), 1000);
      hasError = true;
    }
 
    // Enforce selection of aspect ratio before generating
    if (!selectedRatio) {
      const sizeContainer = document.getElementById('size-selector-container');
      if (sizeContainer) {
        sizeContainer.classList.add('border-destructive', 'bg-destructive/5');
        // Visual shake animation effect
        sizeContainer.classList.add('animate-shake');
        setTimeout(() => {
          sizeContainer.classList.remove('animate-shake');
        }, 500);
      }
      hasError = true;
    }
 
    if (hasError) return;
 
    if (activeGenerating) return;
    activeGenerating = true;
 
    // Loading State UI
    generateBtn.disabled = true;
    generateBtn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin mr-2"></i> Generating...';
    
    canvasPlaceholder.classList.add('hidden');
    outputImage.classList.add('hidden');
    canvasLoader.classList.remove('hidden');
    controlsBar.classList.add('hidden');
 
    // Reset progress labels
    loaderPercent.textContent = '0%';
    loaderStatus.textContent = 'Sending request...';
    loaderSub.textContent = 'CONNECTING';
 
    // Emit socket request with ratio parameter
    socket.emit('generate', { prompt, ratio: selectedRatio });
  });
 
  // Listen to WebSocket progress reports
  socket.on('progress', (data) => {
    const { percent, status, sub } = data;
    loaderPercent.textContent = `${percent}%`;
    loaderStatus.textContent = status;
    loaderSub.textContent = sub;
  });
 
  // Listen to success event
  socket.on('success', (data) => {
    outputImage.src = data.url;
    downloadBtn.href = data.url;
 
    outputImage.onload = () => {
      canvasLoader.classList.add('hidden');
      outputImage.classList.remove('hidden');
      controlsBar.classList.remove('hidden');
      
      setTimeout(() => {
        outputImage.style.opacity = '1';
      }, 50);
 
      resetButtonState();
    };
  });
 
  // Listen to error event
  socket.on('error_event', (data) => {
    alert(data.message || 'Generation error');
    resetToInitialState();
  });

  // Listen to Model Download Progress event (Socket Placeholder)
  socket.on('model-download-progress', (data) => {
    const percent = data.percent || 0;
    const status = data.status || 'Downloading model files...';
    const size = data.size || '';
    
    const container = document.getElementById('model-download-container');
    const percentEl = document.getElementById('model-download-percent');
    const barEl = document.getElementById('model-download-bar');
    const statusEl = document.getElementById('model-download-status');
    const sizeEl = document.getElementById('model-size-label');
    const btnIcon = document.getElementById('generate-btn-icon');
    const btnText = document.getElementById('generate-btn-text');
    
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (barEl) barEl.style.width = `${percent}%`;
    if (statusEl) statusEl.textContent = status;
    if (sizeEl && size) sizeEl.textContent = `(${size})`;

    if (percent < 100) {
      modelLoaded = false;
      if (!activeGenerating) {
        generateBtn.disabled = true;
        if (btnIcon) btnIcon.className = 'fa-solid fa-download animate-bounce';
        if (btnText) btnText.textContent = `Downloading Model (${percent}%)...`;
      }
    } else {
      modelLoaded = true;
      if (!activeGenerating) {
        generateBtn.disabled = false;
        if (btnIcon) btnIcon.className = 'fa-solid fa-wand-magic-sparkles mr-2';
        if (btnText) btnText.textContent = 'Generate';
      }
      setTimeout(() => {
        if (statusEl) statusEl.textContent = 'Model loaded and ready locally.';
        const icon = container ? container.querySelector('i') : null;
        if (icon) {
          icon.className = 'fa-solid fa-circle-check text-green-500';
        }
      }, 500);
    }
  });
 
  function resetButtonState() {
    activeGenerating = false;
    if (modelLoaded) {
      generateBtn.disabled = false;
      generateBtn.innerHTML = '<i id="generate-btn-icon" class="fa-solid fa-wand-magic-sparkles mr-2"></i><span id="generate-btn-text">Generate</span>';
    } else {
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<i id="generate-btn-icon" class="fa-solid fa-download animate-bounce mr-2"></i><span id="generate-btn-text">Downloading Model...</span>';
    }
  }
 
  function resetToInitialState() {
    resetButtonState();
    canvasLoader.classList.add('hidden');
    canvasPlaceholder.classList.remove('hidden');
    
    // Clear size selection to enforce it again
    selectedRatio = null;
    sizeBtns.forEach(b => {
      b.classList.remove('border-primary', 'bg-primary/10', 'text-white');
      b.classList.add('border-border', 'bg-secondary/40', 'text-neutral-400');
    });
    canvasWrapper.style.width = '400px';
    canvasWrapper.style.height = '400px';
    canvasAspectHint.textContent = 'Select a size above...';
 
    // Clear presets active state
    presetCards.forEach(c => c.classList.remove('active-preset'));
  }
});
