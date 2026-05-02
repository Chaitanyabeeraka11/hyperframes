import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { projects, renders, templates, getStats } from "./db.js";
import { seedTemplates } from "./seed-templates.js";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const app = new Hono();
const RENDERS_DIR = path.join(import.meta.dirname, "renders");
const COMPOSITIONS_DIR = path.join(import.meta.dirname, "compositions");
if (!existsSync(RENDERS_DIR)) mkdirSync(RENDERS_DIR, { recursive: true });
if (!existsSync(COMPOSITIONS_DIR)) mkdirSync(COMPOSITIONS_DIR, { recursive: true });

// ── Seed templates on first run ─────────────────────────────────────────────
seedTemplates();

// ── API Routes ──────────────────────────────────────────────────────────────
const api = new Hono();

// Stats
api.get("/stats", (c) => c.json(getStats()));

// Projects
api.get("/projects", (c) => c.json(projects.list()));
api.get("/projects/:id", (c) => {
  const p = projects.get(c.req.param("id"));
  return p ? c.json(p) : c.json({ error: "Not found" }, 404);
});
api.post("/projects", async (c) => {
  const body = await c.req.json();
  return c.json(projects.create(body), 201);
});
api.put("/projects/:id", async (c) => {
  const body = await c.req.json();
  return c.json(projects.update(c.req.param("id"), body));
});
api.delete("/projects/:id", (c) => c.json(projects.delete(c.req.param("id"))));

// Templates
api.get("/templates", (c) => c.json(templates.list()));
api.get("/templates/:id", (c) => {
  const t = templates.get(c.req.param("id"));
  return t ? c.json(t) : c.json({ error: "Not found" }, 404);
});

// Renders
api.get("/renders", (c) => c.json(renders.list()));
api.get("/renders/:id", (c) => {
  const r = renders.get(c.req.param("id"));
  return r ? c.json(r) : c.json({ error: "Not found" }, 404);
});
api.post("/renders", async (c) => {
  const body = await c.req.json();
  const render = renders.create(body);
  startRenderJob(render);
  return c.json(render, 201);
});
api.delete("/renders/:id", (c) => c.json(renders.delete(c.req.param("id"))));

// Serve rendered videos
api.get("/videos/:filename", (c) => {
  const fp = path.join(RENDERS_DIR, c.req.param("filename"));
  if (!existsSync(fp)) return c.json({ error: "Not found" }, 404);
  const buf = readFileSync(fp);
  return new Response(buf, { headers: { "Content-Type": "video/mp4", "Content-Length": buf.length.toString() } });
});

// Composition HTML preview
api.get("/composition/:id", (c) => {
  const tmpl = templates.get(c.req.param("id"));
  if (!tmpl) return c.json({ error: "Not found" }, 404);
  const fp = path.resolve(import.meta.dirname, tmpl.html_path);
  if (!existsSync(fp)) return c.json({ error: "File not found" }, 404);
  const html = readFileSync(fp, "utf-8");
  return new Response(html, { headers: { "Content-Type": "text/html" } });
});

app.route("/api", api);

// ── Static files ────────────────────────────────────────────────────────────
app.use("/*", serveStatic({ root: "./public" }));

// ── Render Job Runner ───────────────────────────────────────────────────────
function startRenderJob(render) {
  const project = projects.get(render.project_id);
  if (!project) {
    renders.updateStatus(render.id, { status: "error", error: "Project not found" });
    return;
  }

  const tmpl = project.template_id ? templates.get(project.template_id) : null;
  if (!tmpl) {
    renders.updateStatus(render.id, { status: "error", error: "No template assigned to project" });
    return;
  }

  const compositionPath = path.resolve(import.meta.dirname, tmpl.html_path);
  if (!existsSync(compositionPath)) {
    renders.updateStatus(render.id, { status: "error", error: `Composition not found: ${compositionPath}` });
    return;
  }

  const outputFile = path.join(RENDERS_DIR, `${render.id}.mp4`);
  renders.updateStatus(render.id, { status: "rendering", progress: 0 });

  // Use npx hyperframes render
  const cliPath = path.resolve(import.meta.dirname, "..", "packages", "cli", "src", "cli.ts");
  const args = [
    "tsx", cliPath, "render",
    compositionPath,
    "--output", outputFile,
    "--fps", String(project.fps || 30),
    "--quality", render.quality || "standard",
  ];

  console.log(`[render] Starting: ${args.join(" ")}`);
  const child = spawn("npx", ["tsx", cliPath, "render", compositionPath, "--output", outputFile], {
    cwd: path.resolve(import.meta.dirname, ".."),
    shell: true,
    env: { ...process.env, NODE_ENV: "production" },
  });

  let progressTimer = setInterval(() => {
    const current = renders.get(render.id);
    if (current && current.status === "rendering" && current.progress < 90) {
      renders.updateStatus(render.id, { progress: Math.min(current.progress + 5, 90) });
    }
  }, 3000);

  child.stdout?.on("data", (d) => console.log(`[render:${render.id}] ${d}`));
  child.stderr?.on("data", (d) => console.error(`[render:${render.id}] ${d}`));

  child.on("close", (code) => {
    clearInterval(progressTimer);
    if (code === 0 && existsSync(outputFile)) {
      renders.updateStatus(render.id, { status: "done", progress: 100, output_path: `${render.id}.mp4` });
      console.log(`[render] Done: ${render.id}`);
    } else {
      renders.updateStatus(render.id, { status: "error", error: `Process exited with code ${code}` });
      console.error(`[render] Failed: ${render.id}`);
    }
  });

  child.on("error", (err) => {
    clearInterval(progressTimer);
    renders.updateStatus(render.id, { status: "error", error: err.message });
  });
}

// ── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3333;
serve({ fetch: app.fetch, port: Number(PORT) }, () => {
  console.log(`\n  🎬 HyperFrames Video Studio`);
  console.log(`  → http://localhost:${PORT}\n`);
});
