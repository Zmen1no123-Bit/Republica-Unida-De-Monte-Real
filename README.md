# 🇲🇷 República Unida de Monte Real

Portal institucional de uma comunidade fictícia, com identidade visual dourada, preta e branca.

## Portal
O site é publicado pelo GitHub Pages (quando habilitado nas configurações do repositório).

## Estrutura
- `index.html`, `style.css`, `script.js`: portal público.
- `admin.html`, `admin.js`: protótipo de painel administrativo.
- `documentos/`: Constituição, modelos de decretos e regimentos.
- `ministerios/`: estrutura ministerial.

## Painel administrativo — atenção
O painel atual é apenas um protótipo estático. Ele salva rascunhos no armazenamento local do navegador e permite baixar arquivos Markdown. Não publica documentos no GitHub automaticamente e não possui autenticação segura. Não trate o endereço do painel como privado.

Para habilitar publicação segura diretamente pelo painel, será necessária uma camada de servidor com autenticação (por exemplo, Supabase Auth + Edge Function) e credenciais guardadas exclusivamente no servidor. Nunca coloque um token pessoal do GitHub em HTML ou JavaScript público.

## Natureza dos documentos
Este projeto organiza uma comunidade fictícia. Seus documentos são registros internos e não possuem força de lei estatal nem substituem a legislação brasileira.

## Identidade
- Dourado: `#D6AA3B`
- Preto: `#111111`
- Branco/off-white: `#F7F6F2`

**Ordem • União • Progresso**