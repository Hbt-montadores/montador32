// db.js - Versão Final (Fase 1) com Estrutura Completa
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    // Tabela customers com TODAS as colunas que vamos precisar
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        phone TEXT,
        status TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    // Comandos para adicionar as novas colunas se a tabela já existir
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;`);
    console.log('✔️ Tabela "customers" pronta (com estrutura final).');

    // Tabela de controle manual (sem alterações)
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

    // Tabela de sessões (sem alterações)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL
      ) WITH (OIDS=FALSE);
      DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey' AND conrelid = 'user_sessions'::regclass) THEN
      ALTER TABLE "user_sessions" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
      END IF; END; $$;
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
    `);
    console.log('✔️ Tabela "user_sessions" pronta.');

    // Tabela para registrar atividades
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        sermon_topic TEXT,
        sermon_audience TEXT,
        sermon_type TEXT,
        sermon_duration TEXT,
        model_used TEXT,
        prompt_instruction TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    await pool.query(`ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS prompt_instruction TEXT;`);
    console.log('✔️ Tabela "activity_log" pronta.');

  } catch (err) {
    console.error('❌ Erro ao criar as tabelas:', err);
  }
})();

/**
 * Normaliza um número de telefone, pegando apenas os últimos 6 dígitos.
 * @param {string} phoneString - O número de telefone original.
 * @returns {string|null} O número normalizado ou null.
 */
function normalizePhone(phoneString) {
    if (!phoneString || typeof phoneString !== 'string') return null;
    const digitsOnly = phoneString.replace(/\D/g, '');
    if (digitsOnly.length < 6) return null;
    return digitsOnly.slice(-6);
}

/**
 * Atualiza o status de um cliente via webhook, salvando o telefone completo.
 */
async function markStatus(email, name, phone, status) {
  await pool.query(
    `INSERT INTO customers (email, name, phone, status, expires_at)
       VALUES ($1, $2, $3, $4, NULL)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         phone = EXCLUDED.phone,
         status = EXCLUDED.status,
         expires_at = NULL,
         updated_at = now();`,
    [email.toLowerCase(), name, phone, status]
  );
}

/**
 * Busca o registro completo de um cliente pelo e-mail.
 */
async function getCustomerRecordByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM customers WHERE email = $1`, [email.toLowerCase()]);
  return rows[0] || null;
}

/**
 * Busca o registro completo de um cliente pelo telefone, comparando os últimos 6 dígitos.
 */
async function getCustomerRecordByPhone(phone) {
  const normalizedUserInput = normalizePhone(phone);
  if (!normalizedUserInput) return null;
  
  const query = `
    SELECT * FROM customers 
    WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 6) = $1
  `;
  
  const { rows } = await pool.query(query, [normalizedUserInput]);
  
  return rows[0] || null;
}

/**
 * Busca uma permissão manual (allow/block).
 */
async function getManualPermission(email) {
    const { rows } = await pool.query(`SELECT permission FROM access_control WHERE email = $1`, [email.toLowerCase()]);
    return rows[0]?.permission || null;
}

/**
 * Salva um registro de atividade de geração de sermão.
 */
async function logSermonActivity(details) {
    const { user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction } = details;
    const query = `
        INSERT INTO activity_log (user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    await pool.query(query, [user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction]);
}

module.exports = {
  pool,
  markStatus,
  getCustomerRecordByEmail,
  getCustomerRecordByPhone,
  getManualPermission,
  logSermonActivity
};
