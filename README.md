# 🎓 AISAH - AI Customer Service SPMB Bot (WhatsApp & Web)

Bot Customer Service berbasis AI untuk Sistem Penerimaan Mahasiswa Baru (SPMB). Menggunakan teknologi **RAG (Retrieval-Augmented Generation)** dengan dataset dokumen Markdown (`.md`), terintegrasi langsung dengan **WhatsApp** dan **Web Dashboard Simulator**.

---

## ✨ Fitur Unggulan

1. **Dual AI Engine dengan Auto-Fallback**:
   - **Google Gemini Flash** (Prioritas Utama: Bahasa Indonesia sangat luwes dan santun).
   - **Groq Llama 3.3 70B** (Fallback Otomatis: Super cepat, aktif otomatis jika Gemini limit/terkendala).
   - Keduanya memiliki **Free Tier** resmi yang melimpah!
2. **Knowledge Base Berbasis Markdown (`.md`)**:
   - Menjawab **hanya** berdasarkan data dokumen resmi (syarat, jadwal gelombang, biaya kuliah, prodi).
   - Tanpa halusinasi / tidak mengarang jawaban.
   - Bisa update data kapan saja tanpa perlu restart sistem (ada tombol Reload di web dashboard).
3. **WhatsApp Bot Ringan (Baileys Multi-Device)**:
   - Tanpa Chrome/Puppeteer, memori sangat hemat (**RAM hanya ~80-120 MB**).
   - Sangat ringan untuk VPS murah ($3-$5 / 1GB RAM).
   - Ada simulasi status *"sedang mengetik..."* sebelum membalas agar terasa seperti admin manusia sungguhan.
4. **Web Dashboard & Live Simulator (`http://localhost:3000`)**:
   - Tampilan visual untuk memantau status WhatsApp, scan QR code langsung di browser, dan uji coba tanya-jawab sebelum menghubungkan WhatsApp.

---

## 🚀 Panduan Menjalankan di Komputer Lokal (Mac/PC)

### 1. Dapatkan API Key Gratis
Pilih salah satu atau isi keduanya (sangat direkomendasikan isi keduanya untuk auto-fallback):
* **Google Gemini API Key**: Dapatkan gratis di [Google AI Studio](https://aistudio.google.com/app/apikey)
* **Groq API Key**: Dapatkan gratis di [Groq Console](https://console.groq.com/keys)

### 2. Konfigurasi File `.env`
Buka file `.env` di root project, lalu isi API Key Anda:
```env
PORT=3000
CAMPUS_NAME="Universitas Al Amin"
BOT_NAME="Aisah (CS SPMB)"

# Pilihan: 'auto' | 'gemini' | 'groq'
AI_PROVIDER=auto

# Masukkan API Key Anda di sini:
GEMINI_API_KEY=AIzaSy...
GROQ_API_KEY=gsk_...
```

### 3. Masukkan / Ubah Data SPMB Anda
Buka folder `data/documents/panduan_spmb.md`.
Anda bisa mengedit isinya sesuai dengan informasi kampus Anda:
- Syarat jalur pendaftaran
- Jadwal gelombang pendaftaran
- Rincian biaya kuliah (UKT) & formulir
- Kontak resmi panitia SPMB

*(Anda juga bisa menambah file `.md` baru sebanyak yang Anda butuhkan di folder `data/documents/`)*.

### 4. Jalankan Aplikasi
Jalankan perintah berikut di terminal:
```bash
npm start
```

### 5. Hubungkan ke WhatsApp & Uji Coba Aman (Nomor Pribadi)
1. Buka browser ke: **`http://localhost:3000`**
2. Anda akan melihat **QR Code WhatsApp**:
   - Buka WhatsApp di HP Anda > **Perangkat Tertaut** > **Tautkan Perangkat** > Scan QR Code.
3. **Mode Testing Aman (Untuk Nomor Pribadi)**:
   - Chat teman, keluarga, atau grup **TIDAK AKAN** dibalas oleh bot sama sekali.
   - Untuk menguji bot dari nomor HP lain, ketik: **`/start`**
   - Bot Aisah akan aktif membalas pertanyaan SPMB dari nomor tersebut.
   - Ketik **`/stop`** kapan saja untuk mematikan bot pada nomor tersebut.
   - *(Jika nanti sudah memakai nomor khusus CS SPMB di VPS, Anda bisa mematikan syarat `/start` dengan mengubah `REQUIRE_START_COMMAND=false` di file `.env`)*.
4. Anda juga bisa langsung mengetes tanya-jawab di **Live Chat Simulator** yang ada di sebelah kanan dashboard!

---

## 🌐 Panduan Deploy ke VPS (Ubuntu / Debian Murah)

Aplikasi ini dirancang khusus agar dapat berjalan di VPS murah (RAM 1 GB) tanpa perlu GPU!

### 1. Install Node.js di VPS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

### 2. Copy Project ke VPS & Install Dependencies
```bash
# Masuk ke direktori project di VPS
cd /var/www/aisah

# Install dependencies (hanya production)
npm install --omit=dev
```

### 3. Jalankan 24/7 di Background dengan PM2
Gunakan **PM2** agar bot otomatis berjalan di latar belakang dan otomatis menyala kembali jika server reboot:
```bash
# Install PM2 secara global
sudo npm install -g pm2

# Jalankan bot
pm2 start src/index.js --name "aisah-spmb"

# Agar otomatis jalan saat VPS reboot
pm2 startup
pm2 save
```

### 4. Scan QR di VPS
Anda punya 2 cara mudah untuk scan QR di VPS:
- **Cara 1 (Terminal):** Lihat log PM2 dengan perintah `pm2 logs aisah-spmb`, QR Code akan muncul langsung di terminal VPS Anda.
- **Cara 2 (Browser):** Buka `http://IP_VPS_ANDA:3000` di browser Anda lalu scan QR code yang muncul di layar.

---

## 📁 Struktur Direktori

```
aisah/
├── data/
│   └── documents/          <-- Taruh file .md panduan SPMB Anda di sini
├── src/
│   ├── config.js           <-- Konfigurasi dari .env
│   ├── documentLoader.js   <-- Parser dokumen Markdown & chunking
│   ├── ragEngine.js        <-- In-memory retrieval RAG super cepat
│   ├── aiService.js        <-- Dual AI Engine (Gemini & Groq Auto-Fallback)
│   ├── whatsapp.js         <-- Baileys WhatsApp client & typing simulator
│   ├── server.js           <-- REST API & Web Dashboard Simulator
│   └── index.js            <-- Entry point aplikasi
├── session/                <-- Sesi login WhatsApp (tersimpan otomatis)
├── .env.example            <-- Template konfigurasi
├── .env                    <-- Konfigurasi aktif (jangan dibagikan)
└── package.json
```

---

## 💡 Tips & Trik

1. **Format Markdown Terbaik:** Gunakan heading bertingkat (`#`, `##`, `###`) untuk memisahkan topik. Semakin terstruktur dokumen Anda, semakin cerdas dan akurat AI menjawab.
2. **Update Dokumen Tanpa Restart:** Jika ada perubahan jadwal atau biaya pendaftaran, cukup edit file `.md` lalu klik tombol **Reload** di dashboard web. AI langsung menggunakan data baru detik itu juga!
3. **Privasi Chat:** Secara default, bot hanya membalas pesan pribadi (private chat) dan mengabaikan pesan grup agar tidak spamming di grup keluarga/kampus.
