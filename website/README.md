# VoidScript website

A static landing page served by a tiny Node server with no dependencies.

## Run it on Wispbyte

1. Create a **Node.js** server on Wispbyte.
2. Upload everything in this `website` folder (`server.js`, `package.json` and the `public` folder) to the server's files.
3. Set the startup file to `server.js`, or the start command to `npm start`.
4. Start it. The server listens on the port Wispbyte gives it (`SERVER_PORT`).

To point your own domain at it, add the domain in Wispbyte's panel and set the DNS record it shows you.

## Run it locally

```bash
node server.js
```

Then open http://localhost:3000.

## Routes

- `/` is the landing page (`public/index.html`).
- `/download` redirects to the newest release's zip on GitHub.
- `/api/release` returns the latest release as JSON (cached for 10 minutes).
