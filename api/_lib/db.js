function hasDb() {
  return false;
}

function getSql() {
  throw new Error('Database storage is disabled for Seller OS');
}

async function ensureStore() {
  throw new Error('Database storage is disabled for Seller OS');
}

async function savePlatformConnection() {
  throw new Error('Database storage is disabled for Seller OS');
}

async function getConnections() {
  return [];
}

module.exports = {
  ensureStore,
  getConnections,
  getSql,
  hasDb,
  savePlatformConnection,
};
