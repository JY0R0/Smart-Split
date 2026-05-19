const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
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

// Ensure payment_claims table exists (safe migration)
try {
  db.prepare("SELECT id FROM payment_claims LIMIT 0").run();
} catch {
  db.prepare("CREATE TABLE IF NOT EXISTS payment_claims ( id INTEGER PRIMARY KEY AUTOINCREMENT, payerId INTEGER NOT NULL, receiverId INTEGER NOT NULL, amount REAL NOT NULL, groupId INTEGER, proofUrl TEXT, status TEXT NOT NULL DEFAULT 'pending', claimedAt DATETIME DEFAULT CURRENT_TIMESTAMP, approvedAt DATETIME, approvedBy INTEGER, FOREIGN KEY (payerId) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (receiverId) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE CASCADE )").run();
}

// Serve uploaded proof images (if any)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure users table has role column (safe migration)
try {
  db.prepare("SELECT role FROM users LIMIT 0").run();
} catch {
  db.prepare("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'").run();
}

// Ensure groups table has status column (safe migration)
try {
  db.prepare("SELECT status FROM groups LIMIT 0").run();
} catch {
  db.prepare("ALTER TABLE groups ADD COLUMN status TEXT NOT NULL DEFAULT 'active'").run();
}

// Ensure users table has email_verified column (safe migration)
try {
  db.prepare("SELECT email_verified FROM users LIMIT 0").run();
} catch {
  db.prepare("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1").run();
}

// Ensure users table has mfa_enabled column (safe migration)
try {
  db.prepare("SELECT mfa_enabled FROM users LIMIT 0").run();
} catch {
  db.prepare("ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0").run();
}

// Create otp_codes table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    usedAt INTEGER,
    createdAt INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  )
`).run();

const jwtSecret = process.env.JWT_SECRET;
const adminEmail = (process.env.ADMIN_EMAIL || "admin@smartsplit.local").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123";
const adminName = (process.env.ADMIN_NAME || "Smart Split Admin").trim();

// ─── Email / OTP helpers ────────────────────────────────────────────────────
const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const emailFrom = process.env.EMAIL_FROM || (emailUser ? `Smart Split <${emailUser}>` : null);

let mailer = null;
if (emailUser && emailPass) {
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailUser, pass: emailPass },
  });
  console.log(`[Email] Mailer ready — sending from ${emailUser}`);
} else {
  console.warn('[Email] EMAIL_USER / EMAIL_PASS not set — OTPs will be printed to the console (dev mode)');
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

async function sendOtpEmail(to, otp, purpose) {
  const isRegister = purpose === 'register';
  const subject = isRegister ? 'Verify your Smart Split account' : 'Your Smart Split login code';
  const heading = isRegister ? 'Confirm your email address' : 'Two-factor authentication';
  const body = isRegister
    ? 'Use the code below to verify your email and activate your Smart Split account.'
    : 'Use the code below to complete your login. Do not share this code.';

  const html = `<!DOCTYPE html>
<html><body style="font-family:Inter,system-ui,sans-serif;background:#f8fafc;margin:0;padding:40px 0;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:40px 32px;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#0d9488,#34d399);border-radius:12px;padding:12px 18px;font-size:20px;font-weight:700;color:#fff;">S</div>
      <p style="font-size:20px;font-weight:700;color:#0f172a;margin:16px 0 4px;">Smart Split</p>
    </div>
    <h2 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 8px;">${heading}</h2>
    <p style="font-size:14px;color:#64748b;margin:0 0 28px;line-height:1.6;">${body}</p>
    <div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
      <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#0d9488;">${otp}</span>
    </div>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0;">This code expires in <strong>10 minutes</strong>.</p>
  </div>
</body></html>`;

  if (mailer) {
    await mailer.sendMail({ from: emailFrom, to, subject, html });
  } else {
    console.log(`\n[OTP DEV MODE] ──────────────────────`);
    console.log(`  To:      ${to}`);
    console.log(`  Purpose: ${purpose}`);
    console.log(`  Code:    ${otp}`);
    console.log(`──────────────────────────────────────\n`);
  }
}

function createOtp(userId, purpose) {
  const code = generateOtp();
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;
  db.prepare("INSERT INTO otp_codes (userId, code, purpose, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)").run(userId, code, purpose, expiresAt, now);
  return code;
}

function validateOtp(userId, code, purpose) {
  const now = Date.now();
  const otp = db.prepare("SELECT id, code, expiresAt, usedAt FROM otp_codes WHERE userId = ? AND purpose = ? AND usedAt IS NULL ORDER BY id DESC LIMIT 1").get(userId, purpose);
  if (!otp) return { valid: false, reason: 'No verification code found. Please request a new one.' };
  if (now > otp.expiresAt) return { valid: false, reason: 'Code has expired. Please request a new one.' };
  if (otp.code !== String(code).trim()) return { valid: false, reason: 'Incorrect code. Please try again.' };
  db.prepare("UPDATE otp_codes SET usedAt = ? WHERE id = ?").run(now, otp.id);
  return { valid: true };
}

function canResendOtp(userId, purpose, cooldownMs = 60000) {
  const last = db.prepare("SELECT createdAt FROM otp_codes WHERE userId = ? AND purpose = ? ORDER BY id DESC LIMIT 1").get(userId, purpose);
  if (!last) return true;
  return (Date.now() - last.createdAt) >= cooldownMs;
}
// ────────────────────────────────────────────────────────────────────────────

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
    .prepare("SELECT id, createdById, status FROM groups WHERE id = ?")
    .get(groupId);

  if (!group) {
    return null;
  }

  if (group.createdById !== userId && !isGroupMember(groupId, userId)) {
    return false;
  }

  return group;
}

function isGroupDefunct(group) {
  return group && (group.status || "active") === "defunct";
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
    .prepare("SELECT id, amount, paidById FROM expenses WHERE groupId = ? AND settled = 0")
    .all(groupId);

  const splitRows = db
    .prepare("SELECT expenseId, userId, amount FROM expense_splits WHERE expenseId IN (SELECT id FROM expenses WHERE groupId = ? AND settled = 0)")
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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Step 1: initiate registration — create unverified user and send OTP
app.post("/api/auth/register/initiate", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }

    if (!jwtSecret) {
      return res.status(500).json({ message: "JWT secret is not configured." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = db.prepare("SELECT id, email_verified FROM users WHERE email = ?").get(normalizedEmail);

    if (existingUser && existingUser.email_verified) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const displayName = (name && name.trim()) || normalizedEmail.split("@")[0];

    let userId;
    if (existingUser && !existingUser.email_verified) {
      db.prepare("UPDATE users SET name = ?, password = ? WHERE id = ?").run(displayName, hashedPassword, existingUser.id);
      userId = existingUser.id;
    } else {
      const result = db.prepare("INSERT INTO users (name, email, password, role, email_verified) VALUES (?, ?, ?, 'user', 0)").run(displayName, normalizedEmail, hashedPassword);
      userId = result.lastInsertRowid;
    }

    const otp = createOtp(userId, 'register');
    await sendOtpEmail(normalizedEmail, otp, 'register');

    return res.status(200).json({ userId, message: "Verification code sent to your email." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to initiate registration." });
  }
});

// Step 2: verify OTP and activate account
app.post("/api/auth/register/verify", async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ message: "userId and otp are required." });
    }

    const result = validateOtp(Number(userId), String(otp), 'register');
    if (!result.valid) {
      return res.status(400).json({ message: result.reason });
    }

    db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(Number(userId));
    const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(Number(userId));

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || "user" },
      jwtSecret,
      { expiresIn: "7d" }
    );

    return res.status(201).json({ user, token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to verify registration." });
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
      .prepare("SELECT id, name, email, password, role, email_verified, mfa_enabled FROM users WHERE email = ?")
      .get(normalizedEmail);

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (!user.email_verified) {
      return res.status(403).json({ message: "Please verify your email before logging in.", needsVerification: true, userId: user.id });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.mfa_enabled) {
      const otp = createOtp(user.id, 'login');
      await sendOtpEmail(user.email, otp, 'login');
      return res.status(200).json({ mfaRequired: true, userId: user.id, message: "Verification code sent to your email." });
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

// Verify OTP for login 2FA
app.post("/api/auth/login/verify", async (req, res) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) {
      return res.status(400).json({ message: "userId and otp are required." });
    }
    const result = validateOtp(Number(userId), String(otp), 'login');
    if (!result.valid) {
      return res.status(400).json({ message: result.reason });
    }
    const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(Number(userId));
    if (!user) return res.status(404).json({ message: "User not found." });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || "user" },
      jwtSecret,
      { expiresIn: "7d" }
    );
    return res.status(200).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role || "user" }, token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to verify login code." });
  }
});

// Resend OTP (register or login)
app.post("/api/auth/resend-otp", async (req, res) => {
  try {
    const { userId, purpose } = req.body;
    if (!userId || !['register', 'login'].includes(purpose)) {
      return res.status(400).json({ message: "userId and valid purpose required." });
    }
    const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(Number(userId));
    if (!user) return res.status(404).json({ message: "User not found." });
    if (!canResendOtp(Number(userId), purpose)) {
      return res.status(429).json({ message: "Please wait 60 seconds before requesting a new code." });
    }
    const otp = createOtp(Number(userId), purpose);
    await sendOtpEmail(user.email, otp, purpose);
    return res.status(200).json({ message: "A new code has been sent to your email." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to resend code." });
  }
});

// Get MFA status
app.get("/api/auth/mfa", authenticateToken, (req, res) => {
  try {
    const user = db.prepare("SELECT mfa_enabled FROM users WHERE id = ?").get(req.user.id);
    return res.status(200).json({ mfaEnabled: Boolean(user?.mfa_enabled) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to get MFA status." });
  }
});

// Toggle MFA
app.patch("/api/auth/mfa", authenticateToken, (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: "'enabled' must be a boolean." });
    }
    db.prepare("UPDATE users SET mfa_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, req.user.id);
    return res.status(200).json({
      message: enabled ? "Two-factor authentication enabled." : "Two-factor authentication disabled.",
      mfaEnabled: enabled,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update 2FA setting." });
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
    const includeSettled = req.query.includeSettled === 'true'
    const users = db
      .prepare("SELECT id, name, email, role FROM users ORDER BY id DESC")
      .all();

    const groups = db
      .prepare(
        "SELECT g.id, g.name, g.createdById, u.name AS createdByName, (SELECT COUNT(*) FROM group_members gm WHERE gm.groupId = g.id) AS memberCount FROM groups g JOIN users u ON u.id = g.createdById ORDER BY g.id DESC"
      )
      .all();

    const expensesQuery = includeSettled
      ? "SELECT e.id, e.title, e.amount, e.groupId, g.name AS groupName, e.paidById, u.name AS paidByName FROM expenses e JOIN groups g ON g.id = e.groupId JOIN users u ON u.id = e.paidById ORDER BY e.id DESC"
      : "SELECT e.id, e.title, e.amount, e.groupId, g.name AS groupName, e.paidById, u.name AS paidByName FROM expenses e JOIN groups g ON g.id = e.groupId JOIN users u ON u.id = e.paidById WHERE e.settled = 0 ORDER BY e.id DESC";

    const expenses = db.prepare(expensesQuery).all();

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
      .prepare("SELECT id, createdById, status FROM groups WHERE id = ?")
      .get(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (isGroupDefunct(group)) {
      return res.status(400).json({ message: "Defunct groups cannot be modified." });
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

app.patch("/api/groups/:groupId", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const { name, status } = req.body;

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ message: "Invalid group id." });
    }

    const group = db
      .prepare("SELECT id, createdById, status FROM groups WHERE id = ?")
      .get(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (group.createdById !== req.user.id) {
      return res.status(403).json({ message: "Only the group creator can edit this group." });
    }

    const nextName = typeof name === "string" ? name.trim() : null;
    const nextStatus = typeof status === "string" ? status.trim().toLowerCase() : null;

    if (!nextName && !nextStatus) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    if (nextName) {
      db.prepare("UPDATE groups SET name = ? WHERE id = ?").run(nextName, groupId);
    }

    if (nextStatus) {
      if (!["active", "defunct"].includes(nextStatus)) {
        return res.status(400).json({ message: "Invalid group status." });
      }
      db.prepare("UPDATE groups SET status = ? WHERE id = ?").run(nextStatus, groupId);
    }

    const updatedGroup = db
      .prepare("SELECT id, name, createdById, status FROM groups WHERE id = ?")
      .get(groupId);

    return res.status(200).json({ message: "Group updated successfully.", group: updatedGroup });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update group." });
  }
});

app.delete("/api/groups/:groupId/members/:memberId", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const memberId = Number(req.params.memberId);

    if (!Number.isInteger(groupId) || !Number.isInteger(memberId)) {
      return res.status(400).json({ message: "Invalid id." });
    }

    const group = db
      .prepare("SELECT id, createdById, status FROM groups WHERE id = ?")
      .get(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (isGroupDefunct(group)) {
      return res.status(400).json({ message: "Defunct groups cannot be modified." });
    }

    if (group.createdById !== req.user.id) {
      return res.status(403).json({ message: "Only the group creator can remove members." });
    }

    if (group.createdById === memberId) {
      return res.status(400).json({ message: "You cannot remove the group creator." });
    }

    if (!isGroupMember(groupId, memberId)) {
      return res.status(404).json({ message: "Member not found in this group." });
    }

    db.prepare("DELETE FROM group_members WHERE groupId = ? AND userId = ?").run(groupId, memberId);

    return res.status(200).json({ message: "Member removed successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to remove member." });
  }
});

app.patch("/api/groups/:groupId", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const { name, status } = req.body;

    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ message: "Invalid group id." });
    }

    const group = db
      .prepare("SELECT id, createdById, status FROM groups WHERE id = ?")
      .get(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (group.createdById !== req.user.id) {
      return res.status(403).json({ message: "Only the group creator can edit this group." });
    }

    const nextName = typeof name === "string" ? name.trim() : null;
    const nextStatus = typeof status === "string" ? status.trim().toLowerCase() : null;

    if (!nextName && !nextStatus) {
      return res.status(400).json({ message: "Nothing to update." });
    }

    if (nextName) {
      db.prepare("UPDATE groups SET name = ? WHERE id = ?").run(nextName, groupId);
    }

    if (nextStatus) {
      if (!["active", "defunct"].includes(nextStatus)) {
        return res.status(400).json({ message: "Invalid group status." });
      }
      db.prepare("UPDATE groups SET status = ? WHERE id = ?").run(nextStatus, groupId);
    }

    const updatedGroup = db
      .prepare("SELECT id, name, createdById, status FROM groups WHERE id = ?")
      .get(groupId);

    return res.status(200).json({ message: "Group updated successfully.", group: updatedGroup });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to update group." });
  }
});

app.delete("/api/groups/:groupId/members/:memberId", authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const memberId = Number(req.params.memberId);

    if (!Number.isInteger(groupId) || !Number.isInteger(memberId)) {
      return res.status(400).json({ message: "Invalid id." });
    }

    const group = db
      .prepare("SELECT id, createdById, status FROM groups WHERE id = ?")
      .get(groupId);

    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (isGroupDefunct(group)) {
      return res.status(400).json({ message: "Defunct groups cannot be modified." });
    }

    if (group.createdById !== req.user.id) {
      return res.status(403).json({ message: "Only the group creator can remove members." });
    }

    if (group.createdById === memberId) {
      return res.status(400).json({ message: "You cannot remove the group creator." });
    }

    if (!isGroupMember(groupId, memberId)) {
      return res.status(404).json({ message: "Member not found in this group." });
    }

    db.prepare("DELETE FROM group_members WHERE groupId = ? AND userId = ?").run(groupId, memberId);

    return res.status(200).json({ message: "Member removed successfully." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to remove member." });
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
        "SELECT e.id, e.title, e.amount, e.paidById, u.name AS paidByName, e.groupId FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.groupId = ? AND e.settled = 0 ORDER BY e.id DESC"
      )
      .all(groupId);

    return res.status(200).json({
      group: {
        id: group.id,
        name: group.name,
        status: group.status || "active",
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
        "SELECT g.id, g.name, g.status, g.createdById, u.name AS createdByName, u.email AS createdByEmail, (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.groupId = g.id) AS memberCount FROM groups g JOIN group_members gm ON gm.groupId = g.id JOIN users u ON u.id = g.createdById WHERE gm.userId = ? GROUP BY g.id ORDER BY g.id DESC"
      )
      .all(req.user.id)
      .map((group) => ({
        id: group.id,
        name: group.name,
        status: group.status || "active",
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
    const { title, amount, paidById, photoUrl } = req.body;

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

    if (isGroupDefunct(group)) {
      return res.status(400).json({ message: "Cannot add expenses to defunct groups." });
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

    // Save photo if provided
    const savedPhotoUrl = photoUrl ? saveProofImage(photoUrl) : null;

    const createExpense = db.transaction(() => {
      const insertExpense = db.prepare(
        "INSERT INTO expenses (title, amount, paidById, groupId, photoUrl) VALUES (?, ?, ?, ?, ?)"
      );
      const insertSplit = db.prepare(
        "INSERT INTO expense_splits (expenseId, userId, amount) VALUES (?, ?, ?)"
      );
      const selectExpense = db.prepare(
        "SELECT e.id, e.title, e.amount, e.paidById, e.groupId, e.photoUrl, u.name AS paidByName, u.email AS paidByEmail FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.id = ?"
      );

      const result = insertExpense.run(title.trim(), Number(amount), payerId, groupId, savedPhotoUrl);
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
    const includeSettled = req.query.includeSettled === 'true';

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

    const expensesStmt = includeSettled
      ? db.prepare(
          "SELECT e.id, e.title, e.amount, e.paidById, e.photoUrl, u.name AS paidByName, u.email AS paidByEmail, e.groupId FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.groupId = ? ORDER BY e.id DESC"
        )
      : db.prepare(
          "SELECT e.id, e.title, e.amount, e.paidById, e.photoUrl, u.name AS paidByName, u.email AS paidByEmail, e.groupId FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.groupId = ? AND e.settled = 0 ORDER BY e.id DESC"
        );

    const expenses = expensesStmt.all(groupId)
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
    const { title, amount, paidById, photoUrl } = req.body;

    if (!Number.isInteger(expenseId)) {
      return res.status(400).json({ message: "Invalid expense id." });
    }

    const expense = db
      .prepare("SELECT id, title, amount, paidById, groupId, photoUrl FROM expenses WHERE id = ?")
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

    if (isGroupDefunct(group)) {
      return res.status(400).json({ message: "Cannot edit expenses in defunct groups." });
    }

    const groupMembers = getGroupMembers(expense.groupId);

    const nextTitle = title !== undefined ? title.trim() : expense.title;
    const nextAmount = amount !== undefined ? Number(amount) : Number(expense.amount);
    const nextPaidById = paidById !== undefined && paidById !== null ? Number(paidById) : expense.paidById;
    const nextPhotoUrl = photoUrl !== undefined ? saveProofImage(photoUrl) : expense.photoUrl;

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
        "UPDATE expenses SET title = ?, amount = ?, paidById = ?, photoUrl = ? WHERE id = ?"
      ).run(nextTitle, nextAmount, nextPaidById, nextPhotoUrl, expenseId);

      db.prepare("DELETE FROM expense_splits WHERE expenseId = ?").run(expenseId);
      const insertSplit = db.prepare(
        "INSERT INTO expense_splits (expenseId, userId, amount) VALUES (?, ?, ?)"
      );
      for (const split of normalizedSplits) {
        insertSplit.run(expenseId, split.userId, split.amount);
      }

      return db
        .prepare(
          "SELECT e.id, e.title, e.amount, e.paidById, e.groupId, e.photoUrl, u.name AS paidByName, u.email AS paidByEmail FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.id = ?"
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
      "SELECT e.id, e.title, e.amount, e.paidById, u.name AS paidByName FROM expenses e JOIN users u ON u.id = e.paidById WHERE e.groupId = ? AND e.settled = 0 ORDER BY e.id DESC"
    )
    .all(groupId);

  const allSplits = db
    .prepare(
      "SELECT es.expenseId, es.userId, es.amount FROM expense_splits es WHERE es.expenseId IN (SELECT id FROM expenses WHERE groupId = ? AND settled = 0)"
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

app.get("/api/user/settlement-history", authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    // Get all settlements involving this user
    const settlements = db
      .prepare(
        `SELECT 
          s.id, s.payerId, s.receiverId, s.amount, s.groupId, s.createdAt,
          g.name AS groupName,
          p.name AS payerName, p.email AS payerEmail,
          r.name AS receiverName, r.email AS receiverEmail
         FROM settlements s
         JOIN groups g ON g.id = s.groupId
         JOIN users p ON p.id = s.payerId
         JOIN users r ON r.id = s.receiverId
         WHERE s.payerId = ? OR s.receiverId = ?
         ORDER BY s.createdAt DESC`
      )
      .all(userId, userId)
      .map((settlement) => ({
        id: settlement.id,
        groupId: settlement.groupId,
        groupName: settlement.groupName,
        amount: settlement.amount,
        createdAt: settlement.createdAt,
        payer: {
          id: settlement.payerId,
          name: settlement.payerName,
          email: settlement.payerEmail,
        },
        receiver: {
          id: settlement.receiverId,
          name: settlement.receiverName,
          email: settlement.receiverEmail,
        },
        direction: settlement.payerId === userId ? "paid" : "received",
        otherPerson: settlement.payerId === userId ? settlement.receiverName : settlement.payerName,
      }));

    return res.status(200).json({ history: settlements });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Failed to load settlement history." });
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

    if (isGroupDefunct(group)) {
      return res.status(400).json({ message: "Defunct groups cannot accept expenses." });
    }

    if (isGroupDefunct(group)) {
      return res.status(400).json({ message: "Defunct groups cannot be settled." });
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
      "INSERT INTO settlements (payerId, receiverId, amount, groupId, createdAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
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

// Helper to save base64 proof images to uploads directory
function saveProofImage(dataUri) {
  if (!dataUri || typeof dataUri !== 'string') return null;
  if (!dataUri.startsWith('data:image')) return dataUri; // treat as external URL

  try {
    const matches = dataUri.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
    if (!matches) return null;
    const ext = matches[1].split('/')[1] || 'png';
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `proof_${Date.now()}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Failed to save proof image', err);
    return null;
  }
}

// Create a payment claim (payer claims they've paid and can attach proof)
app.post('/api/groups/:groupId/claim', authenticateToken, (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const { withUserId, proof } = req.body;
    const userId = req.user.id;

    if (!Number.isInteger(groupId)) return res.status(400).json({ message: 'Invalid group id.' });
    if (!withUserId || !Number.isInteger(Number(withUserId))) return res.status(400).json({ message: 'withUserId is required.' });

    const group = isGroupAccessible(groupId, userId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });
    if (group === false) return res.status(403).json({ message: 'You are not a member of this group.' });
    if (isGroupDefunct(group)) return res.status(400).json({ message: 'Defunct groups cannot be settled.' });
    if (!isGroupMember(groupId, Number(withUserId))) return res.status(400).json({ message: 'Target user is not a member of this group.' });

    // Calculate current balance; claim should only be created by payer (who owes)
    const settlements = calculateUserSettlementsForGroup(groupId, userId);
    const match = settlements.find((s) => s.otherUserId === Number(withUserId));
    if (!match || match.totalAmount < 0.01) return res.status(400).json({ message: 'No outstanding balance with this user.' });

    const payerId = match.direction === 'you_owe' ? userId : Number(withUserId);
    const receiverId = match.direction === 'you_owe' ? Number(withUserId) : userId;

    // Only the payer (the one who owes) is allowed to create a claim
    if (payerId !== userId) return res.status(403).json({ message: 'Only the payer can claim a payment.' });

    // Save proof if provided as data URI, otherwise accept as URL or null
    const proofUrl = proof ? saveProofImage(proof) : null;

    const info = db.prepare('INSERT INTO payment_claims (payerId, receiverId, amount, groupId, proofUrl, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(payerId, receiverId, match.totalAmount, groupId, proofUrl, 'pending');

    return res.status(201).json({ message: 'Payment claim created.', claimId: info.lastInsertRowid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to create payment claim.' });
  }
});

// List payment claims involving the current user
app.get('/api/user/claims', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const claims = db.prepare('SELECT pc.*, p.name as payerName, r.name as receiverName FROM payment_claims pc JOIN users p ON p.id = pc.payerId JOIN users r ON r.id = pc.receiverId WHERE pc.payerId = ? OR pc.receiverId = ? ORDER BY pc.claimedAt DESC')
      .all(userId, userId);
    return res.status(200).json({ claims });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to load claims.' });
  }
});

// Approve a payment claim (receiver approves -> insert settlement and mark claim approved)
app.post('/api/claims/:id/approve', authenticateToken, (req, res) => {
  try {
    const claimId = Number(req.params.id);
    const userId = req.user.id;
    if (!Number.isInteger(claimId)) return res.status(400).json({ message: 'Invalid claim id.' });

    const claim = db.prepare('SELECT * FROM payment_claims WHERE id = ?').get(claimId);
    if (!claim) return res.status(404).json({ message: 'Claim not found.' });
    if (claim.receiverId !== userId) return res.status(403).json({ message: 'Only the receiver can approve this claim.' });
    if (claim.status !== 'pending') return res.status(400).json({ message: 'Claim is not pending.' });

    // Use transaction to insert settlement and mark related expenses as settled
    const approveTransaction = db.transaction(() => {
      // Insert into settlements (this affects balances)
      db.prepare('INSERT INTO settlements (payerId, receiverId, amount, groupId, createdAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)')
        .run(claim.payerId, claim.receiverId, claim.amount, claim.groupId);

      // Mark all unsettled expenses between these two users in this group as settled
      db.prepare(
        "UPDATE expenses SET settled = 1 WHERE groupId = ? AND settled = 0 AND ("
          + "(paidById = ? AND id IN (SELECT expenseId FROM expense_splits WHERE userId = ?)) OR "
          + "(paidById = ? AND id IN (SELECT expenseId FROM expense_splits WHERE userId = ?))"
        + ")"
      ).run(claim.groupId, claim.payerId, claim.receiverId, claim.receiverId, claim.payerId);

      // Update claim status
      db.prepare('UPDATE payment_claims SET status = ?, approvedAt = CURRENT_TIMESTAMP, approvedBy = ? WHERE id = ?')
        .run('approved', userId, claimId);
    });

    approveTransaction();
    return res.status(200).json({ message: 'Claim approved and settlement recorded.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to approve claim.' });
  }
});

// Reject a payment claim (receiver rejects)
app.post('/api/claims/:id/reject', authenticateToken, (req, res) => {
  try {
    const claimId = Number(req.params.id);
    const userId = req.user.id;
    if (!Number.isInteger(claimId)) return res.status(400).json({ message: 'Invalid claim id.' });

    const claim = db.prepare('SELECT * FROM payment_claims WHERE id = ?').get(claimId);
    if (!claim) return res.status(404).json({ message: 'Claim not found.' });
    if (claim.receiverId !== userId) return res.status(403).json({ message: 'Only the receiver can reject this claim.' });
    if (claim.status !== 'pending') return res.status(400).json({ message: 'Claim is not pending.' });

    db.prepare('UPDATE payment_claims SET status = ? WHERE id = ?').run('rejected', claimId);
    return res.status(200).json({ message: 'Claim rejected.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to reject claim.' });
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