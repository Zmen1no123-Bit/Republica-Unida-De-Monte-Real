import { Client, Account, Teams, TablesDB, Query, ID, Permission, Role } from "node-appwrite";

const PROJECT_ID = process.env.APPWRITE_FUNCTION_PROJECT_ID;
const ENDPOINT = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
const TEAM_ID = "rumr-admin";
const DATABASE_ID = "6aeb8a27000848e802b4";
const REQUESTS_TABLE_ID = "membership_requests";
const PROFILES_TABLE_ID = "member_profiles";
const ADMIN_ACTIONS_TABLE_ID = "admin_actions";
const APPOINTMENTS_TABLE_ID = "appointments";

const PENDING_VALUES = ["pending", "Pending"];
const APPROVED_VALUES = ["approved", "Approved"];
const REJECTED_VALUES = ["rejected", "Rejected"];

// Cargos permitidos. Qualquer outro valor é recusado pelo servidor.
const POSITIONS = {
  "Presidente": "Presidência",
  "Vice-presidente": "Presidência",
  "Ministro": "Ministérios",
  "Parlamentar": "Congresso",
  "Magistrado": "Supremo Tribunal"
};

function json(res, statusCode, body) {
  return res.json(body, statusCode);
}

function applicantIdFrom(row) {
  for (const permission of row.$permissions || []) {
    const match = /^read\("user:([^"]+)"\)$/.exec(permission);
    if (match) return match[1];
  }
  return null;
}

function validateReason(reason) {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < 10 || text.length > 300) return null;
  return text;
}

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

async function logAdminAction(tablesDB, { actorId, action, targetUserId, targetRowId, reason }) {
  await tablesDB.createRow({
    databaseId: DATABASE_ID,
    tableId: ADMIN_ACTIONS_TABLE_ID,
    rowId: ID.unique(),
    data: {
      ActorId: actorId,
      Action: action,
      TargetUserId: targetUserId,
      TargetRowId: targetRowId || null,
      Reason: reason || null
    }
  });
}

async function countRows(tablesDB, tableId, queries = []) {
  const result = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId,
    queries: [...queries, Query.limit(1)]
  });
  return result.total;
}

// Cargo ativo do membro, ou null.
async function findActiveAppointment(tablesDB, userId) {
  const result = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: APPOINTMENTS_TABLE_ID,
    queries: [Query.equal("UserId", userId), Query.isNull("EndedAt"), Query.limit(1)]
  });
  return result.rows[0] || null;
}

// Encerra todos os cargos ativos do membro. Usado quando a conta é suspensa.
async function endActiveAppointments(tablesDB, userId, reason) {
  const result = await tablesDB.listRows({
    databaseId: DATABASE_ID,
    tableId: APPOINTMENTS_TABLE_ID,
    queries: [Query.equal("UserId", userId), Query.isNull("EndedAt"), Query.limit(100)]
  });
  const now = new Date().toISOString();
  for (const row of result.rows) {
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: APPOINTMENTS_TABLE_ID,
      rowId: row.$id,
      data: { EndedAt: now, EndedReason: reason }
    });
  }
  return result.rows.length;
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

        const payload = req.bodyJson || {};
    if (payload.action === "request") {
      const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
      const motivation = typeof payload.motivation === "string" ? payload.motivation.trim() : "";

      if (displayName.length < 2 || displayName.length > 60 || motivation.length < 10 || motivation.length > 500) {
        return json(res, 400, { ok: false, message: "Use um nome de 2 a 60 caracteres e uma mensagem de 10 a 500 caracteres." });
      }

      const requestKey = process.env.APPWRITE_API_KEY;
      if (!requestKey) {
        error("Variável APPWRITE_API_KEY ausente.");
        return json(res, 500, { ok: false, message: "Configuração interna incompleta." });
      }

      const requestClient = new Client()
        .setEndpoint(ENDPOINT)
        .setProject(PROJECT_ID)
        .setKey(requestKey);
      const requestDB = new TablesDB(requestClient);

      const profiles = await requestDB.listRows({
        databaseId: DATABASE_ID,
        tableId: PROFILES_TABLE_ID,
        queries: [Query.equal("UserId", user.$id), Query.limit(1)]
      });
      if (profiles.rows.length && String(profiles.rows[0].AccountStatus).toLowerCase() === "suspended") {
        return json(res, 403, { ok: false, message: "Sua conta está suspensa. Não é possível enviar novas solicitações." });
      }

      await requestDB.createRow({
        databaseId: DATABASE_ID,
        tableId: REQUESTS_TABLE_ID,
        rowId: ID.unique(),
        data: { DisplayName: displayName, Motivation: motivation },
        permissions: [Permission.read(Role.user(user.$id))]
      });

      return json(res, 200, { ok: true, message: "Solicitação enviada. Criar uma conta não significa aprovação automática." });
    }

    const teamResult = await teams.listMemberships({ teamId: TEAM_ID, total: false });
    const isConfirmedAdmin = teamResult.memberships.some(
      (membership) => membership.userId === user.$id && membership.confirm === true
    );

    if (!isConfirmedAdmin) {
      return json(res, 403, { ok: false, message: "Acesso restrito à equipe Administradores RUMR." });
    }

    const adminUserIds = new Set(
      teamResult.memberships.filter((m) => m.confirm === true).map((m) => m.userId)
    );

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

    if (action === "stats") {
      const [members, membersActive, membersSuspended, pending, approved, rejected] = await Promise.all([
        countRows(tablesDB, PROFILES_TABLE_ID),
        countRows(tablesDB, PROFILES_TABLE_ID, [Query.equal("AccountStatus", ["active"])]),
        countRows(tablesDB, PROFILES_TABLE_ID, [Query.equal("AccountStatus", ["suspended"])]),
        countRows(tablesDB, REQUESTS_TABLE_ID, [Query.equal("Status", PENDING_VALUES)]),
        countRows(tablesDB, REQUESTS_TABLE_ID, [Query.equal("Status", APPROVED_VALUES)]),
        countRows(tablesDB, REQUESTS_TABLE_ID, [Query.equal("Status", REJECTED_VALUES)])
      ]);

      return json(res, 200, {
        ok: true,
        stats: { members, membersActive, membersSuspended, pending, approved, rejected }
      });
    }

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

    if (action === "members") {
      const [profiles, activeAppointments] = await Promise.all([
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: PROFILES_TABLE_ID,
          queries: [Query.orderAsc("MemberNumber"), Query.limit(100)]
        }),
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: APPOINTMENTS_TABLE_ID,
          queries: [Query.isNull("EndedAt"), Query.limit(100)]
        })
      ]);

      const positionByUser = new Map(activeAppointments.rows.map((row) => [row.UserId, row]));

      return json(res, 200, {
        ok: true,
        members: profiles.rows.map((row) => {
          const appointment = positionByUser.get(row.UserId);
          return {
            rowId: row.$id,
            userId: row.UserId,
            displayName: row.DisplayName || "",
            memberNumber: row.MemberNumber,
            joinedAt: row.JoinedAt || null,
            accountStatus: String(row.AccountStatus || "active").toLowerCase(),
            position: appointment ? appointment.Position : null,
            institution: appointment ? appointment.Institution : null
          };
        })
      });
    }

    if (action === "suspend" || action === "reactivate") {
      const targetUserId = typeof body.userId === "string" ? body.userId : "";
      const reason = validateReason(body.reason);

      if (!targetUserId || targetUserId.length > 36) {
        return json(res, 400, { ok: false, message: "Membro inválido." });
      }
      if (!reason) {
        return json(res, 400, { ok: false, message: "Informe um motivo entre 10 e 300 caracteres." });
      }
      if (targetUserId === user.$id) {
        return json(res, 403, { ok: false, message: "Você não pode alterar a própria conta." });
      }
      if (adminUserIds.has(targetUserId)) {
        return json(res, 403, { ok: false, message: "Membros da equipe de administração não podem ser suspensos." });
      }

      const found = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: PROFILES_TABLE_ID,
        queries: [Query.equal("UserId", targetUserId), Query.limit(1)]
      });
      if (!found.rows.length) {
        return json(res, 404, { ok: false, message: "Perfil de membro não encontrado." });
      }

      const profile = found.rows[0];
      const currentStatus = String(profile.AccountStatus || "active").toLowerCase();
      const newStatus = action === "suspend" ? "suspended" : "active";

      if (currentStatus === newStatus) {
        const message = newStatus === "suspended" ? "Esta conta já está suspensa." : "Esta conta já está ativa.";
        return json(res, 409, { ok: false, message });
      }

      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: PROFILES_TABLE_ID,
        rowId: profile.$id,
        data: {
          AccountStatus: newStatus,
          UpdatedAt: new Date().toISOString()
        }
      });

      if (newStatus === "suspended") {
        await endActiveAppointments(tablesDB, targetUserId, "Conta suspensa.");
      }

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action,
        targetUserId,
        targetRowId: profile.$id,
        reason
      });

      return json(res, 200, {
        ok: true,
        message: newStatus === "suspended" ? "Conta suspensa." : "Conta reativada.",
        member: { userId: targetUserId, accountStatus: newStatus }
      });
    }

    if (action === "appoint") {
      const targetUserId = typeof body.userId === "string" ? body.userId : "";
      const position = body.position;

      if (!targetUserId || targetUserId.length > 36) {
        return json(res, 400, { ok: false, message: "Membro inválido." });
      }
      if (!Object.prototype.hasOwnProperty.call(POSITIONS, position)) {
        return json(res, 400, { ok: false, message: "Cargo inválido." });
      }

      const profiles = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: PROFILES_TABLE_ID,
        queries: [Query.equal("UserId", targetUserId), Query.limit(1)]
      });
      if (!profiles.rows.length) {
        return json(res, 404, { ok: false, message: "Perfil de membro não encontrado." });
      }
      if (String(profiles.rows[0].AccountStatus).toLowerCase() !== "active") {
        return json(res, 409, { ok: false, message: "Só membros com conta ativa podem ser nomeados." });
      }
      if (await findActiveAppointment(tablesDB, targetUserId)) {
        return json(res, 409, { ok: false, message: "Este membro já ocupa um cargo. Exonere antes de nomear outro." });
      }

      const created = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: APPOINTMENTS_TABLE_ID,
        rowId: ID.unique(),
        data: {
          UserId: targetUserId,
          Position: position,
          Institution: POSITIONS[position],
          StartedAt: new Date().toISOString(),
          AppointedBy: user.$id
        }
      });

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action: "appoint",
        targetUserId,
        targetRowId: created.$id,
        reason: null
      });

      return json(res, 200, { ok: true, message: "Cargo atribuído." });
    }

    if (action === "dismiss") {
      const targetUserId = typeof body.userId === "string" ? body.userId : "";
      const reason = validateReason(body.reason);

      if (!targetUserId || targetUserId.length > 36) {
        return json(res, 400, { ok: false, message: "Membro inválido." });
      }
      if (!reason) {
        return json(res, 400, { ok: false, message: "Informe um motivo entre 10 e 300 caracteres." });
      }
      if (targetUserId === user.$id) {
        return json(res, 403, { ok: false, message: "Você não pode alterar o próprio cargo." });
      }

      const active = await findActiveAppointment(tablesDB, targetUserId);
      if (!active) {
        return json(res, 404, { ok: false, message: "Este membro não ocupa cargo ativo." });
      }

      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: APPOINTMENTS_TABLE_ID,
        rowId: active.$id,
        data: { EndedAt: new Date().toISOString(), EndedReason: reason }
      });

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action: "dismiss",
        targetUserId,
        targetRowId: active.$id,
        reason
      });

      return json(res, 200, { ok: true, message: "Cargo encerrado." });
    }

    if (action === "review") {
      const rowId = typeof body.rowId === "string" ? body.rowId : "";
      const status = body.status;
      const reason = validateReason(body.reason);

      if (!rowId || rowId.length > 36 || !["approved", "rejected"].includes(status)) {
        return json(res, 400, { ok: false, message: "Dados de revisão inválidos." });
      }

      const row = await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: REQUESTS_TABLE_ID,
        rowId
      });

      const applicantId = applicantIdFrom(row);
      if (!applicantId) {
        error("Não foi possível identificar o solicitante da linha " + rowId);
        return json(res, 422, { ok: false, message: "Não foi possível identificar o solicitante desta solicitação." });
      }

      if (status === "approved") {
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

      await logAdminAction(tablesDB, {
        actorId: user.$id,
        action: status === "approved" ? "approve" : "reject",
        targetUserId: applicantId,
        targetRowId: rowId,
        reason
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
