// db.js - Versão 5.1 (Final com Validação de Data)
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const runMigration = async (client) => {
    const checkColumnQuery = `SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name='status'`;
    const res = await client.query(checkColumnQuery);
    if (res.rowCount === 0) {
        return;
    }
    console.log('⚠️ Detectada estrutura antiga. Iniciando migração de dados...');
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS annual_expires_at TIMESTAMP WITH TIME ZONE;`);
    await client.query(`UPDATE customers SET annual_expires_at = expires_at WHERE expires_at IS NOT NULL;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS monthly_status TEXT;`);
    await client.query(`UPDATE customers SET monthly_status = status WHERE status IN ('paid', 'overdue', 'canceled');`);
    await client.query(`ALTER TABLE customers DROP COLUMN status, DROP COLUMN expires_at;`);
    console.log('✔️ Migração concluída: Colunas antigas removidas.');
};

(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
          CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, phone TEXT,
            monthly_status TEXT, last_monthly_invoice_id TEXT,
            annual_expires_at TIMESTAMP WITH TIME ZONE, last_annual_invoice_id TEXT,
            last_annual_paid_at TIMESTAMP WITH TIME ZONE,
            grace_sermons_used INT DEFAULT 0, grace_period_month TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
          );
        `);
        const columns = ['monthly_status TEXT', 'last_monthly_invoice_id TEXT', 'annual_expires_at TIMESTAMP WITH TIME ZONE', 'last_annual_invoice_id TEXT', 'last_annual_paid_at TIMESTAMP WITH TIME ZONE', 'grace_sermons_used INT DEFAULT 0', 'grace_period_month TEXT'];
        for (const col of columns) { await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS ${col};`); }
        await runMigration(client);
        console.log('✔️ Tabela "customers" pronta.');

        await client.query(`
          CREATE TABLE IF NOT EXISTS access_control (
            id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
            permission TEXT NOT NULL CHECK (permission IN ('allow', 'block', 'canceled')),
            reason TEXT, product_id TEXT, invoice_id TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
          );
        `);
        await client.query(`ALTER TABLE access_control ADD COLUMN IF NOT EXISTS product_id TEXT;`);
        await client.query(`ALTER TABLE access_control ADD COLUMN IF NOT EXISTS invoice_id TEXT;`);
        await client.query(`ALTER TABLE access_control DROP CONSTRAINT IF EXISTS access_control_permission_check;`);
        await client.query(`ALTER TABLE access_control ADD CONSTRAINT access_control_permission_check CHECK (permission IN ('allow', 'block', 'canceled'));`);
        console.log('✔️ Tabela "access_control" pronta.');
        
        await client.query(`
          CREATE TABLE IF NOT EXISTS "user_sessions" ("sid" varchar NOT NULL COLLATE "default", "sess" json NOT NULL, "expire" timestamp(6) NOT NULL) WITH (OIDS=FALSE);
          DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN ALTER TABLE "user_sessions" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid"); END IF; END; $$;
          CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
        `);
        console.log('✔️ Tabela "user_sessions" pronta.');

        await client.query(`
          CREATE TABLE IF NOT EXISTS activity_log (
            id SERIAL PRIMARY KEY, user_email TEXT NOT NULL, sermon_topic TEXT, sermon_audience TEXT,
            sermon_type TEXT, sermon_duration TEXT, model_used TEXT, prompt_instruction TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
          );
        `);
        await client.query(`ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS prompt_instruction TEXT;`);
        console.log('✔️ Tabela "activity_log" pronta.');

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Erro ao inicializar/migrar o banco de dados:', err);
    } finally {
        client.release();
    }
})();

async function ensureCustomerExists(client, email, name, phone) {
    const query = `
        INSERT INTO customers (email, name, phone) VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, customers.name),
            phone = COALESCE(EXCLUDED.phone, customers.phone)
        RETURNING *;
    `;
    return client.query(query, [email.toLowerCase(), name, phone]);
}

async function updateAnnualAccess(email, name, phone, invoiceId, paidAt) {
    // ===== VALIDAÇÃO DE DATA ADICIONADA AQUI =====
    const paidDate = new Date(paidAt);
    if (isNaN(paidDate.getTime())) {
        console.error(`[Erro de Dados] Recebido valor de data inválido da Eduzz: "${paidAt}" para o cliente ${email}. Acesso anual não concedido.`);
        throw new Error(`Valor de data inválido recebido: ${paidAt}`);
    }
    // ===============================================

    const expirationDate = new Date(paidDate);
    expirationDate.setDate(expirationDate.getDate() + 366);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureCustomerExists(client, email, name, phone);
        const query = `
            UPDATE customers SET annual_expires_at = $1, last_annual_invoice_id = $2,
                last_annual_paid_at = $3, updated_at = NOW()
            WHERE email = $4;
        `;
        await client.query(query, [expirationDate.toISOString(), invoiceId, paidDate.toISOString(), email.toLowerCase()]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK'); throw e;
    } finally {
        client.release();
    }
}

async function updateMonthlyStatus(email, name, phone, invoiceId, status) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureCustomerExists(client, email, name, phone);
        const query = `
            UPDATE customers SET monthly_status = $1, last_monthly_invoice_id = $2, updated_at = NOW()
            WHERE email = $3;
        `;
        await client.query(query, [status, invoiceId, email.toLowerCase()]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK'); throw e;
    } finally {
        client.release();
    }
}

async function updateLifetimeAccess(email, name, phone, invoiceId, productId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureCustomerExists(client, email, name, phone);
        const query = `
            INSERT INTO access_control (email, permission, reason, invoice_id, product_id)
            VALUES ($1, 'allow', 'Acesso via Webhook Eduzz', $2, $3)
            ON CONFLICT (email) DO UPDATE SET
                permission = 'allow', reason = 'Acesso reativado via Webhook Eduzz',
                invoice_id = EXCLUDED.invoice_id, product_id = EXCLUDED.product_id,
                created_at = NOW();
        `;
        await client.query(query, [email.toLowerCase(), invoiceId, productId]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK'); throw e;
    } finally {
        client.release();
    }
}

async function revokeAccessByInvoice(invoiceId, productType) {
    let query;
    if (productType === 'annual') {
        query = `UPDATE customers SET annual_expires_at = NOW() WHERE last_annual_invoice_id = $1;`;
    } else if (productType === 'monthly') {
        query = `UPDATE customers SET monthly_status = 'canceled' WHERE last_monthly_invoice_id = $1;`;
    } else if (productType === 'lifetime') {
        query = `UPDATE access_control SET permission = 'canceled', reason = 'Acesso revogado via Webhook (reembolso/cancelamento)' WHERE invoice_id = $1;`;
    } else {
        return;
    }
    await pool.query(query, [invoiceId]);
}

async function registerProspect(email, name, phone) {
    const query = `INSERT INTO customers (email, name, phone) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING;`;
    await pool.query(query, [email.toLowerCase(), name, phone]);
}

function normalizePhone(phoneString) {
    if (!phoneString || typeof phoneString !== 'string') return null;
    return phoneString.replace(/\D/g, '').slice(-8);
}

async function getCustomerRecordByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM customers WHERE email = $1`, [email.toLowerCase()]);
  return rows[0] || null;
}

async function getCustomerRecordByPhone(phone) {
  const normalizedUserInput = normalizePhone(phone);
  if (!normalizedUserInput) return null;
  const { rows } = await pool.query(`SELECT * FROM customers WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 8) = $1`, [normalizedUserInput]);
  return rows[0] || null;
}

async function getAccessControlRule(email) {
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
        UPDATE customers SET grace_sermons_used = $1, grace_period_month = $2, updated_at = NOW() 
        WHERE email = $3
    `;
    await pool.query(query, [count, month, email.toLowerCase()]);
}

module.exports = {
  pool,
  getCustomerRecordByEmail,
  getCustomerRecordByPhone,
  getAccessControlRule,
  updateAnnualAccess,
  updateMonthlyStatus,
  updateLifetimeAccess,
  revokeAccessByInvoice,
  registerProspect,
  logSermonActivity,
  updateGraceSermons
};
