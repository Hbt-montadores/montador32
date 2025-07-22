require("dotenv").config();
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/healthz", (req, res) => res.status(200).send("OK"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Variável global para dados de sessão temporários (PROBLEMA: não é seguro para múltiplos usuários)
// Recomenda-se usar express-session para um gerenciamento de sessão adequado
let session = {};

// Bloco de código para bloqueio de tentativas por IP - TEMPORARIAMENTE DESABILITADO conforme solicitado
/*
let loginAttempts = {};
const LOGIN_BLOCK_TIME = 15 * 60 * 1000; // 15 minutos
*/

// Carrega as senhas do painel Secrets (com fallback nos valores antigos)
const passwords = {
    "01": process.env.PASSWORD_01 || "011234", // Janeiro
    "02": process.env.PASSWORD_02 || "029876", // Fevereiro
    "03": process.env.PASSWORD_03 || "032165", // Março
    "04": process.env.PASSWORD_04 || "047892", // Abril
    "05": process.env.PASSWORD_05 || "058374", // Maio
    "06": process.env.PASSWORD_06 || "062918", // Junho
    "07": process.env.PASSWORD_07 || "075643", // Julho
    "08": process.env.PASSWORD_08 || "083245", // Agosto
    "09": process.env.PASSWORD_09 || "097651", // Setembro
    10: process.env.PASSWORD_10 || "104872", // Outubro
    11: process.env.PASSWORD_11 || "115839", // Novembro
    12: process.env.PASSWORD_12 || "128374", // Dezembro
};

// Quando ALLOW_ANYONE=true no Secrets, o sistema ignora a senha
const ALLOW_ANYONE = process.env.ALLOW_ANYONE === "true";

function getCurrentMonth() {
    const now = new Date();
    // Formata 'MM' (ex: '01' para Janeiro, '12' para Dezembro)
    return new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        month: "2-digit",
    }).format(now);
}

app.get("/", (req, res) => {
    // Limpa a sessão global (problema de concorrência se múltiplos usuários)
    session = {};
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", (req, res) => {
    const { password } = req.body;
    const currentMonth = getCurrentMonth();
    const expectedPassword = passwords[currentMonth];
    // const userIP = req.ip; // userIP não é mais usado porque o bloqueio está desabilitado

    // Liberação total quando ALLOW_ANYONE=true
    if (ALLOW_ANYONE) {
        return res.sendFile(path.join(__dirname, "public", "app.html"));
    }

    // Lógica de bloqueio de tentativas por IP - TEMPORARIAMENTE DESABILITADA
    /*
  if (!loginAttempts[userIP]) {
    loginAttempts[userIP] = { count: 0, time: Date.now() };
  }

  if (loginAttempts[userIP].count >= 5 && Date.now() - loginAttempts[userIP].time < LOGIN_BLOCK_TIME) {
    return res.status(403).send('<h1>Você errou a senha várias vezes. Tente novamente após 15 minutos.</h1><a href="/">Voltar</a>');
  }
  */

    if (password === expectedPassword) {
        // Bloco de código para bloqueio de tentativas por IP (parte do reset) - TEMPORARIAMENTE DESABILITADO
        /*
    loginAttempts[userIP] = { count: 0, time: Date.now() }; // Reset após login bem-sucedido
    */
        return res.sendFile(path.join(__dirname, "public", "app.html"));
    } else {
        // Bloco de código para bloqueio de tentativas por IP (parte do incremento) - TEMPORARIAMENTE DESABILITADO
        /*
    loginAttempts[userIP].count++;
    loginAttempts[userIP].time = Date.now();
    */

        // Mensagem de erro personalizada com botão para acesso anual
        const errorMessageHTML = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Erro de Login</title>
          <style>
              body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; background-color: #E3F2FD; color: #0D47A1; }
              .container { background-color: #FFFFFF; padding: 30px; border-radius: 15px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1); max-width: 500px; margin: 0 auto; }
              h1 { color: #D32F2F; }
              p  { font-size: 1.2em; margin-bottom: 20px; }
              .action-button {
                  background-color: #4CAF50;
                  color: white;
                  padding: 15px 30px;
                  font-size: 1.5em;
                  font-weight: bold;
                  border: none;
                  border-radius: 8px;
                  cursor: pointer;
                  text-decoration: none;
                  display: inline-block;
                  margin-top: 10px;
                  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                  transition: background-color 0.3s ease;
              }
              .action-button:hover { background-color: #45a049; }
              .back-link { display: block; margin-top: 30px; color: #1565C0; text-decoration: none; font-size: 1.1em; }
              .back-link:hover { text-decoration: underline; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>Atenção!</h1>
              <p>Esta não é a senha do mês, insira a senha correta, ou clique abaixo para liberar seu acesso anual.</p>
              <a href="https://casadopregador.com/pv/montador3anual" class="action-button" target="_blank">LIBERAR ACESSO</a>
              <a href="/" class="back-link">Tentar inserir a senha novamente</a>
          </div>
      </body>
      </html>
    `;
        res.status(401).send(errorMessageHTML);
    }
});

app.get("/app", (req, res) => {
    // Adicionar verificação de sessão aqui se usar express-session no futuro
    res.sendFile(path.join(__dirname, "public", "app.html"));
});

async function fetchWithTimeout(url, options, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            console.error("[Timeout] OpenAI demorou muito para responder.");
            reject(new Error("Tempo limite atingido para a requisição OpenAI"));
        }, timeout);

        fetch(url, options)
            .then((response) => {
                clearTimeout(timer);
                if (!response.ok)
                    throw new Error(`HTTP error! Status: ${response.status}`);
                return response.json();
            })
            .then(resolve)
            .catch((error) => {
                console.error("[Erro na requisição OpenAI]", error);
                reject(error);
            });
    });
}

app.post("/api/next-step", async (req, res) => {
    // Idealmente, esta rota deve ser protegida para que apenas usuários logados possam acessá-la.
    // Com a lógica atual (sem express-session), não há uma forma segura de garantir isso.
    const userResponse = req.body.response;
    const step = req.body.step || 1;
    console.log(
        `Processando etapa ${step}, resposta do usuário: ${userResponse}`,
    );

    try {
        if (step === 1) {
            session.topic = userResponse; // Risco de concorrência com 'session' global
            return res.json({
                question: "Que tipo de público você vai pregar?",
                options: [
                    "A) Crianças",
                    "B) Adolescentes",
                    "C) Jovens",
                    "D) Mulheres",
                    "E) Homens",
                    "F) Público misto",
                    "G) Não convertido",
                ],
                step: 2,
            });
        } else if (step === 2) {
            session.audience = userResponse; // Risco de concorrência
            return res.json({
                question: "Que tipo de sermão você vai pregar?",
                options: ["A) Expositivo", "B) Textual", "C) Temático"],
                step: 3,
            });
        } else if (step === 3) {
            session.sermonType = userResponse; // Risco de concorrência
            return res.json({
                question: "Quantos minutos deve durar o sermão?",
                options: [
                    "Entre 1 e 10 min",
                    "Entre 10 e 20 min",
                    "Entre 20 e 30 min",
                    "Entre 30 e 40 min",
                    "Entre 40 e 50 min",
                    "Entre 50 e 60 min",
                    "Acima de 1 hora",
                ],
                step: 4,
            });
        } else if (step === 4) {
            session.duration = userResponse; // Risco de concorrência

            if (
                !session.topic ||
                !session.audience ||
                !session.sermonType ||
                !session.duration
            ) {
                return res
                    .status(400)
                    .json({ error: "Faltam informações para gerar o sermão." });
            }

            if (!process.env.OPENAI_API_KEY) {
                console.error("Erro: Chave da API OpenAI não configurada.");
                return res.status(500).json({
                    error: "Erro interno: Chave da API não encontrada.",
                });
            }

            const prompt = `Tema: ${session.topic}, Público: ${session.audience}, Tipo de Sermão: ${session.sermonType}, Duração: ${session.duration} minutos. Gere um sermão completo com exegese e aplicação prática.`;

            console.log("[OpenAI] Enviando requisição para a API...");

            try {
                const data = await fetchWithTimeout(
                    "https://api.openai.com/v1/chat/completions",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                        },
                        body: JSON.stringify({
                            model: "gpt-4o-mini", // modelo usado
                            messages: [{ role: "user", content: prompt }],
                            max_tokens: 3500,
                            temperature: 0.7,
                        }),
                    },
                );
                console.log(
                    "[OpenAI] Sermão gerado com sucesso! Enviando ao frontend.",
                );
                res.json({ sermon: data.choices[0].message.content });
                session = {}; // Resetar sessão global após o envio (problema de concorrência)
            } catch (error) {
                console.error("[Erro ao gerar sermão]", error);
                return res.status(500).json({
                    error: "Erro ao gerar sermão após várias tentativas.",
                });
            }
        }
    } catch (error) {
        console.error("[Erro geral no fluxo]", error);
        return res
            .status(500)
            .json({ error: `Erro interno: ${error.message}` });
    }
});

app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
