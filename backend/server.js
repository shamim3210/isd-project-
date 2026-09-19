require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const { errorHandler } = require("./middleware/errorHandler");

const bookRoutes = require("./routes/bookRoutes");
const userRoutes = require("./routes/userRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const reportRoutes = require("./routes/reportRoutes");
const authRoutes = require("./routes/authRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");
const roomRoutes = require("./routes/roomRoutes");
const suggestionRoutes = require("./routes/suggestionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const contactRoutes = require("./routes/contactRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" })); // raised for base64 book cover uploads

connectDB();

app.get("/", (req, res) => {
  res.json({ message: "📚 LibraryMS API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/users", userRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/suggestions", suggestionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/payments", paymentRoutes);

// 404 for unknown API routes
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// Centralized error handler — must be registered last
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
