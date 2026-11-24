import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { config } from './config.js';
import { ragEngine } from './ragEngine.js';

class AIService {
  constructor() {
    this.geminiClient = null;
    this.groqClient = null;
    this.userSessions = new Map(); // sessionId -> array of { role: 'user'|'model'|'assistant', text }

    this.initClients();
  }

  initClients() {
    if (config.gemini.apiKey) {
      try {
        this.geminiClient = new GoogleGenerativeAI(config.gemini.apiKey);
        console.log('[AI] Google Gemini API Client siap.');
      } catch (err) {
        console.error('[AI] Gagal inisialisasi Gemini Client:', err.message);
      }
    }

    if (config.groq.apiKey) {
      try {
        this.groqClient = new Groq({ apiKey: config.groq.apiKey });
        console.log('[AI] Groq API Client siap.');
      } catch (err) {
        console.error('[AI] Gagal inisialisasi Groq Client:', err.message);
      }
    }
  }

  getSessionHistory(sessionId) {
    if (!this.userSessions.has(sessionId)) {
      this.userSessions.set(sessionId, []);
    }
    return this.userSessions.get(sessionId);
  }

  addMessageToHistory(sessionId, role, text) {
    const history = this.getSessionHistory(sessionId);
    history.push({ role, text });
    if (history.length > 8) {
      history.shift(); // Buang pesan tertua agar fokus
    }
  }

  clearSession(sessionId) {
    this.userSessions.delete(sessionId);
  }

  /**
   * System prompt resmi sesuai pedoman SPMB Pesantren Al-Amin
   */
  buildSystemPrompt(context, isFirstMessage = false) {
    return `Kamu adalah "Aisah", AI Customer Service resmi SPMB Pesantren Persatuan Islam 80 Al Amin.
Tugasmu adalah membantu calon santri dan orang tua/wali santri dengan memberikan informasi resmi mengenai SPMB berdasarkan knowledge base resmi di bawah ini.

IDENTITAS & SIKAP:
1. Kamu asisten AI resmi (bukan manusia dan bukan panitia).
2. Ramah, santun, profesional, sabar, tidak berdebat, dan sesuai adab Islami.
3. Ungkapan Islami gunakan seperlunya dan wajar saja (misalnya "Insya Allah", "Alhamdulillah"). DILARANG menggunakan kata "Jazakumullahu khairan" di setiap chat atau sebagai penutup wajib! Jangan berlebihan agar percakapan tetap mengalir alami.

EKUIVALENSI ISTILAH (PENTING):
- "Kepala Sekolah", "Kepala Madrasah", "Pimpinan", "Mudir", dan "Kepala Unit" adalah jabatan yang sama:
  * Kepala Unit TK Calisa Rabbani: Ibu Lela Siti Sopiah, S.H.I.
  * Kepala Unit SDIT Al-Amin: Bapak Nu'man Ihsanda, S.Pd.I., M.Pd.
- "Biaya Masuk", "Biaya Pendaftaran", "Uang Gedung", "Investasi Pendidikan" merujuk pada pos-pos biaya resmi di knowledge base.

ATURAN SAPAAN (SANGAT KETAT):
- DILARANG menggunakan kata sapaan: "Halo", "Hai", "Hello", "Hi", "Kak", "Bestie", "Sobat", "Guys", "Bro", "Sis".
- WAJIB gunakan sapaan: "Bapak/Ibu", "Ayah/Bunda", "Calon Santri", atau "Wali Santri".

ATURAN GAYA CHAT WHATSAPP (LENGKAP, RAPI & ALAMI):
1. JAWABAN HARUS TUNTAS DAN TIDAK TERPOTONG: Pastikan kalimat selesai dengan baik, tidak boleh terputus di tengah jalan!
2. JANGAN SETIAP CHAT PAKAI "JAZAKUMULLAHU KHAIRAN":
   - DILARANG KERAS menempelkan kata "Jazakumullahu khairan" sebagai template penutup di setiap akhir chat!
   - Hanya gunakan jika pengguna sebelumnya berterima kasih, memberikan pujian, atau mendoakan.
   - Penutup chat cukup santun dan alami, misalnya: "Ada yang ingin ditanyakan lagi seputar SPMB?", atau cukup akhiri kalimat penjelasan dengan titik tanpa penutup yang kaku.
3. FORMAT RINCIAN BIAYA (WAJIB SANGAT RAPI DI HP):
   - Jika pengguna meminta rincian biaya, WAJIB tuliskan setiap pos biaya di BARIS BARU tersendiri menggunakan poin (•).
   - DILARANG KERAS menyambung beberapa poin biaya dalam satu baris paragraf!
   - Contoh format rincian biaya yang benar:
     Berikut rincian biaya pendidikannya, Ayah/Bunda:
     • Pendaftaran: *Rp300.000*
     • Seragam: *Rp1.000.000*
     • Media Pembelajaran: *Rp750.000*
     • Infaq Bangunan: *Rp3.050.000*
     • Infaq Sarana: *Rp1.000.000*
     • SPP Juli: *Rp300.000*
     • Kegiatan Santri Baru: *Rp1.300.000*
   - Berikan jeda satu baris kosong antar kategori (misal antara Full Day dan Asrama).
4. Ringkas & Padat: To the point layaknya admin WhatsApp manusia yang sigap.
5. Konversasional & Memahami Konteks Obrolan:
   - WAJIB MEMPERTAHANKAN TOPIK / JENJANG DARI CHAT SEBELUMNYA!
   - Contoh nyata: Jika sebelumnya sedang membahas jenjang TK (misal: "ada jenjang TK ga sih" lalu dijawab mengenai TK Calisa Rabbani), lalu pengguna bertanya singkat: "kepala sekolahnya siapa?", "berapa biayanya?", "alamatnya di mana?", atau "syaratnya apa?", MAKA WAJIB MENJAWAB TENTANG JENJANG TK TERSEBUT (yaitu Ibu Lela Siti Sopiah, S.H.I. untuk kepala TK)!
   - JANGAN PERNAH melompat menjawab jenjang lain (seperti SDIT, MTs, atau MA) kecuali jika pengguna secara terang-terangan menyebut nama jenjang baru tersebut.
   - Jika pengguna baru menyebut nama jenjang (misal: "mau ke tk" atau "minat sdit"), sambut ramah dan tanyakan apa yang ingin diketahui (jadwal, persyaratan, atau biaya). JANGAN langsung menembak biaya jika belum ditanyakan!
   - Jika pengguna menanyakan biaya, sebutkan total investasinya terlebih dahulu, lalu tawarkan: "Apakah ingin Aisah kirimkan rincian lengkapnya?". Jika pengguna menyetujui ("iya", "rincian biayanya"), barulah berikan rincian rapi di baris-baris baru.
6. Format WhatsApp: gunakan *tebal* (satu tanda bintang) untuk nominal/kata penting. DILARANG menggunakan tabel.

KONDISI JIKA INFORMASI BENAR-BENAR TIDAK TERSEDIA:
Hanya gunakan kalimat berikut apabila informasi yang ditanyakan BENAR-BENAR TIDAK TERCANTUM di knowledge base resmi:
"Afwan, Bapak/Ibu. Untuk informasi tersebut, silakan menghubungi Admin SPMB di *+62 813-2205-8570* agar mendapatkan informasi yang sesuai dengan ketentuan yang berlaku ya."

KNOWLEDGE BASE RESMI PESANTREN:
"""
${context}
"""`;
  }

  /**
   * Generate jawaban dengan fallback
   */
  async generateReply(sessionId, userMessage) {
    const history = this.getSessionHistory(sessionId);
    const isFirstMessage = history.length === 0;

    // Cek jika pesan pertama hanya salam pembuka biasa
    const cleanLower = userMessage.trim().toLowerCase();
    const isGreetingOnly = /^(assalamu'?alaikum|halo|hai|pagi|siang|sore|malam|permisi|tes|test|p)$/i.test(cleanLower);

    if (isFirstMessage && isGreetingOnly) {
      const greetingReply = "Bismillahirrahmanirrahim.\n\nPerkenalkan, saya *Aisah*, AI Customer Service SPMB Pesantren Persatuan Islam 80 Al Amin. Ada yang bisa Aisah bantu terkait informasi SPMB Bapak/Ibu? 😊";
      this.addMessageToHistory(sessionId, 'user', userMessage);
      this.addMessageToHistory(sessionId, 'assistant', greetingReply);
      return {
        reply: greetingReply,
        provider: 'System Template (Salam)',
        contextRetrieved: 'Salam Pembuka'
      };
    }

    // 1. Ambil konteks dokumen yang cocok dari RAGEngine (mengikutsertakan history agar tidak hilang konteks)
    const context = ragEngine.buildContextString(userMessage, history);
    const systemPrompt = this.buildSystemPrompt(context, isFirstMessage);

    let providerUsed = '';
    let replyText = '';

    const providerChoice = config.aiProvider.toLowerCase();

    // 2. Cek apakah ada API key yang terpasang
    if (!config.gemini.apiKey && !config.groq.apiKey) {
      return {
        reply: `Bismillahirrahmanirrahim.\n\nPerkenalkan, saya *Aisah*, AI Customer Service SPMB Pesantren Persatuan Islam 80 Al Amin.\n\n*Pemberitahuan Sistem:* API Key untuk Gemini atau Groq belum diisi di file *.env*. Mohon isi GEMINI_API_KEY atau GROQ_API_KEY terlebih dahulu agar Aisah dapat membalas secara aktif.`,
        provider: 'none-mock',
        contextRetrieved: context
      };
    }

    // 3. Eksekusi sesuai preferensi dan fallback
    if (providerChoice === 'groq') {
      try {
        replyText = await this.callGroq(systemPrompt, history, userMessage);
        providerUsed = 'Groq (' + config.groq.model + ')';
      } catch (err) {
        console.warn('[AI] Groq gagal:', err.message);
        if (config.gemini.apiKey) {
          console.log('[AI] Beralih ke fallback Gemini...');
          replyText = await this.callGemini(systemPrompt, history, userMessage);
          providerUsed = 'Gemini Fallback (' + config.gemini.model + ')';
        } else {
          throw err;
        }
      }
    } else {
      // Default: 'gemini' atau 'auto'
      if (config.gemini.apiKey) {
        try {
          replyText = await this.callGemini(systemPrompt, history, userMessage);
          providerUsed = 'Gemini (' + config.gemini.model + ')';
        } catch (err) {
          console.warn('[AI] Gemini gagal atau rate-limit:', err.message);
          if (config.groq.apiKey) {
            console.log('[AI] Otomatis beralih ke Groq...');
            replyText = await this.callGroq(systemPrompt, history, userMessage);
            providerUsed = 'Groq Fallback (' + config.groq.model + ')';
          } else {
            throw err;
          }
        }
      } else if (config.groq.apiKey) {
        replyText = await this.callGroq(systemPrompt, history, userMessage);
        providerUsed = 'Groq (' + config.groq.model + ')';
      }
    }

    // 4. Bersihkan formatting markdown agar pas di WhatsApp
    replyText = replyText.replace(/\*\*(.*?)\*\*/g, '*$1*');

    // 5. RAPATKAN DAN RAPATKAN BARIS POIN (Format WhatsApp Rapi)
    // Pastikan setiap bullet point (• atau -) selalu berada di baris baru tersendiri
    replyText = replyText.replace(/([^\n])\s*[•\-]\s+/g, '$1\n• ');
    replyText = replyText.replace(/\:\s*•\s+/g, ':\n• ');
    replyText = replyText.replace(/\.\s*•\s+/g, '.\n• ');
    replyText = replyText.replace(/\n{3,}/g, '\n\n');
    replyText = replyText.trim();

    // 6. Simpan ke riwayat percakapan
    this.addMessageToHistory(sessionId, 'user', userMessage);
    this.addMessageToHistory(sessionId, 'assistant', replyText);

    return {
      reply: replyText,
      provider: providerUsed,
      contextRetrieved: context
    };
  }

  async callGemini(systemPrompt, history, userMessage) {
    if (!this.geminiClient) {
      this.initClients();
    }
    const model = this.geminiClient.getGenerativeModel({
      model: config.gemini.model,
      systemInstruction: systemPrompt
    });

    const contents = [];
    for (const msg of history) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const result = await model.generateContent({
      contents,
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 2048, // 2048 tokens agar jawaban tidak terpotong sama sekali!
      }
    });

    const response = await result.response;
    return response.text();
  }

  async callGroq(systemPrompt, history, userMessage) {
    if (!this.groqClient) {
      this.initClients();
    }

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    for (const msg of history) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.text
      });
    }

    messages.push({
      role: 'user',
      content: userMessage
    });

    const chatCompletion = await this.groqClient.chat.completions.create({
      messages,
      model: config.groq.model,
      temperature: 0.25,
      max_tokens: 1500, // 1500 tokens agar tuntas
    });

    return chatCompletion.choices[0]?.message?.content || '';
  }
}

export const aiService = new AIService();
