import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(import.meta.dirname, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "studio.json");

// Default DB State
let dbState = {
  projects: [],
  renders: [],
  templates: []
};

// Load DB
if (existsSync(DB_PATH)) {
  try {
    const data = readFileSync(DB_PATH, "utf8");
    dbState = JSON.parse(data);
  } catch (e) {
    console.error("Failed to load JSON database:", e);
  }
} else {
  saveDb();
}

function saveDb() {
  writeFileSync(DB_PATH, JSON.stringify(dbState, null, 2));
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function uid() {
  return randomUUID();
}
function now() {
  return new Date().toISOString();
}

// ── Project CRUD ────────────────────────────────────────────────────────────
export const projects = {
  list: () => [...dbState.projects].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)),

  get: (id) => dbState.projects.find(p => p.id === id),

  create: ({ name, description, format, width, height, duration, fps, template_id }) => {
    const w = format === "vertical" ? 1080 : 1920;
    const h = format === "vertical" ? 1920 : 1080;
    
    const project = {
      id: uid(),
      name,
      description: description || "",
      format: format || "horizontal",
      width: width || w,
      height: height || h,
      duration: duration || 10,
      fps: fps || 30,
      template_id: template_id || null,
      created_at: now(),
      updated_at: now()
    };
    
    dbState.projects.push(project);
    saveDb();
    return project;
  },

  update: (id, fields) => {
    const index = dbState.projects.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    const project = { ...dbState.projects[index] };
    const allowed = ["name", "description", "format", "width", "height", "duration", "fps", "template_id"];
    
    let updated = false;
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k) && project[k] !== v) {
        project[k] = v;
        updated = true;
      }
    }
    
    if (updated) {
      project.updated_at = now();
      dbState.projects[index] = project;
      saveDb();
    }
    
    return project;
  },

  delete: (id) => {
    const initialLength = dbState.projects.length;
    dbState.projects = dbState.projects.filter(p => p.id !== id);
    if (dbState.projects.length !== initialLength) {
      saveDb();
    }
    return { success: true };
  },
};

// ── Render CRUD ─────────────────────────────────────────────────────────────
export const renders = {
  list: () => {
    return dbState.renders.map(r => {
      const proj = projects.get(r.project_id);
      return { ...r, project_name: proj ? proj.name : 'Unknown' };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  get: (id) => {
    const r = dbState.renders.find(r => r.id === id);
    if (!r) return null;
    const proj = projects.get(r.project_id);
    return { ...r, project_name: proj ? proj.name : 'Unknown' };
  },

  create: ({ project_id, quality, fps, format }) => {
    const render = {
      id: uid(),
      project_id,
      status: 'queued',
      progress: 0,
      output_path: null,
      error: null,
      format: format || "mp4",
      quality: quality || "standard",
      fps: fps || 30,
      started_at: null,
      finished_at: null,
      created_at: now()
    };
    dbState.renders.push(render);
    saveDb();
    return render;
  },

  updateStatus: (id, { status, progress, output_path, error }) => {
    const index = dbState.renders.findIndex(r => r.id === id);
    if (index === -1) return null;
    
    const render = { ...dbState.renders[index] };
    let updated = false;
    
    if (status && render.status !== status) {
      render.status = status;
      if (status === 'rendering') render.started_at = now();
      if (status === 'done' || status === 'error') render.finished_at = now();
      updated = true;
    }
    if (progress !== undefined && render.progress !== progress) {
      render.progress = progress;
      updated = true;
    }
    if (output_path && render.output_path !== output_path) {
      render.output_path = output_path;
      updated = true;
    }
    if (error !== undefined && render.error !== error) {
      render.error = error;
      updated = true;
    }
    
    if (updated) {
      dbState.renders[index] = render;
      saveDb();
    }
    
    return render;
  },

  delete: (id) => {
    const initialLength = dbState.renders.length;
    dbState.renders = dbState.renders.filter(r => r.id !== id);
    if (dbState.renders.length !== initialLength) {
      saveDb();
    }
    return { success: true };
  },
};

// ── Template CRUD ───────────────────────────────────────────────────────────
export const templates = {
  list: () => [...dbState.templates].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),

  get: (id) => dbState.templates.find(t => t.id === id),

  upsert: ({ id, name, category, description, thumbnail, html_path, format, width, height, duration, tags }) => {
    const index = dbState.templates.findIndex(t => t.id === id);
    const template = {
      id,
      name,
      category: category || "general",
      description: description || "",
      thumbnail: thumbnail || "",
      html_path,
      format: format || "horizontal",
      width: width || 1920,
      height: height || 1080,
      duration: duration || 10,
      tags: tags || "[]",
      created_at: index >= 0 ? dbState.templates[index].created_at : now()
    };
    
    if (index >= 0) {
      dbState.templates[index] = template;
    } else {
      dbState.templates.push(template);
    }
    
    saveDb();
    return template;
  },
};

// ── Stats ───────────────────────────────────────────────────────────────────
export function getStats() {
  return {
    totalProjects: dbState.projects.length,
    totalRenders: dbState.renders.length,
    completedRenders: dbState.renders.filter(r => r.status === 'done').length,
    activeRenders: dbState.renders.filter(r => r.status === 'rendering').length,
    queuedRenders: dbState.renders.filter(r => r.status === 'queued').length
  };
}
