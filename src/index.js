import { config } from './config.js';
import { ragEngine } from './ragEngine.js';
import { whatsappBot } from './whatsapp.js';
import { createServer } from './server.js';

async function bootstrap() {
  console.log('\n======================================================');
  console.log(`🚀 MEMULAI ${config.botName.toUpperCase()}`);
  console.log(`   Institusi: ${config.campusName}`);
  console.log('======================================================\n');

  // 1. Inisialisasi RAG Engine (Membaca file Markdown & Dokumen)
  console.log('[1/3] Membaca Knowledge Base dari folder data/documents...');
  await ragEngine.initialize();

  // 2. Menjalankan Web Dashboard Server
  console.log('[2/3] Memulai Web Dashboard Server...');
  const app = createServer();
  const server = app.listen(config.port, () => {
    console.log(`🌐 Web Dashboard aktif di: http://localhost:${config.port}`);
    console.log(`   (Buka tautan ini di browser untuk scan QR WhatsApp & tes simulasi chat)`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ [PORT ERROR] Port ${config.port} sedang digunakan oleh proses node lain.`);
      console.error(`   Silakan matikan proses sebelumnya dengan: lsof -ti :${config.port} | xargs kill -9\n`);
      process.exit(1);
    }
  });

  // 3. Menghubungkan WhatsApp Bot
  console.log('[3/3] Menyiapkan WhatsApp Bot...');
  try {
    await whatsappBot.start();
  } catch (err) {
    console.error('[WhatsApp] Gagal inisialisasi awal:', err.message);
  }
}

// Global error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UnhandledRejection]:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]:', err);
});

bootstrap();
