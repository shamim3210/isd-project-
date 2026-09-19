const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret_key";

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, role, name }
    next();
  } catch (err) {
    res.status(401).json({ error: "Please log in to continue" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have permission to do this" });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
