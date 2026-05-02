// App State
const state = {
  currentView: 'dashboard',
  stats: null,
  projects: [],
  renders: [],
  templates: [],
  pollingInterval: null
};

// DOM Elements
const views = {
  dashboard: document.getElementById('view-dashboard'),
  projects: document.getElementById('view-projects'),
  renders: document.getElementById('view-renders'),
  templates: document.getElementById('view-templates')
};
const viewTitle = document.getElementById('current-view-title');
const navItems = document.querySelectorAll('.nav-item');

// API Methods
const api = {
  async get(endpoint) {
    const res = await fetch(`/api${endpoint}`);
    return res.json();
  },
  async post(endpoint, data) {
    const res = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  async delete(endpoint) {
    const res = await fetch(`/api${endpoint}`, { method: 'DELETE' });
    return res.json();
  }
};

// App Controller
const app = {
  async init() {
    this.setupEventListeners();
    await this.loadTemplates();
    await this.refreshData();
    this.startPolling();
  },

  setupEventListeners() {
    // Navigation
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        this.switchView(item.dataset.view);
      });
    });

    // Modals
    document.getElementById('new-project-btn').addEventListener('click', () => {
      this.openModal('modal-new-project');
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.target.closest('.modal-overlay').classList.remove('active');
      });
    });

    // Forms
    document.getElementById('form-new-project').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      
      // Setup correct width/height based on format
      if (data.format === 'vertical') {
        data.width = 1080;
        data.height = 1920;
      } else {
        data.width = 1920;
        data.height = 1080;
      }
      
      data.duration = parseFloat(data.duration);
      data.fps = parseInt(data.fps);

      await api.post('/projects', data);
      document.getElementById('modal-new-project').classList.remove('active');
      e.target.reset();
      this.refreshData();
      this.switchView('projects');
    });

    document.getElementById('form-render').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      data.fps = parseInt(data.fps || 30);
      
      await api.post('/renders', data);
      document.getElementById('modal-render').classList.remove('active');
      this.refreshData();
      this.switchView('renders');
    });
  },

  switchView(viewName) {
    state.currentView = viewName;
    
    // Update nav classes
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });

    // Update title
    const titles = {
      dashboard: 'Dashboard',
      projects: 'Projects',
      renders: 'Render Queue',
      templates: 'Template Library'
    };
    viewTitle.textContent = titles[viewName];

    // Show/hide views
    Object.entries(views).forEach(([name, el]) => {
      if (name === viewName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    this.renderCurrentView();
  },

  async loadTemplates() {
    state.templates = await api.get('/templates');
    const select = document.getElementById('project-template-select');
    
    state.templates.forEach(t => {
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = t.name;
      select.appendChild(option);
    });
  },

  async refreshData() {
    const [stats, projects, renders] = await Promise.all([
      api.get('/stats'),
      api.get('/projects'),
      api.get('/renders')
    ]);

    state.stats = stats;
    state.projects = projects;
    state.renders = renders;

    this.renderCurrentView();
  },

  startPolling() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    this.pollingInterval = setInterval(async () => {
      // Only poll if we have active renders
      if (state.renders.some(r => r.status === 'rendering' || r.status === 'queued')) {
        state.renders = await api.get('/renders');
        state.stats = await api.get('/stats');
        
        if (state.currentView === 'renders') this.renderRendersView();
        if (state.currentView === 'dashboard') this.renderDashboardView();
      }
    }, 3000);
  },

  renderCurrentView() {
    switch(state.currentView) {
      case 'dashboard': this.renderDashboardView(); break;
      case 'projects': this.renderProjectsView(); break;
      case 'renders': this.renderRendersView(); break;
      case 'templates': this.renderTemplatesView(); break;
    }
  },

  renderDashboardView() {
    // Stats
    if (state.stats) {
      document.getElementById('stats-container').innerHTML = `
        <div class="stat-card">
          <div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
          <div class="stat-content">
            <h3>Total Projects</h3>
            <p>${state.stats.totalProjects}</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
          <div class="stat-content">
            <h3>Completed Videos</h3>
            <p>${state.stats.completedRenders}</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
          <div class="stat-content">
            <h3>Active Renders</h3>
            <p>${state.stats.activeRenders}</p>
          </div>
        </div>
      `;
    }

    // Recent Projects
    const recentProjects = state.projects.slice(0, 4);
    const projContainer = document.getElementById('recent-projects-list');
    
    if (recentProjects.length === 0) {
      projContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted); text-align: center;">No projects yet. Create one to get started!</div>';
    } else {
      projContainer.innerHTML = recentProjects.map(p => `
        <div class="project-card" style="margin-bottom: 12px; display: flex; align-items: center; padding: 12px 16px;">
          <div style="flex-grow: 1;">
            <div style="font-weight: 500; margin-bottom: 4px;">${p.name}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">
              ${p.format} • ${p.duration}s • ${p.fps}fps
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.app.openRenderModal('${p.id}')">Render</button>
        </div>
      `).join('');
    }

    // Active Renders
    const activeRenders = state.renders.filter(r => r.status === 'rendering' || r.status === 'queued').slice(0, 4);
    const renderContainer = document.getElementById('active-renders-list');
    
    if (activeRenders.length === 0) {
      renderContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted); text-align: center;">No active renders.</div>';
    } else {
      renderContainer.innerHTML = activeRenders.map(r => `
        <div style="padding: 16px; border-bottom: 1px solid var(--border-color);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: 500; font-size: 0.9rem;">${r.project_name || 'Unknown Project'}</span>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">${Math.round(r.progress)}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${r.progress}%"></div>
          </div>
        </div>
      `).join('');
    }
  },

  renderProjectsView() {
    const grid = document.getElementById('projects-grid');
    
    if (state.projects.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-muted);">No projects found.</div>';
      return;
    }

    grid.innerHTML = state.projects.map(p => `
      <div class="project-card">
        <div class="card-thumbnail" style="${p.template_id ? 'background-image: url(/api/composition/' + p.template_id + ')' : ''}">
          ${p.format === 'vertical' ? '<svg width="24" height="40" viewBox="0 0 24 40" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="36" rx="2"/></svg>' : '<svg width="40" height="24" viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="36" height="20" rx="2"/></svg>'}
        </div>
        <div class="card-content">
          <h3 class="card-title">${p.name}</h3>
          <div class="card-meta">
            <span class="badge badge-${p.format}">${p.format}</span>
            <span>${p.duration}s</span>
            <span>${p.fps}fps</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-primary w-full" onclick="window.app.openRenderModal('${p.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Render
            </button>
            <button class="btn btn-secondary icon-btn" onclick="window.app.deleteProject('${p.id}')" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderRendersView() {
    const tbody = document.getElementById('renders-table-body');
    
    if (state.renders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">No render history found.</td></tr>';
      return;
    }

    tbody.innerHTML = state.renders.map(r => {
      let actionBtn = '';
      if (r.status === 'done' && r.output_path) {
        actionBtn = `
          <button class="btn btn-primary btn-sm" onclick="window.app.playVideo('${r.output_path}')">
            Play
          </button>
          <a class="btn btn-secondary btn-sm" href="/api/videos/${r.output_path}" download>
            Download
          </a>
        `;
      } else if (r.status === 'error') {
        actionBtn = `<span style="color: var(--accent-error); font-size: 0.8rem;" title="${r.error}">Error Details</span>`;
      }

      return `
        <tr>
          <td style="font-family: monospace; color: var(--text-muted);">${r.id.substring(0,8)}</td>
          <td style="font-weight: 500;">${r.project_name || 'Unknown'}</td>
          <td>${r.format.toUpperCase()}</td>
          <td>${r.quality}</td>
          <td>
            <span class="status status-${r.status}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
          </td>
          <td style="width: 200px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="progress-bar" style="flex-grow: 1;">
                <div class="progress-fill" style="width: ${r.progress}%"></div>
              </div>
              <span style="font-size: 0.8rem; width: 30px; text-align: right;">${Math.round(r.progress)}%</span>
            </div>
          </td>
          <td>
            <div style="display: flex; gap: 8px;">${actionBtn}</div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderTemplatesView() {
    const grid = document.getElementById('templates-grid');
    
    grid.innerHTML = state.templates.map(t => {
      let tagsHtml = '';
      try {
        const tags = JSON.parse(t.tags);
        tagsHtml = tags.map(tag => `<span class="badge" style="background: rgba(255,255,255,0.1); color: var(--text-secondary);">${tag}</span>`).join('');
      } catch(e) {}

      return `
        <div class="template-card">
          <div class="card-thumbnail">
            <span style="font-weight: 600; letter-spacing: 2px;">${t.name.toUpperCase()}</span>
          </div>
          <div class="card-content">
            <h3 class="card-title">${t.name}</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px; height: 40px; overflow: hidden;">${t.description}</p>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px;">
              ${tagsHtml}
            </div>
            <button class="btn btn-secondary w-full" onclick="window.app.createFromTemplate('${t.id}')">
              Use Template
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  openModal(id) {
    document.getElementById(id).classList.add('active');
  },

  openRenderModal(projectId) {
    document.getElementById('render-project-id').value = projectId;
    this.openModal('modal-render');
  },

  createFromTemplate(templateId) {
    const tmpl = state.templates.find(t => t.id === templateId);
    if (!tmpl) return;

    const form = document.getElementById('form-new-project');
    form.elements['name'].value = `${tmpl.name} Copy`;
    form.elements['format'].value = tmpl.format;
    form.elements['duration'].value = tmpl.duration;
    form.elements['template_id'].value = tmpl.id;
    
    this.openModal('modal-new-project');
  },

  async deleteProject(id) {
    if (confirm('Are you sure you want to delete this project?')) {
      await api.delete(`/projects/${id}`);
      this.refreshData();
    }
  },

  playVideo(filename) {
    const video = document.getElementById('preview-video');
    video.src = `/api/videos/${filename}`;
    this.openModal('modal-video');
    
    // Stop video when modal closes
    document.getElementById('modal-video').querySelector('.close-modal').addEventListener('click', () => {
      video.pause();
      video.src = '';
    }, { once: true });
  }
};

// Start App and export globally
window.app = app;
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
