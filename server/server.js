import express from 'express'; // server entry
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

// Track DB diagnostics for troubleshooting
let lastDbError = null;
let reconnectTimeout = null;

mongoose.connection.on('connected', () => {
  console.log('Mongo connected');
  lastDbError = null;
  // Clear any pending reconnect attempts
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
});
mongoose.connection.on('error', (err) => {
  lastDbError = err?.message || String(err);
  console.error('Mongo connection error:', lastDbError);
});
mongoose.connection.on('disconnected', () => {
  console.warn('Mongo disconnected');
  // Attempt automatic reconnection after 5 seconds
  if (!reconnectTimeout) {
    reconnectTimeout = setTimeout(() => {
      console.log('Attempting to reconnect to MongoDB...');
      mongoose.connect(process.env.MONGO_URI).catch(err => {
        console.error('Reconnection failed:', err.message);
      });
      reconnectTimeout = null;
    }, 5000);
  }
});

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import treeRoutes from './routes/trees.js';
import memberRoutes from './routes/members.js';
import relationshipRoutes from './routes/relationships.js';
import aiRoutes from './routes/ai.js';
import uploadRoutes from './routes/uploads.js';
import adminRoutes from './routes/admin.js';

// Load env from server/.env first, then project-root custom env files as fallback
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });
// Support a custom root env filename the user may have created
dotenv.config({ path: path.resolve(__dirname, '../family-tree-only.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.use(cors());
// Increase JSON body limit to support base64 image uploads
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
  // Include database readiness for quick checks
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = states[mongoose.connection.readyState] || 'unknown';
  res.json({ status: 'ok', db: state });
});

// DB-only health (pings Mongo if connected)
app.get('/health/db', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ db: 'disconnected' });
    }
    await mongoose.connection.db.admin().command({ ping: 1 });
    return res.json({ db: 'connected' });
  } catch (e) {
    return res.status(500).json({ db: 'error', error: e.message });
  }
});

// Minimal diagnostics (sanitized) to help troubleshoot Atlas connection
app.get('/health/db/details', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const state = states[mongoose.connection.readyState] || 'unknown';
  const uri = process.env.MONGO_URI || '';
  // Extract host portion after '@' and before next '/'
  const hostPart = uri.includes('@') ? (uri.split('@')[1] || '').split('/')[0] : '';
  res.json({
    db: state,
    host: hostPart || 'unknown',
    lastError: lastDbError || null,
  });
});

// Root for convenience
app.get('/', (req, res) => res.type('text/plain').send('Family Tree API: ok'));

// Chrome DevTools discovery path sometimes queried by browsers/extensions
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.json({ name: 'family-tree-api', version: '0.1.0' });
});

// Static uploads (serve user files)
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trees', treeRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/relationships', relationshipRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/admin', adminRoutes);

const PORT = parseInt(process.env.PORT || '4000', 10);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/family_tree';

// Find an available port starting at PORT and falling back to the next few numbers if needed
function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err && err.code === 'EADDRINUSE') resolve(false);
        else resolve(false);
      })
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(start, attempts = 10) {
  let port = start;
  for (let i = 0; i < attempts; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const free = await isPortFree(port);
    if (free) return port;
    port += 1;
  }
  return start; // fallback to requested if all attempts failed
}

let httpServer = null;
async function startHttp() {
  const chosen = await findAvailablePort(PORT, 10);
  httpServer = app.listen(chosen, () => {
    console.log(`API running on http://localhost:${chosen}${chosen !== PORT ? ` (requested ${PORT} was busy)` : ''}`);
  });
  httpServer.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${chosen} is already in use. Set PORT to a different value or stop the conflicting process.`);
    } else {
      console.error('HTTP server error:', err?.message || err);
    }
  });
}
startHttp();

// Graceful shutdown
function shutdown() {
  if (httpServer) {
    try { httpServer.close(() => process.exit(0)); } catch { process.exit(0); }
  } else {
    process.exit(0);
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Connect to MongoDB with retry/backoff logic to handle transient network issues.
async function connectWithRetry() {
  const maxRetries = parseInt(process.env.MONGO_RETRY_MAX || '10', 10);
  const baseDelay = parseInt(process.env.MONGO_RETRY_BASE_MS || '1000', 10); // 1s
  let attempt = 0;
  while (true) {
    try {
      await mongoose.connect(MONGO_URI, {
        // Prevent disconnections during device sleep/lock
        serverSelectionTimeoutMS: 30000, // 30s timeout for initial connection
        socketTimeoutMS: 45000, // 45s timeout for socket inactivity
        heartbeatFrequencyMS: 10000, // Ping every 10s to keep connection alive
        maxPoolSize: 10, // Connection pool size
        minPoolSize: 2, // Minimum connections to maintain
        // Auto-reconnect settings
        retryWrites: true,
        retryReads: true,
      });
      console.log('Mongo connected');
      break;
    } catch (err) {
      attempt += 1;
      lastDbError = err?.message || String(err);
      console.error(`Mongo connection attempt ${attempt} failed:`, lastDbError);
      if (attempt >= maxRetries) {
        console.error(`Mongo connection failed after ${attempt} attempts. Giving up.`);
        break;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`Retrying Mongo connection in ${delay}ms...`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Start the connect attempts in background
connectWithRetry();
