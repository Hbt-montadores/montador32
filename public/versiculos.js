const versiculos = {
    "Hospital": `
VERSÍCULOS PARA VISITAÇÕES E SITUAÇÕES PASTORAIS
=========================================================
HOSPITAL
Sl 46.1
Deus é amparo presente quando as forças se desvanecem.
Is 26.3
A mente firmada no Senhor encontra paz mesmo em meio à enfermidade.
Sl 73.26
Ainda que o corpo falhe, Deus permanece como força e porção eterna.
Sl 94.19
O consolo do Senhor acalma o coração afligido pela dor.
2Co 12.9
A graça de Cristo sustém quando a fragilidade é mais evidente.
Sl 86.7
O Senhor responde no dia da angústia e sustém o enfermo.
Sl 30.10
Deus ouve o clamor sincero e se inclina com misericórdia.
________________________________________
`,
    "Pós-operatório": `
PÓS-OPERATÓRIO
Sl 147.3
O Senhor restaura o abatido e renova o coração aflito.
Is 40.29
Ele fortalece o cansado e consola o enfraquecido.
Sl 138.7
Deus estende sua mão protetora mesmo após momentos de grande fragilidade.
Sl 118.17
A vida preservada testemunha a bondade do Senhor.
Sl 20.1
O Deus de Jacó sustém no momento da necessidade.
Sl 145.14
O Senhor levanta o que tropeça e firma o vacilante.
________________________________________
`,
    "Velórios": `
VELÓRIOS
Sl 116.15
A morte dos santos é preciosa aos olhos do Senhor, que os acolhe.
Sl 48.14
Deus conduz seu povo nesta vida e também na morte.
Jo 14.1-3
Cristo prepara lugar para os seus e sustém o coração enlutado.
Sl 39.7
A esperança final do crente repousa somente em Deus.
Rm 14.8
Na vida e na morte pertencemos ao Senhor que nos guarda.
Sl 73.24
Deus guia até o fim e acolhe com glória.
________________________________________
`,
    "Luto recente": `
LUTO RECENTE
Sl 6.6-9
O Senhor ouve o choro sincero e responde com misericórdia.
Sl 119.50
A Palavra sustém quando a alma desaba.
Lm 3.22-23
A misericórdia de Deus renova o coração ferido pela perda.
Sl 56.8
O Senhor recolhe cada lágrima e não ignora o sofrimento.
Sl 9.9
Deus é abrigo seguro em tempos de profunda dor.
________________________________________
`,
    "Crise conjugal": `
CRISE CONJUGAL
Rm 12.10
O amor sincero e a honra mútua restauram o que foi ferido.
Pv 3.3-4
A fidelidade e a verdade fortalecem o relacionamento.
Ef 4.26
Resolver a ira com justiça abre caminho para reconciliação.
Pv 12.4
A virtude edifica o lar e traz honra.
1Pe 3.7
A compreensão e o respeito sustentam a vida conjugal diante de Deus.
________________________________________
`,
    "Problemas financeiros": `
PROBLEMAS FINANCEIROS
Hb 13.5
A segurança verdadeira está na presença fiel do Senhor.
Sl 37.7
A calma diante de Deus preserva o coração em tempos de falta.
Pv 15.16
É melhor ter pouco com temor do Senhor que muito sem paz.
Mt 6.20-21
O coração encontra firmeza quando busca tesouros eternos.
Sl 55.22
O Senhor sustém o aflito e não o abandona.
________________________________________
`,
    "Depressão / Ansiedade": `
DEPRESSÃO / ANSIEDADE
Sl 13.1-6
Mesmo no abatimento, Deus continua sendo o sustento.
Sl 143.7-8
A esperança renasce quando se contempla a fidelidade do Senhor.
Sl 88.1-3
A Escritura acolhe a dor profunda e legitima o clamor sincero.
Is 57.15
O Senhor habita com o abatido para revigorar o espírito quebrado.
Mt 11.28-30
Cristo convida o cansado a encontrar descanso em Sua graça.
________________________________________
`,
    "Reconciliação": `
RECONCILIAÇÃO
Pv 10.12
O amor restaura onde o conflito causou divisão.
Rm 15.5
Deus concede harmonia para que haja unidade verdadeira.
Mt 18.21-22
O perdão abundante reflete a misericórdia divina.
Pv 17.9
Quem preserva a paz fortalece os relacionamentos duradouros.
________________________________________
`,
    "Aconselhamento Rápido": `
ACONSELHAMENTO RÁPIDO
Sl 25.4-5
O caminho seguro é encontrado buscando a direção divina.
Sl 32.8
O Senhor guia com sabedoria e cuidado.
Is 30.21
A voz de Deus orienta quando há incerteza.
________________________________________
`,
    "Visitas familiares": `
VISITAS FAMILIARES
Ef 3.14-17
Cristo fortalece o lar com seu amor e poder.
Sl 128.1-4
A bênção repousa sobre a família que teme ao Senhor.
Rm 12.12
A esperança, a paciência e a oração sustentam o lar.
Pv 24.3-4
A sabedoria edifica casas sólidas e duradouras.
________________________________________
=========================================================
VERSÍCULOS PARA CELEBRAÇÕES
=========================================================
ANIVERSÁRIOS – SUBCATEGORIAS
________________________________________
`,
    "Aniversário Geral": `
ANIVERSÁRIO GERAL
Sl 90.12
A consciência da brevidade da vida conduz a um viver sábio.
Sl 139.16
Cada dia está registrado por Deus e faz parte de Sua providência.
Sl 16.11
A alegria verdadeira está na presença do Senhor.
Pv 3.5-6
Um novo ano deve ser entregue à direção de Deus.
Lm 3.22-23
Chegar a mais um ano é fruto da misericórdia renovada.
Tg 4.13-15
O futuro pertence ao Senhor e deve ser buscado com humildade.
________________________________________
`,
    "Aniversário de Criança": `
ANIVERSÁRIO DE CRIANÇA
Sl 127.3-4
A criança é herança do Senhor e deve ser tratada como tal.
Pv 22.6
Cada aniversário renova o compromisso de instruir no caminho certo.
Sl 78.5-7
O ensino fiel fortalece a confiança da criança em Deus.
Mc 10.13-16
Jesus acolhe e abençoa as crianças com amor.
2Tm 3.14-15
Desde cedo a criança pode ser firmada na Escritura.
________________________________________
`,
    "Aniversário de 15 anos": `
ANIVERSÁRIO DE 15 ANOS
Ec 12.1
A juventude deve começar buscando ao Criador.
1Tm 4.12
Mesmo jovem, o crente é chamado a ser exemplo.
Pv 1.10
A juventude precisa discernir e resistir às más influências.
Pv 4.23
O coração deve ser guardado porque dele procedem as decisões.
Sl 119.9
O caminho puro do jovem é guiado pela Palavra.
________________________________________
`,
    "Aniversário de Casamento": `
ANIVERSÁRIO DE CASAMENTO
Gn 2.24
O casamento é união estabelecida e abençoada por Deus.
Pv 5.18
A alegria conjugal é bênção que procede do Senhor.
Ef 5.25-28
O amor sacrificial de Cristo é o modelo para o lar.
Ef 5.33
Amor e respeito sustentam a vida a dois.
Cl 3.12-14
Perdão e misericórdia preservam o vínculo conjugal.
1Pe 3.7
A compreensão e a honra edificam o relacionamento.
________________________________________
`,
    "Aniversário da Igreja": `
ANIVERSÁRIO DA IGREJA
At 2.42-47
A saúde da igreja é vista na doutrina, comunhão e oração.
Ef 4.11-13
O alvo da igreja é maturidade e unidade em Cristo.
Cl 1.28-29
A missão da igreja é formar crentes maduros.
1Ts 1.2-3
A marca de uma igreja fiel é fé, amor e esperança.
Ap 2.4-5
Cada ano é ocasião de examinar se o primeiro amor foi perdido.
1Pe 2.5
Deus edifica Seu povo como casa espiritual.
________________________________________
=========================================================
BATISMO – VERSÍCULOS 
=========================================================
`,
    "Batismo": `
BATISMO
Mt 3.13-17
O batismo de Jesus manifesta Sua identificação com o povo e o prazer do Pai.
Mc 1.9-11
A voz do Pai confirma Jesus como Filho amado no início de Seu ministério.
Lc 3.21-22
A presença do Espírito e a voz do Pai revelam a aprovação divina sobre Cristo.
Jo 1.29-34
João anuncia Jesus como o Cordeiro de Deus e aquele que batiza com o Espírito.
Mt 28.19-20
O batismo marca o início da vida de discipulado sob a autoridade de Cristo.
Mc 16.15-16
O batismo aparece como resposta pública à fé em Cristo.
At 2.38-41
O arrependimento e o batismo expressam a adesão ao evangelho.
At 8.12
Homens e mulheres são batizados após crerem no evangelho.
At 8.36-38
O eunuco confessa a fé e é imediatamente batizado como sinal de entrega a Cristo.
At 9.18
Saulo, transformado, dá o primeiro passo público de sua nova vida em Cristo.
At 10.47-48
Deus recebe gentios, e o batismo confirma sua inclusão no povo de Cristo.
At 16.14-15
Lídia responde ao evangelho e sela sua fé com o batismo.
At 16.31-33
O carcereiro crê em Cristo e sua casa segue o mesmo caminho.
At 18.8
Coríntios creem e recebem o batismo como sinal de sua fé.
At 19.3-5
Discípulos recebem o batismo em nome de Jesus, revelando sua centralidade.
At 22.16
Paulo é chamado a selar sua fé por meio do batismo.
Rm 6.3-4
O batismo aponta para união com Cristo em morte e ressurreição.
1Co 1.13-17
O evangelho é o centro, não o ministro que batiza.
1Co 12.13
O batismo manifesta a união do crente ao corpo de Cristo.
Gl 3.27
O batismo sinaliza o revestimento com Cristo.
Ef 4.4-6
Há um só batismo que une o povo de Deus.
Cl 2.12
O batismo aponta para nova vida mediante a fé.
1Pe 3.21
O batismo representa boa consciência diante de Deus.
1Co 10.1-2
A travessia do mar ilustra união com o mediador de Deus.
Hb 10.22
O corpo lavado aponta para a obra purificadora de Deus.
________________________________________
=========================================================
CEIA DO SENHOR – VERSÍCULOS 
=========================================================
`,
    "Ceia do Senhor": `
CEIA DO SENHOR
Mt 26.26-29
A ceia lembra o sacrifício de Cristo e aponta para o Reino futuro.
Mc 14.22-25
O pão e o cálice expressam o corpo entregue e o sangue derramado.
Lc 22.14-20
A ceia celebra a nova aliança inaugurada por Cristo.
At 2.42
O partir do pão é marca da comunhão dos crentes.
At 2.46
A mesa cristã é vivida com alegria e simplicidade.
At 20.7
A ceia estava ligada ao culto cristão e à pregação.
At 20.11
O partir do pão acompanhava o encorajamento mútuo.
1Co 10.16-17
A ceia é comunhão com Cristo e sinal de unidade do corpo.
1Co 10.21
A mesa do Senhor exige exclusividade de adoração.
1Co 11.17-22
A ceia deve ser preservada de abusos e divisões.
1Co 11.23-26
A ceia proclama a morte do Senhor até que Ele venha.
1Co 11.27-32
Participar da ceia requer exame e reverência.
Jo 6.35
Cristo é o pão que dá vida espiritual verdadeira.
Jo 6.53-56
A união com Cristo é essencial e profunda.
Hb 9.11-15
O sacrifício de Cristo é a base da reconciliação celebrada na ceia.
________________________________________
=========================================================
BÊNÇÃO APOSTÓLICA – VERSÍCULOS 
=========================================================
`,
    "Bênção Apostólica": `
BÊNÇÃO APOSTÓLICA
Nm 6.24-26
O Senhor abençoa, guarda, ilumina e dá paz ao Seu povo.
Rm 15.5-6
Deus concede unidade para que a igreja glorifique a Cristo.
Rm 15.13
O Deus da esperança enche de alegria e paz pelo Espírito.
Rm 16.20
O Deus de paz derrota o mal e sustém Seu povo.
1Co 16.23
A graça de Cristo repousa sobre a igreja.
2Co 13.13
Graça, amor e comunhão da Trindade acompanham o povo de Deus.
Gl 6.16
A paz e a misericórdia do Senhor repousam sobre os Seus.
Ef 3.20-21
A Deus pertence a glória na igreja e em Cristo para sempre.
Ef 6.23-24
Paz e graça acompanham os que amam Cristo com sinceridade.
Fp 4.7
A paz de Deus guarda coração e mente.
Fp 4.23
A graça do Senhor esteja com os crentes.
Cl 4.18
A graça sustém a vida da igreja.
1Ts 3.11-13
Deus firma os crentes em santidade até a vinda de Cristo.
1Ts 5.23-24
O Deus de paz santifica completamente o Seu povo.
2Ts 2.16-17
O Senhor conforta e fortalece para toda boa obra.
2Ts 3.16
O Deus da paz concede paz sempre e de todas as maneiras.
2Ts 3.18
A graça de Cristo permanece com todos.
Hb 13.20-21
O Deus de paz aperfeiçoa o Seu povo em toda boa obra.
Hb 13.25
A graça esteja com todos os santos.
1Pe 5.10-11
O Deus de toda graça restaura, confirma e fortalece.
1Pe 5.14
Paz a todos os que estão em Cristo.
2Pe 3.18
O povo de Deus deve crescer na graça e conhecimento de Cristo.
Jd 24-25
Deus guarda o Seu povo de tropeços e o apresenta com alegria.
Ap 1.4-5
Graça e paz vêm de Deus, do Espírito e de Cristo.
Ap 22.20-21
A graça do Senhor Jesus é a palavra final para a igreja.
`
};

document.addEventListener("DOMContentLoaded", () => {
    const categoryButtons = document.querySelectorAll("#category-buttons button");
    const categoriesScreen = document.getElementById("categories-screen");
    const versesScreen = document.getElementById("verses-screen");
    const backButton = document.getElementById("back-button");
    const versesContainer = document.getElementById("verses-container");
    const selectedCategoryTitle = document.getElementById("selected-category-title");
    const versesTextElement = document.getElementById("verses-text");
    const copyButton = document.getElementById("copy-button");
    const whatsappButton = document.getElementById("whatsapp-button");

    let currentCategory = "";
    let currentText = "";

    function showCategory(category) {
        const text = versiculos[category] || "";
        currentCategory = category;
        currentText = text.trim();

        selectedCategoryTitle.textContent = category;

        if (currentText) {
            versesTextElement.textContent = currentText;
        } else {
            versesTextElement.textContent = "Nenhum versículo cadastrado para esta categoria ainda.";
        }

        categoriesScreen.style.display = "none";
        versesScreen.style.display = "block";

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    }

    categoryButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const category = button.getAttribute("data-category");
            showCategory(category);
        });
    });

    backButton.addEventListener("click", () => {
        versesScreen.style.display = "none";
        categoriesScreen.style.display = "block";
        currentCategory = "";
        currentText = "";
        selectedCategoryTitle.textContent = "";
        versesTextElement.textContent = "";
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    });

    copyButton.addEventListener("click", () => {
        if (!currentCategory) {
            return;
        }

        const textToCopy = `${currentCategory}\n\n${currentText || ""}`.trim();

        if (!textToCopy) {
            return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).catch(() => {
                const range = document.createRange();
                range.selectNodeContents(versesTextElement);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                document.execCommand("copy");
                selection.removeAllRanges();
            });
        } else {
            const range = document.createRange();
            range.selectNodeContents(versesTextElement);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand("copy");
            selection.removeAllRanges();
        }
    });

    whatsappButton.addEventListener("click", () => {
        if (!currentCategory) {
            return;
        }

        const baseUrl = "https://casadopregador.com/montador-de-sermoes-compzap";
        const message = `${currentCategory}\n\n${currentText || ""}\n\nAcesse: ${baseUrl}`.trim();

        if (!message) {
            return;
        }

        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, "_blank");
    });
});
