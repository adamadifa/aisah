import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { config } from './config.js';

/**
 * Membaca dan mem-parsing dokumen di folder data/documents
 * Mendukung format: .md, .txt, .docx
 */
export async function loadDocuments() {
  const docsDir = config.paths.documents;

  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  const files = fs.readdirSync(docsDir);
  const chunks = [];
  let chunkIdCounter = 1;

  for (const file of files) {
    const fullPath = path.join(docsDir, file);
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) continue;

    const ext = path.extname(file).toLowerCase();

    try {
      if (ext === '.md') {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const mdChunks = parseMarkdown(content, file);
        for (const c of mdChunks) {
          chunks.push({
            id: chunkIdCounter++,
            filename: file,
            section: c.section,
            content: c.content,
            fullText: `${c.section}\n${c.content}`.trim()
          });
        }
      } else if (ext === '.txt') {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const txtChunks = splitTextIntoChunks(content, 1000, 200);
        for (const c of txtChunks) {
          chunks.push({
            id: chunkIdCounter++,
            filename: file,
            section: 'General',
            content: c,
            fullText: c
          });
        }
      } else if (ext === '.docx') {
        const result = await mammoth.extractRawText({ path: fullPath });
        const text = result.value || '';
        const docxChunks = splitTextIntoChunks(text, 1000, 200);
        for (const c of docxChunks) {
          chunks.push({
            id: chunkIdCounter++,
            filename: file,
            section: 'Word Document',
            content: c,
            fullText: c
          });
        }
      }
    } catch (err) {
      console.error(`[DocLoader] Error reading ${file}:`, err.message);
    }
  }

  console.log(`[DocLoader] Berhasil memuat ${chunks.length} potongan informasi dari ${files.length} file dokumen.`);
  return chunks;
}

/**
 * Parsing Markdown berdasarkan hierarki Header (#, ##, ###)
 */
function parseMarkdown(mdText, filename) {
  const lines = mdText.split(/\r?\n/);
  const sections = [];
  let currentHeader = 'Pendahuluan SPMB';
  let currentContent = [];

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      if (currentContent.join('\n').trim().length > 0) {
        sections.push({
          section: currentHeader,
          content: currentContent.join('\n').trim()
        });
        currentContent = [];
      }
      currentHeader = headerMatch[2].trim();
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.join('\n').trim().length > 0) {
    sections.push({
      section: currentHeader,
      content: currentContent.join('\n').trim()
    });
  }

  // Jika satu section terlalu panjang (> 1500 karakter), pecah lagi dengan overlap
  const refinedChunks = [];
  for (const s of sections) {
    if (s.content.length > 1500) {
      const subChunks = splitTextIntoChunks(s.content, 1200, 200);
      subChunks.forEach((sub, i) => {
        refinedChunks.push({
          section: `${s.section} (Bagian ${i + 1})`,
          content: sub
        });
      });
    } else {
      refinedChunks.push(s);
    }
  }

  return refinedChunks;
}

/**
 * Helper untuk memecah teks panjang dengan overlap
 */
function splitTextIntoChunks(text, maxChunkSize = 1000, overlap = 150) {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = '';

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;

    if ((currentChunk + '\n\n' + trimmed).length > maxChunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      // Mulai chunk baru dengan sedikit overlap jika ada
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.min(25, words.length)).join(' ');
      currentChunk = overlapWords + '\n\n' + trimmed;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}
