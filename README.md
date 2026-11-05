# 🇲🇷 República Unida de Monte Real

Portal institucional de uma comunidade fictícia, com identidade visual dourada, preta e branca.

**Ordem • União • Progresso**

## Portal

O site é publicado pelo GitHub Pages:
https://zmen1no123-bit.github.io/Republica-Unida-De-Monte-Real/

## Tecnologias

- HTML, CSS e JavaScript.
- Appwrite Auth (cadastro, login e verificação de e-mail).
- Appwrite TablesDB (banco de dados).
- Appwrite Functions (operações administrativas no servidor).

A configuração do backend está em [APPWRITE_MEMBROS.md](APPWRITE_MEMBROS.md).

## Estrutura

- `index.html`, `style.css`, `script.js`: portal público.
- `cadastro.html`, `login.html`, `verificar.html`, `painel.html`, `auth.js`: cadastro, login e área de membros.
- `solicitar-ingresso.html`: formulário de solicitação de ingresso.
- `admin-solicitacoes.html`, `admin-solicitacoes.js`: painel de análise de solicitações, restrito à equipe `rumr-admin`.
- `appwrite-functions/rumr-admin/`: código da Function que valida o acesso e executa as ações administrativas.
- `documentos/`: Constituição, modelos de decretos e regimentos.
- `ministerios/`: estrutura ministerial.
- `instituicoes/`: estatutos da Presidência, do Congresso unicameral e do Supremo Tribunal.
- `documento.html` e `documento.js`: visualizador de documentos Markdown.
- `admin.html` e `admin.js`: protótipo antigo, baseado em armazenamento local do navegador. Não deve ser usado para administração real.

## Segurança

- Nenhuma chave secreta deve ser colocada no frontend ou no repositório.
- Endpoint e Project ID são identificadores públicos e podem aparecer no código.
- Toda operação administrativa é validada no servidor, dentro da Function.

## Natureza dos documentos

Este projeto organiza uma comunidade fictícia. Seus documentos são registros internos e não possuem força de lei estatal nem substituem a legislação brasileira.

## Identidade visual

- Dourado: `#D6AA3B`
- Preto: `#111111`
- Branco/off-white: `#F7F6F2`
