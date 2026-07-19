# Ollama Gateway test frontend

Simple Next.js and Tailwind CSS console for the Ollama Gateway API.

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The browser calls `/api/gateway`, a Next.js server-side proxy to `http://152.42.253.49/api/v1`. This avoids browser CORS problems for JWT-authenticated streaming requests.

The Next.js proxy means the browser does not require backend CORS for normal use. If you call the backend directly from another frontend, keep its origin on the VPS allow-list:

```env
ALLOWED_ORIGINS=["http://localhost:3000"]
```

After changing it, deploy the backend setting with `docker compose up -d`.
