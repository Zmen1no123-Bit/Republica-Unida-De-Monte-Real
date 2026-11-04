# Appwrite — configuração da solicitação de ingresso RUMR

Faça esta configuração com acompanhamento de um responsável adulto. Não compartilhe senhas nem chaves administrativas.

## 1. Criar o banco

No projeto Appwrite **RUMR**, abra **Databases** e crie um banco DocumentsDB:
- Nome: `RUMR Principal`
- Database ID: `rumr_main`

## 2. Criar a coleção

Dentro do banco, crie:
- Nome: `Solicitações de ingresso`
- Collection ID: `membership_requests`

Crie os atributos:
| Key | Tipo | Limite |
|---|---|---:|
| `displayName` | String | 60 |
| `motivation` | String | 500 |

Não crie campos de cargo, aprovação ou função administrativa nesta coleção.

## 3. Configurar a segurança

Na aba **Security** da coleção:
- Ative **Document-level security**.
- Em permissões da coleção, conceda somente **Create** para **Users** com status **Verified**.
- Não conceda Read, Update ou Delete no nível da coleção.
- Não habilite acesso para **Any**.

O formulário define leitura do documento apenas para o usuário que o enviou. As permissões por documento dependem da segurança em nível de documento estar ativada. Documentação: https://appwrite.io/docs/products/databases/documentsdb/permissions

## 4. Revisão

As solicitações podem ser examinadas pelo responsável no Console Appwrite. Não crie botão de aprovação no navegador: aprovação e atribuição de cargos exigem uma operação confiável no servidor, que será uma etapa posterior.

## 5. Teste

1. Entre com uma conta cujo e-mail esteja verificado.
2. Abra `painel.html` e escolha **Solicitar ingresso**.
3. Envie um nome de exibição e uma breve mensagem.
4. Confira se o documento aparece na coleção.
5. Confirme que não existe permissão pública de leitura.

Se aparecer erro de permissão, revise as configurações; não resolva concedendo acesso **Any**.
