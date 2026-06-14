# Aetheris // Local Image Generator

A minimalistic yet premium dashboard UI for a local image generator built with Node.js, Express, and Tailwind CSS. It is configured to match the styling specifications of the course workspace projects.

## Project Structure
- `server.js`: Node.js Express server with static routes and a mock generation endpoint matching keywords in the prompt to load pre-generated assets deterministically.
- `src/input.css`: Main Tailwind entrypoint containing custom CSS variables and base configuration.
- `public/`:
  - `index.html`: Fully responsive, premium dark dashboard featuring setting sliders, aspect ratio selectors, interactive HUD overlays, preset pills, and a breathing status badge.
  - `script.js`: Client-side logic for form control, preset populating, circular SVG progress reporting, HTTP post-processing, and interactive details loading.
  - `style.css`: Minified, compiled Tailwind stylesheet.
  - `presets/`: Directory containing pre-generated high-quality assets (Cyberpunk Street, Misty Mountains, Astronaut Throne, Cozy Snow Cabin).

## Installation & Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile Tailwind CSS:
   ```bash
   npm run build:css
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. For development with CSS auto-rebuilding:
   ```bash
   npm run dev
   ```

The application will be accessible at [http://localhost:3000](http://localhost:3000).
# qvac-local-image-generation-Case-study-
