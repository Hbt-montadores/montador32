// db.js - Versão de Diagnóstico e Produção com Schema Canônico

const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

// Configurações de Pool ajustadas para Supabase Transaction Mode (Porta 6543 no DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 30000, // AUMENTADO PARA 30s: Tempo suficiente para a inicialização no Render
  idleTimeoutMillis: 30000,       // AUMENTADO PARA 30s
  max: 10,                        // Pool max entre 5 e 10
});

// ===================================================================
// TRATAMENTO DE ERROS DO POOL
// ===================================================================
pool.on('error', (err) => {
  console.error('[ERRO NO POOL DE CONEXÕES PG]', err);
});

/**
 * Inicialização e migração do banco de dados com Schema Canônico.
 */
(async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('Verificando e preparando o banco de dados (Schema Canônico)...');

    // --- Tabela 'customers' ---
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
        last_product_id TEXT,
        last_generated_at TIMESTAMP WITH TIME ZONE
      );
    `);

    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_invoice_id TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_product_id TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMP WITH TIME ZONE;`);
    
    console.log('✔️ Tabela "customers" pronta.');

    // --- Tabela 'sermons' (Padronizada) ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS sermons (
        id SERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        topic TEXT NOT NULL,
        topic_normalized TEXT NOT NULL,
        audience TEXT NOT NULL,
        sermon_type TEXT NOT NULL,
        duration TEXT NOT NULL,
        content TEXT NOT NULL,
        saved BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // Migrações para garantir que colunas antigas ou faltando sejam ajustadas
    await client.query(`ALTER TABLE sermons ADD COLUMN IF NOT EXISTS topic_normalized TEXT;`);
    await client.query(`ALTER TABLE sermons ADD COLUMN IF NOT EXISTS saved BOOLEAN DEFAULT false;`);
    
    // CORREÇÃO DE PERFORMANCE: Trava de segurança para evitar Table Lock no boot do Render
    // Só executa o UPDATE pesado se a coluna ainda aceitar valores nulos (ou seja, se a migração nunca foi feita)
    const checkNullQuery = await client.query(`
        SELECT is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'sermons' AND column_name = 'topic_normalized';
    `);
    
    if (checkNullQuery.rows.length > 0 && checkNullQuery.rows[0].is_nullable === 'YES') {
        console.log('Executando migração de dados pendentes na tabela sermons...');
        await client.query(`UPDATE sermons SET topic_normalized = LOWER(topic) WHERE topic_normalized IS NULL;`);
        await client.query(`ALTER TABLE sermons ALTER COLUMN topic SET NOT NULL;`);
        await client.query(`ALTER TABLE sermons ALTER COLUMN topic_normalized SET NOT NULL;`);
    }

    // Índices otimizados para Cache e Histórico
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sermons_cache_composite 
      ON sermons (topic_normalized, audience, sermon_type, duration);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sermons_user_history
      ON sermons (user_email, created_at DESC);
    `);
    
    console.log('✔️ Tabela "sermons" pronta e migrada.');

    // --- Tabela 'access_control' ---
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

    // --- Tabela 'activity_log' ---
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

    // --- Tabela 'user_sessions' ---
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
    console.error('❌ Erro ao inicializar o banco de dados:', err);
  } finally {
    if (client) client.release();
  }
})();

// --- FUNÇÕES DE CONSULTA E MODIFICAÇÃO DE ASSINATURAS ---

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

// --- FUNÇÕES DE CONTROLE DE SERMÕES, CACHE E COOLDOWN (NOMES CANÔNICOS) ---

async function getIdenticalSermon(email, topic_normalized, audience, type, duration) {
    const query = `
        SELECT id, content, saved FROM sermons
        WHERE user_email = $1 AND topic_normalized = $2 AND audience = $3 AND sermon_type = $4 AND duration = $5
        ORDER BY created_at DESC LIMIT 1
    `;
    const { rows } = await pool.query(query, [email.toLowerCase(), topic_normalized, audience, type, duration]);
    return rows[0] || null;
}

async function checkMonthlyCooldown(email, duration, topic_normalized) {
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const longSermons = ["Entre 40 e 50 min", "Entre 50 e 60 min", "Acima de 1 hora"];
    const isCurrentLong = longSermons.includes(duration);

    const query = `
        SELECT topic_normalized, duration FROM sermons 
        WHERE user_email = $1 AND created_at >= $2
    `;
    const { rows } = await pool.query(query, [email.toLowerCase(), fifteenMinsAgo.toISOString()]);

    for (let row of rows) {
        if (row.topic_normalized === topic_normalized) {
            return { blocked: true, reason: "Você já preparou uma mensagem com um tema muito parecido nos últimos 15 minutos. Por favor, aguarde para gerar novamente." };
        }
        if (isCurrentLong && longSermons.includes(row.duration)) {
            return { blocked: true, reason: "Você gerou um sermão longo recentemente. Devido à alta complexidade, aguarde alguns minutos para preparar outro dessa magnitude." };
        }
    }
    return { blocked: false };
}

async function saveGeneratedSermon(email, topic, topic_normalized, audience, type, duration, content) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const insertQuery = `
            INSERT INTO sermons (user_email, topic, topic_normalized, audience, sermon_type, duration, content)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `;
        const res = await client.query(insertQuery, [email.toLowerCase(), topic, topic_normalized, audience, type, duration, content]);
        const newSermonId = res.rows[0].id;

        const updateCustomerQuery = `
            UPDATE customers
            SET last_generated_at = NOW()
            WHERE email = $1
        `;
        await client.query(updateCustomerQuery, [email.toLowerCase()]);

        await client.query('COMMIT');
        return newSermonId;
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('[ERRO] Falha ao salvar sermão gerado:', e);
        throw e;
    } finally {
        client.release();
    }
}

async function markSermonAsSaved(email, id, savedStatus) {
    await pool.query(
        `UPDATE sermons SET saved = $1 WHERE id = $2 AND user_email = $3`,
        [savedStatus, id, email.toLowerCase()]
    );
}

async function getUserRecentSermons(email, limit = 20) {
    const query = `
        SELECT id, topic, audience, sermon_type as type, duration, content, created_at, saved
        FROM sermons
        WHERE user_email = $1
        ORDER BY created_at DESC
        LIMIT $2
    `;
    const { rows } = await pool.query(query, [email.toLowerCase(), limit]);
    return rows;
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
  getIdenticalSermon,
  checkMonthlyCooldown,
  saveGeneratedSermon,
  markSermonAsSaved,
  getUserRecentSermons
};
