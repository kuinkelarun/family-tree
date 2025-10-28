import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureUploadsDir() {
  const dir = path.resolve(__dirname, '../uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function uploadImageFromDataUrl(req, res) {
  try {
    const { dataUrl } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return res.status(400).json({ error: 'Missing or invalid dataUrl' });
    }
    // data:[mime];base64,xxxx
    const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/i);
    if (!match) return res.status(400).json({ error: 'Only image data URLs are supported' });
    const mime = match[1];
    const base64 = match[3];
    const buffer = Buffer.from(base64, 'base64');

    const uploadsDir = ensureUploadsDir();
    const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
    const fileName = `img_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    await fs.promises.writeFile(filePath, buffer);

  // Public URL via static mount in server.js
  // Return a relative URL so the Vite dev server can proxy it as same-origin
  const url = `/uploads/${fileName}`;
    return res.json({ url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
