# 🎨 IdeaForge

**Real-time meeting intelligence & visual ideation.** Voice → Moodboard in seconds.

IdeaForge listens to your meeting (via browser microphone or text input), extracts key concepts, generates images, and builds a live moodboard — all in real-time.

## How It Works

```
🎤 Voice/Text → 🧠 GPT-4o-mini (concepts) → 🎨 DALL-E 3 (images) → 📋 Live Moodboard
```

**Pipeline:**
1. **Listener Agent** — Transcribes audio (Whisper) and extracts concepts, mood, keywords, color palettes (GPT-4o-mini)
2. **Visualizer Agent** — Generates images from concepts (DALL-E 3 + Gemini fallback)
3. **Curator Agent** — Organizes visuals into themed sections (GPT-4o-mini)
4. **Presenter Agent** — Serves a live moodboard with SSE real-time updates

## Quick Start

```bash
# Clone
git clone https://github.com/janseninvest/ideaforge.git
cd ideaforge

# Set API keys
cp .env.example .env
# Edit .env with your keys

# Run (zero npm install needed — pure Node.js)
node scripts/demo-session.cjs "My Project" --auto --port 3333

# Open in browser
open http://localhost:3333
```

## Requirements

- **Node.js 18+** (uses built-in `fetch`)
- **OpenAI API key** — for GPT-4o-mini (concepts) + Whisper (transcription) + DALL-E 3 (images)
- **Gemini API key** _(optional)_ — fallback image generation

No `npm install` required — zero external dependencies.

## Usage

### Browser UI (recommended)
Start the server and open it in your browser:
```bash
node scripts/demo-session.cjs "Meeting Title" --auto --port 3333
```

- 🎤 **Record** — Click the mic button to record from your browser microphone
- 💬 **Type** — Click the chat button to type concepts manually
- ⛶ **Fullscreen** — Press `F` for TV/presentation mode
- The moodboard updates live as concepts are processed

### Programmatic
```javascript
const { DirectorAgent } = require('./src/agents/director-agent.cjs');

const director = new DirectorAgent();
const session = await director.startSession('My Meeting');
// session.serverUrl → http://localhost:3333

await director.processTextInput('Nordic design with warm wood and soft lighting');
// Board updates automatically via SSE

await director.endSession();
```

### Process Audio Files
```bash
node scripts/process-voice.cjs path/to/audio.webm "Session Title"
```

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...          # GPT-4o-mini + Whisper + DALL-E 3

# Optional
GEMINI_API_KEY=AI...           # Fallback image generation (Gemini 2.5 Flash)
PORT=3333                      # Server port (default: 3333)
```

## Architecture

```
src/
├── agents/
│   ├── director-agent.cjs     # Orchestrator — wires all agents together
│   ├── listener-agent.cjs     # Concept extraction (GPT-4o-mini)
│   ├── visualizer-agent.cjs   # Image generation (DALL-E 3 + Gemini)
│   ├── curator-agent.cjs      # Board organization (GPT-4o-mini)
│   └── presenter-agent.cjs    # Board state + server management
├── canvas/
│   ├── server.cjs             # HTTP + SSE server with audio/text endpoints
│   └── public/                # Frontend (vanilla HTML/CSS/JS)
├── data/
│   └── audio-provider.cjs     # Whisper transcription
├── tools/
│   ├── image-generator.cjs    # DALL-E 3 + Gemini image generation
│   ├── palette-generator.cjs  # Color palette extraction
│   └── reference-search.cjs   # Web reference search
└── utils/
    ├── logger.cjs             # Colored console logger
    └── meeting-memory.cjs     # Session transcript storage
```

## Network Access

The server binds to `0.0.0.0` — accessible from any device on the same network. Open `http://<your-ip>:3333` on phones, tablets, or TVs.

**WSL2 users:** You may need to add a port proxy:
```powershell
# Run in Administrator PowerShell
netsh interface portproxy add v4tov4 listenport=3333 listenaddress=0.0.0.0 connectport=3333 connectaddress=$(wsl hostname -I | cut -d' ' -f1)
```

## Language Support

- Input: **Norwegian** and **English** (auto-detected by Whisper)
- Processing: English (all AI calls)
- UI: English

## Built With

- [OpenAI API](https://platform.openai.com/) — GPT-4o-mini, Whisper, DALL-E 3
- [Google Gemini API](https://ai.google.dev/) — Image generation fallback
- Pure Node.js — zero npm dependencies

## License

MIT
