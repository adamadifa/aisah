import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { aiService } from './aiService.js';

class WhatsAppBot {
  constructor() {
    this.sock = null;
    this.status = 'DISCONNECTED';
    this.qrCodeRaw = null;
    this.qrCodeDataUrl = null;
    this.userInfo = null;
    this.activeSessions = new Set();
    this.listeners = new Set();
    this.loadActiveSessions();
  }

  loadActiveSessions() {
    try {
      const filePath = path.join(config.paths.root, 'data', 'active_sessions.json');
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        this.activeSessions = new Set(data);
        console.log(`[WhatsApp] Memuat ${this.activeSessions.size} nomor sesi aktif dari active_sessions.json`);
      }
    } catch (e) {
      this.activeSessions = new Set();
    }
  }

  saveActiveSessions() {
    try {
      const filePath = path.join(config.paths.root, 'data', 'active_sessions.json');
      fs.writeFileSync(filePath, JSON.stringify(Array.from(this.activeSessions), null, 2), 'utf-8');
    } catch (e) {
      console.error('[WhatsApp] Gagal menyimpan active_sessions:', e.message);
    }
  }

  onStatusChange(cb) {
    this.listeners.add(cb);
  }

  notifyStatus() {
    for (const cb of this.listeners) {
      try {
        cb({
          status: this.status,
          qrCodeDataUrl: this.qrCodeDataUrl,
          userInfo: this.userInfo,
        });
      } catch (e) {
        // ignore callback error
      }
    }
  }

  async start() {
    if (!config.whatsapp.enabled) {
      console.log('[WhatsApp] Bot dinonaktifkan di konfigurasi (ENABLE_WHATSAPP=false).');
      this.status = 'DISABLED';
      this.notifyStatus();
      return;
    }

    if (!fs.existsSync(config.paths.session)) {
      fs.mkdirSync(config.paths.session, { recursive: true });
    }

    console.log('[WhatsApp] Menginisialisasi koneksi WhatsApp Multi-Device...');
    this.status = 'INITIALIZING';
    this.notifyStatus();

    const { state, saveCreds } = await useMultiFileAuthState(config.paths.session);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[WhatsApp] Menggunakan Baileys WA v${version.join('.')} (isLatest: ${isLatest})`);

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: ['Aisah CS SPMB', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      shouldIgnoreJid: (jid) => jid.endsWith('@broadcast'),
      getMessage: async (key) => undefined,
    });

    this.sock = sock;

    // Simpan credentials saat terupdate
    sock.ev.on('creds.update', saveCreds);

    // Monitor status koneksi & QR Code
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.status = 'WAITING_QR';
        this.qrCodeRaw = qr;
        try {
          this.qrCodeDataUrl = await QRCode.toDataURL(qr);
        } catch (err) {
          console.error('[WhatsApp] Gagal membuat QR data URL:', err.message);
        }

        console.log('\n======================================================');
        console.log('📌 SCAN QR CODE DI BAWAH DENGAN WHATSAPP DI HP ANDA:');
        console.log('   (Atau buka http://localhost:3000 di browser)');
        console.log('======================================================\n');
        qrcodeTerminal.generate(qr, { small: true });
        this.notifyStatus();
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] Koneksi terputus (status code: ${statusCode}). Reconnect: ${shouldReconnect}`);
        this.status = 'DISCONNECTED';
        this.qrCodeDataUrl = null;
        this.userInfo = null;
        this.notifyStatus();

        if (shouldReconnect) {
          setTimeout(() => this.start(), 3000);
        } else {
          console.log('[WhatsApp] Sesi telah logout. Silakan hapus folder session/ dan scan ulang.');
        }
      } else if (connection === 'open') {
        this.status = 'CONNECTED';
        this.qrCodeRaw = null;
        this.qrCodeDataUrl = null;
        this.userInfo = sock.user;
        console.log('\n======================================================');
        console.log(`✅ WHATSAPP BOT BERHASIL TERHUBUNG!`);
        console.log(`   Nama Nomor: ${sock.user?.name || 'Aisah SPMB'}`);
        console.log(`   ID: ${sock.user?.id}`);
        console.log(`   Sesi Aktif Tersimpan: ${this.activeSessions.size} nomor`);
        console.log('======================================================\n');
        this.notifyStatus();
      }
    });

    // Handle pesan masuk
    sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        await this.handleIncomingMessage(msg);
      }
    });
  }

  async handleIncomingMessage(msg) {
    try {
      const from = msg.key.remoteJid;
      if (!from) return;

      // Ekstrak isi teks pesan
      const messageContent =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      const cleanText = messageContent.trim();
      if (!cleanText) return;

      // Cek apakah pesan dari diri sendiri (misal: testing kirim chat ke nomor sendiri)
      if (msg.key.fromMe) {
        // Jika dari diri sendiri dan bukan perintah berawalan '/', abaikan agar tidak loop
        if (!cleanText.startsWith('/')) {
          return;
        }
      }

      // Cek apakah pesan grup
      const isGroup = from.endsWith('@g.us');
      if (isGroup && config.whatsapp.replyOnlyPrivate) {
        return;
      }

      const senderName = msg.pushName || 'Pengguna';
      const cleanLower = cleanText.toLowerCase();

      // 1. Tangani perintah /start (Aktivasi Bot untuk nomor ini)
      if (cleanLower === config.whatsapp.startCommand.toLowerCase()) {
        this.activeSessions.add(from);
        this.saveActiveSessions();
        console.log(`[WhatsApp] Sesi AI AKTIF untuk ${senderName} (${from}) melalui ${config.whatsapp.startCommand}`);

        await this.sock.sendPresenceUpdate('composing', from);
        const welcomeText = `Bismillahirrahmanirrahim.\n\nPerkenalkan, saya *Aisah*, AI Customer Service SPMB Pesantren Persatuan Islam 80 Al Amin.\n\nSesi tanya-jawab SPMB untuk nomor Bapak/Ibu telah *AKTIF* 🟢. Silakan sampaikan hal yang ingin ditanyakan seputar pendaftaran, biaya, syarat, atau fasilitas ya.\n\n_(Ketik *${config.whatsapp.stopCommand}* kapan saja untuk menonaktifkan balasan otomatis bot ini)_`;
        await this.sock.sendMessage(from, { text: welcomeText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', from);
        return;
      }

      // 2. Tangani perintah /stop (Deaktivasi Bot untuk nomor ini)
      if (cleanLower === config.whatsapp.stopCommand.toLowerCase()) {
        this.activeSessions.delete(from);
        this.saveActiveSessions();
        aiService.clearSession(from);
        console.log(`[WhatsApp] Sesi AI DINONAKTIFKAN untuk ${senderName} (${from}) melalui ${config.whatsapp.stopCommand}`);

        await this.sock.sendPresenceUpdate('composing', from);
        const stopText = `Sesi tanya-jawab dengan Aisah telah *DINONAKTIFKAN* 🔴.\n\nTerima kasih, Bapak/Ibu. Baarakallahu fiikum. Jika butuh bantuan lagi, cukup ketik *${config.whatsapp.startCommand}* kembali.`;
        await this.sock.sendMessage(from, { text: stopText }, { quoted: msg });
        await this.sock.sendPresenceUpdate('paused', from);
        return;
      }

      // 3. Cek Mode Keamanan Testing (Hanya balas nomor yang sudah ketik /start)
      if (config.whatsapp.requireStartCommand && !this.activeSessions.has(from)) {
        console.log(`[WhatsApp Safe Mode] Pesan dari ${senderName} (${from}): "${cleanText}" DIABAIKAN karena belum mengirim ${config.whatsapp.startCommand}. Chat pribadi tetap aman!`);
        return;
      }

      console.log(`\n[Pesan Masuk] Dari ${senderName} (${from}): "${cleanText}"`);

      // 4. Tampilkan status "sedang mengetik..." (composing)
      await this.sock.sendPresenceUpdate('composing', from);

      // 5. Beri jeda sedikit agar natural seperti CS manusia
      if (config.whatsapp.typingDelayMs > 0) {
        await new Promise((r) => setTimeout(r, config.whatsapp.typingDelayMs));
      }

      // 6. Generate jawaban menggunakan AI RAG Engine
      const { reply, provider } = await aiService.generateReply(from, cleanText);

      console.log(`[Pesan Keluar] Dibalas via ${provider}:`);
      console.log(reply.substring(0, 150) + (reply.length > 150 ? '...' : ''));

      // 7. Kirim balasan ke WhatsApp (Kirim sebagai media gambar jika ada link gambar)
      const imgMatch = reply.match(/(https?:\/\/[^\s<]+\.(?:jpg|jpeg|png|webp))/i);
      if (imgMatch) {
        const imageUrl = imgMatch[0];
        const caption = reply.replace(imageUrl, '').trim();
        await this.sock.sendMessage(
          from,
          {
            image: { url: imageUrl },
            caption: caption || undefined,
          },
          { quoted: msg }
        );
      } else {
        await this.sock.sendMessage(from, { text: reply }, { quoted: msg });
      }

      // Hentikan status mengetik
      await this.sock.sendPresenceUpdate('paused', from);
    } catch (err) {
      console.error('[WhatsApp] Gagal membalas pesan:', err);
    }
  }

  async logout() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (err) {
        // ignore
      }
    }
    this.status = 'DISCONNECTED';
    this.userInfo = null;
    this.notifyStatus();
  }
}

export const whatsappBot = new WhatsAppBot();
