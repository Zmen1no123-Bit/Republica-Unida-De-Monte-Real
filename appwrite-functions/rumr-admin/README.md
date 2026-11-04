# Function administrativa RUMR

Esta função protege a leitura e a revisão das solicitações de ingresso. Ela não concede cargos de administrador a participantes.

## Arquivos

- `src/main.js`: valida a sessão, exige e-mail verificado e confirma a participação na equipe `rumr-admins`.
- `package.json`: dependência do SDK oficial `node-appwrite`.

## Configuração no Appwrite

1. No projeto RUMR, abra **Functions** e crie uma função chamada **RUMR Administração**.
2. Use o runtime Node.js compatível com o SDK listado em `package.json`.
3. Conecte o repositório GitHub `Zmen1no123-Bit/Republica-Unida-De-Monte-Real`.
4. Configure o diretório raiz como `appwrite-functions/rumr-admin`.
5. Configure o entrypoint como `src/main.js`.
6. Configure a instalação de dependências com `npm install`.
7. Nas permissões de execução do domínio da função, permita chamadas públicas (`Any`) somente porque a função valida obrigatoriamente o JWT e a equipe no próprio código. Nunca remova essa validação.
8. Em **Settings > Scopes**, habilite somente os escopos de leitura e atualização de linhas do TablesDB necessários à tabela de solicitações (`rows.read` e `rows.write`).
9. Não crie nem cole uma API key manual no código. O Appwrite injeta uma chave efêmera no ambiente da função.
10. Faça o deploy e aguarde a conclusão.

## Colunas necessárias na tabela `membership_requests`

Além de `displayName` e `motivation`, crie:

| Key | Tipo | Configuração |
|---|---|---|
| `status` | String | tamanho 20, obrigatório, valor padrão `pending` |
| `reviewedAt` | Datetime | não obrigatório |
| `reviewedBy` | String | tamanho 36, não obrigatório |

Não permita que usuários comuns alterem essas colunas. O formulário público atual envia somente `displayName` e `motivation`.

## Contrato HTTP

Todas as chamadas devem usar POST e enviar o JWT do usuário no cabeçalho `x-appwrite-user-jwt`, além de JSON:

- `{"action":"list"}`: lista até 100 solicitações.
- `{"action":"review","rowId":"ID_DA_LINHA","status":"approved"}`: aprova.
- `{"action":"review","rowId":"ID_DA_LINHA","status":"rejected"}`: rejeita.

A função verifica a identidade com JWT e exige uma associação confirmada à equipe `rumr-admins`. A chave efêmera do Appwrite é usada somente no servidor para acessar as linhas.

## Limites desta etapa

A aprovação atual altera apenas o status da solicitação e registra data e identificador do revisor. Ela **não** cria automaticamente uma conta, não adiciona a pessoa à equipe de administradores e não concede outros cargos. A interface administrativa do site será conectada depois que a função estiver implantada e testada.

Nunca publique API keys, senhas, JWTs ou outros segredos no GitHub.
