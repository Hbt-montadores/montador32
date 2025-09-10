// ===================================================================
// SEÇÃO 1: LOGGING E SERVICE WORKER
// ===================================================================

function logErrorToServer(level, message) {
  const errorLevel = level || 'error';
  const errorMessage = message || 'Mensagem de erro não fornecida.';
  
  try {
    navigator.sendBeacon('/api/log-error', JSON.stringify({ level: errorLevel, message: errorMessage }));
  } catch (e) {
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: errorLevel, message: errorMessage }),
      keepalive: true
    }).catch(console.error);
  }
}

window.onerror = function(message, source, lineno, colno, error) {
  const errorMessage = `[FRONTEND ERROR] Erro não capturado: ${message} em ${source}:${lineno}:${colno}. Stack: ${error ? error.stack : 'N/A'}`;
  logErrorToServer('error', errorMessage);
  return false;
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('[FRONTEND] Service Worker registrado com sucesso.'))
      .catch(err => logErrorToServer('error', `[FRONTEND ERROR] Falha ao registrar Service Worker: ${err.message}`));
  });
}

// ===================================================================
// SEÇÃO 2: LÓGICA PRINCIPAL DA APLICAÇÃO
// ===================================================================

let currentStep = 1;
let elements = {};
let loadingInterval;
let sermonData = {};
let sermonGenerationController;

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
        errorContainer: document.getElementById('error-container'),
        cancelSermonButton: document.getElementById('cancel-sermon-button'),
        // Elementos do Soft Prompt
        softPromptOverlay: document.getElementById('soft-prompt-overlay'),
        softPromptYes: document.getElementById('soft-prompt-yes'),
        softPromptNo: document.getElementById('soft-prompt-no'),
    };
    
    elements.cancelSermonButton.addEventListener('click', cancelSermonGeneration);

    startNewSermon();
    // A inicialização das notificações agora usa o Soft Prompt.
    initializePushNotifications();
  }
});

function startNewSermon() {
  currentStep = 1;
  sermonData = {};
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

  if (elements.loadingText) elements.loadingText.textContent = "Gerando sermão, por favor aguarde...";
  clearInterval(loadingInterval);
}

function handleFetchError(error) {
    if (error.name === 'AbortError') {
        console.log('[FRONTEND] A geração do sermão foi cancelada pelo usuário.');
        startNewSermon();
        return;
    }

    const errorMessage = `[FRONTEND ERROR] Erro na comunicação com o servidor: ${JSON.stringify(error)}`;
    logErrorToServer('error', errorMessage);

    elements.loading.style.display = 'none';
    elements.stepContainer.style.display = 'none';
    
    let errorHTML = `
        <h2>Ocorreu um Erro Inesperado</h2>
        <p>Não foi possível continuar. Por favor, verifique sua conexão ou tente novamente mais tarde.</p>
        <button onclick="startNewSermon()">Tentar Novamente</button>`;
    
    if (error && error.renewal_url) {
        errorHTML = `
            <h2>Atenção!</h2>
            <p style="font-size: 1.2em; color: #D32F2F; margin-bottom: 20px;">${error.message}</p>
            <a href="${error.renewal_url}" target="_blank" class="action-button" style="background-color: #4CAF50; color: white;">LIBERAR ACESSO</a>
            <br><br><button onclick="startNewSermon()" style="margin-top: 20px;">Voltar ao Início</button>`;
    }

    elements.errorContainer.innerHTML = errorHTML;
    elements.errorContainer.style.display = 'block';
}

function nextStep(response) {
  let userResponse = response;
  
  if (!userResponse) {
    if (elements.userInput && elements.userInput.value.trim() !== '') {
      userResponse = elements.userInput.value.trim();
    } else {
      alert("Por favor, insira o tema do sermão.");
      return;
    }
  }

  sermonData[`step${currentStep}`] = userResponse;

  if (currentStep === 4) {
    generateSermon();
    return;
  }
  
  elements.stepContainer.style.display = 'none';
  elements.loading.style.display = 'flex';

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: currentStep, userResponse: userResponse })
  })
  .then(res => {
    elements.loading.style.display = 'none';
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

function generateSermon() {
  elements.stepContainer.style.display = 'none';
  elements.loading.style.display = 'flex';

  sermonGenerationController = new AbortController();

  const duration = sermonData.step4;
  const longSermonTriggers = ["Entre 40 e 50 min", "Entre 50 e 60 min", "Acima de 1 hora"];
  if (longSermonTriggers.includes(duration)) {
    let messageIndex = 0;
    const totalSteps = longSermonMessages.length;
    
    const updateLoadingText = () => {
        const progressText = `Passo ${messageIndex + 1} de ${totalSteps}:`;
        elements.loadingText.innerHTML = `${progressText}<br>${longSermonMessages[messageIndex]}`;
        messageIndex = (messageIndex + 1) % totalSteps;
    };
    
    updateLoadingText();
    loadingInterval = setInterval(updateLoadingText, 7000);

  } else {
    elements.loadingText.textContent = "Gerando seu sermão, por favor aguarde...";
  }

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 4, userResponse: duration }),
    signal: sermonGenerationController.signal
  })
  .then(res => {
      clearInterval(loadingInterval);
      elements.loading.style.display = 'none';
      if (!res.ok) { return res.json().then(err => { throw err; }); }
      return res.json();
  })
  .then(data => {
      if (data.sermon) {
          const formattedSermon = data.sermon.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
          elements.sermonResult.innerHTML = `
              <h2>Seu Sermão está Pronto!</h2>
              <div class="sermon-content">${formattedSermon}</div>
              <div class="sermon-actions">
                <button onclick="saveAsPdf()">Salvar</button>
                <button onclick="startNewSermon()">Novo</button>
              </div>`;
          elements.sermonResult.style.display = 'block';
      } else { throw new Error('Resposta final inválida do servidor.'); }
  })
  .catch(handleFetchError);
}

function cancelSermonGeneration() {
    if (sermonGenerationController) {
        sermonGenerationController.abort();
    }
}

function saveAsPdf() {
  const sermonContent = document.querySelector('.sermon-content');
  if (!sermonContent) return;
  
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const margin = 10;
    const usableWidth = doc.internal.pageSize.getWidth() - (margin * 2);

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(12);

    const text = sermonContent.innerText;
    const lines = doc.splitTextToSize(text, usableWidth);
    doc.text(lines, margin, margin);

    let fileName = (sermonData.step1 || 'meu_sermao').replace(/[\\/:*?"<>|]/g, '').trim().substring(0, 50);
    doc.save(`${fileName}.pdf`);
  } catch (error) {
    logErrorToServer('error', `[FRONTEND ERROR] Falha ao gerar PDF: ${error.message}`);
    alert('Ocorreu um erro ao gerar o PDF.');
  }
}

// ===================================================================
// SEÇÃO 3: LÓGICA DE NOTIFICAÇÕES COM "SOFT PROMPT" INTELIGENTE
// ===================================================================

async function initializePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !elements.softPromptOverlay) {
    return; // Não executa se o navegador não suportar ou o modal não existir.
  }

  const permission = Notification.permission;

  // Se a permissão já foi concedida, PERGUNTE AO SERVIDOR se o usuário já está inscrito.
  if (permission === 'granted') {
    try {
        const response = await fetch('/api/check-push-subscription');
        const data = await response.json();
        // Só mostra o prompt se o servidor disser que o usuário NÃO está inscrito.
        if (!data.isSubscribed) {
            elements.softPromptOverlay.style.display = 'flex';
        }
    } catch (error) {
        console.error('Erro ao verificar a inscrição de notificação:', error);
    }
  } else if (permission === 'default') {
    // Se a permissão ainda não foi pedida, mostra o prompt após um delay.
    setTimeout(() => {
        elements.softPromptOverlay.style.display = 'flex';
    }, 2000);
  }
  // Se a permissão for 'denied', não fazemos nada.

  // Adiciona os listeners aos botões do modal.
  elements.softPromptYes.addEventListener('click', handleSoftPromptAccept);
  elements.softPromptNo.addEventListener('click', () => {
    elements.softPromptOverlay.style.display = 'none';
  });
}

async function handleSoftPromptAccept() {
  // 1. Esconde o nosso modal.
  elements.softPromptOverlay.style.display = 'none';

  try {
    let permissionResult = Notification.permission;

    // 2. Só pede a permissão se ela ainda não foi concedida.
    if (permissionResult === 'default') {
      permissionResult = await Notification.requestPermission();
    }
    
    // 3. Se a permissão final for 'granted', inscrevemos o usuário.
    if (permissionResult === 'granted') {
      await subscribeUserToServer();
      alert('Notificações ativadas com sucesso!');
    } else {
      console.log('Permissão de notificação não concedida.');
    }
  } catch (error) {
    logErrorToServer('error', `[FRONTEND PUSH ERROR] ${error.message}`);
  }
}

async function subscribeUserToServer() {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    const VAPID_PUBLIC_KEY_RESPONSE = await fetch('/api/vapid-public-key');
    if (!VAPID_PUBLIC_KEY_RESPONSE.ok) throw new Error('Falha ao buscar chave VAPID.');
    
    const VAPID_PUBLIC_KEY = await VAPID_PUBLIC_KEY_RESPONSE.text();
    if (!VAPID_PUBLIC_KEY) throw new Error('Chave VAPID vazia.');

    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });

    const response = await fetch('/api/subscribe-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });

    if (!response.ok) {
      throw new Error('Falha ao enviar inscrição para o servidor.');
    }
    console.log('[FRONTEND] Inscrição Push enviada com sucesso.');

  } catch (error) {
    logErrorToServer('error', `[FRONTEND PUSH ERROR] ${error.message}`);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
