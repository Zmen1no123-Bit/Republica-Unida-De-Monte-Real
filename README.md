# 🇲🇷 República Unida de Monte Real

Portal institucional de uma comunidade fictícia, com identidade visual dourada, preta e branca.

## Portal
O site é publicado pelo GitHub Pages (quando habilitado nas configurações do repositório).

## Estrutura
- `index.html`, `style.css`, `script.js`: portal público.
- `cadastro.html`, `login.html`, `verificar.html`, `painel.html` e `auth.js`: primeira etapa de autenticação Appwrite.
- `documentos/`: Constituição, modelos de decretos e regimentos.
- `ministerios/`: estrutura ministerial.
- `instituicoes/`: estatutos da Presidência, Congresso unicameral e Supremo Tribunal.
- `documento.html` e `documento.js`: visualizador formatado de documentos Markdown.
- `admin.html`, `admin.js`: protótipo local de gestão, ainda sem publicação segura.

## Painel administrativo — atenção
O painel atual é apenas um protótipo estático. Ele salva rascunhos no armazenamento local do navegador e permite baixar arquivos Markdown. Não publica documentos no GitHub automaticamente e não possui autenticação segura. Não trate o endereço do painel como privado.

A autenticação inicial usa Appwrite Auth pelo SDK Web. O endpoint e o Project ID são identificadores públicos; nenhuma API key administrativa deve ser colocada no frontend. A aprovação de participantes, cargos e operações administrativas exigirá regras de permissão e lógica confiável no servidor antes de ser ativada. Nunca coloque um token pessoal do GitHub em HTML ou JavaScript público.

## Natureza dos documentos
Este projeto organiza uma comunidade fictícia. Seus documentos são registros internos e não possuem força de lei estatal nem substituem a legislação brasileira.

## Identidade
- Dourado: `#D6AA3B`
- Preto: `#111111`
- Branco/off-white: `#F7F6F2`

**Ordem • União • Progresso**