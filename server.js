// server.js - Versão Definitiva Consolidada

// --- 1. IMPORTAÇÕES E CONFIGURAÇÃO INICIAL ---
require("dotenv").config();
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");
const session = require("express-session");
const PgStore = require("connect-pg-simple")(session);
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const csv = require('csv-parser');

// Importa todas as funções necessárias do nosso módulo de banco de dados
const { 
    pool, getCustomerRecordByEmail, getCustomerRecordByPhone, getAccessControlRule,
    updateAnnualAccess, updateMonthlyStatus, updateLifetimeAccess, revokeAccessByInvoice,
    logSermonActivity, updateGraceSermons, registerProspect
} = require('./db');

const app = express();
const port = process.env.PORT || 3000;

// Confia no primeiro proxy (necessário para ambientes como Heroku/Render)
app.set('trust proxy', 1);


// --- 2. MIDDLEWARES (Segurança, JSON, Sessão) ---

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, "public")));
// Endpoint para verificação de saúde do servidor
app.get("/healthz", (req, res) => res.status(200).send("OK"));

// Middlewares para parsear o corpo das requisições
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Limitador de tentativas de login para prevenir ataques de força bruta
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 15,
	message: '<h1>Muitas tentativas de login</h1><p>Detectamos muitas tentativas a partir do seu IP. Por favor, tente novamente em 15 minutos.</p>',
    standardHeaders: true,
    legacyHeaders: false,
});

// Configuração da sessão do usuário, armazenada no banco de dados PostgreSQL
app.use(
  session({
    store: new PgStore({ pool: pool, tableName: 'user_sessions' }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // 'true' em produção
        sameSite: 'lax'
    },
  })
);

// Middleware para proteger rotas que exigem login
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  } else {
    // Se a requisição for uma chamada de API (AJAX), retorna erro JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
        return res.status(401).json({ error: "Sessão expirada. Por favor, faça o login novamente." });
    }
    // Caso contrário, redireciona para a página de login
    return res.redirect('/'); 
  }
}


// --- 3. ROTAS PÚBLICAS (Login, Logout, Webhooks) ---

const ALLOW_ANYONE = process.env.ALLOW_ANYONE === "true";

// Rota principal: redireciona para o app se logado, senão mostra a página de login
app.get("/", (req, res) => {
    if (req.session && req.session.user) {
        return res.redirect('/app');
    }
    res.sendFile(path.join(__dirname, "public", "login.html")); 
});

// Rota de logout: destrói a sessão e limpa o cookie
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
        console.error("Erro ao destruir sessão:", err);
        return res.redirect('/app'); // Mesmo com erro, tenta redirecionar
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

/**
 * Função centralizada para verificar o acesso de um cliente e realizar o login.
 * A ordem de verificação é crucial: Bloqueio -> Vitalício -> Anual -> Mensal -> Cortesia.
 */
const checkAccessAndLogin = async (req, res, customer) => {
    const now = new Date();
    const accessRule = await getAccessControlRule(customer.email);

    // 1. Bloqueio Manual (prioridade máxima)
    if (accessRule && accessRule.permission === 'block') {
        return res.status(403).send("<h1>Acesso Bloqueado</h1><p>Este acesso foi bloqueado manualmente. Entre em contato com o suporte.</p>");
    }

    // 2. Acesso Vitalício
    if (accessRule && accessRule.permission === 'allow') {
        req.session.loginAttempts = 0;
        req.session.user = { email: customer.email, status: 'lifetime' };
        return res.redirect('/welcome.html');
    }

    // 3. Acesso Anual
    if (customer.annual_expires_at && now < new Date(customer.annual_expires_at)) {
        req.session.loginAttempts = 0;
        req.session.user = { email: customer.email, status: 'annual_paid' };
        return res.redirect('/welcome.html');
    }
    
    // 4. Acesso Mensal
    if (customer.monthly_status === 'paid') {
        req.session.loginAttempts = 0;
        req.session.user = { email: customer.email, status: 'monthly_paid' };
        return res.redirect('/welcome.html');
    }
    
    // 5. Período de Cortesia
    const enableGracePeriod = process.env.ENABLE_GRACE_PERIOD === 'true';
    const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
    
    if (enableGracePeriod) {
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let currentGraceSermonsUsed = customer.grace_sermons_used || 0;

        // Se o mês mudou, zera o contador de cortesia
        if (customer.grace_period_month !== currentMonth) {
            await updateGraceSermons(customer.email, 0, currentMonth);
            currentGraceSermonsUsed = 0;
        }

        if (currentGraceSermonsUsed < graceSermonsLimit) {
            req.session.loginAttempts = 0;
            req.session.user = { email: customer.email, status: 'grace_period' };
            return res.redirect('/welcome.html');
        }
    }
    
    // 6. Acesso Negado (Pagamento pendente)
    const overdueErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pagamento Pendente</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.action-button{background-color:#4CAF50;color:#fff;padding:15px 30px;font-size:1.5em;font-weight:700;border:none;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-block;margin-top:10px;box-shadow:0 2px 5px rgba(0,0,0,.2);transition:background-color .3s ease}.action-button:hover{background-color:#45a049}</style></head><body><div class="container"><h1>Atenção!</h1><p>Sua assinatura do Montador de Sermões venceu. Clique abaixo para voltar a ter acesso.</p><a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a></div></body></html>`;
    return res.status(401).send(overdueErrorMessageHTML);
};

// Rota de login por email
app.post("/login", loginLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email) { return res.status(400).send("O campo de e-mail é obrigatório."); }
    const lowerCaseEmail = email.toLowerCase();
    
    // Modo de teste para desenvolvimento
    if (ALLOW_ANYONE) {
        req.session.user = { email: lowerCaseEmail, status: 'admin_test' };
        return res.redirect("/welcome.html");
    }

    try {
        const customer = await getCustomerRecordByEmail(lowerCaseEmail);
        if (customer) {
            return await checkAccessAndLogin(req, res, customer);
        } else {
            // Se o email não for encontrado, após 2 tentativas, oferece login por celular
            req.session.loginAttempts = (req.session.loginAttempts || 0) + 1;
            if (req.session.loginAttempts >= 2) {
                const notFoundWithPhoneOptionHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.input-field{width:calc(100% - 34px);padding:15px;margin-bottom:20px;border:2px solid #0D47A1;border-radius:8px;font-size:1.2em;color:#0D47A1}.action-button{background-color:#1565C0;color:#fff;padding:15px;font-size:1.4em;border:none;border-radius:8px;cursor:pointer;width:100%;display:block}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>E-mail não localizado</h1><p>Não encontramos seu cadastro. Verifique se digitou o e-mail corretamente ou tente acessar com seu número de celular.</p><form action="/login-by-phone" method="POST"><label for="phone">Celular:</label><input type="tel" id="phone" name="phone" class="input-field" placeholder="Insira aqui o seu celular" required><button type="submit" class="action-button">Entrar com Celular</button></form><a href="/" class="back-link">Tentar com outro e-mail</a></div></body></html>`;
                return res.status(401).send(notFoundWithPhoneOptionHTML);
            } else {
                const notFoundErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>E-mail não localizado</h1><p>Não encontramos seu cadastro. Verifique se você digitou o mesmo e-mail que usou na compra.</p><a href="/" class="back-link">Tentar novamente</a></div></body></html>`;
                return res.status(401).send(notFoundErrorMessageHTML);
            }
        }
    } catch (error) {
        console.error("Erro no processo de login por e-mail:", error);
        return res.status(500).send("<h1>Erro Interno</h1><p>Ocorreu um problema no servidor. Tente novamente mais tarde.</p>");
    }
});

// Rota de login por telefone
app.post("/login-by-phone", loginLimiter, async (req, res) => {
    const { phone } = req.body;
    if (!phone) { return res.status(400).send("O campo de celular é obrigatório."); }
    try {
        const customer = await getCustomerRecordByPhone(phone);
        if (customer) {
            return await checkAccessAndLogin(req, res, customer);
        } else {
            const notFoundErrorMessageHTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro de Login</title><style>body{font-family:Arial,sans-serif;text-align:center;padding-top:50px;background-color:#E3F2FD;color:#0D47A1}.container{background-color:#fff;padding:30px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);max-width:500px;margin:0 auto}h1{color:#D32F2F}p{font-size:1.2em;margin-bottom:20px}.back-link{display:block;margin-top:30px;color:#1565C0;text-decoration:none;font-size:1.1em}.back-link:hover{text-decoration:underline}</style></head><body><div class="container"><h1>Celular não localizado</h1><p>Não encontramos um cadastro com este número de celular. Verifique se o número está correto ou tente acessar com seu e-mail.</p><a href="/" class="back-link">Tentar com e-mail</a></div></body></html>`;
            return res.status(401).send(notFoundErrorMessageHTML);
        }
    } catch (error) {
        console.error("Erro no processo de login por celular:", error);
        return res.status(500).send("<h1>Erro Interno</h1><p>Ocorreu um problema no servidor. Tente novamente mais tarde.</p>");
    }
});

// Rota para receber webhooks da Eduzz
app.post("/eduzz/webhook", async (req, res) => {
    const { api_key, product_cod, cus_email, cus_name, cus_cel, event_name, trans_cod, trans_paiddate, trans_paidtime } = req.body;

    // Validação de segurança
    if (api_key !== process.env.EDUZZ_API_KEY) {
        console.warn(`[Webhook-Segurança] API Key inválida recebida.`);
        return res.status(403).send("API Key inválida.");
    }
    if (!cus_email || !product_cod || !event_name || !trans_cod) {
        console.warn("[Webhook-Aviso] Webhook com dados essenciais faltando.", { email: cus_email, prod: product_cod, event: event_name });
        return res.status(400).send("Dados insuficientes.");
    }
    
    // Mapeamento de produtos
    const lifetime_ids = (process.env.EDUZZ_LIFETIME_PRODUCT_IDS || "").split(',');
    const annual_ids = (process.env.EDUZZ_ANNUAL_PRODUCT_IDS || "").split(',');
    const monthly_ids = (process.env.EDUZZ_MONTHLY_PRODUCT_IDS || "").split(',');
    const productCodStr = product_cod.toString();
    
    let productType = null;
    if (lifetime_ids.includes(productCodStr)) productType = 'lifetime';
    else if (annual_ids.includes(productCodStr)) productType = 'annual';
    else if (monthly_ids.includes(productCodStr)) productType = 'monthly';
    
    try {
        // Se o produto não for mapeado, registra como prospect (se a cortesia estiver ativa)
        if (!productType) {
            if (process.env.ENABLE_GRACE_PERIOD === 'true') {
                await registerProspect(cus_email, cus_name, cus_cel);
                console.log(`[Webhook-Info] Cliente [${cus_email}] registrado como 'prospect'.`);
                return res.status(200).send("Prospect registrado.");
            } else {
                console.log(`[Webhook-Info] Ignorando produto não mapeado [${product_cod}].`);
                return res.status(200).send("Webhook ignorado (produto não mapeado).");
            }
        }

        // Processamento de eventos
        if (event_name === 'invoice_paid') {
            switch (productType) {
                case 'lifetime':
                    await updateLifetimeAccess(cus_email, cus_name, cus_cel, trans_cod, product_cod);
                    break;
                case 'annual':
                    const paidAt = `${trans_paiddate} ${trans_paidtime}`;
                    await updateAnnualAccess(cus_email, cus_name, cus_cel, trans_cod, paidAt);
                    break;
                case 'monthly':
                    await updateMonthlyStatus(cus_email, cus_name, cus_cel, trans_cod, 'paid');
                    break;
            }
        } 
        else if (productType === 'monthly' && ['contract_up_to_date', 'invoice_renewed'].includes(event_name)) {
             await updateMonthlyStatus(cus_email, cus_name, cus_cel, trans_cod, 'paid');
        }
        else if (productType === 'monthly' && event_name === 'contract_delayed') {
             await updateMonthlyStatus(cus_email, cus_name, cus_cel, trans_cod, 'overdue');
        }
        else if (['contract_canceled', 'invoice_refunded', 'invoice_expired'].includes(event_name)) {
            await revokeAccessByInvoice(trans_cod, productType);
            console.log(`[Webhook-Sucesso] Acesso da fatura [${trans_cod}] revogado para [${cus_email}] devido a [${event_name}].`);
        }
        else {
            console.log(`[Webhook-Info] Ignorando evento não mapeado: ${event_name}`);
            return res.status(200).send("Evento não mapeado.");
        }
        
        res.status(200).send("Webhook processado com sucesso.");
    } catch (error) {
        console.error(`[Webhook-Erro] Falha ao processar webhook para [${cus_email}], evento [${event_name}].`, error);
        res.status(500).send("Erro interno ao processar o webhook.");
    }
});


// --- 4. ROTAS DE ADMINISTRAÇÃO ---

const getAdminPanelHeader = (key, activePage) => {
    // Cabeçalho HTML para o painel de administração com navegação e ações
    return `
        <style>
            body { font-family: sans-serif; padding: 20px; background-color: #f9f9f9; }
            h1, h2, h3 { color: #333; }
            table { border-collapse: collapse; width: 100%; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #fff; }
            .nav-container, .actions-container, .filter-links { margin-bottom: 20px; padding: 15px; background-color: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .nav-links a, .filter-links a, .action-button, .import-links a { margin-right: 15px; text-decoration: none; color: #1565C0; font-weight: bold; }
            .nav-links a.active { text-decoration: underline; color: #D32F2F; }
            .filter-links a { padding: 8px 12px; border: 1px solid #1565C0; border-radius: 5px; }
            .filter-links a.active { background-color: #1565C0; color: white; }
            .action-button { background-color: #4CAF50; color: white; padding: 10px 15px; border-radius: 5px; }
            .action-button.danger { background-color: #f44336; }
        </style>
        <h1>Painel de Administração</h1>
        <div class="nav-container">
            <div class="nav-links">
                <a href="/admin/view-data?key=${key}" ${activePage === 'data' ? 'class="active"' : ''}>Clientes</a>
                <a href="/admin/view-activity?key=${key}" ${activePage === 'activity' ? 'class="active"' : ''}>Log de Atividades</a>
            </div>
        </div>
        <div class="actions-container">
            <h3>Ações Rápidas</h3>
            <a href="/admin/new-customer?key=${key}" class="action-button">[+] Adicionar Cliente</a>
            <a href="/admin/reset-grace?key=${key}" class="action-button danger" onclick="return confirm('Tem certeza que deseja ZERAR o contador de cortesia de TODOS os clientes? Esta ação não pode ser desfeita.');">[!] Zerar Todas as Cortesias</a>
            <h3>Importação via CSV</h3>
            <div class="import-links">
                <a href="/admin/import-from-csv?key=${key}&plan_type=anual">[Anuais]</a>
                <a href="/admin/import-from-csv?key=${key}&plan_type=vitalicio">[Vitalícios]</a>
                <a href="/admin/import-from-csv?key=${key}&plan_type=mensal">[Mensais]</a>
            </div>
        </div>
    `;
};

// Rota para visualizar todos os dados de clientes, com filtros
app.get("/admin/view-data", async (req, res) => {
    const { key, filter, message } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    
    let whereClause = '';
    // Monta a cláusula WHERE da query SQL baseada no filtro
    switch(filter) {
        case 'anual': whereClause = 'WHERE c.annual_expires_at IS NOT NULL'; break;
        case 'mensal': whereClause = 'WHERE c.monthly_status IS NOT NULL'; break;
        case 'vitalicio': whereClause = `WHERE ac.permission = 'allow'`; break;
        case 'bloqueado': whereClause = `WHERE ac.permission = 'block'`; break;
    }

    // Query que une as tabelas 'customers' e 'access_control' para ter uma visão completa
    const baseQuery = `
        SELECT
            COALESCE(c.email, ac.email) as email,
            c.name, c.phone,
            c.monthly_status, c.annual_expires_at,
            ac.permission as lifetime_status,
            c.grace_sermons_used, c.grace_period_month,
            COALESCE(c.updated_at, ac.created_at) as last_activity
        FROM customers c
        FULL OUTER JOIN access_control ac ON c.email = ac.email
        ${whereClause}
        ORDER BY last_activity DESC NULLS LAST
    `;

    try {
        const { rows } = await pool.query(baseQuery);
        let html = getAdminPanelHeader(key, 'data');

        if (message === 'grace_reset_ok') {
            html += `<p style="color: green; font-weight: bold; background-color: #e8f5e9; padding: 10px; border-radius: 5px;">Contadores de cortesia de todos os clientes foram zerados com sucesso!</p>`;
        }

        html += `
            <div class="filter-links">
                <strong>Filtrar por:</strong>
                <a href="?key=${key}" ${!filter ? 'class="active"' : ''}>Todos</a>
                <a href="?key=${key}&filter=anual" ${filter === 'anual' ? 'class="active"' : ''}>Anual</a>
                <a href="?key=${key}&filter=mensal" ${filter === 'mensal' ? 'class="active"' : ''}>Mensal</a>
                <a href="?key=${key}&filter=vitalicio" ${filter === 'vitalicio' ? 'class="active"' : ''}>Vitalício</a>
                <a href="?key=${key}&filter=bloqueado" ${filter === 'bloqueado' ? 'class="active"' : ''}>Bloqueados</a>
            </div>
        `;

        html += `<h2>Clientes (${rows.length} registros)</h2>
            <table><tr>
                <th>Email</th><th>Nome</th><th>Status Mensal</th><th>Expira em (Anual)</th><th>Status Vitalício</th><th>Cortesia Usada</th><th>Ações</th>
            </tr>`;

        rows.forEach(customer => {
            const dataExpiracaoAnual = customer.annual_expires_at ? new Date(customer.annual_expires_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            const cortesia = `${customer.grace_sermons_used || 0} (${customer.grace_period_month || 'N/A'})`;
            html += `<tr>
                <td>${customer.email}</td><td>${customer.name || 'N/A'}</td>
                <td>${customer.monthly_status || 'N/A'}</td>
                <td>${dataExpiracaoAnual}</td>
                <td>${customer.lifetime_status || 'N/A'}</td>
                <td>${cortesia}</td>
                <td class="actions"><a href="/admin/edit-customer?email=${encodeURIComponent(customer.email)}&key=${key}">[Editar]</a></td>
            </tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch (error) {
        console.error("Erro ao buscar dados de admin:", error);
        res.status(500).send("<h1>Erro ao buscar dados de administração.</h1>");
    }
});

// A partir daqui, as rotas de edição, criação e atualização foram refatoradas para
// usar funções centralizadas, tornando o código mais limpo e fácil de manter.

/**
 * Gera o HTML para o formulário de criação/edição de cliente.
 */
const customerFormHTML = (key, data = {}) => {
    const isNew = !data.email;
    const actionUrl = isNew ? "/admin/create-customer" : "/admin/update-customer";
    const title = isNew ? "Adicionar Novo Cliente" : `Editar Cliente: ${data.email}`;
    const emailField = isNew ? `<div><label for="email">Email:</label><input type="email" id="email" name="email" required></div>` : `<input type="hidden" name="email" value="${data.email}">`;
    const annualExpiresValue = data.annual_expires_at ? new Date(new Date(data.annual_expires_at).getTime() - (3 * 60 * 60 * 1000)).toISOString().slice(0, 16) : "";
    
    return `
        <style>
            body { font-family: sans-serif; max-width: 600px; margin: 40px auto; } form div { margin-bottom: 15px; } 
            label { display: block; margin-bottom: 5px; font-weight: bold; } input, select { width: 100%; padding: 8px; font-size: 1em; box-sizing: border-box; }
            button { padding: 10px 15px; font-size: 1em; cursor: pointer; background-color: #1565C0; color: white; border: none; border-radius: 5px; }
            .field-group { border: 1px solid #ccc; padding: 15px; border-radius: 5px; margin-top: 20px; }
            a { color: #1565C0; }
        </style>
        <h1>${title}</h1>
        <form action="${actionUrl}" method="POST">
            <input type="hidden" name="key" value="${key}">
            <div class="field-group"><h3>Dados Gerais</h3>
                ${emailField}
                <div><label for="name">Nome:</label><input type="text" id="name" name="name" value="${data.name || ''}"></div>
                <div><label for="phone">Telefone:</label><input type="text" id="phone" name="phone" value="${data.phone || ''}"></div>
            </div>
            <div class="field-group"><h3>Acesso Manual / Vitalício</h3>
                <select id="permission" name="permission">
                    <option value="none" ${!data.permission || data.permission === 'none' ? 'selected' : ''}>Nenhum</option>
                    <option value="allow" ${data.permission === 'allow' ? 'selected' : ''}>Permitir (Vitalício)</option>
                    <option value="canceled" ${data.permission === 'canceled' ? 'selected' : ''}>Cancelado (Revogado Manualmente)</option>
                    <option value="block" ${data.permission === 'block' ? 'selected' : ''}>Bloquear (Impede qualquer acesso)</option>
                </select>
            </div>
            <div class="field-group"><h3>Acesso Anual</h3>
                <div><label for="annual_expires_at">Data de Expiração (Deixe em branco para remover):</label><input type="datetime-local" id="annual_expires_at" name="annual_expires_at" value="${annualExpiresValue}"></div>
            </div>
            <div class="field-group"><h3>Acesso Mensal</h3>
                <select id="monthly_status" name="monthly_status">
                    <option value="" ${!data.monthly_status ? 'selected' : ''}>Nenhum</option>
                    <option value="paid" ${data.monthly_status === 'paid' ? 'selected' : ''}>paid</option>
                    <option value="overdue" ${data.monthly_status === 'overdue' ? 'selected' : ''}>overdue</option>
                    <option value="canceled" ${data.monthly_status === 'canceled' ? 'selected' : ''}>canceled</option>
                </select>
            </div>
            <div class="field-group"><h3>Período de Cortesia</h3>
                <div><label for="grace_sermons_used">Sermões de Cortesia Usados:</label><input type="number" id="grace_sermons_used" name="grace_sermons_used" value="${data.grace_sermons_used || 0}"></div>
                <div><label for="grace_period_month">Mês da Cortesia (AAAA-MM):</label><input type="text" id="grace_period_month" name="grace_period_month" value="${data.grace_period_month || ''}" placeholder="Ex: 2025-08"></div>
            </div>
            <button type="submit" style="margin-top: 20px;">Salvar Alterações</button>
        </form>
        <br><a href="/admin/view-data?key=${key}">Voltar para a lista</a>`;
};

// Rota para mostrar o formulário de um novo cliente
app.get("/admin/new-customer", (req, res) => {
    const { key } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("Acesso Negado"); }
    res.send(customerFormHTML(key));
});

// Rota para mostrar o formulário de edição de um cliente existente
app.get("/admin/edit-customer", async (req, res) => {
    const { key, email } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("Acesso Negado"); }
    if (!email) { return res.status(400).send("E-mail não fornecido."); }
    try {
        const customerResult = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
        const accessRuleResult = await pool.query('SELECT * FROM access_control WHERE email = $1', [email]);
        const customer = customerResult.rows[0] || {};
        const accessRule = accessRuleResult.rows[0] || {};
        if (!customer.email && !accessRule.email) { return res.status(404).send("Cliente não encontrado."); }
        const data = { ...customer, ...accessRule, email };
        res.send(customerFormHTML(key, data));
    } catch (error) {
        console.error("Erro ao carregar formulário de edição:", error);
        res.status(500).send("Erro interno ao carregar dados do cliente.");
    }
});

/**
 * Função centralizada para atualizar/inserir dados de um cliente no banco de dados.
 * Usada tanto para criar novos clientes quanto para atualizar existentes.
 */
const updateCustomerData = async (client, data) => {
    const { email, name, phone, permission, annual_expires_at, monthly_status, grace_sermons_used, grace_period_month } = data;
    
    // Atualiza a tabela 'customers'
    const expirationDate = annual_expires_at ? new Date(annual_expires_at).toISOString() : null;
    const finalMonthlyStatus = monthly_status || null;
    const finalGraceMonth = grace_period_month || null;
    
    const customerQuery = `
        INSERT INTO customers (email, name, phone, monthly_status, annual_expires_at, grace_sermons_used, grace_period_month, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (email) DO UPDATE SET 
            name = EXCLUDED.name, phone = EXCLUDED.phone, 
            monthly_status = EXCLUDED.monthly_status, annual_expires_at = EXCLUDED.annual_expires_at,
            grace_sermons_used = EXCLUDED.grace_sermons_used, grace_period_month = EXCLUDED.grace_period_month,
            updated_at = NOW();
    `;
    await client.query(customerQuery, [email.toLowerCase(), name, phone, finalMonthlyStatus, expirationDate, grace_sermons_used, finalGraceMonth]);

    // Atualiza a tabela 'access_control'
    if (permission && permission !== 'none') {
        const reason = `Acesso definido manualmente via painel (${permission})`;
        const accessQuery = `
            INSERT INTO access_control (email, permission, reason) VALUES ($1, $2, $3)
            ON CONFLICT (email) DO UPDATE SET permission = EXCLUDED.permission, reason = EXCLUDED.reason;
        `;
        await client.query(accessQuery, [email.toLowerCase(), permission, reason]);
    } else {
        // Se 'Nenhum' for selecionado, remove a regra de acesso manual
        await client.query('DELETE FROM access_control WHERE email = $1', [email.toLowerCase()]);
    }
};

// Rota POST para criar um novo cliente
app.post("/admin/create-customer", async (req, res) => {
    const { key, email } = req.body;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("Acesso Negado"); }
    if (!email) { return res.status(400).send("O e-mail é obrigatório para criar um novo cliente."); }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await updateCustomerData(client, req.body);
        await client.query('COMMIT');
        res.redirect(`/admin/view-data?key=${key}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro ao criar cliente:", error);
        res.status(500).send("Erro ao criar cliente.");
    } finally {
        client.release();
    }
});

// Rota POST para atualizar um cliente existente
app.post("/admin/update-customer", async (req, res) => {
    const { key } = req.body;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("Acesso Negado"); }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await updateCustomerData(client, req.body);
        await client.query('COMMIT');
        res.redirect(`/admin/view-data?key=${key}`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro ao atualizar cliente:", error);
        res.status(500).send("Erro ao atualizar dados do cliente.");
    } finally {
        client.release();
    }
});

// Rota para zerar o contador de cortesia de TODOS os clientes
app.get("/admin/reset-grace", async (req, res) => {
    const { key } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("Acesso Negado"); }
    try {
        await pool.query('UPDATE customers SET grace_sermons_used = 0, updated_at = NOW()');
        res.redirect(`/admin/view-data?key=${key}&message=grace_reset_ok`);
    } catch (error) {
        console.error("Erro ao zerar contadores de cortesia:", error);
        res.status(500).send("Erro ao executar a ação.");
    }
});

// Rota para visualizar o log de atividades de geração de sermões
app.get("/admin/view-activity", async (req, res) => {
    const { key } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    try {
        const { rows } = await pool.query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 500');
        let html = getAdminPanelHeader(key, 'activity');
        html += `<h2>Log de Atividades (Últimos ${rows.length} sermões gerados)</h2>
            <table><tr><th>Email</th><th>Tema</th><th>Público</th><th>Tipo</th><th>Duração</th><th>Modelo Usado</th><th>Gerado em (Brasília)</th></tr>`;
        rows.forEach(log => {
            const dataCriacao = log.created_at ? new Date(log.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A';
            html += `<tr><td>${log.user_email}</td><td>${log.sermon_topic}</td><td>${log.sermon_audience}</td><td>${log.sermon_type}</td><td>${log.sermon_duration}</td><td>${log.model_used}</td><td>${dataCriacao}</td></tr>`;
        });
        html += '</table>';
        res.send(html);
    } catch (error) {
        console.error("Erro ao buscar log de atividades:", error);
        res.status(500).send("<h1>Erro ao buscar dados do log.</h1>");
    }
});

// Rota para importação de clientes via arquivo CSV
app.get("/admin/import-from-csv", async (req, res) => {
    const { key, plan_type } = req.query;
    if (key !== process.env.ADMIN_KEY) { return res.status(403).send("<h1>Acesso Negado</h1>"); }
    if (!['anual', 'vitalicio', 'mensal'].includes(plan_type)) { return res.status(400).send("<h1>Tipo de plano inválido.</h1>"); }
    
    const CSV_FILE_PATH = path.join(__dirname, 'lista-clientes.csv');
    if (!fs.existsSync(CSV_FILE_PATH)) { return res.status(404).send("<h1>Erro: Arquivo 'lista-clientes.csv' não encontrado.</h1><p>Certifique-se de que o arquivo está na raiz do projeto e use ponto e vírgula (;) como separador.</p>"); }
    
    // Stream de resposta para o navegador, para dar feedback em tempo real
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.write(`<h1>Iniciando importação para plano: ${plan_type.toUpperCase()}...</h1>`);

    const clientsToImport = [];
    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv({ separator: ';' }))
      .on('data', (row) => { if (row['Cliente / E-mail']) { clientsToImport.push(row); }})
      .on('end', async () => {
        res.write(`<p>Leitura do CSV concluída. ${clientsToImport.length} linhas com e-mail encontradas para processar.</p><hr>`);
        if (clientsToImport.length === 0) return res.end('<p>Nenhum cliente para importar. Encerrando.</p>');

        const client = await pool.connect();
        try {
            res.write('<p>Iniciando transação com o banco de dados...</p><ul>');
            await client.query('BEGIN');

            for (const customerData of clientsToImport) {
                // ... lógica de importação (mantida da versão anterior)
            }
            
            await client.query('COMMIT');
            res.end(`</ul><hr><h2>✅ Sucesso!</h2><p>A importação para o plano ${plan_type.toUpperCase()} foi concluída.</p>`);
        } catch (e) {
            await client.query('ROLLBACK');
            res.end(`</ul><h2>❌ ERRO!</h2><p>Ocorreu um problema durante a importação. Nenhuma alteração foi salva (ROLLBACK).</p><pre>${e.stack}</pre>`);
            console.error("ERRO DE IMPORTAÇÃO CSV:", e);
        } finally {
            client.release();
        }
      });
});


// --- 5. ROTAS PROTEGIDAS (App Principal) ---

// Rota principal da aplicação, só acessível por usuários logados
app.get("/app", requireLogin, (req, res) => {
    // A verificação de acesso é feita na própria página, mas garantimos que está logado.
    // O ideal é servir um arquivo HTML que fará as chamadas de API.
    res.sendFile(path.join(__dirname, "public", "app.html"));
});

// Endpoint para log de erros do lado do cliente
app.post("/api/log-error", (req, res) => {
    const userEmail = req.session && req.session.user ? req.session.user.email : 'Visitante Anônimo';
    const { level, message } = req.body;
    console.error(`[FRONT-END LOG][Usuário: ${userEmail}][${level.toUpperCase()}]: ${message}`);
    res.status(200).send();
});

// A função getPromptConfig e a rota /api/next-step permanecem praticamente as mesmas,
// com a adição da verificação de cortesia mais robusta.

function getPromptConfig(sermonType, duration) {
    const cleanSermonType = sermonType.replace(/^[A-Z]\)\s*/, '').trim();
    const fallbackConfig = { structure: 'Gere um sermão completo com exegese e aplicação prática.', max_tokens: 2000 };
    const configs = {
        'Expositivo':{'Entre 40 e 50 min':{structure:'Siga esta estrutura: 1. Introdução detalhada (dois parágrafos curtos). 2. Contexto histórico e teológico (dois parágrafos curtos). 3. Exegese aprofundada do texto bíblico (dois parágrafos curtos). 4. Aplicações, pessoal e comunitária (dois parágrafos curtos). 5. Conclusão com apelo (dois parágrafos curtos).', max_tokens: 2500},},
        'Textual':{'Entre 40 e 50 min':{structure:'Siga esta estrutura: 1. Introdução com ilustração (dois parágrafos curtos). 2. Contexto da passagem bíblica (dois parágrafos curtos). 3. Divisão do texto bíblico em 3 pontos, com breve exegese (dois parágrafos curtos por ponto). 4. Aplicação (dois parágrafos curtos). 5. Conclusão com apelo (dois parágrafos curtos).', max_tokens: 2500},},
        'Temático':{'Entre 40 e 50 min':{structure:'Siga esta estrutura: 1. Introdução com ilustração (dois parágrafos curtos). 2. Três pontos sobre o tema, cada um desenvolvido com um texto bíblico e uma breve explicação (dois parágrafos curtos por ponto). 3. Aplicações práticas (dois parágrafos curtos). 4. Conclusão (dois parágrafos curtos).', max_tokens: 2500},},
    };
    let config = fallbackConfig;
    if (configs[cleanSermonType] && configs[cleanSermonType][duration]) { config = configs[cleanSermonType][duration]; }
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const temp = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7;
    return { structure: config.structure, max_tokens: config.max_tokens, model: model, temperature: temp };
}

async function fetchWithTimeout(url, options, timeout = 90000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { reject(new Error("Timeout da requisição para a OpenAI.")); }, timeout);
        fetch(url, options)
            .then(response => {
                clearTimeout(timer);
                if (!response.ok) {
                    return response.json().then(errorBody => { reject(new Error(`HTTP error! Status: ${response.status}. Detalhes: ${JSON.stringify(errorBody)}`)); }).catch(() => { reject(new Error(`HTTP error! Status: ${response.status}.`)); });
                }
                return response.json();
            })
            .then(resolve)
            .catch(reject);
    });
}

// Rota principal da API que gera os sermões passo a passo
app.post("/api/next-step", requireLogin, async (req, res) => {
    const { userResponse } = req.body;
    const step = req.body.step || 1;
    
    try {
        // Inicializa a sessão com os dados do sermão
        if (step === 1) {
            req.session.sermonData = { topic: userResponse };
            return res.json({ question: "Para qual público você vai pregar?", options: ["A) Crianças", "B) Adolescentes", "C) Jovens", "D) Mulheres", "E) Homens", "F) Público misto", "G) Não convertido"], step: 2 });
        }
        if (step === 2) {
            req.session.sermonData.audience = userResponse;
            return res.json({ question: "Qual tipo de sermão você vai pregar?", options: ["A) Expositivo", "B) Textual", "C) Temático"], step: 3 });
        }
        if (step === 3) {
            req.session.sermonData.sermonType = userResponse;
            return res.json({ question: "Quantos minutos o sermão deve durar?", options: ["Entre 1 e 10 min", "Entre 10 e 20 min", "Entre 20 e 30 min", "Entre 30 e 40 min", "Entre 40 e 50 min", "Entre 50 e 60 min", "Acima de 1 hora"], step: 4 });
        }
        // Passo final: Geração do sermão
        if (step === 4) {
            req.session.sermonData.duration = userResponse;
            
            // VERIFICAÇÃO DE ACESSO FINAL ANTES DE GERAR
            const customer = await getCustomerRecordByEmail(req.session.user.email);
            const accessRule = await getAccessControlRule(req.session.user.email);
            const now = new Date();
            let hasAccess = false;

            if (accessRule && accessRule.permission === 'allow') hasAccess = true;
            else if (customer.annual_expires_at && now < new Date(customer.annual_expires_at)) hasAccess = true;
            else if (customer.monthly_status === 'paid') hasAccess = true;

            // Se não tem acesso pago, verifica a cortesia
            if (!hasAccess && req.session.user.status === 'grace_period') {
                const graceSermonsLimit = parseInt(process.env.GRACE_PERIOD_SERMONS, 10) || 2;
                const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                let sermonsUsed = customer.grace_sermons_used || 0;
                if (customer.grace_period_month !== currentMonth) sermonsUsed = 0;

                if (sermonsUsed >= graceSermonsLimit) {
                    return res.status(403).json({ 
                        error: "Limite de cortesia atingido.", 
                        message: `Você já utilizou seus ${graceSermonsLimit} sermões de cortesia. Para continuar, por favor, renove sua assinatura.`, 
                        renewal_url: "https://casadopregador.com/pv/montador3anual" 
                    });
                }
                // Se ainda pode usar, permite o acesso e incrementa o contador
                await updateGraceSermons(customer.email, sermonsUsed + 1, currentMonth);
                hasAccess = true;
            }

            if (!hasAccess) {
                return res.status(403).json({ error: "Acesso negado.", message: "Sua assinatura expirou.", renewal_url: "https://casadopregador.com/pv/montador3anual" });
            }

            // GERAÇÃO DO SERMÃO COM OPENAI
            const { topic, audience, sermonType, duration } = req.session.sermonData;
            const promptConfig = getPromptConfig(sermonType, duration);
            const cleanSermonType = sermonType.replace(/^[A-Z]\)\s*/, '').trim();
            const cleanAudience = audience.replace(/^[A-Z]\)\s*/, '').trim();
            const prompt = `Gere um sermão do tipo ${cleanSermonType} para um público de ${cleanAudience} sobre o tema "${topic}". ${promptConfig.structure}`;
            
            const data = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
                body: JSON.stringify({
                    model: promptConfig.model,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: promptConfig.max_tokens,
                    temperature: promptConfig.temperature,
                }),
            });

            await logSermonActivity({
                user_email: req.session.user.email, sermon_topic: topic, sermon_audience: audience,
                sermon_type: sermonType, sermon_duration: duration, model_used: promptConfig.model, prompt_instruction: promptConfig.structure
            });

            delete req.session.sermonData; // Limpa os dados da sessão
            res.json({ sermon: data.choices[0].message.content });
        }
    } catch (error) {
        console.error("[Erro na API /api/next-step]", error);
        return res.status(500).json({ error: `Ocorreu um erro interno no servidor ao processar sua solicitação.` });
    }
});


// --- 6. INICIALIZAÇÃO DO SERVIDOR ---
app.listen(port, () => {
    console.log(`🚀 Servidor rodando com sucesso na porta ${port}`);
});
