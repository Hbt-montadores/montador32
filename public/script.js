// public/script.js - Versão Final (Cooldown, Overlay e Histórico Completo)

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
      .then(reg => console.log('Service Worker registrado com sucesso.'))
      .catch(err => logErrorToServer('error', `Falha ao registrar Service Worker: ${err.message}`));
  });
}

// ===================================================================
// SEÇÃO 2: LÓGICA PRINCIPAL DA APLICAÇÃO E LOADING ROTATIVO
// ===================================================================

let currentStep = 1;
let elements = {};
let loadingInterval;
let sermonData = {};

const loadingPhrases = [
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
        
        loadingOverlay: document.getElementById('loading-overlay'),
        loadingPhrase: document.getElementById('loading-phrase'),
        
        sermonResult: document.getElementById('sermon-result'),
        errorContainer: document.getElementById('error-container'),
        
        mySermonsBtn: document.getElementById('my-sermons-button'),
        sermonsListContainer: document.getElementById('sermons-list-container'),
        sermonsListTitle: document.getElementById('sermons-list-title'),
        sermonsListContent: document.getElementById('sermons-list-content')
    };

    if (elements.mySermonsBtn) {
        elements.mySermonsBtn.addEventListener('click', fetchMySermons);
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
  elements.errorContainer.style.display = 'none';
  
  hideLoading();
  
  if (elements.sermonsListContainer) {
      elements.sermonsListContainer.style.display = 'none';
  }
}

function showLoading() {
    elements.loadingOverlay.style.display = 'flex';
    let phraseIndex = 0;
    
    // Mostra a primeira frase imediatamente
    elements.loadingPhrase.textContent = loadingPhrases[phraseIndex];
    
    // Troca a frase a cada 5 segundos
    loadingInterval = setInterval(() => {
        phraseIndex = (phraseIndex + 1) % loadingPhrases.length;
        elements.loadingPhrase.textContent = loadingPhrases[phraseIndex];
    }, 5000);
}

function hideLoading() {
    clearInterval(loadingInterval);
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = 'none';
    }
}

function handleFetchError(error, responseStatus) {
    hideLoading();
    elements.stepContainer.style.display = 'none';
    
    let errorHTML;

    if (responseStatus === 429) {
        // Bloqueio de Cooldown (Exibe com layout amigável)
        errorHTML = `
            <h2>Atenção!</h2>
            <p style="font-size: 1.2em; color: #D32F2F; margin-bottom: 20px;">${error.message || 'Limite de acesso atingido.'}</p>
            <button onclick="startNewSermon()" style="background-color: #1565C0; color: white; padding: 15px 30px; border-radius: 8px; font-size: 1.2em; border: none; cursor: pointer; width: 100%; max-width: 300px; margin-top: 10px;">Entendido, vou aguardar</button>`;
    } else if (error && error.renewal_url) {
        // Assinatura Vencida / Limite de Cortesia
        errorHTML = `
            <h2>Acesso Expirado</h2>
            <p style="font-size: 1.2em; color: #D32F2F; margin-bottom: 20px;">${error.message}</p>
            <a href="${error.renewal_url}" target="_blank" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; font-size: 1.5em; border-radius: 8px; display: inline-block; margin-top: 10px;">LIBERAR ACESSO</a>
            <br><br><button onclick="startNewSermon()" style="margin-top: 20px; border: none; background: transparent; color: #1565C0; text-decoration: underline; cursor: pointer;">Voltar ao Início</button>`;
    } else {
        // Erro Genérico de Servidor
        errorHTML = `
            <h2>Não foi possível continuar</h2>
            <p>Não foi possível continuar. Por favor, verifique sua conexão e tente novamente mais tarde.</p>
            <button onclick="startNewSermon()">Tentar novamente</button>`;
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
  showLoading(); // Aqui ainda é só mudança de passo interno, mas mantemos visual limpo

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: currentStep, userResponse: userResponse })
  })
  .then(res => {
    hideLoading();
    if (!res.ok) { return res.json().then(err => { throw { err, status: res.status }; }); }
    return res.json();
  })
  .then(data => {
    if (data.question) {
      currentStep = data.step;
      displayQuestion(data);
    } else { throw new Error('Resposta inválida do servidor.'); }
  })
  .catch(errorObj => {
      handleFetchError(errorObj.err || errorObj, errorObj.status);
  });
}

function generateSermon(userResponse) {
  elements.stepContainer.style.display = 'none';
  showLoading();

  fetch('/api/next-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step: 4, userResponse: userResponse })
  })
  .then(res => {
      if (!res.ok) { return res.json().then(err => { throw { err, status: res.status }; }); }
      return res.json();
  })
  .then(data => {
      hideLoading();
      
      // Nova Lógica de Redirecionamento Blindado
      if (data.redirect) {
          // Em vez de mudar o window.location (que daria erro 404 em uma SPA), 
          // simulamos o clique no botão chamando a função que renderiza a lista.
          fetchMySermons();
      } else if (data.sermon) {
          // Mantido para quando for Cache Hit (sermão idêntico)
          displayGeneratedSermon(data);
      } else { 
          throw new Error('Resposta final inválida do servidor.'); 
      }
  })
  .catch(errorObj => {
      hideLoading();
      handleFetchError(errorObj.err || errorObj, errorObj.status);
  });
}

// ===================================================================
// SEÇÃO 3: RENDERIZAÇÃO E HISTÓRICO DE SERMÕES
// ===================================================================

function hideMainContainers() {
    elements.stepContainer.style.display = 'none';
    elements.sermonResult.style.display = 'none';
    elements.errorContainer.style.display = 'none';
}

function fetchMySermons() {
    hideMainContainers();
    elements.sermonsListContainer.style.display = 'none';
    showLoading();

    fetch('/api/my-sermons')
        .then(res => {
            if (!res.ok) throw new Error('Erro ao buscar meus sermões');
            return res.json();
        })
        .then(data => {
            hideLoading();
            renderSermonList(data.sermons || []);
        })
        .catch(err => {
            hideLoading();
            console.error(err);
            alert("Não foi possível carregar o histórico de sermões. Tente novamente.");
            startNewSermon();
        });
}

function toggleSaveSermon(id, currentlySaved, buttonElement) {
    if (!id) return;
    
    const endpoint = currentlySaved ? `/api/sermon/${id}` : '/api/sermon/save';
    const method = currentlySaved ? 'DELETE' : 'POST';

    // UI Otimista: muda antes do servidor responder
    buttonElement.disabled = true;
    buttonElement.innerText = "Atualizando...";

    fetch(endpoint, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // Se foi sucesso, atualiza a lista inteira para refletir a mudança
            fetchMySermons();
        } else {
            alert("Erro ao atualizar o status do sermão.");
            buttonElement.disabled = false;
        }
    })
    .catch(err => {
        console.error(err);
        alert("Erro de conexão ao salvar/remover sermão.");
        buttonElement.disabled = false;
    });
}

function renderSermonList(sermons) {
    elements.sermonsListContent.innerHTML = '';

    if (sermons.length === 0) {
        elements.sermonsListContent.innerHTML = '<p>Você ainda não preparou nenhum sermão.</p>';
    } else {
        sermons.forEach(sermon => {
            const dateStr = sermon.created_at ? new Date(sermon.created_at).toLocaleDateString('pt-BR') : 'Data desconhecida';
            const cleanType = sermon.type.replace(/^[A-Z]\)\s*/, '').trim();
            const cleanDuration = sermon.duration;

            const item = document.createElement('div');
            item.className = 'sermon-list-item';
            
            let badgeHTML = sermon.saved ? `<span class="saved-badge">★ Salvo</span>` : '';
            
            // Botão de Salvar/Remover
            const btnColor = sermon.saved ? '#D32F2F' : '#4CAF50';
            const btnText = sermon.saved ? '❌ Remover' : '⭐ Salvar';

            item.innerHTML = `
                ${badgeHTML}
                <h4>${sermon.topic}</h4>
                <p><strong>Público:</strong> ${sermon.audience} | <strong>Tipo:</strong> ${cleanType}</p>
                <p><strong>Duração:</strong> ${cleanDuration} | <strong>Data:</strong> ${dateStr}</p>
                <div style="margin-top: 10px; display: flex; gap: 10px;">
                    <button class="action-btn-view" style="flex: 1; padding: 8px; border: none; border-radius: 5px; background-color: #1565C0; color: white; cursor: pointer; font-weight: bold;">📖 Ler Sermão</button>
                    <button class="action-btn-save" style="flex: 1; padding: 8px; border: none; border-radius: 5px; background-color: ${btnColor}; color: white; cursor: pointer; font-weight: bold;">${btnText}</button>
                </div>
            `;
            
            // Lógica dos botões na lista
            const btnView = item.querySelector('.action-btn-view');
            const btnSave = item.querySelector('.action-btn-save');

            btnView.onclick = (e) => {
                e.stopPropagation();
                displayGeneratedSermon(sermon);
            };

            btnSave.onclick = (e) => {
                e.stopPropagation();
                toggleSaveSermon(sermon.id, sermon.saved, btnSave);
            };

            elements.sermonsListContent.appendChild(item);
        });
    }

    elements.sermonsListContainer.style.display = 'block';
}

function displayGeneratedSermon(data) {
    elements.sermonsListContainer.style.display = 'none';
    
    // Atualiza a variável global para exportação PDF
    sermonData.topic = data.topic || sermonData.topic || 'Sermão';
    
    const isSaved = data.saved || false;
    const btnColor = isSaved ? '#D32F2F' : '#4CAF50';
    const btnText = isSaved ? '❌ Remover dos Salvos' : '⭐ Salvar na minha Lista';
    
    // Formatação Markdown para HTML
    const formattedSermon = data.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    
    elements.sermonResult.innerHTML = `
        <h2>${sermonData.topic}</h2>
        <div class="sermon-content">${formattedSermon}</div>
        <div class="sermon-actions" style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
          <button onclick="saveAsPdf()" style="width: 100%; padding: 12px; font-size: 1.1em; border-radius: 8px;">Baixar em PDF</button>
          
          <button id="toggle-save-btn" style="width: 100%; padding: 12px; font-size: 1.1em; border-radius: 8px; background-color: ${btnColor}; color: white; border: none; cursor: pointer; font-weight: bold;">${btnText}</button>
          
          <button onclick="startNewSermon()" style="width: 100%; padding: 12px; font-size: 1.1em; border-radius: 8px; background-color: #757575; color: white; border: none; cursor: pointer;">Voltar ao Início</button>
        </div>`;
        
    elements.sermonResult.style.display = 'block';

    const toggleSaveBtn = document.getElementById('toggle-save-btn');
    if (toggleSaveBtn && data.id) {
        toggleSaveBtn.onclick = () => {
            const endpoint = isSaved ? `/api/sermon/${data.id}` : '/api/sermon/save';
            const method = isSaved ? 'DELETE' : 'POST';

            toggleSaveBtn.disabled = true;
            toggleSaveBtn.innerText = "Atualizando...";

            fetch(endpoint, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: data.id })
            })
            .then(res => res.json())
            .then(resData => {
                if (resData.success) {
                    // Atualiza a tela recarregando o próprio objeto com o novo status
                    data.saved = !isSaved;
                    displayGeneratedSermon(data); 
                } else {
                    alert("Erro ao atualizar.");
                    toggleSaveBtn.disabled = false;
                }
            })
            .catch(err => {
                console.error(err);
                toggleSaveBtn.disabled = false;
            });
        };
    } else if (!data.id) {
        // Se não tiver ID (caso muito raro por erro de retorno), esconde o botão
        toggleSaveBtn.style.display = 'none';
    }
}

// ===================================================================
// SEÇÃO 4: EXPORTAÇÃO DE PDF
// ===================================================================

function saveAsPdf() {
  const sermonContent = document.querySelector('.sermon-content');
  if (!sermonContent) {
    logErrorToServer('error', 'Elemento .sermon-content não encontrado para salvar PDF.');
    return;
  }
  
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

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
