import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { runModelAssessment } from "./src/modelAdapters.js";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const target = pathname === "/" ? "/index.html" : pathname;
  const normalized = normalize(target).replace(/^(\.\.[/\\])+/, "");
  return join(root, normalized);
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${port}`);
  try {
    if (req.method === "POST" && url.pathname === "/api/analyze") {
      const input = await readJsonBody(req);
      const result = await runModelAssessment(input);
      sendJson(res, 200, result);
      return;
    }

    const filePath = resolvePath(req.url || "/");
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": types[extname(filePath)] || "application/octet-stream"
    });
    res.end(data);
  } catch (error) {
    if (url.pathname === "/api/analyze") {
      sendJson(res, error.statusCode || 500, {
        error: error.message || "Model assessment failed"
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, host, () => {
  console.log(`CohortAI prototype running at http://localhost:${port}`);
});
