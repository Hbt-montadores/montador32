// db.js - Versão 5.0 (Nova Arquitetura com Acessos Separados e Migração)
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// FUNÇÃO DE MIGRAÇÃO: Executa uma única vez para mover dados antigos para a nova estrutura.
const runMigration = async (client) => {
    // 1. Verificar se a coluna 'status' (antiga) existe. Se não, a migração provavelmente já rodou.
    const checkColumnQuery = `SELECT column_name FROM information_schema.columns WHERE table_name='customers' AND column_name='status'`;
    const res = await client.query(checkColumnQuery);
    if (res.rowCount === 0) {
        console.log('✔️ A migração de dados parece já ter sido executada. Pulando etapa.');
        return;
    }
    console.log('⚠️ Detectada estrutura antiga. Iniciando migração de dados...');

    // 2. Mover dados de 'expires_at' para 'annual_expires_at'
    await client.query(`UPDATE customers SET annual_expires_at = expires_at WHERE expires_at IS NOT NULL;`);
    console.log('   -> Dados de "expires_at" movidos para "annual_expires_at".');

    // 3. Mover dados de 'status' para 'monthly_status'
    await client.query(`UPDATE customers SET monthly_status = status WHERE status IN ('paid', 'overdue', 'canceled');`);
    console.log('   -> Dados de "status" movidos para "monthly_status".');
    
    // 4. Remover as colunas antigas para finalizar a migração
    await client.query(`ALTER TABLE customers DROP COLUMN status, DROP COLUMN expires_at;`);
    console.log('✔️ Migração concluída: Colunas antigas removidas.');
};

(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Tabela customers com a NOVA ESTRUTURA
        await client.query(`
          CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            phone TEXT,
            -- Novos campos de acesso
            monthly_status TEXT, -- pode ser 'paid', 'overdue', 'canceled'
            last_monthly_invoice_id TEXT,
            annual_expires_at TIMESTAMP WITH TIME ZONE,
            last_annual_invoice_id TEXT,
            last_annual_paid_at TIMESTAMP WITH TIME ZONE,
            -- Campos de cortesia
            grace_sermons_used INT DEFAULT 0,
            grace_period_month TEXT,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
          );
        `);

        // Comandos para adicionar novas colunas caso a tabela já exista (garante retrocompatibilidade)
        const columns = [
            'monthly_status TEXT', 'last_monthly_invoice_id TEXT', 
            'annual_expires_at TIMESTAMP WITH TIME ZONE', 'last_annual_invoice_id TEXT', 
            'last_annual_paid_at TIMESTAMP WITH TIME ZONE', 'grace_sermons_used INT DEFAULT 0',
            'grace_period_month TEXT'
        ];
        for (const col of columns) {
            await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS ${col};`);
        }
        
        // Executa a migração dos dados
        await runMigration(client);

        console.log('✔️ Tabela "customers" pronta com a arquitetura final.');

        // Tabela de controle manual com NOVAS COLUNAS
        await client.query(`
          CREATE TABLE IF NOT EXISTS access_control (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            permission TEXT NOT NULL CHECK (permission IN ('allow', 'block')),
            reason TEXT,
            product_id TEXT,
            invoice_id TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
          );
        `);
        await client.query(`ALTER TABLE access_control ADD COLUMN IF NOT EXISTS product_id TEXT;`);
        await client.query(`ALTER TABLE access_control ADD COLUMN IF NOT EXISTS invoice_id TEXT;`);
        console.log('✔️ Tabela "access_control" pronta.');
        
        // Tabela de sessões
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

        // Tabela de atividades
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
        INSERT INTO customers (email, name, phone)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, customers.name),
            phone = COALESCE(EXCLUDED.phone, customers.phone)
        RETURNING *;
    `;
    return client.query(query, [email.toLowerCase(), name, phone]);
}

// NOVA FUNÇÃO
async function updateAnnualAccess(email, name, phone, invoiceId, paidAt) {
    const paidDate = new Date(paidAt);
    const expirationDate = new Date(paidDate);
    expirationDate.setDate(expirationDate.getDate() + 366); // Garante um ano completo

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureCustomerExists(client, email, name, phone);
        const query = `
            UPDATE customers SET
                annual_expires_at = $1,
                last_annual_invoice_id = $2,
                last_annual_paid_at = $3,
                updated_at = NOW()
            WHERE email = $4;
        `;
        await client.query(query, [expirationDate.toISOString(), invoiceId, paidDate.toISOString(), email.toLowerCase()]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// NOVA FUNÇÃO
async function updateMonthlyStatus(email, name, phone, invoiceId, status) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureCustomerExists(client, email, name, phone);
        const query = `
            UPDATE customers SET
                monthly_status = $1,
                last_monthly_invoice_id = $2,
                updated_at = NOW()
            WHERE email = $3;
        `;
        await client.query(query, [status, invoiceId, email.toLowerCase()]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// NOVA FUNÇÃO
async function updateLifetimeAccess(email, name, phone, invoiceId, productId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureCustomerExists(client, email, name, phone);
        const query = `
            INSERT INTO access_control (email, permission, reason, invoice_id, product_id)
            VALUES ($1, 'allow', 'Acesso via Webhook Eduzz', $2, $3)
            ON CONFLICT (email) DO UPDATE SET
                permission = 'allow',
                reason = 'Acesso via Webhook Eduzz (Atualizado)',
                invoice_id = EXCLUDED.invoice_id,
                product_id = EXCLUDED.product_id,
                created_at = NOW();
        `;
        await client.query(query, [email.toLowerCase(), invoiceId, productId]);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// NOVA FUNÇÃO
async function revokeAccessByInvoice(invoiceId, productType) {
    let query;
    if (productType === 'annual') {
        query = `UPDATE customers SET annual_expires_at = NOW() WHERE last_annual_invoice_id = $1;`;
    } else if (productType === 'monthly') {
        query = `UPDATE customers SET monthly_status = 'canceled' WHERE last_monthly_invoice_id = $1;`;
    } else if (productType === 'lifetime') {
        query = `DELETE FROM access_control WHERE invoice_id = $1;`;
    } else {
        return; // Não faz nada se o tipo de produto não for de acesso
    }
    await pool.query(query, [invoiceId]);
}

// NOVA FUNÇÃO
async function registerProspect(email, name, phone) {
    // Apenas insere o cliente se ele não existir, não altera status de quem já comprou
    const query = `
        INSERT INTO customers (email, name, phone)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO NOTHING;
    `;
    await pool.query(query, [email.toLowerCase(), name, phone]);
}


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

// RENOMEADA E ATUALIZADA (era getManualPermission)
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
  getAccessControlRule, // NOVA
  updateAnnualAccess,   // NOVA
  updateMonthlyStatus,  // NOVA
  updateLifetimeAccess, // NOVA
  revokeAccessByInvoice,// NOVA
  registerProspect,     // NOVA
  logSermonActivity,
  updateGraceSermons
};
