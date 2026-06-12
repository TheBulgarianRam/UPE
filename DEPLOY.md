# UPE — Deployment Guide (both demo modes)

You have two pieces:
- **Frontend** (`upe-deploy/`) → static site → **Netlify** or **Vercel**
- **Backend** (`upe-backend/`) → Python + YOLO container → **Render** or **Railway**

Netlify cannot host the backend (no persistent Python/PyTorch process). So:

| Demo mode | Frontend | Backend | Live YOLO works? |
|-----------|----------|---------|------------------|
| **A. Local (pitch in the room)** | `npm run dev` on your laptop | `uvicorn` on your laptop | ✅ yes (http→ws allowed) |
| **B. Fully hosted (send a link)** | Netlify | Render/Railway (wss://) | ✅ yes (https→wss allowed) |
| Netlify only (no backend) | Netlify | none | ❌ Live module shows DISCONNECTED; mock modules all work |

---

## MODE A — Local demo (most reliable for a live pitch)

**Terminal 1 — backend**
```bash
cd upe-backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt                       # one-time; downloads torch + yolov8n.pt
uvicorn main:app --port 8000
# webcam instead of the sample clip:  UPE_SOURCE=0 uvicorn main:app --port 8000
```

**Terminal 2 — frontend**
```bash
cd upe-deploy
npm install
npm run dev          # http://localhost:5173
```

Open `http://localhost:5173`, sidebar → **Live Perception (YOLO)**. Because the page
is plain `http://localhost`, the browser allows the `ws://localhost:8000` connection.
The HUD badge should flip to **LIVE · CONNECTED** and show `YOLO LIVE · yolov8n.pt`.

---

## MODE B — Fully hosted (shareable link)

### Step 1 — deploy the backend to Render (gives you a wss:// URL)
1. Push `upe-backend/` to its own GitHub repo.
2. Go to https://dashboard.render.com → **New → Web Service** → connect the repo.
3. Render detects `render.yaml` (Docker). Confirm: runtime **Docker**, plan **Starter**
   (the free tier OOMs — torch needs ~1GB).
4. Deploy. You'll get `https://upe-backend-xxxx.onrender.com`.
5. Test it: open that URL in a browser → should return JSON with
   `"backend": "yolo:yolov8n.pt"`. Your WebSocket URL is the same host with
   `wss://` and the path: `wss://upe-backend-xxxx.onrender.com/ws/perception`.

> Railway is equivalent: New Project → Deploy from repo → it uses the Dockerfile →
> generate a domain → use `wss://<domain>/ws/perception`.

### Step 2 — deploy the frontend to Netlify
1. Push `upe-deploy/` to a GitHub repo.
2. https://app.netlify.com → **Add new site → Import from Git** → pick the repo.
3. Build command `npm run build`, publish dir `dist` (the included `netlify.toml`
   sets this already).
4. **Site settings → Environment variables → add:**
   `VITE_UPE_WS = wss://upe-backend-xxxx.onrender.com/ws/perception`
5. Trigger a deploy. You get `https://your-site.netlify.app`.

Now the hosted frontend talks to the hosted backend over secure `wss://` — no
mixed-content block. You can also paste a different backend URL into the
**Backend** box in the Live module at runtime and hit Connect.

### Quick alternative — Netlify Drop (no Git)
```bash
cd upe-deploy
echo "VITE_UPE_WS=wss://upe-backend-xxxx.onrender.com/ws/perception" > .env
npm install && npm run build
# drag the dist/ folder onto https://app.netlify.com/drop
```

---

## Notes & gotchas
- **Performance:** CPU inference on a small cloud box is a few FPS. The Docker image
  sets `UPE_FPS=10`, `UPE_WIDTH=512` to keep it smooth. For higher FPS use a GPU host.
- **Render free tier sleeps:** the service spins down when idle; first connection after
  idle takes ~30–60s to wake. Fine for a demo, mention it if it lags on first load.
- **Mixed content:** an HTTPS site can only reach a `wss://` (not `ws://`) backend. The
  Live module warns you if you try `ws://` from an HTTPS page.
- **Weights:** the Dockerfile bakes `yolov8n.pt` into the image so there's no cold-start
  download. Locally it downloads once on first run.
- **CORS / WS:** the backend already allows all origins (fine for a demo; tighten for prod).
