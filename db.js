// db.js - Versão Definitiva Consolidada

const { Pool } = require('pg');

// Configuração da conexão com o banco de dados a partir da variável de ambiente
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/**
 * Função auto-executável para inicializar o banco de dados.
 * Ela garante que todas as tabelas e colunas necessárias existam.
 */
(async () => {
  const client = await pool.connect();
  try {
    console.log('Verificando e preparando o banco de dados...');

    // Tabela 'customers': Armazena os dados principais dos clientes e status de planos
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        phone TEXT,
        monthly_status TEXT,
        annual_expires_at TIMESTAMP WITH TIME ZONE,
        grace_sermons_used INT DEFAULT 0,
        grace_period_month TEXT, -- Formato 'AAAA-MM'
        last_invoice_id TEXT,
        last_product_id TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Tabela 'access_control': Para regras manuais de acesso (vitalício, bloqueio)
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

    // Tabela 'activity_log': Registra a geração de sermões pelos usuários
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

    // Tabela 'user_sessions': Para armazenar as sessões de login dos usuários
    await client.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      ) WITH (OIDS=FALSE);
      
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'session_pkey' AND conrelid = 'user_sessions'::regclass
        ) THEN
          ALTER TABLE "user_sessions" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
        END IF;
      END; $$;

      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
    `);

    console.log('✔️  Tabelas do banco de dados prontas e verificadas.');

  } catch (err) {
    console.error('❌ Erro fatal ao inicializar o banco de dados:', err);
    // Em caso de erro na inicialização, o processo deve ser interrompido
    process.exit(1);
  } finally {
    client.release();
  }
})();


// --- FUNÇÕES DE CONSULTA ---

/**
 * Busca o registro de um cliente pelo email.
 * @param {string} email - O email do cliente.
 * @returns {Promise<object|null>} O registro do cliente ou nulo.
 */
async function getCustomerRecordByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM customers WHERE email = $1`, [email.toLowerCase()]);
  return rows[0] || null;
}

/**
 * Busca o registro de um cliente pelo número de telefone.
 * Normaliza o telefone para buscar apenas pelos últimos 6 dígitos.
 * @param {string} phone - O telefone do cliente.
 * @returns {Promise<object|null>} O registro do cliente ou nulo.
 */
async function getCustomerRecordByPhone(phone) {
  const digitsOnly = (phone || '').replace(/\D/g, '');
  if (digitsOnly.length < 6) return null;
  const lastSixDigits = digitsOnly.slice(-6);

  const query = `SELECT * FROM customers WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 6) = $1`;
  const { rows } = await pool.query(query, [lastSixDigits]);
  return rows[0] || null;
}

/**
 * Busca uma regra de controle de acesso para um email.
 * @param {string} email - O email do cliente.
 * @returns {Promise<object|null>} A regra de acesso ou nulo.
 */
async function getAccessControlRule(email) {
    const { rows } = await pool.query(`SELECT * FROM access_control WHERE email = $1`, [email.toLowerCase()]);
    return rows[0] || null;
}


// --- FUNÇÕES DE MODIFICAÇÃO (WEBHOOKS E ADMIN) ---

/**
 * Concede acesso vitalício. Insere ou atualiza a regra em 'access_control'.
 * Também garante que o cliente exista na tabela 'customers'.
 */
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

/**
 * Atualiza ou concede acesso anual. A data de expiração é calculada como 365 dias a partir do pagamento.
 */
async function updateAnnualAccess(email, name, phone, invoiceId, paidAt) {
    const expirationDate = new Date(paidAt);
    expirationDate.setDate(expirationDate.getDate() + 365);

    await pool.query(
        `INSERT INTO customers (email, name, phone, annual_expires_at, last_invoice_id, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name), phone = COALESCE(EXCLUDED.phone, customers.phone), annual_expires_at = EXCLUDED.annual_expires_at, last_invoice_id = EXCLUDED.last_invoice_id, updated_at = NOW()`,
        [email.toLowerCase(), name, phone, expirationDate.toISOString(), invoiceId]
    );
}

/**
 * Atualiza o status de uma assinatura mensal (ex: 'paid', 'overdue').
 */
async function updateMonthlyStatus(email, name, phone, invoiceId, status) {
    await pool.query(
        `INSERT INTO customers (email, name, phone, monthly_status, last_invoice_id, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, customers.name), phone = COALESCE(EXCLUDED.phone, customers.phone), monthly_status = EXCLUDED.monthly_status, last_invoice_id = EXCLUDED.last_invoice_id, updated_at = NOW()`,
        [email.toLowerCase(), name, phone, status, invoiceId]
    );
}

/**
 * Revoga o acesso baseado em uma fatura.
 * Para anuais/mensais, define o status/data como nulo. Para vitalício, muda a permissão para 'canceled'.
 */
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


// --- FUNÇÕES DE LÓGICA INTERNA ---

/**
 * Registra um novo prospect (cliente potencial que pode usar o período de cortesia).
 */
async function registerProspect(email, name, phone) {
    await pool.query(
        `INSERT INTO customers (email, name, phone, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT (email) DO NOTHING`,
        [email.toLowerCase(), name, phone]
    );
}

/**
 * Atualiza o contador de sermões de cortesia e o mês vigente.
 */
async function updateGraceSermons(email, count, month) {
    await pool.query(
        `UPDATE customers SET grace_sermons_used = $1, grace_period_month = $2, updated_at = NOW() WHERE email = $3`,
        [count, month, email.toLowerCase()]
    );
}

/**
 * Registra a atividade de geração de um sermão no log.
 */
async function logSermonActivity(details) {
    const { user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction } = details;
    await pool.query(
        `INSERT INTO activity_log (user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user_email, sermon_topic, sermon_audience, sermon_type, sermon_duration, model_used, prompt_instruction]
    );
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
  logSermonActivity
};
