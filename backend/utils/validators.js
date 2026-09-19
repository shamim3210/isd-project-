const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

function isStrongEnoughPassword(pw) {
  return typeof pw === "string" && pw.length >= 6;
}

function validateRegisterInput({ name, email, password }) {
  const errors = [];
  if (!name || name.trim().length < 2) errors.push("Name must be at least 2 characters.");
  if (!isValidEmail(email)) errors.push("Please enter a valid email address.");
  if (!isStrongEnoughPassword(password)) errors.push("Password must be at least 6 characters.");
  return errors;
}

function validateBookInput({ title, author, isbn, category }) {
  const errors = [];
  if (!title || !title.trim()) errors.push("Title is required.");
  if (!author || !author.trim()) errors.push("Author is required.");
  if (!isbn || !isbn.trim()) errors.push("ISBN is required.");
  if (!category || !category.trim()) errors.push("Category is required.");
  return errors;
}

/**
 * Decides the ACTUAL role for a new registration server-side — never trust
 * the client's requested role directly. Returns { role } on success, or
 * { error } if librarian access should be denied. "admin" can never be
 * granted through this path at all.
 */
function resolveRegistrationRole(requestedRole, providedCode, configuredCode) {
  if (requestedRole !== "librarian") {
    return { role: "student" };
  }
  if (!configuredCode) {
    return { error: "Librarian sign-up is currently disabled on this server." };
  }
  if (!providedCode || providedCode.trim() !== configuredCode) {
    return { error: "Invalid librarian access code." };
  }
  return { role: "librarian" };
}

module.exports = { isValidEmail, isStrongEnoughPassword, validateRegisterInput, validateBookInput, resolveRegistrationRole };
