const { defineConfig } = require("cypress");
const cucumber = require("cypress-cucumber-preprocessor").default;
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    specPattern: "**/*.feature",
    video: false,
    setupNodeEvents(on, config) {
      // Preprocessor do Cucumber (BDD)
      on("file:preprocessor", cucumber());

      // Task de Auditoria Dinâmica com IA (OpenAI GPT-4o) no backend Node.js
      on("task", {
        async auditarComOpenAI({ html, css }) {
          const apiKey = process.env.OPENAI_API_KEY || config.env.OPENAI_API_KEY;
          const reportDir = path.join(__dirname, "cypress", "reports");

          if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
          }

          if (!apiKey) {
            const msgErro =
              "[VIOLAÇÃO CRÍTICA] Variável de ambiente OPENAI_API_KEY não configurada. Configure a secret OPENAI_API_KEY em Settings > Secrets and variables > Actions no repositório do GitHub.";
            fs.writeFileSync(path.join(reportDir, "a11y-report.md"), msgErro, "utf8");
            return msgErro;
          }

          const openai = new OpenAI({ apiKey });

          const systemPrompt = `Atue como um Auditor Sênior de Acessibilidade Digital (WCAG 2.2 níveis A e AA) em uma esteira de CI/CD (Shift-Left Quality Gate), alinhado às auditorias do Google Lighthouse, WAVE e Leitores de Tela (NVDA / VoiceOver).
Você receberá o HTML renderizado e o CSS da aplicação "QAfé Academy".

Sua missão é auditar rigorosamente o código procurando por falhas críticas de acessibilidade, tais como:
1. Elementos interativos (links <a>, botões <button>) sem nome acessível ou cujo texto esteja oculto para leitores de tela (ex: texto dentro de <span aria-hidden="true"> sem aria-label no elemento pai — causando erro de "Empty link" no WAVE/Lighthouse e fazendo o leitor de tela anunciar apenas "link").
2. Campos de formulário (<input>) sem <label for="..."> correspondente ou sem rotulagem acessível (aria-label / aria-labelledby), dependendo apenas de placeholder (erro "Missing form label" no WAVE/Lighthouse, WCAG 1.3.1 / 3.3.2 / 4.1.2).
3. Problemas severos de contraste de cores abaixo de 4.5:1 (ex: texto ou dica com cor escura como #525252 ou #4a4a4a sobre fundo escuro #222222 / #2a2a2a — violando WCAG 1.4.3 Contrast Minimum).
4. Bloqueio de navegação por teclado ou ausência de semântica interativa (ex: link <a> com tabindex="-1" ou sem href para ações como "Esqueci minha senha", ou remoção de foco visível sem :focus-visible — violando WCAG 2.1.1 e 2.4.7).
5. Imagens (<img>) informativas sem atributo alt (WCAG 1.1.1).

REGRAS ESTRITAS DE RESPOSTA:
- Se encontrar QUALQUER violação crítica listada acima, inicie sua resposta OBRIGATORIAMENTE com a tag exata: [VIOLAÇÃO CRÍTICA]
  Em seguida, gere um relatório estruturado em Markdown contendo:
  - **Resumo do Veredito:** Reprovado no Quality Gate de Acessibilidade ❌
  - **Violações Encontradas:** Para cada falha, apresente:
    - **Critério WCAG 2.2 Violado** (ex: WCAG 4.1.2, 2.4.4, 1.3.1, 1.4.3, 2.1.1)
    - **Diagnóstico (Lighthouse / WAVE / Leitor de Tela):** Como essa falha impacta o usuário real (ex: o que o NVDA/VoiceOver anuncia ou por que quem navega por teclado/baixa visão é bloqueado)
    - **Trecho de Código com Problema**
    - **Sugestão de Correção (Código Acessível)**
- Se o código estiver totalmente acessível e sem nenhuma das violações críticas acima, inicie sua resposta OBRIGATORIAMENTE com a tag exata: [ACESSÍVEL]
  Em seguida, gere um relatório estruturado em Markdown contendo:
  - **Resumo do Veredito:** Aprovado no Quality Gate de Acessibilidade ✅
  - **Pontos Fortes Validados (WCAG 2.2 & Conformidade Lighthouse/WAVE/Screen Reader):** Destaque as boas práticas presentes no código (ex: Skip Link WCAG 2.4.1, nomes acessíveis via aria-label nos links estilizados da logo e redes sociais, campos de formulário todos rotulados com <label for="..."> e aria-describedby, padrão WAI-ARIA Tabs, aria-live no feedback, navegação por teclado plena e contraste AAA com foco visível WCAG 2.4.7).`;

          const userPrompt = `Audite o seguinte código renderizado da página:

### HTML Renderizado (<body>):
\`\`\`html
${html}
\`\`\`

${css ? `### CSS Aplicado:\n\`\`\`css\n${css}\n\`\`\`` : ""}`;

          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              temperature: 0,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
            });

            const laudo = response.choices[0].message.content;

            // Salva o laudo em Markdown e JSON para o GitHub Actions comentar no PR e publicar no Job Summary
            fs.writeFileSync(path.join(reportDir, "a11y-report.md"), laudo, "utf8");
            fs.writeFileSync(
              path.join(reportDir, "a11y-report.json"),
              JSON.stringify(
                {
                  timestamp: new Date().toISOString(),
                  model: "gpt-4o",
                  approved: !laudo.includes("[VIOLAÇÃO CRÍTICA]"),
                  report: laudo,
                },
                null,
                2
              ),
              "utf8"
            );

            console.log("\n================ LAUDO DE ACESSIBILIDADE (IA) ================");
            console.log(laudo);
            console.log("==============================================================\n");

            return laudo;
          } catch (error) {
            console.error("❌ Erro na API da OpenAI:", error);
            const erroMsg = `[VIOLAÇÃO CRÍTICA] Erro ao consultar a API da OpenAI: ${error.message}`;
            fs.writeFileSync(path.join(reportDir, "a11y-report.md"), erroMsg, "utf8");
            return erroMsg;
          }
        },
      });

      return config;
    },
  },
});
