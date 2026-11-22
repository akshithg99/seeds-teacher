// Local static server for trying the web app on this laptop: node serve.mjs, then open http://localhost:8080
// The microphone works on localhost; a phone needs the app on an https address (see README).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".mp3": "audio/mpeg" };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = normalize(join(root, path === "/" ? "index.html" : path));
  // stay inside the app folder
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep) || /[\\/](test|node_modules)[\\/]/.test(file)) { res.writeHead(404).end("Not found"); return; }
  try {
    const type = types[extname(file)] || "application/octet-stream";
    // recordings are long: stream them, and answer range requests so the player can pause, resume and seek
    if (extname(file) === ".mp3") {
      const size = (await stat(file)).size;
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
      const start = m && m[1] ? Number(m[1]) : 0, end = m && m[2] ? Number(m[2]) : size - 1;
      res.writeHead(m ? 206 : 200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, ...(m ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" }).end(body);
  } catch { res.writeHead(404).end("Not found"); }
}).listen(port, "127.0.0.1", () => console.log(`SEEDS Teacher: http://localhost:${port}`));
