import { Client, Account, Teams, TablesDB, Query } from "node-appwrite";

const PROJECT_ID = process.env.APPWRITE_FUNCTION_PROJECT_ID;
const ENDPOINT = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
const TEAM_ID = "rumr-admin";
const DATABASE_ID = "6aeb8a27000848e802b4";
const TABLE_ID = "membership_requests";

function json(res, statusCode, body) {
  return res.json(body, statusCode);
}

export default async ({ req, res, log, error }) => {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { ok: false, message: "Método não permitido." });
    }

    const jwt = req.headers["x-appwrite-user-jwt"];
    if (!jwt) {
      return json(res, 401, { ok: false, message: "Faça login para continuar." });
    }

    if (!PROJECT_ID || !ENDPOINT) {
      return json(res, 500, { ok: false, message: "Configuração interna incompleta." });
    }

    const userClient = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(userClient);
    const teams = new Teams(userClient);

    const user = await account.get();
    log("DIAG 2: usuário identificado");

    if (!user.emailVerification) {
      return json(res, 403, { ok: false, message: "Verifique seu e-mail antes de acessar a administração." });
    }

    const teamResult = await teams.listMemberships({ teamId: TEAM_ID, total: false });
    log("DIAG 4: equipe consultada");

    const isConfirmedAdmin = teamResult.memberships.some(
      (membership) => membership.userId === user.$id && membership.confirm === true
    );

    if (!isConfirmedAdmin) {
      return json(res, 403, { ok: false, message: "Acesso restrito à equipe Administradores RUMR." });
    }

    const functionKey = process.env.APPWRITE_API_KEY;
    if (!functionKey) {
      error("Variável APPWRITE_API_KEY ausente.");
      return json(res, 500, { ok: false, message: "A chave de serviço da função não está configurada." });
    }

    const serviceClient = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setKey(functionKey);

    const tablesDB = new TablesDB(serviceClient);
    const body = req.bodyJson || {};
    const action = body.action;

    if (action === "list") {
      const result = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLE_ID,
        queries: [Query.orderDesc("$createdAt"), Query.limit(100)]
      });
      log("DIAG 7: listagem concluída");

      return json(res, 200, {
        ok: true,
        requests: result.rows.map((row) => ({
          id: row.$id,
          displayName: row.DisplayName || "",
          motivation: row.Motivation || "",
          status: String(row.Status || "pending").toLowerCase(),
          createdAt: row.$createdAt,
          reviewedAt: row.ReviewedAt || null,
          reviewedBy: row.ReviewedBy || null
        }))
      });
    }

    if (action === "review") {
      log("DIAG 8: início da revisão");
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
          Status: status,
          ReviewedAt: new Date().toISOString(),
          ReviewedBy: user.$id
        }
      });
      log("DIAG 9: updateRow concluído");

      return json(res, 200, {
        ok: true,
        message: status === "approved" ? "Solicitação aprovada." : "Solicitação rejeitada.",
        request: { id: updated.$id, status }
      });
    }

    return json(res, 400, { ok: false, message: "Ação desconhecida." });
  } catch (err) {
    const detail = err?.message || String(err);
    error("RUMR admin function error: " + (err?.stack || detail));
    if (err?.cause) error("RUMR admin function cause: " + (err.cause?.stack || String(err.cause)));
    return json(res, 500, { ok: false, message: "Diagnóstico: " + detail });
  }
};
