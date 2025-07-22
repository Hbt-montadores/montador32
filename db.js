// db.js  –  gerencia a conexão Postgres e a tabela customers
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,   // variável do Render
  ssl: { rejectUnauthorized: false }            // exigido no Render Free
});

// Cria a tabela se ainda não existir
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      updated_at TIMESTAMP DEFAULT now()
    );
  `);
  console.log('✔️ customers table ready');
})();

// Função para inserir ou atualizar status
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

// Função que retorna true se o cliente está “paid”
async function isPaid(email) {
  const { rows } = await pool.query(
    `SELECT status FROM customers WHERE email = $1`,
    [email.toLowerCase()]
  );
  return rows[0]?.status === 'paid';
}

module.exports = { markStatus, isPaid };
