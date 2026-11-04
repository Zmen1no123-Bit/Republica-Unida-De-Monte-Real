# Configuração do Supabase — RUMR

Este guia conecta o portal estático do GitHub Pages ao Supabase. O projeto é uma comunidade fictícia e voluntária. Colete apenas os dados mínimos necessários; não solicite documentos de identidade, endereços ou dados criminais.

## 1. Criar o projeto

1. Com a orientação de um responsável adulto, crie/acesse a conta Supabase.
2. Crie um projeto chamado `rumr-portal`.
3. Escolha uma região próxima e guarde a senha do banco em um gerenciador seguro.
4. Aguarde o provisionamento do banco.

## 2. Configurar autenticação

1. No Dashboard, abra **Authentication → Sign In / Providers**.
2. Ative **Email** e mantenha a confirmação de e-mail habilitada.
3. Em **Authentication → URL Configuration**, adicione a URL publicada do GitHub Pages à lista de Site URL / Redirect URLs. Exemplo: `https://zmen1no123-bit.github.io/Republica-Unida-De-Monte-Real/`.
4. Configure o modelo de e-mail de confirmação. Não desative a confirmação para facilitar o cadastro.

O cadastro pode ser aberto, mas isso não concede acesso institucional: cada novo perfil é criado com situação `pending`.

## 3. Criar tabelas e regras de segurança

1. Abra **SQL Editor → New query**.
2. Copie todo o conteúdo de `supabase/migrations/001_auth_approval_and_decrees.sql`.
3. Execute e confira se terminou sem erros.

O script cria:
- perfis com cargos e estado de aprovação;
- criação automática de perfil pendente após cadastro;
- função de revisão que só um administrador aprovado pode executar;
- tabela de decretos, com leitura pública limitada aos publicados;
- políticas RLS para proteger os dados.

## 4. Criar a primeira conta administradora

1. Cadastre seu próprio e-mail no formulário de autenticação que será integrado ao site e confirme o e-mail.
2. No Supabase, abra **SQL Editor** e execute a consulta abaixo, substituindo o texto de exemplo pelo e-mail da conta que você acabou de confirmar:

```sql
update public.profiles p
set role = 'admin',
    approval_status = 'approved',
    reviewed_at = now()
from auth.users u
where p.user_id = u.id
  and lower(u.email) = lower('SEU_EMAIL_DE_ADMIN');
```

3. Confira o resultado em **Table Editor → profiles**. Deve existir exatamente um perfil com `role = admin` e `approval_status = approved`.

Não publique seu e-mail pessoal, senha ou chaves no repositório.

## 5. Obter as chaves públicas para o site

1. Abra **Project Settings → API Keys** (ou o painel **Connect**, conforme a interface).
2. Copie a **Project URL** e a chave **publishable** (começa com `sb_publishable_`). Projetos antigos podem exibir a chave `anon`.
3. A URL e a chave publishable podem ser usadas no navegador quando as políticas RLS estão corretas.
4. Nunca copie uma chave **secret** ou a antiga `service_role` para HTML, JavaScript, GitHub Pages ou qualquer repositório público. Elas ignoram as políticas RLS.

## 6. Como será a aprovação

Fluxo previsto:
1. A pessoa cria conta e confirma o e-mail.
2. O Supabase cria o perfil com estado `pending`.
3. A pessoa vê a mensagem “Cadastro recebido; aguarde análise”.
4. O administrador consulta os pendentes e decide aprovar/rejeitar e atribuir um cargo.
5. Só perfis aprovados recebem permissões institucionais; o cargo é validado pelo banco, não por campos editáveis no navegador.

A função SQL de revisão está pronta: `public.review_rumr_user(user_id, 'approved', 'president')`. Ela só aceita chamadas de uma conta que já tenha cargo admin aprovado. O painel visual de aprovação ainda precisa ser conectado à função.

## 7. Publicação de decretos

A tabela `decrees` já está preparada:
- visitantes veem somente decretos publicados;
- autoridades aprovadas podem consultar a área interna;
- admin, presidente e ministro podem criar rascunhos;
- admin e presidente podem atualizar/publicar atos.

O próximo passo de desenvolvimento é ligar o formulário de login, a lista de cadastros pendentes e o editor de decretos à API Supabase. Não coloque a chave secret no front-end.

## 8. Testes antes de liberar

- Teste cadastro com um e-mail de teste e confirme que fica pendente.
- Tente abrir o painel sem login: deve ser bloqueado.
- Entre com conta pendente: não deve conseguir publicar nem ver conteúdo interno.
- Aprove uma conta de teste com cargo limitado.
- Teste que essa conta não consegue alterar seu próprio cargo.
- Teste a leitura pública: apenas decretos publicados aparecem.

**Importante:** o SQL é a base de segurança do banco, não substitui testes de políticas nem o desenvolvimento da interface. Faça os testes com contas de demonstração antes de usar com participantes reais.
