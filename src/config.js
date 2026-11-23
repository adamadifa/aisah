import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  campusName: process.env.CAMPUS_NAME || 'Universitas Al Amin',
  botName: process.env.BOT_NAME || 'Aisah (CS SPMB)',
  
  // AI Provider: 'auto' | 'gemini' | 'groq'
  aiProvider: process.env.AI_PROVIDER || 'auto',
  
  // Gemini Configuration
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  },
  
  // Groq Configuration
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
  
  // WhatsApp Configuration
  whatsapp: {
    enabled: process.env.ENABLE_WHATSAPP !== 'false',
    sessionDir: path.join(ROOT_DIR, 'session'),
    typingDelayMs: parseInt(process.env.TYPING_DELAY_MS || '1500', 10),
    replyOnlyPrivate: process.env.REPLY_ONLY_PRIVATE_CHAT !== 'false',
    requireStartCommand: process.env.REQUIRE_START_COMMAND !== 'false', // Default true agar aman di nomor pribadi
    startCommand: process.env.START_COMMAND || '/start',
    stopCommand: process.env.STOP_COMMAND || '/stop',
  },
  
  // Paths
  paths: {
    root: ROOT_DIR,
    documents: path.join(ROOT_DIR, 'data', 'documents'),
    session: path.join(ROOT_DIR, 'session'),
  }
};
