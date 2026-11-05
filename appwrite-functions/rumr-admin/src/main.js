import { Client, Account, Teams, TablesDB, Query, ID, Permission, Role } from "node-appwrite";

const PROJECT_ID = process.env.APPWRITE_FUNCTION_PROJECT_ID;
const ENDPOINT = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
const TEAM_ID = "rumr-admin";
const DATABASE_ID = "6aeb8a27000848e802b4";
const REQUESTS_TABLE_ID = "membership_requests";
const PROFILES_TABLE_ID = "member_profiles";

function json(res, statusCode, body) {
  return res.json(body, statusCode);
}

// Identifica quem enviou a solicitação pela permissão de leitura gravada no formulário.
function applicantIdFrom(row) {
  for (const permission of row.$permissions || []) {
    const match = /^read\("user:([^"]+)"\)$/.exec(permission);
    if (match) return match[1];
  }
  return null;
}

// Cria o perfil do membro. Se já existir (índice único em UserId), não repete a criação.
async function createMemberProfile(tablesDB, userId, displayName) {
  const last = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: PROFILES_TABLE_ID,
    queries: [Query.orderDesc("MemberNumber"), Query.limit(1)]
  });
  const nextNumber = last.rows.length ? Number(last.rows[0].MemberNumber) + 1 : 1;
  const now = new Date().toISOString();

  try {
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: PROFILES_TABLE_ID,
      rowId: ID.unique(),
      data: {
        UserId: userId,
        DisplayName: displayName || "Membro",
        MemberNumber: nextNumber,
        JoinedAt: now,
        AccountStatus: "active",
        UpdatedAt: now
      },
      permissions: [Permission.read(Role.user(userId))]
    });
  } catch (err) {
    if (err?.code === 409) return "already-exists";
    throw err;
  }
  return "created";
}

export default async ({ req, res, error }) => {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { ok: false, message: "Método não permitido." });
    }

    const jwt = req.headers["x-appwrite-user-jwt"];
    if (!jwt) {
      return json(res, 401, { ok: false, message: "Faça login para continuar." });
    }

    if (!PROJECT_ID || !ENDPOINT) {
      error("Variáveis de ambiente do Appwrite ausentes.");
      return json(res, 500, { ok: false, message: "Configuração interna incompleta." });
    }

    const userClient = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setJWT(jwt);

    const account = new Account(userClient);
    const teams = new Teams(userClient);

    const user = await account.get();

    if (!user.emailVerification) {
      return json(res, 403, { ok: false, message: "Verifique seu e-mail antes de acessar a administração." });
    }

    const teamResult = await teams.listMemberships({ teamId: TEAM_ID, total: false });
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
        tableId: REQUESTS_TABLE_ID,
        queries: [Query.orderDesc("$createdAt"), Query.limit(100)]
      });

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
      const rowId = typeof body.rowId === "string" ? body.rowId : "";
      const status = body.status;

      if (!rowId || rowId.length > 36 || !["approved", "rejected"].includes(status)) {
        return json(res, 400, { ok: false, message: "Dados de revisão inválidos." });
      }

      const row = await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: REQUESTS_TABLE_ID,
        rowId
      });

      if (status === "approved") {
        const applicantId = applicantIdFrom(row);
        if (!applicantId) {
          error("Não foi possível identificar o solicitante da linha " + rowId);
          return json(res, 422, { ok: false, message: "Não foi possível identificar o solicitante desta solicitação." });
        }
        await createMemberProfile(tablesDB, applicantId, row.DisplayName);
      }

      const updated = await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: REQUESTS_TABLE_ID,
        rowId,
        data: {
          Status: status,
          ReviewedAt: new Date().toISOString(),
          ReviewedBy: user.$id
        }
      });

      return json(res, 200, {
        ok: true,
        message: status === "approved" ? "Solicitação aprovada e perfil criado." : "Solicitação rejeitada.",
        request: { id: updated.$id, status }
      });
    }

    return json(res, 400, { ok: false, message: "Ação desconhecida." });
  } catch (err) {
    error("RUMR admin function error: " + (err?.stack || err?.message || String(err)));
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
