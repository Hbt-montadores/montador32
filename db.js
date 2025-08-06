// db.js - Versão 5.0 (Arquitetura Final de Acesso Baseada em Faturas)
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    // 1. Tabela customers com a nova estrutura completa
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        phone TEXT,
        monthly_status TEXT,
        annual_expires_at TIMESTAMP WITH TIME ZONE,
        last_annual_invoice_id BIGINT,
        last_annual_paid_at TIMESTAMP WITH TIME ZONE,
        last_monthly_invoice_id BIGINT,
        grace_sermons_used INT DEFAULT 0,
        grace_period_month TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    
    // 2. Script de Migração ÚNICO para dados existentes
    await pool.query(`
        DO $$
        BEGIN
            -- Migra a coluna 'status' antiga para 'monthly_status'
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='status')
            AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='monthly_status') THEN
                UPDATE customers SET monthly_status = status WHERE monthly_status IS NULL;
            END IF;

            -- Migra a coluna 'expires_at' antiga para 'annual_expires_at'
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='expires_at')
            AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='annual_expires_at') THEN
                UPDATE customers SET annual_expires_at = expires_at WHERE annual_expires_at IS NULL;
            END IF;
        END$$;
    `);

    // 3. Garante que todas as colunas novas e antigas existam
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS monthly_status TEXT;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS annual_expires_at TIMESTAMP WITH TIME ZONE;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_annual_invoice_id BIGINT;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_annual_paid_at TIMESTAMP WITH TIME ZONE;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_monthly_invoice_id BIGINT;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS grace_sermons_used INT DEFAULT 0;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS grace_period_month TEXT;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT;`);
    await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT;`);
    console.log('✔️ Tabela "customers" pronta com a arquitetura final.');

    // 4. Tabela de controle manual, agora com invoice_id
    await pool.query(`
      CREATE TABLE IF NOT EXISTS access_control (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        permission TEXT NOT NULL CHECK (permission IN ('allow', 'block')),
        reason TEXT,
        invoice_id BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
    await pool.query(`ALTER TABLE access_control ADD COLUMN IF NOT EXISTS invoice_id BIGINT;`);
    console.log('✔️ Tabela "access_control" pronta.');
    
    // 5. Tabelas de sessões e atividades (sem alterações estruturais)
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
    console.log('✔️ Tabela "activity_log" pronta.');

  } catch (err) {
    console.error('❌ Erro ao inicializar o banco de dados:', err);
  }
})();

function normalizePhone(phoneString) {
    if (!phoneString || typeof phoneString !== 'string') return null;
    const digitsOnly = phoneString.replace(/\D/g, '');
    if (digitsOnly.length < 6) return null;
    return digitsOnly.slice(-6);
}

async function getCustomerRecordByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM customers WHERE email = $1`, [email.toLowerCase()]);
  return rows[0] || null;
}

// ---- NOVAS FUNÇÕES DE ATUALIZAÇÃO ----

async function upsertCustomer(email, name, phone) {
    const query = `
        INSERT INTO customers (email, name, phone, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (email) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, customers.name),
            phone = COALESCE(EXCLUDED.phone, customers.phone),
            updated_at = NOW()
        RETURNING *;`;
    const { rows } = await pool.query(query, [email.toLowerCase(), name, phone]);
    return rows[0];
}

async function updateMonthlyStatus(email, status, invoiceId) {
  await pool.query(
    `UPDATE customers SET monthly_status = $1, last_monthly_invoice_id = $2, updated_at = now() WHERE email = $3`,
    [status, invoiceId, email.toLowerCase()]
  );
}

async function updateAnnualAccess(email, paidAt, invoiceId) {
    const expirationDate = new Date(paidAt);
    expirationDate.setDate(expirationDate.getDate() + 365);
    
    await pool.query(
      `UPDATE customers SET annual_expires_at = $1, last_annual_paid_at = $2, last_annual_invoice_id = $3, updated_at = now() WHERE email = $4`,
      [expirationDate.toISOString(), paidAt, invoiceId, email.toLowerCase()]
    );
}

async function updateLifetimeAccess(email, invoiceId, reason = 'Compra de produto vitalício') {
    const query = `
        INSERT INTO access_control (email, permission, reason, invoice_id)
        VALUES ($1, 'allow', $2, $3)
        ON CONFLICT (email) DO UPDATE SET
            permission = EXCLUDED.permission,
            reason = EXCLUDED.reason,
            invoice_id = EXCLUDED.invoice_id;`;
    await pool.query(query, [email.toLowerCase(), reason, invoiceId]);
}

async function revokeAccessByInvoice(invoiceId) {
    // Revoga acesso vitalício
    await pool.query(`DELETE FROM access_control WHERE invoice_id = $1 AND permission = 'allow'`, [invoiceId]);
    // Revoga acesso anual
    await pool.query(`UPDATE customers SET annual_expires_at = NULL, last_annual_invoice_id = NULL WHERE last_annual_invoice_id = $1`, [invoiceId]);
    // Revoga acesso mensal (define como cancelado)
    await pool.query(`UPDATE customers SET monthly_status = 'canceled' WHERE last_monthly_invoice_id = $1`, [invoiceId]);
}

// ---- FUNÇÕES ANTIGAS E AUXILIARES (sem mudanças) ----

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

async function getManualPermission(email) {
    const { rows } = await pool.query(`SELECT * FROM access_control WHERE email = $1`, [email.toLowerCase()]);
    return rows[0] || null;
}

async function logSermonActivity(details) {
    const { user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction } = details;
    const query = `
        INSERT INTO activity_log (user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    await pool.query(query, [user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction]);
}

async function updateGraceSermons(email, count, month) {
    const query = `
        UPDATE customers 
        SET grace_sermons_used = $1, grace_period_month = $2, updated_at = NOW() 
        WHERE email = $3
    `;
    await pool.query(query, [count, month, email.toLowerCase()]);
}

module.exports = {
  pool,
  getCustomerRecordByEmail,
  getCustomerRecordByPhone,
  getManualPermission,
  logSermonActivity,
  updateGraceSermons,
  // Exportando as novas funções
  upsertCustomer,
  updateMonthlyStatus,
  updateAnnualAccess,
  updateLifetimeAccess,
  revokeAccessByInvoice
};
