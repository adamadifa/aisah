import express from 'express';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { whatsappBot } from './whatsapp.js';
import { ragEngine } from './ragEngine.js';
import { aiService } from './aiService.js';

export function createServer() {
  const app = express();

  app.use(express.json());

  // 1. Status API
  app.get('/api/status', (req, res) => {
    res.json({
      campusName: config.campusName,
      botName: config.botName,
      aiProvider: config.aiProvider,
      geminiConfigured: !!config.gemini.apiKey,
      groqConfigured: !!config.groq.apiKey,
      geminiModel: config.gemini.model,
      groqModel: config.groq.model,
      whatsapp: {
        status: whatsappBot.status,
        qrCodeDataUrl: whatsappBot.qrCodeDataUrl,
        userInfo: whatsappBot.userInfo,
        safeMode: config.whatsapp.requireStartCommand,
        startCommand: config.whatsapp.startCommand,
        stopCommand: config.whatsapp.stopCommand,
        activeSessionsCount: whatsappBot.activeSessions?.size || 0,
      },
      documents: {
        totalChunks: ragEngine.chunks.length,
        files: [...new Set(ragEngine.chunks.map((c) => c.filename))],
      },
    });
  });

  // 2. Chat Simulation API
  app.post('/api/test-chat', async (req, res) => {
    try {
      const { message, sessionId = 'web-tester' } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
      }

      const result = await aiService.generateReply(sessionId, message.trim());
      res.json({
        success: true,
        reply: result.reply,
        provider: result.provider,
        contextRetrieved: result.contextRetrieved,
      });
    } catch (err) {
      console.error('[Server] Error di test-chat:', err);
      res.status(500).json({ error: err.message || 'Terjadi kesalahan pada AI Service.' });
    }
  });

  // 3. Reset Session History untuk Simulator
  app.post('/api/clear-session', (req, res) => {
    const { sessionId = 'web-tester' } = req.body;
    aiService.clearSession(sessionId);
    res.json({ success: true, message: 'Riwayat percakapan berhasil direset.' });
  });

  // 4. Reload Knowledge Base Dokumen (.md / .docx)
  app.post('/api/reload-docs', async (req, res) => {
    try {
      const count = await ragEngine.reload();
      res.json({ success: true, message: `Berhasil memuat ulang ${count} potongan informasi.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Restart / Logout WhatsApp
  app.post('/api/restart-wa', async (req, res) => {
    try {
      await whatsappBot.start();
      res.json({ success: true, message: 'Proses koneksi WhatsApp dimulai ulang.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Get Documents List with details
  app.get('/api/documents', (req, res) => {
    try {
      const docsDir = config.paths.documents;
      if (!fs.existsSync(docsDir)) {
        return res.json({ documents: [] });
      }
      const files = fs.readdirSync(docsDir);
      const list = files
        .filter(f => !f.startsWith('.'))
        .map(file => {
          const fullPath = path.join(docsDir, file);
          const stat = fs.statSync(fullPath);
          const chunks = ragEngine.chunks.filter(c => c.filename === file);
          const sections = [...new Set(chunks.map(c => c.section))];
          return {
            filename: file,
            sizeBytes: stat.size,
            updatedAt: stat.mtime,
            chunksCount: chunks.length,
            sections: sections
          };
        });
      res.json({ documents: list });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Get Document Content for Preview
  app.get('/api/document-content', (req, res) => {
    try {
      const { file } = req.query;
      if (!file) return res.status(400).json({ error: 'Nama file diperlukan.' });
      
      const safeFilename = path.basename(file);
      const fullPath = path.join(config.paths.documents, safeFilename);
      
      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'File tidak ditemukan.' });
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      res.json({ filename: safeFilename, content });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Test RAG Search without LLM invocation
  app.post('/api/test-rag', (req, res) => {
    try {
      const { query } = req.body;
      if (!query || !query.trim()) {
        return res.status(400).json({ error: 'Query tidak boleh kosong.' });
      }
      const results = ragEngine.search(query.trim(), [], 5);
      res.json({
        query,
        count: results.length,
        results: results.map(r => ({
          filename: r.filename,
          section: r.section,
          score: r.score,
          content: r.content
        }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Web Page Routes
  app.get('/', (req, res) => res.send(renderDashboardHtml('chat')));
  app.get('/chat', (req, res) => res.send(renderDashboardHtml('chat')));
  app.get('/whatsapp', (req, res) => res.send(renderDashboardHtml('whatsapp')));
  app.get('/knowledge', (req, res) => res.send(renderDashboardHtml('knowledge')));

  return app;
}

function renderDashboardHtml(initialTab = 'chat') {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aisah - AI Assistant SPMB Pesantren Al-Amin</title>
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  
  <!-- Tabler Icons CSS -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.2.0/dist/tabler-icons.min.css">
  
  <style>
    :root {
      /* Institutional Emerald & Slate Theme (Light Mode) */
      --primary: #059669;
      --primary-hover: #047857;
      --primary-active: #065f46;
      --primary-light: #10b981;
      --primary-subtle: #ecfdf5;
      --primary-border: #a7f3d0;
      
      --bg: #f8fafc;
      --bg-surface: #ffffff;
      --bg-subtle: #f1f5f9;
      --bg-muted: #e2e8f0;
      
      --border: #e2e8f0;
      --border-subtle: #edf2f7;
      --border-focus: #10b981;
      
      --text: #0f172a;
      --text-body: #334155;
      --text-muted: #64748b;
      --text-dim: #94a3b8;
      
      --success: #10b981;
      --success-bg: #ecfdf5;
      --warning: #f59e0b;
      --warning-bg: #fffbeb;
      --danger: #ef4444;
      --danger-bg: #fef2f2;
      
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
      --shadow-md: 0 4px 12px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04);
      --shadow-lg: 0 10px 25px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03);
      
      --font: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
      
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --radius-full: 9999px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      background-image: 
        radial-gradient(circle at 10% 10%, rgba(5, 150, 105, 0.03) 0%, transparent 40%),
        radial-gradient(circle at 90% 90%, rgba(2, 132, 199, 0.03) 0%, transparent 40%);
    }

    /* Top Navigation Header */
    header {
      background: rgba(255, 255, 255, 0.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 100;
      padding: 12px 28px;
    }
    .header-inner {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 14px;
      text-decoration: none;
      color: inherit;
    }
    .brand-emblem {
      width: 42px;
      height: 42px;
      border-radius: var(--radius-md);
      background: linear-gradient(135deg, #059669, #047857);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      color: #ffffff;
      box-shadow: 0 4px 10px rgba(5, 150, 105, 0.2);
    }
    .brand-text h1 {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-tag {
      font-size: 0.68rem;
      font-weight: 700;
      background: var(--primary-subtle);
      color: var(--primary);
      border: 1px solid var(--primary-border);
      padding: 1px 7px;
      border-radius: var(--radius-full);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .brand-subtitle {
      font-size: 0.78rem;
      color: var(--text-muted);
      white-space: nowrap;
    }

    /* Segmented Tab Navigation */
    .nav-tabs {
      display: flex;
      align-items: center;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      padding: 4px;
      gap: 4px;
    }
    .nav-tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      border-radius: var(--radius-full);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      border: none;
      background: transparent;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .nav-tab-btn i {
      font-size: 1.15rem;
    }
    .nav-tab-btn:hover {
      color: var(--text);
      background: rgba(255, 255, 255, 0.6);
    }
    .nav-tab-btn.active {
      background: #ffffff;
      color: var(--primary);
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    }
    .tab-badge {
      font-size: 0.72rem;
      font-weight: 700;
      padding: 1px 7px;
      border-radius: var(--radius-full);
      background: var(--bg-muted);
      color: var(--text-muted);
    }
    .nav-tab-btn.active .tab-badge {
      background: var(--primary-subtle);
      color: var(--primary);
    }

    /* Header Right Indicators */
    .header-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: var(--radius-full);
      font-size: 0.78rem;
      font-weight: 600;
      background: #ffffff;
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
      color: var(--text-body);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-dot.connected {
      background: var(--success);
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
    }
    .status-dot.waiting {
      background: var(--warning);
      box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
      animation: pulse 1.6s infinite;
    }
    .status-dot.disconnected {
      background: var(--danger);
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }

    /* Main Container */
    main {
      flex: 1;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      padding: 24px 28px;
      display: flex;
      flex-direction: column;
    }

    /* Tab Panes */
    .tab-pane {
      display: none;
      animation: fadeIn 0.2s ease-out;
      flex: 1;
    }
    .tab-pane.active {
      display: flex;
      flex-direction: column;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Cards */
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: var(--shadow-sm);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    .card-title {
      font-size: 1rem;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card-title i {
      font-size: 1.25rem;
      color: var(--primary);
    }
    .card-subtitle {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 3px;
      font-weight: 400;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 9px 18px;
      border-radius: var(--radius-sm);
      font-size: 0.86rem;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.18s ease;
      text-decoration: none;
      white-space: nowrap;
    }
    .btn i {
      font-size: 1.15rem;
    }
    .btn-primary {
      background: var(--primary);
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(5, 150, 105, 0.2);
    }
    .btn-primary:hover {
      background: var(--primary-hover);
      box-shadow: 0 4px 10px rgba(5, 150, 105, 0.3);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: #ffffff;
      color: var(--text-body);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
    }
    .btn-secondary:hover {
      background: var(--bg-subtle);
      border-color: #cbd5e1;
      color: var(--text);
    }
    .btn-sm {
      padding: 6px 13px;
      font-size: 0.78rem;
    }
    .btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      transform: none !important;
    }

    /* ============================================================
       TAB 1: LIVE CHAT SIMULATOR (LIGHT MODE)
       ============================================================ */
    .chat-layout {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 24px;
      flex: 1;
      min-height: 720px;
    }
    @media (max-width: 1080px) {
      .chat-layout {
        grid-template-columns: 1fr;
      }
      .chat-sidebar {
        display: none;
      }
    }

    .chat-main-card {
      display: flex;
      flex-direction: column;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
      box-shadow: var(--shadow-md);
    }

    .chat-header-bar {
      padding: 18px 24px;
      background: #ffffff;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .chat-header-profile {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .chat-avatar-lg {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: var(--primary-subtle);
      border: 1px solid var(--primary-border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      color: var(--primary);
    }
    .chat-header-name {
      font-size: 0.98rem;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .verified-icon {
      color: var(--primary);
      font-size: 1rem;
    }
    .chat-header-sub {
      font-size: 0.78rem;
      color: var(--text-muted);
    }

    /* Message stream */
    .chat-stream {
      flex: 1;
      overflow-y: auto;
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      background-color: #f8fafc;
    }

    .msg-group {
      display: flex;
      gap: 12px;
      max-width: 82%;
    }
    .msg-group.assistant {
      align-self: flex-start;
    }
    .msg-group.user {
      align-self: flex-end;
      flex-direction: row-reverse;
    }
    .msg-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .msg-group.assistant .msg-avatar {
      background: var(--primary-subtle);
      color: var(--primary);
      border: 1px solid var(--primary-border);
    }
    .msg-group.user .msg-avatar {
      background: #e2e8f0;
      color: #334155;
    }

    .msg-bubble {
      padding: 16px 20px;
      border-radius: var(--radius-lg);
      font-size: 0.92rem;
      line-height: 1.65;
      position: relative;
    }
    .msg-group.assistant .msg-bubble {
      background: #ffffff;
      border: 1px solid var(--border);
      color: var(--text-body);
      border-top-left-radius: 4px;
      box-shadow: var(--shadow-sm);
    }
    .msg-group.user .msg-bubble {
      background: var(--primary);
      color: #ffffff;
      border-top-right-radius: 4px;
      box-shadow: 0 4px 10px rgba(5, 150, 105, 0.2);
    }

    .msg-bubble p {
      margin-bottom: 10px;
    }
    .msg-bubble p:last-child {
      margin-bottom: 0;
    }
    .msg-bubble ul, .msg-bubble ol {
      margin-left: 20px;
      margin-bottom: 10px;
    }
    .msg-group.assistant .msg-bubble strong {
      color: var(--text);
      font-weight: 700;
    }
    .msg-group.user .msg-bubble strong {
      color: #ffffff;
      font-weight: 700;
    }

    .msg-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 8px;
      font-size: 0.72rem;
      color: var(--text-dim);
    }
    .msg-copy-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 0.72rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 4px;
      transition: all 0.15s;
    }
    .msg-copy-btn:hover {
      color: var(--primary);
      background: var(--primary-subtle);
    }

    /* Quick Prompt Chips */
    .quick-chips-wrapper {
      padding: 12px 24px;
      background: #ffffff;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 10px;
      overflow-x: auto;
    }
    .quick-chips-label {
      font-size: 0.76rem;
      color: var(--text-muted);
      font-weight: 600;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .quick-chip {
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-full);
      color: var(--text-body);
      padding: 6px 14px;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.18s ease;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .quick-chip i {
      font-size: 1rem;
      color: var(--primary);
    }
    .quick-chip:hover {
      background: var(--primary-subtle);
      border-color: var(--primary-border);
      color: var(--primary);
      transform: translateY(-1px);
    }

    /* Chat Composer Input */
    .chat-composer {
      padding: 18px 24px;
      background: #ffffff;
      border-top: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .chat-input-wrapper {
      flex: 1;
      position: relative;
    }
    .chat-input-box {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 13px 18px;
      color: var(--text);
      font-size: 0.92rem;
      font-family: inherit;
      outline: none;
      transition: all 0.2s ease;
    }
    .chat-input-box:focus {
      border-color: var(--primary-light);
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    }
    .chat-input-box::placeholder {
      color: var(--text-dim);
    }
    .chat-note {
      font-size: 0.74rem;
      color: var(--text-muted);
      padding: 6px 24px 10px;
      background: #ffffff;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    /* Chat Right Sidebar */
    .chat-sidebar {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .sidebar-widget {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--shadow-sm);
    }
    .widget-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .widget-title i {
      font-size: 1.15rem;
      color: var(--primary);
    }
    .prop-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 0;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.82rem;
    }
    .prop-row:last-child {
      border-bottom: none;
    }
    .prop-label {
      color: var(--text-muted);
    }
    .prop-val {
      font-weight: 600;
      color: var(--text);
    }

    /* ============================================================
       TAB 2: WHATSAPP STATUS (LIGHT MODE)
       ============================================================ */
    .wa-view-grid {
      display: grid;
      grid-template-columns: 460px 1fr;
      gap: 24px;
    }
    @media (max-width: 980px) {
      .wa-view-grid {
        grid-template-columns: 1fr;
      }
    }

    .qr-card-center {
      text-align: center;
      padding: 24px 16px;
    }
    .qr-white-frame {
      background: #ffffff;
      padding: 16px;
      border-radius: var(--radius-lg);
      display: inline-block;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      border: 1px solid var(--border);
      margin: 16px 0;
    }
    .qr-white-frame img {
      display: block;
      width: 230px;
      height: 230px;
    }
    .qr-guide-steps {
      text-align: left;
      margin-top: 18px;
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
    }
    .guide-step-item {
      display: flex;
      gap: 12px;
      font-size: 0.84rem;
      color: var(--text-body);
      margin-bottom: 10px;
      line-height: 1.4;
    }
    .guide-step-item:last-child {
      margin-bottom: 0;
    }
    .step-number {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--primary-subtle);
      color: var(--primary);
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      flex-shrink: 0;
    }

    .connected-profile-card {
      background: var(--primary-subtle);
      border: 1px solid var(--primary-border);
      border-radius: var(--radius-lg);
      padding: 24px;
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 24px;
    }
    .wa-device-avatar {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: var(--primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
    }

    .safe-mode-callout {
      background: var(--primary-subtle);
      border: 1px solid var(--primary-border);
      border-radius: var(--radius-md);
      padding: 18px;
      margin-top: 20px;
    }
    .safe-mode-title {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--primary-hover);
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .safe-mode-title i {
      font-size: 1.25rem;
    }
    .safe-mode-desc {
      font-size: 0.84rem;
      color: var(--text-body);
      line-height: 1.6;
    }

    /* ============================================================
       TAB 3: KNOWLEDGE BASE (LIGHT MODE)
       ============================================================ */
    .kb-view-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .kb-metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 18px;
    }
    .metric-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: var(--shadow-sm);
    }
    .metric-icon-box {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
      background: var(--primary-subtle);
      border: 1px solid var(--primary-border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: var(--primary);
    }
    .metric-num {
      font-size: 1.45rem;
      font-weight: 800;
      color: var(--text);
      line-height: 1.1;
    }
    .metric-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 3px;
    }

    /* Documents Table */
    .docs-table-wrapper {
      overflow-x: auto;
    }
    table.docs-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;
    }
    table.docs-table th {
      padding: 12px 18px;
      background: var(--bg-subtle);
      border-bottom: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 700;
    }
    table.docs-table td {
      padding: 16px 18px;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-body);
    }
    table.docs-table tr:hover td {
      background: #f8fafc;
    }
    .doc-name-cell {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      color: var(--text);
    }
    .doc-icon {
      color: var(--primary);
      font-size: 1.25rem;
    }

    /* Interactive RAG Tester */
    .rag-tester-box {
      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      margin-top: 8px;
    }
    .rag-search-bar {
      display: flex;
      gap: 12px;
      margin-top: 14px;
      margin-bottom: 20px;
    }
    .rag-search-input {
      flex: 1;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 18px;
      color: var(--text);
      font-family: inherit;
      font-size: 0.92rem;
      outline: none;
    }
    .rag-search-input:focus {
      border-color: var(--primary-light);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    }
    .rag-results-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 480px;
      overflow-y: auto;
    }
    .rag-result-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 16px;
      box-shadow: var(--shadow-sm);
    }
    .rag-result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .rag-result-title {
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--primary-hover);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rag-score-pill {
      font-size: 0.74rem;
      padding: 2px 8px;
      border-radius: var(--radius-full);
      background: var(--primary-subtle);
      color: var(--primary);
      font-family: var(--font-mono);
      font-weight: 700;
      border: 1px solid var(--primary-border);
    }
    .rag-result-content {
      font-size: 0.84rem;
      color: var(--text-body);
      line-height: 1.55;
      white-space: pre-line;
      max-height: 130px;
      overflow-y: auto;
      background: var(--bg);
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
    }

    /* Modal for Document Preview */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.5);
      backdrop-filter: blur(4px);
      z-index: 200;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .modal-overlay.open {
      display: flex;
    }
    .modal-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 860px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: var(--shadow-lg);
    }
    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .modal-title i {
      color: var(--primary);
    }
    .modal-close-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 1.4rem;
      cursor: pointer;
      line-height: 1;
      padding: 4px;
      border-radius: 4px;
    }
    .modal-close-btn:hover {
      color: var(--text);
      background: var(--bg-subtle);
    }
    .modal-body {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
      font-family: var(--font-mono);
      font-size: 0.86rem;
      line-height: 1.65;
      color: var(--text-body);
      white-space: pre-wrap;
      background: #f8fafc;
    }

    /* Toast Notification */
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 300;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      background: #ffffff;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 12px 20px;
      border-radius: var(--radius-md);
      font-size: 0.86rem;
      font-weight: 600;
      box-shadow: var(--shadow-lg);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideIn 0.2s ease-out;
    }
    .toast i {
      font-size: 1.25rem;
      color: var(--primary);
    }
    @keyframes slideIn {
      from { transform: translateX(30px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  </style>
</head>
<body>

  <!-- Top Header Navigation -->
  <header>
    <div class="header-inner">
      <div class="brand-section">
        <div class="brand-emblem">
          <i class="ti ti-school"></i>
        </div>
        <div class="brand-text">
          <h1>
            Aisah SPMB
            <span class="brand-tag">AI CS</span>
          </h1>
          <div class="brand-subtitle" id="topCampusName">Pesantren Persatuan Islam 80 Al Amin</div>
        </div>
      </div>

      <!-- Segmented Navigation Tabs -->
      <nav class="nav-tabs" aria-label="Navigasi Halaman">
        <button type="button" class="nav-tab-btn ${initialTab === 'chat' ? 'active' : ''}" data-tab="chat" onclick="switchTab('chat')">
          <i class="ti ti-messages"></i>
          <span>Live Chat</span>
        </button>
        <button type="button" class="nav-tab-btn ${initialTab === 'whatsapp' ? 'active' : ''}" data-tab="whatsapp" onclick="switchTab('whatsapp')">
          <i class="ti ti-brand-whatsapp"></i>
          <span>Status WhatsApp</span>
          <span class="status-dot disconnected" id="navWaDot" style="margin-left: 2px;"></span>
        </button>
        <button type="button" class="nav-tab-btn ${initialTab === 'knowledge' ? 'active' : ''}" data-tab="knowledge" onclick="switchTab('knowledge')">
          <i class="ti ti-book-2"></i>
          <span>Knowledge Base</span>
          <span class="tab-badge" id="navDocsCount">0</span>
        </button>
      </nav>

      <!-- Global Status Pill -->
      <div class="header-meta">
        <div class="status-pill" id="globalStatusPill">
          <span class="status-dot disconnected" id="topWaDot"></span>
          <span id="topWaStatusText">Memeriksa...</span>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content Area -->
  <main>
    <!-- ============================================================
         PANE 1: LIVE CHAT SIMULATOR (LIGHT MODE)
         ============================================================ -->
    <section id="pane-chat" class="tab-pane ${initialTab === 'chat' ? 'active' : ''}">
      <div class="chat-layout">
        <!-- Main Chat Card -->
        <div class="chat-main-card">
          <!-- Chat Header -->
          <div class="chat-header-bar">
            <div class="chat-header-profile">
              <div class="chat-avatar-lg">
                <i class="ti ti-message-chatbot"></i>
              </div>
              <div>
                <div class="chat-header-name">
                  <span>Aisah CS SPMB</span>
                  <i class="ti ti-circle-check-filled verified-icon" title="AI Assistant Resmi"></i>
                </div>
                <div class="chat-header-sub" id="chatEngineSubtitle">
                  AI Dual Engine • Auto Fallback
                </div>
              </div>
            </div>
            <div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="clearChat()">
                <i class="ti ti-trash"></i>
                <span>Reset Obrolan</span>
              </button>
            </div>
          </div>

          <!-- Messages Stream -->
          <div class="chat-stream" id="chatMessages">
            <!-- Assistant Greeting -->
            <div class="msg-group assistant">
              <div class="msg-avatar">
                <i class="ti ti-message-chatbot"></i>
              </div>
              <div class="msg-bubble">
                <p><strong>Bismillahirrahmanirrahim.</strong></p>
                <p>Assalamu'alaikum Warahmatullahi Wabarakatuh. Selamat datang di Layanan Informasi SPMB Pesantren Persatuan Islam 80 Al Amin.</p>
                <p>Saya <strong>Aisah</strong>, asisten AI Customer Service SPMB. Ada yang bisa Aisah bantu terkait syarat pendaftaran, rincian biaya pendidikan (TK, SDIT, MTs, MA), asrama santri, atau alur tes seleksi?</p>
                <div class="msg-meta">
                  <span>Aisah AI • Layanan Resmi</span>
                  <button type="button" class="msg-copy-btn" onclick="copyText(this)">
                    <i class="ti ti-copy"></i> Salin
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Questions Chips -->
          <div class="quick-chips-wrapper">
            <span class="quick-chips-label">
              <i class="ti ti-sparkles"></i> Pintasan:
            </span>
            <button type="button" class="quick-chip" onclick="sendQuick('Berapa rincian biaya masuk SDIT Al-Amin?')">
              <i class="ti ti-coin"></i> Biaya SDIT
            </button>
            <button type="button" class="quick-chip" onclick="sendQuick('Berapa biaya masuk dan bulanan asrama santri?')">
              <i class="ti ti-building-bank"></i> Biaya Asrama
            </button>
            <button type="button" class="quick-chip" onclick="sendQuick('Kapan jadwal pendaftaran Gelombang 1?')">
              <i class="ti ti-calendar"></i> Jadwal SPMB
            </button>
            <button type="button" class="quick-chip" onclick="sendQuick('Apa saja persyaratan pendaftaran MTs dan MA Persis?')">
              <i class="ti ti-file-certificate"></i> Syarat MTs & MA
            </button>
            <button type="button" class="quick-chip" onclick="sendQuick('Apakah anak harus sudah lancar membaca untuk masuk TK Calisa?')">
              <i class="ti ti-mood-kid"></i> Calistung TK
            </button>
          </div>

          <!-- Chat Composer Input -->
          <div class="chat-composer">
            <div class="chat-input-wrapper">
              <input 
                type="text" 
                id="chatInput" 
                class="chat-input-box" 
                placeholder="Ketik pertanyaan calon wali santri / santri di sini..." 
                onkeydown="handleKeyDown(event)"
                autocomplete="off"
              >
            </div>
            <button type="button" class="btn btn-primary" id="sendBtn" onclick="sendMessage()">
              <span>Kirim</span>
              <i class="ti ti-send"></i>
            </button>
          </div>
          <div class="chat-note">
            <i class="ti ti-info-circle"></i>
            <span>Jawaban AI dirangkum langsung dari dokumen Knowledge Base RAG Pesantren Persatuan Islam 80 Al Amin.</span>
          </div>
        </div>

        <!-- Right Side Information -->
        <aside class="chat-sidebar">
          <div class="sidebar-widget">
            <div class="widget-title">
              <i class="ti ti-settings-2"></i>
              <span>Konfigurasi Mesin AI</span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Primary Engine</span>
              <span class="prop-val" id="sbPrimaryEngine">Groq Llama 3.3</span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Fallback Engine</span>
              <span class="prop-val" id="sbFallbackEngine">Gemini Flash</span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Knowledge Base</span>
              <span class="prop-val" id="sbTotalChunks">0 Bagian</span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Session ID</span>
              <span class="prop-val" style="font-family: var(--font-mono); font-size: 0.75rem;">web-tester</span>
            </div>
          </div>

          <div class="sidebar-widget">
            <div class="widget-title">
              <i class="ti ti-bulb"></i>
              <span>Tips Pengujian SPMB</span>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-body); line-height: 1.6; margin-bottom: 10px;">
              Aisah telah dilengkapi dengan logika <strong>Context Isolation</strong> untuk membedakan secara cerdas antara unit <strong>TK, SDIT, MTs/MA, dan Asrama</strong>.
            </p>
            <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.6;">
              Cobalah bertanya spesifik per unit atau gabungan (misal: <em>"Berapa total biaya masuk SDIT jika sekaligus mukim di asrama?"</em>).
            </p>
          </div>
        </aside>
      </div>
    </section>

    <!-- ============================================================
         PANE 2: STATUS WHATSAPP (LIGHT MODE)
         ============================================================ -->
    <section id="pane-whatsapp" class="tab-pane ${initialTab === 'whatsapp' ? 'active' : ''}">
      <div class="wa-view-grid">
        <!-- Left: Connection Status & QR Code -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">
                <i class="ti ti-brand-whatsapp"></i>
                <span>Status Gateway WhatsApp</span>
              </div>
              <div class="card-subtitle">Koneksi nomor resmi layanan WhatsApp Bot SPMB</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="restartWhatsApp()">
              <i class="ti ti-refresh"></i>
              <span>Reconnect</span>
            </button>
          </div>

          <!-- Waiting for QR State -->
          <div id="waQrSection" class="qr-card-center" style="display:none;">
            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text); margin-bottom: 6px;">
              Pindai Kode QR untuk Menghubungkan
            </div>
            <div style="font-size: 0.82rem; color: var(--text-muted);">
              Gunakan aplikasi WhatsApp pada ponsel resmi admin SPMB
            </div>

            <div class="qr-white-frame">
              <img id="qrImage" src="" alt="WhatsApp QR Code">
            </div>

            <div class="qr-guide-steps">
              <div class="guide-step-item">
                <span class="step-number">1</span>
                <span>Buka aplikasi <strong>WhatsApp</strong> di ponsel Anda.</span>
              </div>
              <div class="guide-step-item">
                <span class="step-number">2</span>
                <span>Buka <strong>Menu (titik tiga)</strong> atau <strong>Pengaturan</strong> &gt; pilih <strong>Perangkat Tertaut</strong>.</span>
              </div>
              <div class="guide-step-item">
                <span class="step-number">3</span>
                <span>Ketuk <strong>Tautkan Perangkat</strong> lalu arahkan kamera ke kode QR di atas.</span>
              </div>
            </div>
          </div>

          <!-- Connected State -->
          <div id="waConnectedSection" style="display:none;">
            <div class="connected-profile-card">
              <div class="wa-device-avatar">
                <i class="ti ti-device-mobile-check"></i>
              </div>
              <div>
                <div style="font-size: 1.15rem; font-weight: 700; color: var(--text);" id="waUserNameConnected">-</div>
                <div style="font-size: 0.9rem; color: var(--primary); font-family: var(--font-mono); font-weight: 700;" id="waUserNumberConnected">-</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 4px;">Status: Aktif Melayani Chat Calon Santri</div>
              </div>
            </div>

            <div class="prop-row">
              <span class="prop-label">Kondisi Gateway</span>
              <span class="prop-val" style="color: var(--primary);">
                <i class="ti ti-circle-check-filled"></i> Terhubung & Normal
              </span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Sesi Chat Aktif</span>
              <span class="prop-val" id="waActiveSessions">0 Sesi</span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Penyimpanan Sesi</span>
              <span class="prop-val" style="font-family: var(--font-mono); font-size: 0.8rem;">session/baileys</span>
            </div>
          </div>

          <!-- Initializing / Disconnected State -->
          <div id="waDisconnectedSection" class="qr-card-center" style="display:none; padding: 48px 24px;">
            <div style="font-size: 32px; color: var(--text-muted); margin-bottom: 12px;">
              <i class="ti ti-loader-2 ti-spin"></i>
            </div>
            <div style="font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 6px;" id="waDisconTitle">
              Menyiapkan Koneksi WhatsApp...
            </div>
            <div style="font-size: 0.84rem; color: var(--text-muted); max-width: 320px; margin: 0 auto 20px;">
              Sistem sedang menginisialisasi protokol WhatsApp. Kode QR akan otomatis tampil jika perlu pairing ulang.
            </div>
            <button type="button" class="btn btn-primary btn-sm" onclick="restartWhatsApp()">
              <i class="ti ti-refresh"></i> Mulai Ulang Koneksi
            </button>
          </div>
        </div>

        <!-- Right: Safety Mode & Parameters -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <!-- Safety Mode Feature -->
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">
                  <i class="ti ti-shield-check"></i>
                  <span>Mode Pengaman Nomor Pribadi</span>
                </div>
                <div class="card-subtitle">Mencegah bot membalas obrolan pribadi/keluarga secara sembarangan</div>
              </div>
              <span class="brand-tag">AKTIF</span>
            </div>

            <div class="safe-mode-desc">
              Jika bot ditautkan ke nomor WhatsApp pribadi admin pesantren, sistem menerapkan <strong>Perlindungan Selektif</strong>:
            </div>

            <div class="safe-mode-callout">
              <div class="safe-mode-title">
                <i class="ti ti-bolt"></i>
                <span>Cara Kerja Perintah /start</span>
              </div>
              <div class="safe-mode-desc">
                Chat dari teman, grup, atau keluarga <strong>TIDAK AKAN</strong> dijawab oleh bot sama sekali. Bot hanya akan melayani pengirim yang secara eksplisit mengetik perintah:
                <div style="margin: 10px 0; font-family: var(--font-mono); background: #ffffff; border: 1px solid var(--primary-border); padding: 8px 12px; border-radius: 6px; color: var(--primary); font-weight: 700;">
                  /start
                </div>
                Pengguna juga dapat menonaktifkan bot sewaktu-waktu dengan mengetik <code>/stop</code>.
              </div>
            </div>
          </div>

          <!-- Parameters Card -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <i class="ti ti-adjustments-horizontal"></i>
                <span>Konfigurasi Perilaku Respon</span>
              </div>
            </div>
            <div class="prop-row">
              <span class="prop-label">Simulasi Ketik (Typing Delay)</span>
              <span class="prop-val">1500 ms (Alami)</span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Penyaringan Ruang Obrolan</span>
              <span class="prop-val">Hanya Chat Pribadi (Grup Diabaikan)</span>
            </div>
            <div class="prop-row">
              <span class="prop-label">Format Jawaban</span>
              <span class="prop-val">WhatsApp Markdown (*bold*, list)</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================================
         PANE 3: KNOWLEDGE BASE (LIGHT MODE)
         ============================================================ -->
    <section id="pane-knowledge" class="tab-pane ${initialTab === 'knowledge' ? 'active' : ''}">
      <div class="kb-view-container">
        <!-- Overview Metrics -->
        <div class="kb-metrics-grid">
          <div class="metric-card">
            <div class="metric-icon-box">
              <i class="ti ti-file-text"></i>
            </div>
            <div>
              <div class="metric-num" id="kbMetricFiles">0</div>
              <div class="metric-label">File Dokumen Terpasang</div>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-icon-box">
              <i class="ti ti-puzzle"></i>
            </div>
            <div>
              <div class="metric-num" id="kbMetricChunks">0</div>
              <div class="metric-label">Bagian Informasi Terindeks</div>
            </div>
          </div>
          <div class="metric-card">
            <div class="metric-icon-box">
              <i class="ti ti-cpu"></i>
            </div>
            <div>
              <div class="metric-num" style="font-size: 1.15rem;" id="kbMetricEngine">Groq & Gemini</div>
              <div class="metric-label">Mesin RAG & Dual AI</div>
            </div>
          </div>
        </div>

        <!-- Documents Table Card -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">
                <i class="ti ti-books"></i>
                <span>Daftar Dokumen Informasi SPMB</span>
              </div>
              <div class="card-subtitle">File dokumen Markdown di folder <code>data/documents/</code> yang menjadi acuan resmi Aisah</div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" onclick="reloadDocs()">
              <i class="ti ti-refresh"></i>
              <span>Muat Ulang Dokumen</span>
            </button>
          </div>

          <div class="docs-table-wrapper">
            <table class="docs-table">
              <thead>
                <tr>
                  <th>Nama File</th>
                  <th>Jumlah Bagian</th>
                  <th>Ukuran</th>
                  <th>Topik / Seksi Utama</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody id="docsTableBody">
                <tr>
                  <td colspan="5" style="text-align:center; color: var(--text-muted); padding: 32px;">
                    <i class="ti ti-loader-2 ti-spin"></i> Memuat daftar dokumen...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Interactive RAG Tester -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">
                <i class="ti ti-zoom-check"></i>
                <span>Penguji Relevansi RAG (RAG Inspector)</span>
              </div>
              <div class="card-subtitle">Uji pencarian potongan informasi dari dokumen tanpa memanggil API LLM berbayar</div>
            </div>
          </div>

          <div class="rag-tester-box">
            <div style="font-size: 0.86rem; color: var(--text-body);">
              Ketik pertanyaan calon santri untuk melihat potongan data mana yang akan ditarik oleh sistem:
            </div>
            <div class="rag-search-bar">
              <input 
                type="text" 
                id="ragSearchInput" 
                class="rag-search-input" 
                placeholder="Contoh: Berapa rincian biaya asrama putri dan syahriah bulanan?" 
                onkeydown="if(event.key==='Enter') testRagSearch()"
              >
              <button type="button" class="btn btn-primary" onclick="testRagSearch()">
                <i class="ti ti-search"></i>
                <span>Uji Pencarian</span>
              </button>
            </div>

            <div class="rag-results-list" id="ragResultsList">
              <div style="text-align: center; color: var(--text-muted); padding: 24px; font-size: 0.85rem;">
                Ketik pertanyaan di atas lalu klik <strong>Uji Pencarian</strong> untuk memeriksa skor relevansi.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <!-- Document Preview Modal -->
  <div class="modal-overlay" id="docModal">
    <div class="modal-card">
      <div class="modal-header">
        <div class="modal-title" id="docModalTitle">
          <i class="ti ti-file-text"></i>
          <span>Preview Dokumen</span>
        </div>
        <button type="button" class="modal-close-btn" onclick="closeDocModal()">&times;</button>
      </div>
      <div class="modal-body" id="docModalContent">
        Memuat isi dokumen...
      </div>
    </div>
  </div>

  <!-- Toast Notification Container -->
  <div class="toast-container" id="toastContainer"></div>

  <script>
    // Tab Management
    let currentTab = '${initialTab}';

    function switchTab(tabName, updateUrl = true) {
      if (!tabName) tabName = 'chat';
      currentTab = tabName;

      // Update Nav Buttons
      document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Update Panes
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      const activePane = document.getElementById('pane-' + tabName);
      if (activePane) {
        activePane.classList.add('active');
      }

      // Update URL without reload
      if (updateUrl && window.history && window.history.pushState) {
        try {
          const newPath = '/' + (tabName === 'chat' ? '' : tabName);
          if (window.location.pathname !== newPath) {
            window.history.pushState({ tab: tabName }, '', newPath);
          }
        } catch (e) {
          // ignore
        }
      }

      // Lazy load knowledge base docs if tab opened
      if (tabName === 'knowledge') {
        loadDocumentsList();
      }
    }

    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
      const path = window.location.pathname.split('/').filter(Boolean)[0] || 'chat';
      const validTabs = ['chat', 'whatsapp', 'knowledge'];
      switchTab(validTabs.includes(path) ? path : 'chat', false);
    });

    // Close modal when clicking outside modal card
    document.getElementById('docModal').addEventListener('click', (e) => {
      if (e.target.id === 'docModal') closeDocModal();
    });

    // Toast Notification Helper
    function showToast(message, iconClass = 'ti-info-circle') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = '<i class="ti ' + iconClass + '"></i><span>' + message + '</span>';
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    // Status Polling
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) return;
        const data = await res.json();

        // Brand
        if (data.campusName) {
          document.getElementById('topCampusName').innerText = data.campusName;
        }

        // Knowledge Base counts
        const totalChunks = data.documents?.totalChunks || 0;
        const totalFiles = data.documents?.files?.length || 0;
        document.getElementById('navDocsCount').innerText = totalFiles;
        document.getElementById('sbTotalChunks').innerText = totalChunks + ' Bagian';
        document.getElementById('kbMetricFiles').innerText = totalFiles;
        document.getElementById('kbMetricChunks').innerText = totalChunks;

        // Models
        const engineLabel = data.aiProvider === 'groq' ? 'Groq (' + data.groqModel + ')' :
                            data.aiProvider === 'gemini' ? 'Gemini (' + data.geminiModel + ')' :
                            'Auto Fallback';
        document.getElementById('chatEngineSubtitle').innerText = engineLabel;
        document.getElementById('sbPrimaryEngine').innerText = data.groqConfigured ? data.groqModel : 'Groq (Unconfigured)';
        document.getElementById('sbFallbackEngine').innerText = data.geminiConfigured ? data.geminiModel : 'Gemini (Unconfigured)';
        document.getElementById('kbMetricEngine').innerText = (data.groqConfigured ? 'Groq' : '') + 
          (data.groqConfigured && data.geminiConfigured ? ' & ' : '') + 
          (data.geminiConfigured ? 'Gemini' : '');

        // WhatsApp Indicators
        const topWaDot = document.getElementById('topWaDot');
        const navWaDot = document.getElementById('navWaDot');
        const topWaStatusText = document.getElementById('topWaStatusText');
        const waQrSection = document.getElementById('waQrSection');
        const waConnectedSection = document.getElementById('waConnectedSection');
        const waDisconnectedSection = document.getElementById('waDisconnectedSection');
        const qrImage = document.getElementById('qrImage');

        if (data.whatsapp.status === 'CONNECTED') {
          topWaDot.className = 'status-dot connected';
          navWaDot.className = 'status-dot connected';
          topWaStatusText.innerText = 'WA Terhubung';

          waQrSection.style.display = 'none';
          waDisconnectedSection.style.display = 'none';
          waConnectedSection.style.display = 'block';

          const phone = data.whatsapp.userInfo?.id ? '+' + data.whatsapp.userInfo.id.split(':')[0] : 'Nomor Terhubung';
          document.getElementById('waUserNumberConnected').innerText = phone;
          document.getElementById('waUserNameConnected').innerText = data.whatsapp.userInfo?.name || 'Aisah Bot SPMB';
          document.getElementById('waActiveSessions').innerText = (data.whatsapp.activeSessionsCount || 0) + ' Sesi';
        } else if (data.whatsapp.status === 'WAITING_QR' && data.whatsapp.qrCodeDataUrl) {
          topWaDot.className = 'status-dot waiting';
          navWaDot.className = 'status-dot waiting';
          topWaStatusText.innerText = 'Menunggu Scan QR';

          waConnectedSection.style.display = 'none';
          waDisconnectedSection.style.display = 'none';
          waQrSection.style.display = 'block';
          qrImage.src = data.whatsapp.qrCodeDataUrl;
        } else {
          topWaDot.className = 'status-dot disconnected';
          navWaDot.className = 'status-dot disconnected';
          topWaStatusText.innerText = data.whatsapp.status === 'INITIALIZING' ? 'Memulai WA...' : 'WA Terputus';

          waConnectedSection.style.display = 'none';
          waQrSection.style.display = 'none';
          waDisconnectedSection.style.display = 'block';
          document.getElementById('waDisconTitle').innerText = data.whatsapp.status === 'INITIALIZING' ? 'Menyiapkan Koneksi WhatsApp...' : 'WhatsApp Belum Terhubung';
        }

      } catch (err) {
        // do not log network interruption during restart
      }
    }

    // Polling setiap 3 detik
    setInterval(fetchStatus, 3000);
    fetchStatus();

    // ============================================================
    // CHAT SIMULATOR FUNCTIONS
    // ============================================================
    async function sendMessage() {
      const input = document.getElementById('chatInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      appendUserMessage(text);

      const sendBtn = document.getElementById('sendBtn');
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span>Menyusun...</span>';
      }

      const typingId = 'typing-' + Date.now();
      appendTypingIndicator(typingId);

      try {
        const res = await fetch('/api/test-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        removeTypingIndicator(typingId);

        if (data.reply) {
          appendAssistantMessage(data.reply, data.provider);
        } else {
          appendAssistantMessage('Mohon maaf, terjadi kendala saat memproses jawaban: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        removeTypingIndicator(typingId);
        appendAssistantMessage('Maaf, gagal terhubung dengan server AI.');
      } finally {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<span>Kirim</span> <i class="ti ti-send"></i>';
        }
      }
    }

    function appendUserMessage(text) {
      const stream = document.getElementById('chatMessages');
      const group = document.createElement('div');
      group.className = 'msg-group user';
      
      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      avatar.innerHTML = '<i class="ti ti-user"></i>';

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.innerText = text;

      group.appendChild(avatar);
      group.appendChild(bubble);
      stream.appendChild(group);
      stream.scrollTop = stream.scrollHeight;
    }

    function formatMarkdown(text) {
      if (!text) return '';
      let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Bold: *text* or **text**
      escaped = escaped
        .replace(new RegExp('\\\\*\\\\*(.*?)\\\\*\\\\*', 'g'), '<strong>$1</strong>')
        .replace(new RegExp('\\\\*([^\\\\*\\n]+)\\\\*', 'g'), '<strong>$1</strong>');

      // Bullets
      const lines = escaped.split('\\n');
      let inList = false;
      let htmlLines = [];

      for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          if (!inList) {
            htmlLines.push('<ul>');
            inList = true;
          }
          htmlLines.push('<li>' + trimmed.substring(2) + '</li>');
        } else {
          if (inList) {
            htmlLines.push('</ul>');
            inList = false;
          }
          if (trimmed === '') {
            htmlLines.push('<p style="margin-bottom: 6px;"></p>');
          } else {
            htmlLines.push('<p>' + line + '</p>');
          }
        }
      }
      if (inList) htmlLines.push('</ul>');
      return htmlLines.join('');
    }

    function appendAssistantMessage(text, provider) {
      const stream = document.getElementById('chatMessages');
      const group = document.createElement('div');
      group.className = 'msg-group assistant';

      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      avatar.innerHTML = '<i class="ti ti-message-chatbot"></i>';

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.innerHTML = formatMarkdown(text);

      const meta = document.createElement('div');
      meta.className = 'msg-meta';
      meta.innerHTML = '<span>Dibalas via: ' + (provider ? provider.toUpperCase() : 'Aisah Engine') + '</span>';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'msg-copy-btn';
      copyBtn.innerHTML = '<i class="ti ti-copy"></i> Salin';
      copyBtn.onclick = function() {
        navigator.clipboard.writeText(text);
        copyBtn.innerHTML = '<i class="ti ti-check"></i> Tersalin!';
        setTimeout(() => copyBtn.innerHTML = '<i class="ti ti-copy"></i> Salin', 2000);
      };
      meta.appendChild(copyBtn);

      bubble.appendChild(meta);
      group.appendChild(avatar);
      group.appendChild(bubble);
      stream.appendChild(group);
      stream.scrollTop = stream.scrollHeight;
    }

    function appendTypingIndicator(id) {
      const stream = document.getElementById('chatMessages');
      const group = document.createElement('div');
      group.id = id;
      group.className = 'msg-group assistant';

      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      avatar.innerHTML = '<i class="ti ti-message-chatbot"></i>';

      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.innerHTML = '<span style="color:var(--text-muted); font-style:italic; display:flex; align-items:center; gap:8px;"><i class="ti ti-loader-2 ti-spin"></i> Aisah sedang mencari data SPMB & merangkum jawaban...</span>';

      group.appendChild(avatar);
      group.appendChild(bubble);
      stream.appendChild(group);
      stream.scrollTop = stream.scrollHeight;
    }

    function removeTypingIndicator(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    function handleKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }

    function sendQuick(prompt) {
      const input = document.getElementById('chatInput');
      if (input) {
        input.value = prompt;
        sendMessage();
      }
    }

    async function clearChat() {
      if (!confirm('Apakah Anda yakin ingin mereset obrolan simulator?')) return;
      await fetch('/api/clear-session', { method: 'POST' });
      const stream = document.getElementById('chatMessages');
      stream.innerHTML = \`
        <div class="msg-group assistant">
          <div class="msg-avatar">
            <i class="ti ti-message-chatbot"></i>
          </div>
          <div class="msg-bubble">
            <p><strong>Riwayat obrolan telah direset.</strong></p>
            <p>Silakan tanyakan informasi seputar pendaftaran santri baru, jadwal, biaya, atau program di Pesantren Persatuan Islam 80 Al Amin.</p>
            <div class="msg-meta">
              <span>Aisah AI • Siap Melayani</span>
            </div>
          </div>
        </div>
      \`;
      showToast('Sesi simulator berhasil dibersihkan', 'ti-trash');
    }

    function copyText(btn) {
      const bubble = btn.closest('.msg-bubble');
      if (bubble) {
        navigator.clipboard.writeText(bubble.innerText.replace('Salin', '').trim());
        btn.innerHTML = '<i class="ti ti-check"></i> Tersalin!';
        setTimeout(() => btn.innerHTML = '<i class="ti ti-copy"></i> Salin', 2000);
      }
    }

    // ============================================================
    // WHATSAPP CONTROLS
    // ============================================================
    async function restartWhatsApp() {
      showToast('Memulai ulang proses WhatsApp bot...', 'ti-refresh');
      try {
        const res = await fetch('/api/restart-wa', { method: 'POST' });
        const data = await res.json();
        showToast(data.message || 'WhatsApp Bot dimulai ulang', 'ti-circle-check');
        fetchStatus();
      } catch (err) {
        showToast('Gagal me-restart WhatsApp', 'ti-alert-circle');
      }
    }

    // ============================================================
    // KNOWLEDGE BASE FUNCTIONS
    // ============================================================
    async function loadDocumentsList() {
      try {
        const res = await fetch('/api/documents');
        const data = await res.json();
        const tbody = document.getElementById('docsTableBody');
        
        if (!data.documents || data.documents.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:24px;">Tidak ada dokumen ditemukan.</td></tr>';
          return;
        }

        tbody.innerHTML = data.documents.map(doc => {
          const sizeKb = (doc.sizeBytes / 1024).toFixed(1) + ' KB';
          const sectionsText = doc.sections?.slice(0, 3).join(', ') + (doc.sections?.length > 3 ? '...' : '');
          return \`
            <tr>
              <td>
                <div class="doc-name-cell">
                  <i class="ti ti-file-text doc-icon"></i>
                  <span>\${doc.filename}</span>
                </div>
              </td>
              <td><span class="brand-tag">\${doc.chunksCount} bagian</span></td>
              <td style="color:var(--text-muted); font-family:var(--font-mono); font-size:0.8rem;">\${sizeKb}</td>
              <td style="color:var(--text-muted); font-size:0.82rem; max-width:300px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                \${sectionsText || '-'}
              </td>
              <td>
                <button type="button" class="btn btn-secondary btn-sm" onclick="previewDoc('\${doc.filename}')">
                  <i class="ti ti-eye"></i>
                  <span>Lihat Isi</span>
                </button>
              </td>
            </tr>
          \`;
        }).join('');
      } catch (err) {
        console.error('Error loading documents:', err);
      }
    }

    async function previewDoc(filename) {
      const modal = document.getElementById('docModal');
      const title = document.getElementById('docModalTitle');
      const content = document.getElementById('docModalContent');

      title.innerHTML = '<i class="ti ti-file-text"></i> <span>Pratinjau: ' + filename + '</span>';
      content.innerText = 'Memuat isi dokumen...';
      modal.classList.add('open');

      try {
        const res = await fetch('/api/document-content?file=' + encodeURIComponent(filename));
        const data = await res.json();
        if (data.content) {
          content.innerText = data.content;
        } else {
          content.innerText = 'Gagal memuat dokumen: ' + (data.error || 'Unknown');
        }
      } catch (err) {
        content.innerText = 'Error menghubungi server.';
      }
    }

    function closeDocModal() {
      document.getElementById('docModal').classList.remove('open');
    }

    async function reloadDocs() {
      showToast('Memuat ulang dan mengindeks dokumen...', 'ti-loader-2');
      try {
        const res = await fetch('/api/reload-docs', { method: 'POST' });
        const data = await res.json();
        showToast(data.message || 'Dokumen berhasil dimuat ulang!', 'ti-circle-check');
        fetchStatus();
        loadDocumentsList();
      } catch (err) {
        showToast('Gagal memuat ulang dokumen', 'ti-alert-circle');
      }
    }

    async function testRagSearch() {
      const input = document.getElementById('ragSearchInput');
      const query = input.value.trim();
      if (!query) return;

      const list = document.getElementById('ragResultsList');
      list.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted);"><i class="ti ti-loader-2 ti-spin"></i> Mencari potongan dokumen...</div>';

      try {
        const res = await fetch('/api/test-rag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
          list.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted);">Tidak ada potongan data yang cocok.</div>';
          return;
        }

        list.innerHTML = data.results.map((r, i) => \`
          <div class="rag-result-card">
            <div class="rag-result-header">
              <div class="rag-result-title">
                <i class="ti ti-bookmark"></i>
                <span>#\${i+1} • \${r.section} (\${r.filename})</span>
              </div>
              <span class="rag-score-pill">Skor: \${r.score}</span>
            </div>
            <div class="rag-result-content">\${r.content}</div>
          </div>
        \`).join('');
      } catch (err) {
        list.innerHTML = '<div style="text-align:center; padding:16px; color:var(--danger);"><i class="ti ti-alert-triangle"></i> Terjadi kesalahan saat mencari RAG.</div>';
      }
    }

    // Initialize Active Tab on Page Load
    document.addEventListener('DOMContentLoaded', () => {
      const rawPath = window.location.pathname.split('/').filter(Boolean)[0] || currentTab;
      const validTabs = ['chat', 'whatsapp', 'knowledge'];
      const targetTab = validTabs.includes(rawPath) ? rawPath : currentTab;
      switchTab(targetTab, false);
    });
  </script>
</body>
</html>`;
}
