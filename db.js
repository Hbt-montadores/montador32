// db.js - Versão Final com Funções de Verificação e Deleção de Inscrições

const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.on('error', (err, client) => {
  console.error('[ERRO NO POOL DE CONEXÕES PG] Erro inesperado no cliente inativo', err);
  process.exit(-1);
});

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
    
    console.log('✔️ Tabela "customers" pronta.');

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        subscription_object JSONB UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('✔️ Tabela "push_subscriptions" pronta.');

    console.log('✅ Banco de dados pronto para uso.');

  } catch (err) {
    console.error('❌ Erro fatal ao inicializar o banco de dados:', err);
    process.exit(1);
  } finally {
    client.release();
  }
})();

// --- Funções de Consulta e Modificação (Clientes e Acesso) ---

async function getCustomerRecordByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM customers WHERE email = $1`, [email.toLowerCase()]);
  return rows[0] || null;
}

async function getCustomerRecordByPhone(phone) {
  const digitsOnly = (phone || '').replace(/\D/g, '');
  if (digitsOnly.length < 6) return null;
  const lastSixDigits = digitsOnly.slice(-6);
  const query = `SELECT * FROM customers WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 6) = $1`;
  const { rows } = await pool.query(query, [lastSixDigits]);
  return rows[0] || null;
}

async function getAccessControlRule(email) {
    const { rows } = await pool.query(`SELECT * FROM access_control WHERE email = $1`, [email.toLowerCase()]);
    return rows[0] || null;
}

async function updateLifetimeAccess(email, name, phone, invoiceId, productId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO customers (email, name, phone, updated_at) VALUES ($1, $2, $3, NOW())
             ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name), phone = COALESCE(EXCLUDED.phone, customers.phone), updated_at = NOW()`,
            [email.toLowerCase(), name, phone]
        );
        await client.query(
            `INSERT INTO access_control (email, permission, reason, invoice_id, product_id) VALUES ($1, 'allow', 'Acesso Vitalício via Webhook', $2, $3)
             ON CONFLICT (email) DO UPDATE SET permission = 'allow', reason = 'Acesso Vitalício via Webhook (Renovado)', invoice_id = EXCLUDED.invoice_id, product_id = EXCLUDED.product_id`,
            [email.toLowerCase(), invoiceId, productId]
        );
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function updateAnnualAccess(email, name, phone, invoiceId, paidAt) {
    const expirationDate = new Date(paidAt);
    expirationDate.setDate(expirationDate.getDate() + 365);
    await pool.query(
        `INSERT INTO customers (email, name, phone, annual_expires_at, last_invoice_id, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name), phone = COALESCE(EXCLUDED.phone, customers.phone), annual_expires_at = EXCLUDED.annual_expires_at, last_invoice_id = EXCLUDED.last_invoice_id, updated_at = NOW()`,
        [email.toLowerCase(), name, phone, expirationDate.toISOString(), invoiceId]
    );
}

async function updateMonthlyStatus(email, name, phone, invoiceId, status) {
    await pool.query(
        `INSERT INTO customers (email, name, phone, monthly_status, last_invoice_id, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name), phone = COALESCE(EXCLUDED.phone, customers.phone), monthly_status = EXCLUDED.monthly_status, last_invoice_id = EXCLUDED.last_invoice_id, updated_at = NOW()`,
        [email.toLowerCase(), name, phone, status, invoiceId]
    );
}

async function revokeAccessByInvoice(invoiceId, productType) {
    if (productType === 'annual' || productType === 'monthly') {
        await pool.query(
            `UPDATE customers SET annual_expires_at = NULL, monthly_status = 'canceled', updated_at = NOW() WHERE last_invoice_id = $1`,
            [invoiceId]
        );
    } else if (productType === 'lifetime') {
        await pool.query(
            `UPDATE access_control SET permission = 'canceled', reason = 'Acesso revogado via Webhook (refund, expired)' WHERE invoice_id = $1`,
            [invoiceId]
        );
    }
}

async function registerProspect(email, name, phone) {
    await pool.query(
        `INSERT INTO customers (email, name, phone, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (email) DO NOTHING`,
        [email.toLowerCase(), name, phone]
    );
}

async function updateGraceSermons(email, count, month) {
    await pool.query(
        `UPDATE customers SET grace_sermons_used = $1, grace_period_month = $2, updated_at = NOW() WHERE email = $3`,
        [count, month, email.toLowerCase()]
    );
}

async function logSermonActivity(details) {
    const { user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction } = details;
    await pool.query(
        `INSERT INTO activity_log (user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction]
    );
}

// --- Funções de Gerenciamento de Notificações Push ---

async function savePushSubscription(user_email, subscription_object) {
    const query = `
        INSERT INTO push_subscriptions (user_email, subscription_object)
        VALUES ($1, $2)
        ON CONFLICT (subscription_object) DO NOTHING
    `;
    await pool.query(query, [user_email, subscription_object]);
}

async function getAllPushSubscriptions() {
    const { rows } = await pool.query(`SELECT subscription_object FROM push_subscriptions`);
    return rows.map(row => row.subscription_object);
}

/**
 * NOVO: Verifica se um usuário já tem uma inscrição de notificação salva.
 * Retorna true se houver pelo menos uma inscrição, false caso contrário.
 */
async function checkIfUserIsSubscribed(user_email) {
    const query = `SELECT 1 FROM push_subscriptions WHERE user_email = $1 LIMIT 1`;
    const { rows } = await pool.query(query, [user_email]);
    return rows.length > 0;
}

/**
 * NOVO: Deleta uma inscrição de notificação específica do banco de dados.
 * O objeto de inscrição é usado como identificador único.
 */
async function deletePushSubscription(subscription_object) {
    const query = `DELETE FROM push_subscriptions WHERE subscription_object = $1`;
    await pool.query(query, [subscription_object]);
    console.log('[DB] Inscrição expirada removida do banco de dados.');
}


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
  logSermonActivity,
  savePushSubscription,
  getAllPushSubscriptions,
  // Exporta as novas funções
  checkIfUserIsSubscribed,
  deletePushSubscription
};
