import { loadDocuments } from './documentLoader.js';

class RAGEngine {
  constructor() {
    this.chunks = [];
    this.isLoaded = false;
  }

  async initialize() {
    this.chunks = await loadDocuments();
    this.isLoaded = true;
    console.log(`[RAGEngine] Siap melayani pencarian dari ${this.chunks.length} potongan knowledge.`);
  }

  async reload() {
    await this.initialize();
    return this.chunks.length;
  }

  /**
   * Normalisasi dan ekstraksi kata dasar (Indonesian stemming sederhana)
   */
  stemToken(token) {
    if (!token) return '';
    let w = token.toLowerCase();

    // Hapus imbuhan akhiran umum (-nya, -kan, -an, -i, -lah, -kah)
    w = w.replace(/(nya|kan|an|i|lah|kah)$/, '');

    // Hapus imbuhan awalan umum
    w = w.replace(/^(pemberi|pembelajar|pembina|pengembang|pendidik|pendaftar|persyarat|pembiaya|pelayan)/, (match) => {
      if (match.includes('daftar')) return 'daftar';
      if (match.includes('syarat')) return 'syarat';
      if (match.includes('biaya')) return 'biaya';
      return '';
    });

    w = w.replace(/^(meng|meny|men|mem|me|peng|peny|pen|pem|pe|ber|ter|di|ke|se)/, '');
    return w.length > 2 ? w : token;
  }

  /**
   * Tokenizer & normalisasi teks untuk pencarian
   */
  tokenize(text) {
    if (!text) return [];
    const rawTokens = text
      .toLowerCase()
      .replace(/[^\w\s0-9]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOPWORDS.has(w));

    const tokens = new Set();
    for (const t of rawTokens) {
      tokens.add(t);
      const stemmed = this.stemToken(t);
      if (stemmed && stemmed.length > 2) {
        tokens.add(stemmed);
      }
    }
    return Array.from(tokens);
  }

  /**
   * Deteksi unit pendidikan (Cek query saat ini dulu, jika tidak ada baru cek riwayat)
   */
  detectUnit(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    if (/\b(sdit|sd|sekolah dasar)\b/.test(lower)) return 'sdit';
    if (/\b(tk|calisa|rabbani|paud)\b/.test(lower)) return 'tk';
    if (/\b(asrama|boarding|mukim|syahriah|musyrif|jenguk)\b/.test(lower)) return 'asrama';
    if (/\b(mts|tsanawiyyah)\b/.test(lower)) return 'mts';
    if (/\b(ma|muallimin|aliyah)\b/.test(lower)) return 'ma';
    if (/\b(mdu|diniyah|mdta)\b/.test(lower)) return 'mdu';
    return null;
  }

  /**
   * Mencari potongan dokumen yang paling relevan dengan pertanyaan
   */
  search(query, conversationHistory = [], topK = 9) {
    if (!this.chunks.length) return [];

    const historyText = conversationHistory
      .slice(-4)
      .map(m => m.text)
      .join(' ');

    // Prioritaskan deteksi unit dari pertanyaan terkini!
    const activeUnit = this.detectUnit(query) || this.detectUnit(historyText);

    const queryTokens = this.tokenize(query);
    const combinedTokens = this.tokenize(`${query} ${historyText}`);

    const scoredChunks = this.chunks.map(chunk => {
      let score = 0;
      const fullTextLower = chunk.fullText.toLowerCase();
      const sectionLower = chunk.section.toLowerCase();
      const fileLower = chunk.filename.toLowerCase();

      // 1. UNIT TARGETING & ISOLATION
      // Jika user sedang bertanya tentang SDIT, prioritaskan seluruh data SDIT dan singkirkan unit lain
      if (activeUnit) {
        const isSditFile = fileLower.includes('03_sdit');
        const isTkFile = fileLower.includes('02_tk');
        const isAsramaFile = fileLower.includes('05_asrama');
        const isMtsMaFile = fileLower.includes('04_mts');
        const isMduFile = fileLower.includes('06_madrasah');

        if (activeUnit === 'sdit') {
          if (isSditFile) score += 500;
          else if (isTkFile || isAsramaFile || isMtsMaFile || isMduFile) score -= 1000;
        } else if (activeUnit === 'tk') {
          if (isTkFile) score += 500;
          else if (isSditFile || isAsramaFile || isMtsMaFile || isMduFile) score -= 1000;
        } else if (activeUnit === 'asrama') {
          if (isAsramaFile) score += 500;
          else if (isTkFile || isSditFile || isMduFile) score -= 1000;
        } else if (activeUnit === 'mts' || activeUnit === 'ma') {
          if (isMtsMaFile) score += 500;
          else if (isTkFile || isSditFile || isMduFile) score -= 1000;
        } else if (activeUnit === 'mdu') {
          if (isMduFile) score += 500;
          else if (isTkFile || isSditFile || isAsramaFile || isMtsMaFile) score -= 1000;
        }
      }

      // 2. Keyword Matching di Judul Section & Isi Konten
      for (const token of queryTokens) {
        if (sectionLower.includes(token)) score += 35;
        if (fullTextLower.includes(token)) score += 15;
      }

      // 3. Keyword Matching dari Konteks Riwayat
      for (const token of combinedTokens) {
        if (sectionLower.includes(token)) score += 10;
        if (fullTextLower.includes(token)) score += 5;
      }

      // 4. File Profil Umum & FAQ selalu relevan untuk info kontak/biaya/jadwal
      if (fileLower.includes('01_profil_dan_alur_spmb')) {
        score += 20;
      }
      if (fileLower.includes('07_faq_spmb')) {
        if (activeUnit && fullTextLower.includes(activeUnit)) {
          score += 50;
        }
      }

      return {
        ...chunk,
        score
      };
    });

    // Urutkan berdasarkan skor tertinggi
    scoredChunks.sort((a, b) => b.score - a.score);

    // Ambil top-K
    return scoredChunks.slice(0, topK);
  }

  /**
   * Format context dokumen menjadi string untuk prompt LLM
   */
  buildContextString(query, conversationHistory = [], topK = 9) {
    const relevantChunks = this.search(query, conversationHistory, topK);
    if (!relevantChunks.length) return 'Tidak ada data spesifik yang ditemukan.';

    return relevantChunks
      .map((c, i) => `[INFORMASI ${i + 1} - ${c.section} (${c.filename})]:\n${c.content}`)
      .join('\n\n---\n\n');
  }
}

// Stopwords umum bahasa Indonesia
const STOPWORDS = new Set([
  'yang', 'untuk', 'pada', 'ke', 'para', 'namun', 'menurut', 'antara', 'dia', 'dua',
  'ia', 'seperti', 'jika', 'sehingga', 'kembali', 'dan', 'ini', 'karena', 'oleh',
  'saat', 'harus', 'sementara', 'setelah', 'belum', 'kami', 'sekitar', 'bagi',
  'serta', 'di', 'dari', 'telah', 'sebagai', 'masih', 'hal', 'ketika', 'adalah',
  'itu', 'dalam', 'bisa', 'akan', 'ada', 'mereka', 'sudah', 'saya', 'tahu', 'apakah',
  'bagaimana', 'apa', 'kenapa', 'mengapa', 'kapan', 'siapa', 'dimana', 'berapa', 'dong',
  'sih', 'aja', 'ya', 'kan', 'deh', 'nih', 'tuh', 'nya', 'aia'
]);

export const ragEngine = new RAGEngine();
