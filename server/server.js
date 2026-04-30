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
const jwtSecret = process.env.JWT_SECRET;

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
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid or expired token." });
  }
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
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)"
    );
    const selectUser = db.prepare(
      "SELECT id, name, email FROM users WHERE id = ?"
    );

    const result = insertUser.run(displayName, normalizedEmail, hashedPassword);
    const user = selectUser.get(result.lastInsertRowid);

    const token = jwt.sign(
      { id: user.id, email: user.email },
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
      .prepare("SELECT id, name, email, password FROM users WHERE email = ?")
      .get(normalizedEmail);

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      jwtSecret,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
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
        "SELECT g.id, g.name, g.createdById, u.name AS createdByName, u.email AS createdByEmail FROM groups g JOIN group_members gm ON gm.groupId = g.id JOIN users u ON u.id = g.createdById WHERE gm.userId = ? GROUP BY g.id ORDER BY g.id DESC"
      )
      .all(req.user.id)
      .map((group) => ({
        id: group.id,
        name: group.name,
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});