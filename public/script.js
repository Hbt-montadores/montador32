// public/script.js - Versão Final com Correção de Sintaxe no PDF e Histórico de Sermões

// ===================================================================
// SEÇÃO 1: LOGGING DE ERROS DO CLIENTE E SERVICE WORKER
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
  const errorMessage = `Erro não capturado: ${message} em ${source}:${lineno}:${colno}. Stack: ${error ? error.stack : 'N/A'}`;
  logErrorToServer('error', errorMessage);
  return false;
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('Service Worker registrado com sucesso no app.html.'))
      .catch(err => logErrorToServer('error', `Falha ao registrar Service Worker: ${err.message}`));
  });
}


// ===================================================================
// SEÇÃO 2: LÓGICA PRINCIPAL DA APLICAÇÃO
// ===================================================================

let currentStep = 1;
let elements = {};
let loadingInterval;
let sermonData = {};

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
        
        // Novos elementos para o histórico
        mySermonsBtn: document.getElementById('my-sermons-button'),
        recentSermonsBtn: document.getElementById('recent-sermons-button'),
        sermonsListContainer: document.getElementById('sermons-list-container'),
        sermonsListTitle: document.getElementById('sermons-list-title'),
        sermonsListContent: document.getElementById('sermons-list-content')
    };

    // Listeners dos novos botões
    if (elements.mySermonsBtn) {
        elements.mySermonsBtn.addEventListener('click', fetchMySermons);
    }
    if (elements.recentSermonsBtn) {
        elements.recentSermonsBtn.addEventListener('click', fetchRecentSermons);
    }

    startNewSermon();
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
  
  if (elements.sermonsListContainer) {
      elements.sermonsListContainer.style.display = 'none';
  }

  if (elements.loadingText) elements.loadingText.textContent = "Gerando sermão, por favor aguarde...";
  clearInterval(loadingInterval);
}

function handleFetchError(error) {
    const errorMessage = `Erro na comunicação com o servidor: ${JSON.stringify(error)}`;
    logErrorToServer('error', errorMessage);

    elements.loading.style.display = 'none';
    elements.stepContainer.style.display = 'none';
    
    let errorHTML;
    if (error && error.renewal_url) {
        errorHTML = `
            <h2>Atenção!</h2>
            <p style="font-size: 1.2em; color: #D32F2F; margin-bottom: 20px;">${error.message}</p>
            <a href="${error.renewal_url}" target="_blank" class="action-button" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; font-size: 1.5em; border-radius: 8px; display: inline-block; margin-top: 10px;">LIBERAR ACESSO</a>
            <br><br><button onclick="startNewSermon()" style="margin-top: 20px;">Voltar ao Início</button>`;
    } else {
        errorHTML = `
            <h2>Ocorreu um Erro Inesperado</h2>
            <p>Não foi possível continuar. Por favor, verifique sua conexão ou tente novamente mais tarde.</p>
            <button onclick="startNewSermon()">Tentar Novamente</button>`;
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

  if(currentStep === 1) sermonData.topic = userResponse;
  if(currentStep === 2) sermonData.audience = userResponse;
  if(currentStep === 3) sermonData.sermonType = userResponse;
  if(currentStep === 4) sermonData.duration = userResponse;

  if (currentStep === 4) {
    generateSermon(userResponse);
    return;
  }
  
  elements.stepContainer.style.display = 'none';
  elements.loading.style.display = 'block';

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

function generateSermon(userResponse) {
  elements.stepContainer.style.display = 'none';
  elements.loading.style.display = 'block';

  const longSermonTriggers = ["Entre 40 e 50 min", "Entre 50 e 60 min", "Acima de 1 hora"];
  if (longSermonTriggers.includes(userResponse)) {
    elements.loadingText.textContent = "Você escolheu um sermão mais longo. A preparação pode levar um pouco mais de tempo...";
    
    let messageIndex = 0;
    setTimeout(() => {
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

function saveAsPdf() {
  const sermonContent = document.querySelector('.sermon-content');
  if (!sermonContent) {
    logErrorToServer('error', 'Elemento .sermon-content não encontrado para salvar PDF.');
    return;
  }
  
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });

    const htmlContent = sermonContent.innerHTML;
    const margin = 10;
    const fontSize = 16;
    const lineHeight = 8;
    const usableWidth = doc.internal.pageSize.getWidth() - (margin * 2);

    const textLines = htmlContent
      .replace(/<strong>(.*?)<\/strong>/g, 'NEG:$1:NEG')
      .split('<br>');

    let y = margin;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(fontSize);

    textLines.forEach(line => {
      const segments = line.split(/NEG:|:NEG/);
      let isBold = false;
      
      segments.forEach(segment => {
        if (!segment) return;
        doc.setFont('Helvetica', isBold ? 'bold' : 'normal');
        const splitText = doc.splitTextToSize(segment, usableWidth);
        
        splitText.forEach(textLine => {
          if (y + lineHeight > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(textLine, margin, y);
          y += lineHeight;
        });
        isBold = !isBold;
      });
    });

    let fileName = sermonData.topic || 'meu_sermao';
    fileName = fileName.replace(/[\\/:*?"<>|]/g, '').trim();
    fileName = fileName.substring(0, 50);

    doc.save(`${fileName}.pdf`);
    logErrorToServer('info', `Usuário salvou o sermão "${fileName}.pdf"`);

  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    logErrorToServer('error', `Falha ao gerar PDF: ${error.message}`);
    alert('Ocorreu um erro ao gerar o PDF. A funcionalidade pode não ser compatível com seu navegador. Tente salvar o texto manualmente.');
  }
}

// ===================================================================
// SEÇÃO 3: FUNÇÕES DE HISTÓRICO DE SERMÕES (NOVO)
// ===================================================================

function hideMainContainers() {
    elements.stepContainer.style.display = 'none';
    elements.sermonResult.style.display = 'none';
    elements.errorContainer.style.display = 'none';
}

function fetchMySermons() {
    hideMainContainers();
    elements.sermonsListContainer.style.display = 'none';
    elements.loadingText.textContent = "Buscando seus sermões...";
    elements.loading.style.display = 'block';

    fetch('/api/my-sermons')
        .then(res => {
            if (!res.ok) throw new Error('Erro ao buscar meus sermões');
            return res.json();
        })
        .then(data => {
            elements.loading.style.display = 'none';
            renderSermonList(data.sermons || [], "Meus Sermões (Últimos 20)");
        })
        .catch(err => {
            console.error(err);
            elements.loading.style.display = 'none';
            alert("Não foi possível carregar o histórico de sermões. Tente novamente.");
            startNewSermon();
        });
}

function fetchRecentSermons() {
    hideMainContainers();
    elements.sermonsListContainer.style.display = 'none';
    elements.loadingText.textContent = "Buscando as últimas mensagens preparadas...";
    elements.loading.style.display = 'block';

    fetch('/api/recent-sermons')
        .then(res => {
            if (!res.ok) throw new Error('Erro ao buscar sermões recentes');
            return res.json();
        })
        .then(data => {
            elements.loading.style.display = 'none';
            renderSermonList(data.sermons || [], "Últimas Mensagens (Plataforma)");
        })
        .catch(err => {
            console.error(err);
            elements.loading.style.display = 'none';
            alert("Não foi possível carregar as mensagens recentes. Tente novamente.");
            startNewSermon();
        });
}

function renderSermonList(sermons, title) {
    elements.sermonsListTitle.textContent = title;
    elements.sermonsListContent.innerHTML = '';

    if (sermons.length === 0) {
        elements.sermonsListContent.innerHTML = '<p>Nenhum sermão encontrado.</p>';
    } else {
        sermons.forEach(sermon => {
            const dateStr = sermon.created_at ? new Date(sermon.created_at).toLocaleDateString('pt-BR') : 'Data desconhecida';
            const item = document.createElement('div');
            item.className = 'sermon-list-item';
            
            // Limpa formatação básica (se houver prefixos como "A)")
            const cleanType = sermon.type.replace(/^[A-Z]\)\s*/, '').trim();
            const cleanDuration = sermon.duration;

            item.innerHTML = `
                <h4>${sermon.topic}</h4>
                <p><strong>Público:</strong> ${sermon.audience} | <strong>Tipo:</strong> ${cleanType}</p>
                <p><strong>Duração:</strong> ${cleanDuration} | <strong>Data:</strong> ${dateStr}</p>
            `;
            
            item.onclick = () => displaySavedSermon(sermon);
            elements.sermonsListContent.appendChild(item);
        });
    }

    elements.sermonsListContainer.style.display = 'block';
}

function displaySavedSermon(sermon) {
    elements.sermonsListContainer.style.display = 'none';
    
    // Atualiza a variável global para que a exportação em PDF saiba o nome correto do arquivo
    sermonData.topic = sermon.topic;

    const formattedSermon = sermon.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    
    elements.sermonResult.innerHTML = `
        <h2>${sermon.topic}</h2>
        <div class="sermon-content">${formattedSermon}</div>
        <div class="sermon-actions">
          <button onclick="saveAsPdf()">Salvar (PDF)</button>
          <button onclick="startNewSermon()" style="background-color: #757575;">Voltar ao Início</button>
        </div>`;
        
    elements.sermonResult.style.display = 'block';
}
