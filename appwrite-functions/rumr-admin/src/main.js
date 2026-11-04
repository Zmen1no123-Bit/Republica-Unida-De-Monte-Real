import { Client, Account, Teams, TablesDB, Query } from "node-appwrite";

const PROJECT_ID = process.env.APPWRITE_FUNCTION_PROJECT_ID;
const ENDPOINT = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
const TEAM_ID = "rumr-admins";
const DATABASE_ID = "rumr_main";
const TABLE_ID = "membership_requests";

function json(res, statusCode, body) {
  return res.json(body, statusCode);
}

export default async ({ req, res, log, error }) => {
  try {
    const jwt = req.headers["x-appwrite-user-jwt"];
    if (!jwt) {
      return json(res, 401, { ok: false, message: "Faça login para continuar." });
    }

    if (!PROJECT_ID || !ENDPOINT) {
      error("Missing Appwrite function environment configuration.");
      return json(res, 500, { ok: false, message: "Configuração interna incompleta." });
    }

    // Identidade e autorização são verificadas com o JWT do próprio usuário.
    const userClient = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(userClient);
    const teams = new Teams(userClient);

    log("DIAG 1: antes de account.get");
    const user = await account.get();
    log("DIAG 2: account.get concluído");
    if (!user.emailVerification) {
      return json(res, 403, { ok: false, message: "Verifique seu e-mail antes de acessar a administração." });
    }

    log("DIAG 3: antes de teams.listMemberships");
    const teamResult = await teams.listMemberships({ teamId: TEAM_ID, total: false });
    log("DIAG 4: teams.listMemberships concluído");
    const isConfirmedAdmin = teamResult.memberships.some(
      (membership) => membership.userId === user.$id && membership.confirm === true
    );

    if (!isConfirmedAdmin) {
      return json(res, 403, { ok: false, message: "Acesso restrito à equipe Administradores RUMR." });
    }

    // A chave efêmera é fornecida pelo Appwrite somente no ambiente da Function.
    log("DIAG 5: verificando chave efêmera");
    const functionKey = req.headers["x-appwrite-key"];
    if (!functionKey) {
      error("Missing x-appwrite-key request header.");
      return json(res, 500, { ok: false, message: "O Appwrite não forneceu a chave temporária para esta execução." });
    }

    const serviceClient = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setKey(functionKey);

    const tablesDB = new TablesDB(serviceClient);
    const body = req.bodyJson || {};
    const action = body.action;

    if (req.method !== "POST") {
      return json(res, 405, { ok: false, message: "Método não permitido." });
    }

    if (action === "list") {
      log("DIAG 6: antes de tablesDB.listRows");
      const result = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLE_ID,
        queries: [Query.orderDesc("$createdAt"), Query.limit(100)]
      });

      log("DIAG 7: tablesDB.listRows concluído");
      return json(res, 200, {
        ok: true,
        requests: result.rows.map((row) => ({
          id: row.$id,
          displayName: row.displayName,
          motivation: row.motivation,
          status: row.status || "pending",
          createdAt: row.$createdAt,
          reviewedAt: row.reviewedAt || null,
          reviewedBy: row.reviewedBy || null
        }))
      });
    }

    if (action === "review") {
      const rowId = typeof body.rowId === "string" ? body.rowId : "";
      const status = body.status;

      if (!rowId || rowId.length > 36 || !["approved", "rejected"].includes(status)) {
        return json(res, 400, { ok: false, message: "Dados de revisão inválidos." });
      }

      const updated = await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLE_ID,
        rowId,
        data: {
          status,
          reviewedAt: new Date().toISOString(),
          reviewedBy: user.$id
        }
      });

      return json(res, 200, {
        ok: true,
        message: status === "approved" ? "Solicitação aprovada." : "Solicitação rejeitada.",
        request: { id: updated.$id, status: updated.status }
      });
    }

    return json(res, 400, { ok: false, message: "Ação desconhecida." });
  } catch (err) {
    error("RUMR admin function error: " + (err?.stack || err?.message || String(err)));
    if (err?.cause) error("RUMR admin function cause: " + (err.cause?.stack || err.cause?.message || String(err.cause)));
    const code = Number(err?.code) || 500;
    if (code === 404) {
      return json(res, 404, { ok: false, message: "Tabela ou solicitação não encontrada. Confira a configuração do banco." });
    }
    if (code === 401 || code === 403) {
      return json(res, code, { ok: false, message: "Acesso negado. Confira a sessão e as permissões da função." });
    }
    return json(res, 500, { ok: false, message: "Não foi possível concluir a operação. Consulte os logs da função." });
  }
};
