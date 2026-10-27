import dns from 'node:dns';
import mongoose from 'mongoose';

const PUBLIC_DNS = ['1.1.1.1', '8.8.8.8'];
const OPTIONS = { serverSelectionTimeoutMS: 15000 };

const isSrvLookupFailure = (err) =>
  err?.syscall === 'querySrv' || /querySrv|ENOTFOUND _mongodb\._tcp/.test(String(err?.message));

/**
 * Atlas "mongodb+srv://" addresses need a DNS SRV lookup. Some networks
 * (many college and office Wi-Fi networks) and some Node versions on Windows
 * refuse it with "querySrv ECONNREFUSED". If that happens, retry once with
 * public DNS servers instead of failing.
 */
export async function connectDb(uri) {
  try {
    return await mongoose.connect(uri, OPTIONS);
  } catch (err) {
    if (!isSrvLookupFailure(err)) throw err;
    console.warn('This network blocked the MongoDB Atlas DNS lookup. Retrying with public DNS (1.1.1.1, 8.8.8.8)...');
    dns.setServers(PUBLIC_DNS);
    dns.promises.setServers(PUBLIC_DNS);
    return mongoose.connect(uri, OPTIONS);
  }
}
