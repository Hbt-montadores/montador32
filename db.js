// db.js – gerencia a conexão Postgres e as tabelas do app
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,   // variável do Render
  ssl: { rejectUnauthorized: false }            // exigido no Render Free
});

// Função auto-executável para garantir que TODAS as tabelas existam
(async () => {
  try {
    // Tabela 1: Gerenciada pelos webhooks da Eduzz
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    console.log('✔️ Tabela "customers" pronta.');

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

    // Tabela 3: Para armazenar as sessões de login (CORREÇÃO DO BUG)
    // Código tirado da documentação oficial do connect-pg-simple
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
            WHERE conname = 'session_pkey' AND conrelid = (SELECT oid FROM pg_class WHERE relname = 'user_sessions')
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
    console.log('✔️ Tabela "user_sessions" para sessões pronta.');

  } catch (err) {
    console.error('❌ Erro ao criar as tabelas:', err);
  }
})();

/**
 * Insere ou atualiza o status de um cliente (usado pelo webhook da Eduzz).
 * @param {string} email - O email do cliente.
 * @param {string} status - O status vindo da Eduzz (ex: 'paid', 'overdue', 'canceled').
 */
async function markStatus(email, status) {
  await pool.query(
    `INSERT INTO customers (email, status)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET
         status = EXCLUDED.status,
         updated_at = now();`,
    [email.toLowerCase(), status]
  );
}

/**
 * Busca o status de pagamento de um cliente na tabela 'customers'.
 * @param {string} email - O email do cliente.
 * @returns {Promise<string|null>} O status ('paid', 'overdue', etc.) ou null se não for encontrado.
 */
async function getCustomerStatus(email) {
  const { rows } = await pool.query(
    `SELECT status FROM customers WHERE email = $1`,
    [email.toLowerCase()]
  );
  return rows[0]?.status || null;
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
  getCustomerStatus,
  getManualPermission
};
