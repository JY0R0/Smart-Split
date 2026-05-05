const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const db = new Database(path.join(__dirname, "dev.db"));
db.pragma("foreign_keys = ON");

// Ensure settlements table has groupId column (safe migration)
try {
  db.prepare("SELECT groupId FROM settlements LIMIT 0").run();
} catch {
  db.prepare("ALTER TABLE settlements ADD COLUMN groupId INTEGER REFERENCES groups(id) ON DELETE CASCADE").run();
}

// Ensure users table has role column (safe migration)
try {
  db.prepare("SELECT role FROM users LIMIT 0").run();
} catch {
  db.prepare("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'").run();
}

const jwtSecret = process.env.JWT_SECRET;
const adminEmail = (process.env.ADMIN_EMAIL || "admin@smartsplit.local").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123";
const adminName = (process.env.ADMIN_NAME || "Smart Split Admin").trim();

async function ensureAdminAccount() {
  const existingAdmin = db
    .prepare("SELECT id, email, role FROM users WHERE email = ?")
    .get(adminEmail);

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    db.prepare(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')"
    ).run(adminName, adminEmail, hashedPassword);
    console.log(`Admin account created for ${adminEmail}`);
    return;
  }

  if (existingAdmin.role !== "admin") {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existingAdmin.id);
    console.log(`Existing user promoted to admin: ${adminEmail}`);
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Authorization token is required." });
  }

  if (!jwtSecret) {
    return res.status(500).json({ message: "JWT secret is not configured." });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = db
      .prepare("SELECT id, email, role FROM users WHERE id = ?")
      .get(payload.id);

    if (!user) {
      return res.status(401).json({ message: "User does not exist." });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role || "user",
    };
    return next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid or expired token." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access is required." });
  }

  return next();
}

function isGroupMember(groupId, userId) {
  return db
    .prepare("SELECT 1 FROM group_members WHERE groupId = ? AND userId = ?")
    .get(groupId, userId);
}

function isGroupAccessible(groupId, userId) {
  const group = db
    .prepare("SELECT id, createdById FROM groups WHERE id = ?")
    .get(groupId);

  if (!group) {
    return null;
  }

  if (group.createdById !== userId && !isGroupMember(groupId, userId)) {
    return false;
  }

  return group;
}

function buildEqualSplits(amount, participantIds) {
  const totalAmount = Number(amount);
  const members = [...new Set((participantIds || []).map((userId) => Number(userId)))].filter((userId) => Number.isInteger(userId));

  if (members.length === 0) {
    return [];
  }

  const totalInPaise = Math.round(totalAmount * 100);
  const baseShare = Math.floor(totalInPaise / members.length);
  const remainder = totalInPaise % members.length;

  return members.map((userId, index) => ({
    userId,
    amount: Number(((baseShare + (index < remainder ? 1 : 0)) / 100).toFixed(2)),
  }));
}

function normalizeExpenseSplits(amount, body, defaultParticipantIds) {
  const { splits, splitType, participants } = body;
  const participantIds = Array.isArray(participants) && participants.length > 0
    ? participants
    : defaultParticipantIds;

  if (Array.isArray(splits) && splits.length > 0) {
    return splits.map((split) => ({
      userId: Number(split.userId),
      amount: Number(split.amount),
    }));
  }

  if (splitType === "equal" || !Array.isArray(splits) || splits.length === 0) {
    return buildEqualSplits(amount, participantIds);
  }

  return [];
}

function assertValidSplitTotal(amount, splits) {
  const total = splits.reduce((sum, split) => sum + Number(split.amount), 0);
  if (Math.abs(total - Number(amount)) > 0.01) {
    return false;
  }

  return true;
}

function getGroupMembers(groupId) {
  return db
    .prepare("SELECT userId FROM group_members WHERE groupId = ?")
    .all(groupId)
    .map((member) => member.userId);
}

function getExpenseSplits(expenseId) {
  return db
    .prepare(
      "SELECT es.userId, es.amount, u.name, u.email FROM expense_splits es JOIN users u ON u.id = es.userId WHERE es.expenseId = ? ORDER BY u.name ASC"
    )
    .all(expenseId);
}

function calculateGroupBalances(groupId) {
  const members = db
    .prepare("SELECT u.id, u.name, u.email FROM group_members gm JOIN users u ON u.id = gm.userId WHERE gm.groupId = ?")
    .all(groupId);

  const balances = new Map(
    members.map((member) => [member.id, { userId: member.id, name: member.name, email: member.email, totalPaid: 0, totalOwed: 0, netBalance: 0 }])
  );

  const expenses = db
    .prepare("SELECT id, amount, paidById FROM expenses WHERE groupId = ?")
    .all(groupId);

  const splitRows = db
    .prepare("SELECT expenseId, userId, amount FROM expense_splits WHERE expenseId IN (SELECT id FROM expenses WHERE groupId = ?)")
    .all(groupId);

  for (const expense of expenses) {
    const payer = balances.get(expense.paidById);
    if (payer) {
      payer.totalPaid += Number(expense.amount);
    }
  }

  for (const split of splitRows) {
    const member = balances.get(split.userId);
    if (member) {
      member.totalOwed += Number(split.amount);
    }
  }

  const netBalances = Array.from(balances.values()).map((member) => ({
    ...member,
    netBalance: Number((member.totalPaid - member.totalOwed).toFixed(2)),
    status:
      Number((member.totalPaid - member.totalOwed).toFixed(2)) > 0
        ? "positive"
        : Number((member.totalPaid - member.totalOwed).toFixed(2)) < 0
          ? "negative"
          : "settled",
  }));

  const creditors = netBalances
    .filter((member) => member.netBalance > 0)
    .map((member) => ({ ...member, remaining: member.netBalance }));

  const debtors = netBalances
    .filter((member) => member.netBalance < 0)
    .map((member) => ({ ...member, remaining: Math.abs(member.netBalance) }));

  const settlements = [];
  let creditorIndex = 0;

  for (const debtor of debtors) {
    let remainingDebt = debtor.remaining;

    while (remainingDebt > 0 && creditorIndex < creditors.length) {
      const creditor = creditors[creditorIndex];
      const amount = Number(Math.min(remainingDebt, creditor.remaining).toFixed(2));

      settlements.push({
        fromUserId: debtor.userId,
        fromName: debtor.name,
        toUserId: creditor.userId,
        toName: creditor.name,
        amount,
        note: `${debtor.name} owes ${creditor.name} ₹${amount}`,
      });

      remainingDebt = Number((remainingDebt - amount).toFixed(2));
      creditor.remaining = Number((creditor.remaining - amount).toFixed(2));

      if (creditor.remaining <= 0.01) {
        creditorIndex += 1;
      }
    }
  }

  return {
    balances: netBalances.map(({ remaining, ...rest }) => rest),
    algorithm: {
      positive: "Others owe user",
      negative: "User owes others",
    },
    settlements,
  };
}

app.use(cors());
app.use(express.json());

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    if (!jwtSecret) {
      return res.status(500).json({ message: "JWT secret is not configured." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(normalizedEmail);

    if (existingUser) {
      return res.status(409).json({ message: "User already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const displayName = (name && name.trim()) || normalizedEmail.split("@")[0];

    const insertUser = db.prepare(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')"
    );
    const selectUser = db.prepare(
      "SELECT id, name, email, role FROM users WHERE id = ?"
    );

    const result = insertUser.run(displayName, normalizedEmail, hashedPassword);
    const user = selectUser.get(result.lastInsertRowid);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || "user" },
      jwtSecret,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      user,
      token,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to register user." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    if (!jwtSecret) {
      return res.status(500).json({ message: "JWT secret is not configured." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = db
      .prepare("SELECT id, name, email, password, role FROM users WHERE email = ?")
      .get(normalizedEmail);

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || "user" },
      jwtSecret,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || "user",
      },
      token,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to log in user." });
  }
});

app.get("/api/protected", authenticateToken, (req, res) => {
  return res.status(200).json({
    message: "Protected route accessed successfully.",
    user: req.user,
  });
});

app.get("/api/admin/overview", authenticateToken, requireAdmin, (req, res) => {
  try {
    const users = db
      .prepare("SELECT id, name, email, role FROM users ORDER BY id DESC")
      .all();

    const groups = db
      .prepare(
        "SELECT g.id, g.name, g.createdById, u.name AS createdByName, (SELECT COUNT(*) FROM group_members gm WHERE gm.groupId = g.id) AS memberCount FROM groups g JOIN users u ON u.id = g.createdById ORDER BY g.id DESC"
      )
      .all();

    const expenses = db
      .prepare(
        "SELECT e.id, e.title, e.amount, e.groupId, g.name AS groupName, e.paidById, u.name AS paidByName FROM expenses e JOIN groups g ON g.id = e.groupId JOIN users u ON u.id = e.paidById ORDER BY e.id DESC"
      )
      .all();

    const settlements = db
      .prepare(
        "SELECT s.id, s.amount, s.groupId, g.name AS groupName, s.payerId, p.name AS payerName, s.receiverId, r.name AS receiverName FROM settlements s LEFT JOIN groups g ON g.id = s.groupId JOIN users p ON p.id = s.payerId JOIN users r ON r.id = s.receiverId ORDER BY s.id DESC"
      )
      .all();

    const summary = {
      userCount: users.length,
      adminCount: users.filter((user) => user.role === "admin").length,
      groupCount: groups.length,
      expenseCount: expenses.length,
      settlementCount: settlements.length,
      totalExpenseAmount: Number(
        expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0).toFixed(2)
      ),
    };

    return res.status(200).json({
      summary,
      users,
      groups,
      expenses,
      settlements,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load admin overview." });
  }
});

app.post("/api/groups", authenticateToken, (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required." });
    }

    const groupName = name.trim();
    const insertGroup = db.prepare(
      "INSERT INTO groups (name, createdById) VALUES (?, ?)"
    );
    const insertMember = db.prepare(
      "INSERT INTO group_members (groupId, userId) VALUES (?, ?)"
    );
    const selectGroup = db.prepare(
      "SELECT id, name, createdById FROM groups WHERE id = ?"
    );

    const result = insertGroup.run(groupName, req.user.id);
    insertMember.run(result.lastInsertRowid, req.user.id);

    const group = selectGroup.get(result.lastInsertRowid);

    return res.status(201).json({ group });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to create group." });
  }
});

app.post("/api/groups/:groupId/members", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const { userId, email } = req.body;

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ message: "Invalid group id." });
    }

    const group = db
      .prepare("SELECT id, createdById FROM groups WHERE id = ?")
      .get(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (group.createdById !== req.user.id && !isGroupMember(groupId, req.user.id)) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    let targetUser = null;
    if (userId !== undefined && userId !== null) {
      targetUser = db
        .prepare("SELECT id, name, email FROM users WHERE id = ?")
        .get(Number(userId));
    } else if (email) {
      targetUser = db
        .prepare("SELECT id, name, email FROM users WHERE email = ?")
        .get(email.trim().toLowerCase());
    }

    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    const existingMember = isGroupMember(groupId, targetUser.id);
    if (existingMember) {
      return res.status(409).json({ message: "User is already a group member." });
    }

    db.prepare("INSERT INTO group_members (groupId, userId) VALUES (?, ?)").run(
      groupId,
      targetUser.id
    );

    return res.status(201).json({
      message: "Member added successfully.",
      member: targetUser,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to add member." });
  }
});

app.get("/api/groups/:groupId", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ message: "Invalid group id." });
    }

    const group = db
      .prepare(
        "SELECT g.id, g.name, g.createdById, u.name AS createdByName, u.email AS createdByEmail FROM groups g JOIN users u ON u.id = g.createdById WHERE g.id = ?"
      )
      .get(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (!isGroupMember(groupId, req.user.id) && group.createdById !== req.user.id) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    const members = db
      .prepare(
        "SELECT u.id, u.name, u.email FROM group_members gm JOIN users u ON u.id = gm.userId WHERE gm.groupId = ? ORDER BY u.name ASC"
      )
      .all(groupId);

    const expenses = db
      .prepare(
        "SELECT e.id, e.title, e.amount, e.paidById, u.name AS paidByName, e.groupId FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.groupId = ? ORDER BY e.id DESC"
      )
      .all(groupId);

    return res.status(200).json({
      group: {
        id: group.id,
        name: group.name,
        createdBy: {
          id: group.createdById,
          name: group.createdByName,
          email: group.createdByEmail,
        },
        members,
        expenses,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load group details." });
  }
});

app.get("/api/groups", authenticateToken, (req, res) => {
  try {
    const groups = db
      .prepare(
        "SELECT g.id, g.name, g.createdById, u.name AS createdByName, u.email AS createdByEmail, (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.groupId = g.id) AS memberCount FROM groups g JOIN group_members gm ON gm.groupId = g.id JOIN users u ON u.id = g.createdById WHERE gm.userId = ? GROUP BY g.id ORDER BY g.id DESC"
      )
      .all(req.user.id)
      .map((group) => ({
        id: group.id,
        name: group.name,
        memberCount: group.memberCount,
        createdBy: {
          id: group.createdById,
          name: group.createdByName,
          email: group.createdByEmail,
        },
      }));

    return res.status(200).json({ groups });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load user groups." });
  }
});

app.post("/api/groups/:groupId/expenses", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const { title, amount, paidById } = req.body;

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ message: "Invalid group id." });
    }

    const group = isGroupAccessible(groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (group === false) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Expense title is required." });
    }

    if (amount === undefined || amount === null || Number.isNaN(Number(amount))) {
      return res.status(400).json({ message: "Valid expense amount is required." });
    }

    const groupMembers = getGroupMembers(groupId);

    const payerId = paidById !== undefined && paidById !== null ? Number(paidById) : req.user.id;
    if (!groupMembers.includes(payerId)) {
      return res.status(400).json({ message: "Payer must be a group member." });
    }

    const normalizedSplits = normalizeExpenseSplits(amount, req.body, groupMembers);

    if (normalizedSplits.length === 0) {
      return res.status(400).json({ message: "At least one split is required." });
    }

    if (
      normalizedSplits.some((split) => !Number.isInteger(split.userId) || Number.isNaN(split.amount))
    ) {
      return res.status(400).json({ message: "Each split needs a valid userId and amount." });
    }

    const splitUserIds = normalizedSplits.map((split) => split.userId);
    const invalidSplitUser = splitUserIds.find((userId) => !groupMembers.includes(userId));
    if (invalidSplitUser !== undefined) {
      return res.status(400).json({ message: "All split users must be group members." });
    }

    if (!assertValidSplitTotal(amount, normalizedSplits)) {
      return res.status(400).json({ message: "Split amounts must add up to the expense amount." });
    }

    const createExpense = db.transaction(() => {
      const insertExpense = db.prepare(
        "INSERT INTO expenses (title, amount, paidById, groupId) VALUES (?, ?, ?, ?)"
      );
      const insertSplit = db.prepare(
        "INSERT INTO expense_splits (expenseId, userId, amount) VALUES (?, ?, ?)"
      );
      const selectExpense = db.prepare(
        "SELECT e.id, e.title, e.amount, e.paidById, e.groupId, u.name AS paidByName, u.email AS paidByEmail FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.id = ?"
      );

      const result = insertExpense.run(title.trim(), Number(amount), payerId, groupId);
      for (const split of normalizedSplits) {
        insertSplit.run(result.lastInsertRowid, split.userId, split.amount);
      }

      return selectExpense.get(result.lastInsertRowid);
    });

    const expense = createExpense();
    const splitsResult = getExpenseSplits(expense.id);

    return res.status(201).json({
      expense: {
        ...expense,
        splits: splitsResult,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to add expense." });
  }
});

app.get("/api/groups/:groupId/expenses", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ message: "Invalid group id." });
    }

    const group = isGroupAccessible(groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (group === false) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    const expenses = db
      .prepare(
        "SELECT e.id, e.title, e.amount, e.paidById, u.name AS paidByName, u.email AS paidByEmail, e.groupId FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.groupId = ? ORDER BY e.id DESC"
      )
      .all(groupId)
      .map((expense) => ({
        ...expense,
        splits: db
          .prepare(
            "SELECT es.userId, es.amount, u.name, u.email FROM expense_splits es JOIN users u ON u.id = es.userId WHERE es.expenseId = ? ORDER BY u.name ASC"
          )
          .all(expense.id),
      }));

    return res.status(200).json({ expenses });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to fetch expenses." });
  }
});

app.get("/api/groups/:groupId/balances", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ message: "Invalid group id." });
    }

    const group = isGroupAccessible(groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (group === false) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    return res.status(200).json(calculateGroupBalances(groupId));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to calculate balances." });
  }
});

app.put("/api/expenses/:expenseId", authenticateToken, (req, res) => {
  try {
    const expenseId = Number(req.params.expenseId);
    const { title, amount, paidById } = req.body;

    if (!Number.isInteger(expenseId)) {
      return res.status(400).json({ message: "Invalid expense id." });
    }

    const expense = db
      .prepare("SELECT id, title, amount, paidById, groupId FROM expenses WHERE id = ?")
      .get(expenseId);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found." });
    }

    const group = isGroupAccessible(expense.groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (group === false) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    const groupMembers = getGroupMembers(expense.groupId);

    const nextTitle = title !== undefined ? title.trim() : expense.title;
    const nextAmount = amount !== undefined ? Number(amount) : Number(expense.amount);
    const nextPaidById = paidById !== undefined && paidById !== null ? Number(paidById) : expense.paidById;

    if (!nextTitle) {
      return res.status(400).json({ message: "Expense title is required." });
    }

    if (Number.isNaN(nextAmount)) {
      return res.status(400).json({ message: "Valid expense amount is required." });
    }

    if (!groupMembers.includes(nextPaidById)) {
      return res.status(400).json({ message: "Payer must be a group member." });
    }

    const normalizedSplits = normalizeExpenseSplits(nextAmount, req.body, groupMembers);

    if (normalizedSplits.length === 0) {
      return res.status(400).json({ message: "At least one split is required." });
    }

    if (
      normalizedSplits.some((split) => !Number.isInteger(split.userId) || Number.isNaN(split.amount))
    ) {
      return res.status(400).json({ message: "Each split needs a valid userId and amount." });
    }

    const invalidSplitUser = normalizedSplits
      .map((split) => split.userId)
      .find((userId) => !groupMembers.includes(userId));

    if (invalidSplitUser !== undefined) {
      return res.status(400).json({ message: "All split users must be group members." });
    }

    if (!assertValidSplitTotal(nextAmount, normalizedSplits)) {
      return res.status(400).json({ message: "Split amounts must add up to the expense amount." });
    }

    const updateExpense = db.transaction(() => {
      db.prepare(
        "UPDATE expenses SET title = ?, amount = ?, paidById = ? WHERE id = ?"
      ).run(nextTitle, nextAmount, nextPaidById, expenseId);

      db.prepare("DELETE FROM expense_splits WHERE expenseId = ?").run(expenseId);
      const insertSplit = db.prepare(
        "INSERT INTO expense_splits (expenseId, userId, amount) VALUES (?, ?, ?)"
      );
      for (const split of normalizedSplits) {
        insertSplit.run(expenseId, split.userId, split.amount);
      }

      return db
        .prepare(
          "SELECT e.id, e.title, e.amount, e.paidById, e.groupId, u.name AS paidByName, u.email AS paidByEmail FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.id = ?"
        )
        .get(expenseId);
    });

    const updatedExpense = updateExpense();
    const expenseSplits = getExpenseSplits(expenseId);

    return res.status(200).json({
      expense: {
        ...updatedExpense,
        splits: expenseSplits,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update expense." });
  }
});

app.delete("/api/expenses/:expenseId", authenticateToken, (req, res) => {
  try {
    const expenseId = Number(req.params.expenseId);

    if (!Number.isInteger(expenseId)) {
      return res.status(400).json({ message: "Invalid expense id." });
    }

    const expense = db
      .prepare("SELECT id, groupId FROM expenses WHERE id = ?")
      .get(expenseId);

    if (!expense) {
      return res.status(404).json({ message: "Expense not found." });
    }

    const group = isGroupAccessible(expense.groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (group === false) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    const deleteExpense = db.transaction(() => {
      db.prepare("DELETE FROM expense_splits WHERE expenseId = ?").run(expenseId);
      db.prepare("DELETE FROM expenses WHERE id = ?").run(expenseId);
    });

    deleteExpense();

    return res.status(200).json({ message: "Expense deleted successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete expense." });
  }
});

// ─── User-specific settlements with per-expense breakdowns ───

function calculateUserSettlementsForGroup(groupId, userId) {
  const group = db
    .prepare("SELECT id, name FROM groups WHERE id = ?")
    .get(groupId);

  if (!group) return [];

  const members = db
    .prepare("SELECT u.id, u.name, u.email FROM group_members gm JOIN users u ON u.id = gm.userId WHERE gm.groupId = ?")
    .all(groupId);

  const otherMembers = members.filter((m) => m.id !== userId);
  if (otherMembers.length === 0) return [];

  const expenses = db
    .prepare(
      "SELECT e.id, e.title, e.amount, e.paidById, u.name AS paidByName FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.groupId = ? ORDER BY e.id DESC"
    )
    .all(groupId);

  const allSplits = db
    .prepare(
      "SELECT es.expenseId, es.userId, es.amount FROM expense_splits es WHERE es.expenseId IN (SELECT id FROM expenses WHERE groupId = ?)"
    )
    .all(groupId);

  // Index splits by expenseId
  const splitsByExpense = new Map();
  for (const split of allSplits) {
    if (!splitsByExpense.has(split.expenseId)) {
      splitsByExpense.set(split.expenseId, []);
    }
    splitsByExpense.get(split.expenseId).push(split);
  }

  // Get existing settlements between user and others in this group
  const existingSettlements = db
    .prepare(
      "SELECT id, payerId, receiverId, amount FROM settlements WHERE groupId = ? AND (payerId = ? OR receiverId = ?)"
    )
    .all(groupId, userId, userId);

  const results = [];

  for (const other of otherMembers) {
    const expenseBreakdown = [];
    let rawTotal = 0;

    for (const expense of expenses) {
      const splits = splitsByExpense.get(expense.id) || [];
      const userSplit = splits.find((s) => s.userId === userId);
      const otherSplit = splits.find((s) => s.userId === other.id);

      let netEffect = 0;

      // If current user paid and other has a split → other owes user
      if (expense.paidById === userId && otherSplit) {
        netEffect += Number(otherSplit.amount);
      }

      // If other paid and current user has a split → user owes other
      if (expense.paidById === other.id && userSplit) {
        netEffect -= Number(userSplit.amount);
      }

      if (netEffect !== 0) {
        expenseBreakdown.push({
          id: expense.id,
          title: expense.title,
          totalAmount: Number(expense.amount),
          paidByName: expense.paidByName,
          paidByUserId: expense.paidById,
          yourShare: userSplit ? Number(userSplit.amount) : 0,
          theirShare: otherSplit ? Number(otherSplit.amount) : 0,
          netEffect: Number(netEffect.toFixed(2)),
        });
        rawTotal += netEffect;
      }
    }

    // Factor in existing settlements
    let settledAmount = 0;
    const relatedSettlementIds = [];
    for (const s of existingSettlements) {
      if (
        (s.payerId === userId && s.receiverId === other.id) ||
        (s.payerId === other.id && s.receiverId === userId)
      ) {
        relatedSettlementIds.push(s.id);
        // payer gave money to receiver, reducing payer's debt
        if (s.payerId === userId) {
          settledAmount += Number(s.amount); // user paid other, reduces what user owes
        } else {
          settledAmount -= Number(s.amount); // other paid user, reduces what other owes
        }
      }
    }

    const netTotal = Number((rawTotal + settledAmount).toFixed(2));

    if (Math.abs(netTotal) < 0.01) continue; // balanced, skip

    results.push({
      groupId: group.id,
      groupName: group.name,
      otherUserId: other.id,
      otherUserName: other.name,
      otherUserEmail: other.email,
      direction: netTotal > 0 ? "they_owe" : "you_owe",
      totalAmount: Math.abs(netTotal),
      settledAmount: Math.abs(settledAmount),
      settlementIds: relatedSettlementIds,
      expenses: expenseBreakdown,
    });
  }

  return results;
}

app.get("/api/user/settlements", authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    const groups = db
      .prepare(
        "SELECT g.id FROM groups g JOIN group_members gm ON gm.groupId = g.id WHERE gm.userId = ?"
      )
      .all(userId);

    const allSettlements = [];
    for (const group of groups) {
      const groupSettlements = calculateUserSettlementsForGroup(group.id, userId);
      allSettlements.push(...groupSettlements);
    }

    return res.status(200).json({ settlements: allSettlements });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load settlements." });
  }
});

app.post("/api/groups/:groupId/settle", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const { withUserId } = req.body;
    const userId = req.user.id;

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ message: "Invalid group id." });
    }

    if (!withUserId || !Number.isInteger(Number(withUserId))) {
      return res.status(400).json({ message: "withUserId is required." });
    }

    const group = isGroupAccessible(groupId, userId);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }
    if (group === false) {
      return res.status(403).json({ message: "You are not a member of this group." });
    }

    if (!isGroupMember(groupId, Number(withUserId))) {
      return res.status(400).json({ message: "Target user is not a member of this group." });
    }

    // Calculate current balance between these two users
    const settlements = calculateUserSettlementsForGroup(groupId, userId);
    const match = settlements.find((s) => s.otherUserId === Number(withUserId));

    if (!match || match.totalAmount < 0.01) {
      return res.status(400).json({ message: "No outstanding balance with this user." });
    }

    // Determine payer and receiver
    const payerId = match.direction === "you_owe" ? userId : Number(withUserId);
    const receiverId = match.direction === "you_owe" ? Number(withUserId) : userId;

    db.prepare(
      "INSERT INTO settlements (payerId, receiverId, amount, groupId) VALUES (?, ?, ?, ?)"
    ).run(payerId, receiverId, match.totalAmount, groupId);

    return res.status(201).json({
      message: "Settlement recorded successfully.",
      settlement: {
        payerId,
        receiverId,
        amount: match.totalAmount,
        groupId,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to record settlement." });
  }
});

app.delete("/api/settlements/:id", authenticateToken, (req, res) => {
  try {
    const settlementId = Number(req.params.id);
    const userId = req.user.id;

    if (!Number.isInteger(settlementId)) {
      return res.status(400).json({ message: "Invalid settlement id." });
    }

    const settlement = db
      .prepare("SELECT id, payerId, receiverId, groupId FROM settlements WHERE id = ?")
      .get(settlementId);

    if (!settlement) {
      return res.status(404).json({ message: "Settlement not found." });
    }

    if (settlement.payerId !== userId && settlement.receiverId !== userId) {
      return res.status(403).json({ message: "You are not involved in this settlement." });
    }

    db.prepare("DELETE FROM settlements WHERE id = ?").run(settlementId);

    return res.status(200).json({ message: "Settlement deleted successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to delete settlement." });
  }
});

const PORT = process.env.PORT || 5000;
ensureAdminAccount()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Admin login email: ${adminEmail}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize admin account.", error);
    process.exit(1);
  });