// db.js – gerencia a conexão Postgres e as tabelas do app
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Função auto-executável para garantir que TODAS as tabelas existam e estejam atualizadas
(async () => {
  try {
    // Tabela 1: Gerenciada pelos webhooks da Eduzz, agora com a coluna 'expires_at'
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    // Comando para adicionar a coluna 'expires_at' se a tabela já existir e a coluna não
    await pool.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('✔️ Tabela "customers" pronta (com expires_at).');

    // Tabela 2: Para seu controle manual de acesso
    await pool.query(`
      CREATE TABLE IF NOT EXISTS access_control (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        permission TEXT NOT NULL CHECK (permission IN ('allow', 'block')),
        reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    console.log('✔️ Tabela "access_control" pronta.');

    // Tabela 3: Para armazenar as sessões de login
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      )
      WITH (OIDS=FALSE);
      
      DO $$
      BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'session_pkey' AND conrelid = 'user_sessions'::regclass
        ) THEN
            ALTER TABLE "user_sessions" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
        END IF;
      END;
      $$;
      
      DO $$
      BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_class WHERE relname = 'IDX_session_expire' AND relkind = 'i'
        ) THEN
            CREATE INDEX "IDX_session_expire" ON "user_sessions" ("expire");
        END IF;
      END;
      $$;
    `);
    console.log('✔️ Tabela "user_sessions" pronta.');

  } catch (err) {
    console.error('❌ Erro ao criar as tabelas:', err);
  }
})();

/**
 * Insere ou atualiza o status de um cliente (usado pelo webhook da Eduzz).
 * MUDANÇA: Agora, ele define 'expires_at' como NULL para garantir que o controle seja da Eduzz.
 */
async function markStatus(email, status) {
  await pool.query(
    `INSERT INTO customers (email, status, expires_at)
       VALUES ($1, $2, NULL)
       ON CONFLICT (email) DO UPDATE SET
         status = EXCLUDED.status,
         expires_at = NULL,
         updated_at = now();`,
    [email.toLowerCase(), status]
  );
}

/**
 * MUDANÇA: Renomeado de getCustomerStatus para getCustomerRecord para clareza.
 * Busca o registro completo de um cliente para verificação de login (status e data de expiração).
 * @param {string} email - O email do cliente.
 * @returns {Promise<object|null>} O objeto do cliente completo ou null se não for encontrado.
 */
async function getCustomerRecord(email) {
  const { rows } = await pool.query(
    `SELECT * FROM customers WHERE email = $1`,
    [email.toLowerCase()]
  );
  return rows[0] || null;
}

/**
 * Verifica se há uma regra manual para um email na tabela 'access_control'.
 * @param {string} email - O email a ser verificado.
 * @returns {Promise<string|null>} A permissão ('allow' ou 'block') ou null se não houver regra.
 */
async function getManualPermission(email) {
    const { rows } = await pool.query(
    `SELECT permission FROM access_control WHERE email = $1`,
    [email.toLowerCase()]
  );
  return rows[0]?.permission || null;
}

// Exportamos as funções que o server.js precisará
module.exports = {
  pool,
  markStatus,
  getCustomerRecord, // MUDANÇA: Exportando a nova função renomeada
  getManualPermission
};
