// db.js - Versão Final com Correção de Conexão SSL

const { Pool } = require('pg');

// CORREÇÃO: Adicionada uma verificação para a configuração de SSL.
// Em produção (como no Render), DATABASE_URL já inclui a configuração de SSL.
// Em desenvolvimento local, podemos desabilitá-la se necessário.
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

/**
 * Função auto-executável para inicializar e migrar o banco de dados.
 */
(async () => {
  const client = await pool.connect();
  try {
    console.log('Verificando e preparando o banco de dados...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        phone TEXT,
        monthly_status TEXT,
        annual_expires_at TIMESTAMP WITH TIME ZONE,
        grace_sermons_used INT DEFAULT 0,
        grace_period_month TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        last_invoice_id TEXT,
        last_product_id TEXT
      );
    `);

    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_invoice_id TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_product_id TEXT;`);
    
    console.log('✔️ Tabela "customers" pronta e migrada.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS access_control (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        permission TEXT NOT NULL CHECK (permission IN ('allow', 'block', 'canceled')),
        reason TEXT,
        invoice_id TEXT,
        product_id TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✔️ Tabela "access_control" pronta.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        sermon_topic TEXT,
        sermon_audience TEXT,
        sermon_type TEXT,
        sermon_duration TEXT,
        model_used TEXT,
        prompt_instruction TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✔️ Tabela "activity_log" pronta.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL
      ) WITH (OIDS=FALSE);
      DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey' AND conrelid = 'user_sessions'::regclass) THEN
      ALTER TABLE "user_sessions" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
      END IF; END; $$;
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
    `);
    console.log('✔️ Tabela "user_sessions" pronta.');

    console.log('✅ Banco de dados pronto para uso.');

  } catch (err) {
    console.error('❌ Erro fatal ao inicializar o banco de dados:', err);
    process.exit(1);
  } finally {
    client.release();
  }
})();


// --- FUNÇÕES DE CONSULTA, MODIFICAÇÃO E LÓGICA INTERNA ---
// (Nenhuma alteração aqui, o resto do arquivo é o mesmo)

async function getCustomerRecordByEmail(email) { /* ... */ }
async function getCustomerRecordByPhone(phone) { /* ... */ }
async function getAccessControlRule(email) { /* ... */ }
async function updateLifetimeAccess(email, name, phone, invoiceId, productId) { /* ... */ }
async function updateAnnualAccess(email, name, phone, invoiceId, paidAt) { /* ... */ }
async function updateMonthlyStatus(email, name, phone, invoiceId, status) { /* ... */ }
async function revokeAccessByInvoice(invoiceId, productType) { /* ... */ }
async function registerProspect(email, name, phone) { /* ... */ }
async function updateGraceSermons(email, count, month) { /* ... */ }
async function logSermonActivity(details) { /* ... */ }

module.exports = {
  pool,
  getCustomerRecordByEmail,
  getCustomerRecordByPhone,
  getAccessControlRule,
  updateLifetimeAccess,
  updateAnnualAccess,
  updateMonthlyStatus,
  revokeAccessByInvoice,
  registerProspect,
  updateGraceSermons,
  logSermonActivity
};
