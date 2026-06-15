# Local Offline Image Generator

A local-first web application designed to run AI image generation completely offline on consumer hardware.

---

## ℹ️ About the Project

This project provides a clean dark-themed dashboard interface and backend server for running a quantized Stable Diffusion 2.1 model (`SD_V2_1_1B_Q8_0`) locally on your own computer. It allows users to generate high-quality images without external API costs, rate limits, or internet dependencies.

---

## ⚙️ How it Works

The application operates through the following steps:
1. **Model Loading:** During startup, the server downloads and memory-maps the quantized Stable Diffusion model.
2. **WebSocket Connection:** The client UI connects to the Express server using Socket.io to establish a real-time message stream.
3. **Inference Loop:** When a user submits a prompt, the server executes the diffusion denoising process. Denoising steps and progress percentages are streamed live back to the frontend.
4. **In-Memory Delivery:** Once generation is complete, the server serializes the raw image buffer in memory as a Base64 Data URL (bypassing disk storage) and transmits it to the client to render immediately.
5. **CPU Fallback:** If the local GPU encounters shader limitations (such as incompatible older macOS Metal drivers), the backend catches the crash, updates the preference configurations, and automatically runs the model on the CPU instead.

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express, Socket.io, QVAC SDK
- **Frontend:** HTML5, Tailwind CSS, Vanilla JavaScript

---

## 🚀 Getting Started

### 📋 Prerequisites

Ensure you have the following installed:
- **Node.js** (v18 or higher)
- **NPM**

### 📥 Installation & Build

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Compile Tailwind CSS**
   ```bash
   npm run build:css
   ```

3. **Start the Application**
   ```bash
   npm start
   ```

4. **Run in Development Mode (with CSS auto-rebuild)**
   ```bash
   npm run dev
   ```

The application will be accessible locally at [http://localhost:3000](http://localhost:3000).

---

## 📄 License

This project is licensed under the MIT License.
