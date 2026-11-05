# Configuração do Appwrite — RUMR

Este documento descreve a configuração atual do backend da RUMR. Não inclui chaves secretas.

## Projeto

- Nome: RUMR
- Project ID: `6aeb2aec002a69ad90ef`
- Endpoint: `https://fra.cloud.appwrite.io/v1`
- Plataforma web autorizada: `zmen1no123-bit.github.io`

## Autenticação

- Método: e-mail e senha.
- Verificação de e-mail: ativa.
- MFA: desabilitado.

## Banco de dados

- Banco: ID `6aeb8a27000848e802b4` (nome de exibição: `rumr_main`).
- Tabela: `membership_requests` (nome: Solicitações de ingresso).

Colunas, com os nomes exatos (diferenciam maiúsculas e minúsculas):

| Coluna | Tipo | Tamanho | Obrigatória | Padrão |
|---|---|---|---|---|
| `DisplayName` | String | 60 | Sim | — |
| `Motivation` | String | 500 | Sim | — |
| `Status` | String | 20 | Não | `Pending` |
| `ReviewedAt` | Datetime | — | Não | — |
| `ReviewedBy` | String | 36 | Não | — |

Permissões da tabela:

- Criação: "All users".
- Leitura, atualização e exclusão para usuários comuns: não concedidas.
- Row Security: habilitado. Cada solicitação é criada com permissão de leitura apenas para quem a enviou.

## Equipe de administradores

- Nome: Administradores RUMR
- Team ID: `rumr-admin`
- Membros com acesso ao painel: somente os que estiverem com status confirmado.

## Function de administração

- Nome: RUMR Administração
- ID: `rumr-admin`
- Runtime: Node.js 22
- Root directory: `appwrite-functions/rumr-admin`
- Entrypoint: `src/main.js`
- Build command: `npm install`
- Scopes: `rows.read` e `rows.write`
- Execute access: Any (a própria Function valida o usuário e a equipe)

A Function verifica, nesta ordem:

1. Se a sessão (JWT) é válida.
2. Se o e-mail do usuário foi verificado.
3. Se o usuário é membro confirmado da equipe `rumr-admin`.

Só depois disso executa as ações `list` e `review`. A autorização é feita no servidor, não no navegador.

## Chave de API da Function

- Nome da chave: `rumr-admin-function`
- Escopos: somente `rows.read` e `rows.write`.
- Armazenamento: variável da Function chamada `APPWRITE_API_KEY`, marcada como secret.

A chave nunca deve ser colocada no frontend, em arquivos do repositório ou em mensagens. Se for exposta, revogue-a no Appwrite e crie outra.

## Como verificar

1. Listagem: o painel mostra as solicitações com nome e motivação.
2. Rejeição e aprovação: o `Status` muda para `rejected` ou `approved`, e `ReviewedAt` e `ReviewedBy` são preenchidos.
3. Acesso negado: uma conta fora da equipe recebe "Acesso restrito".
