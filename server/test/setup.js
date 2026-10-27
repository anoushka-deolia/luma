// Tests run against a real MongoDB. Point TEST_MONGODB_URI at a throwaway
// database (default: a local mongod on 27017, database "luma_test").
import mongoose from 'mongoose';
import { beforeAll, afterAll, beforeEach } from 'vitest';

beforeAll(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/luma_test');
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

beforeEach(async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});
