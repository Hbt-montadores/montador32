// import-customers.js
// Este script lê um arquivo CSV e popula o banco de dados.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');

// --- CONFIGURAÇÃO ---
const CSV_FILE_PATH = path.join(__dirname, 'lista-anual.csv'); // O nome do arquivo que você vai subir
const PLAN_DURATION_DAYS = 365; // Duração do plano em dias

// Conexão com o banco de dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Função para normalizar telefone (a mesma do server.js)
function normalizePhone(phoneString) {
    if (!phoneString || typeof phoneString !== 'string') return null;
    const digitsOnly = phoneString.replace(/\D/g, '');
    if (digitsOnly.length < 8) return null;
    return digitsOnly.slice(-9);
}

// Função principal do script
async function runImport() {
  console.log('Iniciando a importação do arquivo CSV...');
  
  const clientsToImport = [];

  // 1. Lê e processa o arquivo CSV
  fs.createReadStream(CSV_FILE_PATH)
    .pipe(csv({ separator: ';' })) // IMPORTANTE: Usando ponto e vírgula como separador
    .on('data', (row) => {
      
      const email = row['Cliente / E-mail'];
      const name = row['Cliente / Nome'] || row['Cliente / Razão-Social'];
      const phone = row['Cliente / Fones'];
      const purchaseDateStr = row['Data de Criação'];
      const status = row['Status'];

      // Processa apenas faturas com status "Paga"
      if (email && purchaseDateStr && status && status.toLowerCase() === 'paga') {
        
        // Converte a data do formato DD/MM/AAAA HH:MM:SS para um objeto Date
        const [datePart, timePart] = purchaseDateStr.split(' ');
        const [day, month, year] = datePart.split('/');
        const formattedDate = `${year}-${month}-${day}T${timePart || '00:00:00'}`;
        const purchaseDate = new Date(formattedDate);

        // Calcula a data de expiração
        const expirationDate = new Date(purchaseDate);
        expirationDate.setDate(expirationDate.getDate() + PLAN_DURATION_DAYS);
        
        clientsToImport.push({
          email: email.toLowerCase(),
          name: name,
          phone: normalizePhone(phone),
          status: 'paid',
          expires_at: expirationDate.toISOString()
        });
      }
    })
    .on('end', async () => {
      console.log(`Leitura do CSV concluída. ${clientsToImport.length} clientes válidos encontrados.`);
      
      if (clientsToImport.length === 0) {
        console.log('Nenhum cliente para importar. Encerrando.');
        pool.end();
        return;
      }

      // 2. Conecta ao banco e insere/atualiza os dados
      const client = await pool.connect();
      try {
        console.log('Iniciando transação com o banco de dados...');
        await client.query('BEGIN');

        for (const customer of clientsToImport) {
          const query = `
            INSERT INTO customers (email, name, phone, status, expires_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (email) DO UPDATE 
              SET name = EXCLUDED.name,
                  phone = EXCLUDED.phone,
                  status = EXCLUDED.status,
                  expires_at = EXCLUDED.expires_at,
                  updated_at = NOW();
          `;
          await client.query(query, [
            customer.email,
            customer.name,
            customer.phone,
            customer.status,
            customer.expires_at
          ]);
        }

        await client.query('COMMIT');
        console.log(`✅ Sucesso! ${clientsToImport.length} clientes foram importados/atualizados no banco de dados.`);

      } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ ERRO! Ocorreu um problema durante a importação. Nenhuma alteração foi salva.');
        console.error(e);
      } finally {
        client.release();
        pool.end();
      }
    });
}

runImport();
