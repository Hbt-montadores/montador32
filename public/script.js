// script.js - Versão Definitiva Consolidada

// ===================================================================
// SEÇÃO 1: LOGGING DE ERROS DO CLIENTE E SERVICE WORKER
// ===================================================================

/**
 * Envia uma mensagem de erro para o servidor para registro nos logs.
 * Usa navigator.sendBeacon para não atrasar a navegação do usuário.
 * @param {string} level - O nível do log (ex: 'error', 'info').
 * @param {string} message - A mensagem de erro detalhada.
 */
function logErrorToServer(level, message) {
  try {
    // sendBeacon é ideal para enviar logs antes de o usuário sair da página
    navigator.sendBeacon('/api/log-error', JSON.stringify({ level, message }));
  } catch (e) {
    // Fallback para fetch caso sendBeacon não seja suportado
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message }),
      keepalive: true // Garante que a requisição continue mesmo se a página for fechada
    }).catch(console.error); // Log local se a API de log falhar
  }
}

/**
 * Captura global de erros de JavaScript não tratados na página.
 * Funciona como uma "rede de segurança" para depuração.
 */
window.onerror = function(message, source, lineno, colno, error) {
  const errorMessage = `Erro não capturado: ${message} em ${source}:${lineno}:${colno}. Stack: ${error ? error.stack : 'N/A'}`;
  logErrorToServer('error', errorMessage);
  return false; // Permite que o erro também apareça no console do navegador
};

// Registra o Service Worker para funcionalidades PWA (como offline)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('Service Worker registrado com sucesso.'))
      .catch(err => logErrorToServer('error', `Falha ao registrar Service Worker: ${err.message}`));
  });
}


// ===================================================================
// SEÇÃO 2: LÓGICA DE INSTALAÇÃO DO APP (PWA)
// ===================================================================

let deferredPrompt; 
const installButton = document.getElementById('install-button');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // Impede que o navegador mostre o prompt de instalação automaticamente
  deferredPrompt = e;
  if (installButton) {
    installButton.style.display = 'block'; // Mostra nosso botão personalizado
  }
});

if (installButton) {
  installButton.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt(); // Mostra o prompt de instalação do navegador
      const { outcome } = await deferredPrompt.userChoice;
      logErrorToServer('info', `Ação do usuário na instalação do PWA: ${outcome}`);
      deferredPrompt = null;
      installButton.style.display = 'none';
    }
  });
}

// ===================================================================
// SEÇÃO 3: LÓGICA PRINCIPAL DA APLICAÇÃO
// ===================================================================

let currentStep = 1;
let elements = {};
let loadingInterval;

const longSermonMessages = [
    "Consultando as referências e o contexto bíblico...",
    "Estruturando a espinha dorsal da sua mensagem...",
    "Definindo os pontos principais e a sequência lógica...",
    "Esboçando a introdução para capturar a atenção...",
    "Aprofundando na exegese para uma base sólida...",
    "Desenvolvendo cada ponto com clareza e profundidade...",
    "Buscando ilustrações e aplicações práticas...",
    "Construindo uma conclusão impactante para sua mensagem...",
    "Quase pronto! Polindo os detalhes finais do seu sermão."
];

// Mapeia os elementos do DOM quando a página carrega
window.addEventListener('load', () => {
  if (document.getElementById('step-container')) {
    elements = {
        stepContainer: document.getElementById('step-container'),
        question: document.getElementById('question'),
        inputArea: document.getElementById('input-area'),
        userInput: document.getElementById('user-input'),
        options: document.getElementById('options'),
        loading: document.getElementById('loading'),
        loadingText: document.getElementById('loading-text'),
        sermonResult: document.getElementById('sermon-result'),
        errorContainer: document.getElementById('error-container')
    };
    startNewSermon();
  }
});

/**
 * Reseta a aplicação para o estado inicial, pronta para um novo sermão.
 */
function startNewSermon() {
  currentStep = 1;
  if (!elements || !elements.question) return;

  elements.question.innerText = 'Qual será o tema do seu sermão?';
  elements.userInput.value = '';
  elements.options.innerHTML = '';
  
  elements.stepContainer.style.display = 'block';
  elements.inputArea.style.display = 'block';
  elements.options.style.display = 'none';
  elements.sermonResult.style.display = 'none';
  elements.loading.style.display = 'none';
  elements.errorContainer.style.display = 'none';

  // Garante que o texto de carregamento seja o padrão
  if (elements.loadingText) elements.loadingText.textContent = "Gerando sermão, por favor aguarde...";
  clearInterval(loadingInterval);
}

/**
 * Lida com erros de fetch, exibindo uma mensagem apropriada para o usuário.
 * @param {object} error - O objeto de erro retornado pela API.
 */
function handleFetchError(error) {
    const errorMessage = `Erro na comunicação com o servidor: ${JSON.stringify(error)}`;
    logErrorToServer('error', errorMessage);

    elements.loading.style.display = 'none';
    elements.stepContainer.style.display = 'none';
    
    let errorHTML;
    // Erro específico para limite de cortesia ou assinatura expirada
    if (error && error.renewal_url) {
        errorHTML = `
            <h2>Atenção!</h2>
            <p style="font-size: 1.2em; color: #D32F2F; margin-bottom: 20px;">${error.message}</p>
            <a href="${error.renewal_url}" target="_blank" class="action-button" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; font-size: 1.5em; border-radius: 8px; display: inline-block; margin-top: 10px;">LIBERAR ACESSO</a>
            <br><br><button onclick="startNewSermon()" style="margin-top: 20px;">Voltar ao Início</button>`;
    } else { // Erro genérico
        errorHTML = `
            <h2>Ocorreu um Erro Inesperado</h2>
            <p>Não foi possível continuar. Por favor, verifique sua conexão ou tente novamente mais tarde.</p>
            <button onclick="startNewSermon()">Tentar Novamente</button>`;
    }

    elements.errorContainer.innerHTML = errorHTML;
    elements.errorContainer.style.display = 'block';
}

/**
 * Avança para o próximo passo do fluxo de criação do sermão.
 * @param {string} response - A resposta do usuário (tema ou opção selecionada).
 */
function nextStep(response) {
  let userResponse = response;
  
  // Pega o valor do input de texto se nenhuma opção foi clicada (primeiro passo)
  if (!userResponse) {
    if (elements.userInput && elements.userInput.value.trim() !== '') {
      userResponse = elements.userInput.value.trim();
    } else {
      alert("Por favor, insira o tema do sermão.");
      return;
    }
  }

  // Se for o último passo, chama a função de geração final
  if (currentStep === 4) {
    generateSermon(userResponse);
    return;
  }
  
  // Mostra a tela de carregamento entre os passos
  elements.stepContainer.style.display = 'none';
  elements.loading.style.display = 'block';

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: currentStep, userResponse: userResponse })
  })
  .then(res => {
    elements.loading.style.display = 'none'; // Esconde o loading assim que a resposta chega
    if (!res.ok) { return res.json().then(err => { throw err; }); }
    return res.json();
  })
  .then(data => {
    if (data.question) {
      currentStep = data.step;
      displayQuestion(data);
    } else { throw new Error('Resposta inválida do servidor.'); }
  })
  .catch(handleFetchError);
}

/**
 * Exibe a próxima pergunta e as opções para o usuário.
 * @param {object} data - Dados da API contendo a pergunta e as opções.
 */
function displayQuestion(data) {
  elements.question.innerText = data.question;
  elements.inputArea.style.display = 'none';
  
  elements.options.innerHTML = ''; 
  data.options.forEach(option => {
    const button = document.createElement('button');
    button.className = 'option-button';
    button.innerText = option;
    button.onclick = () => nextStep(option);
    elements.options.appendChild(button);
  });
  elements.options.style.display = 'block';
  elements.stepContainer.style.display = 'block';
}

/**
 * Função final que envia todos os dados para a API e gera o sermão.
 * @param {string} userResponse - A duração do sermão selecionada.
 */
function generateSermon(userResponse) {
  elements.stepContainer.style.display = 'none';
  elements.loading.style.display = 'block';

  // Lógica para mostrar mensagens de espera para sermões longos
  const longSermonTriggers = ["Entre 40 e 50 min", "Entre 50 e 60 min", "Acima de 1 hora"];
  if (longSermonTriggers.includes(userResponse)) {
    elements.loadingText.textContent = "Você escolheu um sermão mais longo. A preparação pode levar um pouco mais de tempo, mas o resultado valerá a pena!";
    
    let messageIndex = 0;
    setTimeout(() => { // Dá um tempo antes de começar a ciclar as mensagens
        elements.loadingText.textContent = longSermonMessages[messageIndex];
        loadingInterval = setInterval(() => {
            messageIndex = (messageIndex + 1) % longSermonMessages.length;
            elements.loadingText.textContent = longSermonMessages[messageIndex];
        }, 7000); 
    }, 4000);
  } else {
    elements.loadingText.textContent = "Gerando seu sermão, por favor aguarde...";
  }

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 4, userResponse: userResponse })
  })
  .then(res => {
      clearInterval(loadingInterval); // Para o ciclo de mensagens
      elements.loading.style.display = 'none';
      if (!res.ok) { return res.json().then(err => { throw err; }); }
      return res.json();
  })
  .then(data => {
      if (data.sermon) {
          // Formata o sermão para exibição na tela (mantém negrito e quebras de linha)
          const formattedSermon = data.sermon.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
          
          elements.sermonResult.innerHTML = `
              <h2>Seu Sermão está Pronto!</h2>
              <div class="sermon-content">${formattedSermon}</div>
              <div class="sermon-actions">
                <button onclick="saveAsTxt()">Salvar como .txt</button>
                <button onclick="startNewSermon()">Criar Novo Sermão</button>
              </div>`;
          elements.sermonResult.style.display = 'block';
      } else { throw new Error('Resposta final inválida do servidor.'); }
  })
  .catch(handleFetchError);
}

/**
 * Nova função para salvar o sermão como um arquivo de texto (.txt).
 */
function saveAsTxt() {
  const sermonContent = document.querySelector('.sermon-content');
  if (sermonContent) {
    // .innerText é a forma mais simples de obter o texto puro,
    // convertendo <br> para quebras de linha e ignorando outras tags como <strong>.
    const textToSave = sermonContent.innerText;
    
    // Cria um "Blob", que é como um objeto de arquivo em memória.
    const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
    
    // Cria um link temporário para acionar o download.
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'meu_sermao.txt'; // Nome do arquivo a ser baixado
    
    document.body.appendChild(link);
    link.click(); // Simula o clique no link para iniciar o download
    document.body.removeChild(link); // Remove o link temporário
    
    logErrorToServer('info', 'Usuário salvou o sermão como .txt');
  } else {
    logErrorToServer('error', 'Falha ao encontrar .sermon-content para salvar como .txt');
  }
}
