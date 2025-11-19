const versiculos = {
  visitacoes: {
    titulo: "Versículos para Visitações e Situações Pastorais",
    subcategorias: {
      hospital: {
        titulo: "Hospital",
        lista: [
          { ref: "Sl 46.1", texto: "Deus é amparo presente quando as forças se desvanecem." },
          { ref: "Is 26.3", texto: "A mente firmada no Senhor encontra paz mesmo em meio à enfermidade." },
          { ref: "Sl 73.26", texto: "Ainda que o corpo falhe, Deus permanece como força e porção eterna." },
          { ref: "Sl 94.19", texto: "O consolo do Senhor acalma o coração afligido pela dor." },
          { ref: "2Co 12.9", texto: "A graça de Cristo sustém quando a fragilidade é mais evidente." },
          { ref: "Sl 86.7", texto: "O Senhor responde no dia da angústia e sustém o enfermo." },
          { ref: "Sl 30.10", texto: "Deus ouve o clamor sincero e se inclina com misericórdia." }
        ]
      },

      posOperatorio: {
        titulo: "Pós-Operatório",
        lista: [
          { ref: "Sl 147.3", texto: "O Senhor restaura o abatido e renova o coração aflito." },
          { ref: "Is 40.29", texto: "Ele fortalece o cansado e consola o enfraquecido." },
          { ref: "Sl 138.7", texto: "Deus estende sua mão protetora mesmo após momentos de grande fragilidade." },
          { ref: "Sl 118.17", texto: "A vida preservada testemunha a bondade do Senhor." },
          { ref: "Sl 20.1", texto: "O Deus de Jacó sustém no momento da necessidade." },
          { ref: "Sl 145.14", texto: "O Senhor levanta o que tropeça e firma o vacilante." }
        ]
      },

      velorios: {
        titulo: "Velórios",
        lista: [
          { ref: "Sl 116.15", texto: "A morte dos santos é preciosa aos olhos do Senhor, que os acolhe." },
          { ref: "Sl 48.14", texto: "Deus conduz seu povo nesta vida e também na morte." },
          { ref: "Jo 14.1-3", texto: "Cristo prepara lugar para os seus e sustém o coração enlutado." },
          { ref: "Sl 39.7", texto: "A esperança final do crente repousa somente em Deus." },
          { ref: "Rm 14.8", texto: "Na vida e na morte pertencemos ao Senhor que nos guarda." },
          { ref: "Sl 73.24", texto: "Deus guia até o fim e acolhe com glória." }
        ]
      },

      lutoRecente: {
        titulo: "Luto Recente",
        lista: [
          { ref: "Sl 6.6-9", texto: "O Senhor ouve o choro sincero e responde com misericórdia." },
          { ref: "Sl 119.50", texto: "A Palavra sustém quando a alma desaba." },
          { ref: "Lm 3.22-23", texto: "A misericórdia de Deus renova o coração ferido pela perda." },
          { ref: "Sl 56.8", texto: "O Senhor recolhe cada lágrima e não ignora o sofrimento." },
          { ref: "Sl 9.9", texto: "Deus é abrigo seguro em tempos de profunda dor." }
        ]
      },

      criseConjugal: {
        titulo: "Crise Conjugal",
        lista: [
          { ref: "Rm 12.10", texto: "O amor sincero e a honra mútua restauram o que foi ferido." },
          { ref: "Pv 3.3-4", texto: "A fidelidade e a verdade fortalecem o relacionamento." },
          { ref: "Ef 4.26", texto: "Resolver a ira com justiça abre caminho para reconciliação." },
          { ref: "Pv 12.4", texto: "A virtude edifica o lar e traz honra." },
          { ref: "1Pe 3.7", texto: "A compreensão e o respeito sustentam a vida conjugal diante de Deus." }
        ]
      },

      problemasFinanceiros: {
        titulo: "Problemas Financeiros",
        lista: [
          { ref: "Hb 13.5", texto: "A segurança verdadeira está na presença fiel do Senhor." },
          { ref: "Sl 37.7", texto: "A calma diante de Deus preserva o coração em tempos de falta." },
          { ref: "Pv 15.16", texto: "É melhor ter pouco com temor do Senhor que muito sem paz." },
          { ref: "Mt 6.20-21", texto: "O coração encontra firmeza quando busca tesouros eternos." },
          { ref: "Sl 55.22", texto: "O Senhor sustém o aflito e não o abandona." }
        ]
      },

      depressaoAnsiedade: {
        titulo: "Depressão / Ansiedade",
        lista: [
          { ref: "Sl 13.1-6", texto: "Mesmo no abatimento, Deus continua sendo o sustento." },
          { ref: "Sl 143.7-8", texto: "A esperança renasce quando se contempla a fidelidade do Senhor." },
          { ref: "Sl 88.1-3", texto: "A Escritura acolhe a dor profunda e legitima o clamor sincero." },
          { ref: "Is 57.15", texto: "O Senhor habita com o abatido para revigorar o espírito quebrado." },
          { ref: "Mt 11.28-30", texto: "Cristo convida o cansado a encontrar descanso em Sua graça." }
        ]
      },

      reconciliacao: {
        titulo: "Reconciliação",
        lista: [
          { ref: "Pv 10.12", texto: "O amor restaura onde o conflito causou divisão." },
          { ref: "Rm 15.5", texto: "Deus concede harmonia para que haja unidade verdadeira." },
          { ref: "Mt 18.21-22", texto: "O perdão abundante reflete a misericórdia divina." },
          { ref: "Pv 17.9", texto: "Quem preserva a paz fortalece os relacionamentos duradouros." }
        ]
      },

      aconselhamentoRapido: {
        titulo: "Aconselhamento Rápido",
        lista: [
          { ref: "Sl 25.4-5", texto: "O caminho seguro é encontrado buscando a direção divina." },
          { ref: "Sl 32.8", texto: "O Senhor guia com sabedoria e cuidado." },
          { ref: "Is 30.21", texto: "A voz de Deus orienta quando há incerteza." }
        ]
      },

      visitasFamiliares: {
        titulo: "Visitas Familiares",
        lista: [
          { ref: "Ef 3.14-17", texto: "Cristo fortalece o lar com seu amor e poder." },
          { ref: "Sl 128.1-4", texto: "A bênção repousa sobre a família que teme ao Senhor." },
          { ref: "Rm 12.12", texto: "A esperança, a paciência e a oração sustentam o lar." },
          { ref: "Pv 24.3-4", texto: "A sabedoria edifica casas sólidas e duradouras." }
        ]
      }
    }
  },

  celebracoes: {
    titulo: "Versículos para Celebrações",
    subcategorias: {
      aniversarioGeral: {
        titulo: "Aniversário Geral",
        lista: [
          { ref: "Sl 90.12", texto: "A consciência da brevidade da vida conduz a um viver sábio." },
          { ref: "Sl 139.16", texto: "Cada dia está registrado por Deus e faz parte de Sua providência." },
          { ref: "Sl 16.11", texto: "A alegria verdadeira está na presença do Senhor." },
          { ref: "Pv 3.5-6", texto: "Um novo ano deve ser entregue à direção de Deus." },
          { ref: "Lm 3.22-23", texto: "Chegar a mais um ano é fruto da misericórdia renovada." },
          { ref: "Tg 4.13-15", texto: "O futuro pertence ao Senhor e deve ser buscado com humildade." }
        ]
      },

      aniversarioCrianca: {
        titulo: "Aniversário de Criança",
        lista: [
          { ref: "Sl 127.3-4", texto: "A criança é herança do Senhor e deve ser tratada como tal." },
          { ref: "Pv 22.6", texto: "Cada aniversário renova o compromisso de instruir no caminho certo." },
          { ref: "Sl 78.5-7", texto: "O ensino fiel fortalece a confiança da criança em Deus." },
          { ref: "Mc 10.13-16", texto: "Jesus acolhe e abençoa as crianças com amor." },
          { ref: "2Tm 3.14-15", texto: "Desde cedo a criança pode ser firmada na Escritura." }
        ]
      },

      aniversario15: {
        titulo: "Aniversário de 15 Anos",
        lista: [
          { ref: "Ec 12.1", texto: "A juventude deve começar buscando ao Criador." },
          { ref: "1Tm 4.12", texto: "Mesmo jovem, o crente é chamado a ser exemplo." },
          { ref: "Pv 1.10", texto: "A juventude precisa discernir e resistir às más influências." },
          { ref: "Pv 4.23", texto: "O coração deve ser guardado porque dele procedem as decisões." },
          { ref: "Sl 119.9", texto: "O caminho puro do jovem é guiado pela Palavra." }
        ]
      },

      aniversarioCasamento: {
        titulo: "Aniversário de Casamento",
        lista: [
          { ref: "Gn 2.24", texto: "O casamento é união estabelecida e abençoada por Deus." },
          { ref: "Pv 5.18", texto: "A alegria conjugal é bênção que procede do Senhor." },
          { ref: "Ef 5.25-28", texto: "O amor sacrificial de Cristo é o modelo para o lar." },
          { ref: "Ef 5.33", texto: "Amor e respeito sustentam a vida a dois." },
          { ref: "Cl 3.12-14", texto: "Perdão e misericórdia preservam o vínculo conjugal." },
          { ref: "1Pe 3.7", texto: "A compreensão e a honra edificam o relacionamento." }
        ]
      },

      aniversarioIgreja: {
        titulo: "Aniversário da Igreja",
        lista: [
          { ref: "At 2.42-47", texto: "A saúde da igreja é vista na doutrina, comunhão e oração." },
          { ref: "Ef 4.11-13", texto: "O alvo da igreja é maturidade e unidade em Cristo." },
          { ref: "Cl 1.28-29", texto: "A missão da igreja é formar crentes maduros." },
          { ref: "1Ts 1.2-3", texto: "A marca de uma igreja fiel é fé, amor e esperança." },
          { ref: "Ap 2.4-5", texto: "Cada ano é ocasião de examinar se o primeiro amor foi perdido." },
          { ref: "1Pe 2.5", texto: "Deus edifica Seu povo como casa espiritual." }
        ]
      }
    }
  },

  batismo: {
    titulo: "Batismo – Versículos",
    lista: [
      { ref: "Mt 3.13-17", texto: "O batismo de Jesus manifesta Sua identificação com o povo e o prazer do Pai." },
      { ref: "Mc 1.9-11", texto: "A voz do Pai confirma Jesus como Filho amado no início de Seu ministério." },
      { ref: "Lc 3.21-22", texto: "A presença do Espírito e a voz do Pai revelam a aprovação divina sobre Cristo." },
      { ref: "Jo 1.29-34", texto: "João anuncia Jesus como o Cordeiro de Deus e aquele que batiza com o Espírito." },
      { ref: "Mt 28.19-20", texto: "O batismo marca o início da vida de discipulado sob a autoridade de Cristo." },
      { ref: "Mc 16.15-16", texto: "O batismo aparece como resposta pública à fé em Cristo." },
      { ref: "At 2.38-41", texto: "O arrependimento e o batismo expressam a adesão ao evangelho." },
      { ref: "At 8.12", texto: "Homens e mulheres são batizados após crerem no evangelho." },
      { ref: "At 8.36-38", texto: "O eunuco confessa a fé e é imediatamente batizado como sinal de entrega a Cristo." },
      { ref: "At 9.18", texto: "Saulo, transformado, dá o primeiro passo público de sua nova vida em Cristo." },
      { ref: "At 10.47-48", texto: "Deus recebe gentios, e o batismo confirma sua inclusão no povo de Cristo." },
      { ref: "At 16.14-15", texto: "Lídia responde ao evangelho e sela sua fé com o batismo." },
      { ref: "At 16.31-33", texto: "O carcereiro crê em Cristo e sua casa segue o mesmo caminho." },
      { ref: "At 18.8", texto: "Coríntios creem e recebem o batismo como sinal de sua fé." },
      { ref: "At 19.3-5", texto: "Discípulos recebem o batismo em nome de Jesus, revelando sua centralidade." },
      { ref: "At 22.16", texto: "Paulo é chamado a selar sua fé por meio do batismo." },
      { ref: "Rm 6.3-4", texto: "O batismo aponta para união com Cristo em morte e ressurreição." },
      { ref: "1Co 1.13-17", texto: "O evangelho é o centro, não o ministro que batiza." },
      { ref: "1Co 12.13", texto: "O batismo manifesta a união do crente ao corpo de Cristo." },
      { ref: "Gl 3.27", texto: "O batismo sinaliza o revestimento com Cristo." },
      { ref: "Ef 4.4-6", texto: "Há um só batismo que une o povo de Deus." },
      { ref: "Cl 2.12", texto: "O batismo aponta para nova vida mediante a fé." },
      { ref: "1Pe 3.21", texto: "O batismo representa boa consciência diante de Deus." },
      { ref: "1Co 10.1-2", texto: "A travessia do mar ilustra união com o mediador de Deus." },
      { ref: "Hb 10.22", texto: "O corpo lavado aponta para a obra purificadora de Deus." }
    ]
  },

  ceia: {
    titulo: "Ceia do Senhor – Versículos",
    lista: [
      { ref: "Mt 26.26-29", texto: "A ceia lembra o sacrifício de Cristo e aponta para o Reino futuro." },
      { ref: "Mc 14.22-25", texto: "O pão e o cálice expressam o corpo entregue e o sangue derramado." },
      { ref: "Lc 22.14-20", texto: "A ceia celebra a nova aliança inaugurada por Cristo." },
      { ref: "At 2.42", texto: "O partir do pão é marca da comunhão dos crentes." },
      { ref: "At 2.46", texto: "A mesa cristã é vivida com alegria e simplicidade." },
      { ref: "At 20.7", texto: "A ceia estava ligada ao culto cristão e à pregação." },
      { ref: "At 20.11", texto: "O partir do pão acompanhava o encorajamento mútuo." },
      { ref: "1Co 10.16-17", texto: "A ceia é comunhão com Cristo e sinal de unidade do corpo." },
      { ref: "1Co 10.21", texto: "A mesa do Senhor exige exclusividade de adoração." },
      { ref: "1Co 11.17-22", texto: "A ceia deve ser preservada de abusos e divisões." },
      { ref: "1Co 11.23-26", texto: "A ceia proclama a morte do Senhor até que Ele venha." },
      { ref: "1Co 11.27-32", texto: "Participar da ceia requer exame e reverência." },
      { ref: "Jo 6.35", texto: "Cristo é o pão que dá vida espiritual verdadeira." },
      { ref: "Jo 6.53-56", texto: "A união com Cristo é essencial e profunda." },
      { ref: "Hb 9.11-15", texto: "O sacrifício de Cristo é a base da reconciliação celebrada na ceia." }
    ]
  },

  bencaoApostolica: {
    titulo: "Bênção Apostólica – Versículos",
    lista: [
      { ref: "Nm 6.24-26", texto: "O Senhor abençoa, guarda, ilumina e dá paz ao Seu povo." },
      { ref: "Rm 15.5-6", texto: "Deus concede unidade para que a igreja glorifique a Cristo." },
      { ref: "Rm 15.13", texto: "O Deus da esperança enche de alegria e paz pelo Espírito." },
      { ref: "Rm 16.20", texto: "O Deus de paz derrota o mal e sustém Seu povo." },
      { ref: "1Co 16.23", texto: "A graça de Cristo repousa sobre a igreja." },
      { ref: "2Co 13.13", texto: "Graça, amor e comunhão da Trindade acompanham o povo de Deus." },
      { ref: "Gl 6.16", texto: "A paz e a misericórdia do Senhor repousam sobre os Seus." },
      { ref: "Ef 3.20-21", texto: "A Deus pertence a glória na igreja e em Cristo para sempre." },
      { ref: "Ef 6.23-24", texto: "Paz e graça acompanham os que amam Cristo com sinceridade." },
      { ref: "Fp 4.7", texto: "A paz de Deus guarda coração e mente." },
      { ref: "Fp 4.23", texto: "A graça do Senhor esteja com os crentes." },
      { ref: "Cl 4.18", texto: "A graça sustém a vida da igreja." },
      { ref: "1Ts 3.11-13", texto: "Deus firma os crentes em santidade até a vinda de Cristo." },
      { ref: "1Ts 5.23-24", texto: "O Deus de paz santifica completamente o Seu povo." },
      { ref: "2Ts 2.16-17", texto: "O Senhor conforta e fortalece para toda boa obra." },
      { ref: "2Ts 3.16", texto: "O Deus da paz concede paz sempre e de todas as maneiras." },
      { ref: "2Ts 3.18", texto: "A graça de Cristo permanece com todos." },
      { ref: "Hb 13.20-21", texto: "O Deus de paz aperfeiçoa o Seu povo em toda boa obra." },
      { ref: "Hb 13.25", texto: "A graça esteja com todos os santos." },
      { ref: "1Pe 5.10-11", texto: "O Deus de toda graça restaura, confirma e fortalece." },
      { ref: "1Pe 5.14", texto: "Paz a todos os que estão em Cristo." },
      { ref: "2Pe 3.18", texto: "O povo de Deus deve crescer na graça e conhecimento de Cristo." },
      { ref: "Jd 24-25", texto: "Deus guarda o Seu povo de tropeços e o apresenta com alegria." },
      { ref: "Ap 1.4-5", texto: "Graça e paz vêm de Deus, do Espírito e de Cristo." },
      { ref: "Ap 22.20-21", texto: "A graça do Senhor Jesus é a palavra final para a igreja." }
    ]
  }
};
