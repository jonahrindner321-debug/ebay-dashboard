const { neon } = require('@neondatabase/serverless');

let sqlClient = null;

function hasDb() {
  return Boolean(process.env.DATABASE_URL);
}

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

async function ensureStore({ storeSlug, storeName, clientSlug, clientName }) {
  const sql = getSql();
  let clientId = null;

  if (clientSlug || clientName) {
    const slug = clientSlug || storeSlug;
    const name = clientName || storeName || slug;
    const rows = await sql`
      insert into clients (slug, name)
      values (${slug}, ${name})
      on conflict (slug) do update set
        name = excluded.name,
        updated_at = now()
      returning id
    `;
    clientId = rows[0].id;
  }

  const finalStoreSlug = storeSlug || clientSlug || 'unassigned-tiktok-store';
  const finalStoreName = storeName || clientName || finalStoreSlug;
  const storeRows = await sql`
    insert into stores (slug, name, client_id, platform)
    values (${finalStoreSlug}, ${finalStoreName}, ${clientId}, 'tiktok')
    on conflict (slug) do update set
      name = excluded.name,
      client_id = coalesce(excluded.client_id, stores.client_id),
      updated_at = now()
    returning id, slug, name
  `;
  return storeRows[0];
}

async function savePlatformConnection({
  storeId,
  platform,
  externalAccountId,
  externalAccountName,
  scopes,
  encryptedAccessToken,
  encryptedRefreshToken,
  accessTokenExpiresAt,
  refreshTokenExpiresAt,
  tokenPayload,
}) {
  const sql = getSql();
  const connectionRows = await sql`
    insert into platform_connections (
      store_id, platform, external_account_id, external_account_name, scopes, status
    )
    values (
      ${storeId},
      ${platform},
      ${externalAccountId},
      ${externalAccountName},
      ${scopes || []},
      'connected'
    )
    on conflict (store_id, platform) do update set
      external_account_id = excluded.external_account_id,
      external_account_name = excluded.external_account_name,
      scopes = excluded.scopes,
      status = 'connected',
      updated_at = now()
    returning id
  `;

  const connectionId = connectionRows[0].id;
  await sql`
    insert into platform_tokens (
      connection_id,
      access_token_ciphertext,
      refresh_token_ciphertext,
      access_token_expires_at,
      refresh_token_expires_at,
      token_payload
    )
    values (
      ${connectionId},
      ${encryptedAccessToken},
      ${encryptedRefreshToken},
      ${accessTokenExpiresAt},
      ${refreshTokenExpiresAt},
      ${tokenPayload || {}}
    )
    on conflict (connection_id) do update set
      access_token_ciphertext = excluded.access_token_ciphertext,
      refresh_token_ciphertext = excluded.refresh_token_ciphertext,
      access_token_expires_at = excluded.access_token_expires_at,
      refresh_token_expires_at = excluded.refresh_token_expires_at,
      token_payload = excluded.token_payload,
      updated_at = now()
  `;
  return connectionId;
}

async function getConnections(platform = 'tiktok') {
  const sql = getSql();
  return sql`
    select
      pc.id,
      pc.platform,
      pc.external_account_id,
      pc.external_account_name,
      pc.scopes,
      pc.status,
      pc.connected_at,
      s.id as store_id,
      s.slug as store_slug,
      s.name as store_name,
      c.id as client_id,
      c.slug as client_slug,
      c.name as client_name
    from platform_connections pc
    join stores s on s.id = pc.store_id
    left join clients c on c.id = s.client_id
    where pc.platform = ${platform}
    order by pc.connected_at desc
  `;
}

module.exports = {
  ensureStore,
  getConnections,
  getSql,
  hasDb,
  savePlatformConnection,
};
